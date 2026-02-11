import { describe, it, expect } from 'vitest';
import { createTestContext } from './harness.js';
import {
  compoundId,
  parseCompoundId,
  compoundsEqual,
  getChangedDimension,
} from '../../src/db/compound.js';
import { Compound } from '../../src/types.js';

describe('Compound Utilities', () => {
  it('generates compound ID correctly', () => {
    const compound: Compound = {
      scale: 'pentatonic_minor',
      position: 'E',
      rhythm: '8ths',
      rhythmPattern: 'xx',
    };
    expect(compoundId(compound)).toBe('pentatonic_minor+E+8ths:xx');
  });

  it('generates compound ID with note pattern', () => {
    const compound: Compound = {
      scale: 'pentatonic_minor',
      position: 'E',
      rhythm: '8ths',
      rhythmPattern: 'xx',
      notePattern: 'stepwise',
    };
    expect(compoundId(compound)).toBe('pentatonic_minor+E+8ths:xx+stepwise');
  });

  it('parses compound ID correctly', () => {
    const compound = parseCompoundId('pentatonic_minor+E+8ths:xx');
    expect(compound.scale).toBe('pentatonic_minor');
    expect(compound.position).toBe('E');
    expect(compound.rhythm).toBe('8ths');
    expect(compound.rhythmPattern).toBe('xx');
    expect(compound.notePattern).toBeUndefined();
  });

  it('parses compound ID with note pattern', () => {
    const compound = parseCompoundId('pentatonic_minor+E+8ths:xx+stepwise');
    expect(compound.scale).toBe('pentatonic_minor');
    expect(compound.position).toBe('E');
    expect(compound.rhythm).toBe('8ths');
    expect(compound.rhythmPattern).toBe('xx');
    expect(compound.notePattern).toBe('stepwise');
  });

  it('detects equal compounds', () => {
    const a: Compound = { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' };
    const b: Compound = { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' };
    expect(compoundsEqual(a, b)).toBe(true);
  });

  it('detects unequal compounds', () => {
    const a: Compound = { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' };
    const b: Compound = { scale: 'pentatonic_minor', position: 'D', rhythm: '8ths', rhythmPattern: 'xx' };
    expect(compoundsEqual(a, b)).toBe(false);
  });

  it('identifies changed dimension', () => {
    const a: Compound = { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' };
    const b: Compound = { scale: 'pentatonic_minor', position: 'D', rhythm: '8ths', rhythmPattern: 'xx' };
    expect(getChangedDimension(a, b)).toBe('position');
  });

  it('returns null for multiple changes', () => {
    const a: Compound = { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' };
    const b: Compound = { scale: 'minor', position: 'D', rhythm: '8ths', rhythmPattern: 'xx' };
    expect(getChangedDimension(a, b)).toBeNull();
  });
});

describe('Compound Stats Tracking', () => {
  it('creates compound stats on first practice', () => {
    const ctx = createTestContext();

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      100,
    );

    // Compounds always include all dimensions (lock only affects recommendations)
    const stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats).not.toBeNull();
    expect(stats!.attempts).toBe(1);
    expect(stats!.bestNpm).toBe(200); // 100 BPM * 2 notes
  });

  it('updates compound stats on subsequent practice', () => {
    const ctx = createTestContext();

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      100,
    );

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      150,
    );

    const stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats!.attempts).toBe(2);
    expect(stats!.bestNpm).toBe(300); // 150 BPM * 2 notes
  });

  it('tracks expansion threshold for compounds', () => {
    const ctx = createTestContext();

    // Below threshold
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      150, // 300 NPM - below 400
    );

    let stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats!.hasExpanded).toBe(false);

    // At threshold
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      210, // 420 NPM - above 400
    );

    stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats!.hasExpanded).toBe(true);
  });

  it('tracks mastery streak for compounds', () => {
    const ctx = createTestContext();

    // Three practices at mastery level
    for (let i = 0; i < 3; i++) {
      ctx.engine.logCompoundPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        250, // 500 NPM - above 480
      );
    }

    const stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats!.masteryStreak).toBe(3);
    expect(stats!.isMastered).toBe(true);
  });
});

describe('Session Tracking', () => {
  it('increments session counter', () => {
    const ctx = createTestContext();

    const initial = ctx.repo.getCurrentSession();
    expect(initial).toBe(0);

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      100,
    );

    expect(ctx.repo.getCurrentSession()).toBe(1);

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      100,
    );

    expect(ctx.repo.getCurrentSession()).toBe(2);
  });

  it('tracks last practiced session on compound', () => {
    const ctx = createTestContext();

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      100,
    );

    const stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats!.lastPracticedSession).toBe(1);
  });
});

describe('Compound Candidate Generation', () => {
  it('generates entry compound for new user', () => {
    const ctx = createTestContext();

    const compound = ctx.engine.getCurrentCompound();
    expect(compound.scale).toBe('pentatonic_minor');
    expect(compound.position).toBe('E');
    expect(compound.rhythm).toBe('8ths');
    // Compounds always include all dimensions (lock only affects recommendations)
    expect(compound.notePattern).toBe('stepwise');
  });

  it('only offers STAY candidate when not expanded', () => {
    const ctx = createTestContext();

    // First practice below expansion
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      150, // 300 NPM - not expanded
    );

    const current = ctx.engine.getCurrentCompound();
    const candidates = ctx.engine.generateCompoundCandidates(current);

    // Should only have STAY candidate
    expect(candidates.length).toBe(1);
    expect(candidates[0].compound.scale).toBe('pentatonic_minor');
    expect(candidates[0].compound.position).toBe('E');
  });

  it('offers neighbor candidates when expanded', () => {
    const ctx = createTestContext();

    // Practice at expansion level
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      210, // 420 NPM - expanded
    );

    const current = ctx.engine.getCurrentCompound();
    const candidates = ctx.engine.generateCompoundCandidates(current);

    // Should have STAY + neighbors
    expect(candidates.length).toBeGreaterThan(1);

    // Check that we have position neighbor
    const positionChange = candidates.find((c) => c.compound.position !== 'E');
    expect(positionChange).toBeDefined();
  });
});

describe('Compound Suggestion Generation', () => {
  it('generates suggestion using compound system', () => {
    const ctx = createTestContext();

    const suggestion = ctx.engine.generateCompoundSuggestion();

    expect(suggestion.scale.scale).toBe('pentatonic_minor');
    expect(suggestion.position.position).toBe('E');
    expect(suggestion.rhythm.rhythm).toBe('8ths');
    expect(suggestion.reasoning).toBeDefined();
  });

  it('maintains 1-dimension-change invariant', () => {
    const ctx = createTestContext();

    // Log first practice and expand
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      210,
    );

    // Generate 20 suggestions and verify invariant
    for (let i = 0; i < 20; i++) {
      const lastPractice = ctx.repo.getLastPractice()!;
      const suggestion = ctx.engine.generateCompoundSuggestion();

      let changes = 0;
      if (suggestion.scale.scale !== lastPractice.scale.scale) changes++;
      if (suggestion.position.position !== lastPractice.position.position) changes++;
      if (suggestion.rhythm.rhythm !== lastPractice.rhythm.rhythm) changes++;

      expect(changes).toBeLessThanOrEqual(1);

      // Log the suggestion
      ctx.engine.logCompoundPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        100 + i * 5,
      );
    }
  });
});
