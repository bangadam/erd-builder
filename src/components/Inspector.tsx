import { useEffect, useMemo, useState } from 'react';
import { refColumnPairs, type Table } from '@/lib/schema';
import { useStore } from '@/store/useStore';
import { Icon } from './Icon';
import './details.css';

type Tab = 'columns' | 'indexes' | 'records';

const TAB_LABELS: Record<Tab, string> = {
  columns: 'Columns',
  indexes: 'Indexes',
  records: 'Records',
};

const EmptyState = ({ icon, children }: { icon: 'table' | 'info' | 'grid'; children: string }) => (
  <div className="details-empty">
    <Icon name={icon} size={14} />
    <span>{children}</span>
  </div>
);

const Tabs = ({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) => (
  <div className="details-tabs" role="tablist" aria-label="Table details">
    {(Object.keys(TAB_LABELS) as Tab[]).map((value) => (
      <button
        key={value}
        id={`inspector-tab-${value}`}
        type="button"
        role="tab"
        aria-selected={tab === value}
        aria-controls={`inspector-panel-${value}`}
        tabIndex={tab === value ? 0 : -1}
        className="details-tab"
        onClick={() => setTab(value)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
          event.preventDefault();
          const index = (Object.keys(TAB_LABELS) as Tab[]).indexOf(value);
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const next = (index + direction + 3) % 3;
          setTab((Object.keys(TAB_LABELS) as Tab[])[next]);
        }}
      >
        {TAB_LABELS[value]}
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
    <div className="details-panel-content">
      {table.columns.length === 0 ? (
        <EmptyState icon="table">No columns declared</EmptyState>
      ) : (
        table.columns.map((column) => {
          const enumValues = enums[column.type] ?? enums[`${table.schema}.${column.type}`];
          const active = selectedColumn === column.name;
          return (
            <article key={column.name} className="details-column" data-selected={active}>
              <div className="details-column-heading">
                <span className="details-column-name">{column.name}</span>
                <code className="details-column-type">{column.type}</code>
              </div>
              <div className="details-chip-row" aria-label="Column constraints">
                {column.pk ? <span className="ui-badge">PK</span> : null}
                {column.notNull ? <span className="ui-badge">NOT NULL</span> : null}
                {column.unique ? <span className="ui-badge">UNIQUE</span> : null}
                {column.increment ? <span className="ui-badge">AUTO INCREMENT</span> : null}
                {column.fromPartial ? <span className="ui-badge">PARTIAL</span> : null}
              </div>
              {column.default ? (
                <div className="details-field">
                  <span className="details-field-label">Default</span>
                  <code className="details-field-value">{column.default.value}</code>
                </div>
              ) : null}
              {enumValues ? (
                <div className="details-field">
                  <span className="details-field-label">Enum</span>
                  <span className="details-chip-row" style={{ marginTop: 0 }}>
                    {enumValues.map((value) => (
                      <span key={value} className="ui-badge">
                        {value}
                      </span>
                    ))}
                  </span>
                </div>
              ) : null}
              {column.note ? <p className="details-column-note">{column.note}</p> : null}
            </article>
          );
        })
      )}

      {outbound.length > 0 || inbound.length > 0 ? (
        <section className="details-section" aria-label="Relationships">
          <div className="details-section-heading">
            <Icon name="link" size={13} />
            <span className="section-label">Relationships</span>
          </div>
          {[...outbound, ...inbound].map((ref) => {
            const pairs = refColumnPairs(ref);
            const forward = ref.from.tableId === table.id;
            const source = forward ? table.id : ref.from.tableId;
            const target = forward ? ref.to.tableId : table.id;
            const sourceColumns = forward ? pairs.map((pair) => pair.from) : pairs.map((pair) => pair.to);
            const targetColumns = forward ? pairs.map((pair) => pair.to) : pairs.map((pair) => pair.from);
            return (
              <div key={ref.id} className="details-reference">
                <div className="details-reference-line">
                  <code className="details-reference-code">
                    {source} ({sourceColumns.join(', ')})
                  </code>
                  {ref.name ? <span className="details-reference-name">{ref.name}</span> : null}
                </div>
                <div className="details-reference-line">
                  <code className="details-reference-code">
                    {source} ({sourceColumns.join(', ')})
                  </code>
                  <Icon name="arrow" size={13} />
                  <code className="details-reference-code">
                    {target} ({targetColumns.join(', ')})
                  </code>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
};

const Indexes = ({ table }: { table: Table }) => (
  <div className="details-panel-content">
    {table.indexes.length === 0 ? (
      <EmptyState icon="grid">No table-level indexes</EmptyState>
    ) : (
      table.indexes.map((index, i) => (
        <article key={`${index.name ?? 'index'}-${i}`} className="details-index">
          <div className="details-index-line">
            <span className="details-column-name">{index.name ?? `Index ${i + 1}`}</span>
            <span className="details-index-kind">
              {index.pk ? 'PRIMARY' : index.unique ? 'UNIQUE' : 'INDEX'}
            </span>
          </div>
          <code className="details-index-columns">({index.columns.join(', ')})</code>
        </article>
      ))
    )}
  </div>
);

const Records = ({ table }: { table: Table }) => {
  const records = table.records;
  if (!records || records.rows.length === 0) {
    return (
      <div className="details-panel-content">
        <EmptyState icon="table">No sample records</EmptyState>
      </div>
    );
  }
  const rows = records.rows.slice(0, 100);
  return (
    <div className="details-records">
      <table>
        <thead>
          <tr>
            {records.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} title={cell === null ? 'NULL' : String(cell)}>
                  {cell === null ? 'NULL' : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {records.rows.length > rows.length ? (
        <p className="details-records-note">Showing the first 100 rows</p>
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
    <aside className="details-inspector" aria-label={`Details for ${table.name}`}>
      <header className="details-inspector-header">
        <div className="details-inspector-identity">
          <div className="details-inspector-identity-label">Table</div>
          <h2 className="details-inspector-title">{table.name}</h2>
          <div className="details-inspector-schema">{table.schema}.{table.name}</div>
          {table.alias ? <div className="details-inspector-schema">as {table.alias}</div> : null}
          {table.note ? <p className="details-inspector-note">{table.note}</p> : null}
        </div>
        <button type="button" className="icon-button" onClick={() => select(null)} aria-label="Close inspector">
          <Icon name="close" size={16} />
        </button>
      </header>
      <Tabs tab={tab} setTab={setTab} />
      <div
        id={`inspector-panel-${tab}`}
        className="details-panel"
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        tabIndex={0}
      >
        {tab === 'columns' ? <Columns table={table} /> : null}
        {tab === 'indexes' ? <Indexes table={table} /> : null}
        {tab === 'records' ? <Records table={table} /> : null}
      </div>
    </aside>
  );
};
