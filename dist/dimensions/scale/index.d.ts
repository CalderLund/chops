import { ScaleSig } from '../../types.js';
import { IDimension } from '../dimension.js';
export declare class ScaleDimension implements IDimension<ScaleSig> {
    name: string;
    private config;
    private scaleMap;
    constructor(configPath?: string);
    getEntryPoint(): ScaleSig;
    getSignatures(): ScaleSig[];
    getNeighbors(sig: ScaleSig): ScaleSig[];
    isNeighbor(a: ScaleSig, b: ScaleSig): boolean;
    describe(sig: ScaleSig): string;
    private capitalize;
    getAvailableScales(): string[];
    getPrerequisites(scaleId: string): string[];
}
//# sourceMappingURL=index.d.ts.map