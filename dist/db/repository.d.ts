import Database from 'better-sqlite3';
import { RhythmSig, ScaleSig, PositionSig, NotePatternSig, SignatureStats, CompoundStats, Compound, Tonality } from '../types.js';
export interface PracticeEntry {
    id: number;
    loggedAt: string;
    rhythm: RhythmSig;
    scale: ScaleSig;
    tonality: Tonality;
    position: PositionSig;
    notePattern: NotePatternSig;
    key: string;
    bpm: number;
    npm: number;
    reasoning: string | null;
}
export declare class Repository {
    private db;
    private userId;
    constructor(db: Database.Database, userId?: number);
    logPractice(rhythm: RhythmSig, scale: ScaleSig, tonality: Tonality, position: PositionSig, notePattern: NotePatternSig, key: string, bpm: number, npm: number, reasoning: string | null, emaAlpha: number): PracticeEntry;
    getLastPractice(): PracticeEntry | null;
    getRecentPractice(limit?: number): PracticeEntry[];
    private updateStats;
    updateProgression(signatureId: string, npm: number, expansionNpm: number, masteryNpm: number, masteryStreakRequired: number): void;
    getStats(signatureId: string): SignatureStats | null;
    getAllStats(): SignatureStats[];
    hasAnyPractice(): boolean;
    getPracticeById(id: number): PracticeEntry | null;
    updatePracticeBpm(id: number, bpm: number, npm: number): void;
    updatePractice(id: number, rhythm: RhythmSig, scale: ScaleSig, tonality: Tonality, position: PositionSig, notePattern: NotePatternSig, key: string, bpm: number, npm: number): void;
    deletePractice(id: number): void;
    getAllPractice(): PracticeEntry[];
    recalculateStats(emaAlpha: number, expansionNpm?: number, masteryNpm?: number, masteryStreakRequired?: number): void;
    recalculateCompoundStats(emaAlpha: number, expansionNpm?: number, masteryNpm?: number, masteryStreakRequired?: number, strugglingNpm?: number): void;
    recalculateAllStats(emaAlpha: number, expansionNpm?: number, masteryNpm?: number, masteryStreakRequired?: number, strugglingNpm?: number): void;
    private rowToEntry;
    getCurrentSession(): number;
    incrementSession(): number;
    getCompoundStats(id: string): CompoundStats | null;
    getOrCreateCompoundStats(compound: Compound): CompoundStats;
    updateCompoundStats(compound: Compound, npm: number, bpm: number, sessionNumber: number, emaAlpha: number, expansionNpm: number, masteryNpm: number, masteryStreakRequired: number, strugglingNpm?: number): CompoundStats;
    getAllCompoundStats(): CompoundStats[];
    setCompoundExpanded(compoundId: string, expanded: boolean): boolean;
    countExpandedCompoundsInTier(tier: number): number;
    isDimensionUnlocked(dimension: string): boolean;
    unlockDimension(dimension: string, sessionNumber: number): void;
    getUnlockedDimensions(): string[];
    migrateCompoundsForNewDimension(dimension: string, entryPoint: string): void;
    getRelatedCompounds(compound: Compound): CompoundStats[];
    getLastCompound(): Compound | null;
    getRecentDimensionChanges(lookback: number): string[];
    private rowToCompoundStats;
    isProficient(dimension: string, value: string): boolean;
    setProficient(dimension: string, value: string): void;
    removeProficient(dimension: string, value: string): void;
    getProficiencies(dimension: string): string[];
    getAllProficiencies(): Array<{
        dimension: string;
        value: string;
        declaredAt: string;
    }>;
    getStrugglingCompounds(streakThreshold: number): CompoundStats[];
    getStrugglingProficiencies(streakThreshold: number): Array<{
        dimension: string;
        value: string;
        compoundId: string;
        streak: number;
    }>;
    getStreakInfo(): {
        currentStreak: number;
        longestStreak: number;
        lastPracticeDate: string | null;
        streakFreezes: number;
    } | null;
    updateStreakData(currentStreak: number, longestStreak: number, lastPracticeDate: string, freezes: number): void;
    addStreakFreezes(count: number): void;
    earnAchievement(achievementId: string, earnedAt: string): void;
    hasAchievement(achievementId: string): boolean;
    getEarnedAchievementIds(): Array<{
        achievementId: string;
        earnedAt: string;
    }>;
    getTotalPracticeCount(): number;
    getMaxNpmAcrossCompounds(): number;
    countMasteredCompounds(): number;
    countExpandedCompounds(): number;
    getMasteredPositions(): string[];
    getDistinctPracticedValues(dimension: string): string[];
}
//# sourceMappingURL=repository.d.ts.map