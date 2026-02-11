import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { NotePatternSig } from '../../types.js';
import { IDimension } from '../dimension.js';

interface PatternConfig {
  id: string;
  description: string;
}

interface NotePatternYamlConfig {
  entry_point: string;
  tiers: Record<number, string[]>;
  patterns: PatternConfig[];
}

export class NotePatternDimension implements IDimension<NotePatternSig> {
  name = 'note-pattern';
  private config: NotePatternYamlConfig;
  private patternMap: Map<string, PatternConfig>;
  private patternToTier: Map<string, number>;
  private tierToPatterns: Map<number, string[]>;

  constructor(configPath?: string) {
    const finalPath = configPath ?? path.join(process.cwd(), 'config', 'note-pattern.yaml');
    const content = fs.readFileSync(finalPath, 'utf8');
    this.config = yaml.load(content) as NotePatternYamlConfig;

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

  getEntryPoint(): NotePatternSig {
    return {
      dimension: 'note-pattern',
      pattern: this.config.entry_point,
    };
  }

  getSignatures(): NotePatternSig[] {
    return this.config.patterns.map((p) => ({
      dimension: 'note-pattern',
      pattern: p.id,
    }));
  }

  getNeighbors(sig: NotePatternSig): NotePatternSig[] {
    const neighbors: NotePatternSig[] = [];
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

  isForwardNeighbor(from: NotePatternSig, to: NotePatternSig): boolean {
    const fromTier = this.patternToTier.get(from.pattern);
    const toTier = this.patternToTier.get(to.pattern);
    if (fromTier === undefined || toTier === undefined) return false;

    // Same tier = lateral (considered forward for exploration)
    if (fromTier === toTier && from.pattern !== to.pattern) return true;

    // Next tier: only first pattern (gateway)
    if (toTier === fromTier + 1) {
      const nextTierPatterns = this.tierToPatterns.get(toTier) ?? [];
      return nextTierPatterns[0] === to.pattern;
    }

    return false;
  }

  isNeighbor(a: NotePatternSig, b: NotePatternSig): boolean {
    if (a.pattern === b.pattern) {
      return false;
    }

    const aNeighbors = this.getNeighbors(a);
    return aNeighbors.some((n) => n.pattern === b.pattern);
  }

  describe(sig: NotePatternSig): string {
    const pattern = this.patternMap.get(sig.pattern);
    return pattern?.id ?? sig.pattern;
  }

  // Get tier for a pattern
  getTier(sig: NotePatternSig): number {
    return this.patternToTier.get(sig.pattern) ?? 1;
  }

  // Get all available patterns (for interactive mode)
  getAvailablePatterns(): string[] {
    return this.config.patterns.map((p) => p.id);
  }

  // Get description for a pattern
  getDescription(patternId: string): string {
    const pattern = this.patternMap.get(patternId);
    return pattern?.description ?? patternId;
  }

  // Get prerequisites (patterns in lower tiers)
  // Used for proficiency backfilling
  getPrerequisites(patternId: string): string[] {
    const currentTier = this.patternToTier.get(patternId);
    if (currentTier === undefined) {
      return [];
    }

    const prerequisites: string[] = [];

    // All patterns in lower tiers are prerequisites
    for (let tier = 1; tier < currentTier; tier++) {
      const tierPatterns = this.tierToPatterns.get(tier) ?? [];
      prerequisites.push(...tierPatterns);
    }

    return prerequisites;
  }
}
