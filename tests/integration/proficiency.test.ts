import { describe, it, expect } from 'vitest';
import { createTestContext } from './harness.js';

describe('Proficiency Repository Methods', () => {
  it('can set proficiency', () => {
    const ctx = createTestContext();

    ctx.repo.setProficient('rhythm', '16ths');

    expect(ctx.repo.isProficient('rhythm', '16ths')).toBe(true);
    expect(ctx.repo.isProficient('rhythm', '8ths')).toBe(false);
  });

  it('can remove proficiency', () => {
    const ctx = createTestContext();

    ctx.repo.setProficient('rhythm', '16ths');
    expect(ctx.repo.isProficient('rhythm', '16ths')).toBe(true);

    ctx.repo.removeProficient('rhythm', '16ths');
    expect(ctx.repo.isProficient('rhythm', '16ths')).toBe(false);
  });

  it('can get all proficiencies for a dimension', () => {
    const ctx = createTestContext();

    ctx.repo.setProficient('rhythm', '8ths');
    ctx.repo.setProficient('rhythm', '16ths');
    ctx.repo.setProficient('scale', 'pentatonic_minor');

    const rhythmProfs = ctx.repo.getProficiencies('rhythm');
    expect(rhythmProfs).toContain('8ths');
    expect(rhythmProfs).toContain('16ths');
    expect(rhythmProfs).not.toContain('pentatonic_minor');

    const scaleProfs = ctx.repo.getProficiencies('scale');
    expect(scaleProfs).toContain('pentatonic_minor');
    expect(scaleProfs.length).toBe(1);
  });

  it('can get all proficiencies across dimensions', () => {
    const ctx = createTestContext();

    ctx.repo.setProficient('rhythm', '16ths');
    ctx.repo.setProficient('scale', 'blues');
    ctx.repo.setProficient('position', 'D');

    const all = ctx.repo.getAllProficiencies();
    expect(all.length).toBe(3);
    expect(all.find((p) => p.dimension === 'rhythm' && p.value === '16ths')).toBeDefined();
    expect(all.find((p) => p.dimension === 'scale' && p.value === 'blues')).toBeDefined();
    expect(all.find((p) => p.dimension === 'position' && p.value === 'D')).toBeDefined();
  });

  it('does not duplicate proficiency on re-add', () => {
    const ctx = createTestContext();

    ctx.repo.setProficient('rhythm', '16ths');
    ctx.repo.setProficient('rhythm', '16ths');

    const profs = ctx.repo.getProficiencies('rhythm');
    expect(profs.filter((p) => p === '16ths').length).toBe(1);
  });
});

describe('Rhythm Dimension Prerequisites', () => {
  it('returns empty array for entry point', () => {
    const ctx = createTestContext();
    const prereqs = ctx.rhythmDim.getPrerequisites('8ths');
    expect(prereqs).toEqual([]);
  });

  it('returns 8ths as prerequisite for 16ths', () => {
    const ctx = createTestContext();
    const prereqs = ctx.rhythmDim.getPrerequisites('16ths');
    expect(prereqs).toContain('8ths');
  });

  it('returns 8ths as prerequisite for triplets', () => {
    const ctx = createTestContext();
    const prereqs = ctx.rhythmDim.getPrerequisites('triplets');
    expect(prereqs).toContain('8ths');
  });

  it('returns transitive prerequisites', () => {
    const ctx = createTestContext();
    // Chain: 8ths -> 16ths -> triplets -> quintuplets
    const prereqs = ctx.rhythmDim.getPrerequisites('quintuplets');
    expect(prereqs).toContain('triplets');
    expect(prereqs).toContain('16ths');
    expect(prereqs).toContain('8ths');
  });
});

describe('Scale Dimension Prerequisites', () => {
  it('returns empty array for entry point', () => {
    const ctx = createTestContext();
    const prereqs = ctx.scaleDim.getPrerequisites('pentatonic_minor');
    expect(prereqs).toEqual([]);
  });

  it('returns tier 1 scales as prerequisites for tier 2', () => {
    const ctx = createTestContext();
    // minor is tier 2, tier 1 scales are prerequisites
    const prereqs = ctx.scaleDim.getPrerequisites('minor');
    expect(prereqs).toContain('pentatonic_minor');
    expect(prereqs).toContain('blues_minor');
    expect(prereqs).toContain('pentatonic_major');
    expect(prereqs.length).toBe(3);
  });

  it('returns all lower tier scales as prerequisites for modes', () => {
    const ctx = createTestContext();
    // dorian is tier 3, should have tier 1 and tier 2 as prereqs
    const prereqs = ctx.scaleDim.getPrerequisites('dorian');
    // Tier 1
    expect(prereqs).toContain('pentatonic_minor');
    expect(prereqs).toContain('blues_minor');
    expect(prereqs).toContain('pentatonic_major');
    // Tier 2
    expect(prereqs).toContain('minor');
    expect(prereqs).toContain('major');
    expect(prereqs).toContain('blues_major');
    expect(prereqs.length).toBe(6);
  });
});

describe('Position Dimension Prerequisites', () => {
  it('returns empty array for entry point', () => {
    const ctx = createTestContext();
    const prereqs = ctx.positionDim.getPrerequisites('E');
    expect(prereqs).toEqual([]);
  });

  it('returns E as prerequisite for D', () => {
    const ctx = createTestContext();
    const prereqs = ctx.positionDim.getPrerequisites('D');
    expect(prereqs).toContain('E');
  });

  it('returns transitive prerequisites', () => {
    const ctx = createTestContext();
    // C comes from D (D has C in next), D comes from E (E has D in next)
    // Chain: E → D → C
    const prereqs = ctx.positionDim.getPrerequisites('C');
    expect(prereqs).toContain('D');
    expect(prereqs).toContain('E');
    expect(prereqs.length).toBe(2);
  });
});

describe('Note Pattern Dimension Prerequisites', () => {
  it('returns empty array for tier 1 patterns', () => {
    const ctx = createTestContext();
    const prereqs = ctx.notePatternDim.getPrerequisites('stepwise');
    expect(prereqs).toEqual([]);
  });

  it('returns tier 1 patterns as prerequisites for tier 2', () => {
    const ctx = createTestContext();
    // seq-3 is tier 2, stepwise is tier 1
    const prereqs = ctx.notePatternDim.getPrerequisites('seq-3');
    expect(prereqs).toContain('stepwise');
    expect(prereqs.length).toBe(1);
  });

  it('returns all lower tier patterns as prerequisites', () => {
    const ctx = createTestContext();
    // thirds is tier 3, should have tier 1 and tier 2 as prereqs
    const prereqs = ctx.notePatternDim.getPrerequisites('thirds');
    expect(prereqs).toContain('stepwise'); // tier 1
    expect(prereqs).toContain('seq-3'); // tier 2
    expect(prereqs).toContain('seq-4'); // tier 2
    expect(prereqs.length).toBe(3);
  });
});

describe('Struggling Detection', () => {
  it('increments struggling streak when NPM below threshold', () => {
    const ctx = createTestContext();

    // Log practice below struggling threshold (200 NPM)
    // 50 BPM * 2 notes = 100 NPM
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      50,
    );

    const stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats?.strugglingStreak).toBe(1);
  });

  it('resets struggling streak when NPM above threshold', () => {
    const ctx = createTestContext();

    // First practice - struggling
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      50, // 100 NPM - struggling
    );

    let stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats?.strugglingStreak).toBe(1);

    // Second practice - above threshold
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'D',
      150, // 300 NPM - above struggling
    );

    stats = ctx.repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats?.strugglingStreak).toBe(0);
  });

  it('returns struggling compounds', () => {
    const ctx = createTestContext();

    // Log struggling practice
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      50, // 100 NPM - struggling
    );

    const struggling = ctx.engine.getStrugglingCompounds();
    expect(struggling.length).toBe(1);
    expect(struggling[0].scale).toBe('pentatonic_minor');
    expect(struggling[0].position).toBe('E');
  });

  it('identifies struggling proficiencies', () => {
    const ctx = createTestContext();

    // Declare proficiency
    ctx.repo.setProficient('rhythm', '8ths');

    // Log struggling practice
    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      50, // 100 NPM - struggling
    );

    const strugglingProfs = ctx.engine.getStrugglingProficiencies();
    const rhythmStruggling = strugglingProfs.find(
      (p) => p.dimension === 'rhythm' && p.value === '8ths',
    );
    expect(rhythmStruggling).toBeDefined();
  });
});

describe('Proficiency Backfilling', () => {
  it('backfills prerequisites when adding advanced proficiency', () => {
    const ctx = createTestContext();

    // Simulate what the proficient command does
    const targetValue = '16ths';
    const prerequisites = ctx.rhythmDim.getPrerequisites(targetValue);
    const toAdd = [targetValue, ...prerequisites];

    for (const value of toAdd) {
      ctx.repo.setProficient('rhythm', value);
    }

    // Should have both 16ths and 8ths
    expect(ctx.repo.isProficient('rhythm', '16ths')).toBe(true);
    expect(ctx.repo.isProficient('rhythm', '8ths')).toBe(true);
  });

  it('does not re-add existing proficiencies during backfill', () => {
    const ctx = createTestContext();

    // Already proficient in 8ths
    ctx.repo.setProficient('rhythm', '8ths');

    // Now add 16ths with backfill
    const targetValue = '16ths';
    const prerequisites = ctx.rhythmDim.getPrerequisites(targetValue);
    const existingProfs = ctx.repo.getProficiencies('rhythm');
    const toAdd = [targetValue, ...prerequisites].filter((v) => !existingProfs.includes(v));

    for (const value of toAdd) {
      ctx.repo.setProficient('rhythm', value);
    }

    // Should have both, but 8ths should only appear once
    const allProfs = ctx.repo.getProficiencies('rhythm');
    expect(allProfs.filter((p) => p === '8ths').length).toBe(1);
    expect(allProfs.filter((p) => p === '16ths').length).toBe(1);
  });
});
