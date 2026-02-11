import { describe, it, expect } from 'vitest';
import { bpmToNpm, npmToBpm, calculateEma, isStable } from '../../src/core/normalizer.js';

describe('bpmToNpm', () => {
  it('converts 8ths (2 notes per beat)', () => {
    expect(bpmToNpm(60, 2)).toBe(120);
    expect(bpmToNpm(100, 2)).toBe(200);
  });

  it('converts 16ths (4 notes per beat)', () => {
    expect(bpmToNpm(60, 4)).toBe(240);
    expect(bpmToNpm(100, 4)).toBe(400);
  });

  it('converts triplets (3 notes per beat)', () => {
    expect(bpmToNpm(60, 3)).toBe(180);
    expect(bpmToNpm(100, 3)).toBe(300);
  });

  it('converts 6tuplets (6 notes per beat)', () => {
    expect(bpmToNpm(60, 6)).toBe(360);
  });
});

describe('npmToBpm', () => {
  it('reverses bpmToNpm for 8ths', () => {
    expect(npmToBpm(120, 2)).toBe(60);
    expect(npmToBpm(200, 2)).toBe(100);
  });

  it('reverses bpmToNpm for 16ths', () => {
    expect(npmToBpm(240, 4)).toBe(60);
  });
});

describe('calculateEma', () => {
  it('returns new value when current EMA is 0', () => {
    expect(calculateEma(0, 100, 0.3)).toBe(100);
  });

  it('blends values with alpha=0.3', () => {
    // EMA = 0.3 * new + 0.7 * old
    const result = calculateEma(100, 120, 0.3);
    expect(result).toBeCloseTo(106, 0);
  });

  it('higher alpha gives more weight to new value', () => {
    const lowAlpha = calculateEma(100, 200, 0.1);
    const highAlpha = calculateEma(100, 200, 0.9);

    expect(lowAlpha).toBeCloseTo(110, 0);
    expect(highAlpha).toBeCloseTo(190, 0);
  });

  it('tracks multiple updates', () => {
    let ema = calculateEma(0, 100, 0.3);
    ema = calculateEma(ema, 110, 0.3);
    ema = calculateEma(ema, 105, 0.3);

    // Should be somewhere between initial values
    expect(ema).toBeGreaterThan(100);
    expect(ema).toBeLessThan(110);
  });
});

describe('isStable', () => {
  const minAttempts = 3;
  const emaRatio = 0.85;

  it('returns false with insufficient attempts', () => {
    expect(isStable(0, 100, 100, minAttempts, emaRatio)).toBe(false);
    expect(isStable(1, 100, 100, minAttempts, emaRatio)).toBe(false);
    expect(isStable(2, 100, 100, minAttempts, emaRatio)).toBe(false);
  });

  it('returns true when EMA meets threshold', () => {
    // EMA = 90, Best = 100, ratio = 0.9 > 0.85
    expect(isStable(3, 90, 100, minAttempts, emaRatio)).toBe(true);

    // EMA = 100, Best = 100, ratio = 1.0 > 0.85
    expect(isStable(5, 100, 100, minAttempts, emaRatio)).toBe(true);
  });

  it('returns false when EMA below threshold', () => {
    // EMA = 80, Best = 100, ratio = 0.8 < 0.85
    expect(isStable(3, 80, 100, minAttempts, emaRatio)).toBe(false);
  });

  it('returns false when best is 0', () => {
    expect(isStable(5, 100, 0, minAttempts, emaRatio)).toBe(false);
  });

  it('handles edge case at exact threshold', () => {
    // EMA = 85, Best = 100, ratio = 0.85 >= 0.85
    expect(isStable(3, 85, 100, minAttempts, emaRatio)).toBe(true);
  });
});
