# Compound-Based Progression System - Implementation Plan

## Summary of Key Decisions

### 1. Compound-Based Tracking (Core Change)

**Before:** Track individual dimension signatures (`scale:pentatonic`, `position:E`, `rhythm:8ths`)

**After:** Track compounds (`pentatonic+E+8ths`) as single skills

- Each compound has its own stats: bestNpm, emaNpm, expanded, mastered, masteryStreak, lastPracticed
- Neighbors = compounds differing by exactly 1 dimension
- Compound is UNLOCKED when at least one of its neighbors is EXPANDED
- Compound is EXPANDED when practiced at 400+ NPM
- Compound is MASTERED when practiced 3 consecutive times at 480+ NPM

### 2. Dimension Tiering

```
Tier 0 (always available):
  - Scale: pentatonic → minor → blues → major → ...
  - Position: E → D → G → C → A
  - Rhythm: 8ths → triplets → 16ths → ...

Tier 1 (unlocks after 5 Tier 0 compounds expanded):
  - Note Pattern: stepwise → seq-3 → seq-4 → thirds → ...

Tier 2 (unlocks after 5 Tier 1 compounds expanded):
  - Articulation: continuous → rests → accents → ...
```

When a dimension unlocks:
- All existing compounds get entry point appended (e.g., "+stepwise")
- All existing compound stats get ID updated
- Practice history gets backfilled

### 3. Entry Points

| Dimension | Entry Point |
|-----------|-------------|
| Scale | pentatonic |
| Position | E |
| Rhythm | 8ths (pattern: xx) |
| Note Pattern | stepwise |
| Articulation | continuous |

### 4. Candidate Scoring (Replaces Old System)

```
score = (
  consolidation_weight × consolidationScore +
  staleness_weight × stalenessScore +
  readiness_weight × readinessScore +
  diversity_weight × diversityScore
)
```

**Consolidation** (should I stay on current compound?):
- Current is UNSTABLE (not expanded): 1.0
- Current is STABLE (expanded): 0.2
- Current is MASTERED: 0.0

**Staleness** (how long since practiced?):
- `min(sessions_since_practiced / 10, 1.0)`
- Never practiced = 1.0 (same as very stale, not higher)

**Readiness** (estimated success probability):
- Based on transfer from related compounds
- `estimated_npm = avg(related_compound_npms) × 0.5`
- `readiness = min(estimated_npm / expansion_threshold, 1.0)`

**Diversity** (vary dimensions):
- Dimension not changed in last 3 sessions: 0.5
- Otherwise: 0.0

### 5. Scoring Weights (Configurable)

```yaml
scoring:
  consolidation_weight: 1.0
  staleness_weight: 0.8
  readiness_weight: 0.6
  diversity_weight: 0.2
  staleness_sessions: 10
  transfer_coefficient: 0.5
```

### 6. Candidate Generation Rules

1. **STAY** (repeat current compound) is always a candidate
2. **Neighbors** (1 dimension change) are candidates if:
   - The neighbor is UNLOCKED (has an expanded neighbor itself, or is entry point)
   - The dimension being changed is available (tier unlocked)
3. **Mastery filtering**:
   - If changing TO a mastered signature, exclude (don't go backwards)
   - Mastered signatures CAN be unchanged foundation

### 7. Tonality

- Separate field in practice_log (major/minor)
- NOT part of compound ID (mental framing, not skill dimension)
- Default: minor for pentatonic, major otherwise

### 8. Display Changes

- Position shows as "X-shape" (e.g., "E-shape") ✓ (already done)
- NPM displayed in history ✓ (already done)
- Show dimension unlock progress
- Celebration message on unlock

---

## Database Schema Changes

### New Table: compound_stats

```sql
CREATE TABLE compound_stats (
  id TEXT PRIMARY KEY,              -- "pentatonic+E+8ths" or "pentatonic+E+8ths+stepwise"

  -- Component values (for querying)
  scale TEXT NOT NULL,
  position TEXT NOT NULL,
  rhythm TEXT NOT NULL,
  note_pattern TEXT,                -- NULL if dimension not unlocked
  articulation TEXT,                -- NULL if dimension not unlocked

  -- Stats
  best_npm INTEGER DEFAULT 0,
  ema_npm REAL DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  has_expanded BOOLEAN DEFAULT FALSE,
  mastery_streak INTEGER DEFAULT 0,
  is_mastered BOOLEAN DEFAULT FALSE,
  last_practiced TEXT,              -- ISO timestamp
  last_practiced_session INTEGER    -- Session number for staleness calc
);

CREATE INDEX idx_compound_scale ON compound_stats(scale);
CREATE INDEX idx_compound_position ON compound_stats(position);
CREATE INDEX idx_compound_rhythm ON compound_stats(rhythm);
```

### New Table: dimension_unlocks

```sql
CREATE TABLE dimension_unlocks (
  dimension TEXT PRIMARY KEY,       -- "note-pattern", "articulation"
  unlocked_at TEXT,                 -- ISO timestamp when unlocked
  unlocked_at_session INTEGER       -- Session number when unlocked
);
```

### New Table: session_counter

```sql
CREATE TABLE session_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_session INTEGER DEFAULT 0
);
```

### Modify: practice_log

```sql
-- Add column
ALTER TABLE practice_log ADD COLUMN compound_id TEXT;
ALTER TABLE practice_log ADD COLUMN session_number INTEGER;
```

---

## File Changes

### 1. src/types.ts

```typescript
// Add compound-related types
export interface Compound {
  scale: string;
  position: string;
  rhythm: string;
  rhythmPattern: string;
  notePattern?: string;      // undefined if dimension not unlocked
  articulation?: string;     // undefined if dimension not unlocked
}

export interface CompoundStats {
  id: string;
  compound: Compound;
  bestNpm: number;
  emaNpm: number;
  attempts: number;
  hasExpanded: boolean;
  masteryStreak: number;
  isMastered: boolean;
  lastPracticed: string | null;
  lastPracticedSession: number | null;
}

export interface DimensionConfig {
  name: string;
  tier: number;
  unlockRequirement?: number;  // Number of compounds to expand
  entryPoint: string;
}

// Update Settings
export interface Settings {
  // ... existing fields ...
  dimensions: DimensionConfig[];
  scoring: {
    consolidationWeight: number;
    stalenessWeight: number;
    readinessWeight: number;
    diversityWeight: number;
    stalenessSessions: number;
    transferCoefficient: number;
  };
}
```

### 2. src/db/repository.ts

Add methods:
- `getCompoundStats(compoundId: string): CompoundStats | null`
- `upsertCompoundStats(stats: CompoundStats): void`
- `getRelatedCompounds(compound: Compound): CompoundStats[]`
- `countExpandedCompoundsInTier(tier: number): number`
- `isDimensionUnlocked(dimension: string): boolean`
- `unlockDimension(dimension: string): void`
- `getCurrentSession(): number`
- `incrementSession(): number`
- `migrateCompoundsForNewDimension(dimension: string, entryPoint: string): void`

### 3. src/core/engine.ts

Rewrite to use compound-based logic:
- `generateSuggestion()` → uses compound candidates
- `generateCompoundCandidates()` → new method
- `scoreCandidate()` → new scoring formula
- `checkDimensionUnlocks()` → check if new dimensions should unlock
- `getTransferEstimate()` → estimate NPM from related compounds

### 4. src/db/compound.ts (new file)

Utility functions:
- `compoundId(compound: Compound): string`
- `parseCompoundId(id: string): Compound`
- `getCompoundNeighbors(compound: Compound, dimensions: IDimension[]): Compound[]`
- `compoundsEqual(a: Compound, b: Compound): boolean`
- `getChangedDimension(a: Compound, b: Compound): string | null`

### 5. config/settings.yaml

Add new configuration:
```yaml
dimensions:
  - name: scale
    tier: 0
    entryPoint: pentatonic
  - name: position
    tier: 0
    entryPoint: E
  - name: rhythm
    tier: 0
    entryPoint: 8ths
  - name: note-pattern
    tier: 1
    unlockRequirement: 5
    entryPoint: stepwise
  - name: articulation
    tier: 2
    unlockRequirement: 5
    entryPoint: continuous

scoring:
  consolidationWeight: 1.0
  stalenessWeight: 0.8
  readinessWeight: 0.6
  diversityWeight: 0.2
  stalenessSessions: 10
  transferCoefficient: 0.5
```

---

## Migration Strategy

### For Existing Users

1. Create new tables (compound_stats, dimension_unlocks, session_counter)
2. Initialize session_counter from practice_log count
3. Backfill compound_stats from practice_log:
   - Group practices by (scale, position, rhythm, note_pattern)
   - Calculate stats for each compound
4. Check if dimensions should be unlocked based on expanded compound count
5. Add compound_id to existing practice_log entries

### For New Dimension Unlock

When a dimension unlocks:
1. Insert into dimension_unlocks
2. Update all compound_stats IDs to include new dimension entry point
3. Update all practice_log compound_ids
4. Show celebration message to user

---

## Test Plan

### Unit Tests

1. `compoundId()` and `parseCompoundId()` round-trip
2. `getCompoundNeighbors()` returns correct neighbors
3. Scoring functions return expected values
4. Transfer estimation from related compounds

### Integration Tests

1. Cold start → only entry compound available
2. Below threshold → must stay (consolidation)
3. Hit expansion → neighbors unlock
4. Staleness increases over sessions
5. Mastery excludes compound from repeat
6. Dimension unlock after 5 expansions
7. Backfill when dimension unlocks
8. Can't jump 2 dimensions at once

---

## Implementation Order

### Phase 1: Foundation
1. [ ] Add types to types.ts
2. [ ] Create compound.ts utilities
3. [ ] Add database schema changes
4. [ ] Add repository methods

### Phase 2: Core Logic
5. [ ] Implement compound candidate generation
6. [ ] Implement new scoring formula
7. [ ] Implement transfer estimation
8. [ ] Implement dimension unlock checking

### Phase 3: Integration
9. [ ] Update engine to use compound system
10. [ ] Update practice logging to track compounds
11. [ ] Migration for existing data

### Phase 4: UI/UX
12. [ ] Update stats command for compounds
13. [ ] Add dimension unlock messages
14. [ ] Update exercise display

### Phase 5: Testing
15. [ ] Add unit tests for compounds
16. [ ] Add integration tests for new flows
17. [ ] Update existing tests

---

## Rollback Plan

If issues arise:
1. Keep signature_stats table (don't delete)
2. Can fall back to dimension-based logic
3. compound_stats can be regenerated from practice_log

---

## Future Extensions

Once this is stable:
- Technique dimension (alternate, economy, hybrid picking)
- Dynamics dimension (soft, loud, varying)
- String skipping patterns
- Visual skill tree in terminal or browser
