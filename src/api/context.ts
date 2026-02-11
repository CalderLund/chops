import { createDatabase, getOrCreateUser } from '../db/schema.js';
import { Repository } from '../db/repository.js';
import { Engine } from '../core/engine.js';
import { DimensionRegistry } from '../dimensions/registry.js';
import { Settings, DEFAULT_SETTINGS } from '../types.js';
import { updateStreak } from '../core/streaks.js';
import { checkAchievements } from '../core/achievements.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

// Singleton instances for the web API
let _db: ReturnType<typeof createDatabase> | null = null;
const _engineCache: Map<string, ReturnType<typeof createEngineForUser>> = new Map();

function parseTransferCoefficients(
  compoundScoring: Record<string, unknown> | undefined,
): Record<string, number> {
  if (!compoundScoring) return DEFAULT_SETTINGS.compoundScoring.transferCoefficients;

  // New format: transfer_coefficients map
  const transferCoefficients = compoundScoring.transfer_coefficients as
    | Record<string, number>
    | undefined;
  if (transferCoefficients && typeof transferCoefficients === 'object') {
    return { ...DEFAULT_SETTINGS.compoundScoring.transferCoefficients, ...transferCoefficients };
  }

  // Backward compat: old singular transfer_coefficient used as fallback for all dimensions
  const singleCoeff = compoundScoring.transfer_coefficient as number | undefined;
  if (singleCoeff !== undefined && typeof singleCoeff === 'number') {
    const result: Record<string, number> = {};
    for (const key of Object.keys(DEFAULT_SETTINGS.compoundScoring.transferCoefficients)) {
      result[key] = singleCoeff;
    }
    return result;
  }

  return DEFAULT_SETTINGS.compoundScoring.transferCoefficients;
}

function loadSettings(): Settings {
  const configPath = path.join(process.cwd(), 'config', 'settings.yaml');
  if (!fs.existsSync(configPath)) {
    return DEFAULT_SETTINGS;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const raw = yaml.load(content) as Record<string, unknown>;

    return {
      emaAlpha: (raw.ema_alpha as number) ?? DEFAULT_SETTINGS.emaAlpha,
      stability: {
        minAttempts:
          ((raw.stability as Record<string, unknown>)?.min_attempts as number) ??
          DEFAULT_SETTINGS.stability.minAttempts,
        emaRatio:
          ((raw.stability as Record<string, unknown>)?.ema_ratio as number) ??
          DEFAULT_SETTINGS.stability.emaRatio,
      },
      progression: {
        expansionNpm:
          ((raw.progression as Record<string, unknown>)?.expansion_npm as number) ??
          DEFAULT_SETTINGS.progression.expansionNpm,
        masteryNpm:
          ((raw.progression as Record<string, unknown>)?.mastery_npm as number) ??
          DEFAULT_SETTINGS.progression.masteryNpm,
        masteryStreak:
          ((raw.progression as Record<string, unknown>)?.mastery_streak as number) ??
          DEFAULT_SETTINGS.progression.masteryStreak,
      },
      scoring: {
        proximityOneChange:
          ((raw.scoring as Record<string, unknown>)?.proximity_one_change as number) ??
          DEFAULT_SETTINGS.scoring.proximityOneChange,
        proximityRepeat:
          ((raw.scoring as Record<string, unknown>)?.proximity_repeat as number) ??
          DEFAULT_SETTINGS.scoring.proximityRepeat,
        stabilityReady:
          ((raw.scoring as Record<string, unknown>)?.stability_ready as number) ??
          DEFAULT_SETTINGS.scoring.stabilityReady,
        stabilityNotReady:
          ((raw.scoring as Record<string, unknown>)?.stability_not_ready as number) ??
          DEFAULT_SETTINGS.scoring.stabilityNotReady,
        noveltyMaxDays:
          ((raw.scoring as Record<string, unknown>)?.novelty_max_days as number) ??
          DEFAULT_SETTINGS.scoring.noveltyMaxDays,
        noveltyWeight:
          ((raw.scoring as Record<string, unknown>)?.novelty_weight as number) ??
          DEFAULT_SETTINGS.scoring.noveltyWeight,
        explorationBonus:
          ((raw.scoring as Record<string, unknown>)?.exploration_bonus as number) ??
          DEFAULT_SETTINGS.scoring.explorationBonus,
      },
      compoundScoring: {
        consolidationWeight:
          ((raw.compound_scoring as Record<string, unknown>)?.consolidation_weight as number) ??
          DEFAULT_SETTINGS.compoundScoring.consolidationWeight,
        stalenessWeight:
          ((raw.compound_scoring as Record<string, unknown>)?.staleness_weight as number) ??
          DEFAULT_SETTINGS.compoundScoring.stalenessWeight,
        readinessWeight:
          ((raw.compound_scoring as Record<string, unknown>)?.readiness_weight as number) ??
          DEFAULT_SETTINGS.compoundScoring.readinessWeight,
        diversityWeight:
          ((raw.compound_scoring as Record<string, unknown>)?.diversity_weight as number) ??
          DEFAULT_SETTINGS.compoundScoring.diversityWeight,
        stalenessSessions:
          ((raw.compound_scoring as Record<string, unknown>)?.staleness_sessions as number) ??
          DEFAULT_SETTINGS.compoundScoring.stalenessSessions,
        transferCoefficients: parseTransferCoefficients(
          raw.compound_scoring as Record<string, unknown> | undefined,
        ),
      },
      dimensionTiers: DEFAULT_SETTINGS.dimensionTiers,
      npmTiers: {
        struggling:
          ((raw.npm_tiers as Record<string, unknown>)?.struggling as number) ??
          DEFAULT_SETTINGS.npmTiers.struggling,
        developing:
          ((raw.npm_tiers as Record<string, unknown>)?.developing as number) ??
          DEFAULT_SETTINGS.npmTiers.developing,
        progressing:
          ((raw.npm_tiers as Record<string, unknown>)?.progressing as number) ??
          DEFAULT_SETTINGS.npmTiers.progressing,
        fast:
          ((raw.npm_tiers as Record<string, unknown>)?.fast as number) ??
          DEFAULT_SETTINGS.npmTiers.fast,
        veryFast:
          ((raw.npm_tiers as Record<string, unknown>)?.very_fast as number) ??
          DEFAULT_SETTINGS.npmTiers.veryFast,
        superFast:
          ((raw.npm_tiers as Record<string, unknown>)?.super_fast as number) ??
          DEFAULT_SETTINGS.npmTiers.superFast,
      },
      struggling: {
        streakThreshold:
          ((raw.struggling as Record<string, unknown>)?.streak_threshold as number) ??
          DEFAULT_SETTINGS.struggling.streakThreshold,
      },
      keys: (raw.keys as string[]) ?? DEFAULT_SETTINGS.keys,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Replay streaks from practice_log dates.
 * Called after recalculateAllStats which rebuilds compound stats but not streaks.
 */
export function replayStreaks(repo: Repository): void {
  // Reset streak data
  repo.updateStreakData(0, 0, '', 0);

  // Get all practice entries in chronological order
  const entries = repo.getAllPractice();
  if (entries.length === 0) return;

  // Extract unique calendar dates in order
  const seenDates = new Set<string>();
  const uniqueDates: string[] = [];
  for (const entry of entries) {
    const date = entry.loggedAt.slice(0, 10); // YYYY-MM-DD
    if (!seenDates.has(date)) {
      seenDates.add(date);
      uniqueDates.push(date);
    }
  }

  // Replay each unique date through the streak system
  for (const date of uniqueDates) {
    updateStreak(repo, date);
  }
}

function createEngineForUser(userName: string) {
  if (!_db) {
    _db = createDatabase();
  }

  const userId = getOrCreateUser(_db, userName);
  const repo = new Repository(_db, userId);
  const settings = loadSettings();
  const registry = DimensionRegistry.createDefault();

  const engine = new Engine(repo, registry, settings);

  // Auto-recalculate compound stats if practice_log has data but compound_stats is empty.
  // This can happen after schema migrations clear compound_stats.
  if (repo.hasAnyPractice() && repo.getAllCompoundStats().length === 0) {
    repo.recalculateAllStats(
      settings.emaAlpha,
      settings.progression.expansionNpm,
      settings.progression.masteryNpm,
      settings.progression.masteryStreak,
      settings.npmTiers.struggling,
    );

    // Also replay streaks from practice dates (recalculateAllStats doesn't rebuild streaks)
    replayStreaks(repo);

    // Check achievements after rebuilding stats + streaks
    checkAchievements(repo);
  }

  return {
    engine,
    repo,
    settings,
    dimensions: {
      rhythmDim: registry.rhythmDim,
      scaleDim: registry.scaleDim,
      positionDim: registry.positionDim,
      notePatternDim: registry.notePatternDim,
    },
  };
}

// Get or create engine context for a user
export function getContext(userName: string = 'default') {
  if (!_engineCache.has(userName)) {
    _engineCache.set(userName, createEngineForUser(userName));
  }
  return _engineCache.get(userName)!;
}

// Clear cache (useful for testing)
export function clearContextCache() {
  _engineCache.clear();
}
