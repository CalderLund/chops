import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createInMemoryDatabase } from '../../src/db/schema.js';
import { Repository, PracticeEntry } from '../../src/db/repository.js';
import { Engine } from '../../src/core/engine.js';
import { RhythmDimension } from '../../src/dimensions/rhythm/index.js';
import { ScaleDimension } from '../../src/dimensions/scale/index.js';
import { PositionDimension } from '../../src/dimensions/position/index.js';
import { NotePatternDimension } from '../../src/dimensions/note-pattern/index.js';
import { DimensionRegistry } from '../../src/dimensions/registry.js';
import {
  Settings,
  DEFAULT_SETTINGS,
  RhythmSig,
  ScaleSig,
  PositionSig,
  NotePatternSig,
} from '../../src/types.js';
import { Suggestion, InMemorySuggestionStore } from '../../src/db/suggestion.js';
import Database from 'better-sqlite3';

export interface HistoryEntry {
  date: string;
  rhythm: { rhythm: string; pattern: string };
  scale: { scale: string };
  position: { position: string };
  notePattern?: { pattern: string };
  key: string;
  bpm: number;
}

export interface ScenarioFixture {
  name: string;
  seed: number;
  history: HistoryEntry[];
  assertions?: {
    next_assignment?: {
      should_include_neighbor?: boolean;
      max_dimension_changes?: number;
    };
    invariants?: string[];
  };
}

export function loadScenario(fixturePath: string): ScenarioFixture {
  const content = fs.readFileSync(fixturePath, 'utf8');
  return yaml.load(content) as ScenarioFixture;
}

export function createSeededRandom(seed: number): () => number {
  // Simple LCG random number generator
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export interface TestContext {
  db: Database.Database;
  repo: Repository;
  engine: Engine;
  rhythmDim: RhythmDimension;
  scaleDim: ScaleDimension;
  positionDim: PositionDimension;
  notePatternDim: NotePatternDimension;
  settings: Settings;
}

export function createTestContext(
  seed: number = 12345,
  settings: Settings = DEFAULT_SETTINGS,
): TestContext {
  const db = createInMemoryDatabase();
  const repo = new Repository(db);

  // Get config paths relative to project root
  const configDir = path.join(process.cwd(), 'config');
  const registry = DimensionRegistry.createDefault(configDir);
  const rhythmDim = registry.rhythmDim;
  const scaleDim = registry.scaleDim;
  const positionDim = registry.positionDim;
  const notePatternDim = registry.notePatternDim;

  const randomFn = createSeededRandom(seed);
  const suggestionStore = new InMemorySuggestionStore();
  const engine = new Engine(repo, registry, settings, randomFn, suggestionStore);

  return { db, repo, engine, rhythmDim, scaleDim, positionDim, notePatternDim, settings };
}

export function loadHistory(ctx: TestContext, history: HistoryEntry[]): void {
  for (const entry of history) {
    const rhythm: RhythmSig = {
      dimension: 'rhythm',
      rhythm: entry.rhythm.rhythm,
      pattern: entry.rhythm.pattern,
    };
    const scale: ScaleSig = {
      dimension: 'scale',
      scale: entry.scale.scale,
    };
    const position: PositionSig = {
      dimension: 'position',
      position: entry.position.position,
    };
    const notePattern: NotePatternSig = {
      dimension: 'note-pattern',
      pattern: entry.notePattern?.pattern ?? 'stepwise',
    };

    // Log directly (not through engine to avoid suggestion file writes)
    const notesPerBeat = ctx.rhythmDim.getNotesPerBeat(rhythm);
    const npm = entry.bpm * notesPerBeat;
    ctx.repo.logPractice(
      rhythm,
      scale,
      position,
      notePattern,
      entry.key,
      entry.bpm,
      npm,
      'Test history entry',
      ctx.settings.emaAlpha,
    );
  }
}

export function countDimensionChanges(
  prev: Suggestion | PracticeEntry,
  next: Suggestion | PracticeEntry,
): number {
  let changes = 0;
  if (prev.rhythm.rhythm !== next.rhythm.rhythm || prev.rhythm.pattern !== next.rhythm.pattern) {
    changes++;
  }
  if (prev.scale.scale !== next.scale.scale) {
    changes++;
  }
  if (prev.position.position !== next.position.position) {
    changes++;
  }
  if (prev.notePattern.pattern !== next.notePattern.pattern) {
    changes++;
  }
  return changes;
}
