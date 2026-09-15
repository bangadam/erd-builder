import dagre from '@dagrejs/dagre';
import type { Schema, Table } from './schema';

/**
 * Node geometry is the single source of truth for size: `TableNode` renders
 * itself from these constants so layout can never disagree with paint.
 * Height is derived from schema data alone — never from DOM measurement,
 * which only exists after paint and would flicker the diagram on each parse.
 */
export const NODE_WIDTH = 260;
export const HEADER_HEIGHT = 34;
export const ROW_HEIGHT = 26;

export type XY = { x: number; y: number };

export const nodeHeight = (table: Table): number =>
  HEADER_HEIGHT + Math.max(table.columns.length, 1) * ROW_HEIGHT;

/**
 * Tables the user already placed keep their coordinates; tables seen for the
 * first time take dagre's suggestion. Dagre only runs when something is new,
 * so typing inside an existing table costs nothing and never shuffles the canvas.
 */
export const mergeLayout = (
  schema: Schema,
  positions: Record<string, XY>,
): Record<string, XY> => {
  if (!schema.tables.some((t) => !positions[t.id])) return positions;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 140, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of schema.tables) g.setNode(t.id, { width: NODE_WIDTH, height: nodeHeight(t) });
  for (const r of schema.refs) {
    // Self-refs would make dagre collapse the rank; they render as a loop edge instead.
    if (r.from.tableId === r.to.tableId) continue;
    if (g.hasNode(r.from.tableId) && g.hasNode(r.to.tableId)) {
      g.setEdge(r.from.tableId, r.to.tableId);
    }
  }
  dagre.layout(g);

  const next: Record<string, XY> = {};
  for (const t of schema.tables) {
    const placed = positions[t.id];
    if (placed) {
      next[t.id] = placed;
      continue;
    }
    // dagre reports node centres; React Flow positions by top-left.
    const n = g.node(t.id) as { x: number; y: number } | undefined;
    next[t.id] = n
      ? { x: n.x - NODE_WIDTH / 2, y: n.y - nodeHeight(t) / 2 }
      : { x: 0, y: 0 };
  }
  return next;
};

/** Forget tables that no longer exist, so a deleted name can't shadow a new one. */
export const prunePositions = (
  schema: Schema,
  positions: Record<string, XY>,
): Record<string, XY> => {
  const live = new Set(schema.tables.map((t) => t.id));
  return Object.fromEntries(Object.entries(positions).filter(([id]) => live.has(id)));
};
