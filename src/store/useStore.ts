import { create } from 'zustand';
import { mergeLayout, prunePositions, type XY } from '@/lib/layout';
import { parseInWorker } from '@/lib/schemaWorkerClient';
import { type Diagnostic, type ParseResult, emptySchema, type Schema } from '@/lib/schema';
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
  /** True while the current source is being parsed by the schema worker. */
  parsePending: boolean;
  /** Non-syntax worker failures, such as an unavailable worker or crashed worker. */
  parseFailure: string | null;
  positions: Record<string, XY>;
  documents: DocumentMeta[];
  activeDocumentId: string;
  selection: Selection;
  hoveredColumn: { tableId: string; column: string } | null;
  ui: UiState;
  externallyChanged: boolean;

  setSource: (source: string) => void;
  /** Debounced parse; mutates schema/diagnostics/positions together so they never disagree. */
  commitParse: () => Promise<void>;
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

const DEFAULT_UI: UiState = {
  editorWidth: 460,
  editorCollapsed: false,
  theme: typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
};
const library = ensureDocumentLibrary(SAMPLE_DBML);
const revisions = new Map<string, number>();
const lastValidSchemas = new Map<string, Schema>();

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'The schema worker failed.';

export const useStore = create<State>((set, get) => {
  const isCurrentRequest = (id: string, source: string, revision: number): boolean =>
    get().activeDocumentId === id && get().source === source && revisions.get(id) === revision;

  const beginParse = (id: string, source: string): Promise<void> => {
    const revision = (revisions.get(id) ?? 0) + 1;
    revisions.set(id, revision);
    set({ parsePending: true, parseFailure: null });

    let operation: Promise<ParseResult>;
    try {
      operation = parseInWorker(source);
    } catch (error) {
      if (isCurrentRequest(id, source, revision)) {
        set({ parsePending: false, parseFailure: errorMessage(error) });
      }
      return Promise.resolve();
    }

    return operation
      .then((result) => {
        if (!isCurrentRequest(id, source, revision)) return;
        if (!result.ok) {
          // Invalid mid-typing is normal: preserve the last valid schema and positions.
          set({ diagnostics: result.diagnostics, parsePending: false, parseFailure: null });
          return;
        }

        const { positions, selection } = get();
        const nextPositions = mergeLayout(result.schema, prunePositions(result.schema, positions));
        const documents = saveDocument(id, { dbml: source, positions: nextPositions });
        lastValidSchemas.set(id, result.schema);
        set({
          schema: result.schema,
          hasValidSchema: true,
          diagnostics: [],
          parsePending: false,
          parseFailure: null,
          positions: nextPositions,
          documents,
          selection:
            selection && result.schema.tables.some((table) => table.id === selection.tableId)
              ? selection
              : null,
        });
      })
      .catch((error: unknown) => {
        if (isCurrentRequest(id, source, revision)) {
          set({ parsePending: false, parseFailure: errorMessage(error) });
        }
      });
  };

  const flushDraft = (): void => {
    const { activeDocumentId, source, positions } = get();
    set({ documents: saveDocument(activeDocumentId, { dbml: source, positions }) });
  };

  const activate = (
    id: string,
    source: string,
    storedPositions: Record<string, XY>,
    documents: DocumentMeta[],
  ): void => {
    const cachedSchema = lastValidSchemas.get(id);
    const schema = cachedSchema ?? emptySchema();
    set({
      source,
      schema,
      hasValidSchema: cachedSchema !== undefined,
      diagnostics: [],
      parsePending: false,
      parseFailure: null,
      positions: mergeLayout(schema, storedPositions),
      documents,
      activeDocumentId: id,
      selection: null,
      hoveredColumn: null,
      externallyChanged: false,
    });
    void beginParse(id, source);
  };

  return {
    source: library.snapshot.dbml,
    schema: emptySchema(),
    hasValidSchema: false,
    diagnostics: [],
    parsePending: false,
    parseFailure: null,
    positions: library.snapshot.positions,
    documents: library.documents,
    activeDocumentId: library.activeId,
    selection: null,
    hoveredColumn: null,
    ui: loadUi() ?? DEFAULT_UI,
    externallyChanged: false,

    setSource: (source) => {
      if (source === get().source) return;
      const id = get().activeDocumentId;
      revisions.set(id, (revisions.get(id) ?? 0) + 1);
      set({ source, parsePending: true, parseFailure: null });
    },

    commitParse: () => {
      const { source, positions, activeDocumentId } = get();
      const documents = saveDocument(activeDocumentId, { dbml: source, positions });
      set({ documents });
      return beginParse(activeDocumentId, source);
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
      flushDraft();
      const source = input.dbml ?? SAMPLE_DBML;
      const positions = input.positions ?? {};
      const created = createStoredDocument(input.name ?? 'Untitled Diagram', {
        dbml: source,
        positions,
      });
      activate(created.meta.id, source, positions, created.documents);
      return created.meta.id;
    },

    switchDocument: (id) => {
      if (id === get().activeDocumentId) return;
      flushDraft();
      const snapshot = loadDocument(id);
      if (!snapshot) return;
      setActiveDocument(id);
      activate(id, snapshot.dbml, snapshot.positions, listDocuments());
    },

    renameDocument: (id, name) => set({ documents: renameStoredDocument(id, name) }),

    duplicateDocument: (id) => {
      flushDraft();
      const duplicated = duplicateStoredDocument(id);
      if (!duplicated) return;
      activate(
        duplicated.meta.id,
        duplicated.snapshot.dbml,
        duplicated.snapshot.positions,
        duplicated.documents,
      );
    },

    deleteDocument: (id) => {
      flushDraft();
      const wasActive = id === get().activeDocumentId;
      const deleted = deleteStoredDocument(id, SAMPLE_DBML);
      if (!wasActive) {
        set({ documents: deleted.documents });
        return;
      }
      revisions.delete(id);
      lastValidSchemas.delete(id);
      activate(deleted.activeId, deleted.snapshot.dbml, deleted.snapshot.positions, deleted.documents);
    },

    replaceActiveDocument: (source) => {
      set({ source });
      void get().commitParse();
    },

    appendToActiveDocument: (dbml) => {
      const source = `${get().source.trimEnd()}\n\n${dbml.trim()}\n`;
      set({ source });
      void get().commitParse();
    },

    markExternalChange: () => set({ externallyChanged: true }),
    syncExternalIndex: () => set({ documents: listDocuments() }),

    reloadFromStorage: () => {
      const { activeDocumentId } = get();
      const snapshot = loadDocument(activeDocumentId);
      if (!snapshot) return;
      lastValidSchemas.delete(activeDocumentId);
      activate(activeDocumentId, snapshot.dbml, snapshot.positions, listDocuments());
    },
  };
});

// Restore the source synchronously above, then move the initial parse off the
// main thread without making a stale schema look valid during startup.
void useStore.getState().commitParse();

/** Storage keys relevant to the currently active document's conflict banner. */
export const isActiveDocumentStorageKey = (key: string | null): boolean =>
  key === null ||
  key === ACTIVE_DOCUMENT_KEY ||
  key === DOCUMENTS_KEY ||
  key === `${DOCUMENT_KEY_PREFIX}${useStore.getState().activeDocumentId}`;
