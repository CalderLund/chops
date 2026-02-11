import { PositionSig } from '../../types.js';
import { IDimension } from '../dimension.js';
export declare class PositionDimension implements IDimension<PositionSig> {
    name: string;
    private config;
    private positionMap;
    constructor(configPath?: string);
    getEntryPoint(): PositionSig;
    getSignatures(): PositionSig[];
    getNeighbors(sig: PositionSig): PositionSig[];
    isNeighbor(a: PositionSig, b: PositionSig): boolean;
    describe(sig: PositionSig): string;
    getAvailablePositions(): string[];
    getPrerequisites(positionId: string): string[];
}
//# sourceMappingURL=index.d.ts.map