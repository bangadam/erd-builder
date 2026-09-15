import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo } from 'react';
import { CrowsFootMarkers, MARKER_IDS } from './CrowsFootMarkers';
import { TableNode, type TableNodeData } from './TableNode';
import { HEADER_HEIGHT, ROW_HEIGHT } from '@/lib/layout';
import { refColumnPairs } from '@/lib/schema';
import { useStore } from '@/store/useStore';

const nodeTypes = { table: TableNode };

/**
 * Nodes and edges are derived, never stored: `positions` in the store is the
 * only source of coordinates. Keeping a second copy inside React Flow would
 * make drags fight the parse cycle.
 */
const CanvasInner = () => {
  const schema = useStore((s) => s.schema);
  const positions = useStore((s) => s.positions);
  const hovered = useStore((s) => s.hoveredColumn);
  const selection = useStore((s) => s.selection);
  const moveTable = useStore((s) => s.moveTable);
  const select = useStore((s) => s.select);
  const { fitView, setCenter, getNode } = useReactFlow();

  const nodes = useMemo<Node[]>(
    () =>
      schema.tables.map((table) => ({
        id: table.id,
        type: 'table',
        position: positions[table.id] ?? { x: 0, y: 0 },
        data: { table } satisfies TableNodeData,
        selected: selection?.tableId === table.id,
      })),
    [schema.tables, positions, selection],
  );

  const edges = useMemo<Edge[]>(() => {
    const rowOf = (tableId: string, column: string) => {
      const table = schema.tables.find((t) => t.id === tableId);
      const index = table?.columns.findIndex((c) => c.name === column) ?? -1;
      return index >= 0 ? index : null;
    };

    return schema.refs.flatMap((ref) => {
      const pairs = refColumnPairs(ref);

      // A ref pointing at a table or column that doesn't exist has no anchor to
      // draw from; the parser already reported it, so skip rather than guess.
      if (pairs.some((pair) => rowOf(ref.from.tableId, pair.from) === null || rowOf(ref.to.tableId, pair.to) === null)) return [];

      const dimmed =
        hovered !== null &&
        !pairs.some(
          (pair) =>
            (hovered.tableId === ref.from.tableId && hovered.column === pair.from) ||
            (hovered.tableId === ref.to.tableId && hovered.column === pair.to),
        );

      return pairs.map((pair, i) => ({
        id: `${ref.id}#${i}`,
        source: ref.from.tableId,
        sourceHandle: `${pair.from}-r`,
        target: ref.to.tableId,
        targetHandle: `${pair.to}-l`,
        type: 'smoothstep',
        ...(i === 0
          ? { markerStart: MARKER_IDS[ref.from.cardinality], markerEnd: MARKER_IDS[ref.to.cardinality] }
          : {}),
        data: { refId: ref.id },
        style: {
          stroke: 'var(--edge)',
          strokeWidth: 1.5,
          opacity: dimmed ? 0.18 : 1,
          // `<>` has no physical FK, so it reads as a logical link.
          strokeDasharray: ref.manyToMany ? '6 4' : undefined,
        },
      }));
    });
  }, [schema, hovered]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position) moveTable(change.id, change.position);
      }
    },
    [moveTable],
  );

  const onNodeClick = useCallback<NodeMouseHandler>(
    (_, node) => select({ tableId: node.id, origin: 'canvas' }),
    [select],
  );

  // Editor and palette selections pan the canvas; a canvas click itself must
  // not, or clicking a node would yank the viewport out from under the cursor.
  useEffect(() => {
    if (selection?.origin !== 'editor' && selection?.origin !== 'palette') return;
    const node = getNode(selection.tableId);
    if (!node) return;
    const height = HEADER_HEIGHT + (node.measured?.height ?? ROW_HEIGHT);
    setCenter(node.position.x + 130, node.position.y + height / 2, { zoom: 1, duration: 300 });
  }, [selection, getNode, setCenter]);

  return (
    <div className="relative h-full w-full" style={{ background: 'var(--canvas-bg)' }}>
      <CrowsFootMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => select(null)}
        fitView
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="var(--canvas-dot)" />
        <Controls onFitView={() => fitView({ duration: 200 })} />
      </ReactFlow>
    </div>
  );
};

export const Canvas = () => (
  <ReactFlowProvider>
    <CanvasInner />
  </ReactFlowProvider>
);
