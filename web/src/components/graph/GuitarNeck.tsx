import { useMemo, useState, useCallback } from 'react';
import type { GraphNode, GraphEdge } from '../../api/client';

export interface GuitarNeckProps {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  centerNodeId: string | null;
  recommendedNodeId: string | null;
  selectedNodeId: string | null;
  candidateScores: Map<string, number>;
  onNodeSelect: (node: GraphNode | null) => void;
}

// CAGED position order (top to bottom on the fretboard)
const POSITION_ORDER = ['E', 'D', 'C', 'A', 'G'];

// Entry compound values for computing layer (distance from entry point)
const ENTRY_COMPOUND = {
  scale: 'pentatonic',
  position: 'E',
  rhythm: '8ths',
  notePattern: 'stepwise',
};

function getLayer(node: GraphNode): number {
  let changes = 0;
  if (node.data.scale !== ENTRY_COMPOUND.scale) changes++;
  if (node.data.position !== ENTRY_COMPOUND.position) changes++;
  if (node.data.rhythm !== ENTRY_COMPOUND.rhythm) changes++;
  if ((node.data.notePattern || 'stepwise') !== ENTRY_COMPOUND.notePattern) changes++;
  return changes;
}

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

function getDimensionColor(dimension: string): string {
  switch (dimension) {
    case 'scale': return 'var(--edge-scale)';
    case 'position': return 'var(--edge-position)';
    case 'rhythm': return 'var(--edge-rhythm)';
    case 'note-pattern': return 'var(--edge-note-pattern)';
    default: return 'var(--text-muted)';
  }
}

interface PlacedNode {
  node: GraphNode;
  row: number;
  col: number;
  x: number;
  y: number;
}

// Layout constants
const PADDING_LEFT = 60;
const PADDING_TOP = 50;
const STRING_SPACING = 60;
const FRET_WIDTH = 120;
const NODE_RADIUS = 14;
const NUT_X = PADDING_LEFT;

export default function GuitarNeck({
  initialNodes,
  initialEdges,
  centerNodeId: _centerNodeId,
  recommendedNodeId,
  selectedNodeId,
  candidateScores,
  onNodeSelect,
}: GuitarNeckProps) {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Build neighbor map from edges
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of initialEdges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [initialEdges]);

  // Build edge dimension lookup (for coloring hover connections)
  const edgeDimensionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of initialEdges) {
      const key1 = `${edge.source}::${edge.target}`;
      const key2 = `${edge.target}::${edge.source}`;
      map.set(key1, edge.data.dimension);
      map.set(key2, edge.data.dimension);
    }
    return map;
  }, [initialEdges]);

  // Compute placed nodes
  const { placedNodes, maxCol, nodeById } = useMemo(() => {
    // Group nodes by (row, col)
    const cellMap = new Map<string, GraphNode[]>();
    const nodeMap = new Map<string, GraphNode>();

    for (const node of initialNodes) {
      nodeMap.set(node.id, node);
      const row = POSITION_ORDER.indexOf(node.data.position);
      const col = getLayer(node);
      const cellKey = `${row}:${col}`;
      if (!cellMap.has(cellKey)) cellMap.set(cellKey, []);
      cellMap.get(cellKey)!.push(node);
    }

    let maxC = 0;
    const placed: PlacedNode[] = [];

    for (const [cellKey, cellNodes] of cellMap) {
      const [rowStr, colStr] = cellKey.split(':');
      const row = parseInt(rowStr, 10);
      const col = parseInt(colStr, 10);
      if (col > maxC) maxC = col;

      // Center of fret intersection
      const cx = NUT_X + (col + 0.5) * FRET_WIDTH;
      const cy = PADDING_TOP + row * STRING_SPACING;

      if (cellNodes.length <= 3) {
        // Spread nodes within the cell
        const spread = 20;
        const startOffset = -((cellNodes.length - 1) * spread) / 2;
        for (let i = 0; i < cellNodes.length; i++) {
          placed.push({
            node: cellNodes[i],
            row,
            col,
            x: cx + startOffset + i * spread,
            y: cy,
          });
        }
      } else {
        // Show first 2, then a count badge
        placed.push({ node: cellNodes[0], row, col, x: cx - 16, y: cy });
        placed.push({ node: cellNodes[1], row, col, x: cx + 16, y: cy });
        // The rest are represented by a count badge (handled in render)
        for (let i = 2; i < cellNodes.length; i++) {
          placed.push({ node: cellNodes[i], row, col, x: cx + 16, y: cy });
        }
      }
    }

    return { placedNodes: placed, maxCol: maxC, nodeById: nodeMap };
  }, [initialNodes]);

  // Determine which node is hovered or selected, and its neighbors
  const activeNodeId = hoveredNodeId || selectedNodeId;
  const activeNeighborIds = useMemo(() => {
    if (!activeNodeId) return new Set<string>();
    return neighborMap.get(activeNodeId) || new Set<string>();
  }, [activeNodeId, neighborMap]);

  // SVG dimensions
  const totalFrets = maxCol + 1;
  const svgWidth = PADDING_LEFT + (totalFrets + 0.5) * FRET_WIDTH + 40;
  const svgHeight = PADDING_TOP + (POSITION_ORDER.length - 1) * STRING_SPACING + 50;

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      const node = nodeById.get(nodeId);
      if (node) {
        // Toggle: clicking the already-selected node deselects it
        if (selectedNodeId === nodeId) {
          onNodeSelect(null);
        } else {
          onNodeSelect(node);
        }
      }
    },
    [nodeById, selectedNodeId, onNodeSelect],
  );

  const handleBackgroundClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  // Lookup for placed node positions by ID (for connections)
  const positionById = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const pn of placedNodes) {
      // Keep first position for each node (in case of stacking)
      if (!map.has(pn.node.id)) {
        map.set(pn.node.id, { x: pn.x, y: pn.y });
      }
    }
    return map;
  }, [placedNodes]);

  // Connection lines to draw when a node is active
  const connectionLines = useMemo(() => {
    if (!activeNodeId) return [];
    const activePos = positionById.get(activeNodeId);
    if (!activePos) return [];

    const lines: { x1: number; y1: number; x2: number; y2: number; color: string }[] = [];
    for (const neighborId of activeNeighborIds) {
      const nPos = positionById.get(neighborId);
      if (nPos) {
        const dim = edgeDimensionMap.get(`${activeNodeId}::${neighborId}`) || 'scale';
        lines.push({
          x1: activePos.x,
          y1: activePos.y,
          x2: nPos.x,
          y2: nPos.y,
          color: getDimensionColor(dim),
        });
      }
    }
    return lines;
  }, [activeNodeId, activeNeighborIds, positionById, edgeDimensionMap]);

  // Track which cells have 4+ nodes (for count badge)
  const cellCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of initialNodes) {
      const row = POSITION_ORDER.indexOf(node.data.position);
      const col = getLayer(node);
      const key = `${row}:${col}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [initialNodes]);

  // Track which cell count badges have been rendered
  const renderedBadges = new Set<string>();

  return (
    <div
      className="w-full h-full overflow-auto"
      style={{ backgroundColor: 'var(--fretboard-wood, var(--bg-deep))' }}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        width={svgWidth}
        height={svgHeight}
        className="block"
        style={{ minWidth: svgWidth, minHeight: svgHeight }}
      >
        {/* Background click target */}
        <rect
          x="0"
          y="0"
          width={svgWidth}
          height={svgHeight}
          fill="transparent"
          onClick={handleBackgroundClick}
        />

        {/* Nut (thick leftmost vertical line) */}
        <line
          x1={NUT_X}
          y1={PADDING_TOP - 12}
          x2={NUT_X}
          y2={PADDING_TOP + (POSITION_ORDER.length - 1) * STRING_SPACING + 12}
          stroke="var(--fretboard-nut, #F5E6D3)"
          strokeWidth={5}
          strokeLinecap="round"
        />

        {/* Fret wires (vertical lines) */}
        {Array.from({ length: totalFrets + 1 }, (_, i) => {
          const x = NUT_X + (i + 1) * FRET_WIDTH;
          return (
            <line
              key={`fret-${i}`}
              x1={x}
              y1={PADDING_TOP - 10}
              x2={x}
              y2={PADDING_TOP + (POSITION_ORDER.length - 1) * STRING_SPACING + 10}
              stroke="var(--fretboard-fret, #D4A056)"
              strokeWidth={1.5}
              opacity={0.5}
            />
          );
        })}

        {/* Strings (horizontal lines, thicker at bottom) */}
        {POSITION_ORDER.map((_, i) => {
          const y = PADDING_TOP + i * STRING_SPACING;
          const thickness = 1 + i * 0.4;
          return (
            <line
              key={`string-${i}`}
              x1={NUT_X - 2}
              y1={y}
              x2={svgWidth - 20}
              y2={y}
              stroke="var(--fretboard-string, #C0C0C0)"
              strokeWidth={thickness}
              opacity={0.6}
            />
          );
        })}

        {/* Position labels (left side) */}
        {POSITION_ORDER.map((pos, i) => {
          const y = PADDING_TOP + i * STRING_SPACING;
          return (
            <text
              key={`label-${pos}`}
              x={PADDING_LEFT - 24}
              y={y + 5}
              fill="var(--text-secondary)"
              fontSize={13}
              fontWeight={600}
              textAnchor="middle"
              fontFamily="var(--font-family, sans-serif)"
            >
              {pos}
            </text>
          );
        })}

        {/* Fret numbers (top) */}
        {Array.from({ length: totalFrets }, (_, i) => {
          const x = NUT_X + (i + 0.5) * FRET_WIDTH;
          return (
            <text
              key={`fretnum-${i}`}
              x={x}
              y={PADDING_TOP - 24}
              fill="var(--text-muted)"
              fontSize={11}
              textAnchor="middle"
              fontFamily="var(--font-family, sans-serif)"
            >
              {i}
            </text>
          );
        })}

        {/* Connection lines (hover/select reveal) */}
        {connectionLines.map((line, i) => (
          <line
            key={`conn-${i}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.color}
            strokeWidth={2}
            strokeOpacity={0.6}
            strokeLinecap="round"
          />
        ))}

        {/* Nodes */}
        {placedNodes.map((pn) => {
          const { node, row, col, x, y } = pn;
          const isSelected = selectedNodeId === node.id;
          const isRecommended = recommendedNodeId === node.id;
          const isHovered = hoveredNodeId === node.id;
          const isActiveNeighbor = activeNeighborIds.has(node.id);
          const probability = candidateScores.get(node.id);
          const cellKey = `${row}:${col}`;
          const cellCount = cellCounts.get(cellKey) || 0;

          // If there are 4+ nodes in this cell and this is the 3rd+ node, render a badge once
          if (cellCount >= 4) {
            const idx = placedNodes.filter(
              (p) => `${p.row}:${p.col}` === cellKey,
            ).indexOf(pn);
            if (idx >= 2) {
              // Render count badge only once
              if (!renderedBadges.has(cellKey)) {
                renderedBadges.add(cellKey);
                const badgeX = NUT_X + (col + 0.5) * FRET_WIDTH + 26;
                const badgeY = PADDING_TOP + row * STRING_SPACING;
                return (
                  <g key={`badge-${cellKey}`}>
                    <circle
                      cx={badgeX}
                      cy={badgeY - 10}
                      r={9}
                      fill="var(--bg-elevated)"
                      stroke="var(--border)"
                      strokeWidth={1}
                    />
                    <text
                      x={badgeX}
                      y={badgeY - 6}
                      fill="var(--text-secondary)"
                      fontSize={9}
                      fontWeight={700}
                      textAnchor="middle"
                      fontFamily="var(--font-family, sans-serif)"
                    >
                      +{cellCount - 2}
                    </text>
                  </g>
                );
              }
              return null; // Hide additional stacked nodes
            }
          }

          const fillColor = getStatusColor(node.data.status, 'fill');
          const strokeColor = getStatusColor(node.data.status, 'stroke');
          const nodeOpacity = node.data.status === 'unpracticed' ? 0.7 : 1;
          const strokeWidth =
            node.data.status === 'expanded' || node.data.status === 'mastered' || node.data.status === 'struggling'
              ? 2.5
              : 1.5;

          return (
            <g
              key={node.id}
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                handleNodeClick(node.id);
              }}
              onMouseEnter={() => setHoveredNodeId(node.id)}
              onMouseLeave={() => setHoveredNodeId(null)}
            >
              {/* Recommended pulsing ring */}
              {isRecommended && (
                <circle
                  cx={x}
                  cy={y}
                  r={NODE_RADIUS + 5}
                  fill="none"
                  stroke="var(--accent-primary)"
                  strokeWidth={2}
                  opacity={0.8}
                >
                  <animate
                    attributeName="r"
                    values={`${NODE_RADIUS + 4};${NODE_RADIUS + 8};${NODE_RADIUS + 4}`}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.8;0.3;0.8"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}

              {/* Selected ring */}
              {isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r={NODE_RADIUS + 3}
                  fill="none"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth={2}
                />
              )}

              {/* Active neighbor glow */}
              {isActiveNeighbor && !isSelected && (
                <circle
                  cx={x}
                  cy={y}
                  r={NODE_RADIUS + 3}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              )}

              {/* Main node circle */}
              <circle
                cx={x}
                cy={y}
                r={NODE_RADIUS}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={node.data.status === 'unpracticed' ? '3,2' : undefined}
                opacity={nodeOpacity}
              />

              {/* Tooltip on hover */}
              {isHovered && (
                <g>
                  <rect
                    x={x - 55}
                    y={y - NODE_RADIUS - 38}
                    width={110}
                    height={30}
                    rx={6}
                    fill="var(--bg-elevated)"
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={y - NODE_RADIUS - 25}
                    fill="var(--text-primary)"
                    fontSize={10}
                    fontWeight={600}
                    textAnchor="middle"
                    fontFamily="var(--font-family, sans-serif)"
                  >
                    {node.data.scale} / {node.data.position} / {node.data.rhythm}
                  </text>
                  <text
                    x={x}
                    y={y - NODE_RADIUS - 13}
                    fill="var(--text-muted)"
                    fontSize={9}
                    textAnchor="middle"
                    fontFamily="var(--font-family, sans-serif)"
                  >
                    {node.data.attempts > 0
                      ? `${node.data.attempts}x | ${node.data.lastBpm} BPM`
                      : 'Not practiced'}
                    {probability != null && probability > 0 ? ` | ${Math.round(probability * 100)}%` : ''}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
