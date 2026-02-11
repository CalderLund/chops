import { describe, it, expect } from 'vitest';
import { createInMemoryDatabase } from '../../src/db/schema.js';
import { Repository } from '../../src/db/repository.js';
import { updateStreak, getStreakInfo } from '../../src/core/streaks.js';
import {
  checkAchievements,
  getEarnedAchievements,
  getAllAchievements,
  ACHIEVEMENT_DEFINITIONS,
} from '../../src/core/achievements.js';
import { createTestContext } from './harness.js';

// ============================================================
// STREAK TESTS
// ============================================================

describe('Streaks', () => {
  function makeRepo() {
    const db = createInMemoryDatabase();
    return { db, repo: new Repository(db, 1) };
  }

  it('initializes streak on first practice', () => {
    const { repo } = makeRepo();

    updateStreak(repo, '2024-01-15');
    const info = getStreakInfo(repo);

    expect(info.currentStreak).toBe(1);
    expect(info.longestStreak).toBe(1);
    expect(info.lastPracticeDate).toBe('2024-01-15');
    expect(info.streakFreezes).toBe(0);
  });

  it('increments streak on consecutive days', () => {
    const { repo } = makeRepo();

    updateStreak(repo, '2024-01-15');
    updateStreak(repo, '2024-01-16');
    updateStreak(repo, '2024-01-17');

    const info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(3);
    expect(info.longestStreak).toBe(3);
  });

  it('does not change streak for same day practice', () => {
    const { repo } = makeRepo();

    updateStreak(repo, '2024-01-15');
    updateStreak(repo, '2024-01-15');

    const info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(1);
    expect(info.longestStreak).toBe(1);
  });

  it('resets streak after gap > 1 day without freezes', () => {
    const { repo } = makeRepo();

    updateStreak(repo, '2024-01-15');
    updateStreak(repo, '2024-01-16');
    updateStreak(repo, '2024-01-17');

    // Skip 2 days
    updateStreak(repo, '2024-01-20');

    const info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(1);
    expect(info.longestStreak).toBe(3); // longest preserved
  });

  it('uses streak freeze to cover 1 missed day', () => {
    const { repo } = makeRepo();

    updateStreak(repo, '2024-01-15');
    updateStreak(repo, '2024-01-16');

    // Add a streak freeze
    repo.addStreakFreezes(1);
    let info = getStreakInfo(repo);
    expect(info.streakFreezes).toBe(1);

    // Skip 1 day (gap of 2 in date terms)
    updateStreak(repo, '2024-01-18');

    info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(3);
    expect(info.streakFreezes).toBe(0); // freeze used
  });

  it('does not use freeze for gap > 2 days', () => {
    const { repo } = makeRepo();

    updateStreak(repo, '2024-01-15');
    repo.addStreakFreezes(1);

    // Skip 2 days (gap of 3)
    updateStreak(repo, '2024-01-18');

    const info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(1); // reset
    expect(info.streakFreezes).toBe(1); // freeze NOT used
  });

  it('tracks longest streak separately from current', () => {
    const { repo } = makeRepo();

    // Build up a 5-day streak
    updateStreak(repo, '2024-01-01');
    updateStreak(repo, '2024-01-02');
    updateStreak(repo, '2024-01-03');
    updateStreak(repo, '2024-01-04');
    updateStreak(repo, '2024-01-05');

    let info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(5);
    expect(info.longestStreak).toBe(5);

    // Break the streak
    updateStreak(repo, '2024-01-10');

    info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(1);
    expect(info.longestStreak).toBe(5); // longest preserved

    // Build a shorter streak
    updateStreak(repo, '2024-01-11');
    updateStreak(repo, '2024-01-12');

    info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(3);
    expect(info.longestStreak).toBe(5); // still 5
  });

  it('returns zero streak when no data exists', () => {
    const { repo } = makeRepo();

    const info = getStreakInfo(repo);
    expect(info.currentStreak).toBe(0);
    expect(info.longestStreak).toBe(0);
    expect(info.lastPracticeDate).toBeNull();
  });
});

// ============================================================
// ACHIEVEMENT TESTS
// ============================================================

describe('Achievements', () => {
  function makeRepo() {
    const db = createInMemoryDatabase();
    return { db, repo: new Repository(db, 1) };
  }

  it('earns first-practice achievement after logging a practice', () => {
    const { repo } = makeRepo();

    // Log a practice entry
    repo.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
      240,
      'test',
      0.3,
    );

    const earned = checkAchievements(repo);
    const ids = earned.map((e) => e.achievementId);
    expect(ids).toContain('first-practice');
  });

  it('achievements are idempotent - checking twice does not duplicate', () => {
    const { repo } = makeRepo();

    repo.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
      240,
      'test',
      0.3,
    );

    const earned1 = checkAchievements(repo);
    const earned2 = checkAchievements(repo);

    expect(earned1.length).toBeGreaterThan(0);
    expect(earned2.length).toBe(0); // already earned, no new ones

    // Verify only one entry in DB
    const allEarned = repo.getEarnedAchievementIds();
    const firstPracticeCount = allEarned.filter((e) => e.achievementId === 'first-practice').length;
    expect(firstPracticeCount).toBe(1);
  });

  it('earns streak achievements when longest streak qualifies', () => {
    const { repo } = makeRepo();

    // Set up a 3-day streak
    updateStreak(repo, '2024-01-01');
    updateStreak(repo, '2024-01-02');
    updateStreak(repo, '2024-01-03');

    // Also need at least one practice for first-practice
    repo.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
      240,
      'test',
      0.3,
    );

    const earned = checkAchievements(repo);
    const ids = earned.map((e) => e.achievementId);
    expect(ids).toContain('3-day-streak');
  });

  it('earns speed achievements based on compound NPM', () => {
    const { repo } = makeRepo();

    // Create a compound with high NPM
    const compound = {
      scale: 'pentatonic_minor',
      position: 'E',
      rhythm: '8ths',
      rhythmPattern: 'xx',
      notePattern: 'stepwise',
    };

    repo.updateCompoundStats(compound, 420, 210, 1, 0.3, 400, 480, 3, 200);

    const earned = checkAchievements(repo);
    const ids = earned.map((e) => e.achievementId);
    expect(ids).toContain('reach-400-npm');
    expect(ids).not.toContain('reach-480-npm');
  });

  it('earns mastery achievements when compounds are mastered', () => {
    const { repo } = makeRepo();

    const compound = {
      scale: 'pentatonic_minor',
      position: 'E',
      rhythm: '8ths',
      rhythmPattern: 'xx',
      notePattern: 'stepwise',
    };

    // Practice enough to expand and master
    repo.updateCompoundStats(compound, 420, 210, 1, 0.3, 400, 480, 3, 200);
    repo.updateCompoundStats(compound, 500, 250, 2, 0.3, 400, 480, 3, 200);
    repo.updateCompoundStats(compound, 500, 250, 3, 0.3, 400, 480, 3, 200);
    repo.updateCompoundStats(compound, 500, 250, 4, 0.3, 400, 480, 3, 200);

    const stats = repo.getCompoundStats('pentatonic_minor+E+8ths:xx+stepwise');
    expect(stats?.isMastered).toBe(true);

    const earned = checkAchievements(repo);
    const ids = earned.map((e) => e.achievementId);
    expect(ids).toContain('first-mastery');
    expect(ids).toContain('first-expansion');
  });

  it('earns exploration achievements from diverse practice', () => {
    const { repo } = makeRepo();

    // Practice across all 5 positions
    const positions = ['C', 'A', 'G', 'E', 'D'];
    for (const pos of positions) {
      repo.logPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: pos },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        120,
        240,
        'test',
        0.3,
      );
    }

    const earned = checkAchievements(repo);
    const ids = earned.map((e) => e.achievementId);
    expect(ids).toContain('try-all-positions');
  });

  it('getEarnedAchievements returns full definitions with earnedAt', () => {
    const { repo } = makeRepo();

    repo.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
      240,
      'test',
      0.3,
    );

    checkAchievements(repo);
    const earned = getEarnedAchievements(repo);

    expect(earned.length).toBeGreaterThan(0);
    expect(earned[0]).toHaveProperty('id');
    expect(earned[0]).toHaveProperty('name');
    expect(earned[0]).toHaveProperty('description');
    expect(earned[0]).toHaveProperty('category');
    expect(earned[0]).toHaveProperty('earnedAt');
  });

  it('getAllAchievements returns all definitions with earned status', () => {
    const { repo } = makeRepo();

    repo.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
      240,
      'test',
      0.3,
    );

    checkAchievements(repo);
    const all = getAllAchievements(repo);

    expect(all.length).toBe(ACHIEVEMENT_DEFINITIONS.length);

    const firstPractice = all.find((a) => a.id === 'first-practice');
    expect(firstPractice?.earned).toBe(true);
    expect(firstPractice?.earnedAt).toBeTruthy();

    const shredder = all.find((a) => a.id === 'reach-560-npm');
    expect(shredder?.earned).toBe(false);
    expect(shredder?.earnedAt).toBeNull();
  });
});

// ============================================================
// INTEGRATION: ENGINE + STREAKS + ACHIEVEMENTS
// ============================================================

describe('Engine integration with streaks and achievements', () => {
  it('logCompoundPractice updates streak', () => {
    const ctx = createTestContext();

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
    );

    const info = ctx.repo.getStreakInfo();
    expect(info).not.toBeNull();
    expect(info!.currentStreak).toBe(1);
  });

  it('logCompoundPractice earns achievements', () => {
    const ctx = createTestContext();

    ctx.engine.logCompoundPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
    );

    const earned = ctx.repo.getEarnedAchievementIds();
    const ids = earned.map((e) => e.achievementId);
    expect(ids).toContain('first-practice');
  });

  it('mastery achievement awards streak freeze', () => {
    const ctx = createTestContext();

    // Practice enough at high NPM to trigger mastery (need 3 consecutive at 480+)
    // With 8ths (2 notes per beat), BPM 300 = 600 NPM
    for (let i = 0; i < 4; i++) {
      ctx.engine.logCompoundPractice(
        { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
        { dimension: 'scale', scale: 'pentatonic_minor' },
        { dimension: 'position', position: 'E' },
        { dimension: 'note-pattern', pattern: 'stepwise' },
        'C',
        300,
      );
    }

    // Check that first-mastery and/or first-expansion were earned
    const earned = ctx.repo.getEarnedAchievementIds();
    const ids = earned.map((e) => e.achievementId);

    // first-expansion should be earned (NPM 600 >= 400)
    expect(ids).toContain('first-expansion');

    // Check streak freezes were awarded for mastery-category achievements
    const streakInfo = ctx.repo.getStreakInfo();
    const masteryEarnedCount = ids.filter((id) => {
      const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === id);
      return def?.category === 'mastery';
    }).length;

    // Should have freezes equal to mastery achievements earned
    expect(streakInfo!.streakFreezes).toBe(masteryEarnedCount);
  });
});

// ============================================================
// REPOSITORY STREAK/ACHIEVEMENT METHODS
// ============================================================

describe('Repository streak and achievement methods', () => {
  function makeRepo() {
    const db = createInMemoryDatabase();
    return { db, repo: new Repository(db, 1) };
  }

  it('getStreakInfo returns null when no streak data', () => {
    const { repo } = makeRepo();
    expect(repo.getStreakInfo()).toBeNull();
  });

  it('updateStreakData creates and updates streak record', () => {
    const { repo } = makeRepo();

    repo.updateStreakData(5, 10, '2024-01-15', 2);
    const info = repo.getStreakInfo();

    expect(info).not.toBeNull();
    expect(info!.currentStreak).toBe(5);
    expect(info!.longestStreak).toBe(10);
    expect(info!.lastPracticeDate).toBe('2024-01-15');
    expect(info!.streakFreezes).toBe(2);
  });

  it('addStreakFreezes increments freeze count', () => {
    const { repo } = makeRepo();

    repo.updateStreakData(1, 1, '2024-01-15', 0);
    repo.addStreakFreezes(3);

    const info = repo.getStreakInfo();
    expect(info!.streakFreezes).toBe(3);

    repo.addStreakFreezes(2);
    const info2 = repo.getStreakInfo();
    expect(info2!.streakFreezes).toBe(5);
  });

  it('earnAchievement and hasAchievement work correctly', () => {
    const { repo } = makeRepo();

    expect(repo.hasAchievement('test-achievement')).toBe(false);
    repo.earnAchievement('test-achievement', '2024-01-15T00:00:00Z');
    expect(repo.hasAchievement('test-achievement')).toBe(true);
  });

  it('earnAchievement is idempotent (INSERT OR IGNORE)', () => {
    const { repo } = makeRepo();

    repo.earnAchievement('test-achievement', '2024-01-15T00:00:00Z');
    repo.earnAchievement('test-achievement', '2024-01-16T00:00:00Z'); // should not throw

    const earned = repo.getEarnedAchievementIds();
    const testEntries = earned.filter((e) => e.achievementId === 'test-achievement');
    expect(testEntries.length).toBe(1);
    expect(testEntries[0].earnedAt).toBe('2024-01-15T00:00:00Z'); // original timestamp preserved
  });

  it('getTotalPracticeCount returns correct count', () => {
    const { repo } = makeRepo();

    expect(repo.getTotalPracticeCount()).toBe(0);

    repo.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
      240,
      'test',
      0.3,
    );

    expect(repo.getTotalPracticeCount()).toBe(1);
  });

  it('getMaxNpmAcrossCompounds returns highest NPM', () => {
    const { repo } = makeRepo();

    expect(repo.getMaxNpmAcrossCompounds()).toBe(0);

    repo.updateCompoundStats(
      { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' },
      350,
      175,
      1,
      0.3,
      400,
      480,
      3,
      200,
    );
    repo.updateCompoundStats(
      { scale: 'blues', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' },
      420,
      210,
      1,
      0.3,
      400,
      480,
      3,
      200,
    );

    expect(repo.getMaxNpmAcrossCompounds()).toBe(420);
  });

  it('countMasteredCompounds returns correct count', () => {
    const { repo } = makeRepo();

    expect(repo.countMasteredCompounds()).toBe(0);

    // Master a compound (3 consecutive at mastery NPM)
    const compound = { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' };
    repo.updateCompoundStats(compound, 500, 250, 1, 0.3, 400, 480, 3, 200);
    repo.updateCompoundStats(compound, 500, 250, 2, 0.3, 400, 480, 3, 200);
    repo.updateCompoundStats(compound, 500, 250, 3, 0.3, 400, 480, 3, 200);

    expect(repo.countMasteredCompounds()).toBe(1);
  });

  it('getDistinctPracticedValues returns unique values per dimension', () => {
    const { repo } = makeRepo();

    repo.logPractice(
      { dimension: 'rhythm', rhythm: '8ths', pattern: 'xx' },
      { dimension: 'scale', scale: 'pentatonic_minor' },
      { dimension: 'position', position: 'E' },
      { dimension: 'note-pattern', pattern: 'stepwise' },
      'C',
      120,
      240,
      'test',
      0.3,
    );
    repo.logPractice(
      { dimension: 'rhythm', rhythm: 'triplets', pattern: 'xxx' },
      { dimension: 'scale', scale: 'blues_minor' },
      { dimension: 'position', position: 'A' },
      { dimension: 'note-pattern', pattern: 'seq-3' },
      'D',
      120,
      360,
      'test',
      0.3,
    );

    expect(repo.getDistinctPracticedValues('scale').sort()).toEqual(['blues_minor', 'pentatonic_minor']);
    expect(repo.getDistinctPracticedValues('position').sort()).toEqual(['A', 'E']);
    expect(repo.getDistinctPracticedValues('rhythm').sort()).toEqual(['8ths', 'triplets']);
  });

  it('getMasteredPositions returns positions with mastered compounds', () => {
    const { repo } = makeRepo();

    expect(repo.getMasteredPositions()).toEqual([]);

    // Master a compound in position E
    const compound = { scale: 'pentatonic_minor', position: 'E', rhythm: '8ths', rhythmPattern: 'xx' };
    repo.updateCompoundStats(compound, 500, 250, 1, 0.3, 400, 480, 3, 200);
    repo.updateCompoundStats(compound, 500, 250, 2, 0.3, 400, 480, 3, 200);
    repo.updateCompoundStats(compound, 500, 250, 3, 0.3, 400, 480, 3, 200);

    expect(repo.getMasteredPositions()).toEqual(['E']);
  });
});
