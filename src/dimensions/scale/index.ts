import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { ScaleSig } from '../../types.js';
import { IDimension } from '../dimension.js';

interface ScaleConfig {
  id: string;
  next: string[];
  tonality?: string;
  uses?: string;
}

interface ScaleYamlConfig {
  entry_point: string;
  tiers: Record<number, string[]>;
  scales: ScaleConfig[];
}

export class ScaleDimension implements IDimension<ScaleSig> {
  name = 'scale';
  private config: ScaleYamlConfig;
  private scaleMap: Map<string, ScaleConfig>;
  private scaleToTier: Map<string, number>;
  private tierToScales: Map<number, string[]>;

  constructor(configPath?: string) {
    const finalPath = configPath ?? path.join(process.cwd(), 'config', 'scale.yaml');
    const content = fs.readFileSync(finalPath, 'utf8');
    this.config = yaml.load(content) as ScaleYamlConfig;

    this.scaleMap = new Map(this.config.scales.map((s) => [s.id, s]));

    // Build tier lookup maps
    this.scaleToTier = new Map();
    this.tierToScales = new Map();

    for (const [tierStr, scales] of Object.entries(this.config.tiers)) {
      const tier = parseInt(tierStr, 10);
      this.tierToScales.set(tier, scales);
      for (const scale of scales) {
        this.scaleToTier.set(scale, tier);
      }
    }
  }

  getEntryPoint(): ScaleSig {
    return {
      dimension: 'scale',
      scale: this.config.entry_point,
    };
  }

  getSignatures(): ScaleSig[] {
    return this.config.scales.map((s) => ({
      dimension: 'scale',
      scale: s.id,
    }));
  }

  getNeighbors(sig: ScaleSig): ScaleSig[] {
    const neighbors: ScaleSig[] = [];
    const currentTier = this.scaleToTier.get(sig.scale);
    if (currentTier === undefined) return neighbors;

    // Same-tier: free lateral movement
    const sameTier = this.tierToScales.get(currentTier) ?? [];
    for (const s of sameTier) {
      if (s !== sig.scale) {
        neighbors.push({ dimension: 'scale', scale: s });
      }
    }

    // Lower tier: always accessible (all of tier-1)
    const lowerTier = this.tierToScales.get(currentTier - 1) ?? [];
    for (const s of lowerTier) {
      neighbors.push({ dimension: 'scale', scale: s });
    }

    // Higher tier: only items in `next` array that are in tier+1
    const scale = this.scaleMap.get(sig.scale);
    if (scale) {
      for (const nextId of scale.next) {
        const nextTier = this.scaleToTier.get(nextId);
        if (nextTier === currentTier + 1) {
          neighbors.push({ dimension: 'scale', scale: nextId });
        }
      }
    }

    return neighbors;
  }

  isNeighbor(a: ScaleSig, b: ScaleSig): boolean {
    if (a.scale === b.scale) {
      return false;
    }

    const aNeighbors = this.getNeighbors(a);
    return aNeighbors.some((n) => n.scale === b.scale);
  }

  isForwardNeighbor(from: ScaleSig, to: ScaleSig): boolean {
    const fromTier = this.scaleToTier.get(from.scale);
    const toTier = this.scaleToTier.get(to.scale);
    if (fromTier === undefined || toTier === undefined) return false;

    // Same tier = lateral (forward for exploration)
    if (fromTier === toTier && from.scale !== to.scale) return true;

    // Next tier: must be in `next` array
    if (toTier === fromTier + 1) {
      const scale = this.scaleMap.get(from.scale);
      return scale?.next.includes(to.scale) ?? false;
    }

    return false;
  }

  describe(sig: ScaleSig): string {
    return this.capitalize(sig.scale);
  }

  // Get the difficulty tier for a scale
  getTier(sig: ScaleSig): number {
    return this.scaleToTier.get(sig.scale) ?? 1;
  }

  // Get all available scales (for interactive mode)
  getAvailableScales(): string[] {
    return this.config.scales.map((s) => s.id);
  }

  // Get tonality description for a scale
  getTonality(scaleId: string): string | undefined {
    return this.scaleMap.get(scaleId)?.tonality;
  }

  // Get uses description for a scale
  getUses(scaleId: string): string | undefined {
    return this.scaleMap.get(scaleId)?.uses;
  }

  // Get prerequisites (scales in lower tiers)
  // Used for proficiency backfilling
  getPrerequisites(scaleId: string): string[] {
    const currentTier = this.scaleToTier.get(scaleId);
    if (currentTier === undefined) return [];

    const prerequisites: string[] = [];
    for (let tier = 1; tier < currentTier; tier++) {
      prerequisites.push(...(this.tierToScales.get(tier) ?? []));
    }
    return prerequisites;
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  }
}
