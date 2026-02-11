import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
export class ScaleDimension {
    name = 'scale';
    config;
    scaleMap;
    constructor(configPath) {
        const finalPath = configPath ?? path.join(process.cwd(), 'config', 'scale.yaml');
        const content = fs.readFileSync(finalPath, 'utf8');
        this.config = yaml.load(content);
        this.scaleMap = new Map(this.config.scales.map((s) => [s.id, s]));
    }
    getEntryPoint() {
        return {
            dimension: 'scale',
            scale: this.config.entry_point,
        };
    }
    getSignatures() {
        return this.config.scales.map((s) => ({
            dimension: 'scale',
            scale: s.id,
        }));
    }
    getNeighbors(sig) {
        const neighbors = [];
        const scale = this.scaleMap.get(sig.scale);
        if (!scale) {
            return neighbors;
        }
        // Forward neighbor: only FIRST scale in next array (gateway pattern)
        if (scale.next.length > 0) {
            neighbors.push({
                dimension: 'scale',
                scale: scale.next[0],
            });
        }
        // Reverse neighbors: scales that have this as next
        for (const s of this.config.scales) {
            if (s.next.includes(sig.scale)) {
                neighbors.push({
                    dimension: 'scale',
                    scale: s.id,
                });
            }
        }
        return neighbors;
    }
    isNeighbor(a, b) {
        if (a.scale === b.scale) {
            return false;
        }
        const aNeighbors = this.getNeighbors(a);
        return aNeighbors.some((n) => n.scale === b.scale);
    }
    describe(sig) {
        return this.capitalize(sig.scale);
    }
    capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
    }
    // Get all available scales (for interactive mode)
    getAvailableScales() {
        return this.config.scales.map((s) => s.id);
    }
    // Get prerequisites (simpler scales that come before this one in the ladder)
    // Used for proficiency backfilling
    getPrerequisites(scaleId) {
        const prerequisites = [];
        const visited = new Set();
        // BFS backwards through the ladder
        const queue = [];
        // Find all scales that have this as 'next'
        for (const s of this.config.scales) {
            if (s.next.includes(scaleId)) {
                queue.push(s.id);
            }
        }
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current))
                continue;
            visited.add(current);
            prerequisites.push(current);
            // Find scales that have 'current' as next
            for (const s of this.config.scales) {
                if (s.next.includes(current) && !visited.has(s.id)) {
                    queue.push(s.id);
                }
            }
        }
        return prerequisites;
    }
}
//# sourceMappingURL=index.js.map