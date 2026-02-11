import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
export class PositionDimension {
    name = 'position';
    config;
    positionMap;
    constructor(configPath) {
        const finalPath = configPath ?? path.join(process.cwd(), 'config', 'position.yaml');
        const content = fs.readFileSync(finalPath, 'utf8');
        this.config = yaml.load(content);
        this.positionMap = new Map(this.config.positions.map((p) => [p.id, p]));
    }
    getEntryPoint() {
        return {
            dimension: 'position',
            position: this.config.entry_point,
        };
    }
    getSignatures() {
        return this.config.positions.map((p) => ({
            dimension: 'position',
            position: p.id,
        }));
    }
    getNeighbors(sig) {
        const neighbors = [];
        const position = this.positionMap.get(sig.position);
        if (!position) {
            return neighbors;
        }
        // Forward neighbor: only FIRST position in next array (gateway pattern)
        if (position.next.length > 0) {
            neighbors.push({
                dimension: 'position',
                position: position.next[0],
            });
        }
        // Reverse neighbors: positions that have this as next
        for (const p of this.config.positions) {
            if (p.next.includes(sig.position)) {
                neighbors.push({
                    dimension: 'position',
                    position: p.id,
                });
            }
        }
        return neighbors;
    }
    isNeighbor(a, b) {
        if (a.position === b.position) {
            return false;
        }
        const aNeighbors = this.getNeighbors(a);
        return aNeighbors.some((n) => n.position === b.position);
    }
    describe(sig) {
        return `${sig.position}-shape`;
    }
    // Get all available positions (for interactive mode)
    getAvailablePositions() {
        return this.config.positions.map((p) => p.id);
    }
    // Get prerequisites (simpler positions that come before this one in the ladder)
    // Used for proficiency backfilling
    getPrerequisites(positionId) {
        const prerequisites = [];
        const visited = new Set();
        // BFS backwards through the ladder
        const queue = [];
        // Find all positions that have this as 'next'
        for (const p of this.config.positions) {
            if (p.next.includes(positionId)) {
                queue.push(p.id);
            }
        }
        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current))
                continue;
            visited.add(current);
            prerequisites.push(current);
            // Find positions that have 'current' as next
            for (const p of this.config.positions) {
                if (p.next.includes(current) && !visited.has(p.id)) {
                    queue.push(p.id);
                }
            }
        }
        return prerequisites;
    }
}
//# sourceMappingURL=index.js.map