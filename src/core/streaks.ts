import { Repository } from '../db/repository.js';

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastPracticeDate: string | null;
  streakFreezes: number;
}

/**
 * Extract the calendar date (YYYY-MM-DD) from an ISO timestamp or date string.
 */
function toCalendarDate(dateStr: string): string {
  return dateStr.slice(0, 10);
}

/**
 * Calculate the difference in calendar days between two date strings.
 * Returns positive if date2 is after date1.
 */
function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1 + 'T00:00:00Z');
  const d2 = new Date(date2 + 'T00:00:00Z');
  const diffMs = d2.getTime() - d1.getTime();
  return Math.round(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Update the user's streak after a practice session.
 * Called after each practice log.
 */
export function updateStreak(repo: Repository, practiceDate?: string): void {
  const today = practiceDate ?? toCalendarDate(new Date().toISOString());
  const info = repo.getStreakInfo();

  if (!info) {
    // First ever practice - initialize streak
    repo.updateStreakData(1, 1, today, 0);
    return;
  }

  const lastDate = info.lastPracticeDate;
  if (!lastDate) {
    // No previous practice date recorded
    repo.updateStreakData(1, Math.max(info.longestStreak, 1), today, info.streakFreezes);
    return;
  }

  const gap = daysBetween(lastDate, today);

  if (gap <= 0) {
    // Same day or earlier - no change (but update date)
    return;
  }

  if (gap === 1) {
    // Consecutive day - increment streak
    const newStreak = info.currentStreak + 1;
    const newLongest = Math.max(info.longestStreak, newStreak);
    repo.updateStreakData(newStreak, newLongest, today, info.streakFreezes);
    return;
  }

  // Gap > 1 day
  if (gap === 2 && info.streakFreezes > 0) {
    // Use a streak freeze to cover 1 missed day
    const newStreak = info.currentStreak + 1;
    const newLongest = Math.max(info.longestStreak, newStreak);
    repo.updateStreakData(newStreak, newLongest, today, info.streakFreezes - 1);
    return;
  }

  // Gap too large (or no freezes) - reset streak
  repo.updateStreakData(1, info.longestStreak, today, info.streakFreezes);
}

/**
 * Get the user's current streak information.
 */
export function getStreakInfo(repo: Repository): StreakInfo {
  const info = repo.getStreakInfo();
  if (!info) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      lastPracticeDate: null,
      streakFreezes: 0,
    };
  }
  return info;
}
