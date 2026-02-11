import { Compound, CompoundStats, CompoundScoringConfig } from '../types.js';
export interface CompoundScoringContext {
    currentCompound: Compound;
    currentStats: CompoundStats | null;
    candidateStats: CompoundStats | null;
    relatedStats: CompoundStats[];
    currentSession: number;
    recentDimensionChanges: string[];
    config: CompoundScoringConfig;
    expansionNpm: number;
}
export declare function scoreCompoundCandidate(candidate: Compound, context: CompoundScoringContext): number;
export declare function weightedRandomSelectCompound<T>(items: T[], scores: number[], randomFn?: () => number): T;
//# sourceMappingURL=compound-scoring.d.ts.map