import { Handle, Position, type NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { HEADER_HEIGHT, NODE_WIDTH, ROW_HEIGHT } from '@/lib/layout';
import type { Table } from '@/lib/schema';
import { useStore } from '@/store/useStore';

export type TableNodeData = { table: Table };

/**
 * Handles sit on every column row, left and right, so edges leave from the
 * exact field rather than the box edge. They are invisible: React Flow only
 * needs their position, and a visible dot on each row would be noise.
 */
const TableNodeImpl = ({ data, selected }: NodeProps & { data: TableNodeData }) => {
  const { table } = data;
  const hovered = useStore((s) => s.hoveredColumn);
  const hoverColumn = useStore((s) => s.hoverColumn);
  const selection = useStore((s) => s.selection);
  const highlighted = selected || selection?.tableId === table.id;

  return (
    <div
      className="overflow-hidden rounded-md border shadow-sm transition-shadow"
      style={{
        width: NODE_WIDTH,
        background: 'var(--table-body)',
        borderColor: highlighted ? 'var(--highlight)' : 'var(--border)',
        boxShadow: highlighted ? '0 0 0 2px var(--highlight)' : undefined,
      }}
    >
      <div
        className="flex items-center justify-between px-2 font-semibold"
        style={{
          height: HEADER_HEIGHT,
          background: table.headerColor ?? 'var(--table-header)',
          color: 'var(--table-header-fg)',
        }}
      >
        <span className="truncate">{table.name}</span>
        {table.records ? (
          <span className="shrink-0 rounded-sm bg-black/20 px-1 text-[10px] font-medium tabular-nums">
            {table.records.rows.length} rows
          </span>
        ) : null}
      </div>

      {table.columns.map((col, i) => {
        const isHovered = hovered?.tableId === table.id && hovered.column === col.name;
        return (
          <div
            key={col.name}
            className="relative flex items-center justify-between gap-2 px-2"
            style={{
              height: ROW_HEIGHT,
              background: isHovered
                ? 'var(--accent)'
                : i % 2
                  ? 'var(--table-row-alt)'
                  : 'transparent',
            }}
            onMouseEnter={() => hoverColumn({ tableId: table.id, column: col.name })}
            onMouseLeave={() => hoverColumn(null)}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={`${col.name}-l`}
              className="!h-1 !w-1 !border-0 !bg-transparent"
              style={{ top: '50%' }}
            />
            <span className="flex min-w-0 items-center gap-1 truncate">
              {col.pk ? <span title="primary key">🔑</span> : null}
              <span className="truncate" style={{ color: 'var(--foreground)' }}>
                {col.name}
              </span>
              {col.note ? <span title={col.note}>📝</span> : null}
            </span>
            <span
              className="shrink-0 text-[11px] tabular-nums"
              style={{ color: 'var(--muted-foreground)' }}
            >
              {col.type}
              {col.notNull ? ' NN' : ''}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`${col.name}-r`}
              className="!h-1 !w-1 !border-0 !bg-transparent"
              style={{ top: '50%' }}
            />
          </div>
        );
      })}
    </div>
  );
};

export const TableNode = memo(TableNodeImpl);
