import { createDatabase, getOrCreateUser } from '../db/schema.js';
import { Repository } from '../db/repository.js';
import { Engine } from '../core/engine.js';
import { DimensionRegistry } from '../dimensions/registry.js';
import { DEFAULT_SETTINGS } from '../types.js';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
// Singleton instances for the web API
let _db = null;
let _engineCache = new Map();
function parseTransferCoefficients(compoundScoring) {
    if (!compoundScoring)
        return DEFAULT_SETTINGS.compoundScoring.transferCoefficients;
    // New format: transfer_coefficients map
    const transferCoefficients = compoundScoring.transfer_coefficients;
    if (transferCoefficients && typeof transferCoefficients === 'object') {
        return { ...DEFAULT_SETTINGS.compoundScoring.transferCoefficients, ...transferCoefficients };
    }
    // Backward compat: old singular transfer_coefficient used as fallback for all dimensions
    const singleCoeff = compoundScoring.transfer_coefficient;
    if (singleCoeff !== undefined && typeof singleCoeff === 'number') {
        const result = {};
        for (const key of Object.keys(DEFAULT_SETTINGS.compoundScoring.transferCoefficients)) {
            result[key] = singleCoeff;
        }
        return result;
    }
    return DEFAULT_SETTINGS.compoundScoring.transferCoefficients;
}
function loadSettings() {
    const configPath = path.join(process.cwd(), 'config', 'settings.yaml');
    if (!fs.existsSync(configPath)) {
        return DEFAULT_SETTINGS;
    }
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        const raw = yaml.load(content);
        return {
            emaAlpha: raw.ema_alpha ?? DEFAULT_SETTINGS.emaAlpha,
            stability: {
                minAttempts: raw.stability?.min_attempts ??
                    DEFAULT_SETTINGS.stability.minAttempts,
                emaRatio: raw.stability?.ema_ratio ??
                    DEFAULT_SETTINGS.stability.emaRatio,
            },
            progression: {
                expansionNpm: raw.progression?.expansion_npm ??
                    DEFAULT_SETTINGS.progression.expansionNpm,
                masteryNpm: raw.progression?.mastery_npm ??
                    DEFAULT_SETTINGS.progression.masteryNpm,
                masteryStreak: raw.progression?.mastery_streak ??
                    DEFAULT_SETTINGS.progression.masteryStreak,
            },
            scoring: {
                proximityOneChange: raw.scoring?.proximity_one_change ??
                    DEFAULT_SETTINGS.scoring.proximityOneChange,
                proximityRepeat: raw.scoring?.proximity_repeat ??
                    DEFAULT_SETTINGS.scoring.proximityRepeat,
                stabilityReady: raw.scoring?.stability_ready ??
                    DEFAULT_SETTINGS.scoring.stabilityReady,
                stabilityNotReady: raw.scoring?.stability_not_ready ??
                    DEFAULT_SETTINGS.scoring.stabilityNotReady,
                noveltyMaxDays: raw.scoring?.novelty_max_days ??
                    DEFAULT_SETTINGS.scoring.noveltyMaxDays,
                noveltyWeight: raw.scoring?.novelty_weight ??
                    DEFAULT_SETTINGS.scoring.noveltyWeight,
                explorationBonus: raw.scoring?.exploration_bonus ??
                    DEFAULT_SETTINGS.scoring.explorationBonus,
            },
            compoundScoring: {
                consolidationWeight: raw.compound_scoring?.consolidation_weight ??
                    DEFAULT_SETTINGS.compoundScoring.consolidationWeight,
                stalenessWeight: raw.compound_scoring?.staleness_weight ??
                    DEFAULT_SETTINGS.compoundScoring.stalenessWeight,
                readinessWeight: raw.compound_scoring?.readiness_weight ??
                    DEFAULT_SETTINGS.compoundScoring.readinessWeight,
                diversityWeight: raw.compound_scoring?.diversity_weight ??
                    DEFAULT_SETTINGS.compoundScoring.diversityWeight,
                stalenessSessions: raw.compound_scoring?.staleness_sessions ??
                    DEFAULT_SETTINGS.compoundScoring.stalenessSessions,
                transferCoefficients: parseTransferCoefficients(raw.compound_scoring),
            },
            dimensionTiers: DEFAULT_SETTINGS.dimensionTiers,
            npmTiers: {
                struggling: raw.npm_tiers?.struggling ??
                    DEFAULT_SETTINGS.npmTiers.struggling,
                developing: raw.npm_tiers?.developing ??
                    DEFAULT_SETTINGS.npmTiers.developing,
                progressing: raw.npm_tiers?.progressing ??
                    DEFAULT_SETTINGS.npmTiers.progressing,
                fast: raw.npm_tiers?.fast ??
                    DEFAULT_SETTINGS.npmTiers.fast,
                veryFast: raw.npm_tiers?.very_fast ??
                    DEFAULT_SETTINGS.npmTiers.veryFast,
                superFast: raw.npm_tiers?.super_fast ??
                    DEFAULT_SETTINGS.npmTiers.superFast,
            },
            struggling: {
                streakThreshold: raw.struggling?.streak_threshold ??
                    DEFAULT_SETTINGS.struggling.streakThreshold,
            },
            keys: raw.keys ?? DEFAULT_SETTINGS.keys,
        };
    }
    catch {
        return DEFAULT_SETTINGS;
    }
}
function createEngineForUser(userName) {
    if (!_db) {
        _db = createDatabase();
    }
    const userId = getOrCreateUser(_db, userName);
    const repo = new Repository(_db, userId);
    const settings = loadSettings();
    const registry = DimensionRegistry.createDefault();
    return {
        engine: new Engine(repo, registry, settings),
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
export function getContext(userName = 'default') {
    if (!_engineCache.has(userName)) {
        _engineCache.set(userName, createEngineForUser(userName));
    }
    return _engineCache.get(userName);
}
// Clear cache (useful for testing)
export function clearContextCache() {
    _engineCache.clear();
}
//# sourceMappingURL=context.js.map