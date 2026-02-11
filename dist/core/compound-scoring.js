// Compound-based scoring system
import { compoundsEqual, getChangedDimension, statsToCompound } from '../db/compound.js';
// Score a candidate compound
export function scoreCompoundCandidate(candidate, context) {
    const { currentCompound, currentStats, candidateStats, relatedStats, currentSession, recentDimensionChanges, config, expansionNpm, } = context;
    let score = 0;
    // 1. Consolidation score: Should I stay on current compound?
    const consolidationScore = calculateConsolidationScore(candidate, currentCompound, currentStats);
    score += config.consolidationWeight * consolidationScore;
    // 2. Staleness score: How long since this compound was practiced?
    const stalenessScore = calculateStalenessScore(candidateStats, currentSession, config.stalenessSessions);
    score += config.stalenessWeight * stalenessScore;
    // 3. Readiness score: How likely am I to succeed?
    const readinessScore = calculateReadinessScore(candidate, candidateStats, relatedStats, config.transferCoefficients, expansionNpm);
    score += config.readinessWeight * readinessScore;
    // 4. Diversity score: Am I varying dimensions?
    const diversityScore = calculateDiversityScore(candidate, currentCompound, recentDimensionChanges);
    score += config.diversityWeight * diversityScore;
    return score;
}
// Consolidation: High when current is unstable, zero when mastered
function calculateConsolidationScore(candidate, current, currentStats) {
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
    // Expanded but not mastered - small incentive to stay
    return 0.2;
}
// Staleness: Based on sessions since last practiced
function calculateStalenessScore(candidateStats, currentSession, stalenessSessions) {
    if (!candidateStats || candidateStats.lastPracticedSession === null) {
        // Never practiced - treat as maximally stale
        return 1.0;
    }
    const sessionsSince = currentSession - candidateStats.lastPracticedSession;
    // Linear scale up to stalenessSessions, then capped at 1.0
    return Math.min(sessionsSince / stalenessSessions, 1.0);
}
// Default transfer coefficient used when a dimension has no configured value
const DEFAULT_TRANSFER_COEFFICIENT = 0.5;
// Readiness: Estimated success probability based on transfer
function calculateReadinessScore(candidate, candidateStats, relatedStats, transferCoefficients, expansionNpm) {
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
function calculateDiversityScore(candidate, current, recentDimensionChanges) {
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
export function weightedRandomSelectCompound(items, scores, randomFn = Math.random) {
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
//# sourceMappingURL=compound-scoring.js.map