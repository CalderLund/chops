import { useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';

import CompoundNode from './CompoundNode';
import type { GraphNode, GraphEdge } from '../../api/client';

export interface SkillGraphProps {
  initialNodes: GraphNode[];
  initialEdges: GraphEdge[];
  centerNodeId: string | null;
  recommendedNodeId?: string | null;
  selectedNodeId?: string | null;
  onNodeSelect?: (node: GraphNode | null) => void;
}

const nodeTypes: NodeTypes = {
  compound: CompoundNode,
};

// Edge colors read from CSS variables at render time
function getEdgeColor(dimension: string): string {
  const root = document.documentElement;
  const varName = `--edge-${dimension}`;
  const value = getComputedStyle(root).getPropertyValue(varName).trim();
  if (value) return value;
  const fallbacks: Record<string, string> = {
    scale: '#9B6DFF',
    position: '#4BA3C7',
    rhythm: '#D4A056',
    'note-pattern': '#E07BAD',
  };
  return fallbacks[dimension] || '#6B7280';
}

function getEdgeStyle(dimension: string, isPotential: boolean) {
  return {
    stroke: getEdgeColor(dimension),
    strokeWidth: isPotential ? 1 : 2,
    strokeDasharray: isPotential ? '5,5' : undefined,
  };
}

// Base compound dimensions for non-scale layer calculation
const BASE_COMPOUND = {
  position: 'E',
  rhythm: '8ths',
  notePattern: 'stepwise',
};

function getLayerFromNode(node: GraphNode): number {
  const scaleTier = node.data.scaleTier ?? 1;
  let otherChanges = 0;
  if (node.data.position !== BASE_COMPOUND.position) otherChanges++;
  if (node.data.rhythm !== BASE_COMPOUND.rhythm) otherChanges++;
  if ((node.data.notePattern || 'stepwise') !== BASE_COMPOUND.notePattern) otherChanges++;
  return (scaleTier - 1) * 3 + otherChanges;
}

function calculateRadialLayout(
  nodes: GraphNode[],
  focusedNodeId: string,
): { positions: Map<string, { x: number; y: number }>; distances: Map<string, number> } {
  const positions = new Map<string, { x: number; y: number }>();
  const distances = new Map<string, number>();

  positions.set(focusedNodeId, { x: 0, y: 0 });
  distances.set(focusedNodeId, 0);

  const neighbors = nodes.filter((n) => n.id !== focusedNodeId);
  if (neighbors.length === 0) return { positions, distances };

  // Radius scales with neighbor count so nodes don't overlap
  const nodeWidth = 100;
  const minRadius = 140;
  const circumferenceRadius = (neighbors.length * nodeWidth) / (2 * Math.PI);
  const radius = Math.max(minRadius, circumferenceRadius);

  const startAngle = -Math.PI / 2;
  const angleStep = (2 * Math.PI) / neighbors.length;

  for (let i = 0; i < neighbors.length; i++) {
    const angle = startAngle + i * angleStep;
    positions.set(neighbors[i].id, {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    });
    distances.set(neighbors[i].id, 1);
  }

  return { positions, distances };
}

function calculateDagreLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  centerNodeId: string | null,
  focusedNodeId: string | null,
): { positions: Map<string, { x: number; y: number }>; distances: Map<string, number> } {
  const positions = new Map<string, { x: number; y: number }>();
  const distances = new Map<string, number>();

  if (nodes.length === 0) {
    return { positions, distances };
  }

  const layers = new Map<string, number>();
  for (const node of nodes) {
    const layer = getLayerFromNode(node);
    layers.set(node.id, layer);
    distances.set(node.id, layer);
  }

  const rootStyle = getComputedStyle(document.documentElement);
  const nodesep = parseInt(rootStyle.getPropertyValue('--graph-nodesep').trim(), 10) || 30;
  const ranksep = parseInt(rootStyle.getPropertyValue('--graph-ranksep').trim(), 10) || 80;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'TB',
    nodesep,
    ranksep,
    marginx: 30,
    marginy: 30,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    const isFocused = node.id === focusedNodeId;
    g.setNode(node.id, {
      width: isFocused ? 200 : 93,
      height: isFocused ? 75 : 40,
    });
  }

  for (const edge of edges) {
    const sourceLayer = layers.get(edge.source) || 0;
    const targetLayer = layers.get(edge.target) || 0;
    if (sourceLayer <= targetLayer) {
      g.setEdge(edge.source, edge.target);
    } else {
      g.setEdge(edge.target, edge.source);
    }
  }

  dagre.layout(g);

  for (const node of nodes) {
    const dagreNode = g.node(node.id);
    if (dagreNode) {
      positions.set(node.id, { x: dagreNode.x, y: dagreNode.y });
    }
  }

  // BFS from center for distances
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  const practicedNodes = nodes.filter((n) => n.data.attempts > 0);
  const centerId =
    centerNodeId && nodes.find((n) => n.id === centerNodeId)
      ? centerNodeId
      : practicedNodes[0]?.id || nodes[0]?.id;

  if (centerId) {
    const visited = new Set<string>();
    const queue: { id: string; dist: number }[] = [{ id: centerId, dist: 0 }];
    visited.add(centerId);

    while (queue.length > 0) {
      const { id, dist } = queue.shift()!;
      distances.set(id, dist);

      const neighbors = adjacency.get(id) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ id: neighbor, dist: dist + 1 });
        }
      }
    }

    for (const node of nodes) {
      if (!distances.has(node.id)) {
        distances.set(node.id, 999);
      }
    }
  }

  return { positions, distances };
}

function SkillGraphInner({
  initialNodes,
  initialEdges,
  centerNodeId,
  recommendedNodeId,
  selectedNodeId,
  onNodeSelect,
}: SkillGraphProps) {
  const { setCenter } = useReactFlow();
  const prevSelectedRef = useRef<string | null>(null);

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

  const focusedNodeId = selectedNodeId || centerNodeId;

  const hiddenNodeIds = useMemo(() => {
    const focusedNeighbors = focusedNodeId
      ? (neighborMap.get(focusedNodeId) ?? new Set<string>())
      : new Set<string>();
    const hidden = new Set<string>();
    for (const node of initialNodes) {
      if (node.id !== focusedNodeId && !focusedNeighbors.has(node.id)) {
        // When user has selected a node, hide ALL non-neighbors (practiced or not)
        // to show only the minimal 1-hop neighborhood.
        // When no selection (default view), only hide unpracticed non-neighbors.
        if (selectedNodeId || node.data.attempts === 0) {
          hidden.add(node.id);
        }
      }
    }
    return hidden;
  }, [initialNodes, focusedNodeId, neighborMap, selectedNodeId]);

  const visibleNodes = useMemo(
    () => initialNodes.filter((n) => !hiddenNodeIds.has(n.id)),
    [initialNodes, hiddenNodeIds],
  );
  const visibleEdges = useMemo(
    () =>
      initialEdges.filter(
        (e) => !hiddenNodeIds.has(e.source) && !hiddenNodeIds.has(e.target),
      ),
    [initialEdges, hiddenNodeIds],
  );

  const detailFocusId = selectedNodeId || recommendedNodeId || centerNodeId;
  const detailFocusNode = detailFocusId
    ? visibleNodes.find((n) => n.id === detailFocusId) ?? null
    : null;

  const { positions } = useMemo(() => {
    if (selectedNodeId && detailFocusId) {
      return calculateRadialLayout(visibleNodes, detailFocusId);
    }
    return calculateDagreLayout(visibleNodes, visibleEdges, centerNodeId, detailFocusId);
  }, [visibleNodes, visibleEdges, centerNodeId, detailFocusId, selectedNodeId]);

  const visibleNeighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const edge of visibleEdges) {
      if (!map.has(edge.source)) map.set(edge.source, new Set());
      if (!map.has(edge.target)) map.set(edge.target, new Set());
      map.get(edge.source)!.add(edge.target);
      map.get(edge.target)!.add(edge.source);
    }
    return map;
  }, [visibleEdges]);

  // BFS parent map: each node's reference is its nearest ancestor toward the focused node
  // This gives incremental diff labels (1 dimension change per hop) instead of cumulative diffs
  const parentDataMap = useMemo(() => {
    const map = new Map<string, GraphNode['data']>();
    if (!detailFocusId) return map;

    const visited = new Set<string>();
    const queue: string[] = [detailFocusId];
    visited.add(detailFocusId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentNode = visibleNodes.find((n) => n.id === currentId);
      if (!currentNode) continue;

      const neighbors = visibleNeighborMap.get(currentId) ?? new Set<string>();
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          map.set(neighborId, currentNode.data);
          queue.push(neighborId);
        }
      }
    }

    return map;
  }, [detailFocusId, visibleNodes, visibleNeighborMap]);

  useEffect(() => {
    if (selectedNodeId && selectedNodeId !== prevSelectedRef.current) {
      const pos = positions.get(selectedNodeId);
      if (pos) {
        setCenter(pos.x, pos.y, { zoom: 0.9, duration: 300 });
      }
      prevSelectedRef.current = selectedNodeId;
    } else if (!selectedNodeId) {
      prevSelectedRef.current = null;
    }
  }, [selectedNodeId, positions, setCenter]);

  const initialCenterDone = useRef(false);
  useEffect(() => {
    if (!initialCenterDone.current && recommendedNodeId) {
      const pos = positions.get(recommendedNodeId);
      if (pos) {
        setCenter(pos.x, pos.y, { zoom: 0.9, duration: 500 });
        initialCenterDone.current = true;
      }
    }
  }, [recommendedNodeId, positions, setCenter]);

  const flowNodes = useMemo(
    () =>
      visibleNodes.map((node) => {
        const pos = positions.get(node.id) || { x: 0, y: 0 };

        const isSelected = selectedNodeId === node.id;
        const isNeighborOfSelected = selectedNodeId
          ? (visibleNeighborMap.get(selectedNodeId)?.has(node.id) ?? false)
          : false;
        const isRecommended =
          recommendedNodeId === node.id &&
          (!selectedNodeId || selectedNodeId === recommendedNodeId);
        const isDimmedBySelection =
          !!selectedNodeId && !isSelected && !isNeighborOfSelected;

        // Determine if this node is above the focused node (for hover direction)
        const focusedPos = detailFocusId ? positions.get(detailFocusId) : null;
        const isAboveFocused = focusedPos ? pos.y < focusedPos.y : false;

        return {
          id: node.id,
          type: 'compound',
          position: pos,
          zIndex: isSelected ? 2000 : isRecommended ? 1500 : 1000,
          data: {
            ...node.data,
            isCenter: node.id === centerNodeId,
            isSelected,
            isNeighborOfSelected,
            isRecommended,
            isDimmedBySelection,
            isFocused: node.id === detailFocusId,
            focusedScale: (parentDataMap.get(node.id) ?? detailFocusNode?.data)?.scale,
            focusedPosition: (parentDataMap.get(node.id) ?? detailFocusNode?.data)?.position,
            focusedRhythm: (parentDataMap.get(node.id) ?? detailFocusNode?.data)?.rhythm,
            focusedNotePattern: (parentDataMap.get(node.id) ?? detailFocusNode?.data)?.notePattern,
            isAboveFocused,
          },
        };
      }),
    [
      visibleNodes,
      positions,
      centerNodeId,
      selectedNodeId,
      recommendedNodeId,
      visibleNeighborMap,
      detailFocusId,
      detailFocusNode,
      parentDataMap,
    ],
  );

  const flowEdges = useMemo(
    () =>
      visibleEdges.map((edge) => {
        const isPotential = edge.style?.strokeDasharray !== undefined;

        const sourceNode = visibleNodes.find((n) => n.id === edge.source);
        const targetNode = visibleNodes.find((n) => n.id === edge.target);
        const sourceLayer = sourceNode ? getLayerFromNode(sourceNode) : 0;
        const targetLayer = targetNode ? getLayerFromNode(targetNode) : 0;

        const [actualSource, actualTarget] =
          sourceLayer <= targetLayer ? [edge.source, edge.target] : [edge.target, edge.source];

        const baseStyle: Record<string, string | number | undefined> = getEdgeStyle(
          edge.data.dimension,
          isPotential,
        );
        if (selectedNodeId) {
          const selectedNeighbors = visibleNeighborMap.get(selectedNodeId);
          const isConnectedToSelected =
            edge.source === selectedNodeId ||
            edge.target === selectedNodeId ||
            (selectedNeighbors?.has(edge.source) && selectedNeighbors?.has(edge.target));
          if (!isConnectedToSelected) {
            baseStyle.strokeWidth = 1;
            baseStyle.opacity = 0.15;
          }
        }

        return {
          id: edge.id,
          source: actualSource,
          target: actualTarget,
          type: 'straight',
          style: baseStyle,
          data: edge.data,
        };
      }),
    [visibleEdges, visibleNodes, selectedNodeId, visibleNeighborMap],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const graphNode = initialNodes.find((n) => n.id === node.id);
      if (onNodeSelect) {
        onNodeSelect(graphNode ?? null);
      }
    },
    [initialNodes, onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    if (onNodeSelect) {
      onNodeSelect(null);
    }
  }, [onNodeSelect]);

  return (
    <div
      className="relative w-full h-full [&_.react-flow__edges]:!z-0 [&_.react-flow__nodes]:!z-10"
      style={{ backgroundImage: 'var(--graph-bg-effect)' }}
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'straight',
        }}
      >
        <Background color="var(--graph-dot, #374151)" gap={20} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as GraphNode['data'];
            const root = document.documentElement;
            const style = getComputedStyle(root);
            switch (data.status) {
              case 'mastered':
                return style.getPropertyValue('--status-mastered-border').trim() || '#10B981';
              case 'expanded':
                return style.getPropertyValue('--status-expanded-border').trim() || '#06B6D4';
              case 'practicing':
                return style.getPropertyValue('--status-practicing-border').trim() || '#F59E0B';
              case 'struggling':
                return style.getPropertyValue('--status-struggling-border').trim() || '#EF4444';
              default:
                return style.getPropertyValue('--text-muted').trim() || '#6B7280';
            }
          }}
        />
      </ReactFlow>
    </div>
  );
}

export default SkillGraphInner;
