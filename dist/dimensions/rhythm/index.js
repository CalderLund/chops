import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
export class RhythmDimension {
    name = 'rhythm';
    config;
    rhythmMap;
    constructor(configPath) {
        const finalPath = configPath ?? path.join(process.cwd(), 'config', 'rhythm.yaml');
        const content = fs.readFileSync(finalPath, 'utf8');
        this.config = yaml.load(content);
        this.rhythmMap = new Map(this.config.rhythms.map((r) => [r.id, r]));
    }
    getEntryPoint() {
        const rhythmId = this.config.entry_point.rhythm;
        const rhythm = this.rhythmMap.get(rhythmId);
        return {
            dimension: 'rhythm',
            rhythm: rhythmId,
            pattern: this.getContinuousPattern(rhythm.notes_per_beat),
        };
    }
    // Generate continuous pattern (all x's) for a given notes_per_beat
    getContinuousPattern(notesPerBeat) {
        return 'x'.repeat(notesPerBeat);
    }
    getSignatures() {
        const signatures = [];
        for (const rhythm of this.config.rhythms) {
            // Phase 1: Only continuous patterns
            signatures.push({
                dimension: 'rhythm',
                rhythm: rhythm.id,
                pattern: this.getContinuousPattern(rhythm.notes_per_beat),
            });
        }
        return signatures;
    }
    getNeighbors(sig) {
        const neighbors = [];
        const rhythm = this.rhythmMap.get(sig.rhythm);
        if (!rhythm) {
            return neighbors;
        }
        // Forward neighbors (next rhythms in ladder)
        for (const nextRhythmId of rhythm.next) {
            const nextRhythm = this.rhythmMap.get(nextRhythmId);
            if (nextRhythm) {
                neighbors.push({
                    dimension: 'rhythm',
                    rhythm: nextRhythmId,
                    pattern: this.getContinuousPattern(nextRhythm.notes_per_beat),
                });
            }
        }
        // Reverse neighbors (rhythms that have this as 'next')
        for (const r of this.config.rhythms) {
            if (r.next.includes(sig.rhythm)) {
                neighbors.push({
                    dimension: 'rhythm',
                    rhythm: r.id,
                    pattern: this.getContinuousPattern(r.notes_per_beat),
                });
            }
        }
        // Phase 2+: Would also include pattern variations as neighbors
        return neighbors;
    }
    isNeighbor(a, b) {
        if (a.rhythm === b.rhythm && a.pattern === b.pattern) {
            return false;
        }
        const aNeighbors = this.getNeighbors(a);
        return aNeighbors.some((n) => n.rhythm === b.rhythm && n.pattern === b.pattern);
    }
    describe(sig) {
        // Phase 1: Just show rhythm name
        // Phase 2+: Will show pattern details
        return sig.rhythm;
    }
    getNotesPerBeat(sig) {
        const rhythm = this.rhythmMap.get(sig.rhythm);
        return rhythm?.notes_per_beat ?? 2;
    }
    // Get all available rhythm types (for interactive mode)
    getAvailableRhythms() {
        return this.config.rhythms.map((r) => r.id);
    }
    // Get the continuous pattern for a rhythm (for interactive mode)
    getPatternForRhythm(rhythmId) {
        const rhythm = this.rhythmMap.get(rhythmId);
        if (!rhythm) {
            return 'xx'; // fallback
        }
        return this.getContinuousPattern(rhythm.notes_per_beat);
    }
    // Get prerequisites (simpler rhythms that come before this one in the ladder)
    // Used for proficiency backfilling
    getPrerequisites(rhythmId) {
        const prerequisites = [];
        const visited = new Set();
        // BFS backwards through the ladder
        const queue = [];
        // Find all rhythms that have this as 'next'
        for (const r of this.config.rhythms) {
            if (r.next.includes(rhythmId)) {
                queue.push(r.id);
            }
        }
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current))
                continue;
            visited.add(current);
            prerequisites.push(current);
            // Find rhythms that have 'current' as next
            for (const r of this.config.rhythms) {
                if (r.next.includes(current) && !visited.has(r.id)) {
                    queue.push(r.id);
                }
            }
        }
        return prerequisites;
    }
}
//# sourceMappingURL=index.js.map