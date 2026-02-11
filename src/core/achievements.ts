import { Repository } from '../db/repository.js';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: 'mastery' | 'exploration' | 'consistency' | 'speed';
  check: (repo: Repository) => boolean;
}

export interface EarnedAchievement {
  achievementId: string;
  earnedAt: string;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDef[] = [
  // ===== Consistency =====
  {
    id: 'first-practice',
    name: 'First Steps',
    description: 'Complete your first practice session',
    category: 'consistency',
    check: (repo) => repo.getTotalPracticeCount() >= 1,
  },
  {
    id: '3-day-streak',
    name: 'Getting Started',
    description: 'Achieve a 3-day practice streak',
    category: 'consistency',
    check: (repo) => {
      const info = repo.getStreakInfo();
      return info !== null && info.longestStreak >= 3;
    },
  },
  {
    id: '7-day-streak',
    name: 'Week Warrior',
    description: 'Achieve a 7-day practice streak',
    category: 'consistency',
    check: (repo) => {
      const info = repo.getStreakInfo();
      return info !== null && info.longestStreak >= 7;
    },
  },
  {
    id: '14-day-streak',
    name: 'Dedicated',
    description: 'Achieve a 14-day practice streak',
    category: 'consistency',
    check: (repo) => {
      const info = repo.getStreakInfo();
      return info !== null && info.longestStreak >= 14;
    },
  },
  {
    id: '30-day-streak',
    name: 'Monthly Master',
    description: 'Achieve a 30-day practice streak',
    category: 'consistency',
    check: (repo) => {
      const info = repo.getStreakInfo();
      return info !== null && info.longestStreak >= 30;
    },
  },

  // ===== Mastery =====
  {
    id: 'first-expansion',
    name: 'Breaking Through',
    description: 'Expand your first compound (hit expansion NPM threshold)',
    category: 'mastery',
    check: (repo) => repo.countExpandedCompounds() >= 1,
  },
  {
    id: 'first-mastery',
    name: 'Master of One',
    description: 'Master your first compound',
    category: 'mastery',
    check: (repo) => repo.countMasteredCompounds() >= 1,
  },
  {
    id: 'master-5-compounds',
    name: 'Rising Expert',
    description: 'Master 5 different compounds',
    category: 'mastery',
    check: (repo) => repo.countMasteredCompounds() >= 5,
  },
  {
    id: 'master-10-compounds',
    name: 'Seasoned Player',
    description: 'Master 10 different compounds',
    category: 'mastery',
    check: (repo) => repo.countMasteredCompounds() >= 10,
  },
  {
    id: 'master-all-positions',
    name: 'Fretboard Navigator',
    description: 'Master a compound in every CAGED position',
    category: 'mastery',
    check: (repo) => {
      const positions = repo.getMasteredPositions();
      // CAGED = C, A, G, E, D
      const caged = ['C', 'A', 'G', 'E', 'D'];
      return caged.every((p) => positions.includes(p));
    },
  },

  // ===== Exploration =====
  {
    id: 'try-all-positions',
    name: 'Explorer',
    description: 'Practice in all 5 CAGED positions',
    category: 'exploration',
    check: (repo) => {
      const positions = repo.getDistinctPracticedValues('position');
      const caged = ['C', 'A', 'G', 'E', 'D'];
      return caged.every((p) => positions.includes(p));
    },
  },
  {
    id: 'try-all-scales',
    name: 'Scale Scholar',
    description: 'Practice all available scales',
    category: 'exploration',
    check: (repo) => {
      const scales = repo.getDistinctPracticedValues('scale');
      // At minimum: pentatonic, blues, minor, major
      return scales.length >= 4;
    },
  },
  {
    id: 'try-3-rhythms',
    name: 'Rhythm Explorer',
    description: 'Practice with 3 different rhythms',
    category: 'exploration',
    check: (repo) => {
      const rhythms = repo.getDistinctPracticedValues('rhythm');
      return rhythms.length >= 3;
    },
  },
  {
    id: 'unlock-note-pattern',
    name: 'Pattern Unlocked',
    description: 'Unlock the note-pattern dimension',
    category: 'exploration',
    check: (repo) => repo.isDimensionUnlocked('note-pattern'),
  },
  {
    id: 'practice-10-sessions',
    name: 'Regular',
    description: 'Complete 10 practice sessions',
    category: 'exploration',
    check: (repo) => repo.getTotalPracticeCount() >= 10,
  },

  // ===== Speed =====
  {
    id: 'reach-400-npm',
    name: 'Speed Demon',
    description: 'Reach 400 NPM in any compound',
    category: 'speed',
    check: (repo) => repo.getMaxNpmAcrossCompounds() >= 400,
  },
  {
    id: 'reach-480-npm',
    name: 'Lightning Fingers',
    description: 'Reach 480 NPM in any compound',
    category: 'speed',
    check: (repo) => repo.getMaxNpmAcrossCompounds() >= 480,
  },
  {
    id: 'reach-560-npm',
    name: 'Shredder',
    description: 'Reach 560 NPM in any compound',
    category: 'speed',
    check: (repo) => repo.getMaxNpmAcrossCompounds() >= 560,
  },
];

/**
 * Check all achievements and return newly earned ones.
 * Idempotent - will not create duplicates.
 */
export function checkAchievements(repo: Repository): EarnedAchievement[] {
  const newlyEarned: EarnedAchievement[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    // Skip if already earned
    if (repo.hasAchievement(def.id)) continue;

    // Check if criteria met
    if (def.check(repo)) {
      const earnedAt = new Date().toISOString();
      repo.earnAchievement(def.id, earnedAt);
      newlyEarned.push({ achievementId: def.id, earnedAt });
    }
  }

  return newlyEarned;
}

/**
 * Get all earned achievements with their definitions.
 */
export function getEarnedAchievements(
  repo: Repository,
): Array<AchievementDef & { earnedAt: string }> {
  const earnedIds = repo.getEarnedAchievementIds();
  const result: Array<AchievementDef & { earnedAt: string }> = [];

  for (const earned of earnedIds) {
    const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === earned.achievementId);
    if (def) {
      result.push({ ...def, earnedAt: earned.earnedAt });
    }
  }

  return result;
}

/**
 * Calculate progress (0-1) toward each achievement.
 * Queries repo once for each metric then computes all progress values.
 */
export function getAchievementProgress(repo: Repository): Map<string, number> {
  const progress = new Map<string, number>();

  // Gather all needed data from repo once
  const practiceCount = repo.getTotalPracticeCount();
  const streakInfo = repo.getStreakInfo();
  const longestStreak = streakInfo?.longestStreak ?? 0;
  const expandedCount = repo.countExpandedCompounds();
  const masteredCount = repo.countMasteredCompounds();
  const masteredPositions = repo.getMasteredPositions();
  const practicedPositions = repo.getDistinctPracticedValues('position');
  const practicedScales = repo.getDistinctPracticedValues('scale');
  const practicedRhythms = repo.getDistinctPracticedValues('rhythm');
  const notePatternUnlocked = repo.isDimensionUnlocked('note-pattern');
  const maxNpm = repo.getMaxNpmAcrossCompounds();

  progress.set('first-practice', Math.min(1, practiceCount / 1));
  progress.set('3-day-streak', Math.min(1, longestStreak / 3));
  progress.set('7-day-streak', Math.min(1, longestStreak / 7));
  progress.set('14-day-streak', Math.min(1, longestStreak / 14));
  progress.set('30-day-streak', Math.min(1, longestStreak / 30));
  progress.set('first-expansion', Math.min(1, expandedCount / 1));
  progress.set('first-mastery', Math.min(1, masteredCount / 1));
  progress.set('master-5-compounds', Math.min(1, masteredCount / 5));
  progress.set('master-10-compounds', Math.min(1, masteredCount / 10));
  progress.set('master-all-positions', Math.min(1, masteredPositions.length / 5));
  progress.set('try-all-positions', Math.min(1, practicedPositions.length / 5));
  progress.set('try-all-scales', Math.min(1, practicedScales.length / 4));
  progress.set('try-3-rhythms', Math.min(1, practicedRhythms.length / 3));
  progress.set('unlock-note-pattern', notePatternUnlocked ? 1 : 0);
  progress.set('practice-10-sessions', Math.min(1, practiceCount / 10));
  progress.set('reach-400-npm', Math.min(1, maxNpm / 400));
  progress.set('reach-480-npm', Math.min(1, maxNpm / 480));
  progress.set('reach-560-npm', Math.min(1, maxNpm / 560));

  return progress;
}

/**
 * Get all achievement definitions with earned status.
 */
export function getAllAchievements(
  repo: Repository,
): Array<AchievementDef & { earned: boolean; earnedAt: string | null }> {
  const earnedIds = repo.getEarnedAchievementIds();
  const earnedMap = new Map(earnedIds.map((e) => [e.achievementId, e.earnedAt]));

  return ACHIEVEMENT_DEFINITIONS.map((def) => ({
    ...def,
    earned: earnedMap.has(def.id),
    earnedAt: earnedMap.get(def.id) ?? null,
  }));
}
