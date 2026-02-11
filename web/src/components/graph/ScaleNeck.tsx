import { useMemo, useState, useCallback, useEffect } from 'react';
import type { GraphNode, GraphEdge } from '../../api/client';
import { formatName } from '../../utils/format';

// --- Layout Constants ---
const PADDING_LEFT = 110;
const PADDING_TOP = 70;
const PADDING_BOTTOM = 40;
const PADDING_RIGHT = 40;
const STRING_SPACING = 90;
const FRET_WIDTH = 130;
const NODE_RADIUS = 16;
const VISIBLE_FRETS = 5;

// --- Dimension Definitions ---
// Each dimension = one string on the neck. Values ordered easy → hard (low fret → high fret).
const DIMENSIONS = [
  { key: 'position' as const, label: 'Position', values: ['E', 'D', 'C', 'A', 'G'] },
  { key: 'rhythm' as const, label: 'Rhythm', values: ['8ths', '16ths', 'triplets', 'quintuplets', 'sextuplets'] },
  { key: 'notePattern' as const, label: 'Pattern', values: ['stepwise', 'seq-3', 'seq-4', 'thirds', 'fourths', 'fifths', 'sixths', 'sevenths', 'octaves', 'triad', 'seventh', 'ninth', 'sixth', 'add9'] },
];

type DimKey = (typeof DIMENSIONS)[number]['key'];

const MAX_FRETS = Math.max(...DIMENSIONS.map((d) => d.values.length));

// Rhythm → continuous pattern (Phase 1: all x's)
const RHYTHM_PATTERNS: Record<string, string> = {
  '8ths': 'xx',
  '16ths': 'xxxx',
  triplets: 'xxx',
  quintuplets: 'xxxxx',
  sextuplets: 'xxxxxx',
};

// --- Status helpers ---
type StatusKey = GraphNode['data']['status'];

function getStatusColor(status: StatusKey, part: 'fill' | 'stroke'): string {
  if (part === 'fill') {
    switch (status) {
      case 'mastered': return 'var(--status-mastered-bg)';
      case 'expanded': return 'var(--status-expanded-bg)';
      case 'practicing': return 'var(--status-practicing-bg)';
      case 'struggling': return 'var(--status-struggling-bg)';
      default: return 'var(--status-unpracticed-bg)';
    }
  }
  switch (status) {
    case 'mastered': return 'var(--status-mastered-border)';
    case 'expanded': return 'var(--status-expanded-border)';
    case 'practicing': return 'var(--status-practicing-border)';
    case 'struggling': return 'var(--status-struggling-border)';
    default: return 'var(--status-unpracticed-border)';
  }
}

const STATUS_PRIORITY: Record<StatusKey, number> = {
  mastered: 4,
  expanded: 3,
  practicing: 2,
  struggling: 1,
  unpracticed: 0,
};

function pickBestStatus(statuses: StatusKey[]): StatusKey {
  return statuses.reduce(
    (best, s) => (STATUS_PRIORITY[s] > STATUS_PRIORITY[best] ? s : best),
    'unpracticed' as StatusKey,
  );
}

function getDimValue(node: GraphNode, key: DimKey): string {
  switch (key) {
    case 'position': return node.data.position;
    case 'rhythm': return node.data.rhythm;
    case 'notePattern': return node.data.notePattern || 'stepwise';
  }
}

function buildCompoundId(scale: string, dims: Record<DimKey, string>): string {
  const pattern = RHYTHM_PATTERNS[dims.rhythm] || 'xx';
  return `${scale}+${dims.position}+${dims.rhythm}:${pattern}+${dims.notePattern}`;
}

// --- Component ---
export interface ScaleNeckProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedScale: string;
  selectedNodeId: string | null;
  recommendedNodeId: string | null;
  onNodeSelect: (node: GraphNode | null) => void;
  onBack: () => void;
}

export default function ScaleNeck({
  nodes,
  edges,
  selectedScale,
  selectedNodeId,
  recommendedNodeId,
  onNodeSelect,
  onBack,
}: ScaleNeckProps) {
  const [viewportStart, setViewportStart] = useState(0);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Filter nodes to selected scale
  const scaleNodes = useMemo(
    () => nodes.filter((n) => n.data.scale === selectedScale),
    [nodes, selectedScale],
  );

  // Scale metadata from any node of this scale
  const scaleInfo = useMemo(() => {
    const n = scaleNodes.find((n) => n.data.scaleTier != null);
    return {
      tier: n?.data.scaleTier,
      tonality: n?.data.scaleTonality,
      uses: n?.data.scaleUses,
    };
  }, [scaleNodes]);

  // Node lookup by compound ID
  const nodeById = useMemo(() => {
    const m = new Map<string, GraphNode>();
    for (const n of scaleNodes) m.set(n.id, n);
    // Also index all nodes (for cross-scale lookups when selected node is from another scale)
    for (const n of nodes) {
      if (!m.has(n.id)) m.set(n.id, n);
    }
    return m;
  }, [scaleNodes, nodes]);

  // Neighbor map from edges
  const neighborMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [edges]);

  // Intersection map: "dimIdx:fretIdx" → { nodes with that value, bestStatus }
  // Only includes practiced compounds (attempts > 0)
  const intersectionMap = useMemo(() => {
    const m = new Map<string, { nodes: GraphNode[]; bestStatus: StatusKey }>();
    for (const node of scaleNodes) {
      if (node.data.attempts === 0) continue;
      for (let di = 0; di < DIMENSIONS.length; di++) {
        const val = getDimValue(node, DIMENSIONS[di].key);
        const fret = DIMENSIONS[di].values.indexOf(val);
        if (fret < 0) continue;
        const key = `${di}:${fret}`;
        const entry = m.get(key) ?? { nodes: [], bestStatus: 'unpracticed' as StatusKey };
        entry.nodes.push(node);
        entry.bestStatus = pickBestStatus(entry.nodes.map((n) => n.data.status));
        m.set(key, entry);
      }
    }
    return m;
  }, [scaleNodes]);

  // Get fret indices for a node (one per dimension/string)
  const getNodeFrets = useCallback((node: GraphNode): number[] => {
    return DIMENSIONS.map((d) => d.values.indexOf(getDimValue(node, d.key)));
  }, []);

  // Create a virtual unpracticed GraphNode
  const createVirtualNode = useCallback(
    (dims: Record<DimKey, string>): GraphNode => {
      const id = buildCompoundId(selectedScale, dims);
      return {
        id,
        type: 'compound',
        data: {
          id,
          label: id,
          scale: selectedScale,
          position: dims.position,
          rhythm: dims.rhythm,
          rhythmPattern: RHYTHM_PATTERNS[dims.rhythm] || 'xx',
          notePattern: dims.notePattern,
          bestNpm: 0,
          lastNpm: 0,
          lastBpm: 0,
          attempts: 0,
          status: 'unpracticed',
          hasExpanded: false,
          isMastered: false,
          strugglingStreak: 0,
          lastPracticed: null,
          scaleTier: scaleInfo.tier,
          scaleTonality: scaleInfo.tonality,
          scaleUses: scaleInfo.uses,
        },
        position: { x: 0, y: 0 },
      };
    },
    [selectedScale, scaleInfo],
  );

  // Click handler: change one dimension from the current selection
  const handleIntersectionClick = useCallback(
    (dimIndex: number, fretIndex: number) => {
      const dim = DIMENSIONS[dimIndex];
      if (fretIndex >= dim.values.length) return;

      // Base = current selection or entry point
      const base = selectedNodeId
        ? nodeById.get(selectedNodeId) ?? nodes.find((n) => n.id === selectedNodeId)
        : null;

      const dims: Record<DimKey, string> = {
        position: base ? base.data.position : 'E',
        rhythm: base ? base.data.rhythm : '8ths',
        notePattern: base ? base.data.notePattern || 'stepwise' : 'stepwise',
      };

      // Change the clicked dimension
      dims[dim.key] = dim.values[fretIndex];

      const compId = buildCompoundId(selectedScale, dims);
      const existing = nodeById.get(compId);
      onNodeSelect(existing ?? createVirtualNode(dims));
    },
    [selectedNodeId, nodeById, nodes, selectedScale, createVirtualNode, onNodeSelect],
  );

  // Derived: selected & recommended node frets
  const selectedNode = selectedNodeId
    ? (nodeById.get(selectedNodeId) ?? nodes.find((n) => n.id === selectedNodeId) ?? null)
    : null;
  const selectedFrets = selectedNode ? getNodeFrets(selectedNode) : null;
  const recommendedNode = recommendedNodeId ? nodeById.get(recommendedNodeId) ?? null : null;
  const recommendedFrets = recommendedNode ? getNodeFrets(recommendedNode) : null;

  // Neighbor IDs of selected node
  const selectedNeighborIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    return neighborMap.get(selectedNodeId) ?? new Set<string>();
  }, [selectedNodeId, neighborMap]);

  // Neighbor frets for pulsing dots (compounds reachable by 1-dim change)
  const neighborFretSets = useMemo(() => {
    const sets: Set<string>[] = DIMENSIONS.map(() => new Set<string>());
    for (const nId of selectedNeighborIds) {
      const n = nodeById.get(nId);
      if (!n || n.data.scale !== selectedScale) continue;
      const frets = getNodeFrets(n);
      for (let di = 0; di < DIMENSIONS.length; di++) {
        if (selectedFrets && frets[di] !== selectedFrets[di]) {
          sets[di].add(`${di}:${frets[di]}`);
        }
      }
    }
    return sets;
  }, [selectedNeighborIds, nodeById, selectedScale, getNodeFrets, selectedFrets]);

  // Auto-scroll viewport to show selected/recommended compound
  useEffect(() => {
    const frets = selectedFrets ?? recommendedFrets;
    if (!frets) return;
    const validFrets = frets.filter((f, i) => f >= 0 && f < DIMENSIONS[i].values.length);
    if (validFrets.length === 0) return;
    const maxFret = Math.max(...validFrets);
    const minFret = Math.min(...validFrets);
    const maxStart = Math.max(0, MAX_FRETS - VISIBLE_FRETS);
    if (maxFret >= viewportStart + VISIBLE_FRETS) {
      setViewportStart(Math.min(Math.max(0, maxFret - VISIBLE_FRETS + 1), maxStart));
    } else if (minFret < viewportStart) {
      setViewportStart(Math.max(0, minFret));
    }
  }, [selectedFrets, recommendedFrets, viewportStart]);

  // Navigation
  const maxStart = Math.max(0, MAX_FRETS - VISIBLE_FRETS);
  const canScrollLeft = viewportStart > 0;
  const canScrollRight = viewportStart < maxStart;

  // SVG dimensions
  const svgW = PADDING_LEFT + VISIBLE_FRETS * FRET_WIDTH + PADDING_RIGHT;
  const svgH = PADDING_TOP + (DIMENSIONS.length - 1) * STRING_SPACING + PADDING_BOTTOM;

  // Helper: is this fret part of the selected chord shape?
  const isSelectedFret = (di: number, fret: number) => selectedFrets?.[di] === fret;
  const isRecommendedFret = (di: number, fret: number) => recommendedFrets?.[di] === fret;
  const isNeighborFret = (di: number, fret: number) => neighborFretSets[di]?.has(`${di}:${fret}`);

  // Fret position → SVG x
  const fretX = (visibleIdx: number) => PADDING_LEFT + (visibleIdx + 0.5) * FRET_WIDTH;
  // String index → SVG y
  const stringY = (di: number) => PADDING_TOP + di * STRING_SPACING;

  return (
    <div className="w-full h-full flex flex-col" style={{ backgroundColor: 'var(--graph-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 12L6 8L10 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Scales
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {formatName(selectedScale)} Scale
          </h2>
          {scaleInfo.tier && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Tier {scaleInfo.tier}
            </span>
          )}
        </div>
        <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
          Frets {viewportStart}&ndash;
          {Math.min(viewportStart + VISIBLE_FRETS - 1, MAX_FRETS - 1)} of {MAX_FRETS}
        </span>
      </div>

      {/* Fretboard area */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        {/* Left scroll arrow */}
        {canScrollLeft && (
          <button
            onClick={() => setViewportStart((v) => Math.max(0, v - 1))}
            className="absolute left-3 z-10 p-2 rounded-full transition-colors hover:brightness-110"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15L7 10L12 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Right scroll arrow */}
        {canScrollRight && (
          <button
            onClick={() => setViewportStart((v) => Math.min(maxStart, v + 1))}
            className="absolute right-3 z-10 p-2 rounded-full transition-colors hover:brightness-110"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 5L13 10L8 15" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Fade indicators */}
        {canScrollLeft && (
          <div
            className="absolute left-0 top-0 bottom-0 w-16 pointer-events-none"
            style={{ background: 'linear-gradient(to right, var(--graph-bg), transparent)', zIndex: 5 }}
          />
        )}
        {canScrollRight && (
          <div
            className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none"
            style={{ background: 'linear-gradient(to left, var(--graph-bg), transparent)', zIndex: 5 }}
          />
        )}

        {/* SVG Fretboard */}
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          className="block"
          style={{ maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%' }}
        >
          {/* Pulse animation */}
          <defs>
            <style>{`
              @keyframes neck-pulse {
                0%, 100% { opacity: 0.8; }
                50% { opacity: 0.3; }
              }
              .neck-pulse { animation: neck-pulse 2s infinite; }
            `}</style>
          </defs>

          {/* Background click target */}
          <rect x="0" y="0" width={svgW} height={svgH} fill="transparent" onClick={() => onNodeSelect(null)} />

          {/* Nut */}
          <line
            x1={PADDING_LEFT}
            y1={PADDING_TOP - 15}
            x2={PADDING_LEFT}
            y2={stringY(DIMENSIONS.length - 1) + 15}
            stroke="var(--fretboard-nut, #F5E6D3)"
            strokeWidth={6}
            strokeLinecap="round"
          />

          {/* Fret wires */}
          {Array.from({ length: VISIBLE_FRETS }, (_, i) => (
            <line
              key={`fw-${i}`}
              x1={PADDING_LEFT + (i + 1) * FRET_WIDTH}
              y1={PADDING_TOP - 12}
              x2={PADDING_LEFT + (i + 1) * FRET_WIDTH}
              y2={stringY(DIMENSIONS.length - 1) + 12}
              stroke="var(--fretboard-fret, #D4A056)"
              strokeWidth={1.5}
              opacity={0.35}
            />
          ))}

          {/* Strings */}
          {DIMENSIONS.map((_, i) => (
            <line
              key={`str-${i}`}
              x1={PADDING_LEFT - 3}
              y1={stringY(i)}
              x2={PADDING_LEFT + VISIBLE_FRETS * FRET_WIDTH + 10}
              y2={stringY(i)}
              stroke="var(--fretboard-string, #C0C0C0)"
              strokeWidth={1 + i * 0.5}
              opacity={0.5}
            />
          ))}

          {/* Dimension labels (left of nut) */}
          {DIMENSIONS.map((dim, i) => (
            <text
              key={`dl-${i}`}
              x={PADDING_LEFT - 16}
              y={stringY(i) + 5}
              fill="var(--text-secondary)"
              fontSize={12}
              fontWeight={600}
              textAnchor="end"
              fontFamily="var(--font-family, sans-serif)"
            >
              {dim.label}
            </text>
          ))}

          {/* Fret value labels (rotated, per-string) */}
          {DIMENSIONS.map((dim, di) =>
            Array.from({ length: VISIBLE_FRETS }, (_, fi) => {
              const fret = viewportStart + fi;
              if (fret >= dim.values.length) return null;
              const x = fretX(fi);
              const y = stringY(di) - NODE_RADIUS - 10;
              const value = dim.values[fret];
              const label = formatName(value).length > 10 ? formatName(value).slice(0, 9) + '\u2026' : formatName(value);
              return (
                <text
                  key={`vl-${di}-${fi}`}
                  x={x}
                  y={y}
                  fill="var(--text-muted)"
                  fontSize={9}
                  textAnchor="middle"
                  fontFamily="var(--font-family, sans-serif)"
                  transform={`rotate(-35 ${x} ${y})`}
                >
                  {label}
                </text>
              );
            }),
          )}

          {/* Selected compound chord shape connector */}
          {selectedFrets &&
            (() => {
              const points: { x: number; y: number }[] = [];
              for (let di = 0; di < DIMENSIONS.length; di++) {
                const fret = selectedFrets[di];
                const vi = fret - viewportStart;
                if (vi < 0 || vi >= VISIBLE_FRETS || fret >= DIMENSIONS[di].values.length) continue;
                points.push({ x: fretX(vi), y: stringY(di) });
              }
              if (points.length < 2) return null;
              return points.slice(0, -1).map((p, i) => (
                <line
                  key={`chord-${i}`}
                  x1={p.x}
                  y1={p.y}
                  x2={points[i + 1].x}
                  y2={points[i + 1].y}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={4}
                  strokeLinecap="round"
                />
              ));
            })()}

          {/* Recommended compound chord shape connector (if different from selected) */}
          {recommendedFrets &&
            (!selectedFrets || recommendedNodeId !== selectedNodeId) &&
            (() => {
              const points: { x: number; y: number }[] = [];
              for (let di = 0; di < DIMENSIONS.length; di++) {
                const fret = recommendedFrets[di];
                const vi = fret - viewportStart;
                if (vi < 0 || vi >= VISIBLE_FRETS || fret >= DIMENSIONS[di].values.length) continue;
                points.push({ x: fretX(vi), y: stringY(di) });
              }
              if (points.length < 2) return null;
              return points.slice(0, -1).map((p, i) => (
                <line
                  key={`rec-chord-${i}`}
                  x1={p.x}
                  y1={p.y}
                  x2={points[i + 1].x}
                  y2={points[i + 1].y}
                  stroke="var(--accent-primary)"
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.3}
                />
              ));
            })()}

          {/* Intersection dots */}
          {DIMENSIONS.map((dim, di) =>
            Array.from({ length: VISIBLE_FRETS }, (_, fi) => {
              const fret = viewportStart + fi;
              if (fret >= dim.values.length) return null;

              const x = fretX(fi);
              const y = stringY(di);
              const iKey = `${di}:${fret}`;
              const data = intersectionMap.get(iKey);
              const hasCompounds = !!data && data.nodes.length > 0;
              const status = data?.bestStatus ?? 'unpracticed';

              const isSel = isSelectedFret(di, fret);
              const isRec = isRecommendedFret(di, fret) && !isSel;
              const isNbr = isNeighborFret(di, fret) && !isSel;
              const isHovered = hoveredKey === iKey;

              const fillColor = hasCompounds ? getStatusColor(status, 'fill') : 'transparent';
              const strokeColor = hasCompounds
                ? getStatusColor(status, 'stroke')
                : 'var(--status-unpracticed-border)';
              const sw = isSel ? 3 : ['expanded', 'mastered', 'struggling'].includes(status) ? 2.5 : 1.5;
              const dash = hasCompounds ? undefined : '3,2';
              const dotOpacity = hasCompounds ? 1 : 0.4;

              return (
                <g
                  key={`dot-${di}-${fi}`}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleIntersectionClick(di, fret);
                  }}
                  onMouseEnter={() => setHoveredKey(iKey)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  {/* Recommended pulsing ring */}
                  {isRec && (
                    <circle
                      cx={x}
                      cy={y}
                      r={NODE_RADIUS + 5}
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth={2}
                      className="neck-pulse"
                    />
                  )}

                  {/* Neighbor glow */}
                  {isNbr && (
                    <circle
                      cx={x}
                      cy={y}
                      r={NODE_RADIUS + 4}
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth={1.5}
                      opacity={0.5}
                      strokeDasharray="4,3"
                    />
                  )}

                  {/* Selected ring */}
                  {isSel && (
                    <circle
                      cx={x}
                      cy={y}
                      r={NODE_RADIUS + 4}
                      fill="none"
                      stroke="rgba(255,255,255,0.8)"
                      strokeWidth={2.5}
                    />
                  )}

                  {/* Main dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r={NODE_RADIUS}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={sw}
                    strokeDasharray={dash}
                    opacity={dotOpacity}
                  />

                  {/* Hover tooltip */}
                  {isHovered && (
                    <g>
                      <rect
                        x={x - 70}
                        y={y + NODE_RADIUS + 8}
                        width={140}
                        height={hasCompounds ? 36 : 24}
                        rx={6}
                        fill="var(--bg-elevated)"
                        stroke="var(--border)"
                        strokeWidth={1}
                      />
                      <text
                        x={x}
                        y={y + NODE_RADIUS + 22}
                        fill="var(--text-primary)"
                        fontSize={11}
                        fontWeight={600}
                        textAnchor="middle"
                        fontFamily="var(--font-family, sans-serif)"
                      >
                        {formatName(dim.values[fret])}
                      </text>
                      {hasCompounds && (
                        <text
                          x={x}
                          y={y + NODE_RADIUS + 35}
                          fill="var(--text-muted)"
                          fontSize={9}
                          textAnchor="middle"
                          fontFamily="var(--font-family, sans-serif)"
                        >
                          {data!.nodes.length} compound{data!.nodes.length > 1 ? 's' : ''} &middot;{' '}
                          {data!.nodes[0].data.lastBpm > 0
                            ? `${data!.nodes[0].data.lastBpm} BPM`
                            : status}
                        </text>
                      )}
                    </g>
                  )}
                </g>
              );
            }),
          )}
        </svg>
      </div>

      {/* Legend */}
      <div
        className="flex items-center gap-4 px-4 py-2 text-xs shrink-0"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{
              backgroundColor: 'var(--status-practicing-bg)',
              border: '1.5px solid var(--status-practicing-border)',
            }}
          />
          Practicing
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{
              backgroundColor: 'var(--status-expanded-bg)',
              border: '2px solid var(--status-expanded-border)',
            }}
          />
          Expanded
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{
              backgroundColor: 'var(--status-mastered-bg)',
              border: '2px solid var(--status-mastered-border)',
            }}
          />
          Mastered
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{
              border: '1.5px dashed var(--status-unpracticed-border)',
            }}
          />
          Unpracticed
        </span>
      </div>
    </div>
  );
}
