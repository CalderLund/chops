import { Signature } from '../types.js';
export interface IDimension<T extends Signature> {
    name: string;
    getEntryPoint(): T;
    getSignatures(): T[];
    getNeighbors(sig: T): T[];
    isNeighbor(a: T, b: T): boolean;
    describe(sig: T): string;
    getNotesPerBeat?(sig: T): number;
}
//# sourceMappingURL=dimension.d.ts.map