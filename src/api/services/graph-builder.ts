import { CompoundStats, Settings } from '../../types.js';
import { Repository } from '../../db/repository.js';
import { RhythmDimension } from '../../dimensions/rhythm/index.js';
import { ScaleDimension } from '../../dimensions/scale/index.js';
import { PositionDimension } from '../../dimensions/position/index.js';
import { NotePatternDimension } from '../../dimensions/note-pattern/index.js';
import { DimensionRegistry } from '../../dimensions/registry.js';

export type DimensionsParam =
  | {
      rhythmDim: RhythmDimension;
      scaleDim: ScaleDimension;
      positionDim: PositionDimension;
      notePatternDim: NotePatternDimension;
    }
  | DimensionRegistry;

function resolveDimensions(dims: DimensionsParam) {
  if (dims instanceof DimensionRegistry) {
    return {
      rhythmDim: dims.rhythmDim,
      scaleDim: dims.scaleDim,
      positionDim: dims.positionDim,
      notePatternDim: dims.notePatternDim,
    };
  }
  return dims;
}

export interface GraphNode {
  id: string;
  type: 'compound';
  data: {
    id: string;
    label: string;
    scale: string;
    position: string;
    rhythm: string;
    rhythmPattern: string;
    notePattern: string | null;
    bestNpm: number;
    lastNpm: number;
    lastBpm: number;
    attempts: number;
    status: 'unpracticed' | 'practicing' | 'expanded' | 'mastered' | 'struggling';
    hasExpanded: boolean;
    isMastered: boolean;
    strugglingStreak: number;
    lastPracticed: string | null;
    scaleTier?: number;
    scaleTonality?: string;
    scaleUses?: string;
  };
  position: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'smoothstep';
  data: {
    dimension: 'scale' | 'position' | 'rhythm' | 'note-pattern';
    direction: 'forward' | 'backward' | 'lateral';
  };
  animated?: boolean;
  style?: Record<string, string | number>;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNodeId: string | null; // Most recently practiced node
}

// Determine node status based on stats
function getNodeStatus(
  stats: CompoundStats | null,
  _settings: Settings,
): GraphNode['data']['status'] {
  if (!stats || stats.attempts === 0) return 'unpracticed';
  if (stats.isMastered) return 'mastered';
  if (stats.strugglingStreak > 0) return 'struggling';
  if (stats.hasExpanded) return 'expanded';
  return 'practicing';
}

// Create a label for the compound
function createLabel(compound: CompoundStats): string {
  const parts = [compound.scale, compound.position, compound.rhythm];
  if (compound.notePattern) {
    parts.push(compound.notePattern);
  }
  return parts.join(' / ');
}

// Check if two compounds differ by exactly one dimension
function getDimensionChange(
  a: CompoundStats,
  b: CompoundStats,
): 'scale' | 'position' | 'rhythm' | 'note-pattern' | null {
  let changes = 0;
  let changedDimension: 'scale' | 'position' | 'rhythm' | 'note-pattern' | null = null;

  if (a.scale !== b.scale) {
    changes++;
    changedDimension = 'scale';
  }
  if (a.position !== b.position) {
    changes++;
    changedDimension = 'position';
  }
  if (a.rhythm !== b.rhythm || a.rhythmPattern !== b.rhythmPattern) {
    changes++;
    changedDimension = 'rhythm';
  }
  if (a.notePattern !== b.notePattern) {
    changes++;
    changedDimension = 'note-pattern';
  }

  return changes === 1 ? changedDimension : null;
}

// Check if a dimension change is a valid neighbor relationship
function isValidNeighbor(
  dimension: 'scale' | 'position' | 'rhythm' | 'note-pattern',
  valueA: string,
  valueB: string,
  dimensions: {
    rhythmDim: RhythmDimension;
    scaleDim: ScaleDimension;
    positionDim: PositionDimension;
    notePatternDim: NotePatternDimension;
  },
): boolean {
  switch (dimension) {
    case 'scale': {
      const sig = { dimension: 'scale' as const, scale: valueA };
      const neighbors = dimensions.scaleDim.getNeighbors(sig);
      return neighbors.some((n) => n.scale === valueB);
    }
    case 'position': {
      const sig = { dimension: 'position' as const, position: valueA };
      const neighbors = dimensions.positionDim.getNeighbors(sig);
      return neighbors.some((n) => n.position === valueB);
    }
    case 'rhythm': {
      // For rhythm, we need to check both rhythm name and pattern
      // This is a simplification - in practice we might need the full signature
      return true; // Accept all rhythm changes for now
    }
    case 'note-pattern': {
      if (!valueA || !valueB) return false;
      const sig = { dimension: 'note-pattern' as const, pattern: valueA };
      const neighbors = dimensions.notePatternDim.getNeighbors(sig);
      return neighbors.some((n) => n.pattern === valueB);
    }
  }
}

// Determine edge direction for a dimension change between two compounds
function getEdgeDirection(
  dimension: 'scale' | 'position' | 'rhythm' | 'note-pattern',
  valueA: string,
  valueB: string,
  dimensions: {
    rhythmDim: RhythmDimension;
    scaleDim: ScaleDimension;
    positionDim: PositionDimension;
    notePatternDim: NotePatternDimension;
  },
): 'forward' | 'backward' | 'lateral' {
  let aToB = false;
  let bToA = false;

  switch (dimension) {
    case 'scale': {
      const sigA = { dimension: 'scale' as const, scale: valueA };
      const sigB = { dimension: 'scale' as const, scale: valueB };
      aToB = dimensions.scaleDim.isForwardNeighbor(sigA, sigB);
      bToA = dimensions.scaleDim.isForwardNeighbor(sigB, sigA);
      break;
    }
    case 'position': {
      const sigA = { dimension: 'position' as const, position: valueA };
      const sigB = { dimension: 'position' as const, position: valueB };
      aToB = dimensions.positionDim.isForwardNeighbor(sigA, sigB);
      bToA = dimensions.positionDim.isForwardNeighbor(sigB, sigA);
      break;
    }
    case 'rhythm': {
      const sigA = { dimension: 'rhythm' as const, rhythm: valueA, pattern: '' };
      const sigB = { dimension: 'rhythm' as const, rhythm: valueB, pattern: '' };
      aToB = dimensions.rhythmDim.isForwardNeighbor(sigA, sigB);
      bToA = dimensions.rhythmDim.isForwardNeighbor(sigB, sigA);
      break;
    }
    case 'note-pattern': {
      if (!valueA || !valueB) return 'lateral';
      const sigA = { dimension: 'note-pattern' as const, pattern: valueA };
      const sigB = { dimension: 'note-pattern' as const, pattern: valueB };
      aToB = dimensions.notePatternDim.isForwardNeighbor(sigA, sigB);
      bToA = dimensions.notePatternDim.isForwardNeighbor(sigB, sigA);
      break;
    }
  }

  if (aToB && !bToA) return 'forward'; // A→B is forward
  if (bToA && !aToB) return 'backward'; // B→A is forward, so A→B is backward
  return 'lateral'; // Both directions or neither (e.g., same-tier note patterns)
}

// Transitive reduction: remove edge A→B if there's an alternative directed path A→...→B
// This eliminates visually redundant connections (e.g., A→C when A→B→C exists)
function transitiveReduce(edges: GraphEdge[]): GraphEdge[] {
  // Build directed adjacency list from all edges (source→target)
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    adj.get(edge.source)!.push(edge.target);
  }

  const redundant = new Set<string>();

  for (const edge of edges) {
    // BFS from source, skipping the direct edge to target, to find alternative path
    const visited = new Set<string>([edge.source]);
    const queue: string[] = [];

    for (const n of adj.get(edge.source) ?? []) {
      if (n !== edge.target && !visited.has(n)) {
        visited.add(n);
        queue.push(n);
      }
    }

    let found = false;
    while (queue.length > 0 && !found) {
      const current = queue.shift()!;
      for (const next of adj.get(current) ?? []) {
        if (next === edge.target) {
          found = true;
          break;
        }
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    if (found) redundant.add(edge.id);
  }

  return edges.filter((e) => !redundant.has(e.id));
}

// Build graph from compound stats
export function buildGraph(
  repo: Repository,
  settings: Settings,
  dimensions: DimensionsParam,
): GraphLayout {
  const dims = resolveDimensions(dimensions);
  const allCompounds = repo.getAllCompoundStats();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>(); // To avoid duplicate edges

  // Find the most recently practiced compound
  let centerNodeId: string | null = null;
  let mostRecentTime: Date | null = null;

  // Create nodes for all practiced compounds
  for (const compound of allCompounds) {
    const status = getNodeStatus(compound, settings);

    // Track most recently practiced
    if (compound.lastPracticed) {
      const lastTime = new Date(compound.lastPracticed);
      if (!mostRecentTime || lastTime > mostRecentTime) {
        mostRecentTime = lastTime;
        centerNodeId = compound.id;
      }
    }

    const scaleSig = { dimension: 'scale' as const, scale: compound.scale };
    nodes.push({
      id: compound.id,
      type: 'compound',
      data: {
        id: compound.id,
        label: createLabel(compound),
        scale: compound.scale,
        position: compound.position,
        rhythm: compound.rhythm,
        rhythmPattern: compound.rhythmPattern,
        notePattern: compound.notePattern,
        bestNpm: compound.bestNpm,
        lastNpm: compound.lastNpm,
        lastBpm: compound.lastBpm,
        attempts: compound.attempts,
        status,
        hasExpanded: compound.hasExpanded,
        isMastered: compound.isMastered,
        strugglingStreak: compound.strugglingStreak,
        lastPracticed: compound.lastPracticed,
        scaleTier: dims.scaleDim.getTier(scaleSig),
        scaleTonality: dims.scaleDim.getTonality(compound.scale),
        scaleUses: dims.scaleDim.getUses(compound.scale),
      },
      position: { x: 0, y: 0 }, // Will be calculated by layout algorithm
    });
  }

  // Create edges between neighboring compounds (differ by 1 dimension)
  for (let i = 0; i < allCompounds.length; i++) {
    for (let j = i + 1; j < allCompounds.length; j++) {
      const a = allCompounds[i];
      const b = allCompounds[j];

      const changedDimension = getDimensionChange(a, b);

      if (changedDimension) {
        // Verify it's a valid neighbor relationship
        let valueA: string;
        let valueB: string;

        switch (changedDimension) {
          case 'scale':
            valueA = a.scale;
            valueB = b.scale;
            break;
          case 'position':
            valueA = a.position;
            valueB = b.position;
            break;
          case 'rhythm':
            valueA = a.rhythm;
            valueB = b.rhythm;
            break;
          case 'note-pattern':
            valueA = a.notePattern || '';
            valueB = b.notePattern || '';
            break;
        }

        if (isValidNeighbor(changedDimension, valueA, valueB, dims)) {
          const edgeId = [a.id, b.id].sort().join('--');

          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            const direction = getEdgeDirection(changedDimension, valueA, valueB, dims);
            // For forward edges: source=A, target=B (A→B progression)
            // For backward edges: source=B, target=A (B→A is the forward direction)
            const source = direction === 'backward' ? b.id : a.id;
            const target = direction === 'backward' ? a.id : b.id;
            edges.push({
              id: edgeId,
              source,
              target,
              type: 'smoothstep',
              data: {
                dimension: changedDimension,
                direction: direction === 'backward' ? 'forward' : direction,
              },
            });
          }
        }
      }
    }
  }

  // If no center found, use first node
  if (!centerNodeId && nodes.length > 0) {
    centerNodeId = nodes[0].id;
  }

  // Remove redundant edges where an alternative multi-hop path exists
  const reducedEdges = transitiveReduce(edges);

  // Positions will be calculated client-side with radial layout
  return { nodes, edges: reducedEdges, centerNodeId };
}

// Build a potential graph including unpracticed neighbors of practiced compounds
export function buildExpandedGraph(
  repo: Repository,
  settings: Settings,
  dimensions: DimensionsParam,
): GraphLayout {
  const dims = resolveDimensions(dimensions);
  const baseGraph = buildGraph(repo, settings, dimensions);
  const allCompounds = repo.getAllCompoundStats();
  const existingIds = new Set(baseGraph.nodes.map((n) => n.id));
  const potentialNodes: GraphNode[] = [];
  const potentialEdges: GraphEdge[] = [];

  // Generate potential neighbors from all practiced compounds.
  // Each potential node gets exactly one edge (from the compound that first generates it).
  // The frontend filters visibility: only potential nodes adjacent to the selected/center
  // compound are shown, keeping the graph focused without losing data.
  for (const compound of allCompounds) {
    if (compound.attempts === 0) continue; // Skip unpracticed compounds

    // Generate potential neighbors for each dimension (forward-only)
    // Scale neighbors
    const currentScaleSig = { dimension: 'scale' as const, scale: compound.scale };
    const scaleNeighbors = dims.scaleDim.getNeighbors(currentScaleSig);
    for (const neighbor of scaleNeighbors) {
      if (!dims.scaleDim.isForwardNeighbor(currentScaleSig, neighbor)) continue;
      const potentialId = `${neighbor.scale}+${compound.position}+${compound.rhythm}:${compound.rhythmPattern}${
        compound.notePattern ? `+${compound.notePattern}` : ''
      }`;
      if (!existingIds.has(potentialId)) {
        existingIds.add(potentialId);
        potentialNodes.push({
          id: potentialId,
          type: 'compound',
          data: {
            id: potentialId,
            label: [neighbor.scale, compound.position, compound.rhythm, compound.notePattern]
              .filter(Boolean)
              .join(' / '),
            scale: neighbor.scale,
            position: compound.position,
            rhythm: compound.rhythm,
            rhythmPattern: compound.rhythmPattern,
            notePattern: compound.notePattern,
            bestNpm: 0,
            lastNpm: 0,
            lastBpm: 0,
            attempts: 0,
            status: 'unpracticed',
            hasExpanded: false,
            isMastered: false,
            strugglingStreak: 0,
            lastPracticed: null,
            scaleTier: dims.scaleDim.getTier(neighbor),
            scaleTonality: dims.scaleDim.getTonality(neighbor.scale),
            scaleUses: dims.scaleDim.getUses(neighbor.scale),
          },
          position: { x: 0, y: 0 },
        });

        potentialEdges.push({
          id: `${compound.id}--${potentialId}`,
          source: compound.id,
          target: potentialId,
          type: 'smoothstep',
          data: { dimension: 'scale', direction: 'forward' },
          style: { strokeDasharray: '5,5' }, // Dashed line for potential edges
        });
      }
    }

    // Position neighbors
    const currentPosSig = { dimension: 'position' as const, position: compound.position };
    const positionNeighbors = dims.positionDim.getNeighbors(currentPosSig);
    for (const neighbor of positionNeighbors) {
      if (!dims.positionDim.isForwardNeighbor(currentPosSig, neighbor)) continue;
      const potentialId = `${compound.scale}+${neighbor.position}+${compound.rhythm}:${compound.rhythmPattern}${
        compound.notePattern ? `+${compound.notePattern}` : ''
      }`;
      if (!existingIds.has(potentialId)) {
        existingIds.add(potentialId);
        const compoundScaleSig = { dimension: 'scale' as const, scale: compound.scale };
        potentialNodes.push({
          id: potentialId,
          type: 'compound',
          data: {
            id: potentialId,
            label: [compound.scale, neighbor.position, compound.rhythm, compound.notePattern]
              .filter(Boolean)
              .join(' / '),
            scale: compound.scale,
            position: neighbor.position,
            rhythm: compound.rhythm,
            rhythmPattern: compound.rhythmPattern,
            notePattern: compound.notePattern,
            bestNpm: 0,
            lastNpm: 0,
            lastBpm: 0,
            attempts: 0,
            status: 'unpracticed',
            hasExpanded: false,
            isMastered: false,
            strugglingStreak: 0,
            lastPracticed: null,
            scaleTier: dims.scaleDim.getTier(compoundScaleSig),
            scaleTonality: dims.scaleDim.getTonality(compound.scale),
            scaleUses: dims.scaleDim.getUses(compound.scale),
          },
          position: { x: 0, y: 0 },
        });

        potentialEdges.push({
          id: `${compound.id}--${potentialId}`,
          source: compound.id,
          target: potentialId,
          type: 'smoothstep',
          data: { dimension: 'position', direction: 'forward' },
          style: { strokeDasharray: '5,5' },
        });
      }
    }

    // Rhythm neighbors
    const currentRhythmSig = {
      dimension: 'rhythm' as const,
      rhythm: compound.rhythm,
      pattern: compound.rhythmPattern,
    };
    const rhythmNeighbors = dims.rhythmDim.getNeighbors(currentRhythmSig);
    for (const neighbor of rhythmNeighbors) {
      if (!dims.rhythmDim.isForwardNeighbor(currentRhythmSig, neighbor)) continue;
      const potentialId = `${compound.scale}+${compound.position}+${neighbor.rhythm}:${neighbor.pattern}${
        compound.notePattern ? `+${compound.notePattern}` : ''
      }`;
      if (!existingIds.has(potentialId)) {
        existingIds.add(potentialId);
        const compoundScaleSig2 = { dimension: 'scale' as const, scale: compound.scale };
        potentialNodes.push({
          id: potentialId,
          type: 'compound',
          data: {
            id: potentialId,
            label: [compound.scale, compound.position, neighbor.rhythm, compound.notePattern]
              .filter(Boolean)
              .join(' / '),
            scale: compound.scale,
            position: compound.position,
            rhythm: neighbor.rhythm,
            rhythmPattern: neighbor.pattern,
            notePattern: compound.notePattern,
            bestNpm: 0,
            lastNpm: 0,
            lastBpm: 0,
            attempts: 0,
            status: 'unpracticed',
            hasExpanded: false,
            isMastered: false,
            strugglingStreak: 0,
            lastPracticed: null,
            scaleTier: dims.scaleDim.getTier(compoundScaleSig2),
            scaleTonality: dims.scaleDim.getTonality(compound.scale),
            scaleUses: dims.scaleDim.getUses(compound.scale),
          },
          position: { x: 0, y: 0 },
        });

        potentialEdges.push({
          id: `${compound.id}--${potentialId}`,
          source: compound.id,
          target: potentialId,
          type: 'smoothstep',
          data: { dimension: 'rhythm', direction: 'forward' },
          style: { strokeDasharray: '5,5' },
        });
      }
    }

    // Note pattern neighbors (only if dimension is unlocked)
    if (compound.notePattern && repo.isDimensionUnlocked('note-pattern')) {
      const currentNpSig = { dimension: 'note-pattern' as const, pattern: compound.notePattern };
      const notePatternNeighbors = dims.notePatternDim.getNeighbors(currentNpSig);
      for (const neighbor of notePatternNeighbors) {
        if (!dims.notePatternDim.isForwardNeighbor(currentNpSig, neighbor)) continue;
        const potentialId = `${compound.scale}+${compound.position}+${compound.rhythm}:${compound.rhythmPattern}+${neighbor.pattern}`;
        if (!existingIds.has(potentialId)) {
          existingIds.add(potentialId);
          const compoundScaleSig3 = { dimension: 'scale' as const, scale: compound.scale };
          potentialNodes.push({
            id: potentialId,
            type: 'compound',
            data: {
              id: potentialId,
              label: [compound.scale, compound.position, compound.rhythm, neighbor.pattern]
                .filter(Boolean)
                .join(' / '),
              scale: compound.scale,
              position: compound.position,
              rhythm: compound.rhythm,
              rhythmPattern: compound.rhythmPattern,
              notePattern: neighbor.pattern,
              bestNpm: 0,
              lastNpm: 0,
              lastBpm: 0,
              attempts: 0,
              status: 'unpracticed',
              hasExpanded: false,
              isMastered: false,
              strugglingStreak: 0,
              lastPracticed: null,
              scaleTier: dims.scaleDim.getTier(compoundScaleSig3),
              scaleTonality: dims.scaleDim.getTonality(compound.scale),
              scaleUses: dims.scaleDim.getUses(compound.scale),
            },
            position: { x: 0, y: 0 },
          });

          potentialEdges.push({
            id: `${compound.id}--${potentialId}`,
            source: compound.id,
            target: potentialId,
            type: 'smoothstep',
            data: { dimension: 'note-pattern', direction: 'forward' },
            style: { strokeDasharray: '5,5' },
          });
        }
      }
    }
  }

  // Merge and re-layout
  const allNodes = [...baseGraph.nodes, ...potentialNodes];
  const allEdges = [...baseGraph.edges, ...potentialEdges];

  // Positions will be calculated client-side with radial layout
  return { nodes: allNodes, edges: allEdges, centerNodeId: baseGraph.centerNodeId };
}
