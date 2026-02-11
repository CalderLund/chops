import { RhythmSig, ScaleSig, PositionSig, NotePatternSig, Tonality, Settings, Compound } from '../types.js';
import { Repository, PracticeEntry } from '../db/repository.js';
import { RhythmDimension } from '../dimensions/rhythm/index.js';
import { ScaleDimension } from '../dimensions/scale/index.js';
import { PositionDimension } from '../dimensions/position/index.js';
import { NotePatternDimension } from '../dimensions/note-pattern/index.js';
import { DimensionRegistry } from '../dimensions/registry.js';
import { Suggestion, SuggestionStore } from '../db/suggestion.js';
export interface Candidate {
    rhythm: RhythmSig;
    scale: ScaleSig;
    position: PositionSig;
    notePattern: NotePatternSig;
}
export interface CompoundCandidate {
    compound: Compound;
    score: number;
}
export declare class Engine {
    private suggestionStore;
    private rhythmDim;
    private scaleDim;
    private positionDim;
    private notePatternDim;
    private _registry;
    private settings;
    private randomFn;
    private repo;
    constructor(repo: Repository, registryOrRhythm: DimensionRegistry | RhythmDimension, scaleOrSettings?: ScaleDimension | Settings, positionOrRandom?: PositionDimension | (() => number), notePatternOrStore?: NotePatternDimension | SuggestionStore, settingsOrUndef?: Settings, randomFnOrUndef?: () => number, suggestionStoreOrUndef?: SuggestionStore);
    get registry(): DimensionRegistry;
    generateSuggestion(): Suggestion;
    getLastSuggestion(): Suggestion | null;
    logPractice(rhythm: RhythmSig, scale: ScaleSig, tonality: Tonality, position: PositionSig, notePattern: NotePatternSig, key: string, bpm: number, reasoning?: string | null): PracticeEntry;
    logLastSuggestion(bpm: number): PracticeEntry;
    private generateCandidates;
    private isSignatureMastered;
    private isCandidateMastered;
    private generateUnmasteredCandidate;
    private findUnmasteredRhythm;
    private findUnmasteredScale;
    private findUnmasteredPosition;
    private findUnmasteredNotePattern;
    private generateReasoning;
    getAvailableRhythms(): string[];
    getPatternForRhythm(rhythmId: string): string;
    getAvailableScales(): string[];
    getAvailablePositions(): string[];
    getAvailableNotePatterns(): string[];
    getAvailableKeys(): string[];
    checkDimensionUnlocks(): string[];
    getCurrentCompound(): Compound;
    generateCompoundCandidates(current: Compound): CompoundCandidate[];
    generateAllCompoundCandidates(): CompoundCandidate[];
    private calculateRecencyBoost;
    private deduplicateCandidates;
    private buildCompoundScoringContext;
    private isCompoundMastered;
    generateCompoundSuggestion(): Suggestion;
    private generateCompoundReasoning;
    logCompoundPractice(rhythm: RhythmSig, scale: ScaleSig, tonality: Tonality, position: PositionSig, notePattern: NotePatternSig, key: string, bpm: number, reasoning?: string | null): PracticeEntry;
    getStrugglingProficiencies(): Array<{
        dimension: string;
        value: string;
        compoundId: string;
        streak: number;
    }>;
    getStrugglingCompounds(): Array<{
        id: string;
        strugglingStreak: number;
        scale: string;
        position: string;
        rhythm: string;
        notePattern: string | null;
    }>;
    getNpmTier(npm: number): string;
    removeProficiency(dimension: string, value: string): void;
}
//# sourceMappingURL=engine.d.ts.map