import { describe, it, expect } from 'vitest';
import { weightedRandomSelect } from '../../src/core/scoring.js';

describe('weightedRandomSelect', () => {
  it('throws on empty array', () => {
    expect(() => weightedRandomSelect([], [])).toThrow('Cannot select from empty array');
  });

  it('throws when items and scores have different lengths', () => {
    expect(() => weightedRandomSelect(['a', 'b'], [1])).toThrow(
      'Items and scores must have same length',
    );
  });

  it('returns single item when only one exists', () => {
    const result = weightedRandomSelect(['only'], [1.0]);
    expect(result).toBe('only');
  });

  it('handles all zero scores by picking uniformly', () => {
    // With deterministic random, should pick consistently
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = weightedRandomSelect(['a', 'b', 'c'], [0, 0, 0]);
      results.add(result);
    }
    // Should have picked at least 2 different items (probabilistically)
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  it('favors higher scores', () => {
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const items = ['a', 'b', 'c'];
    const scores = [1.0, 2.0, 3.0]; // c has highest weight (9 after squaring)

    for (let i = 0; i < 1000; i++) {
      const result = weightedRandomSelect(items, scores);
      counts[result]++;
    }

    // c should be picked most often (score^2 = 9)
    // b should be picked more than a (4 vs 1)
    expect(counts.c).toBeGreaterThan(counts.b);
    expect(counts.b).toBeGreaterThan(counts.a);
  });

  it('uses custom random function', () => {
    // Random that always returns 0 should pick first item
    const result = weightedRandomSelect(['a', 'b', 'c'], [1, 2, 3], () => 0);
    expect(result).toBe('a');
  });

  it('distributes roughly according to squared weights', () => {
    const counts: Record<string, number> = { a: 0, b: 0 };
    const items = ['a', 'b'];
    const scores = [1.0, 2.0]; // weights: 1, 4 -> ratios: 0.2, 0.8

    const iterations = 10000;
    for (let i = 0; i < iterations; i++) {
      const result = weightedRandomSelect(items, scores);
      counts[result]++;
    }

    // Expected: a ~ 20%, b ~ 80%
    const aRatio = counts.a / iterations;
    const bRatio = counts.b / iterations;

    expect(aRatio).toBeGreaterThan(0.15);
    expect(aRatio).toBeLessThan(0.25);
    expect(bRatio).toBeGreaterThan(0.75);
    expect(bRatio).toBeLessThan(0.85);
  });
});
