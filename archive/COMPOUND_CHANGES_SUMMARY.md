# Compound-Based Progression System - Implementation Summary

## Overview

Implemented a compound-based progression system that tracks skills at the intersection of dimensions (e.g., `pentatonic+E+8ths`) rather than individual dimensions separately. This provides more accurate skill tracking and prevents "false expansion" where mastering one combination incorrectly implies readiness for all combinations.

## Key Changes

### 1. New Types (`src/types.ts`)

Added:
- `Compound` - Represents a specific combination of scale+position+rhythm+optional dimensions
- `CompoundStats` - Statistics for a compound (npm, expansion, mastery, staleness)
- `DimensionTierConfig` - Configuration for dimension unlocking tiers
- `CompoundScoringConfig` - Weights for the new scoring system

### 2. Compound Utilities (`src/db/compound.ts`) - NEW FILE

Utility functions for working with compounds:
- `compoundId(compound)` - Generate ID like "pentatonic+E+8ths:xx"
- `parseCompoundId(id)` - Parse ID back to compound
- `compoundsEqual(a, b)` - Check equality
- `getChangedDimension(from, to)` - Identify which dimension changed
- `countDimensionChanges(from, to)` - Count differences

### 3. Database Schema (`src/db/schema.ts`)

New tables:
- `compound_stats` - Per-compound statistics
- `dimension_unlocks` - Tracks which dimensions are unlocked
- `session_counter` - For staleness calculation

New columns in `practice_log`:
- `compound_id` - Links practice to compound
- `session_number` - For staleness tracking
- `articulation` - Future dimension support

### 4. Repository (`src/db/repository.ts`)

New methods:
- `getCurrentSession()` / `incrementSession()` - Session tracking
- `getCompoundStats(id)` / `updateCompoundStats()` - Compound CRUD
- `countExpandedCompoundsInTier(tier)` - For dimension unlocking
- `isDimensionUnlocked(dim)` / `unlockDimension()` - Unlock tracking
- `migrateCompoundsForNewDimension()` - Backfill when dimension unlocks
- `getRelatedCompounds(compound)` - For transfer learning
- `getRecentDimensionChanges(n)` - For diversity scoring

### 5. Compound Scoring (`src/core/compound-scoring.ts`) - NEW FILE

New scoring system with four factors:
- **Consolidation** - High when unstable (must stay), zero when mastered
- **Staleness** - Sessions since last practiced (caps at 10 sessions)
- **Readiness** - Transfer estimate from related compounds
- **Diversity** - Bonus for varying dimensions

### 6. Engine (`src/core/engine.ts`)

New methods:
- `checkDimensionUnlocks()` - Checks and performs tier unlocks
- `getCurrentCompound()` - Build compound from last practice
- `generateCompoundCandidates()` - Generate candidates using compound logic
- `generateCompoundSuggestion()` - Main suggestion using compounds
- `logCompoundPractice()` - Log and update compound stats

### 7. Tests (`tests/integration/compound.test.ts`) - NEW FILE

19 new tests covering:
- Compound ID generation and parsing
- Compound stats tracking
- Session tracking
- Expansion and mastery thresholds
- Candidate generation
- 1-dimension-change invariant

## Dimension Tiering System

```
Tier 0 (always available):
  - Scale: pentatonic → minor → blues → ...
  - Position: E → D → G → C → A
  - Rhythm: 8ths → triplets → 16ths → ...

Tier 1 (unlocks after 5 Tier 0 compounds expanded):
  - Note Pattern: stepwise → seq-3 → thirds → ...

Tier 2 (unlocks after 5 Tier 1 compounds expanded):
  - Articulation: continuous → rests → accents → ...
```

New users start with only 3 dimensions. As they prove competence (expand 5 compounds), new dimensions unlock.

## Scoring Formula

```
score = (
  consolidationWeight × consolidationScore +    // 1.0 × [0-1]
  stalenessWeight × stalenessScore +            // 0.8 × [0-1]
  readinessWeight × readinessScore +            // 0.6 × [0-1]
  diversityWeight × diversityScore              // 0.2 × [0-0.5]
)
```

Selection uses weighted random with squared scores to sharpen distribution.

## Backward Compatibility

- Legacy `signature_stats` table and methods retained
- Existing `logPractice()` method still works
- Old tests continue to pass
- Both systems can coexist during transition

## Configuration

New settings in `DEFAULT_SETTINGS`:

```typescript
compoundScoring: {
  consolidationWeight: 1.0,
  stalenessWeight: 0.8,
  readinessWeight: 0.6,
  diversityWeight: 0.2,
  stalenessSessions: 10,
  transferCoefficient: 0.5,
},
dimensionTiers: [
  { name: 'scale', tier: 0, entryPoint: 'pentatonic' },
  { name: 'position', tier: 0, entryPoint: 'E' },
  { name: 'rhythm', tier: 0, entryPoint: '8ths' },
  { name: 'note-pattern', tier: 1, unlockRequirement: 5, entryPoint: 'stepwise' },
  { name: 'articulation', tier: 2, unlockRequirement: 5, entryPoint: 'continuous' },
]
```

## Test Results

```
80 tests passing:
- 15 unit/normalizer tests
- 7 unit/scoring tests
- 19 integration/compound tests (NEW)
- 18 integration/progression-thresholds tests
- 15 integration/next tests
- 6 integration/progression tests
```

## Next Steps

1. **Migrate CLI commands** to use `generateCompoundSuggestion()` and `logCompoundPractice()`
2. **Add compound stats display** to `chops stats` command
3. **Add dimension unlock celebration** messages in UI
4. **Implement articulation dimension** config and logic
5. **Add visual skill tree** display
