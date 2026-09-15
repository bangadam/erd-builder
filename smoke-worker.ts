import assert from 'node:assert/strict';
import { parseDbml } from './src/lib/parseDbml';
import type { SchemaWorkerRequest, SchemaWorkerResponse } from './src/lib/schemaWorkerProtocol';

const contents = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => contents.get(key) ?? null,
  setItem: (key: string, value: string) => contents.set(key, value),
  removeItem: (key: string) => contents.delete(key),
} });

// Control response order at the worker boundary, while exercising the real
// parser and store. Late results must not replace a newer document or draft.
class ControlledWorker {
  static instance: ControlledWorker;
  onmessage: ((event: { data: SchemaWorkerResponse }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  requests: SchemaWorkerRequest[] = [];
  constructor() { ControlledWorker.instance = this; }
  postMessage(request: SchemaWorkerRequest) { this.requests.push(request); }
  terminate() {}
  complete(request: SchemaWorkerRequest) {
    assert.equal(request.type, 'parse');
    if (request.type === 'parse') this.onmessage?.({ data: { id: request.id, type: 'parse', result: parseDbml(request.source) } });
  }
}
Object.defineProperty(globalThis, 'Worker', { configurable: true, value: ControlledWorker });

// Dynamic import intentionally tests module initialization after browser APIs
// are installed; static import would run the eager initial parse too soon.
const { useStore } = await import('./src/store/useStore');
const worker = ControlledWorker.instance;
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
worker.complete(worker.requests.shift()!);
await settle();
assert.equal(useStore.getState().schema.tables.length, 3);

const firstId = useStore.getState().activeDocumentId;
useStore.getState().setSource('Table older {\n id int\n}\n');
const older = useStore.getState().commitParse();
const oldRequest = worker.requests.shift()!;
useStore.getState().setSource('Table latest {\n id int\n}\n');
const latest = useStore.getState().commitParse();
worker.complete(worker.requests.shift()!);
await latest;
worker.complete(oldRequest);
await older;
assert.equal(useStore.getState().schema.tables[0].name, 'latest', 'late responses cannot overwrite newer schema');

useStore.getState().moveTable('latest', { x: 150, y: 250 });
useStore.getState().setSource('Table latest {\n id int\n');
const invalid = useStore.getState().commitParse();
worker.complete(worker.requests.shift()!);
await invalid;
assert.equal(useStore.getState().schema.tables[0].name, 'latest', 'invalid typing keeps last-valid diagram');
assert.deepEqual(useStore.getState().positions.latest, { x: 150, y: 250 });
assert.ok(useStore.getState().diagnostics.length > 0);

useStore.getState().setSource('Table unsaved {\n id int\n}\n');
const secondId = useStore.getState().createDocument({ name: 'Second', dbml: 'Table second {\n id int\n}\n' });
const secondRequest = worker.requests.shift()!;
assert.ok(contents.get(`erd:doc:${firstId}`)?.includes('unsaved'), 'switching flushes text before debounce fires');
useStore.getState().switchDocument(firstId);
const firstRequest = worker.requests.shift()!;
worker.complete(secondRequest);
await settle();
assert.equal(useStore.getState().activeDocumentId, firstId);
assert.notEqual(useStore.getState().schema.tables[0]?.name, 'second', 'other document response cannot leak across active document');
worker.complete(firstRequest);
await settle();
assert.equal(useStore.getState().schema.tables[0].name, 'unsaved');

useStore.getState().switchDocument(secondId);
const deletedRequest = worker.requests.shift()!;
useStore.getState().deleteDocument(secondId);
worker.complete(deletedRequest);
await settle();
assert.equal(contents.has(`erd:doc:${secondId}`), false, 'late parse does not resurrect deleted document');
worker.complete(worker.requests.shift()!);
await settle();

useStore.getState().setSource('Table failed {\n id int\n}\n');
const failure = useStore.getState().commitParse();
worker.onerror?.({ message: 'Worker could not load' });
await failure;
assert.equal(useStore.getState().parsePending, false);
assert.equal(useStore.getState().parseFailure, 'Worker could not load');
assert.equal(useStore.getState().schema.tables[0].name, 'unsaved', 'engine failure preserves last-valid schema');
const retry = useStore.getState().commitParse();
ControlledWorker.instance.complete(ControlledWorker.instance.requests.shift()!);
await retry;
assert.equal(useStore.getState().schema.tables[0].name, 'failed');
assert.equal(useStore.getState().parseFailure, null);
console.log('ALL PASS — worker ordering, document isolation, draft preservation, deletion, failure and retry');
