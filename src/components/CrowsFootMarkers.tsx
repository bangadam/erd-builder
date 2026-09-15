import type { Cardinality } from '@/lib/schema';

/**
 * Crow's-foot (IE) notation. DBML's `?` optionality maps directly onto the
 * hollow circle, which is why this notation was chosen over dbdiagram's dots:
 * `0..1` and `1` stay visually distinct instead of collapsing into one glyph.
 *
 * Markers are authored pointing right (+x) and React Flow orients them along
 * the edge, so `smoothstep` edges — which always arrive horizontally — keep
 * the feet square to the table side.
 */
export const MARKER_IDS: Record<Cardinality, string> = {
  one: 'cf-one',
  many: 'cf-many',
  'zero-or-one': 'cf-zero-one',
  'zero-or-many': 'cf-zero-many',
};

const STROKE = { stroke: 'var(--edge)', strokeWidth: 1.5, fill: 'none' } as const;

/**
 * Rendered once inside the flow's SVG. `markerUnits="userSpaceOnUse"` keeps the
 * glyphs a constant size regardless of edge stroke width.
 */
export const CrowsFootMarkers = () => (
  <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
    <defs>
      {/* one: single crossbar */}
      <marker id={MARKER_IDS.one} viewBox="0 0 20 20" refX="1" refY="10" markerWidth="20" markerHeight="20" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M 8 4 L 8 16" {...STROKE} />
      </marker>

      {/* many: three prongs opening away from the table */}
      <marker id={MARKER_IDS.many} viewBox="0 0 20 20" refX="1" refY="10" markerWidth="20" markerHeight="20" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M 12 10 L 2 4 M 12 10 L 2 10 M 12 10 L 2 16" {...STROKE} />
      </marker>

      {/* zero-or-one: hollow circle plus crossbar */}
      <marker id={MARKER_IDS['zero-or-one']} viewBox="0 0 20 20" refX="1" refY="10" markerWidth="20" markerHeight="20" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <circle cx="14" cy="10" r="3.2" {...STROKE} style={{ fill: 'var(--canvas-bg)' }} />
        <path d="M 7 4 L 7 16" {...STROKE} />
      </marker>

      {/* zero-or-many: hollow circle plus crow's foot */}
      <marker id={MARKER_IDS['zero-or-many']} viewBox="0 0 24 20" refX="1" refY="10" markerWidth="24" markerHeight="20" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <circle cx="18" cy="10" r="3.2" {...STROKE} style={{ fill: 'var(--canvas-bg)' }} />
        <path d="M 12 10 L 2 4 M 12 10 L 2 10 M 12 10 L 2 16" {...STROKE} />
      </marker>
    </defs>
  </svg>
);
