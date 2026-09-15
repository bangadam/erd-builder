import { parseDbml } from './src/lib/parseDbml';
import { mergeLayout, nodeHeight, prunePositions } from './src/lib/layout';

let failed = 0;
const check = (label: string, cond: boolean, detail?: unknown) => {
  if (!cond) {
    failed++;
    console.log('FAIL', label, detail === undefined ? '' : JSON.stringify(detail));
  } else console.log('ok  ', label);
};

const SRC = `Table follows {
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

Table core.posts {
  id integer [primary key]
  title varchar
  body text [note: 'Content of the post']
  user_id integer [not null]
}

Ref user_posts: core.posts.user_id ?> users.id
Ref: users.id <? follows.following_user_id
Ref: users.id <? follows.followed_user_id

Records users(id, username, role) {
  0, 'Alice', 'admin'
  1, 'Bob', 'moderator'
}
`;

const r = parseDbml(SRC);
if (!r.ok) throw new Error('sample must parse: ' + JSON.stringify(r.diagnostics));

check('table ids qualify non-public schemas', r.schema.tables.map((t) => t.id).sort().join(',') === 'core.posts,follows,users', r.schema.tables.map((t) => t.id));
check('records captured with row count', r.schema.tables.find((t) => t.name === 'users')?.records?.rows.length === 2);
check('records null when absent', r.schema.tables.find((t) => t.name === 'follows')?.records === null);
check('column note preserved', r.schema.tables.find((t) => t.name === 'posts')?.columns.find((c) => c.name === 'body')?.note === 'Content of the post');
check('notNull mapped', r.schema.tables.find((t) => t.name === 'follows')?.columns[0].notNull === true);

const userPosts = r.schema.refs.find((x) => x.name === 'user_posts');
check('ref endpoints resolve to table ids', userPosts?.from.tableId === 'core.posts' && userPosts?.to.tableId === 'users', [userPosts?.from, userPosts?.to]);
check('optional modifier becomes zero-or-many', userPosts?.from.cardinality === 'zero-or-many', userPosts?.from.cardinality);
check('one side stays one', userPosts?.to.cardinality === 'one', userPosts?.to.cardinality);
check('fk ref is not many-to-many', userPosts?.manyToMany === false);

const m2m = parseDbml('Table a {\n  id int\n}\nTable b {\n  id int\n}\nRef: a.id <> b.id\n');
check('many-to-many flagged', m2m.ok && m2m.schema.refs[0].manyToMany === true);

// Verifies line/column → offset resolution: the parser reports 'user_id' at
// line 4 col 3 in this document, and that column starts at byte 32.
const OFFSET_SRC = 'Table a {\n  id int\n}\nRef: a.user_id > a.id\n';
const bad = parseDbml(OFFSET_SRC);
check('invalid source reports diagnostics', !bad.ok && bad.diagnostics.length > 0);
check(
  'diagnostic offset points at the offending column',
  !bad.ok && OFFSET_SRC.slice(bad.diagnostics[0].span.start.offset, bad.diagnostics[0].span.start.offset + 7) === 'user_id',
  bad.ok ? null : { offset: bad.diagnostics[0].span.start.offset, snippet: OFFSET_SRC.slice(bad.diagnostics[0].span.start.offset, bad.diagnostics[0].span.start.offset + 10) },
);

const parseFail = parseDbml('Table x {\n  id int\n');
check('unterminated table reports 1-based line', !parseFail.ok && parseFail.diagnostics[0].span.start.line >= 1);

const empty = parseDbml('// just a comment\n');
check('comment-only document parses to empty schema', empty.ok && empty.schema.tables.length === 0);

// --- layout ---
const users = r.schema.tables.find((t) => t.name === 'users')!;
check('height is derived from column count', nodeHeight(users) === 34 + 4 * 26, nodeHeight(users));

const laid = mergeLayout(r.schema, {});
check('every table gets a position', r.schema.tables.every((t) => laid[t.id] !== undefined));
check('layout separates tables', new Set(Object.values(laid).map((p) => `${p.x},${p.y}`)).size === r.schema.tables.length);

const pinned = { ...laid, users: { x: 999, y: 888 } };
const after = mergeLayout(r.schema, pinned);
check('dragged position survives re-layout', after.users.x === 999 && after.users.y === 888);
check('re-layout is identity when nothing is new', after === pinned);

const withNew = parseDbml(SRC + '\nTable fresh {\n  id int\n}\n');
if (!withNew.ok) throw new Error('append must parse');
const merged = mergeLayout(withNew.schema, pinned);
check('adding a table keeps existing coords', merged.users.x === 999 && merged.users.y === 888);
check('new table gets a coord', merged.fresh !== undefined);

const shrunk = parseDbml('Table users {\n  id int\n}\n');
if (!shrunk.ok) throw new Error('shrink must parse');
check('pruning drops removed tables', Object.keys(prunePositions(shrunk.schema, pinned)).join(',') === 'users');

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
