import { Signature } from '../types.js';

// Plugin contract for dimensions
export interface IDimension<T extends Signature> {
  name: string;

  // Entry point for beginners
  getEntryPoint(): T;

  // Get all valid signatures for this dimension
  getSignatures(): T[];

  // Given a signature, return its 1-step neighbors
  getNeighbors(sig: T): T[];

  // Is A a neighbor of B? (Used for proximity scoring)
  isNeighbor(a: T, b: T): boolean;

  // For display: "8ths continuous" or "Pentatonic Position 1"
  describe(sig: T): string;

  // For normalization (rhythm only): notes per beat
  getNotesPerBeat?(sig: T): number;

  // Is `to` a forward (progression) neighbor of `from`?
  // Forward means "next step" in the learning progression, not "previous step".
  isForwardNeighbor?(from: T, to: T): boolean;

  // Get the difficulty tier for a value (lower = easier)
  getTier?(sig: T): number;
}
