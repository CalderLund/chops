import { RhythmSig, ScaleSig, PositionSig, NotePatternSig, SignatureStats, Settings } from '../types.js';
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
export declare function scoreCandidate(rhythm: RhythmSig, scale: ScaleSig, position: PositionSig, notePattern: NotePatternSig, context: ScoringContext): number;
export declare function weightedRandomSelect<T>(items: T[], scores: number[], random?: () => number): T;
//# sourceMappingURL=scoring.d.ts.map