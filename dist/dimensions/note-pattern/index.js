import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
export class NotePatternDimension {
    name = 'note-pattern';
    config;
    patternMap;
    patternToTier;
    tierToPatterns;
    constructor(configPath) {
        const finalPath = configPath ?? path.join(process.cwd(), 'config', 'note-pattern.yaml');
        const content = fs.readFileSync(finalPath, 'utf8');
        this.config = yaml.load(content);
        this.patternMap = new Map(this.config.patterns.map((p) => [p.id, p]));
        // Build tier lookup maps
        this.patternToTier = new Map();
        this.tierToPatterns = new Map();
        for (const [tierStr, patterns] of Object.entries(this.config.tiers)) {
            const tier = parseInt(tierStr, 10);
            this.tierToPatterns.set(tier, patterns);
            for (const pattern of patterns) {
                this.patternToTier.set(pattern, tier);
            }
        }
    }
    getEntryPoint() {
        return {
            dimension: 'note-pattern',
            pattern: this.config.entry_point,
        };
    }
    getSignatures() {
        return this.config.patterns.map((p) => ({
            dimension: 'note-pattern',
            pattern: p.id,
        }));
    }
    getNeighbors(sig) {
        const neighbors = [];
        const currentTier = this.patternToTier.get(sig.pattern);
        if (currentTier === undefined) {
            return neighbors;
        }
        // Neighbors within the same tier (can freely explore within tier)
        const sameTierPatterns = this.tierToPatterns.get(currentTier) ?? [];
        for (const pattern of sameTierPatterns) {
            if (pattern !== sig.pattern) {
                neighbors.push({
                    dimension: 'note-pattern',
                    pattern,
                });
            }
        }
        // Can always go back to lower tier (all patterns in tier-1)
        const lowerTierPatterns = this.tierToPatterns.get(currentTier - 1) ?? [];
        for (const pattern of lowerTierPatterns) {
            neighbors.push({
                dimension: 'note-pattern',
                pattern,
            });
        }
        // For higher tier: only the FIRST pattern is a neighbor (gateway pattern)
        // This enforces gradual progression - must master gateway before others
        const higherTierPatterns = this.tierToPatterns.get(currentTier + 1) ?? [];
        if (higherTierPatterns.length > 0) {
            neighbors.push({
                dimension: 'note-pattern',
                pattern: higherTierPatterns[0],
            });
        }
        return neighbors;
    }
    isNeighbor(a, b) {
        if (a.pattern === b.pattern) {
            return false;
        }
        const aNeighbors = this.getNeighbors(a);
        return aNeighbors.some((n) => n.pattern === b.pattern);
    }
    describe(sig) {
        const pattern = this.patternMap.get(sig.pattern);
        return pattern?.id ?? sig.pattern;
    }
    // Get tier for a pattern
    getTier(sig) {
        return this.patternToTier.get(sig.pattern) ?? 1;
    }
    // Get all available patterns (for interactive mode)
    getAvailablePatterns() {
        return this.config.patterns.map((p) => p.id);
    }
    // Get description for a pattern
    getDescription(patternId) {
        const pattern = this.patternMap.get(patternId);
        return pattern?.description ?? patternId;
    }
    // Get prerequisites (patterns in lower tiers)
    // Used for proficiency backfilling
    getPrerequisites(patternId) {
        const currentTier = this.patternToTier.get(patternId);
        if (currentTier === undefined) {
            return [];
        }
        const prerequisites = [];
        // All patterns in lower tiers are prerequisites
        for (let tier = 1; tier < currentTier; tier++) {
            const tierPatterns = this.tierToPatterns.get(tier) ?? [];
            prerequisites.push(...tierPatterns);
        }
        return prerequisites;
    }
}
//# sourceMappingURL=index.js.map