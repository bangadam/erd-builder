import { Parser } from '@dbml/core';
import { type Cardinality, type Column, type DefaultKind, type Diagnostic, type Index, type ParseResult, type RecordSet, type Ref, type Schema, tableId } from './schema';

/**
 * Single boundary between `@dbml/core` and the rest of the app. Everything
 * vendor-shaped is normalized here; components only ever see `./schema` types.
 *
 * Parser facts relied on (verified against @dbml/core 10.1.1, mode `dbmlv2`):
 * - `parse()` throws an object carrying a `diags` array; each diag is
 *   `{ message, code, location: { start, end } }` with 1-based line/column.
 * - `field.type.type_name` already includes args (`varchar(255)`); no
 *   reconstruction needed, and `type` is null for malformed columns only.
 * - `endpoint.relation` is one of `1`, `*`, `0..1`, `0..*` — optionality is
 *   encoded in the relation string, not a separate flag.
 * - `TablePartial` fields arrive pre-merged into `table.fields` with
 *   `injectedPartial` set, so partials are never walked separately.
 * - `records` is always an array on the table, empty when none declared.
 */

// --- vendor shapes, kept local so the vendor's module graph stays out of the app ---

type VendorPos = { line: number; column: number; offset: number };
type VendorToken = { start: VendorPos; end: VendorPos; filepath?: unknown };
type VendorField = {
  name: string;
  type: { type_name: string } | null;
  pk: boolean;
  unique: boolean;
  not_null: boolean;
  increment: boolean;
  note: string | null;
  dbdefault: { value: unknown; type: string } | null;
  injectedPartial?: unknown;
  token: VendorToken;
};
type VendorIndex = { name: string | null; pk: boolean; unique: boolean; columns: { value: unknown; type: string }[] };
type VendorRecord = { columns: string[]; values: { value: unknown }[][] };
type VendorTable = {
  name: string;
  alias: string | null;
  note: string | null;
  headerColor: string | null;
  fields: VendorField[];
  indexes: VendorIndex[];
  records: VendorRecord[];
  schema: { name: string } | null;
  token: VendorToken;
};
type VendorEndpoint = { relation: string; tableName: string; schemaName: string | null; fieldNames: string[] };
type VendorRef = { name: string | null; endpoints: VendorEndpoint[]; token: VendorToken };
type VendorEnum = { name: string; values: { name: string; note: string | null }[]; schema: { name: string } | null; token: VendorToken };
type VendorSchema = { name: string; tables: VendorTable[]; refs: VendorRef[]; enums: VendorEnum[] };
type VendorDiag = { message: string; code?: number; location?: VendorToken };

const CARDINALITIES: Record<string, Cardinality> = {
  '1': 'one',
  '*': 'many',
  '0..1': 'zero-or-one',
  '0..*': 'zero-or-many',
};

const toColumn = (f: VendorField): Column => ({
  name: f.name,
  type: f.type?.type_name ?? 'unknown',
  pk: f.pk,
  unique: f.unique,
  notNull: f.not_null,
  increment: f.increment,
  note: f.note,
  default: f.dbdefault ? { kind: f.dbdefault.type as DefaultKind, value: String(f.dbdefault.value) } : null,
  fromPartial: Boolean(f.injectedPartial),
  span: f.token,
});

const toIndex = (i: VendorIndex): Index => ({
  name: i.name,
  pk: i.pk,
  unique: i.unique,
  columns: i.columns.map((c) => (c.type === 'column' ? String(c.value) : `\`${String(c.value)}\``)),
});

const toRecords = (records: VendorRecord[]): RecordSet | null => {
  const first = records[0];
  if (!first) return null;
  return {
    columns: [...first.columns],
    rows: first.values.map((row) => row.map((cell) => (cell.value ?? null) as string | number | boolean | null)),
  };
};

const normalize = (schemas: VendorSchema[]): Schema => ({
  tables: schemas.flatMap((s) =>
    s.tables.map((t) => ({
      id: tableId(t.schema?.name ?? s.name, t.name),
      schema: t.schema?.name ?? s.name,
      name: t.name,
      alias: t.alias,
      note: t.note,
      headerColor: t.headerColor ?? null,
      columns: t.fields.map(toColumn),
      indexes: t.indexes.map(toIndex),
      records: toRecords(t.records),
      span: t.token,
    })),
  ),
  refs: schemas.flatMap((s) =>
    s.refs.flatMap((r, i): Ref[] => {
      const [a, b] = r.endpoints;
      if (!a || !b) return [];
      // ponytail: only the first column of a composite ref is drawn; a composite
      // FK renders as one edge per endpoint column once anyone asks for it.
      return [
        {
          id: r.name ?? `ref_${s.name}_${i}`,
          name: r.name,
          from: {
            tableId: tableId(a.schemaName, a.tableName),
            column: a.fieldNames[0],
            cardinality: CARDINALITIES[a.relation] ?? 'many',
          },
          to: {
            tableId: tableId(b.schemaName, b.tableName),
            column: b.fieldNames[0],
            cardinality: CARDINALITIES[b.relation] ?? 'many',
          },
          manyToMany: a.relation.includes('*') && b.relation.includes('*'),
          span: r.token,
        },
      ];
    }),
  ),
  enums: schemas.flatMap((s) =>
    s.enums.map((e) => ({
      id: tableId(e.schema?.name ?? s.name, e.name),
      schema: e.schema?.name ?? s.name,
      name: e.name,
      values: e.values.map((v) => ({ name: v.name, note: v.note })),
      span: e.token,
    })),
  ),
});

const FALLBACK_POS = { line: 1, column: 1, offset: 0 };

/**
 * Diagnostic locations carry line/column but no offset, unlike node tokens.
 * The editor squiggles by offset, so resolve it here against the exact source
 * that produced the error — line starts are cheap and computed only on failure.
 */
const toDiagnostics = (error: unknown, source: string): Diagnostic[] => {
  const diags = (error as { diags?: VendorDiag[] } | null)?.diags;
  if (!Array.isArray(diags) || diags.length === 0) {
    return [
      {
        message: error instanceof Error ? error.message : 'Failed to parse DBML',
        code: null,
        span: { start: FALLBACK_POS, end: FALLBACK_POS },
      },
    ];
  }

  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }
  const resolve = (p: VendorPos | undefined) => {
    if (!p) return FALLBACK_POS;
    const base = lineStarts[p.line - 1] ?? 0;
    return { line: p.line, column: p.column, offset: Math.min(base + p.column - 1, source.length) };
  };

  return diags.map((d) => ({
    message: d.message,
    code: d.code ?? null,
    span: { start: resolve(d.location?.start), end: resolve(d.location?.end) },
  }));
};

// `Parser` holds no per-call state; one instance is reused to avoid re-parsing setup.
// ponytail: shared singleton, swap for a worker pool only if parse latency ever bites.
const parser = new Parser();

export const parseDbml = (source: string): ParseResult => {
  try {
    const db = parser.parse(source, 'dbmlv2') as unknown as { schemas: VendorSchema[] };
    return { ok: true, schema: normalize(db.schemas), diagnostics: [] };
  } catch (error) {
    return { ok: false, schema: null, diagnostics: toDiagnostics(error, source) };
  }
};
