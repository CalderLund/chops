import { RhythmSig } from '../../types.js';
import { IDimension } from '../dimension.js';
export declare class RhythmDimension implements IDimension<RhythmSig> {
    name: string;
    private config;
    private rhythmMap;
    constructor(configPath?: string);
    getEntryPoint(): RhythmSig;
    private getContinuousPattern;
    getSignatures(): RhythmSig[];
    getNeighbors(sig: RhythmSig): RhythmSig[];
    isNeighbor(a: RhythmSig, b: RhythmSig): boolean;
    describe(sig: RhythmSig): string;
    getNotesPerBeat(sig: RhythmSig): number;
    getAvailableRhythms(): string[];
    getPatternForRhythm(rhythmId: string): string;
    getPrerequisites(rhythmId: string): string[];
}
//# sourceMappingURL=index.d.ts.map