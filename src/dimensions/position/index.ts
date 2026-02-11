import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { PositionSig } from '../../types.js';
import { IDimension } from '../dimension.js';

interface PositionConfig {
  id: string;
  next: string[];
}

interface PositionYamlConfig {
  entry_point: string;
  positions: PositionConfig[];
}

export class PositionDimension implements IDimension<PositionSig> {
  name = 'position';
  private config: PositionYamlConfig;
  private positionMap: Map<string, PositionConfig>;

  constructor(configPath?: string) {
    const finalPath = configPath ?? path.join(process.cwd(), 'config', 'position.yaml');
    const content = fs.readFileSync(finalPath, 'utf8');
    this.config = yaml.load(content) as PositionYamlConfig;

    this.positionMap = new Map(this.config.positions.map((p) => [p.id, p]));
  }

  getEntryPoint(): PositionSig {
    return {
      dimension: 'position',
      position: this.config.entry_point,
    };
  }

  getSignatures(): PositionSig[] {
    return this.config.positions.map((p) => ({
      dimension: 'position',
      position: p.id,
    }));
  }

  getNeighbors(sig: PositionSig): PositionSig[] {
    const neighbors: PositionSig[] = [];
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

  isNeighbor(a: PositionSig, b: PositionSig): boolean {
    if (a.position === b.position) {
      return false;
    }

    const aNeighbors = this.getNeighbors(a);
    return aNeighbors.some((n) => n.position === b.position);
  }

  isForwardNeighbor(from: PositionSig, to: PositionSig): boolean {
    const position = this.positionMap.get(from.position);
    if (!position || position.next.length === 0) return false;
    return position.next[0] === to.position;
  }

  describe(sig: PositionSig): string {
    return `${sig.position}-shape`;
  }

  // Get all available positions (for interactive mode)
  getAvailablePositions(): string[] {
    return this.config.positions.map((p) => p.id);
  }

  // Get prerequisites (simpler positions that come before this one in the ladder)
  // Used for proficiency backfilling
  getPrerequisites(positionId: string): string[] {
    const prerequisites: string[] = [];
    const visited = new Set<string>();

    // BFS backwards through the ladder
    const queue: string[] = [];

    // Find all positions that have this as 'next'
    for (const p of this.config.positions) {
      if (p.next.includes(positionId)) {
        queue.push(p.id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
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
