import { Signature } from '../types.js';
import { IDimension } from './dimension.js';
import { RhythmDimension } from './rhythm/index.js';
import { ScaleDimension } from './scale/index.js';
import { PositionDimension } from './position/index.js';
import { NotePatternDimension } from './note-pattern/index.js';
export declare class DimensionRegistry {
    private dimensions;
    register<T extends Signature>(dimension: IDimension<T>): void;
    get<T extends Signature>(name: string): IDimension<T>;
    has(name: string): boolean;
    getAll(): IDimension<Signature>[];
    getDimensionNames(): string[];
    get rhythmDim(): RhythmDimension;
    get scaleDim(): ScaleDimension;
    get positionDim(): PositionDimension;
    get notePatternDim(): NotePatternDimension;
    static createDefault(configDir?: string): DimensionRegistry;
}
//# sourceMappingURL=registry.d.ts.map