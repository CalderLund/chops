import path from 'path';
import { Signature } from '../types.js';
import { IDimension } from './dimension.js';
import { RhythmDimension } from './rhythm/index.js';
import { ScaleDimension } from './scale/index.js';
import { PositionDimension } from './position/index.js';
import { NotePatternDimension } from './note-pattern/index.js';

// Central registry for all dimensions.
// Replaces the 3-place registration pattern (Engine, CLI, API context).
export class DimensionRegistry {
  private dimensions = new Map<string, IDimension<Signature>>();

  register<T extends Signature>(dimension: IDimension<T>): void {
    this.dimensions.set(dimension.name, dimension as IDimension<Signature>);
  }

  get<T extends Signature>(name: string): IDimension<T> {
    const dim = this.dimensions.get(name);
    if (!dim) {
      throw new Error(`Dimension not found: ${name}`);
    }
    return dim as IDimension<T>;
  }

  has(name: string): boolean {
    return this.dimensions.has(name);
  }

  getAll(): IDimension<Signature>[] {
    return Array.from(this.dimensions.values());
  }

  getDimensionNames(): string[] {
    return Array.from(this.dimensions.keys());
  }

  // Typed convenience accessors for known dimensions
  get rhythmDim(): RhythmDimension {
    return this.get<never>('rhythm') as unknown as RhythmDimension;
  }

  get scaleDim(): ScaleDimension {
    return this.get<never>('scale') as unknown as ScaleDimension;
  }

  get positionDim(): PositionDimension {
    return this.get<never>('position') as unknown as PositionDimension;
  }

  get notePatternDim(): NotePatternDimension {
    return this.get<never>('note-pattern') as unknown as NotePatternDimension;
  }

  // Factory: create registry with all default dimensions
  static createDefault(configDir?: string): DimensionRegistry {
    const dir = configDir ?? path.join(process.cwd(), 'config');
    const registry = new DimensionRegistry();
    registry.register(new RhythmDimension(path.join(dir, 'rhythm.yaml')));
    registry.register(new ScaleDimension(path.join(dir, 'scale.yaml')));
    registry.register(new PositionDimension(path.join(dir, 'position.yaml')));
    registry.register(new NotePatternDimension(path.join(dir, 'note-pattern.yaml')));
    return registry;
  }
}
