import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { RhythmSig } from '../../types.js';
import { IDimension } from '../dimension.js';

interface RhythmConfig {
  id: string;
  notes_per_beat: number;
  next: string[];
}

interface RhythmYamlConfig {
  entry_point: { rhythm: string };
  rhythms: RhythmConfig[];
}

export class RhythmDimension implements IDimension<RhythmSig> {
  name = 'rhythm';
  private config: RhythmYamlConfig;
  private rhythmMap: Map<string, RhythmConfig>;

  constructor(configPath?: string) {
    const finalPath = configPath ?? path.join(process.cwd(), 'config', 'rhythm.yaml');
    const content = fs.readFileSync(finalPath, 'utf8');
    this.config = yaml.load(content) as RhythmYamlConfig;

    this.rhythmMap = new Map(this.config.rhythms.map((r) => [r.id, r]));
  }

  getEntryPoint(): RhythmSig {
    const rhythmId = this.config.entry_point.rhythm;
    const rhythm = this.rhythmMap.get(rhythmId)!;
    return {
      dimension: 'rhythm',
      rhythm: rhythmId,
      pattern: this.getContinuousPattern(rhythm.notes_per_beat),
    };
  }

  // Generate continuous pattern (all x's) for a given notes_per_beat
  private getContinuousPattern(notesPerBeat: number): string {
    return 'x'.repeat(notesPerBeat);
  }

  getSignatures(): RhythmSig[] {
    const signatures: RhythmSig[] = [];
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

  getNeighbors(sig: RhythmSig): RhythmSig[] {
    const neighbors: RhythmSig[] = [];
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

  isNeighbor(a: RhythmSig, b: RhythmSig): boolean {
    if (a.rhythm === b.rhythm && a.pattern === b.pattern) {
      return false;
    }

    const aNeighbors = this.getNeighbors(a);
    return aNeighbors.some((n) => n.rhythm === b.rhythm && n.pattern === b.pattern);
  }

  isForwardNeighbor(from: RhythmSig, to: RhythmSig): boolean {
    const rhythm = this.rhythmMap.get(from.rhythm);
    if (!rhythm) return false;
    return rhythm.next.includes(to.rhythm);
  }

  describe(sig: RhythmSig): string {
    // Phase 1: Just show rhythm name
    // Phase 2+: Will show pattern details
    return sig.rhythm;
  }

  getNotesPerBeat(sig: RhythmSig): number {
    const rhythm = this.rhythmMap.get(sig.rhythm);
    return rhythm?.notes_per_beat ?? 2;
  }

  // Get all available rhythm types (for interactive mode)
  getAvailableRhythms(): string[] {
    return this.config.rhythms.map((r) => r.id);
  }

  // Get the continuous pattern for a rhythm (for interactive mode)
  getPatternForRhythm(rhythmId: string): string {
    const rhythm = this.rhythmMap.get(rhythmId);
    if (!rhythm) {
      return 'xx'; // fallback
    }
    return this.getContinuousPattern(rhythm.notes_per_beat);
  }

  // Get prerequisites (simpler rhythms that come before this one in the ladder)
  // Used for proficiency backfilling
  getPrerequisites(rhythmId: string): string[] {
    const prerequisites: string[] = [];
    const visited = new Set<string>();

    // BFS backwards through the ladder
    const queue: string[] = [];

    // Find all rhythms that have this as 'next'
    for (const r of this.config.rhythms) {
      if (r.next.includes(rhythmId)) {
        queue.push(r.id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
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
