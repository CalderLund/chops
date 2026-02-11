import { describe, it, expect } from 'vitest';
import { createTestContext, countDimensionChanges } from './harness.js';
import { Suggestion } from '../../src/db/suggestion.js';

describe('Multi-day Progression', () => {
  it('simulates 100 days maintaining invariants', () => {
    const ctx = createTestContext(54321);

    const suggestions: Suggestion[] = [];

    for (let day = 0; day < 100; day++) {
      const suggestion = ctx.engine.generateSuggestion();
      suggestions.push(suggestion);

      // Simulate practice with improving BPM over time
      const baseBpm = 60 + Math.floor(day / 10) * 5;
      const variation = Math.floor(Math.random() * 10) - 5;
      const bpm = baseBpm + variation;

      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        Math.max(40, bpm),
      );
    }

    // Check invariants
    for (let i = 1; i < suggestions.length; i++) {
      const prev = suggestions[i - 1];
      const curr = suggestions[i];

      // Max 1 dimension change
      const changes = countDimensionChanges(prev, curr);
      expect(changes).toBeLessThanOrEqual(1);
    }
  });

  it('explores multiple signatures over time', () => {
    const ctx = createTestContext(11111);

    const rhythmSigs = new Set<string>();
    const scaleSigs = new Set<string>();
    const positionSigs = new Set<string>();
    const notePatternSigs = new Set<string>();

    for (let day = 0; day < 50; day++) {
      const suggestion = ctx.engine.generateSuggestion();

      rhythmSigs.add(`${suggestion.rhythm.rhythm}:${suggestion.rhythm.pattern}`);
      scaleSigs.add(suggestion.scale.scale);
      positionSigs.add(suggestion.position.position);
      notePatternSigs.add(suggestion.notePattern.pattern);

      // Use BPM high enough to trigger expansion (400 NPM threshold)
      // For 8ths (2 notes/beat): 200 BPM = 400 NPM (expansion)
      // For triplets (3 notes/beat): 134 BPM = 400 NPM
      // For 16ths (4 notes/beat): 100 BPM = 400 NPM
      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        200 + Math.floor(Math.random() * 20), // 200-220 BPM to trigger expansion
      );
    }

    // Should have explored at least a few different signatures
    // With expansion enabled (400+ NPM), neighbors become available
    expect(rhythmSigs.size).toBeGreaterThan(1);
    // Scale and position exploration depends on stability settings
    // Note patterns may or may not vary depending on stability
  });

  it('builds stability over repeated practice', () => {
    const ctx = createTestContext(22222);

    // Practice 10 times with consistent BPM
    for (let i = 0; i < 10; i++) {
      const suggestion = ctx.engine.generateSuggestion();
      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        100,
      );
    }

    // Get all stats
    const allStats = ctx.repo.getAllStats();

    // Should have at least some stats
    expect(allStats.length).toBeGreaterThan(0);

    // Total attempts should equal 10 per dimension
    const rhythmStats = allStats.filter((s) => s.dimension === 'rhythm');
    const scaleStats = allStats.filter((s) => s.dimension === 'scale');
    const positionStats = allStats.filter((s) => s.dimension === 'position');
    const notePatternStats = allStats.filter((s) => s.dimension === 'note-pattern');

    const totalRhythmAttempts = rhythmStats.reduce((sum, s) => sum + s.attempts, 0);
    const totalScaleAttempts = scaleStats.reduce((sum, s) => sum + s.attempts, 0);
    const totalPositionAttempts = positionStats.reduce((sum, s) => sum + s.attempts, 0);
    const totalNotePatternAttempts = notePatternStats.reduce((sum, s) => sum + s.attempts, 0);

    expect(totalRhythmAttempts).toBe(10);
    expect(totalScaleAttempts).toBe(10);
    expect(totalPositionAttempts).toBe(10);
    expect(totalNotePatternAttempts).toBe(10);

    // For each signature practiced multiple times, EMA should be positive and reasonable
    for (const stat of allStats) {
      if (stat.attempts >= 2) {
        expect(stat.emaNpm).toBeGreaterThan(0);
        expect(stat.emaNpm).toBeGreaterThanOrEqual(stat.bestNpm * 0.5);
      }
    }
  });

  it('can log practices out of order (custom practices)', () => {
    const ctx = createTestContext();

    // Generate suggestion but don't log it
    ctx.engine.generateSuggestion();

    // Log some custom practices instead
    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '16ths', pattern: 'xxxx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'G',
      80,
    );

    ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: 'triplets', pattern: 'xxx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'seq-3' },
      'D',
      75,
    );

    // History should have 2 entries
    const history = ctx.repo.getRecentPractice(10);
    expect(history.length).toBe(2);

    // Most recent should be the second one logged
    expect(history[0].rhythm.pattern).toBe('xxx');
    expect(history[0].notePattern.pattern).toBe('seq-3');
    expect(history[0].key).toBe('D');
  });
});

describe('Reasoning Generation', () => {
  it('generates meaningful reasoning text', () => {
    const ctx = createTestContext();

    const suggestion = ctx.engine.generateSuggestion();
    expect(suggestion.reasoning).toBeTruthy();
    expect(suggestion.reasoning.length).toBeGreaterThan(10);
  });

  it('reasoning mentions consolidation for new users', () => {
    const ctx = createTestContext();

    // First suggestion for a new user
    const suggestion = ctx.engine.generateSuggestion();

    // Should mention something about consolidation or building
    const lower = suggestion.reasoning.toLowerCase();
    expect(
      lower.includes('consolidate') ||
        lower.includes('practice') ||
        lower.includes('exploring') ||
        lower.includes('stepping'),
    ).toBe(true);
  });
});
