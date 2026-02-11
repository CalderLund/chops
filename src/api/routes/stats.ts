import { Hono } from 'hono';
import { getContext } from '../context.js';
import { getStreakInfo } from '../../core/streaks.js';
import { getAllAchievements, getAchievementProgress } from '../../core/achievements.js';

export const statsRoutes = new Hono();

// Get all compound stats
statsRoutes.get('/compounds', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { repo, settings, engine } = getContext(user);

    const compounds = repo.getAllCompoundStats();

    // Calculate summary statistics
    const total = compounds.length;
    const expanded = compounds.filter((c) => c.hasExpanded).length;
    const mastered = compounds.filter((c) => c.isMastered).length;
    const struggling = compounds.filter((c) => c.strugglingStreak > 0).length;

    return c.json({
      success: true,
      compounds: compounds.map((c) => ({
        id: c.id,
        scale: c.scale,
        position: c.position,
        rhythm: c.rhythm,
        rhythmPattern: c.rhythmPattern,
        notePattern: c.notePattern,
        articulation: c.articulation,
        bestNpm: c.bestNpm,
        emaNpm: c.emaNpm,
        lastNpm: c.lastNpm,
        lastBpm: c.lastBpm,
        attempts: c.attempts,
        hasExpanded: c.hasExpanded,
        masteryStreak: c.masteryStreak,
        isMastered: c.isMastered,
        strugglingStreak: c.strugglingStreak,
        lastPracticed: c.lastPracticed,
        tier: engine.getNpmTier(c.emaNpm),
      })),
      summary: {
        total,
        expanded,
        mastered,
        struggling,
        expansionNpm: settings.progression.expansionNpm,
        masteryNpm: settings.progression.masteryNpm,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get dimension stats (legacy signature-based)
statsRoutes.get('/dimensions', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { repo, settings } = getContext(user);

    const stats = repo.getAllStats();
    const unlocked = repo.getUnlockedDimensions();

    // Group by dimension
    const byDimension: Record<string, typeof stats> = {};
    for (const stat of stats) {
      if (!byDimension[stat.dimension]) {
        byDimension[stat.dimension] = [];
      }
      byDimension[stat.dimension].push(stat);
    }

    // Get dimension tier info
    const tiers = settings.dimensionTiers.map((tier) => ({
      name: tier.name,
      tier: tier.tier,
      unlocked: tier.tier === 0 || unlocked.includes(tier.name),
      unlockRequirement: tier.unlockRequirement,
      entryPoint: tier.entryPoint,
    }));

    return c.json({
      success: true,
      dimensions: byDimension,
      tiers,
      thresholds: {
        expansion: settings.progression.expansionNpm,
        mastery: settings.progression.masteryNpm,
        struggling: settings.npmTiers.struggling,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get NPM tier thresholds
statsRoutes.get('/tiers', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { settings } = getContext(user);

    return c.json({
      success: true,
      tiers: settings.npmTiers,
      progression: settings.progression,
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get current streak info
statsRoutes.get('/streak', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { repo } = getContext(user);

    const streak = getStreakInfo(repo);

    return c.json({
      success: true,
      streak,
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get achievements
statsRoutes.get('/achievements', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { repo } = getContext(user);

    const achievements = getAllAchievements(repo);
    const progress = getAchievementProgress(repo);

    return c.json({
      success: true,
      achievements: achievements.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        category: a.category,
        earned: a.earned,
        earnedAt: a.earnedAt,
        progress: progress.get(a.id) ?? 0,
      })),
      summary: {
        total: achievements.length,
        earned: achievements.filter((a) => a.earned).length,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});
