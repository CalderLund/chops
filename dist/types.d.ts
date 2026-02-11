export interface RhythmSig {
    dimension: 'rhythm';
    rhythm: string;
    pattern: string;
}
export interface ScaleSig {
    dimension: 'scale';
    scale: string;
}
export interface PositionSig {
    dimension: 'position';
    position: string;
}
export interface NotePatternSig {
    dimension: 'note-pattern';
    pattern: string;
}
export type Tonality = 'major' | 'minor';
export type Signature = RhythmSig | ScaleSig | PositionSig | NotePatternSig;
export declare function sigId(sig: Signature): string;
export declare function parseSigId(id: string): Signature;
export interface SignatureStats {
    signatureId: string;
    dimension: string;
    bestNpm: number;
    emaNpm: number;
    attempts: number;
    lastSeen: string | null;
    hasExpanded: boolean;
    masteryStreak: number;
    isMastered: boolean;
}
export interface Compound {
    scale: string;
    position: string;
    rhythm: string;
    rhythmPattern: string;
    notePattern?: string;
    articulation?: string;
}
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
export interface DimensionTierConfig {
    name: string;
    tier: number;
    unlockRequirement?: number;
    entryPoint: string;
}
export interface CompoundScoringConfig {
    consolidationWeight: number;
    stalenessWeight: number;
    readinessWeight: number;
    diversityWeight: number;
    stalenessSessions: number;
    transferCoefficients: Record<string, number>;
}
export interface NpmTiers {
    struggling: number;
    developing: number;
    progressing: number;
    fast: number;
    veryFast: number;
    superFast: number;
}
export interface StrugglingConfig {
    streakThreshold: number;
}
export interface Settings {
    emaAlpha: number;
    stability: {
        minAttempts: number;
        emaRatio: number;
    };
    progression: {
        expansionNpm: number;
        masteryNpm: number;
        masteryStreak: number;
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
export declare const DEFAULT_SETTINGS: Settings;
//# sourceMappingURL=types.d.ts.map