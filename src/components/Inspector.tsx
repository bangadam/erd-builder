import { useEffect, useMemo, useState } from 'react';
import { refColumnPairs, type Table } from '@/lib/schema';
import { useStore } from '@/store/useStore';

type Tab = 'columns' | 'indexes' | 'records';

const Tabs = ({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) => (
  <div className="flex border-b">
    {(['columns', 'indexes', 'records'] as Tab[]).map((value) => (
      <button
        key={value}
        type="button"
        onClick={() => setTab(value)}
        className="flex-1 px-2 py-2 text-[12px] capitalize"
        style={{
          borderBottom: tab === value ? '2px solid var(--table-header)' : '2px solid transparent',
          fontWeight: tab === value ? 600 : 400,
        }}
      >
        {value}
      </button>
    ))}
  </div>
);

const Columns = ({ table }: { table: Table }) => {
  const schema = useStore((s) => s.schema);
  const selectedColumn = useStore((s) => s.selection?.column);
  const enums = useMemo(
    () =>
      Object.fromEntries(
        schema.enums.map((item) => [item.id, item.values.map((value) => value.name)]),
      ),
    [schema.enums],
  );
  const inbound = schema.refs.filter((ref) => ref.to.tableId === table.id);
  const outbound = schema.refs.filter((ref) => ref.from.tableId === table.id);

  return (
    <div className="space-y-3 p-3">
      {table.columns.map((column) => {
        const enumValues = enums[column.type] ?? enums[`${table.schema}.${column.type}`];
        const active = selectedColumn === column.name;
        return (
          <div
            key={column.name}
            className="rounded-md border p-2"
            style={{ background: active ? 'var(--accent)' : 'transparent' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">{column.name}</span>
              <code className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {column.type}
              </code>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {column.pk ? <span className="rounded border px-1 text-[10px]">PK</span> : null}
              {column.notNull ? <span className="rounded border px-1 text-[10px]">NOT NULL</span> : null}
              {column.unique ? <span className="rounded border px-1 text-[10px]">UNIQUE</span> : null}
              {column.increment ? <span className="rounded border px-1 text-[10px]">INCREMENT</span> : null}
              {column.default ? (
                <span className="rounded border px-1 text-[10px]">DEFAULT {column.default.value}</span>
              ) : null}
            </div>
            {column.note ? (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {column.note}
              </p>
            ) : null}
            {enumValues ? (
              <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                Enum: {enumValues.join(', ')}
              </p>
            ) : null}
          </div>
        );
      })}

      {(outbound.length > 0 || inbound.length > 0) && (
        <section>
          <h3 className="mb-1 text-[11px] font-semibold tracking-wide">RELATIONSHIPS</h3>
          {[...outbound, ...inbound].map((ref) => {
            const pairs = refColumnPairs(ref);
            const forward = ref.from.tableId === table.id;
            return (
              <div key={ref.id} className="mb-1 rounded-md border p-2 text-[11px] font-mono">
                <span>{forward ? `(${pairs.map((pair) => pair.from).join(', ')})` : ref.from.tableId}</span>
                <span> → </span>
                <span>
                  {forward
                    ? `${ref.to.tableId}(${pairs.map((pair) => pair.to).join(', ')})`
                    : `(${pairs.map((pair) => pair.to).join(', ')})`}
                </span>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
};

const Indexes = ({ table }: { table: Table }) => (
  <div className="space-y-2 p-3">
    {table.indexes.length === 0 ? (
      <p className="text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
        No table-level indexes
      </p>
    ) : (
      table.indexes.map((index, i) => (
        <div key={`${index.name ?? 'index'}-${i}`} className="rounded-md border p-2">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-medium">{index.name ?? `Index ${i + 1}`}</span>
            <span style={{ color: 'var(--muted-foreground)' }}>
              {index.pk ? 'PRIMARY' : index.unique ? 'UNIQUE' : 'INDEX'}
            </span>
          </div>
          <code className="mt-1 block text-[11px]">({index.columns.join(', ')})</code>
        </div>
      ))
    )}
  </div>
);

const Records = ({ table }: { table: Table }) => {
  const records = table.records;
  if (!records) {
    return (
      <p className="p-3 text-[12px]" style={{ color: 'var(--muted-foreground)' }}>
        No sample records
      </p>
    );
  }
  const rows = records.rows.slice(0, 100);
  return (
    <div className="overflow-auto p-3">
      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr>
            {records.columns.map((column) => (
              <th key={column} className="border-b px-1 py-1 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b px-1 py-1 font-mono">
                  {cell === null ? 'NULL' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {records.rows.length > rows.length ? (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
          Showing the first 100 rows
        </p>
      ) : null}
    </div>
  );
};

export const Inspector = () => {
  const selection = useStore((s) => s.selection);
  const table = useStore((s) =>
    s.selection ? s.schema.tables.find((item) => item.id === s.selection?.tableId) : undefined,
  );
  const select = useStore((s) => s.select);
  const [tab, setTab] = useState<Tab>('columns');

  useEffect(() => setTab('columns'), [selection?.tableId]);
  if (!table || !selection) return null;

  return (
    <aside
      className="absolute right-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-80 flex-col overflow-hidden rounded-lg border shadow-xl"
      style={{ background: 'var(--card)' }}
    >
      <header className="flex items-start justify-between gap-2 border-b p-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{table.name}</h2>
          {table.schema !== 'public' ? (
            <p className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              {table.schema}
            </p>
          ) : null}
          {table.note ? (
            <p className="mt-1 text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
              {table.note}
            </p>
          ) : null}
        </div>
        <button type="button" onClick={() => select(null)} aria-label="Close inspector">
          ×
        </button>
      </header>
      <Tabs tab={tab} setTab={setTab} />
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === 'columns' ? <Columns table={table} /> : null}
        {tab === 'indexes' ? <Indexes table={table} /> : null}
        {tab === 'records' ? <Records table={table} /> : null}
      </div>
    </aside>
  );
};
