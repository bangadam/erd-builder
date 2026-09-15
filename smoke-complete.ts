import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { dbmlCompletions } from './src/lib/dbmlComplete';
import { parseDbml } from './src/lib/parseDbml';
import { emptySchema } from './src/lib/schema';

let failed = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  if (!cond) {
    failed++;
    console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail));
  } else console.log('ok  ', label);
};

const SCHEMA_SRC = `Table users {
  id integer [pk]
  username varchar
  role varchar
}
Table core.posts {
  id integer [pk]
  user_id integer
}
`;
const parsed = parseDbml(SCHEMA_SRC);
if (!parsed.ok) throw new Error('fixture must parse');
const complete = dbmlCompletions(() => parsed.schema);

/** Runs completion with the cursor at the end of `doc`. */
const at = (doc: string, explicit = true) => {
  const state = EditorState.create({ doc });
  return complete(new CompletionContext(state, doc.length, explicit));
};
const labels = (doc: string) => (at(doc)?.options ?? []).map((o) => o.label);

// --- top level ---
check('top level offers block keywords', labels('Ta').includes('Table'), labels('Ta').slice(0, 6));
check('top level offers Ref', labels('').includes('Ref'));
check('top level offers Records', labels('').includes('Records'));
check('top level lists known tables', labels('').includes('core.posts'), labels(''));

// --- inside a table body ---
const body = 'Table x {\n  ';
check('table body offers indexes block', labels(body).includes('indexes'), labels(body));
check('table body does NOT offer Table', !labels(body).includes('Table'), labels(body));

const afterName = 'Table x {\n  id ';
check('after a column name offers types', labels(afterName).includes('integer'), labels(afterName).slice(0, 5));
check('type slot does not offer settings', !labels(afterName).includes('pk'));

// --- inside a setting list ---
const settings = 'Table x {\n  id integer [';
check('setting list offers pk', labels(settings).includes('pk'), labels(settings).slice(0, 5));
check('setting list offers not null', labels(settings).includes('not null'));
check('setting list offers inline ref', labels(settings).includes('ref'));
check('setting list does not offer types', !labels(settings).includes('varchar'));

const closed = 'Table x {\n  id integer [pk] ';
check('closed setting list returns to table body', labels(closed).includes('indexes'), labels(closed));

// --- dotted column completion ---
const dotted = labels('Ref: users.');
check('dotted qualifier lists that table columns', dotted.join(',') === 'id,username,role', dotted);
const qualified = labels('Ref: core.posts.');
check('schema-qualified table resolves', qualified.join(',') === 'id,user_id', qualified);
check('unknown table falls back, not columns', !labels('Ref: nope.').includes('id'));

const partialCol = at('Ref: users.us');
check('dotted completion starts at the partial word', partialCol?.from === 'Ref: users.us'.length - 2, partialCol?.from);

// --- ref line ---
const refLine = labels('Ref: ');
check('ref line offers tables', refLine.includes('users'), refLine);
check('ref line offers relation operators', refLine.includes('<>'), refLine);
check('ref line does not offer Table block', !refLine.includes('Table'));

// --- braces, strings and comments must not shift context ---
const noteBrace = "Table x {\n  id integer [note: '{']\n  ";
check('brace inside a string does not shift context', labels(noteBrace).includes('indexes'), labels(noteBrace));

const commented = 'Table x {\n}\n// Table y {\n';
check('brace inside a comment does not shift context', labels(commented).includes('Table'), labels(commented));

const closedTable = 'Table x {\n  id int\n}\n';
check('after a closed table, context is top level', labels(closedTable).includes('Table'));

// --- enum body is intentionally free-form ---
check('enum body offers nothing', at('Enum role {\n  ') === null);

// --- empty schema still completes keywords ---
const cold = dbmlCompletions(() => emptySchema());
const coldState = EditorState.create({ doc: 'Ta' });
const coldResult = cold(new CompletionContext(coldState, 2, true));
check('keywords available before any table exists', (coldResult?.options ?? []).some((o) => o.label === 'Table'));

// --- implicit trigger must not fire on empty word ---
const state = EditorState.create({ doc: 'Table x {\n  ' });
check('no popup on whitespace without explicit request', complete(new CompletionContext(state, 12, false)) === null);

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
