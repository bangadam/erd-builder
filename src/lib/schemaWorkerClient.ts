import type { SqlDialect } from './sqlOptions';
import type { SqlImportResult } from './importSql';
import type { ParseResult } from './schema';
import type {
  SchemaExportFormat,
  SchemaWorkerRequest,
  SchemaWorkerRequestPayload,
  SchemaWorkerResponse,
} from './schemaWorkerProtocol';

/**
 * Main-thread boundary for the DBML vendor runtime. Keep every import here
 * type-only: Vite should be able to put all parser code in the worker chunk.
 */
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
};

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();


const errorFromPayload = (payload: { message: string; name?: string; stack?: string }): Error => {
  const error = new Error(payload.message);
  if (payload.name) error.name = payload.name;
  if (payload.stack) error.stack = payload.stack;
  return error;
};

const rejectWorker = (reason: unknown): void => {
  for (const request of pending.values()) request.reject(reason);
  pending.clear();
  worker?.terminate();
  worker = null;
};

const ensureWorker = (): Worker => {
  if (worker) return worker;
  if (typeof Worker === 'undefined') throw new Error('The schema worker is unavailable in this environment.');

  const instance = new Worker(new URL('./schema.worker.ts', import.meta.url), { type: 'module' });
  instance.onmessage = (event: MessageEvent<SchemaWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.type === 'error') request.reject(errorFromPayload(response.error));
    else request.resolve(response.result);
  };
  instance.onerror = (event) => {
    rejectWorker(new Error(event.message || 'The schema worker failed.'));
  };
  instance.onmessageerror = () => {
    rejectWorker(new Error('The schema worker returned an unreadable response.'));
  };
  worker = instance;
  return instance;
};

const request = <T>(message: SchemaWorkerRequestPayload): Promise<T> => {
  const id = nextRequestId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    try {
      ensureWorker().postMessage({ ...message, id } satisfies SchemaWorkerRequest);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
};

export const parseInWorker = (source: string): Promise<ParseResult> =>
  request<ParseResult>({ type: 'parse', source });

export const importInWorker = (sql: string, dialect: SqlDialect): Promise<SqlImportResult> =>
  request<SqlImportResult>({ type: 'import', sql, dialect });

export const exportInWorker = (
  source: string,
  format: SchemaExportFormat,
): Promise<string> => request<string>({ type: 'export', source, format });
