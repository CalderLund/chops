import { NotePatternSig } from '../../types.js';
import { IDimension } from '../dimension.js';
export declare class NotePatternDimension implements IDimension<NotePatternSig> {
    name: string;
    private config;
    private patternMap;
    private patternToTier;
    private tierToPatterns;
    constructor(configPath?: string);
    getEntryPoint(): NotePatternSig;
    getSignatures(): NotePatternSig[];
    getNeighbors(sig: NotePatternSig): NotePatternSig[];
    isNeighbor(a: NotePatternSig, b: NotePatternSig): boolean;
    describe(sig: NotePatternSig): string;
    getTier(sig: NotePatternSig): number;
    getAvailablePatterns(): string[];
    getDescription(patternId: string): string;
    getPrerequisites(patternId: string): string[];
}
//# sourceMappingURL=index.d.ts.map