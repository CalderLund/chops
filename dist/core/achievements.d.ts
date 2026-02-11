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
export declare const ACHIEVEMENT_DEFINITIONS: AchievementDef[];
/**
 * Check all achievements and return newly earned ones.
 * Idempotent - will not create duplicates.
 */
export declare function checkAchievements(repo: Repository): EarnedAchievement[];
/**
 * Get all earned achievements with their definitions.
 */
export declare function getEarnedAchievements(repo: Repository): Array<AchievementDef & {
    earnedAt: string;
}>;
/**
 * Get all achievement definitions with earned status.
 */
export declare function getAllAchievements(repo: Repository): Array<AchievementDef & {
    earned: boolean;
    earnedAt: string | null;
}>;
//# sourceMappingURL=achievements.d.ts.map