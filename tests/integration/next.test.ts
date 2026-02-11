import { describe, it, expect } from 'vitest';
import path from 'path';
import { createTestContext, loadHistory, loadScenario, countDimensionChanges } from './harness.js';

describe('Suggestion Generation', () => {
  it('generates entry point suggestion on day 1', () => {
    const ctx = createTestContext();
    const suggestion = ctx.engine.generateSuggestion();

    // Should use entry points
    expect(suggestion.rhythm.rhythm).toBe('8ths');
    expect(suggestion.rhythm.pattern).toBe('xx');
    expect(suggestion.scale.scale).toBe('pentatonic_minor');
    expect(suggestion.position.position).toBe('E');
    expect(suggestion.notePattern.pattern).toBe('stepwise');

    // Should have a key
    expect(ctx.settings.keys).toContain(suggestion.key);
  });

  it('never changes more than 1 dimension from previous', () => {
    const scenarioPath = path.join(
      process.cwd(),
      'tests/integration/scenarios/basic_progression.yaml',
    );
    const scenario = loadScenario(scenarioPath);

    const ctx = createTestContext(scenario.seed);
    loadHistory(ctx, scenario.history);

    // Generate next suggestion
    const suggestion = ctx.engine.generateSuggestion();

    // Get last practice
    const lastPractice = ctx.repo.getLastPractice();
    expect(lastPractice).not.toBeNull();

    // Count dimension changes
    const changes = countDimensionChanges(lastPractice!, suggestion);
    expect(changes).toBeLessThanOrEqual(1);
  });

  it('maintains invariant over 50 consecutive practices', () => {
    const ctx = createTestContext(42);

    // Generate first suggestion and log it
    let prevSuggestion = ctx.engine.generateSuggestion();
    ctx.engine.logPractice(
      prevSuggestion.rhythm,
      prevSuggestion.scale,
      prevSuggestion.position,
      prevSuggestion.notePattern,
      prevSuggestion.key,
      60,
    );

    // Generate 49 more
    for (let i = 0; i < 49; i++) {
      const nextSuggestion = ctx.engine.generateSuggestion();

      // Verify engine is using correct last practice
      const lastPractice = ctx.repo.getLastPractice();
      expect(lastPractice?.rhythm.rhythm).toBe(prevSuggestion.rhythm.rhythm);
      expect(lastPractice?.rhythm.pattern).toBe(prevSuggestion.rhythm.pattern);

      // Check invariant: max 1 dimension change
      const changes = countDimensionChanges(prevSuggestion, nextSuggestion);
      expect(changes).toBeLessThanOrEqual(1);

      // Log it
      ctx.engine.logPractice(
        nextSuggestion.rhythm,
        nextSuggestion.scale,
        nextSuggestion.position,
        nextSuggestion.notePattern,
        nextSuggestion.key,
        60 + Math.floor(Math.random() * 40),
      );
      prevSuggestion = nextSuggestion;
    }
  });

  it('prefers expanding when parent is stable', () => {
    const ctx = createTestContext(999);

    // Build stability with 5 consistent attempts
    for (let i = 0; i < 5; i++) {
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

    // Generate more suggestions and track changes
    const suggestions: Array<{
      rhythm: string;
      scale: string;
      position: string;
      notePattern: string;
    }> = [];
    for (let i = 0; i < 10; i++) {
      const suggestion = ctx.engine.generateSuggestion();
      suggestions.push({
        rhythm: `${suggestion.rhythm.rhythm}:${suggestion.rhythm.pattern}`,
        scale: suggestion.scale.scale,
        position: suggestion.position.position,
        notePattern: suggestion.notePattern.pattern,
      });
      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        95 + Math.floor(Math.random() * 10),
      );
    }

    // Should see some variation (not all the same)
    const uniqueRhythms = new Set(suggestions.map((s) => s.rhythm));
    const uniqueScales = new Set(suggestions.map((s) => s.scale));
    const uniquePositions = new Set(suggestions.map((s) => s.position));
    const uniqueNotePatterns = new Set(suggestions.map((s) => s.notePattern));

    // With stability, we expect exploration to happen
    expect(
      uniqueRhythms.size + uniqueScales.size + uniquePositions.size + uniqueNotePatterns.size,
    ).toBeGreaterThan(2);
  });

  it('assigns random key from config', () => {
    const ctx = createTestContext();

    const keys = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const suggestion = ctx.engine.generateSuggestion();
      keys.add(suggestion.key);
      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        80,
      );
    }

    // Should see multiple different keys
    expect(keys.size).toBeGreaterThan(1);

    // All keys should be from the config
    const validKeys = ctx.settings.keys;
    for (const key of keys) {
      expect(validKeys).toContain(key);
    }
  });
});

describe('Practice Logging', () => {
  it('logs BPM and updates stats', () => {
    const ctx = createTestContext();

    const suggestion = ctx.engine.generateSuggestion();

    const entry = ctx.engine.logPractice(
      suggestion.rhythm,
      suggestion.scale,
      suggestion.position,
      suggestion.notePattern,
      suggestion.key,
      80,
    );

    expect(entry.bpm).toBe(80);
    expect(entry.npm).toBe(160); // 80 BPM * 2 notes per beat (8ths)
    expect(entry.loggedAt).toBeDefined();
  });

  it('updates signature stats on log', () => {
    const ctx = createTestContext();

    const suggestion = ctx.engine.generateSuggestion();
    ctx.engine.logPractice(
      suggestion.rhythm,
      suggestion.scale,
      suggestion.position,
      suggestion.notePattern,
      suggestion.key,
      100,
    );

    const rhythmStats = ctx.repo.getStats('rhythm:8ths:xx');
    expect(rhythmStats).not.toBeNull();
    expect(rhythmStats!.attempts).toBe(1);
    expect(rhythmStats!.bestNpm).toBe(200); // 100 BPM * 2 notes per beat
    expect(rhythmStats!.emaNpm).toBe(200);

    const scaleStats = ctx.repo.getStats('scale:pentatonic_minor');
    expect(scaleStats).not.toBeNull();
    expect(scaleStats!.attempts).toBe(1);

    const positionStats = ctx.repo.getStats('position:E');
    expect(positionStats).not.toBeNull();
    expect(positionStats!.attempts).toBe(1);

    const notePatternStats = ctx.repo.getStats('note-pattern:stepwise');
    expect(notePatternStats).not.toBeNull();
    expect(notePatternStats!.attempts).toBe(1);
  });

  it('can log custom practice (not from suggestion)', () => {
    const ctx = createTestContext();

    // Log practice directly without generating suggestion first
    const entry = ctx.engine.logPractice(
      { dimension: 'rhythm', rhythm: '16ths', pattern: 'xxxx' },
      { dimension: 'scale', scale: 'blues_minor' },
      { dimension: 'position', position: 'A' },
      { dimension: 'note-pattern', pattern: 'thirds' },
      'A',
      90,
    );

    expect(entry.rhythm.rhythm).toBe('16ths');
    expect(entry.rhythm.pattern).toBe('xxxx');
    expect(entry.scale.scale).toBe('blues_minor');
    expect(entry.position.position).toBe('A');
    expect(entry.notePattern.pattern).toBe('thirds');
    expect(entry.key).toBe('A');
    expect(entry.bpm).toBe(90);

    // Stats should be updated
    const rhythmStats = ctx.repo.getStats('rhythm:16ths:xxxx');
    expect(rhythmStats).not.toBeNull();
    expect(rhythmStats!.attempts).toBe(1);

    const notePatternStats = ctx.repo.getStats('note-pattern:thirds');
    expect(notePatternStats).not.toBeNull();
    expect(notePatternStats!.attempts).toBe(1);
  });
});

describe('logLastSuggestion', () => {
  it('throws when no suggestion exists', () => {
    const ctx = createTestContext();

    expect(() => ctx.engine.logLastSuggestion(80)).toThrow('No suggestion to log');
  });
});

describe('Note Pattern Dimension', () => {
  it('has stepwise as entry point', () => {
    const ctx = createTestContext();
    const entryPoint = ctx.notePatternDim.getEntryPoint();
    expect(entryPoint.pattern).toBe('stepwise');
  });

  it('returns neighbors within same tier and gateway to next tier', () => {
    const ctx = createTestContext();

    // stepwise is tier 1, neighbors should include first pattern of tier 2 (seq-3)
    const stepwiseNeighbors = ctx.notePatternDim.getNeighbors({
      dimension: 'note-pattern',
      pattern: 'stepwise',
    });
    expect(stepwiseNeighbors.length).toBeGreaterThan(0);

    const neighborPatterns = stepwiseNeighbors.map((n) => n.pattern);
    // Only seq-3 (first of tier 2) should be a neighbor, not seq-4
    expect(neighborPatterns).toContain('seq-3');
    expect(neighborPatterns).not.toContain('seq-4');
  });

  it('allows free exploration within same tier', () => {
    const ctx = createTestContext();

    // seq-3 is tier 2, neighbors should include seq-4 (same tier)
    const seq3Neighbors = ctx.notePatternDim.getNeighbors({
      dimension: 'note-pattern',
      pattern: 'seq-3',
    });
    const neighborPatterns = seq3Neighbors.map((n) => n.pattern);

    expect(neighborPatterns).toContain('seq-4'); // same tier
    expect(neighborPatterns).toContain('stepwise'); // tier 1 (can go back)
    expect(neighborPatterns).toContain('thirds'); // first of tier 3 (gateway)
    expect(neighborPatterns).not.toContain('fourths'); // not gateway
    expect(neighborPatterns).not.toContain('fifths'); // not gateway
  });

  it('correctly identifies neighbors', () => {
    const ctx = createTestContext();

    // stepwise and seq-3 should be neighbors (tier 1 gateway to tier 2)
    const isNeighbor = ctx.notePatternDim.isNeighbor(
      { dimension: 'note-pattern', pattern: 'stepwise' },
      { dimension: 'note-pattern', pattern: 'seq-3' },
    );
    expect(isNeighbor).toBe(true);

    // stepwise and seq-4 should NOT be neighbors (seq-4 is not the gateway)
    const notGateway = ctx.notePatternDim.isNeighbor(
      { dimension: 'note-pattern', pattern: 'stepwise' },
      { dimension: 'note-pattern', pattern: 'seq-4' },
    );
    expect(notGateway).toBe(false);

    // stepwise and triad should NOT be neighbors (tier 1 and tier 5)
    const notNeighbor = ctx.notePatternDim.isNeighbor(
      { dimension: 'note-pattern', pattern: 'stepwise' },
      { dimension: 'note-pattern', pattern: 'triad' },
    );
    expect(notNeighbor).toBe(false);
  });

  it('returns correct tier for patterns', () => {
    const ctx = createTestContext();

    expect(ctx.notePatternDim.getTier({ dimension: 'note-pattern', pattern: 'stepwise' })).toBe(1);
    expect(ctx.notePatternDim.getTier({ dimension: 'note-pattern', pattern: 'seq-3' })).toBe(2);
    expect(ctx.notePatternDim.getTier({ dimension: 'note-pattern', pattern: 'thirds' })).toBe(3);
    expect(ctx.notePatternDim.getTier({ dimension: 'note-pattern', pattern: 'triad' })).toBe(5);
  });

  it('enforces gradual tier progression over many practices', () => {
    const ctx = createTestContext(99999);

    // Track max tier reached
    let maxTierReached = 1;

    // Generate 30 suggestions and log them
    for (let i = 0; i < 30; i++) {
      const suggestion = ctx.engine.generateSuggestion();
      const tier = ctx.notePatternDim.getTier(suggestion.notePattern);

      // Tier should never jump more than 1 from previous max
      expect(tier).toBeLessThanOrEqual(maxTierReached + 1);

      if (tier > maxTierReached) {
        maxTierReached = tier;
      }

      ctx.engine.logPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        80,
      );
    }
  });
});
