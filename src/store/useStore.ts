import { create } from 'zustand';
import { mergeLayout, prunePositions, type XY } from '@/lib/layout';
import { parseDbml } from '@/lib/parseDbml';
import { type Diagnostic, emptySchema, type Schema } from '@/lib/schema';
import {
  ACTIVE_DOCUMENT_KEY,
  createStoredDocument,
  deleteStoredDocument,
  DOCUMENT_KEY_PREFIX,
  DOCUMENTS_KEY,
  duplicateStoredDocument,
  ensureDocumentLibrary,
  listDocuments,
  loadDocument,
  loadUi,
  renameStoredDocument,
  saveDocument,
  saveUi,
  setActiveDocument,
  type DocumentMeta,
  type UiState,
} from '@/lib/storage';

export const SAMPLE_DBML = `// Use DBML to define your database structure
// Docs: https://dbml.dbdiagram.io/docs

Table follows {
  following_user_id integer [not null]
  followed_user_id integer [not null]
  created_at timestamp
}

Table users {
  id integer [primary key]
  username varchar
  role varchar
  created_at timestamp
}

Table posts {
  id integer [primary key]
  title varchar
  body text [note: 'Content of the post']
  user_id integer [not null]
  status varchar
  created_at timestamp
}

Ref user_posts: posts.user_id ?> users.id // many-to-one

Ref: users.id <? follows.following_user_id

Ref: users.id <? follows.followed_user_id

Records users(id, username, role) {
  0, 'Alice', 'admin'
  1, 'Bob', 'moderator'
  2, 'Candice', 'moderator'
  3, 'David', 'member'
}

Records posts(id, title, user_id) {
  0, 'Welcome to the forum!', 0
  1, 'Guidelines', 1
  2, 'Hello all!', 3
}
`;

/** Origin controls cross-panel navigation: palette selections intentionally drive both sides. */
export type Selection = {
  tableId: string;
  column?: string;
  origin: 'canvas' | 'editor' | 'palette';
} | null;

export type DocumentCreateInput = { name?: string; dbml?: string; positions?: Record<string, XY> };

type State = {
  source: string;
  /** Last successful parse. The canvas renders this, never a half-typed document. */
  schema: Schema;
  /** False until the very first successful parse, so the canvas can show a real error state. */
  hasValidSchema: boolean;
  diagnostics: Diagnostic[];
  positions: Record<string, XY>;
  documents: DocumentMeta[];
  activeDocumentId: string;
  selection: Selection;
  hoveredColumn: { tableId: string; column: string } | null;
  ui: UiState;
  externallyChanged: boolean;

  setSource: (source: string) => void;
  /** Debounced parse; mutates schema/diagnostics/positions together so they never disagree. */
  commitParse: () => void;
  moveTable: (id: string, position: XY) => void;
  autoArrange: () => void;
  select: (selection: Selection) => void;
  hoverColumn: (value: { tableId: string; column: string } | null) => void;
  patchUi: (patch: Partial<UiState>) => void;
  createDocument: (input?: DocumentCreateInput) => string;
  switchDocument: (id: string) => void;
  renameDocument: (id: string, name: string) => void;
  duplicateDocument: (id: string) => void;
  deleteDocument: (id: string) => void;
  replaceActiveDocument: (dbml: string) => void;
  appendToActiveDocument: (dbml: string) => void;
  markExternalChange: () => void;
  syncExternalIndex: () => void;
  reloadFromStorage: () => void;
};

const DEFAULT_UI: UiState = { editorWidth: 460, editorCollapsed: false, theme: 'light' };
const library = ensureDocumentLibrary(SAMPLE_DBML);
const firstParse = parseDbml(library.snapshot.dbml);
const initialSchema = firstParse.ok ? firstParse.schema : emptySchema();

export const useStore = create<State>((set, get) => ({
  source: library.snapshot.dbml,
  schema: initialSchema,
  hasValidSchema: firstParse.ok,
  diagnostics: firstParse.diagnostics,
  positions: mergeLayout(initialSchema, library.snapshot.positions),
  documents: library.documents,
  activeDocumentId: library.activeId,
  selection: null,
  hoveredColumn: null,
  ui: loadUi() ?? DEFAULT_UI,
  externallyChanged: false,

  setSource: (source) => set({ source }),

  commitParse: () => {
    const { source, positions, selection, activeDocumentId } = get();
    const result = parseDbml(source);
    if (!result.ok) {
      // Invalid mid-typing is normal: keep the last good schema visible, but
      // persist the draft so reload cannot discard what the user just typed.
      const documents = saveDocument(activeDocumentId, { dbml: source, positions });
      set({ diagnostics: result.diagnostics, documents });
      return;
    }
    const next = mergeLayout(result.schema, prunePositions(result.schema, positions));
    const documents = saveDocument(activeDocumentId, { dbml: source, positions: next });
    set({
      schema: result.schema,
      hasValidSchema: true,
      diagnostics: [],
      positions: next,
      documents,
      selection:
        selection && result.schema.tables.some((table) => table.id === selection.tableId)
          ? selection
          : null,
    });
  },

  moveTable: (id, position) => {
    const { source, activeDocumentId } = get();
    const positions = { ...get().positions, [id]: position };
    const documents = saveDocument(activeDocumentId, { dbml: source, positions });
    set({ positions, documents });
  },

  autoArrange: () => {
    const { schema, source, activeDocumentId } = get();
    const positions = mergeLayout(schema, {});
    const documents = saveDocument(activeDocumentId, { dbml: source, positions });
    set({ positions, documents });
  },

  select: (selection) => set({ selection }),
  hoverColumn: (hoveredColumn) => set({ hoveredColumn }),

  patchUi: (patch) => {
    const ui = { ...get().ui, ...patch };
    set({ ui });
    saveUi(ui);
  },

  createDocument: (input = {}) => {
    const source = input.dbml ?? SAMPLE_DBML;
    const parsed = parseDbml(source);
    const schema = parsed.ok ? parsed.schema : emptySchema();
    const positions = parsed.ok
      ? mergeLayout(schema, input.positions ?? {})
      : input.positions ?? {};
    const snapshot = { dbml: source, positions };
    const created = createStoredDocument(input.name ?? 'Untitled Diagram', snapshot);
    set({
      source,
      schema,
      hasValidSchema: parsed.ok,
      diagnostics: parsed.diagnostics,
      positions,
      documents: created.documents,
      activeDocumentId: created.meta.id,
      selection: null,
      hoveredColumn: null,
      externallyChanged: false,
    });
    return created.meta.id;
  },

  switchDocument: (id) => {
    if (id === get().activeDocumentId) return;
    const snapshot = loadDocument(id);
    if (!snapshot) return;
    const parsed = parseDbml(snapshot.dbml);
    const schema = parsed.ok ? parsed.schema : emptySchema();
    setActiveDocument(id);
    set({
      source: snapshot.dbml,
      schema,
      hasValidSchema: parsed.ok,
      diagnostics: parsed.diagnostics,
      positions: mergeLayout(schema, snapshot.positions),
      documents: listDocuments(),
      activeDocumentId: id,
      selection: null,
      hoveredColumn: null,
      externallyChanged: false,
    });
  },

  renameDocument: (id, name) => set({ documents: renameStoredDocument(id, name) }),

  duplicateDocument: (id) => {
    const duplicated = duplicateStoredDocument(id);
    if (!duplicated) return;
    const parsed = parseDbml(duplicated.snapshot.dbml);
    const schema = parsed.ok ? parsed.schema : emptySchema();
    set({
      source: duplicated.snapshot.dbml,
      schema,
      hasValidSchema: parsed.ok,
      diagnostics: parsed.diagnostics,
      positions: mergeLayout(schema, duplicated.snapshot.positions),
      documents: duplicated.documents,
      activeDocumentId: duplicated.meta.id,
      selection: null,
      hoveredColumn: null,
      externallyChanged: false,
    });
  },

  deleteDocument: (id) => {
    const wasActive = id === get().activeDocumentId;
    const deleted = deleteStoredDocument(id, SAMPLE_DBML);
    if (!wasActive) {
      set({ documents: deleted.documents });
      return;
    }
    const parsed = parseDbml(deleted.snapshot.dbml);
    const schema = parsed.ok ? parsed.schema : emptySchema();
    set({
      source: deleted.snapshot.dbml,
      schema,
      hasValidSchema: parsed.ok,
      diagnostics: parsed.diagnostics,
      positions: mergeLayout(schema, deleted.snapshot.positions),
      documents: deleted.documents,
      activeDocumentId: deleted.activeId,
      selection: null,
      hoveredColumn: null,
      externallyChanged: false,
    });
  },

  replaceActiveDocument: (source) => {
    set({ source });
    get().commitParse();
  },

  appendToActiveDocument: (dbml) => {
    const source = `${get().source.trimEnd()}\n\n${dbml.trim()}\n`;
    set({ source });
    get().commitParse();
  },

  markExternalChange: () => set({ externallyChanged: true }),
  syncExternalIndex: () => set({ documents: listDocuments() }),

  reloadFromStorage: () => {
    const { activeDocumentId, schema: previousSchema, hasValidSchema } = get();
    const snapshot = loadDocument(activeDocumentId);
    if (!snapshot) return;
    const result = parseDbml(snapshot.dbml);
    const schema = result.ok ? result.schema : previousSchema;
    set({
      source: snapshot.dbml,
      schema,
      hasValidSchema: result.ok || hasValidSchema,
      diagnostics: result.diagnostics,
      positions: mergeLayout(schema, snapshot.positions),
      documents: listDocuments(),
      externallyChanged: false,
      selection: null,
      hoveredColumn: null,
    });
  },
}));

/** Storage keys relevant to the currently active document's conflict banner. */
export const isActiveDocumentStorageKey = (key: string | null): boolean =>
  key === null ||
  key === ACTIVE_DOCUMENT_KEY ||
  key === DOCUMENTS_KEY ||
  key === `${DOCUMENT_KEY_PREFIX}${useStore.getState().activeDocumentId}`;
