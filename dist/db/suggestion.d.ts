import { RhythmSig, ScaleSig, PositionSig, NotePatternSig, Tonality } from '../types.js';
export interface Suggestion {
    rhythm: RhythmSig;
    scale: ScaleSig;
    tonality: Tonality;
    position: PositionSig;
    notePattern: NotePatternSig;
    key: string;
    reasoning: string;
    generatedAt: string;
}
export interface SuggestionStore {
    save(suggestion: Suggestion): void;
    load(): Suggestion | null;
    clear(): void;
}
export declare class InMemorySuggestionStore implements SuggestionStore {
    private suggestion;
    save(suggestion: Suggestion): void;
    load(): Suggestion | null;
    clear(): void;
}
export declare class FileSuggestionStore implements SuggestionStore {
    private getSuggestionPath;
    save(suggestion: Suggestion): void;
    load(): Suggestion | null;
    clear(): void;
}
//# sourceMappingURL=suggestion.d.ts.map