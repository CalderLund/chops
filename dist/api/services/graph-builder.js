import { DimensionRegistry } from '../../dimensions/registry.js';
function resolveDimensions(dims) {
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
// Determine node status based on stats
function getNodeStatus(stats, settings) {
    if (!stats || stats.attempts === 0)
        return 'unpracticed';
    if (stats.isMastered)
        return 'mastered';
    if (stats.strugglingStreak > 0)
        return 'struggling';
    if (stats.hasExpanded)
        return 'expanded';
    return 'practicing';
}
// Create a label for the compound
function createLabel(compound) {
    const parts = [compound.scale, compound.position, compound.rhythm];
    if (compound.notePattern) {
        parts.push(compound.notePattern);
    }
    return parts.join(' / ');
}
// Check if two compounds differ by exactly one dimension
function getDimensionChange(a, b) {
    let changes = 0;
    let changedDimension = null;
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
function isValidNeighbor(dimension, valueA, valueB, dimensions) {
    switch (dimension) {
        case 'scale': {
            const sig = { dimension: 'scale', scale: valueA };
            const neighbors = dimensions.scaleDim.getNeighbors(sig);
            return neighbors.some((n) => n.scale === valueB);
        }
        case 'position': {
            const sig = { dimension: 'position', position: valueA };
            const neighbors = dimensions.positionDim.getNeighbors(sig);
            return neighbors.some((n) => n.position === valueB);
        }
        case 'rhythm': {
            // For rhythm, we need to check both rhythm name and pattern
            // This is a simplification - in practice we might need the full signature
            return true; // Accept all rhythm changes for now
        }
        case 'note-pattern': {
            if (!valueA || !valueB)
                return false;
            const sig = { dimension: 'note-pattern', pattern: valueA };
            const neighbors = dimensions.notePatternDim.getNeighbors(sig);
            return neighbors.some((n) => n.pattern === valueB);
        }
    }
}
// Build graph from compound stats
export function buildGraph(repo, settings, dimensions) {
    const dims = resolveDimensions(dimensions);
    const allCompounds = repo.getAllCompoundStats();
    const nodes = [];
    const edges = [];
    const edgeSet = new Set(); // To avoid duplicate edges
    // Find the most recently practiced compound
    let centerNodeId = null;
    let mostRecentTime = null;
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
                let valueA;
                let valueB;
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
                        edges.push({
                            id: edgeId,
                            source: a.id,
                            target: b.id,
                            type: 'smoothstep',
                            data: {
                                dimension: changedDimension,
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
    // Positions will be calculated client-side with radial layout
    return { nodes, edges, centerNodeId };
}
// Build a potential graph including unpracticed neighbors of practiced compounds
export function buildExpandedGraph(repo, settings, dimensions) {
    const dims = resolveDimensions(dimensions);
    const baseGraph = buildGraph(repo, settings, dimensions);
    const allCompounds = repo.getAllCompoundStats();
    const existingIds = new Set(baseGraph.nodes.map((n) => n.id));
    const potentialNodes = [];
    const potentialEdges = [];
    // For each practiced compound, find potential neighbors that haven't been practiced
    // This shows users what they could expand into (2 layers out from practiced nodes)
    for (const compound of allCompounds) {
        if (compound.attempts === 0)
            continue; // Skip unpracticed compounds
        // Generate potential neighbors for each dimension
        // Scale neighbors
        const scaleNeighbors = dims.scaleDim.getNeighbors({ dimension: 'scale', scale: compound.scale });
        for (const neighbor of scaleNeighbors) {
            const potentialId = `${neighbor.scale}+${compound.position}+${compound.rhythm}:${compound.rhythmPattern}${compound.notePattern ? `+${compound.notePattern}` : ''}`;
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
                    },
                    position: { x: 0, y: 0 },
                });
                potentialEdges.push({
                    id: `${compound.id}--${potentialId}`,
                    source: compound.id,
                    target: potentialId,
                    type: 'smoothstep',
                    data: { dimension: 'scale' },
                    style: { strokeDasharray: '5,5' }, // Dashed line for potential edges
                });
            }
        }
        // Position neighbors
        const positionNeighbors = dims.positionDim.getNeighbors({
            dimension: 'position',
            position: compound.position,
        });
        for (const neighbor of positionNeighbors) {
            const potentialId = `${compound.scale}+${neighbor.position}+${compound.rhythm}:${compound.rhythmPattern}${compound.notePattern ? `+${compound.notePattern}` : ''}`;
            if (!existingIds.has(potentialId)) {
                existingIds.add(potentialId);
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
                    },
                    position: { x: 0, y: 0 },
                });
                potentialEdges.push({
                    id: `${compound.id}--${potentialId}`,
                    source: compound.id,
                    target: potentialId,
                    type: 'smoothstep',
                    data: { dimension: 'position' },
                    style: { strokeDasharray: '5,5' },
                });
            }
        }
        // Rhythm neighbors
        const rhythmNeighbors = dims.rhythmDim.getNeighbors({
            dimension: 'rhythm',
            rhythm: compound.rhythm,
            pattern: compound.rhythmPattern,
        });
        for (const neighbor of rhythmNeighbors) {
            const potentialId = `${compound.scale}+${compound.position}+${neighbor.rhythm}:${neighbor.pattern}${compound.notePattern ? `+${compound.notePattern}` : ''}`;
            if (!existingIds.has(potentialId)) {
                existingIds.add(potentialId);
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
                    },
                    position: { x: 0, y: 0 },
                });
                potentialEdges.push({
                    id: `${compound.id}--${potentialId}`,
                    source: compound.id,
                    target: potentialId,
                    type: 'smoothstep',
                    data: { dimension: 'rhythm' },
                    style: { strokeDasharray: '5,5' },
                });
            }
        }
        // Note pattern neighbors (if unlocked)
        if (compound.notePattern) {
            const notePatternNeighbors = dims.notePatternDim.getNeighbors({
                dimension: 'note-pattern',
                pattern: compound.notePattern,
            });
            for (const neighbor of notePatternNeighbors) {
                const potentialId = `${compound.scale}+${compound.position}+${compound.rhythm}:${compound.rhythmPattern}+${neighbor.pattern}`;
                if (!existingIds.has(potentialId)) {
                    existingIds.add(potentialId);
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
                        },
                        position: { x: 0, y: 0 },
                    });
                    potentialEdges.push({
                        id: `${compound.id}--${potentialId}`,
                        source: compound.id,
                        target: potentialId,
                        type: 'smoothstep',
                        data: { dimension: 'note-pattern' },
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
//# sourceMappingURL=graph-builder.js.map