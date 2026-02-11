// Signature types per dimension

export interface RhythmSig {
  dimension: 'rhythm';
  rhythm: string; // "8ths", "triplets", "16ths", "quintuplets", "sextuplets"
  pattern: string; // "xx", "xxx", "xxxx", etc. (length matches notes_per_beat)
}

export interface ScaleSig {
  dimension: 'scale';
  scale: string; // "pentatonic", "blues", "minor", etc.
}

export interface PositionSig {
  dimension: 'position';
  position: string; // "C", "A", "G", "E", "D" (CAGED shapes)
}

export interface NotePatternSig {
  dimension: 'note-pattern';
  pattern: string; // "stepwise", "seq-3", "thirds", etc.
}

export type Signature = RhythmSig | ScaleSig | PositionSig | NotePatternSig;

// Computed ID for storage
export function sigId(sig: Signature): string {
  if (sig.dimension === 'rhythm') {
    return `rhythm:${sig.rhythm}:${sig.pattern}`;
  }
  if (sig.dimension === 'scale') {
    return `scale:${sig.scale}`;
  }
  if (sig.dimension === 'position') {
    return `position:${sig.position}`;
  }
  if (sig.dimension === 'note-pattern') {
    return `note-pattern:${sig.pattern}`;
  }
  throw new Error(`Unknown dimension: ${(sig as Signature).dimension}`);
}

// Parse signature ID back to signature
export function parseSigId(id: string): Signature {
  const parts = id.split(':');
  if (parts[0] === 'rhythm') {
    return { dimension: 'rhythm', rhythm: parts[1], pattern: parts[2] };
  }
  if (parts[0] === 'scale') {
    return { dimension: 'scale', scale: parts[1] };
  }
  if (parts[0] === 'position') {
    return { dimension: 'position', position: parts[1] };
  }
  if (parts[0] === 'note-pattern') {
    return { dimension: 'note-pattern', pattern: parts[1] };
  }
  throw new Error(`Unknown signature ID: ${id}`);
}

// Per-signature statistics
export interface SignatureStats {
  signatureId: string;
  dimension: string;
  bestNpm: number;
  emaNpm: number;
  attempts: number;
  lastSeen: string | null;
  // Progression tracking
  hasExpanded: boolean; // Has hit expansion threshold (can explore neighbors)
  masteryStreak: number; // Consecutive practices at mastery threshold
  isMastered: boolean; // Has completed mastery (removed from pool)
}

// Compound: A specific combination of dimensions that forms a single skill
export interface Compound {
  scale: string;
  position: string;
  rhythm: string;
  rhythmPattern: string;
  notePattern?: string; // undefined if dimension not yet unlocked
  articulation?: string; // undefined if dimension not yet unlocked
}

// Compound statistics
export interface CompoundStats {
  id: string;
  scale: string;
  position: string;
  rhythm: string;
  rhythmPattern: string;
  notePattern: string | null;
  articulation: string | null;
  bestNpm: number;
  emaNpm: number;
  lastNpm: number;
  lastBpm: number;
  attempts: number;
  hasExpanded: boolean;
  masteryStreak: number;
  isMastered: boolean;
  strugglingStreak: number;
  lastPracticed: string | null;
  lastPracticedSession: number | null;
}

// Dimension tier configuration
export interface DimensionTierConfig {
  name: string;
  tier: number;
  unlockRequirement?: number; // Number of compounds to expand from previous tier
  entryPoint: string;
}

// Compound scoring configuration
export interface CompoundScoringConfig {
  consolidationWeight: number;
  stalenessWeight: number;
  readinessWeight: number;
  diversityWeight: number;
  stalenessSessions: number;
  transferCoefficients: Record<string, number>;
}

// NPM tier thresholds - progress follows logarithmic curve
// These define semantic skill levels
export interface NpmTiers {
  struggling: number; // Below this = needs to move back (< 200)
  developing: number; // Working through things (200-280)
  progressing: number; // Making progress (280-400)
  fast: number; // Getting fast (400-440)
  veryFast: number; // Getting really fast (440-480)
  superFast: number; // Super fast (480-560)
  // Above superFast = shredding (560+)
}

// Struggling detection configuration
export interface StrugglingConfig {
  streakThreshold: number; // Consecutive struggling attempts before demotion (e.g., 3)
}

// Settings from config
export interface Settings {
  emaAlpha: number;
  stability: {
    minAttempts: number;
    emaRatio: number;
  };
  progression: {
    expansionNpm: number; // NPM threshold to unlock neighbors (e.g., 400)
    masteryNpm: number; // NPM threshold for mastery streak (e.g., 480)
    masteryStreak: number; // Consecutive practices needed for mastery (e.g., 3)
  };
  scoring: {
    proximityOneChange: number;
    proximityRepeat: number;
    stabilityReady: number;
    stabilityNotReady: number;
    noveltyMaxDays: number;
    noveltyWeight: number;
    explorationBonus: number;
  };
  compoundScoring: CompoundScoringConfig;
  dimensionTiers: DimensionTierConfig[];
  npmTiers: NpmTiers;
  struggling: StrugglingConfig;
  keys: string[];
}

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  emaAlpha: 0.3,
  stability: {
    minAttempts: 3, // Need 3 attempts before considered stable (legacy)
    emaRatio: 0.9, // EMA must be >= 90% of best (legacy)
  },
  progression: {
    expansionNpm: 400, // Hit 400 NPM to unlock neighbors
    masteryNpm: 480, // Hit 480 NPM to count toward mastery
    masteryStreak: 3, // 3 consecutive at mastery NPM to master
  },
  scoring: {
    // Note: 1 repeat candidate vs many exploration candidates
    // So repeat needs higher score to overcome numbers
    proximityOneChange: 1.0,
    proximityRepeat: 2.0, // Much higher to overcome candidate count
    stabilityReady: 2.0, // Strong bonus for stable parent
    stabilityNotReady: 0.0, // Zero - don't advance if unstable!
    noveltyMaxDays: 7,
    noveltyWeight: 0.1, // Minimal novelty chasing
    explorationBonus: 0.05, // Tiny exploration bonus
  },
  compoundScoring: {
    consolidationWeight: 1.0,
    stalenessWeight: 0.5,
    readinessWeight: 0.8,
    diversityWeight: 0.2,
    stalenessSessions: 10,
    transferCoefficients: {
      scale: 0.5,
      rhythm: 0.6,
      'note-pattern': 0.5,
      position: 0.5,
      articulation: 0.7,
    },
  },
  dimensionTiers: [
    // Tier 0: Always available
    { name: 'scale', tier: 0, entryPoint: 'pentatonic_minor' },
    { name: 'position', tier: 0, entryPoint: 'E' },
    { name: 'rhythm', tier: 0, entryPoint: '8ths' },
    // Tier 1: Unlocks after first Tier 0 compound expanded
    { name: 'note-pattern', tier: 1, unlockRequirement: 1, entryPoint: 'stepwise' },
    // Tier 2: Unlocks after first Tier 1 compound expanded
    { name: 'articulation', tier: 2, unlockRequirement: 1, entryPoint: 'continuous' },
  ],
  // NPM tier thresholds - progress follows logarithmic curve
  npmTiers: {
    struggling: 200, // < 200 = struggling, needs to move back
    developing: 280, // 200-280 = working through things
    progressing: 400, // 280-400 = making progress
    fast: 440, // 400-440 = getting fast
    veryFast: 480, // 440-480 = getting really fast
    superFast: 560, // 480-560 = super fast, 560+ = shredding
  },
  struggling: {
    streakThreshold: 1, // 1 attempt below struggling threshold triggers warning
  },
  keys: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
};
