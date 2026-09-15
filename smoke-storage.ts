// A minimal storage shim keeps this suite dependency-free; the module under
// test only touches `localStorage` and `window` from inside its functions, so
// installing the globals before the first call is sufficient.
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

Object.assign(globalThis, {
  localStorage: new MemoryStorage(),
  window: { addEventListener: () => {}, removeEventListener: () => {} },
});

import {
  createStoredDocument,
  deleteStoredDocument,
  duplicateStoredDocument,
  ensureDocumentLibrary,
  listDocuments,
  loadActiveDocumentId,
  loadDocument,
  renameStoredDocument,
  saveDocument,
  setActiveDocument,
} from './src/lib/storage';

let failed = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  if (!cond) {
    failed++;
    console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail));
  } else console.log('ok  ', label);
};

const LEGACY = { dbml: 'Table a {\n  id int\n}\n', positions: { a: { x: 1, y: 2 } } };

// --- migration from the v1 singleton key ---
localStorage.setItem('erd:doc', JSON.stringify(LEGACY));
const library = ensureDocumentLibrary('fallback');
check('migration yields exactly one document', library.documents.length === 1, library.documents);
check('migration preserves the legacy source', library.snapshot.dbml === LEGACY.dbml);
check('migration preserves dragged positions', library.snapshot.positions.a?.x === 1);
check('migration clears the singleton key', localStorage.getItem('erd:doc') === null);
check('migration records the active id', loadActiveDocumentId() === library.activeId);

// Re-running must be idempotent, or a reload would clone the document each time.
const again = ensureDocumentLibrary('fallback');
check('re-init keeps the same document', again.activeId === library.activeId);
check('re-init does not add documents', listDocuments().length === 1);

const first = library.activeId;

// --- rename ---
check('rename trims surrounding space', renameStoredDocument(first, '  Accounts  ')[0].name === 'Accounts');
check('rename keeps the storage id stable', loadDocument(first)?.dbml === LEGACY.dbml);
check('blank rename is refused', renameStoredDocument(first, '   ')[0].name === 'Accounts');

// --- save ---
saveDocument(first, { dbml: 'Table b {\n  id int\n}\n', positions: {} });
check('save replaces document content', loadDocument(first)?.dbml.includes('Table b') === true);

// --- create ---
const orders = createStoredDocument('Orders', { dbml: 'Table orders {\n  id int\n}\n', positions: {} });
check('create switches the active document', loadActiveDocumentId() === orders.meta.id);
check('index is ordered newest first', orders.documents[0].id === orders.meta.id, orders.documents);
check('create falls back to Untitled for a blank name', createStoredDocument('  ', { dbml: '', positions: {} }).meta.name === 'Untitled Diagram');

// --- duplicate ---
const copy = duplicateStoredDocument(orders.meta.id);
check('duplicate names the copy', copy?.meta.name === 'Orders copy', copy?.meta);
check('duplicate carries the source across', copy?.snapshot.dbml.includes('Table orders') === true);
check('duplicate gets its own id', copy?.meta.id !== orders.meta.id);
check('duplicating a missing document returns null', duplicateStoredDocument('does-not-exist') === null);

// --- delete ---
setActiveDocument(copy?.meta.id ?? '');
const afterDelete = deleteStoredDocument(first, 'fallback');
check('deleting an inactive document keeps the active one', afterDelete.activeId === copy?.meta.id);
check('deleted content is gone', loadDocument(first) === null);

for (const document of listDocuments()) {
  setActiveDocument(document.id);
  deleteStoredDocument(document.id, 'fallback schema');
}
const survivors = listDocuments();
check('deleting the last document leaves exactly one', survivors.length === 1, survivors);
check('the replacement is Untitled Diagram', survivors[0].name === 'Untitled Diagram');
check('the replacement uses the fallback source', loadDocument(survivors[0].id)?.dbml === 'fallback schema');
check('the replacement is active', loadActiveDocumentId() === survivors[0].id);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
