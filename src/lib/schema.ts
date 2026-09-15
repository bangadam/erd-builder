/**
 * Internal schema model. Deliberately decoupled from `@dbml/core` types:
 * nothing below this file imports from the vendor package.
 */

/** 1-based line/column, matching what the DBML parser reports. */
export type Pos = { line: number; column: number; offset: number };
export type Span = { start: Pos; end: Pos };

export type Cardinality = 'one' | 'many' | 'zero-or-one' | 'zero-or-many';
export type DefaultKind = 'number' | 'string' | 'boolean' | 'expression';

export type Column = {
  name: string;
  /** Rendered type, args included, e.g. `varchar(255)`. */
  type: string;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  increment: boolean;
  note: string | null;
  /** `null` when no default was declared. */
  default: { kind: DefaultKind; value: string } | null;
  /** True when injected from a `TablePartial`. */
  fromPartial: boolean;
  span: Span;
};

export type Index = {
  name: string | null;
  pk: boolean;
  unique: boolean;
  /** Column names, or backtick expressions rendered verbatim. */
  columns: string[];
};

export type RecordSet = {
  columns: string[];
  rows: (string | number | boolean | null)[][];
};

export type Table = {
  /** `schema.name`, unique across the document. Used as node id and position key. */
  id: string;
  schema: string;
  name: string;
  alias: string | null;
  note: string | null;
  /** From `[headercolor: #hex]`; `null` falls back to the theme token. */
  headerColor: string | null;
  columns: Column[];
  indexes: Index[];
  records: RecordSet | null;
  span: Span;
};

export type RefEnd = {
  /** `schema.table` — matches `Table.id`. */
  tableId: string;
  column: string;
  cardinality: Cardinality;
};

export type Ref = {
  id: string;
  name: string | null;
  from: RefEnd;
  to: RefEnd;
  /** `<>` relations have no physical FK; drawn dashed. */
  manyToMany: boolean;
  span: Span;
};

export type EnumDef = {
  id: string;
  schema: string;
  name: string;
  values: { name: string; note: string | null }[];
  span: Span;
};

export type Diagnostic = {
  message: string;
  span: Span;
  code: number | null;
};

export type Schema = {
  tables: Table[];
  refs: Ref[];
  enums: EnumDef[];
};

export type ParseResult =
  | { ok: true; schema: Schema; diagnostics: [] }
  | { ok: false; schema: null; diagnostics: Diagnostic[] };

export const emptySchema = (): Schema => ({ tables: [], refs: [], enums: [] });

/** Qualified id; `public` is elided so ids match how users write unqualified names. */
export const tableId = (schema: string | null | undefined, name: string): string =>
  !schema || schema === 'public' ? name : `${schema}.${name}`;
