import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from '@codemirror/autocomplete';
import type { Schema } from './schema';

/**
 * Completions are context-sensitive because DBML reuses the same words in
 * different positions: `note` is a column setting and a table body entry,
 * `ref` is both a top-level block and an inline setting. Offering one flat
 * list would bury the handful of entries that are legal where the cursor is.
 *
 * Context is recovered by scanning backwards for the enclosing `{` rather than
 * re-parsing: the document is usually invalid while typing, which is exactly
 * when completion has to work.
 */

const TOP_LEVEL: Completion[] = [
  snippetCompletion('Table ${name} {\n  ${id} integer [primary key]\n}', {
    label: 'Table',
    detail: 'table block',
    type: 'keyword',
  }),
  snippetCompletion('Ref: ${table}.${column} > ${other}.id', {
    label: 'Ref',
    detail: 'relationship',
    type: 'keyword',
  }),
  snippetCompletion('Enum ${name} {\n  ${value}\n}', {
    label: 'Enum',
    detail: 'enum block',
    type: 'keyword',
  }),
  snippetCompletion('Records ${table}(${columns}) {\n  ${values}\n}', {
    label: 'Records',
    detail: 'sample rows',
    type: 'keyword',
  }),
  snippetCompletion('TablePartial ${name} {\n  ${column} ${type}\n}', {
    label: 'TablePartial',
    detail: 'reusable columns',
    type: 'keyword',
  }),
  snippetCompletion("Project ${name} {\n  database_type: '${PostgreSQL}'\n}", {
    label: 'Project',
    detail: 'project metadata',
    type: 'keyword',
  }),
];

const TYPES: Completion[] = [
  'integer',
  'int',
  'bigint',
  'smallint',
  'serial',
  'varchar',
  'varchar(255)',
  'text',
  'char',
  'boolean',
  'timestamp',
  'timestamptz',
  'date',
  'time',
  'decimal(10,2)',
  'numeric',
  'float',
  'double',
  'json',
  'jsonb',
  'uuid',
  'binary',
].map((label) => ({ label, type: 'type' }));

const TABLE_BODY: Completion[] = [
  snippetCompletion('indexes {\n  (${columns}) [${pk}]\n}', {
    label: 'indexes',
    detail: 'index block',
    type: 'keyword',
  }),
  snippetCompletion('records {\n  ${values}\n}', {
    label: 'records',
    detail: 'sample rows',
    type: 'keyword',
  }),
  snippetCompletion("note: '${text}'", { label: 'note', detail: 'table note', type: 'property' }),
];

const COLUMN_SETTINGS: Completion[] = [
  { label: 'pk', detail: 'primary key', type: 'property' },
  { label: 'primary key', type: 'property' },
  { label: 'not null', type: 'property' },
  { label: 'null', type: 'property' },
  { label: 'unique', type: 'property' },
  { label: 'increment', detail: 'auto increment', type: 'property' },
  snippetCompletion('default: ${value}', { label: 'default', type: 'property' }),
  snippetCompletion("note: '${text}'", { label: 'note', type: 'property' }),
  snippetCompletion('ref: > ${table}.${column}', { label: 'ref', detail: 'inline relation', type: 'property' }),
];

const RELATION_OPS: Completion[] = [
  { label: '>', detail: 'many-to-one', type: 'operator' },
  { label: '<', detail: 'one-to-many', type: 'operator' },
  { label: '-', detail: 'one-to-one', type: 'operator' },
  { label: '<>', detail: 'many-to-many', type: 'operator' },
  { label: '?>', detail: 'optional many-to-one', type: 'operator' },
  { label: '<?', detail: 'one-to-optional-many', type: 'operator' },
];

type Context =
  | { kind: 'top' }
  | { kind: 'table-body'; expecting: 'name' | 'type' }
  | { kind: 'settings' }
  | { kind: 'enum-body' }
  | { kind: 'other' };

/**
 * Walks the document once, tracking brace depth while skipping strings and
 * comments so a `{` inside a note can't shift the context.
 */
const contextAt = (text: string): Context => {
  const openers: string[] = [];
  let lineStart = 0;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\n') {
      lineStart = i + 1;
      i++;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < text.length && text[i] !== quote && text[i] !== '\n') i++;
      i++;
      continue;
    }
    if (ch === '{') {
      openers.push(text.slice(lineStart, i));
      i++;
      continue;
    }
    if (ch === '}') {
      openers.pop();
      i++;
      continue;
    }
    i++;
  }

  const currentLine = text.slice(lineStart);
  // An unclosed `[` on the current line means the cursor sits in a setting list.
  if (currentLine.lastIndexOf('[') > currentLine.lastIndexOf(']')) return { kind: 'settings' };

  const header = openers.at(-1);
  if (header === undefined) return { kind: 'top' };
  if (/^\s*enum\b/i.test(header)) return { kind: 'enum-body' };
  if (/^\s*(table|tablepartial)\b/i.test(header)) {
    // `name ` with a space already typed means the type slot is next.
    return { kind: 'table-body', expecting: /^\s*[\w"]+\s+\S*$/.test(currentLine) ? 'type' : 'name' };
  }
  return { kind: 'other' };
};

export const dbmlCompletions =
  (getSchema: () => Schema) =>
  (context: CompletionContext): CompletionResult | null => {
    const before = context.state.doc.sliceString(0, context.pos);
    const schema = getSchema();

    // `users.` anywhere: offer that table's columns. Highest priority because
    // it is unambiguous, whatever block the cursor is in.
    const dotted = /([\w.]+)\.(\w*)$/.exec(before);
    if (dotted) {
      const [, qualifier, partial] = dotted;
      const table = schema.tables.find((t) => t.id === qualifier || t.name === qualifier);
      if (table) {
        return {
          from: context.pos - partial.length,
          options: table.columns.map((c) => ({
            label: c.name,
            detail: c.type,
            type: c.pk ? 'constant' : 'variable',
          })),
        };
      }
    }

    const word = context.matchBefore(/[\w?<>-]*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;

    const ctx = contextAt(before);
    const tableNames: Completion[] = schema.tables.map((t) => ({
      label: t.id,
      detail: `${t.columns.length} columns`,
      type: 'class',
    }));

    switch (ctx.kind) {
      case 'settings':
        return { from: word.from, options: [...COLUMN_SETTINGS, ...RELATION_OPS] };
      case 'table-body':
        return {
          from: word.from,
          options: ctx.expecting === 'type' ? TYPES : TABLE_BODY,
        };
      case 'enum-body':
        return null;
      case 'top': {
        // After `Ref:` the useful completions are tables and operators, not blocks.
        const inRef = /\bref\b[^{}\n]*$/i.test(before.slice(before.lastIndexOf('\n') + 1));
        return {
          from: word.from,
          options: inRef ? [...tableNames, ...RELATION_OPS] : [...TOP_LEVEL, ...tableNames],
        };
      }
      default:
        return { from: word.from, options: tableNames };
    }
  };
