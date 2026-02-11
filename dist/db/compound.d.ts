import { Compound, CompoundStats } from '../types.js';
export declare function compoundId(compound: Compound): string;
export declare function parseCompoundId(id: string): Compound;
export declare function compoundsEqual(a: Compound, b: Compound): boolean;
export declare function getChangedDimension(from: Compound, to: Compound): string | null;
export declare function countDimensionChanges(from: Compound, to: Compound): number;
export declare function getActiveDimensionCount(compound: Compound): number;
export declare function createEntryCompound(scaleEntry: string, positionEntry: string, rhythmEntry: string, rhythmPatternEntry: string, notePatternEntry?: string, articulationEntry?: string): Compound;
export declare function statsToCompound(stats: CompoundStats): Compound;
//# sourceMappingURL=compound.d.ts.map