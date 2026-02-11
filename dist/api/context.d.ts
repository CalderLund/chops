import { Repository } from '../db/repository.js';
import { Engine } from '../core/engine.js';
import { Settings } from '../types.js';
export declare function getContext(userName?: string): {
    engine: Engine;
    repo: Repository;
    settings: Settings;
    dimensions: {
        rhythmDim: import("../dimensions/rhythm/index.js").RhythmDimension;
        scaleDim: import("../dimensions/scale/index.js").ScaleDimension;
        positionDim: import("../dimensions/position/index.js").PositionDimension;
        notePatternDim: import("../dimensions/note-pattern/index.js").NotePatternDimension;
    };
};
export declare function clearContextCache(): void;
//# sourceMappingURL=context.d.ts.map