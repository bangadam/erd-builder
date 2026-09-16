import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo, useMemo } from 'react';
import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from '@/lib/layout';
import type { Table } from '@/lib/schema';
import { useStore } from '@/store/useStore';
import { Icon } from './Icon';

export type TableNodeData = { table: Table };

const TableNodeImpl = ({ data, selected }: NodeProps & { data: TableNodeData }) => {
  const { table } = data;
  const hovered = useStore((s) => s.hoveredColumn);
  const hoverColumn = useStore((s) => s.hoverColumn);
  const selection = useStore((s) => s.selection);
  const refs = useStore((s) => s.schema.refs);
  const highlighted = selected || selection?.tableId === table.id;
  const linkedColumns = useMemo(() => {
    const linked = new Set<string>();
    for (const ref of refs) {
      if (ref.from.tableId === table.id) for (const column of ref.from.columns) linked.add(column);
      if (ref.to.tableId === table.id) for (const column of ref.to.columns) linked.add(column);
    }
    return linked;
  }, [refs, table.id]);

  return (
    <div className="erd-table" data-selected={highlighted} style={{ width: NODE_WIDTH }}>
      <div className="erd-table-header" style={{ height: HEADER_HEIGHT, ...(table.headerColor ? { borderTop: `3px solid ${table.headerColor}` } : {}) }}>
        <Icon name="table" size={13} /><span className="erd-table-name">{table.name}</span>
        {table.records && <span className="ui-badge">{table.records.rows.length} rows</span>}
      </div>
      {table.columns.map((column) => {
        const isHovered = hovered?.tableId === table.id && hovered.column === column.name;
        return (
          <div key={column.name} className="erd-field" data-active={isHovered || (selection?.tableId === table.id && selection.column === column.name)} style={{ height: ROW_HEIGHT }} onMouseEnter={() => hoverColumn({ tableId: table.id, column: column.name })} onMouseLeave={() => hoverColumn(null)}>
            <Handle type="target" position={Position.Left} id={`${column.name}-l`} className="!h-1 !w-1 !border-0 !bg-transparent" style={{ top: '50%' }} />
            <span className="erd-field-name">
              {column.pk ? <span title="Primary key"><Icon name="key" size={12} /></span> : linkedColumns.has(column.name) ? <span title="Relationship column"><Icon name="link" size={12} /></span> : <span className="erd-field-symbol" aria-hidden="true" />}
              <span>{column.name}</span>
              {column.note && <span title={column.note}><Icon name="note" size={11} /></span>}
            </span>
            <span className="erd-field-type">{column.type}{column.notNull && <span className="erd-required" title="Not null">NN</span>}</span>
            <Handle type="source" position={Position.Right} id={`${column.name}-r`} className="!h-1 !w-1 !border-0 !bg-transparent" style={{ top: '50%' }} />
          </div>
        );
      })}
    </div>
  );
};

export const TableNode = memo(TableNodeImpl);
