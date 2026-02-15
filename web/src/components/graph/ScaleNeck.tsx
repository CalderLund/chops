import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import type { GraphNode, GraphEdge } from '../../api/client';
import { formatName } from '../../utils/format';

// --- Layout Constants (updated per plan) ---
const PADDING_LEFT = 150;
const PADDING_TOP = 90;
const PADDING_BOTTOM = 40;
const PADDING_RIGHT = 40;
const STRING_SPACING = 100;
const FRET_WIDTH = 140;
const VISIBLE_FRETS = 5;

// Variable dot sizing by role (P0.3)
const DOT_RADIUS = {
  selected: 24,
  recommended: 22,
  neighbor: 20,
  practiced: 18,
  unpracticed: 16,
};

// --- Dimension Definitions ---
// Each dimension = one string on the neck. Values ordered easy -> hard (low fret -> high fret).
const DIMENSIONS = [
  { key: 'position' as const, label: 'Position', values: ['E', 'D', 'C', 'A', 'G'] },
  {
    key: 'rhythm' as const,
    label: 'Subdivision',
    values: ['8ths', '16ths', 'triplets', 'quintuplets', 'sextuplets'],
  },
  {
    key: 'notePattern' as const,
    label: 'Pattern',
    values: [
      'stepwise',
      'seq-3',
      'seq-4',
      'thirds',
      'fourths',
      'fifths',
      'sixths',
      'sevenths',
      'octaves',
      'triad',
      'seventh',
      'ninth',
      'sixth',
      'add9',
    ],
  },
];

type DimKey = (typeof DIMENSIONS)[number]['key'];

const MAX_FRETS = Math.max(...DIMENSIONS.map((d) => d.values.length));

// Rhythm -> continuous pattern
const RHYTHM_PATTERNS: Record<string, string> = {
  '8ths': 'xx',
  '16ths': 'xxxx',
  triplets: 'xxx',
  quintuplets: 'xxxxx',
  sextuplets: 'xxxxxx',
};

// Short abbreviations for labels inside dots (P0.1)
const ABBREV: Record<string, string> = {
  '8ths': '8ths',
  '16ths': '16ths',
  triplets: 'Trip',
  quintuplets: 'Quin',
  sextuplets: 'Sext',
  stepwise: 'Step',
  'seq-3': 'Seq3',
  'seq-4': 'Seq4',
  thirds: '3rds',
  fourths: '4ths',
  fifths: '5ths',
  sixths: '6ths',
  sevenths: '7ths',
  octaves: 'Oct',
  triad: 'Triad',
  seventh: '7th',
  ninth: '9th',
  sixth: '6th',
  add9: 'Add9',
};

function abbrev(value: string): string {
  return ABBREV[value] ?? value;
}

// Traditional guitar inlay positions (0-indexed fret numbers)
const INLAY_FRETS = new Set([3, 5, 7, 9, 12]);

// --- Status helpers ---
type StatusKey = GraphNode['data']['status'];

function getStatusColor(status: StatusKey, part: 'fill' | 'stroke'): string {
  if (part === 'fill') {
    switch (status) {
      case 'mastered':
        return 'var(--status-mastered-bg)';
      case 'expanded':
        return 'var(--status-expanded-bg)';
      case 'practicing':
        return 'var(--status-practicing-bg)';
      case 'struggling':
        return 'var(--status-struggling-bg)';
      default:
        return 'var(--status-unpracticed-bg)';
    }
  }
  switch (status) {
    case 'mastered':
      return 'var(--status-mastered-border)';
    case 'expanded':
      return 'var(--status-expanded-border)';
    case 'practicing':
      return 'var(--status-practicing-border)';
    case 'struggling':
      return 'var(--status-struggling-border)';
    default:
      return 'var(--status-unpracticed-border)';
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
    case 'position':
      return node.data.position;
    case 'rhythm':
      return node.data.rhythm;
    case 'notePattern':
      return node.data.notePattern || 'stepwise';
  }
}

function buildCompoundId(scale: string, dims: Record<DimKey, string>): string {
  const pattern = RHYTHM_PATTERNS[dims.rhythm] || 'xx';
  return `${scale}+${dims.position}+${dims.rhythm}:${pattern}+${dims.notePattern}`;
}

function getDotRadius(isSel: boolean, isRec: boolean, isNbr: boolean, hasCompounds: boolean): number {
  if (isSel) return DOT_RADIUS.selected;
  if (isRec) return DOT_RADIUS.recommended;
  if (isNbr) return DOT_RADIUS.neighbor;
  if (hasCompounds) return DOT_RADIUS.practiced;
  return DOT_RADIUS.unpracticed;
}

// Text summary helper (P1.7)
function compoundSummary(node: GraphNode): string {
  const pos = `${node.data.position}-Shape`;
  const rhythm = formatName(node.data.rhythm);
  const pattern = formatName(node.data.notePattern || 'stepwise');
  return `${pos} / ${rhythm} / ${pattern}`;
}

// --- Component ---
export interface ScaleNeckProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedScale: string;
  selectedNode: GraphNode | null;
  onNodeSelect: (node: GraphNode | null) => void;
  onBack: () => void;
}

export default function ScaleNeck({
  nodes,
  edges,
  selectedScale,
  selectedNode: selectedNodeProp,
  onNodeSelect,
  onBack,
}: ScaleNeckProps) {
  const selectedNodeId = selectedNodeProp?.id ?? null;
  const [viewportStart, setViewportStart] = useState(0);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const scrollRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Drag state (mutable ref for perf, visual state for re-renders)
  const dragRef = useRef<{
    dimIndex: number;
    startFret: number;
    currentFret: number;
    startClientX: number;
    hasMoved: boolean;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [dragVisual, setDragVisual] = useState<{
    dimIndex: number;
    startFret: number;
    currentFret: number;
    cursorX: number;
  } | null>(null);

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

  // Intersection map: "dimIdx:fretIdx" -> { nodes, bestStatus }
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

  // Get fret indices for a node
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

      const base = selectedNodeId
        ? (nodeById.get(selectedNodeId) ?? nodes.find((n) => n.id === selectedNodeId) ?? selectedNodeProp)
        : null;

      const dims: Record<DimKey, string> = {
        position: base ? base.data.position : 'E',
        rhythm: base ? base.data.rhythm : '8ths',
        notePattern: base ? base.data.notePattern || 'stepwise' : 'stepwise',
      };

      dims[dim.key] = dim.values[fretIndex];

      const compId = buildCompoundId(selectedScale, dims);
      const existing = nodeById.get(compId);
      onNodeSelect(existing ?? createVirtualNode(dims));
    },
    [selectedNodeId, selectedNodeProp, nodeById, nodes, selectedScale, createVirtualNode, onNodeSelect],
  );

  // Stable ref so drag pointerup always calls latest handler
  const handleIntersectionClickRef = useRef(handleIntersectionClick);
  handleIntersectionClickRef.current = handleIntersectionClick;

  // Convert client X to scroll-group X coordinate
  const clientToScrollX = useCallback(
    (clientX: number): number => {
      const svg = svgRef.current;
      if (!svg) return PADDING_LEFT;
      const ctm = svg.getScreenCTM();
      if (!ctm) return PADDING_LEFT;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = 0;
      return pt.matrixTransform(ctm.inverse()).x + viewportStart * FRET_WIDTH;
    },
    [viewportStart],
  );

  // Convert client X to a fret index on the given dimension's string
  const clientToFret = useCallback(
    (clientX: number, dimIndex: number): number => {
      const scrollGroupX = clientToScrollX(clientX);
      const fret = Math.round((scrollGroupX - PADDING_LEFT) / FRET_WIDTH - 0.5);
      return Math.max(0, Math.min(fret, DIMENSIONS[dimIndex].values.length - 1));
    },
    [clientToScrollX],
  );

  // Drag-to-slide: pointerdown starts tracking, distinguishes click vs drag
  const DRAG_THRESHOLD = 5;
  const handleDotPointerDown = useCallback(
    (e: React.PointerEvent, dimIndex: number, fret: number) => {
      e.stopPropagation();
      e.preventDefault(); // prevent text selection
      setHoveredKey(null);

      dragRef.current = {
        dimIndex,
        startFret: fret,
        currentFret: fret,
        startClientX: e.clientX,
        hasMoved: false,
      };

      const handleMove = (ev: PointerEvent) => {
        ev.preventDefault(); // prevent text selection
        const d = dragRef.current;
        if (!d) return;
        const dx = Math.abs(ev.clientX - d.startClientX);
        if (!d.hasMoved && dx <= DRAG_THRESHOLD) return;
        d.hasMoved = true;
        const newFret = clientToFret(ev.clientX, d.dimIndex);
        const cursorX = clientToScrollX(ev.clientX);
        d.currentFret = newFret;
        setDragVisual({ dimIndex: d.dimIndex, startFret: d.startFret, currentFret: newFret, cursorX });
      };

      const handleUp = () => {
        const d = dragRef.current;
        if (d) {
          handleIntersectionClickRef.current(d.dimIndex, d.hasMoved ? d.currentFret : d.startFret);
        }
        dragRef.current = null;
        setDragVisual(null);
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
        dragCleanupRef.current = null;
      };

      document.addEventListener('pointermove', handleMove);
      document.addEventListener('pointerup', handleUp);
      dragCleanupRef.current = () => {
        document.removeEventListener('pointermove', handleMove);
        document.removeEventListener('pointerup', handleUp);
      };
    },
    [clientToFret, clientToScrollX],
  );

  // Clean up drag listeners on unmount
  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
  }, []);

  // Derived: selected node frets
  const selectedNode = selectedNodeId
    ? (nodeById.get(selectedNodeId) ?? nodes.find((n) => n.id === selectedNodeId) ?? selectedNodeProp)
    : null;
  const selectedFrets = selectedNode ? getNodeFrets(selectedNode) : null;

  // Neighbor IDs of selected node
  const selectedNeighborIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    return neighborMap.get(selectedNodeId) ?? new Set<string>();
  }, [selectedNodeId, neighborMap]);

  // Neighbor frets for pulsing dots
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

  // Auto-scroll viewport to show selected compound
  useEffect(() => {
    if (!selectedFrets) return;
    const validFrets = selectedFrets.filter((f, i) => f >= 0 && f < DIMENSIONS[i].values.length);
    if (validFrets.length === 0) return;
    const maxFret = Math.max(...validFrets);
    const minFret = Math.min(...validFrets);
    const maxStart = Math.max(0, MAX_FRETS - VISIBLE_FRETS);
    if (maxFret >= viewportStart + VISIBLE_FRETS) {
      setViewportStart(Math.min(Math.max(0, maxFret - VISIBLE_FRETS + 1), maxStart));
    } else if (minFret < viewportStart) {
      setViewportStart(Math.max(0, minFret));
    }
  }, [selectedFrets, viewportStart]);

  // Smooth scroll: apply CSS transition on the scrolling group (P2.13)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.setAttribute('transform', `translate(${-viewportStart * FRET_WIDTH}, 0)`);
    }
  }, [viewportStart]);

  // Navigation
  const maxStart = Math.max(0, MAX_FRETS - VISIBLE_FRETS);
  const canScrollLeft = viewportStart > 0;
  const canScrollRight = viewportStart < maxStart;

  // SVG dimensions
  const svgW = PADDING_LEFT + VISIBLE_FRETS * FRET_WIDTH + PADDING_RIGHT;
  const svgH = PADDING_TOP + (DIMENSIONS.length - 1) * STRING_SPACING + PADDING_BOTTOM;

  // Helpers
  const isSelectedFret = (di: number, fret: number) => selectedFrets?.[di] === fret;
  const isNeighborFret = (di: number, fret: number) => neighborFretSets[di]?.has(`${di}:${fret}`);

  // Fret absolute X position (in scrolling group coordinates)
  const fretX = (fret: number) => PADDING_LEFT + (fret + 0.5) * FRET_WIDTH;
  // String Y position
  const stringY = (di: number) => PADDING_TOP + di * STRING_SPACING;

  // Wood background dimensions
  const woodY = PADDING_TOP - 20;
  const woodH = (DIMENSIONS.length - 1) * STRING_SPACING + 40;

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

      {/* Text summary (P1.7) */}
      <div className="flex items-center gap-4 px-4 py-2 text-sm shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        {selectedNode ? (
          <span style={{ color: 'var(--text-secondary)' }}>
            <strong>{compoundSummary(selectedNode)}</strong>
          </span>
        ) : (
          <span style={{ color: 'var(--text-muted)' }}>Click a fret position to select an exercise</span>
        )}
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
          ref={svgRef}
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMidYMid meet"
          className="block"
          style={{ maxWidth: '100%', maxHeight: '100%', width: '100%', height: '100%', touchAction: 'none', userSelect: 'none' }}
        >
          <defs>
            {/* Chord glow filter (P0.2) */}
            <filter id="chord-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
            </filter>

            {/* Mastered fill gradient (P1.10) */}
            <radialGradient id="mastered-fill" cx="40%" cy="40%">
              <stop offset="0%" stopColor="#4BC77A" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#1A3D2E" />
            </radialGradient>

            {/* Clip path for scrolling viewport (P2.13) */}
            <clipPath id="fretboard-clip">
              <rect x={PADDING_LEFT - 8} y={0} width={VISIBLE_FRETS * FRET_WIDTH + 16} height={svgH} />
            </clipPath>

            {/* Animations */}
            <style>{`
              @keyframes neck-pulse {
                0%, 100% { opacity: 0.8; }
                50% { opacity: 0.3; }
              }
              .neck-pulse { animation: neck-pulse 2s infinite; }
              @keyframes struggling-pulse {
                0%, 100% { opacity: 0.2; }
                50% { opacity: 0.6; }
              }
              .struggling-pulse { animation: struggling-pulse 1.5s ease-in-out infinite; }
            `}</style>
          </defs>

          {/* Background click target */}
          <rect x="0" y="0" width={svgW} height={svgH} fill="transparent" onClick={() => onNodeSelect(null)} />

          {/* Wood-grain fretboard background (P1.6) */}
          <rect
            x={PADDING_LEFT}
            y={woodY}
            width={VISIBLE_FRETS * FRET_WIDTH}
            height={woodH}
            rx={4}
            fill="var(--fretboard-wood, #1F1A14)"
            opacity={0.5}
          />

          {/* Grain lines (P1.6) */}
          {[0.25, 0.5, 0.75, 0.9].map((t, i) => {
            const y = woodY + t * woodH;
            return (
              <line
                key={`grain-${i}`}
                x1={PADDING_LEFT}
                y1={y}
                x2={PADDING_LEFT + VISIBLE_FRETS * FRET_WIDTH}
                y2={y}
                stroke="var(--fretboard-grain, #2A2420)"
                strokeWidth={0.5}
                opacity={0.15}
              />
            );
          })}

          {/* Strings with shadow (P1.9) */}
          {DIMENSIONS.map((_, i) => {
            const y = stringY(i);
            const isBottom = i === DIMENSIONS.length - 1;
            return (
              <g key={`str-${i}`}>
                {/* Shadow line */}
                <line
                  x1={PADDING_LEFT - 3}
                  y1={y + 1}
                  x2={PADDING_LEFT + VISIBLE_FRETS * FRET_WIDTH + 10}
                  y2={y + 1}
                  stroke="#000"
                  strokeWidth={1}
                  opacity={0.15}
                />
                {/* String */}
                <line
                  x1={PADDING_LEFT - 3}
                  y1={y}
                  x2={PADDING_LEFT + VISIBLE_FRETS * FRET_WIDTH + 10}
                  y2={y}
                  stroke={isBottom ? '#C8B898' : 'var(--fretboard-string, #C0C0C0)'}
                  strokeWidth={1 + i * 0.5}
                  opacity={0.65}
                />
              </g>
            );
          })}

          {/* Dimension labels (P1.4 - descriptive labels) */}
          {DIMENSIONS.map((dim, i) => (
            <text
              key={`dl-${i}`}
              x={PADDING_LEFT - 16}
              y={stringY(i) + 5}
              fill="var(--text-secondary)"
              fontSize={11}
              fontWeight={600}
              textAnchor="end"
              fontFamily="var(--font-family, sans-serif)"
            >
              {dim.label}
            </text>
          ))}

          {/* Difficulty direction cue (P1.5) */}
          <text
            x={PADDING_LEFT + 16}
            y={PADDING_TOP - 60}
            fill="var(--text-muted)"
            fontSize={10}
            opacity={0.5}
            fontFamily="var(--font-family, sans-serif)"
          >
            easier
          </text>
          <text
            x={PADDING_LEFT + VISIBLE_FRETS * FRET_WIDTH - 16}
            y={PADDING_TOP - 60}
            fill="var(--text-muted)"
            fontSize={10}
            opacity={0.5}
            textAnchor="end"
            fontFamily="var(--font-family, sans-serif)"
          >
            harder
          </text>

          {/* Scrolling group (P2.13) */}
          <g clipPath="url(#fretboard-clip)">
            <g
              ref={scrollRef}
              style={{ transition: 'transform 0.3s ease-out' }}
              transform={`translate(${-viewportStart * FRET_WIDTH}, 0)`}
            >
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
              {Array.from({ length: MAX_FRETS }, (_, i) => (
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

              {/* Fret inlay markers (P2.11) */}
              {Array.from({ length: MAX_FRETS }, (_, f) => {
                if (!INLAY_FRETS.has(f)) return null;
                const cx = fretX(f);
                const midY = (stringY(0) + stringY(DIMENSIONS.length - 1)) / 2;
                if (f === 12) {
                  // Double dot at fret 12
                  const gap = STRING_SPACING * 0.3;
                  return (
                    <g key={`inlay-${f}`}>
                      <circle cx={cx} cy={midY - gap} r={4} fill="var(--fretboard-inlay, #2A2824)" />
                      <circle cx={cx} cy={midY + gap} r={4} fill="var(--fretboard-inlay, #2A2824)" />
                    </g>
                  );
                }
                return <circle key={`inlay-${f}`} cx={cx} cy={midY} r={4} fill="var(--fretboard-inlay, #2A2824)" />;
              })}

              {/* Fret numbers at top */}
              {Array.from({ length: MAX_FRETS }, (_, f) => (
                <text
                  key={`fn-${f}`}
                  x={fretX(f)}
                  y={PADDING_TOP - 42}
                  fill="var(--text-muted)"
                  fontSize={10}
                  fontWeight={500}
                  textAnchor="middle"
                  fontFamily="var(--font-family, sans-serif)"
                  opacity={0.6}
                >
                  {f}
                </text>
              ))}

              {/* Selected compound chord shape connector (P0.2) */}
              {selectedFrets &&
                (() => {
                  const points: { x: number; y: number }[] = [];
                  for (let di = 0; di < DIMENSIONS.length; di++) {
                    const fret = selectedFrets[di];
                    if (fret < 0 || fret >= DIMENSIONS[di].values.length) continue;
                    points.push({ x: fretX(fret), y: stringY(di) });
                  }
                  if (points.length < 2) return null;
                  return (
                    <>
                      {/* Glow layer */}
                      {points.slice(0, -1).map((p, i) => (
                        <line
                          key={`chord-glow-${i}`}
                          x1={p.x}
                          y1={p.y}
                          x2={points[i + 1].x}
                          y2={points[i + 1].y}
                          stroke="var(--accent-primary)"
                          strokeWidth={10}
                          strokeLinecap="round"
                          opacity={0.35}
                          filter="url(#chord-glow)"
                        />
                      ))}
                      {/* Crisp layer */}
                      {points.slice(0, -1).map((p, i) => (
                        <line
                          key={`chord-crisp-${i}`}
                          x1={p.x}
                          y1={p.y}
                          x2={points[i + 1].x}
                          y2={points[i + 1].y}
                          stroke="rgba(255,255,255,0.6)"
                          strokeWidth={5}
                          strokeLinecap="round"
                        />
                      ))}
                    </>
                  );
                })()}

              {/* Intersection dots */}
              {DIMENSIONS.map((dim, di) =>
                dim.values.map((_, fi) => {
                  const fret = fi;
                  const x = fretX(fret);
                  const y = stringY(di);
                  const iKey = `${di}:${fret}`;
                  const data = intersectionMap.get(iKey);
                  const hasCompounds = !!data && data.nodes.length > 0;
                  const status = data?.bestStatus ?? 'unpracticed';

                  const isSel = isSelectedFret(di, fret);
                  const isNbr = isNeighborFret(di, fret) && !isSel;
                  const isHovered = hoveredKey === iKey;
                  const r = getDotRadius(isSel, false, isNbr, hasCompounds);

                  // Fill color: mastered uses radial gradient
                  const fillColor =
                    hasCompounds && status === 'mastered'
                      ? 'url(#mastered-fill)'
                      : hasCompounds
                        ? getStatusColor(status, 'fill')
                        : 'transparent';
                  const strokeColor = hasCompounds
                    ? getStatusColor(status, 'stroke')
                    : 'var(--status-unpracticed-border)';

                  // Stroke width: mastered=3, selected=3, expanded/struggling=2.5, default=1.5
                  const sw = isSel || status === 'mastered' ? 3 : ['expanded', 'struggling'].includes(status) ? 2.5 : 1.5;
                  // Dash: unpracticed uses wider pattern (P1.10)
                  const dash = hasCompounds ? undefined : '4,4';
                  // Opacity: unpracticed reduced but still interactive; brighten on hover
                  // Dim the origin dot while being dragged away
                  const isDragOrigin =
                    dragVisual && dragVisual.dimIndex === di && dragVisual.startFret === fret && dragVisual.currentFret !== fret;
                  const dotOpacity = isDragOrigin ? 0.25 : hasCompounds ? 1 : isHovered ? 0.8 : 0.5;

                  // Tooltip position: above for last string, below otherwise
                  const tooltipAbove = di === DIMENSIONS.length - 1;
                  const tooltipY = tooltipAbove ? y - r - 8 : y + r + 8;

                  return (
                    <g
                      key={`dot-${di}-${fi}`}
                      style={{ cursor: dragVisual ? 'grabbing' : 'grab' }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => handleDotPointerDown(e, di, fret)}
                      onMouseEnter={() => {
                        if (!dragRef.current) setHoveredKey(iKey);
                      }}
                      onMouseLeave={() => setHoveredKey(null)}
                    >
                      {/* Struggling pulsing red glow (P1.10) */}
                      {hasCompounds && status === 'struggling' && (
                        <circle
                          cx={x}
                          cy={y}
                          r={r + 6}
                          fill="none"
                          stroke="var(--status-struggling-border)"
                          strokeWidth={3}
                          className="struggling-pulse"
                        />
                      )}

                      {/* Expanded double-ring (P1.10) */}
                      {hasCompounds && status === 'expanded' && (
                        <circle
                          cx={x}
                          cy={y}
                          r={r + 3}
                          fill="none"
                          stroke="var(--status-expanded-border)"
                          strokeWidth={1}
                          opacity={0.3}
                        />
                      )}

                      {/* Neighbor dashed ring */}
                      {isNbr && (
                        <circle
                          cx={x}
                          cy={y}
                          r={r + 4}
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
                          r={r + 4}
                          fill="none"
                          stroke="rgba(255,255,255,0.8)"
                          strokeWidth={2.5}
                        />
                      )}

                      {/* Main dot */}
                      <circle
                        cx={x}
                        cy={y}
                        r={r}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={sw}
                        strokeDasharray={dash}
                        opacity={dotOpacity}
                      />

                      {/* Mastered checkmark badge (P1.10) */}
                      {hasCompounds && status === 'mastered' && (
                        <path
                          d={`M${x + r * 0.1} ${y - r * 0.15} l${r * 0.2} ${r * 0.2} l${r * 0.35} ${-r * 0.35}`}
                          fill="none"
                          stroke="var(--status-mastered-border)"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          pointerEvents="none"
                        />
                      )}

                      {/* Label inside dot (P0.1) */}
                      <text
                        x={x}
                        y={y + (hasCompounds && status === 'mastered' ? 2 : 3.5)}
                        fill={hasCompounds ? 'var(--text-primary)' : 'var(--text-muted)'}
                        fontSize={9}
                        fontWeight={700}
                        textAnchor="middle"
                        fontFamily="var(--font-family, sans-serif)"
                        pointerEvents="none"
                      >
                        {abbrev(dim.values[fret])}
                      </text>

                      {/* Hover tooltip */}
                      {isHovered && (
                        <g>
                          <rect
                            x={x - 80}
                            y={tooltipAbove ? tooltipY - 52 : tooltipY}
                            width={160}
                            height={50}
                            rx={6}
                            fill="var(--bg-elevated)"
                            stroke="var(--border)"
                            strokeWidth={1}
                          />
                          <text
                            x={x}
                            y={tooltipAbove ? tooltipY - 38 : tooltipY + 14}
                            fill="var(--text-primary)"
                            fontSize={11}
                            fontWeight={600}
                            textAnchor="middle"
                            fontFamily="var(--font-family, sans-serif)"
                          >
                            {formatName(dim.values[fret])}
                          </text>
                          <text
                            x={x}
                            y={tooltipAbove ? tooltipY - 24 : tooltipY + 28}
                            fill="var(--text-muted)"
                            fontSize={9}
                            textAnchor="middle"
                            fontFamily="var(--font-family, sans-serif)"
                          >
                            {hasCompounds
                              ? `${data!.nodes.length} compound${data!.nodes.length > 1 ? 's' : ''} \u00b7 ${data!.nodes[0].data.lastBpm > 0 ? `${data!.nodes[0].data.lastBpm} BPM` : status}`
                              : 'Unpracticed'}
                          </text>
                          <text
                            x={x}
                            y={tooltipAbove ? tooltipY - 10 : tooltipY + 42}
                            fill="var(--text-muted)"
                            fontSize={8}
                            textAnchor="middle"
                            fontFamily="var(--font-family, sans-serif)"
                            opacity={0.7}
                          >
                            Click or drag to switch {dim.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                }),
              )}

              {/* Drag: floating dot follows cursor, snap ring shows target */}
              {dragVisual && (() => {
                const dy = stringY(dragVisual.dimIndex);
                const snapX = fretX(dragVisual.currentFret);
                const dim = DIMENSIONS[dragVisual.dimIndex];
                const r = DOT_RADIUS.selected;
                return (
                  <g pointerEvents="none">
                    {/* Snap target ring */}
                    <circle
                      cx={snapX}
                      cy={dy}
                      r={r + 6}
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth={2}
                      opacity={0.5}
                      strokeDasharray="4,3"
                    />
                    {/* Floating dot at cursor position */}
                    <circle
                      cx={dragVisual.cursorX}
                      cy={dy}
                      r={r}
                      fill="var(--status-practicing-bg)"
                      stroke="rgba(255,255,255,0.8)"
                      strokeWidth={2.5}
                      opacity={0.9}
                    />
                    {/* Label on floating dot */}
                    <text
                      x={dragVisual.cursorX}
                      y={dy + 3.5}
                      fill="var(--text-primary)"
                      fontSize={9}
                      fontWeight={700}
                      textAnchor="middle"
                      fontFamily="var(--font-family, sans-serif)"
                    >
                      {abbrev(dim.values[dragVisual.currentFret])}
                    </text>
                  </g>
                );
              })()}
            </g>
          </g>
        </svg>
      </div>

      {/* Legend (P2.12 - expanded) */}
      <div
        className="flex flex-wrap items-center justify-center gap-4 px-4 py-2 text-xs shrink-0"
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
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{
              border: '2.5px solid rgba(255,255,255,0.8)',
            }}
          />
          Selected
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{
              border: '1.5px dashed var(--accent-primary)',
            }}
          />
          Reachable
        </span>
      </div>
    </div>
  );
}
