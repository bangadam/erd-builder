import type { XY } from './layout';

export type DocumentSnapshot = { dbml: string; positions: Record<string, XY> };
export type DocumentMeta = { id: string; name: string; updatedAt: number };
export type UiState = { editorWidth: number; editorCollapsed: boolean; theme: 'light' | 'dark' };

export const DOCUMENTS_KEY = 'erd:docs';
export const ACTIVE_DOCUMENT_KEY = 'erd:active';
export const DOCUMENT_KEY_PREFIX = 'erd:doc:';
const LEGACY_DOCUMENT_KEY = 'erd:doc';
const UI_KEY = 'erd:ui';

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    // Corrupt JSON, or storage unavailable in private mode: never block startup.
    return fallback;
  }
};

const ordered = (documents: DocumentMeta[]): DocumentMeta[] =>
  [...documents].sort((a, b) => b.updatedAt - a.updatedAt);

/**
 * `Date.now()` has millisecond granularity, so several documents created in one
 * tick would tie and the menu order would flip between renders. Stamps are
 * forced strictly ahead of the newest known value to keep ordering stable.
 */
const nextTimestamp = (documents: DocumentMeta[]): number => {
  const newest = documents.reduce((max, document) => Math.max(max, document.updatedAt), 0);
  return Math.max(Date.now(), newest + 1);
};

const writeIndex = (documents: DocumentMeta[]): DocumentMeta[] => {
  const next = ordered(documents);
  localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(next));
  return next;
};

export const listDocuments = (): DocumentMeta[] => ordered(read<DocumentMeta[]>(DOCUMENTS_KEY, []));
export const loadDocument = (id: string): DocumentSnapshot | null =>
  read<DocumentSnapshot | null>(`${DOCUMENT_KEY_PREFIX}${id}`, null);
export const loadActiveDocumentId = (): string | null => localStorage.getItem(ACTIVE_DOCUMENT_KEY);
export const loadUi = (): UiState | null => read<UiState | null>(UI_KEY, null);
export const saveUi = (ui: UiState): void => localStorage.setItem(UI_KEY, JSON.stringify(ui));

/**
 * Initializes the document library and performs the one-time migration from
 * the v1 singleton key. The old draft is preserved byte-for-byte.
 */
export const ensureDocumentLibrary = (
  fallbackSource: string,
): { documents: DocumentMeta[]; activeId: string; snapshot: DocumentSnapshot } => {
  const existing = listDocuments();
  if (existing.length > 0) {
    const requested = loadActiveDocumentId();
    const active = existing.find((d) => d.id === requested) ?? existing[0];
    const snapshot = loadDocument(active.id) ?? { dbml: fallbackSource, positions: {} };
    localStorage.setItem(ACTIVE_DOCUMENT_KEY, active.id);
    localStorage.setItem(`${DOCUMENT_KEY_PREFIX}${active.id}`, JSON.stringify(snapshot));
    return { documents: existing, activeId: active.id, snapshot };
  }

  const id = crypto.randomUUID();
  const meta = { id, name: 'Untitled Diagram', updatedAt: Date.now() };
  const legacy = read<DocumentSnapshot | null>(LEGACY_DOCUMENT_KEY, null);
  const snapshot = legacy ?? { dbml: fallbackSource, positions: {} };
  localStorage.setItem(`${DOCUMENT_KEY_PREFIX}${id}`, JSON.stringify(snapshot));
  localStorage.setItem(ACTIVE_DOCUMENT_KEY, id);
  localStorage.removeItem(LEGACY_DOCUMENT_KEY);
  return { documents: writeIndex([meta]), activeId: id, snapshot };
};

/** Writes content and touches the metadata timestamp used to order the menu. */
export const saveDocument = (id: string, snapshot: DocumentSnapshot): DocumentMeta[] => {
  localStorage.setItem(`${DOCUMENT_KEY_PREFIX}${id}`, JSON.stringify(snapshot));
  const now = nextTimestamp(listDocuments());
  return writeIndex(
    listDocuments().map((document) =>
      document.id === id ? { ...document, updatedAt: now } : document,
    ),
  );
};

export const setActiveDocument = (id: string): void => {
  localStorage.setItem(ACTIVE_DOCUMENT_KEY, id);
};

export const createStoredDocument = (
  name: string,
  snapshot: DocumentSnapshot,
): { documents: DocumentMeta[]; meta: DocumentMeta } => {
  const documents = listDocuments();
  const meta = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Untitled Diagram',
    updatedAt: nextTimestamp(documents),
  };
  localStorage.setItem(`${DOCUMENT_KEY_PREFIX}${meta.id}`, JSON.stringify(snapshot));
  localStorage.setItem(ACTIVE_DOCUMENT_KEY, meta.id);
  return { documents: writeIndex([...documents, meta]), meta };
};

export const renameStoredDocument = (id: string, name: string): DocumentMeta[] => {
  const clean = name.trim();
  if (!clean) return listDocuments();
  const documents = listDocuments();
  const updatedAt = nextTimestamp(documents);
  return writeIndex(
    documents.map((document) =>
      document.id === id ? { ...document, name: clean, updatedAt } : document,
    ),
  );
};

export const duplicateStoredDocument = (
  id: string,
): { documents: DocumentMeta[]; meta: DocumentMeta; snapshot: DocumentSnapshot } | null => {
  const original = listDocuments().find((document) => document.id === id);
  const snapshot = loadDocument(id);
  if (!original || !snapshot) return null;
  const created = createStoredDocument(`${original.name} copy`, snapshot);
  return { ...created, snapshot };
};

/**
 * Deletes one document. Deleting the final document immediately creates a new
 * Untitled Diagram, so the application never has an impossible no-document state.
 */
export const deleteStoredDocument = (
  id: string,
  fallbackSource: string,
): { documents: DocumentMeta[]; activeId: string; snapshot: DocumentSnapshot } => {
  const current = listDocuments();
  const remaining = current.filter((document) => document.id !== id);
  localStorage.removeItem(`${DOCUMENT_KEY_PREFIX}${id}`);
  if (remaining.length === 0) {
    // Clear the old index before createStoredDocument reads it, or the deleted
    // metadata would be re-added alongside the replacement.
    writeIndex([]);
    const snapshot = { dbml: fallbackSource, positions: {} };
    const created = createStoredDocument('Untitled Diagram', snapshot);
    return { documents: created.documents, activeId: created.meta.id, snapshot };
  }

  const documents = writeIndex(remaining);
  const requested = loadActiveDocumentId();
  const next = documents.find((document) => document.id === requested) ?? documents[0];
  const snapshot = loadDocument(next.id) ?? { dbml: fallbackSource, positions: {} };
  localStorage.setItem(ACTIVE_DOCUMENT_KEY, next.id);
  return { documents, activeId: next.id, snapshot };
};

/** Exposes key-level storage changes so the store can distinguish index updates from draft conflicts. */
export const onExternalStorageChange = (
  handler: (key: string | null) => void,
): (() => void) => {
  const listener = (event: StorageEvent) => handler(event.key);
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
};
