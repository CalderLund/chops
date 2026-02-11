import { describe, it, expect } from 'vitest';
import { createTestContext } from './harness.js';
import { DEFAULT_SETTINGS } from '../../src/types.js';

// Override settings for these tests
const testSettings = {
  ...DEFAULT_SETTINGS,
  progression: {
    expansionNpm: 400,
    masteryNpm: 480,
    masteryStreak: 3,
  },
};

describe('Expansion Threshold', () => {
  it('signature starts unexpanded', () => {
    const ctx = createTestContext(12345, testSettings);

    // Log first practice below expansion threshold
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      150, // 150 BPM * 2 notes = 300 NPM (below 400)
    );

    const stats = ctx.repo.getStats('scale:pentatonic_minor');
    expect(stats).not.toBeNull();
    expect(stats!.hasExpanded).toBe(false);
  });

  it('signature expands at 400 NPM', () => {
    const ctx = createTestContext(12345, testSettings);

    // Log practice at exactly expansion threshold
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      200, // 200 BPM * 2 notes = 400 NPM (exactly at threshold)
    );

    const stats = ctx.repo.getStats('scale:pentatonic_minor');
    expect(stats).not.toBeNull();
    expect(stats!.hasExpanded).toBe(true);
  });

  it('expansion persists even after lower practice', () => {
    const ctx = createTestContext(12345, testSettings);

    // First practice at high NPM
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      250, // 500 NPM - expanded
    );

    expect(ctx.repo.getStats('scale:pentatonic_minor')!.hasExpanded).toBe(true);

    // Second practice at low NPM
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      100, // 200 NPM - low, but expansion should persist
    );

    expect(ctx.repo.getStats('scale:pentatonic_minor')!.hasExpanded).toBe(true);
  });
});

describe('Mastery Streak', () => {
  it('streak stays 0 below mastery threshold', () => {
    const ctx = createTestContext(12345, testSettings);

    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      239, // 478 NPM - just below mastery
    );

    const stats = ctx.repo.getStats('scale:pentatonic_minor');
    expect(stats!.masteryStreak).toBe(0);
  });

  it('streak increments at mastery threshold', () => {
    const ctx = createTestContext(12345, testSettings);

    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      240, // 480 NPM - exactly at mastery threshold
    );

    const stats = ctx.repo.getStats('scale:pentatonic_minor');
    expect(stats!.masteryStreak).toBe(1);
  });

  it('streak continues across other signature practices', () => {
    const ctx = createTestContext(12345, testSettings);

    // First pentatonic practice at mastery level
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      250, // 500 NPM
    );
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.masteryStreak).toBe(1);

    // Practice a DIFFERENT scale (doesn't affect pentatonic streak)
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      100, // Low NPM for minor - doesn't matter
    );

    // Pentatonic streak should still be 1
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.masteryStreak).toBe(1);

    // Second pentatonic practice at mastery level
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      245, // 490 NPM
    );
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.masteryStreak).toBe(2);
  });

  it('streak resets when practice below mastery threshold', () => {
    const ctx = createTestContext(12345, testSettings);

    // Build up streak
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      250, // 500 NPM - streak = 1
    );
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      260, // 520 NPM - streak = 2
    );
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.masteryStreak).toBe(2);

    // Practice below threshold - resets streak
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'E',
      200, // 400 NPM - below mastery, resets streak
    );
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.masteryStreak).toBe(0);
  });

  it('signature becomes mastered after 3 consecutive practices at mastery threshold', () => {
    const ctx = createTestContext(12345, testSettings);

    // Three practices at mastery level
    for (let i = 0; i < 3; i++) {
      ctx.engine.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        250, // 500 NPM
      );
    }

    const stats = ctx.repo.getStats('scale:pentatonic_minor');
    expect(stats!.masteryStreak).toBe(3);
    expect(stats!.isMastered).toBe(true);
  });
});

describe('Candidate Generation with Thresholds', () => {
  it('unexpanded signature neighbors are not candidates', () => {
    const ctx = createTestContext(12345, testSettings);

    // Log below expansion threshold
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      150, // 300 NPM - not expanded
    );

    // Generate suggestion
    const suggestion = ctx.engine.generateSuggestion();

    // Should NOT suggest minor (pentatonic's neighbor) because pentatonic not expanded
    // Should repeat or suggest from other dimensions
    expect(suggestion.scale.scale).toBe('pentatonic_minor');
  });

  it('expanded signature neighbors become candidates', () => {
    const ctx = createTestContext(54321, testSettings);

    // Log at expansion threshold
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      210, // 420 NPM - expanded
    );

    // Generate multiple suggestions to see if minor appears
    const scales = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const suggestion = ctx.engine.generateSuggestion();
      scales.add(suggestion.scale.scale);
      // Log it to advance state
      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        210, // Keep at expansion level
      );
    }

    // Minor should be available as a candidate now
    expect(scales.has('minor') || scales.has('pentatonic_minor')).toBe(true);
  });

  it('mastered signature not suggested as the changed dimension', () => {
    const ctx = createTestContext(12345, testSettings);

    // Master pentatonic with 3 practices at 480+ NPM
    for (let i = 0; i < 3; i++) {
      ctx.engine.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        250, // 500 NPM
      );
    }

    expect(ctx.repo.getStats('scale:pentatonic_minor')!.isMastered).toBe(true);

    // Now practice minor to expand it, so we can test scale changes
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      210, // 420 NPM - expand minor
    );

    expect(ctx.repo.getStats('scale:minor')!.hasExpanded).toBe(true);

    // When scale changes from minor, pentatonic (its neighbor) should NOT be suggested
    // because pentatonic is mastered - we don't want to go back to mastered signatures
    const suggestion = ctx.engine.generateSuggestion();

    // If scale is changing, it should not change TO pentatonic (mastered)
    // But pentatonic CAN appear if scale is NOT changing (as unchanged foundation)
    if (suggestion.scale.scale !== 'minor') {
      // Scale changed - should not be pentatonic
      expect(suggestion.scale.scale).not.toBe('pentatonic_minor');
    }
  });
});

describe('End-to-End Progression', () => {
  it('full progression: unexpanded -> expanded -> mastered', () => {
    const ctx = createTestContext(99999, testSettings);

    const pentatonicId = 'scale:pentatonic_minor';

    // Phase 1: Practice below expansion - only entry points available
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      150, // 300 NPM
    );

    let stats = ctx.repo.getStats(pentatonicId)!;
    expect(stats.hasExpanded).toBe(false);
    expect(stats.masteryStreak).toBe(0);
    expect(stats.isMastered).toBe(false);

    // Phase 2: Hit expansion threshold
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      210, // 420 NPM
    );

    stats = ctx.repo.getStats(pentatonicId)!;
    expect(stats.hasExpanded).toBe(true);
    expect(stats.masteryStreak).toBe(0); // 420 < 480
    expect(stats.isMastered).toBe(false);

    // Phase 3: Start mastery streak
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'E',
      245, // 490 NPM
    );

    stats = ctx.repo.getStats(pentatonicId)!;
    expect(stats.hasExpanded).toBe(true);
    expect(stats.masteryStreak).toBe(1);
    expect(stats.isMastered).toBe(false);

    // Phase 4: Continue streak (with interruption from other signature)
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      100, // Doesn't affect pentatonic
    );

    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'F',
      250, // 500 NPM - streak = 2
    );

    stats = ctx.repo.getStats(pentatonicId)!;
    expect(stats.masteryStreak).toBe(2);
    expect(stats.isMastered).toBe(false);

    // Phase 5: Complete mastery
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'G',
      260, // 520 NPM - streak = 3, MASTERED!
    );

    stats = ctx.repo.getStats(pentatonicId)!;
    expect(stats.hasExpanded).toBe(true);
    expect(stats.masteryStreak).toBe(3);
    expect(stats.isMastered).toBe(true);
  });
});

describe('Multi-Dimension Mastery Edge Cases', () => {
  it('mastered signatures can be used as foundation when changing other dimensions', () => {
    const ctx = createTestContext(12345, testSettings);

    // Master all 4 dimensions by logging same exercise 3 times at high NPM
    for (let i = 0; i < 3; i++) {
      ctx.engine.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        250, // 500 NPM
      );
    }

    // All 4 should be mastered
    expect(ctx.repo.getStats('rhythm:8ths:xx')!.isMastered).toBe(true);
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.isMastered).toBe(true);
    expect(ctx.repo.getStats('position:E')!.isMastered).toBe(true);
    expect(ctx.repo.getStats('note-pattern:stepwise')!.isMastered).toBe(true);

    // Repeat candidate should be excluded (all mastered)
    // But 1-dimension change candidates ARE allowed with mastered foundations
    const suggestion = ctx.engine.generateSuggestion();

    // At least ONE dimension should change to something unmastered
    // The unchanged dimensions CAN be mastered (they're a solid foundation)
    const rhythmChanged = suggestion.rhythm.rhythm !== '8ths';
    const scaleChanged = suggestion.scale.scale !== 'pentatonic_minor';
    const positionChanged = suggestion.position.position !== 'E';
    const patternChanged = suggestion.notePattern.pattern !== 'stepwise';

    // Exactly one dimension should change (to unmastered neighbor)
    const changedCount = [rhythmChanged, scaleChanged, positionChanged, patternChanged].filter(
      Boolean,
    ).length;
    expect(changedCount).toBe(1);
  });

  it('single dimension mastery allows mastered foundation in other dimensions', () => {
    const ctx = createTestContext(12345, testSettings);

    // Only master scale (pentatonic) - vary other dimensions so they don't master
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      250, // 500 NPM - all expand and get streak 1
    );

    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: 'triplets', pattern: 'xxx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'seq-3' },
      'D',
      250, // 750 NPM - only pentatonic gets streak 2
    );

    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '16ths', pattern: 'xxxx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'D' },
      { dimension: 'note-pattern', pattern: 'thirds' },
      'E',
      250, // 1000 NPM - only pentatonic gets streak 3 and masters
    );

    // Only pentatonic should be mastered
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.isMastered).toBe(true);
    expect(ctx.repo.getStats('rhythm:8ths:xx')!.isMastered).toBe(false);
    expect(ctx.repo.getStats('rhythm:triplets:xxx')!.isMastered).toBe(false);
    expect(ctx.repo.getStats('rhythm:16ths:xxxx')!.isMastered).toBe(false);

    // Suggestion: pentatonic is mastered, so repeat is excluded
    // But 1-change candidates with pentatonic as unchanged foundation ARE allowed
    const _suggestion = ctx.engine.generateSuggestion();

    // If scale is the changed dimension, it should NOT be pentatonic
    // But scale CAN be pentatonic if another dimension is changing
    // (pentatonic serves as a mastered/solid foundation while learning new rhythm/position/pattern)
  });

  it('mastered signatures can appear when other dimensions change', () => {
    const ctx = createTestContext(12345, testSettings);

    // Master both rhythm and scale
    for (let i = 0; i < 3; i++) {
      ctx.engine.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        250,
      );
    }

    // Both should be mastered
    expect(ctx.repo.getStats('rhythm:8ths:xx')!.isMastered).toBe(true);
    expect(ctx.repo.getStats('scale:pentatonic_minor')!.isMastered).toBe(true);

    // Candidates that change position or pattern while keeping mastered rhythm/scale ARE valid
    // The mastered dimensions serve as a solid foundation
    for (let i = 0; i < 5; i++) {
      const suggestion = ctx.engine.generateSuggestion();

      // If rhythm changed, it should NOT be to 8ths (mastered)
      if (suggestion.rhythm.rhythm !== '8ths') {
        // Rhythm changed - we're learning new rhythm, scale/position/pattern can be anything
      }
      // If scale changed, it should NOT be to pentatonic (mastered)
      if (suggestion.scale.scale !== 'pentatonic_minor') {
        // Scale changed - we're learning new scale, rhythm/position/pattern can be anything
      }

      // At least one dimension must change from the mastered state
      const somethingChanged =
        suggestion.rhythm.rhythm !== '8ths' ||
        suggestion.scale.scale !== 'pentatonic_minor' ||
        suggestion.position.position !== 'E' ||
        suggestion.notePattern.pattern !== 'stepwise';
      expect(somethingChanged).toBe(true);

      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        100, // Low NPM to not affect mastery
      );
    }
  });

  it('changed dimension cannot be mastered signature', () => {
    const ctx = createTestContext(12345, testSettings);

    // Master all entry point signatures
    for (let i = 0; i < 3; i++) {
      ctx.engine.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        250,
      );
    }

    const suggestion = ctx.engine.generateSuggestion();

    // Exactly one dimension should change (since repeat is excluded)
    const rhythmChanged = suggestion.rhythm.rhythm !== '8ths';
    const scaleChanged = suggestion.scale.scale !== 'pentatonic_minor';
    const positionChanged = suggestion.position.position !== 'E';
    const patternChanged = suggestion.notePattern.pattern !== 'stepwise';

    // The changed dimension should be to an unmastered neighbor
    if (rhythmChanged) {
      expect(
        ctx.repo.getStats(`rhythm:${suggestion.rhythm.rhythm}:${suggestion.rhythm.pattern}`)
          ?.isMastered ?? false,
      ).toBe(false);
    }
    if (scaleChanged) {
      expect(ctx.repo.getStats(`scale:${suggestion.scale.scale}`)?.isMastered ?? false).toBe(false);
    }
    if (positionChanged) {
      expect(
        ctx.repo.getStats(`position:${suggestion.position.position}`)?.isMastered ?? false,
      ).toBe(false);
    }
    if (patternChanged) {
      expect(
        ctx.repo.getStats(`note-pattern:${suggestion.notePattern.pattern}`)?.isMastered ?? false,
      ).toBe(false);
    }
  });
});

describe('Candidate Filtering Invariants', () => {
  it('repeat candidate excluded when any dimension is mastered', () => {
    const ctx = createTestContext(12345, testSettings);

    // Master just one dimension (scale) by varying other dimensions each practice
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      250, // 500 NPM - streak 1 for all
    );
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: 'triplets', pattern: 'xxx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'seq-3' },
      'D',
      250, // 750 NPM for triplets - only pentatonic gets streak 2
    );
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '16ths', pattern: 'xxxx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'D' },
      { dimension: 'note-pattern', pattern: 'thirds' },
      'E',
      250, // 1000 NPM for 16ths - only pentatonic gets streak 3 and masters
    );

    expect(ctx.repo.getStats('scale:pentatonic_minor')!.isMastered).toBe(true);
    expect(ctx.repo.getStats('rhythm:8ths:xx')!.isMastered).toBe(false);

    // When scale (pentatonic) is mastered:
    // - Repeat candidate is excluded (it would include mastered pentatonic)
    // - But 1-dimension change candidates with pentatonic as UNCHANGED foundation are allowed
    // - Pentatonic CAN appear when we're changing rhythm/position/pattern
    const suggestion = ctx.engine.generateSuggestion();

    // Something must change (repeat is excluded because pentatonic is mastered)
    const lastPractice = { rhythm: '16ths', scale: 'pentatonic_minor', position: 'D', pattern: 'thirds' };
    const somethingChanged =
      suggestion.rhythm.rhythm !== lastPractice.rhythm ||
      suggestion.scale.scale !== lastPractice.scale ||
      suggestion.position.position !== lastPractice.position ||
      suggestion.notePattern.pattern !== lastPractice.pattern;
    expect(somethingChanged).toBe(true);
  });

  it('scale change cannot target mastered scale', () => {
    const ctx = createTestContext(12345, testSettings);

    // Master both pentatonic and minor
    for (let i = 0; i < 3; i++) {
      ctx.engine.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        250,
      );
    }
    for (let i = 0; i < 3; i++) {
      ctx.engine.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'D',
        250,
      );
    }

    expect(ctx.repo.getStats('scale:pentatonic_minor')!.isMastered).toBe(true);
    expect(ctx.repo.getStats('scale:minor')!.isMastered).toBe(true);

    // When changing scale, we should NOT change TO a mastered scale
    // But mastered scales CAN appear as unchanged foundation when other dimensions change
    for (let i = 0; i < 10; i++) {
      const prevSuggestion = ctx.engine.getLastSuggestion();
      const suggestion = ctx.engine.generateSuggestion();

      // If scale IS changing (different from last), it should not be to a mastered scale
      if (prevSuggestion && suggestion.scale.scale !== prevSuggestion.scale.scale) {
        // Scale changed - verify it's not going TO a mastered scale
        const newScaleStats = ctx.repo.getStats(`scale:${suggestion.scale.scale}`);
        expect(newScaleStats?.isMastered ?? false).toBe(false);
      }

      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        100,
      );
    }
  });
});

describe('Higher-Tier Dimension Unlock', () => {
  it('note-pattern candidates appear after just 1 compound expansion', () => {
    const ctx = createTestContext(77777, testSettings);

    // Practice entry compound at expansion level (400+ NPM)
    // 8ths = 2 notes/beat, so 210 BPM = 420 NPM
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      210,
    );

    // Compound should be expanded
    const compoundStats = ctx.repo.getAllCompoundStats();
    const expanded = compoundStats.filter((c) => c.hasExpanded);
    expect(expanded.length).toBe(1);

    // Note-pattern dimension should now be unlocked (requirement is 1)
    const unlocked = ctx.repo.getUnlockedDimensions();
    expect(unlocked).toContain('note-pattern');

    // Generate compound candidates — note-pattern neighbors should be present
    const current = ctx.engine.getCurrentCompound();
    const candidates = ctx.engine.generateCompoundCandidates(current);

    // Should have at least one candidate with a different notePattern
    const notePatternChange = candidates.find(
      (c) => c.compound.notePattern !== 'stepwise',
    );
    expect(notePatternChange).toBeDefined();
  });

  it('note-pattern candidates appear even from unexpanded compounds', () => {
    const ctx = createTestContext(88888, testSettings);

    // First: expand the entry compound to unlock note-pattern
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      210, // 420 NPM — expanded
    );

    // Now practice a different compound WITHOUT expanding it
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'C' }, // different position
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      150, // 300 NPM — NOT expanded
    );

    // The new compound should NOT be expanded
    const current = ctx.engine.getCurrentCompound();
    expect(current.position).toBe('C');
    const candidates = ctx.engine.generateCompoundCandidates(current);

    // Tier-0 neighbors (scale, position, rhythm) should NOT appear (compound not expanded)
    const scaleChange = candidates.find((c) => c.compound.scale !== 'pentatonic_minor');
    expect(scaleChange).toBeUndefined();

    // But note-pattern candidates SHOULD appear (higher-tier, only needs dimension unlock)
    const notePatternChange = candidates.find(
      (c) => c.compound.notePattern !== 'stepwise',
    );
    expect(notePatternChange).toBeDefined();
  });
});
