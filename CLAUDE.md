# Guitar Teacher - Project Rules

## Rule 0: Meta-Rule

0.1. **Always read this file at the start of every session.** This file is automatically loaded by Claude Code. If it is not in context, request it before making any changes.

0.2. **Update this file when you discover new invariants, patterns, or pitfalls.** If you fix a bug caused by violating an undocumented invariant, add a rule for it here. Rules should prevent real mistakes, not be generic platitudes.

0.3. **Rules are numbered within sections.** When adding rules, append to the appropriate section. Do not renumber existing rules (other code or documentation may reference them).

0.4. **Consult expert agents before implementing non-trivial features.** Six expert agents live in `.claude/agents/`: `architect`, `tester`, `db-expert`, `domain-expert`, `devex-expert`, `auditor`. Before writing code for any change that touches dimensions, scoring, schema, compound IDs, or spans 3+ files, spawn the relevant experts (Opus) to review the approach first. They will enter plan mode, consult each other, and produce a plan for approval before any Sonnet sub-agent writes code. For which experts to consult, see `.claude/agents/interaction-protocol.md`. When in doubt, start with the `architect`.

0.5. **Run long-running work in the background.** When spawning expert panels, research tasks, or multi-agent work that will take more than ~30 seconds, use `run_in_background: true` so the user can keep talking. Never block the conversation waiting on agent results. Synthesize and present results when agents complete.

---

## Architecture Rules

1.1. **Two parallel scoring systems exist: legacy (signature-based) and compound-based.** The compound system is the primary one used for suggestions (`generateCompoundSuggestion`). The legacy system (`generateSuggestion`) still works and both are maintained. The API route `POST /api/practice/suggest` uses `generateCompoundSuggestion`. When logging practice via the compound path (`logCompoundPractice`), BOTH systems are updated (legacy signature stats AND compound stats). Do not remove or break either system.

1.2. **The Engine class has two constructor signatures (legacy and registry-based).** The preferred constructor takes `(repo, DimensionRegistry, settings?, randomFn?, suggestionStore?)`. A legacy constructor taking individual dimension objects also exists for backward compatibility. Tests use both; do not remove the legacy path without updating all callers. See `src/core/engine.ts` lines 54-92.

1.3. **The SuggestionStore abstraction separates production from test I/O.** Production uses `FileSuggestionStore` (writes to `~/.guitar-teacher/suggestion.json`); tests use `InMemorySuggestionStore`. Never instantiate `FileSuggestionStore` in tests. The test harness (`tests/integration/harness.ts`) always uses `InMemorySuggestionStore`.

1.4. **The API context (`src/api/context.ts`) is a singleton cache keyed by username.** It lazily creates `Engine`, `Repository`, and `DimensionRegistry` per user. The `_engineCache` map persists for the lifetime of the process. Call `clearContextCache()` only in tests. If you add new dependencies to the context, add them to `createEngineForUser`.

1.5. **Config files in `config/` are read at dimension construction time.** Each dimension constructor reads its YAML file synchronously via `fs.readFileSync`. The `DimensionRegistry.createDefault(configDir?)` factory wires them all together. If you add a new dimension, register it in `createDefault` and add a typed convenience accessor in the registry class.

---

## Dimension System Rules

2.1. **Every dimension implements `IDimension<T extends Signature>`.** The interface is defined in `src/dimensions/dimension.ts`. Required methods: `getEntryPoint()`, `getSignatures()`, `getNeighbors(sig)`, `isNeighbor(a, b)`, `describe(sig)`. Optional: `getNotesPerBeat?(sig)` (only rhythm uses this).

2.2. **The `name` property on each dimension class MUST match the discriminator in its Signature type.** For example, `RhythmDimension.name = 'rhythm'` must match `RhythmSig.dimension = 'rhythm'`. This string is used as a key in the registry, in database queries, in `sigId()`, and in compound ID building. If they mismatch, lookups silently fail.

2.3. **Neighbor relationships vary by dimension type.** Position uses a "gateway pattern" for forward neighbors: only the FIRST item in the `next` array is a forward neighbor. Rhythm includes ALL `next` items as forward neighbors.

2.4. **Scale and note-pattern use a tier-based neighbor system.** Same-tier values are all neighbors of each other (free lateral movement within tier). ALL values in the immediately lower tier are neighbors (can always go back). For the next higher tier, scale uses `next` edges to define which higher-tier values are accessible, while note-pattern uses a gateway (only the FIRST pattern in the next tier). Both dimensions have `getTier(sig)` methods. See `src/dimensions/scale/index.ts` and `src/dimensions/note-pattern/index.ts`. Scale config (`config/scale.yaml`) has 25 scales across 5 tiers with `tonality` and `uses` metadata fields.

2.5. **Adding a new dimension requires changes in at least 9 places:**
   - Create `src/dimensions/<name>/index.ts` implementing `IDimension<T>`
   - Add Signature type to `src/types.ts` and update the `Signature` union
   - Add `sigId()` and `parseSigId()` cases in `src/types.ts`
   - Add config YAML in `config/<name>.yaml`
   - Register in `DimensionRegistry.createDefault()`
   - Add typed accessor in `DimensionRegistry`
   - Update `Compound` type and `compoundId()`/`parseCompoundId()` in `src/db/compound.ts`
   - Update `Engine` candidate generation to include the new dimension (higher-tier dimensions go OUTSIDE the `if (stats.hasExpanded)` block — see rule 3.2)
   - Add a tier config entry in `DEFAULT_SETTINGS.dimensionTiers` with `unlockRequirement: 1` (see rule 2.7)
   - Write a test proving the new dimension appears as a candidate after 1 expansion of a lower-tier compound

2.7. **Higher-tier dimension unlock requirements MUST be 1.** Each tier unlocks after just 1 compound from the previous tier is expanded. WHY: Higher-tier dimensions represent orthogonal practice variations (e.g., note-pattern changes how you traverse a scale, not how fast). They should be accessible as soon as the student demonstrates basic competence (1 expansion = reaching 400 NPM). Setting higher requirements creates a "double gate" — the student must grind tier-0 variety before even seeing higher-tier options, which feels arbitrary and delays pedagogically valuable exploration. If a new dimension genuinely requires more preparation, encode that in its entry-point difficulty (make the first value easy), not in the unlock gate.

2.6. **Dimension values in config YAML files are the canonical source of truth.** The `id` fields in YAML (e.g., `pentatonic`, `8ths`, `E`, `stepwise`) are stored as-is in the database and used in compound IDs. Renaming a value in YAML without migrating the database will silently orphan existing data.

---

## Compound System Rules

3.1. **THE 1-DIMENSION-CHANGE INVARIANT IS THE MOST CRITICAL INVARIANT IN THE SYSTEM.** Every suggestion must differ from the current compound by at most 1 dimension. This is enforced in `generateAllCompoundCandidates()` via `countDimensionChanges(currentCompound, c.compound) <= 1`. `generateCompoundSuggestion` calls `generateAllCompoundCandidates` (which considers ALL practiced compounds, not just the last one) -- NOT the simpler `generateCompoundCandidates` (which only considers the current compound). Multiple tests verify this invariant over 20-100 consecutive suggestions. WHY: If 2+ dimensions change simultaneously, the student cannot attribute difficulty to a specific skill gap.

3.2. **Tier-0 dimensions require EXPANSION before neighbors become candidates; higher-tier dimensions only require UNLOCK.** For scale, position, and rhythm (tier 0), a compound must reach `expansionNpm` (default 400) before those dimension neighbors are generated. This prevents premature exploration. For higher-tier dimensions (note-pattern, articulation), the dimension unlock is sufficient — once unlocked, neighbors in that dimension are generated from ANY practiced compound, regardless of expansion status. WHY: The unlock already proves sufficient mastery (1 expansion = reaching 400 NPM), and gating higher-tier candidates behind expansion creates a double gate that prevents exploration. The `hasExpanded` flag is write-once (once true, never reverts). See `generateAllCompoundCandidates` and `generateCompoundCandidates` in `src/core/engine.ts`.

3.3. **Mastered compounds are excluded from suggestions.** A compound is mastered after `masteryStreak` (default 3) consecutive practices at or above `masteryNpm` (default 480). In the compound system, mastery is checked at the COMPOUND level (`isCompoundMastered`), not per-dimension. A mastered compound is never suggested as the STAY option, and never generated as a neighbor candidate. However, individual dimension values from mastered compounds CAN appear as unchanged dimensions in other non-mastered compounds. Note: the legacy system separately tracks per-signature mastery (`isSignatureMastered`) which gates individual signature neighbors in `generateCandidates`. Do not conflate compound mastery with signature mastery.

3.4. **Compound IDs follow a strict format: `scale+position+rhythm:pattern[+notePattern][+articulation]`.** The `+` delimiter separates dimensions; the `:` separates rhythm name from its pattern. Parsing depends on this exact format. See `compoundId()` and `parseCompoundId()` in `src/db/compound.ts`. Never change this format without migrating all existing data. Examples: `pentatonic+E+8ths:xx`, `pentatonic+E+8ths:xx+stepwise`.

3.5. **Compounds always track ALL dimensions (including locked ones).** The dimension lock only affects which dimensions are VARIED in recommendations. When logging practice via `logCompoundPractice`, the compound always includes `notePattern` (and eventually `articulation`). This means the compound ID includes all dimensions from the start. WHY: This avoids needing to migrate compound IDs when dimensions unlock.

3.6. **The scoring model has 4 components: consolidation, staleness, readiness, and diversity.** Each is weighted by a configurable coefficient. Scores are then squared in `weightedRandomSelectCompound` to sharpen the distribution (high scores get disproportionately more selection probability). If all scores are 0, selection is uniform random. Do not change the squaring behavior without understanding its impact on exploration vs exploitation balance.

3.7. **Transfer coefficients are per-dimension, not global.** The `transferCoefficients` map in `CompoundScoringConfig` assigns different transfer rates to different dimensions (e.g., position transfers at 0.8, scale at 0.4). This means changing position is easier than changing scale. These are used in `calculateReadinessScore` to estimate performance on untried compounds based on related compounds.

3.8. **Struggling detection uses a separate counter (`strugglingStreak`).** When NPM falls below `npmTiers.struggling` (default 200), the streak increments. When NPM rises above it, the streak resets to 0. This is independent of the mastery streak. The `streakThreshold` in `DEFAULT_SETTINGS` is 1, meaning a single sub-200 NPM practice triggers struggling detection. Struggling compounds get a scoring boost to encourage revisiting them.

---

## Database Rules

4.1. **SQLite via better-sqlite3, stored at `~/.guitar-teacher/data.db`.** All operations are synchronous (better-sqlite3 is sync). The `createInMemoryDatabase()` function creates an in-memory DB for tests with the full schema and a default user. Always use this for tests, never touch the production database.

4.2. **Schema migrations are imperative, not declarative.** The `runMigrations()` function in `src/db/schema.ts` checks columns with `PRAGMA table_info` and adds missing columns via `ALTER TABLE`. New migrations must be appended to the end of `runMigrations()`, must check whether they've already been applied (idempotent), and must handle both fresh databases and old databases. Never drop a column or rename a table in a migration without backup logic.

4.3. **Every table that stores user data has a `user_id` column.** The `Repository` class takes a `userId` in its constructor and scopes ALL queries to that user. If you add a new query method, ALWAYS include `WHERE user_id = ?` in the query. Forgetting this leaks data between users.

4.4. **The `compound_stats` table has a composite primary key: `(user_id, compound_id)`.** The `compound_id` is the string built by `compoundId()`. Compound stats are upserted via `getOrCreateCompoundStats` then `UPDATE`. Never `INSERT OR REPLACE` compound stats -- it would reset all fields.

4.5. **`recalculateAllStats()` replays the entire practice history.** It DELETEs all stats and replays from `practice_log` in order. This is called after edits/deletes to practice entries. It must be called with all relevant threshold parameters. If you add new stats columns, ensure they are properly recalculated during replay.

4.6. **Session counter is per-user and increments on each `logCompoundPractice` call.** The session number is stored on compound_stats for staleness calculation. It is NOT a timestamp -- it is a monotonically increasing integer representing the Nth practice session.

4.7. **Boolean columns in SQLite are stored as INTEGER (0/1).** The `Repository` maps them: `has_expanded === 1` becomes `hasExpanded: true`. When writing, convert: `hasExpanded ? 1 : 0`. Never store `true`/`false` strings.

---

## Testing Rules

5.1. **Run `npm test` (which runs `vitest run`) to verify all changes.** Tests must pass before any change is considered complete. The test suite runs in ~2-5 seconds. There is no CI pipeline -- the local test suite IS the gate.

5.2. **Use `createTestContext(seed, settings?)` from `tests/integration/harness.ts` for integration tests.** This creates an in-memory DB, default dimensions from `config/` YAML, a seeded random function, and an `InMemorySuggestionStore`. The seed makes tests deterministic. Always pick a distinct seed for each test to avoid accidental coupling.

5.3. **The seeded random function is a simple LCG.** `createSeededRandom(seed)` returns a deterministic `() => number`. Pass this to the Engine constructor to make suggestion selection reproducible. Do not use `Math.random` in tests.

5.4. **Test the 1-dimension-change invariant in any test that generates multiple suggestions.** If you write a test that calls `generateSuggestion()` or `generateCompoundSuggestion()` in a loop, assert `countDimensionChanges(prev, curr) <= 1` at each step. This is the system's most important invariant and has dedicated tests in `next.test.ts`, `compound.test.ts`, and `progression.test.ts`.

5.5. **NPM calculations in tests must account for `notesPerBeat`.** When testing with `logCompoundPractice`, remember: NPM = BPM * notesPerBeat. For 8ths, notesPerBeat=2, so 200 BPM = 400 NPM (expansion threshold). For triplets, notesPerBeat=3, so 134 BPM ~ 400 NPM. Getting this wrong causes tests to not trigger expansion/mastery as expected.

5.6. **Tests use `loadHistory()` to set up scenarios.** This function logs practice entries directly via `repo.logPractice` (bypassing the engine's suggestion/clear cycle). IMPORTANT: `loadHistory` only updates legacy signature stats -- it does NOT update compound stats, session counters, streaks, or achievements. If your test scenario needs compound stats, use `engine.logCompoundPractice` instead. Test scenario YAML files live in `tests/integration/scenarios/`.

5.7. **Unit tests live in `tests/unit/`, integration tests in `tests/integration/`.** Unit tests (`normalizer.test.ts`, `scoring.test.ts`) test pure functions in isolation. Integration tests test the Engine, Repository, and dimensions working together. Prefer integration tests for behavior validation; use unit tests for algorithmic edge cases.

5.8. **The test harness's `countDimensionChanges` is different from `src/db/compound.ts`'s.** The harness version works with `Suggestion | PracticeEntry` objects (nested signature objects like `rhythm.rhythm`) and checks 4 dimensions. The compound module version works with `Compound` objects (flat fields like `rhythm`, `rhythmPattern`) and checks 5 dimensions (includes `articulation`). Do not confuse them.

---

## Configuration Rules

6.1. **Settings are defined in `src/types.ts` as the `Settings` interface with `DEFAULT_SETTINGS` as the fallback.** The YAML config at `config/settings.yaml` overrides defaults. The YAML uses `snake_case` keys; the TypeScript interface uses `camelCase`. The mapping happens in `src/api/context.ts`'s `loadSettings()`. If you add a new setting, add it to: (1) the `Settings` interface, (2) `DEFAULT_SETTINGS`, (3) `loadSettings()` mapping, and (4) `config/settings.yaml`.

6.2. **Dimension configs use YAML with `entry_point` and a list of items with `id` and `next` arrays.** Rhythm config additionally has `notes_per_beat`. Note-pattern config uses `tiers` (a map of tier number to pattern IDs) instead of `next` arrays. Do not mix these structures.

6.3. **The `dimensionTiers` config in `DEFAULT_SETTINGS` controls dimension unlock order.** Tier 0 dimensions (scale, position, rhythm) are always available. Tier 1+ dimensions require a certain number of expanded compounds in the previous tier. The `entryPoint` for each tier is the default value used when the dimension first becomes active.

6.4. **NPM tier thresholds define semantic skill levels.** struggling < 200, developing < 280, progressing < 400, fast < 440, veryFast < 480, superFast < 560, shredding >= 560. These appear in the UI and affect struggling detection. The progression thresholds (expansionNpm=400, masteryNpm=480) are intentionally aligned with NPM tier boundaries.

6.5. **Transfer coefficients have a default fallback of 0.5.** If a dimension is not present in the `transferCoefficients` map, `DEFAULT_TRANSFER_COEFFICIENT = 0.5` is used. This is defined in `src/core/compound-scoring.ts`. When adding a new dimension, add its transfer coefficient to `DEFAULT_SETTINGS.compoundScoring.transferCoefficients`.

---

## API/CLI Rules

7.1. **The web API uses Hono framework.** Routes are in `src/api/routes/`. The main app is assembled in `src/api/index.ts`. All API routes are prefixed with `/api/`. The SPA frontend is served from `web/dist/` with a catch-all fallback to `index.html`.

7.2. **Every API route accepts an optional `?user=<name>` query parameter.** Default is `'default'`. This is how multi-user support works. The `getContext(userName)` call creates or retrieves the cached engine/repo for that user. If you add a new route, always extract the user parameter with `c.req.query('user') ?? 'default'`.

7.3. **The API uses `logCompoundPractice` (not the legacy `logPractice`).** This ensures compound stats, streaks, and achievements are all updated. The legacy `logPractice` method does NOT update compound stats, streaks, or achievements. If you add a new practice-logging endpoint, use `logCompoundPractice`.

7.4. **Practice history edits/deletes trigger `recalculateAllStats()`.** After any mutation to practice_log (update or delete), all stats (legacy + compound) must be recalculated from scratch. This is expensive but ensures consistency. See `PUT /api/practice/history/:id` and `DELETE /api/practice/history/:id`.

7.5. **The CLI binary is named `chops`.** The `bin` field in `package.json` maps `chops` to `./dist/cli.js`. The CLI source is `src/cli.ts` and uses the `commander` library. The `dev` script uses `tsx` for direct TypeScript execution without building.

7.6. **The server default port is 3847 (dev) or 3000 (Docker).** The `CHOPS_PORT` environment variable controls this. Docker-compose maps `${CHOPS_PORT:-3847}:3000`. The server script defaults to 3847; the Dockerfile's CMD defaults to 3000.

---

## Build & Deploy Rules

8.1. **This is a TypeScript ESM project.** `"type": "module"` in `package.json`. All imports MUST use `.js` extensions (e.g., `import { foo } from './bar.js'`), even though the source files are `.ts`. This is a Node.js ESM requirement. Forgetting the `.js` extension causes runtime import failures that TypeScript's compiler does NOT catch.

8.2. **Build with `npm run build` (runs `tsc`).** Output goes to `dist/`. The `tsconfig.json` targets ES2022 with NodeNext module resolution. `strict: true` is enabled. Always run `npm run typecheck` (which is `tsc --noEmit`) to check for type errors without emitting files.

8.3. **The frontend is a separate build.** `web/` has its own `package.json` and builds with Vite. Build with `npm run build:web` (or `cd web && npm run build`). The Docker multi-stage build handles both backend and frontend.

8.4. **Docker builds use a multi-stage approach.** Stage 1: build backend. Stage 2: build frontend. Stage 3: production image with only runtime deps. The `config/` directory is copied into the Docker image (dimensions need their YAML files at runtime). Data persists via volume mount at `~/.guitar-teacher`.

8.5. **Always run `npm test` before considering any change complete.** There is no CI. The full test suite is fast (~2-5 seconds). Run `npm run typecheck` to catch type errors and `npm run lint` to run ESLint. All three must pass.

8.6. **ESLint and Prettier are configured for both backend and frontend.** Root `eslint.config.js` covers `src/` and `tests/` (TypeScript + ESM). `web/eslint.config.js` covers the React frontend (TypeScript + React hooks + React Refresh). Prettier config is at root `.prettierrc` (shared). Scripts: `npm run lint` (ESLint backend), `npm run lint:web` (ESLint frontend), `npm run lint:all` (both), `npm run format` (Prettier write), `npm run format:check` (Prettier check), `npm run typecheck` (tsc --noEmit). The old `npm run lint` (which was `tsc --noEmit`) was renamed to `npm run typecheck`.

---

## Streaks & Achievements Rules

9.1. **Streaks are calendar-date based, not session-based.** The `updateStreak` function in `src/core/streaks.ts` compares calendar dates (YYYY-MM-DD). Same-day practice does not change the streak. Gap of 1 calendar day increments the streak. Gap of exactly 2 calendar days (1 missed day) with a freeze available uses the freeze and increments. Gap of 2+ calendar days without a freeze, or gap of 3+ calendar days regardless of freezes, resets the streak to 1. `longestStreak` is never decreased.

9.2. **Achievements are idempotent.** `checkAchievements` iterates all `ACHIEVEMENT_DEFINITIONS`, skips already-earned ones, and records new ones with `INSERT OR IGNORE`. Calling it multiple times is safe. Each achievement has a `check` function that takes a `Repository` and returns boolean.

9.3. **Mastery-category achievements award streak freezes.** When `logCompoundPractice` detects new mastery achievements, it calls `repo.addStreakFreezes(count)`. One freeze per mastery achievement. Freezes cover exactly 1 missed day (gap of 2 calendar days).

9.4. **Achievement definitions live in `src/core/achievements.ts`.** Add new achievements by appending to the `ACHIEVEMENT_DEFINITIONS` array. Each needs: `id` (unique string), `name`, `description`, `category` (one of: mastery, exploration, consistency, speed), and `check` function. The `id` is stored in the database, so never change it after deployment.

9.5. **Streaks and achievements are only updated via `logCompoundPractice`.** The legacy `logPractice` does NOT update streaks or check achievements. This is by design -- the compound system is the canonical path.

---

## Code Style Rules

10.1. **TypeScript strict mode is enabled.** All code must pass `tsc --strict`. No `any` types unless absolutely necessary and cast through `unknown` first (see the registry's typed accessors as an example).

10.2. **Use discriminated unions for Signature types.** Each signature has a `dimension` field that is a string literal type (`'rhythm'`, `'scale'`, etc.). Use this for type narrowing in switch/if statements. The `sigId()` function depends on this discriminator.

10.3. **Database row types are private interfaces in `repository.ts`.** `PracticeLogRow`, `StatsRow`, `CompoundStatsRow` etc. map directly to database column names (snake_case). Public-facing types use camelCase. The `rowTo*` methods handle the conversion. If you add a column, update both the row interface and the conversion method.

10.4. **YAML config keys use `snake_case`; TypeScript uses `camelCase`.** The mapping between these two is done explicitly in `loadSettings()` in `src/api/context.ts`. This is not automatic -- if you add a setting, you must add the mapping.

10.5. **Prefer `compoundsEqual()` over `===` for compound comparison.** Two compound objects with identical fields are not `===` equal (they are different object references). Always use `compoundsEqual()` from `src/db/compound.ts`. Similarly, use `compoundId()` to get a comparable string key.

10.6. **Handle `null` vs `undefined` carefully for optional compound dimensions.** In the `Compound` type, `notePattern` and `articulation` are `T | undefined`. In `CompoundStats` (from DB), they are `T | null`. The conversion happens in `statsToCompound()`: `null` becomes `undefined` (field is omitted). In `compoundId()`, `undefined` dimensions are not included in the ID. This distinction matters for compound ID generation and equality checks.

---

## Common Pitfalls

11.1. **Forgetting to update both scoring systems.** If you modify how practice is logged, ensure both legacy signature stats AND compound stats are updated. The `logCompoundPractice` method handles both, but direct `repo.logPractice` only updates legacy stats.

11.2. **Breaking the compound ID format.** The compound ID is used as a database primary key. Changing the format of `compoundId()` without migrating existing data will create orphaned records and duplicate compounds.

11.3. **Not accounting for `notesPerBeat` in NPM calculations.** NPM = BPM * notesPerBeat. The `bpmToNpm` function in `normalizer.ts` does this. The Engine's `logPractice` and `logCompoundPractice` both call this internally. If you compute NPM manually (e.g., in tests), you must multiply by notesPerBeat.

11.4. **Assuming dimensions are unlocked.** Tier 1+ dimensions (note-pattern, articulation) are locked by default. The `isDimensionUnlocked()` check gates whether those dimensions are varied in suggestions. Always check unlock status before generating candidates for higher-tier dimensions.

11.5. **Mutating compound objects with spread.** `{ ...current, scale: neighbor.scale }` creates a shallow copy. This is fine for Compound objects (all primitive fields). But if Compound ever gets nested objects, this would create shared references. Currently safe but be careful.

11.6. **The `getRelatedCompounds` method does a full table scan.** It calls `getAllCompoundStats()` and filters in JavaScript. This is O(n) where n is total compounds. For now this is fine (users won't have thousands), but it could become a bottleneck. Do not call it in tight loops.

11.7. **Forgetting to rebuild Docker after completing a feature.** The app runs in Docker via `docker compose`. After any code change (backend or frontend), run `docker compose up -d --build` to rebuild and redeploy. The frontend is built inside the Docker multi-stage build, so local file changes are NOT reflected until Docker rebuilds. Always rebuild Docker as the final step of any feature implementation.
