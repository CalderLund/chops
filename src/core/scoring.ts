import {
  RhythmSig,
  ScaleSig,
  PositionSig,
  NotePatternSig,
  SignatureStats,
  Settings,
} from '../types.js';
import { isStable } from './normalizer.js';

export interface ScoringContext {
  rhythmStats: SignatureStats | null;
  scaleStats: SignatureStats | null;
  positionStats: SignatureStats | null;
  notePatternStats: SignatureStats | null;
  previousRhythm: RhythmSig;
  previousScale: ScaleSig;
  previousPosition: PositionSig;
  previousNotePattern: NotePatternSig;
  previousRhythmStats: SignatureStats | null;
  previousScaleStats: SignatureStats | null;
  previousPositionStats: SignatureStats | null;
  previousNotePatternStats: SignatureStats | null;
  settings: Settings;
  now: Date;
}

export function scoreCandidate(
  rhythm: RhythmSig,
  scale: ScaleSig,
  position: PositionSig,
  notePattern: NotePatternSig,
  context: ScoringContext,
): number {
  const { settings } = context;
  let score = 0;

  // Count changes from previous
  const rhythmChanged =
    rhythm.rhythm !== context.previousRhythm.rhythm ||
    rhythm.pattern !== context.previousRhythm.pattern;
  const scaleChanged = scale.scale !== context.previousScale.scale;
  const positionChanged = position.position !== context.previousPosition.position;
  const notePatternChanged = notePattern.pattern !== context.previousNotePattern.pattern;
  const changes =
    (rhythmChanged ? 1 : 0) +
    (scaleChanged ? 1 : 0) +
    (positionChanged ? 1 : 0) +
    (notePatternChanged ? 1 : 0);

  // Proximity bonus
  if (changes === 1) {
    score += settings.scoring.proximityOneChange;
  } else if (changes === 0) {
    score += settings.scoring.proximityRepeat;
  }
  // changes > 1 gets no proximity bonus (shouldn't happen with our candidate generation)

  // Stability bonus
  if (rhythmChanged) {
    // Check if parent (previous) rhythm is stable
    if (isSignatureStable(context.previousRhythmStats, settings)) {
      score += settings.scoring.stabilityReady;
    } else {
      score += settings.scoring.stabilityNotReady;
    }
  }

  if (scaleChanged) {
    // Check if parent (previous) scale is stable
    if (isSignatureStable(context.previousScaleStats, settings)) {
      score += settings.scoring.stabilityReady;
    } else {
      score += settings.scoring.stabilityNotReady;
    }
  }

  if (positionChanged) {
    // Check if parent (previous) position is stable
    if (isSignatureStable(context.previousPositionStats, settings)) {
      score += settings.scoring.stabilityReady;
    } else {
      score += settings.scoring.stabilityNotReady;
    }
  }

  if (notePatternChanged) {
    // Check if parent (previous) note pattern is stable
    if (isSignatureStable(context.previousNotePatternStats, settings)) {
      score += settings.scoring.stabilityReady;
    } else {
      score += settings.scoring.stabilityNotReady;
    }
  }

  if (!rhythmChanged && !scaleChanged && !positionChanged && !notePatternChanged) {
    // Repeat - check if we should consolidate
    const rhythmStable = isSignatureStable(context.rhythmStats, settings);
    const scaleStable = isSignatureStable(context.scaleStats, settings);
    const positionStable = isSignatureStable(context.positionStats, settings);
    const notePatternStable = isSignatureStable(context.notePatternStats, settings);

    if (!rhythmStable || !scaleStable || !positionStable || !notePatternStable) {
      // Need consolidation
      score += settings.scoring.stabilityReady;
    } else {
      // Already stable, push forward
      score += settings.scoring.stabilityNotReady;
    }
  }

  // Novelty bonus - when was this last seen?
  const rhythmDaysSince = daysSinceLastSeen(context.rhythmStats, context.now);
  const scaleDaysSince = daysSinceLastSeen(context.scaleStats, context.now);
  const positionDaysSince = daysSinceLastSeen(context.positionStats, context.now);
  const notePatternDaysSince = daysSinceLastSeen(context.notePatternStats, context.now);
  const avgDaysSince =
    (rhythmDaysSince + scaleDaysSince + positionDaysSince + notePatternDaysSince) / 4;
  const noveltyRatio = Math.min(avgDaysSince / settings.scoring.noveltyMaxDays, 1.0);
  score += settings.scoring.noveltyWeight * noveltyRatio;

  // Exploration bonus - never tried before
  if (!context.rhythmStats || context.rhythmStats.attempts === 0) {
    score += settings.scoring.explorationBonus;
  }
  if (!context.scaleStats || context.scaleStats.attempts === 0) {
    score += settings.scoring.explorationBonus;
  }
  if (!context.positionStats || context.positionStats.attempts === 0) {
    score += settings.scoring.explorationBonus;
  }
  if (!context.notePatternStats || context.notePatternStats.attempts === 0) {
    score += settings.scoring.explorationBonus;
  }

  return score;
}

function isSignatureStable(stats: SignatureStats | null, settings: Settings): boolean {
  if (!stats) return false;
  return isStable(
    stats.attempts,
    stats.emaNpm,
    stats.bestNpm,
    settings.stability.minAttempts,
    settings.stability.emaRatio,
  );
}

function daysSinceLastSeen(stats: SignatureStats | null, now: Date): number {
  if (!stats || !stats.lastSeen) {
    return 7; // Max novelty for never-seen (use noveltyMaxDays default)
  }
  const lastSeen = new Date(stats.lastSeen);
  const diffMs = now.getTime() - lastSeen.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

// Weighted random selection using score^2 to sharpen distribution
export function weightedRandomSelect<T>(
  items: T[],
  scores: number[],
  random: () => number = Math.random,
): T {
  if (items.length === 0) {
    throw new Error('Cannot select from empty array');
  }
  if (items.length !== scores.length) {
    throw new Error('Items and scores must have same length');
  }

  // Square scores to sharpen distribution
  const squaredScores = scores.map((s) => s * s);
  const totalWeight = squaredScores.reduce((a, b) => a + b, 0);

  if (totalWeight === 0) {
    // All scores are 0, pick uniformly
    return items[Math.floor(random() * items.length)];
  }

  const r = random() * totalWeight;
  let cumulative = 0;

  for (let i = 0; i < items.length; i++) {
    cumulative += squaredScores[i];
    if (r <= cumulative) {
      return items[i];
    }
  }

  // Fallback (shouldn't happen)
  return items[items.length - 1];
}
