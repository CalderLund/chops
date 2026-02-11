import { Repository } from '../db/repository.js';
export interface StreakInfo {
    currentStreak: number;
    longestStreak: number;
    lastPracticeDate: string | null;
    streakFreezes: number;
}
/**
 * Update the user's streak after a practice session.
 * Called after each practice log.
 */
export declare function updateStreak(repo: Repository, practiceDate?: string): void;
/**
 * Get the user's current streak information.
 */
export declare function getStreakInfo(repo: Repository): StreakInfo;
//# sourceMappingURL=streaks.d.ts.map