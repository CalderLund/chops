import path from 'path';
import { RhythmDimension } from './rhythm/index.js';
import { ScaleDimension } from './scale/index.js';
import { PositionDimension } from './position/index.js';
import { NotePatternDimension } from './note-pattern/index.js';
// Central registry for all dimensions.
// Replaces the 3-place registration pattern (Engine, CLI, API context).
export class DimensionRegistry {
    dimensions = new Map();
    register(dimension) {
        this.dimensions.set(dimension.name, dimension);
    }
    get(name) {
        const dim = this.dimensions.get(name);
        if (!dim) {
            throw new Error(`Dimension not found: ${name}`);
        }
        return dim;
    }
    has(name) {
        return this.dimensions.has(name);
    }
    getAll() {
        return Array.from(this.dimensions.values());
    }
    getDimensionNames() {
        return Array.from(this.dimensions.keys());
    }
    // Typed convenience accessors for known dimensions
    get rhythmDim() {
        return this.get('rhythm');
    }
    get scaleDim() {
        return this.get('scale');
    }
    get positionDim() {
        return this.get('position');
    }
    get notePatternDim() {
        return this.get('note-pattern');
    }
    // Factory: create registry with all default dimensions
    static createDefault(configDir) {
        const dir = configDir ?? path.join(process.cwd(), 'config');
        const registry = new DimensionRegistry();
        registry.register(new RhythmDimension(path.join(dir, 'rhythm.yaml')));
        registry.register(new ScaleDimension(path.join(dir, 'scale.yaml')));
        registry.register(new PositionDimension(path.join(dir, 'position.yaml')));
        registry.register(new NotePatternDimension(path.join(dir, 'note-pattern.yaml')));
        return registry;
    }
}
//# sourceMappingURL=registry.js.map