# ERD Builder

Text-first ERD visualizer for [DBML](https://dbml.dbdiagram.io/docs). Write a schema, get a live entity-relationship diagram with crow's-foot notation. Runs entirely in the browser — no account, no backend, no data leaves the tab.

## Why

Diagram editors make you drag boxes. Schemas are text, they live in version control, and they are reviewed as diffs. ERD Builder keeps DBML as the single source of truth and treats the canvas as a pure render of it, so the picture can never drift from the definition.

## Features

- **Live diagram** — parse and re-render on a 300 ms debounce while typing.
- **Crow's-foot notation** — DBML's `?` optionality maps onto the hollow-circle glyph, so `0..1` and `1` stay visually distinct. `<>` renders dashed, since it has no physical foreign key.
- **Column-level edges** — relationships anchor to the exact field row, not the box edge.
- **Context-aware autocomplete** — block keywords at top level, column types after a name, settings inside `[…]`, and column names after `table.`.
- **Stable layout** — new tables are placed by [dagre](https://github.com/dagrejs/dagre); tables you have dragged keep their coordinates, so adding a column never reshuffles the canvas.
- **Inline diagnostics** — parse errors squiggle at the offending token; the last valid diagram stays on screen instead of blanking.
- **Cross-highlight** — click a table to jump the editor to its block; move the cursor into a block to highlight the node.
- **Export** — `.dbml`, PostgreSQL, MySQL, and SQL Server DDL.
- **Light and dark themes** — driven by CSS custom properties; `[headercolor: #hex]` is honoured.

## Getting started

```bash
npm install
npm run dev
```

The app is client-only; `npm run build` emits a static bundle that can be hosted anywhere.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | oxlint |
| `npm run smoke` | Assertion suites for the parser, layout, and completion logic |

## Architecture

```
src/
├─ lib/
│  ├─ schema.ts         internal model — no vendor types
│  ├─ parseDbml.ts      the only module that imports @dbml/core
│  ├─ layout.ts         dagre placement + position merging
│  ├─ dbmlLanguage.ts   CodeMirror syntax highlighting
│  ├─ dbmlComplete.ts   context-aware completion sources
│  ├─ exportSchema.ts   DBML and SQL output
│  └─ storage.ts        localStorage persistence, cross-tab detection
├─ store/useStore.ts    Zustand state
└─ components/          Canvas, TableNode, Editor, CrowsFootMarkers
```

Three decisions carry most of the design:

**The parser is isolated.** `parseDbml.ts` is the sole boundary with `@dbml/core`; everything downstream sees the model in `schema.ts`. Vendor shapes are awkward for rendering (circular references, endpoint pairs, relation strings), and pinning components to them would make the library impossible to replace.

**Positions live outside the parse.** DBML carries no coordinates, so `positions` is stored separately and keyed by qualified table name. Layout only runs for tables it has not seen, which is what keeps the canvas still while you type.

**Node size is computed, never measured.** Table height is `header + columns × row`, derived from schema data. Reading it back from the DOM would only be available after paint and would flicker the diagram on every parse.

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · [React Flow](https://reactflow.dev) · [CodeMirror 6](https://codemirror.net) · [Zustand](https://zustand.docs.pmnd.rs) · [`@dbml/core`](https://www.npmjs.com/package/@dbml/core) · [dagre](https://github.com/dagrejs/dagre)

UI primitives come from the [ReUI](https://reui.io) shadcn registry (Radix variant).

## Limitations

- Desktop only — a split editor and canvas are not usable at phone widths.
- One document; multi-document management is not implemented.
- The canvas renders the schema but does not edit it. Changes are made in DBML.
- Composite foreign keys draw a single edge from the first column pair.
- Sample `Records` are parsed and surfaced as a row-count badge, but not rendered as data, and `@dbml/core` does not emit them as SQL `INSERT` statements.

## License

MIT
