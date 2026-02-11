# Pattern System Redesign Plan

## Status: PHASE 1 COMPLETE

---

## Final Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RHYTHM SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   RHYTHM (note value):        Determines pattern length                 │
│   ├── 8ths        → 2 per beat  → pattern length 2                     │
│   ├── triplets    → 3 per beat  → pattern length 3                     │
│   ├── 16ths       → 4 per beat  → pattern length 4                     │
│   ├── quintuplets → 5 per beat  → pattern length 5                     │
│   └── sextuplets  → 6 per beat  → pattern length 6                     │
│                                                                         │
│   PATTERN (decorator):        Single string encoding                    │
│   ├── x = play (normal)                                                │
│   ├── X = play (accented)     [Phase 3]                                │
│   └── - = rest (syncopation)  [Phase 2]                                │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│   EXAMPLES                                                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   16ths, continuous:          "xxxx"     ♪♪♪♪                          │
│   16ths + syncopation:        "xxx-"     ♪♪♪.        [Phase 2]         │
│   16ths + accents:            "Xxxx"     >♪♪♪        [Phase 3]         │
│   16ths + both:               "Xx-x"     >♪.♪        [Phase 3]         │
│                                                                         │
│   triplets, continuous:       "xxx"      ♪♪♪                           │
│   triplets + syncopation:     "x-x"      ♪.♪         [Phase 2]         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Rhythm + Continuous Pattern (NOW)

**Goal**: Clean foundation with rhythm types, all using continuous pattern.

**Signature**:
```typescript
interface RhythmSig {
  dimension: 'rhythm';
  rhythm: string;      // "8ths", "triplets", "16ths", etc.
  pattern: string;     // "xx", "xxx", "xxxx" (all x's, length matches rhythm)
}
```

**Changes**:
- [x] Update config/rhythm.yaml - rhythms ladder with notes_per_beat
- [x] Update RhythmDimension - generates continuous patterns
- [x] Update types (RhythmSig) - changed `grid` to `rhythm`
- [x] Update engine, scoring, repository - all grid→rhythm
- [x] Update display/CLI - shows "8ths (xx)" format
- [x] Update all tests - all 37 tests passing

**Rhythm ladder**:
```
8ths (entry) → triplets → 16ths → quintuplets → sextuplets
```

---

### Phase 2: Add Syncopation (FUTURE)

**Goal**: Allow `-` in patterns for rests.

**Changes**:
- Add syncopation patterns to config
- Update neighbor logic (continuous → simple syncopation → complex)
- Validate pattern length matches rhythm

**Examples**:
- `{ rhythm: "16ths", pattern: "xxx-" }`
- `{ rhythm: "triplets", pattern: "x-x" }`

---

### Phase 3: Add Accents (FUTURE)

**Goal**: Allow `X` in patterns for accented notes.

**Changes**:
- Update pattern parsing to handle X/x/-
- Add accent patterns to config
- Progression: no accents → simple accents → complex accents

**Examples**:
- `{ rhythm: "16ths", pattern: "Xxxx" }`
- `{ rhythm: "16ths", pattern: "Xx-x" }` (combined)

---

### Phase 4: Longer Patterns (FUTURE)

**Goal**: Patterns spanning multiple beats.

**Examples**:
- `{ rhythm: "16ths", pattern: "XxxxXxxx" }` (2 beats)
- `{ rhythm: "triplets", pattern: "Xxxx-x" }` (2 beats)

---

## Migration Notes

- Old `grid` + `pattern` fields → new `rhythm` + `pattern` fields
- Old signatures like `rhythm:8ths:continuous` → new `rhythm:8ths:xx`
- Database: will need migration if real user data exists
