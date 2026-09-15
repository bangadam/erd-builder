import { create } from 'zustand';
import { mergeLayout, prunePositions, type XY } from '@/lib/layout';
import { parseDbml } from '@/lib/parseDbml';
import { type Diagnostic, emptySchema, type Schema } from '@/lib/schema';
import { loadDoc, loadUi, saveDoc, saveUi, type UiState } from '@/lib/storage';

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

/** What the canvas highlights, and where it came from — the origin decides who scrolls. */
export type Selection = { tableId: string; origin: 'canvas' | 'editor' } | null;

type State = {
  source: string;
  /** Last successful parse. The canvas renders this, never a half-typed document. */
  schema: Schema;
  /** False until the very first successful parse, so the canvas can show a real error state. */
  hasValidSchema: boolean;
  diagnostics: Diagnostic[];
  positions: Record<string, XY>;
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
  markExternalChange: () => void;
  reloadFromStorage: () => void;
};

const DEFAULT_UI: UiState = { editorWidth: 460, editorCollapsed: false, theme: 'light' };

const restored = loadDoc();
const initialSource = restored?.dbml ?? SAMPLE_DBML;
const firstParse = parseDbml(initialSource);
const initialSchema = firstParse.ok ? firstParse.schema : emptySchema();

export const useStore = create<State>((set, get) => ({
  source: initialSource,
  schema: initialSchema,
  hasValidSchema: firstParse.ok,
  diagnostics: firstParse.diagnostics,
  positions: mergeLayout(initialSchema, restored?.positions ?? {}),
  selection: null,
  hoveredColumn: null,
  ui: loadUi() ?? DEFAULT_UI,
  externallyChanged: false,

  setSource: (source) => set({ source }),

  commitParse: () => {
    const { source, positions, selection } = get();
    const result = parseDbml(source);
    if (!result.ok) {
      // Invalid mid-typing is the normal case: keep the last good schema on the
      // canvas and surface diagnostics only. Persist source alone so the draft
      // survives a reload, but leave the last-good positions untouched.
      set({ diagnostics: result.diagnostics });
      saveDoc({ dbml: source, positions });
      return;
    }
    // Survivors keep their coordinates; tables that first appear here get placed.
    const next = mergeLayout(result.schema, prunePositions(result.schema, positions));
    set({
      schema: result.schema,
      hasValidSchema: true,
      diagnostics: [],
      positions: next,
      // A rename drops the old id, so a stale selection would highlight nothing.
      selection: selection && result.schema.tables.some((t) => t.id === selection.tableId) ? selection : null,
    });
    saveDoc({ dbml: source, positions: next });
  },

  moveTable: (id, position) => {
    const positions = { ...get().positions, [id]: position };
    set({ positions });
    saveDoc({ dbml: get().source, positions });
  },

  autoArrange: () => {
    const { schema, source } = get();
    const positions = mergeLayout(schema, {});
    set({ positions });
    saveDoc({ dbml: source, positions });
  },

  select: (selection) => set({ selection }),
  hoverColumn: (hoveredColumn) => set({ hoveredColumn }),

  patchUi: (patch) => {
    const ui = { ...get().ui, ...patch };
    set({ ui });
    saveUi(ui);
  },

  markExternalChange: () => set({ externallyChanged: true }),

  reloadFromStorage: () => {
    const doc = loadDoc();
    if (!doc) return;
    const result = parseDbml(doc.dbml);
    const schema = result.ok ? result.schema : get().schema;
    set({
      source: doc.dbml,
      schema,
      hasValidSchema: result.ok || get().hasValidSchema,
      diagnostics: result.diagnostics,
      positions: mergeLayout(schema, doc.positions ?? {}),
      externallyChanged: false,
      selection: null,
    });
  },
}));
