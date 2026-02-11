// Compound utilities for managing compound IDs and operations
// Build compound ID from components
// Format: "scale+position+rhythm:pattern" or "scale+position+rhythm:pattern+notePattern" etc.
export function compoundId(compound) {
    const parts = [
        compound.scale,
        compound.position,
        `${compound.rhythm}:${compound.rhythmPattern}`,
    ];
    if (compound.notePattern !== undefined) {
        parts.push(compound.notePattern);
    }
    if (compound.articulation !== undefined) {
        parts.push(compound.articulation);
    }
    return parts.join('+');
}
// Parse compound ID back to Compound
export function parseCompoundId(id) {
    const parts = id.split('+');
    // Parse rhythm which contains :
    const rhythmParts = parts[2].split(':');
    const compound = {
        scale: parts[0],
        position: parts[1],
        rhythm: rhythmParts[0],
        rhythmPattern: rhythmParts[1],
    };
    if (parts.length > 3) {
        compound.notePattern = parts[3];
    }
    if (parts.length > 4) {
        compound.articulation = parts[4];
    }
    return compound;
}
// Check if two compounds are equal
export function compoundsEqual(a, b) {
    return (a.scale === b.scale &&
        a.position === b.position &&
        a.rhythm === b.rhythm &&
        a.rhythmPattern === b.rhythmPattern &&
        a.notePattern === b.notePattern &&
        a.articulation === b.articulation);
}
// Get which dimension changed between two compounds (or null if same/multiple changes)
export function getChangedDimension(from, to) {
    const changes = [];
    if (from.scale !== to.scale)
        changes.push('scale');
    if (from.position !== to.position)
        changes.push('position');
    if (from.rhythm !== to.rhythm || from.rhythmPattern !== to.rhythmPattern)
        changes.push('rhythm');
    if (from.notePattern !== to.notePattern)
        changes.push('note-pattern');
    if (from.articulation !== to.articulation)
        changes.push('articulation');
    return changes.length === 1 ? changes[0] : null;
}
// Count how many dimensions differ between two compounds
export function countDimensionChanges(from, to) {
    let count = 0;
    if (from.scale !== to.scale)
        count++;
    if (from.position !== to.position)
        count++;
    if (from.rhythm !== to.rhythm || from.rhythmPattern !== to.rhythmPattern)
        count++;
    if (from.notePattern !== to.notePattern)
        count++;
    if (from.articulation !== to.articulation)
        count++;
    return count;
}
// Get the active dimension count for a compound
export function getActiveDimensionCount(compound) {
    let count = 3; // scale, position, rhythm always active
    if (compound.notePattern !== undefined)
        count++;
    if (compound.articulation !== undefined)
        count++;
    return count;
}
// Create entry point compound for given unlocked tiers
export function createEntryCompound(scaleEntry, positionEntry, rhythmEntry, rhythmPatternEntry, notePatternEntry, articulationEntry) {
    const compound = {
        scale: scaleEntry,
        position: positionEntry,
        rhythm: rhythmEntry,
        rhythmPattern: rhythmPatternEntry,
    };
    if (notePatternEntry !== undefined) {
        compound.notePattern = notePatternEntry;
    }
    if (articulationEntry !== undefined) {
        compound.articulation = articulationEntry;
    }
    return compound;
}
// Convert CompoundStats to Compound
export function statsToCompound(stats) {
    const compound = {
        scale: stats.scale,
        position: stats.position,
        rhythm: stats.rhythm,
        rhythmPattern: stats.rhythmPattern,
    };
    if (stats.notePattern !== null) {
        compound.notePattern = stats.notePattern;
    }
    if (stats.articulation !== null) {
        compound.articulation = stats.articulation;
    }
    return compound;
}
//# sourceMappingURL=compound.js.map