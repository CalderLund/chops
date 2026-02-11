// Compound-based scoring system

import { Compound, CompoundStats, CompoundScoringConfig } from '../types.js';
import { compoundsEqual, getChangedDimension, statsToCompound } from '../db/compound.js';

export interface CompoundScoringContext {
  currentCompound: Compound;
  currentStats: CompoundStats | null;
  candidateStats: CompoundStats | null;
  relatedStats: CompoundStats[]; // Stats of compounds that differ by 1 dimension
  currentSession: number;
  recentDimensionChanges: string[]; // Last N dimension changes
  config: CompoundScoringConfig;
  expansionNpm: number;
  masteryNpm: number;
}

// Score a candidate compound
export function scoreCompoundCandidate(
  candidate: Compound,
  context: CompoundScoringContext,
): number {
  const {
    currentCompound,
    currentStats,
    candidateStats,
    relatedStats,
    currentSession,
    recentDimensionChanges,
    config,
    expansionNpm,
    masteryNpm,
  } = context;

  let score = 0;

  // 1. Consolidation score: Should I stay on current compound?
  const consolidationScore = calculateConsolidationScore(
    candidate,
    currentCompound,
    currentStats,
    masteryNpm,
  );
  score += config.consolidationWeight * consolidationScore;

  // 2. Staleness score: How long since this compound was practiced?
  const stalenessScore = calculateStalenessScore(
    candidateStats,
    currentSession,
    config.stalenessSessions,
  );
  score += config.stalenessWeight * stalenessScore;

  // 3. Readiness score: How likely am I to succeed?
  const readinessScore = calculateReadinessScore(
    candidate,
    candidateStats,
    relatedStats,
    config.transferCoefficients,
    expansionNpm,
  );
  score += config.readinessWeight * readinessScore;

  // 4. Diversity score: Am I varying dimensions?
  const diversityScore = calculateDiversityScore(
    candidate,
    currentCompound,
    recentDimensionChanges,
  );
  score += config.diversityWeight * diversityScore;

  return score;
}

// Consolidation: High when current is unstable, zero when mastered
// Post-expansion, graduates by distance-to-mastery instead of flat value
export function calculateConsolidationScore(
  candidate: Compound,
  current: Compound,
  currentStats: CompoundStats | null,
  masteryNpm: number,
): number {
  // Only applies if this is the STAY option (same compound)
  if (!compoundsEqual(candidate, current)) {
    return 0;
  }

  // If mastered, no incentive to stay
  if (currentStats?.isMastered) {
    return 0;
  }

  // If not expanded yet, strong incentive to stay
  if (!currentStats?.hasExpanded) {
    return 1.0;
  }

  // Expanded but not mastered - scale by distance to mastery
  // Low EMA relative to mastery = high consolidation (needs more work)
  // High EMA relative to mastery = low consolidation (almost there)
  return Math.max(0.2, Math.min(0.8, 1.0 - currentStats.emaNpm / masteryNpm));
}

// Staleness: Based on sessions since last practiced
// Attenuated by attempt count to prevent prioritizing barely-touched compounds
export function calculateStalenessScore(
  candidateStats: CompoundStats | null,
  currentSession: number,
  stalenessSessions: number,
): number {
  if (!candidateStats || candidateStats.lastPracticedSession === null) {
    // Never practiced - treat as maximally stale
    return 1.0;
  }

  const sessionsSince = currentSession - candidateStats.lastPracticedSession;
  // Linear scale up to stalenessSessions, then capped at 1.0
  const rawStaleness = Math.min(sessionsSince / stalenessSessions, 1.0);

  // Attenuate by attempt count: 1 attempt -> *0.33, 2 -> *0.67, 3+ -> *1.0
  const attemptFactor = Math.min(candidateStats.attempts / 3, 1.0);
  return rawStaleness * attemptFactor;
}

// Default transfer coefficient used when a dimension has no configured value
const DEFAULT_TRANSFER_COEFFICIENT = 0.5;

// Readiness: Estimated success probability based on transfer
export function calculateReadinessScore(
  candidate: Compound,
  candidateStats: CompoundStats | null,
  relatedStats: CompoundStats[],
  transferCoefficients: Record<string, number>,
  expansionNpm: number,
): number {
  // If we have direct data, use it
  if (candidateStats && candidateStats.attempts > 0) {
    return Math.min(candidateStats.emaNpm / expansionNpm, 1.0);
  }

  // Otherwise, estimate from related compounds
  if (relatedStats.length === 0) {
    // No data at all - assume low readiness
    return 0.3;
  }

  // Weighted average: each related compound uses the coefficient for its changed dimension
  let totalWeightedNpm = 0;
  let totalWeight = 0;

  for (const related of relatedStats) {
    const relatedCompound = statsToCompound(related);
    const changedDim = getChangedDimension(candidate, relatedCompound);
    const coeff = changedDim
      ? (transferCoefficients[changedDim] ?? DEFAULT_TRANSFER_COEFFICIENT)
      : DEFAULT_TRANSFER_COEFFICIENT;

    totalWeightedNpm += related.emaNpm * coeff;
    totalWeight += 1;
  }

  const estimatedNpm = totalWeightedNpm / totalWeight;

  return Math.min(estimatedNpm / expansionNpm, 1.0);
}

// Diversity: Bonus for changing a dimension not recently changed
export function calculateDiversityScore(
  candidate: Compound,
  current: Compound,
  recentDimensionChanges: string[],
): number {
  const changedDimension = getChangedDimension(current, candidate);

  // No change (STAY) - no diversity bonus
  if (!changedDimension) {
    return 0;
  }

  // If this dimension was changed recently, no bonus
  if (recentDimensionChanges.includes(changedDimension)) {
    return 0;
  }

  // Dimension not changed recently - diversity bonus
  return 0.5;
}

// Weighted random selection from scored candidates
export function weightedRandomSelectCompound<T>(
  items: T[],
  scores: number[],
  randomFn: () => number = Math.random,
): T {
  if (items.length === 0) {
    throw new Error('Cannot select from empty array');
  }

  if (items.length === 1) {
    return items[0];
  }

  // Square scores to sharpen distribution
  const squaredScores = scores.map((s) => s * s);
  const totalScore = squaredScores.reduce((sum, s) => sum + s, 0);

  if (totalScore === 0) {
    // All scores are zero - uniform random
    return items[Math.floor(randomFn() * items.length)];
  }

  // Weighted random selection
  let random = randomFn() * totalScore;
  for (let i = 0; i < items.length; i++) {
    random -= squaredScores[i];
    if (random <= 0) {
      return items[i];
    }
  }

  // Fallback (shouldn't happen)
  return items[items.length - 1];
}
