import Database from 'better-sqlite3';
import {
  RhythmSig,
  ScaleSig,
  PositionSig,
  NotePatternSig,
  SignatureStats,
  CompoundStats,
  Compound,
  sigId,
} from '../types.js';
import { calculateEma } from '../core/normalizer.js';
import { compoundId } from './compound.js';

// A logged practice entry
export interface PracticeEntry {
  id: number;
  loggedAt: string;
  rhythm: RhythmSig;
  scale: ScaleSig;
  position: PositionSig;
  notePattern: NotePatternSig;
  key: string;
  bpm: number;
  npm: number;
  reasoning: string | null;
}

export class Repository {
  constructor(
    private db: Database.Database,
    private userId: number = 1,
  ) {}

  // Log a practice session
  logPractice(
    rhythm: RhythmSig,
    scale: ScaleSig,
    position: PositionSig,
    notePattern: NotePatternSig,
    key: string,
    bpm: number,
    npm: number,
    reasoning: string | null,
    emaAlpha: number,
  ): PracticeEntry {
    const now = new Date().toISOString();

    // Insert into practice log
    const result = this.db
      .prepare(
        `
        INSERT INTO practice_log (
          user_id, logged_at, rhythm_rhythm, rhythm_pattern,
          scale, position, note_pattern,
          key, bpm, npm, reasoning
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        this.userId,
        now,
        rhythm.rhythm,
        rhythm.pattern,
        scale.scale,
        position.position,
        notePattern.pattern,
        key,
        bpm,
        npm,
        reasoning,
      );

    // Update rhythm stats
    this.updateStats(sigId(rhythm), 'rhythm', npm, now, emaAlpha);

    // Update scale stats
    this.updateStats(sigId(scale), 'scale', npm, now, emaAlpha);

    // Update position stats
    this.updateStats(sigId(position), 'position', npm, now, emaAlpha);

    // Update note-pattern stats
    this.updateStats(sigId(notePattern), 'note-pattern', npm, now, emaAlpha);

    return {
      id: result.lastInsertRowid as number,
      loggedAt: now,
      rhythm,
      scale,
      position,
      notePattern,
      key,
      bpm,
      npm,
      reasoning,
    };
  }

  // Get most recent practice entry
  getLastPractice(): PracticeEntry | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM practice_log
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      )
      .get(this.userId) as PracticeLogRow | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  // Get recent practice entries for history
  getRecentPractice(limit: number = 20): PracticeEntry[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM practice_log
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ?
      `,
      )
      .all(this.userId, limit) as PracticeLogRow[];

    return rows.map((row) => this.rowToEntry(row));
  }

  // Update signature stats
  private updateStats(
    signatureId: string,
    dimension: string,
    npm: number,
    timestamp: string,
    emaAlpha: number,
  ): void {
    const existing = this.getStats(signatureId);

    if (existing) {
      const newBest = Math.max(existing.bestNpm, npm);
      const newEma = calculateEma(existing.emaNpm, npm, emaAlpha);
      const newAttempts = existing.attempts + 1;

      this.db
        .prepare(
          `
          UPDATE signature_stats
          SET best_npm = ?, ema_npm = ?, attempts = ?, last_seen = ?
          WHERE user_id = ? AND signature_id = ?
        `,
        )
        .run(newBest, newEma, newAttempts, timestamp, this.userId, signatureId);
    } else {
      this.db
        .prepare(
          `
          INSERT INTO signature_stats (user_id, signature_id, dimension, best_npm, ema_npm, attempts, last_seen, has_expanded, mastery_streak, is_mastered)
          VALUES (?, ?, ?, ?, ?, 1, ?, 0, 0, 0)
        `,
        )
        .run(this.userId, signatureId, dimension, npm, npm, timestamp);
    }
  }

  // Update progression status for a signature
  updateProgression(
    signatureId: string,
    npm: number,
    expansionNpm: number,
    masteryNpm: number,
    masteryStreakRequired: number,
  ): void {
    const existing = this.getStats(signatureId);
    if (!existing) return;

    let hasExpanded = existing.hasExpanded;
    let masteryStreak = existing.masteryStreak;
    let isMastered = existing.isMastered;

    // Check expansion threshold
    if (npm >= expansionNpm) {
      hasExpanded = true;
    }

    // Check mastery threshold
    if (npm >= masteryNpm) {
      masteryStreak += 1;
      if (masteryStreak >= masteryStreakRequired) {
        isMastered = true;
      }
    } else {
      // Reset streak if below mastery threshold
      masteryStreak = 0;
    }

    this.db
      .prepare(
        `
        UPDATE signature_stats
        SET has_expanded = ?, mastery_streak = ?, is_mastered = ?
        WHERE user_id = ? AND signature_id = ?
      `,
      )
      .run(hasExpanded ? 1 : 0, masteryStreak, isMastered ? 1 : 0, this.userId, signatureId);
  }

  // Get stats for a signature
  getStats(signatureId: string): SignatureStats | null {
    const row = this.db
      .prepare('SELECT * FROM signature_stats WHERE user_id = ? AND signature_id = ?')
      .get(this.userId, signatureId) as StatsRow | undefined;

    if (!row) return null;
    return {
      signatureId: row.signature_id,
      dimension: row.dimension,
      bestNpm: row.best_npm,
      emaNpm: row.ema_npm,
      attempts: row.attempts,
      lastSeen: row.last_seen,
      hasExpanded: row.has_expanded === 1,
      masteryStreak: row.mastery_streak,
      isMastered: row.is_mastered === 1,
    };
  }

  // Get all stats
  getAllStats(): SignatureStats[] {
    const rows = this.db
      .prepare('SELECT * FROM signature_stats WHERE user_id = ? ORDER BY dimension, signature_id')
      .all(this.userId) as StatsRow[];

    return rows.map((row) => ({
      signatureId: row.signature_id,
      dimension: row.dimension,
      bestNpm: row.best_npm,
      emaNpm: row.ema_npm,
      attempts: row.attempts,
      lastSeen: row.last_seen,
      hasExpanded: row.has_expanded === 1,
      masteryStreak: row.mastery_streak,
      isMastered: row.is_mastered === 1,
    }));
  }

  // Check if any practice exists
  hasAnyPractice(): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM practice_log WHERE user_id = ?')
      .get(this.userId) as { count: number };
    return row.count > 0;
  }

  // Get a practice entry by ID
  getPracticeById(id: number): PracticeEntry | null {
    const row = this.db
      .prepare('SELECT * FROM practice_log WHERE user_id = ? AND id = ?')
      .get(this.userId, id) as PracticeLogRow | undefined;

    if (!row) return null;
    return this.rowToEntry(row);
  }

  // Update a practice entry's BPM
  updatePracticeBpm(id: number, bpm: number, npm: number): void {
    this.db
      .prepare('UPDATE practice_log SET bpm = ?, npm = ? WHERE user_id = ? AND id = ?')
      .run(bpm, npm, this.userId, id);
  }

  // Update a practice entry fully
  updatePractice(
    id: number,
    rhythm: RhythmSig,
    scale: ScaleSig,
    position: PositionSig,
    notePattern: NotePatternSig,
    key: string,
    bpm: number,
    npm: number,
  ): void {
    this.db
      .prepare(
        `
        UPDATE practice_log
        SET rhythm_rhythm = ?, rhythm_pattern = ?, scale = ?, position = ?,
            note_pattern = ?, key = ?, bpm = ?, npm = ?
        WHERE user_id = ? AND id = ?
      `,
      )
      .run(
        rhythm.rhythm,
        rhythm.pattern,
        scale.scale,
        position.position,
        notePattern.pattern,
        key,
        bpm,
        npm,
        this.userId,
        id,
      );
  }

  // Delete a practice entry
  deletePractice(id: number): void {
    this.db.prepare('DELETE FROM practice_log WHERE user_id = ? AND id = ?').run(this.userId, id);
  }

  // Get all practice entries (for recalculation)
  getAllPractice(): PracticeEntry[] {
    const rows = this.db
      .prepare('SELECT * FROM practice_log WHERE user_id = ? ORDER BY id ASC')
      .all(this.userId) as PracticeLogRow[];

    return rows.map((row) => this.rowToEntry(row));
  }

  // Recalculate all stats from practice history
  recalculateStats(
    emaAlpha: number,
    expansionNpm: number = 400,
    masteryNpm: number = 480,
    masteryStreakRequired: number = 3,
  ): void {
    // Clear existing stats for this user
    this.db.prepare('DELETE FROM signature_stats WHERE user_id = ?').run(this.userId);

    // Replay all practice entries
    const entries = this.getAllPractice();
    for (const entry of entries) {
      this.updateStats(sigId(entry.rhythm), 'rhythm', entry.npm, entry.loggedAt, emaAlpha);
      this.updateStats(sigId(entry.scale), 'scale', entry.npm, entry.loggedAt, emaAlpha);
      this.updateStats(sigId(entry.position), 'position', entry.npm, entry.loggedAt, emaAlpha);
      this.updateStats(
        sigId(entry.notePattern),
        'note-pattern',
        entry.npm,
        entry.loggedAt,
        emaAlpha,
      );

      // Update progression for each signature
      this.updateProgression(
        sigId(entry.rhythm),
        entry.npm,
        expansionNpm,
        masteryNpm,
        masteryStreakRequired,
      );
      this.updateProgression(
        sigId(entry.scale),
        entry.npm,
        expansionNpm,
        masteryNpm,
        masteryStreakRequired,
      );
      this.updateProgression(
        sigId(entry.position),
        entry.npm,
        expansionNpm,
        masteryNpm,
        masteryStreakRequired,
      );
      this.updateProgression(
        sigId(entry.notePattern),
        entry.npm,
        expansionNpm,
        masteryNpm,
        masteryStreakRequired,
      );
    }
  }

  // Recalculate compound stats from practice history
  recalculateCompoundStats(
    emaAlpha: number,
    expansionNpm: number = 400,
    masteryNpm: number = 480,
    masteryStreakRequired: number = 3,
    strugglingNpm: number = 200,
  ): void {
    // Clear existing compound stats for this user
    this.db.prepare('DELETE FROM compound_stats WHERE user_id = ?').run(this.userId);

    // Reset session counter
    this.db.prepare('DELETE FROM session_counter WHERE user_id = ?').run(this.userId);

    // Replay all practice entries
    const entries = this.getAllPractice();
    for (const entry of entries) {
      // Increment session
      const sessionNumber = this.incrementSession();

      // Always build full compound (all dimensions) for tracking
      const compound: Compound = {
        scale: entry.scale.scale,
        position: entry.position.position,
        rhythm: entry.rhythm.rhythm,
        rhythmPattern: entry.rhythm.pattern,
        notePattern: entry.notePattern.pattern,
      };

      // Update compound stats
      this.updateCompoundStats(
        compound,
        entry.npm,
        entry.bpm,
        sessionNumber,
        emaAlpha,
        expansionNpm,
        masteryNpm,
        masteryStreakRequired,
        strugglingNpm,
      );
    }
  }

  // Recalculate all stats (both legacy and compound)
  recalculateAllStats(
    emaAlpha: number,
    expansionNpm: number = 400,
    masteryNpm: number = 480,
    masteryStreakRequired: number = 3,
    strugglingNpm: number = 200,
  ): void {
    this.recalculateStats(emaAlpha, expansionNpm, masteryNpm, masteryStreakRequired);
    this.recalculateCompoundStats(
      emaAlpha,
      expansionNpm,
      masteryNpm,
      masteryStreakRequired,
      strugglingNpm,
    );
  }

  private rowToEntry(row: PracticeLogRow): PracticeEntry {
    return {
      id: row.id,
      loggedAt: row.logged_at,
      rhythm: {
        dimension: 'rhythm',
        rhythm: row.rhythm_rhythm,
        pattern: row.rhythm_pattern,
      },
      scale: {
        dimension: 'scale',
        scale: row.scale,
      },
      position: {
        dimension: 'position',
        position: row.position,
      },
      notePattern: {
        dimension: 'note-pattern',
        pattern: row.note_pattern,
      },
      key: row.key,
      bpm: row.bpm,
      npm: row.npm,
      reasoning: row.reasoning,
    };
  }

  // ============================================================
  // COMPOUND-BASED PROGRESSION SYSTEM
  // ============================================================

  // Get current session number
  getCurrentSession(): number {
    const row = this.db
      .prepare('SELECT current_session FROM session_counter WHERE user_id = ?')
      .get(this.userId) as { current_session: number } | undefined;
    return row?.current_session ?? 0;
  }

  // Increment and return new session number
  incrementSession(): number {
    const current = this.getCurrentSession();
    const next = current + 1;
    this.db
      .prepare('INSERT OR REPLACE INTO session_counter (user_id, current_session) VALUES (?, ?)')
      .run(this.userId, next);
    return next;
  }

  // Get compound stats by ID
  getCompoundStats(id: string): CompoundStats | null {
    const row = this.db
      .prepare('SELECT * FROM compound_stats WHERE user_id = ? AND compound_id = ?')
      .get(this.userId, id) as CompoundStatsRow | undefined;

    if (!row) return null;
    return this.rowToCompoundStats(row);
  }

  // Get or create compound stats
  getOrCreateCompoundStats(compound: Compound): CompoundStats {
    const id = compoundId(compound);
    const existing = this.getCompoundStats(id);
    if (existing) return existing;

    // Create new stats
    this.db
      .prepare(
        `
        INSERT INTO compound_stats (
          user_id, compound_id, scale, position, rhythm, rhythm_pattern, note_pattern, articulation,
          best_npm, ema_npm, attempts, has_expanded, mastery_streak, is_mastered, struggling_streak
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0)
      `,
      )
      .run(
        this.userId,
        id,
        compound.scale,
        compound.position,
        compound.rhythm,
        compound.rhythmPattern,
        compound.notePattern ?? null,
        compound.articulation ?? null,
      );

    return this.getCompoundStats(id)!;
  }

  // Update compound stats after practice
  updateCompoundStats(
    compound: Compound,
    npm: number,
    bpm: number,
    sessionNumber: number,
    emaAlpha: number,
    expansionNpm: number,
    masteryNpm: number,
    masteryStreakRequired: number,
    strugglingNpm: number = 200,
  ): CompoundStats {
    const id = compoundId(compound);
    const existing = this.getOrCreateCompoundStats(compound);
    const now = new Date().toISOString();

    const newBest = Math.max(existing.bestNpm, npm);
    const newEma = existing.attempts === 0 ? npm : calculateEma(existing.emaNpm, npm, emaAlpha);
    const newAttempts = existing.attempts + 1;

    // Check expansion
    let hasExpanded = existing.hasExpanded;
    if (npm >= expansionNpm) {
      hasExpanded = true;
    }

    // Check mastery streak
    let masteryStreak = existing.masteryStreak;
    let isMastered = existing.isMastered;
    if (npm >= masteryNpm) {
      masteryStreak += 1;
      if (masteryStreak >= masteryStreakRequired) {
        isMastered = true;
      }
    } else {
      masteryStreak = 0;
    }

    // Check struggling streak
    let strugglingStreak = existing.strugglingStreak;
    if (npm < strugglingNpm) {
      strugglingStreak += 1;
    } else {
      // Reset struggling streak when performance improves
      strugglingStreak = 0;
    }

    this.db
      .prepare(
        `
        UPDATE compound_stats
        SET best_npm = ?, ema_npm = ?, last_npm = ?, last_bpm = ?, attempts = ?, has_expanded = ?,
            mastery_streak = ?, is_mastered = ?, struggling_streak = ?,
            last_practiced = ?, last_practiced_session = ?
        WHERE user_id = ? AND compound_id = ?
      `,
      )
      .run(
        newBest,
        newEma,
        npm, // last_npm is the current practice NPM
        bpm, // last_bpm is the current practice BPM
        newAttempts,
        hasExpanded ? 1 : 0,
        masteryStreak,
        isMastered ? 1 : 0,
        strugglingStreak,
        now,
        sessionNumber,
        this.userId,
        id,
      );

    return this.getCompoundStats(id)!;
  }

  // Get all compound stats
  getAllCompoundStats(): CompoundStats[] {
    const rows = this.db
      .prepare('SELECT * FROM compound_stats WHERE user_id = ? ORDER BY compound_id')
      .all(this.userId) as CompoundStatsRow[];

    return rows.map((row) => this.rowToCompoundStats(row));
  }

  // Manually set a compound's expanded status
  setCompoundExpanded(compoundId: string, expanded: boolean): boolean {
    const result = this.db
      .prepare('UPDATE compound_stats SET has_expanded = ? WHERE user_id = ? AND compound_id = ?')
      .run(expanded ? 1 : 0, this.userId, compoundId);

    return result.changes > 0;
  }

  // Get expanded compounds count for a tier
  // Tier 0 = count distinct (scale, position, rhythm) combinations that are expanded
  // Tier 1 = count distinct (scale, position, rhythm, note_pattern) combinations that are expanded
  // Tier 2 = count with articulation
  //
  // The idea: to unlock note-pattern, you need to expand 5 different base compounds
  // (regardless of what note pattern you used). To unlock articulation, you need
  // to expand 5 different note-pattern combos, etc.
  countExpandedCompoundsInTier(tier: number): number {
    let query: string;

    if (tier === 0) {
      // Count distinct (scale, position, rhythm) that have at least one expanded compound
      query = `
        SELECT COUNT(DISTINCT scale || '+' || position || '+' || rhythm) as count
        FROM compound_stats
        WHERE user_id = ? AND has_expanded = 1
      `;
    } else if (tier === 1) {
      // Count distinct (scale, position, rhythm, note_pattern) that are expanded
      // Only count if note-pattern dimension is unlocked
      query = `
        SELECT COUNT(*) as count
        FROM compound_stats
        WHERE user_id = ? AND has_expanded = 1 AND note_pattern IS NOT NULL AND articulation IS NULL
      `;
    } else {
      // Tier 2+: count compounds with articulation
      query = `
        SELECT COUNT(*) as count
        FROM compound_stats
        WHERE user_id = ? AND has_expanded = 1 AND articulation IS NOT NULL
      `;
    }

    const row = this.db.prepare(query).get(this.userId) as { count: number };
    return row.count;
  }

  // Check if a dimension is unlocked
  isDimensionUnlocked(dimension: string): boolean {
    const row = this.db
      .prepare('SELECT * FROM dimension_unlocks WHERE user_id = ? AND dimension = ?')
      .get(this.userId, dimension) as DimensionUnlockRow | undefined;
    return row !== undefined;
  }

  // Unlock a dimension
  unlockDimension(dimension: string, sessionNumber: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO dimension_unlocks (user_id, dimension, unlocked_at, unlocked_at_session)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(this.userId, dimension, now, sessionNumber);
  }

  // Get all unlocked dimensions
  getUnlockedDimensions(): string[] {
    const rows = this.db
      .prepare('SELECT dimension FROM dimension_unlocks WHERE user_id = ?')
      .all(this.userId) as Array<{ dimension: string }>;
    return rows.map((r) => r.dimension);
  }

  // Migrate compounds when a new dimension unlocks
  // Adds the entry point value to all existing compounds
  migrateCompoundsForNewDimension(dimension: string, entryPoint: string): void {
    if (dimension === 'note-pattern') {
      // Add note_pattern to all compounds that don't have it
      const compounds = this.db
        .prepare('SELECT * FROM compound_stats WHERE user_id = ? AND note_pattern IS NULL')
        .all(this.userId) as CompoundStatsRow[];

      for (const row of compounds) {
        const oldId = row.compound_id;
        const newId = `${oldId}+${entryPoint}`;

        // Update the compound
        this.db
          .prepare(
            `
            UPDATE compound_stats
            SET compound_id = ?, note_pattern = ?
            WHERE user_id = ? AND compound_id = ?
          `,
          )
          .run(newId, entryPoint, this.userId, oldId);

        // Update practice_log references
        this.db
          .prepare('UPDATE practice_log SET compound_id = ? WHERE user_id = ? AND compound_id = ?')
          .run(newId, this.userId, oldId);
      }
    } else if (dimension === 'articulation') {
      // Add articulation to all compounds that don't have it
      const compounds = this.db
        .prepare(
          'SELECT * FROM compound_stats WHERE user_id = ? AND articulation IS NULL AND note_pattern IS NOT NULL',
        )
        .all(this.userId) as CompoundStatsRow[];

      for (const row of compounds) {
        const oldId = row.compound_id;
        const newId = `${oldId}+${entryPoint}`;

        this.db
          .prepare(
            `
            UPDATE compound_stats
            SET compound_id = ?, articulation = ?
            WHERE user_id = ? AND compound_id = ?
          `,
          )
          .run(newId, entryPoint, this.userId, oldId);

        this.db
          .prepare('UPDATE practice_log SET compound_id = ? WHERE user_id = ? AND compound_id = ?')
          .run(newId, this.userId, oldId);
      }
    }
  }

  // Get related compounds (differ by exactly 1 dimension)
  // Used for transfer learning estimates
  getRelatedCompounds(compound: Compound): CompoundStats[] {
    const all = this.getAllCompoundStats();
    const related: CompoundStats[] = [];

    for (const stats of all) {
      const other: Compound = {
        scale: stats.scale,
        position: stats.position,
        rhythm: stats.rhythm,
        rhythmPattern: stats.rhythmPattern,
        notePattern: stats.notePattern ?? undefined,
        articulation: stats.articulation ?? undefined,
      };

      // Count differences
      let diff = 0;
      if (compound.scale !== other.scale) diff++;
      if (compound.position !== other.position) diff++;
      if (compound.rhythm !== other.rhythm || compound.rhythmPattern !== other.rhythmPattern)
        diff++;
      if (compound.notePattern !== other.notePattern) diff++;
      if (compound.articulation !== other.articulation) diff++;

      if (diff === 1) {
        related.push(stats);
      }
    }

    return related;
  }

  // Get last practiced compound
  getLastCompound(): Compound | null {
    const lastPractice = this.getLastPractice();
    if (!lastPractice) return null;

    const compound: Compound = {
      scale: lastPractice.scale.scale,
      position: lastPractice.position.position,
      rhythm: lastPractice.rhythm.rhythm,
      rhythmPattern: lastPractice.rhythm.pattern,
    };

    // Check if note-pattern dimension is unlocked
    if (this.isDimensionUnlocked('note-pattern')) {
      compound.notePattern = lastPractice.notePattern.pattern;
    }

    // Check if articulation dimension is unlocked
    if (this.isDimensionUnlocked('articulation')) {
      // For now, articulation comes from practice log if available
      // We'd need to add articulation to PracticeEntry
      compound.articulation = undefined; // TODO: get from practice log
    }

    return compound;
  }

  // Get recent dimension changes (for diversity scoring)
  getRecentDimensionChanges(lookback: number): string[] {
    const practices = this.getRecentPractice(lookback + 1);
    if (practices.length < 2) return [];

    const changes: string[] = [];
    for (let i = 0; i < practices.length - 1 && i < lookback; i++) {
      const current = practices[i];
      const previous = practices[i + 1];

      if (
        current.rhythm.rhythm !== previous.rhythm.rhythm ||
        current.rhythm.pattern !== previous.rhythm.pattern
      ) {
        changes.push('rhythm');
      } else if (current.scale.scale !== previous.scale.scale) {
        changes.push('scale');
      } else if (current.position.position !== previous.position.position) {
        changes.push('position');
      } else if (current.notePattern.pattern !== previous.notePattern.pattern) {
        changes.push('note-pattern');
      }
    }

    return changes;
  }

  private rowToCompoundStats(row: CompoundStatsRow): CompoundStats {
    return {
      id: row.compound_id,
      scale: row.scale,
      position: row.position,
      rhythm: row.rhythm,
      rhythmPattern: row.rhythm_pattern,
      notePattern: row.note_pattern,
      articulation: row.articulation,
      bestNpm: row.best_npm,
      emaNpm: row.ema_npm,
      lastNpm: row.last_npm ?? 0,
      lastBpm: row.last_bpm ?? 0,
      attempts: row.attempts,
      hasExpanded: row.has_expanded === 1,
      masteryStreak: row.mastery_streak,
      isMastered: row.is_mastered === 1,
      strugglingStreak: row.struggling_streak ?? 0,
      lastPracticed: row.last_practiced,
      lastPracticedSession: row.last_practiced_session,
    };
  }

  // ============================================================
  // DIMENSION PROFICIENCY (User-declared competence)
  // ============================================================

  // Check if user has declared proficiency in a dimension value
  isProficient(dimension: string, value: string): boolean {
    const row = this.db
      .prepare(
        'SELECT 1 FROM dimension_proficiency WHERE user_id = ? AND dimension = ? AND value = ?',
      )
      .get(this.userId, dimension, value);
    return row !== undefined;
  }

  // Set proficiency for a dimension value
  setProficient(dimension: string, value: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO dimension_proficiency (user_id, dimension, value, declared_at)
        VALUES (?, ?, ?, ?)
      `,
      )
      .run(this.userId, dimension, value, now);
  }

  // Remove proficiency for a dimension value
  removeProficient(dimension: string, value: string): void {
    this.db
      .prepare(
        'DELETE FROM dimension_proficiency WHERE user_id = ? AND dimension = ? AND value = ?',
      )
      .run(this.userId, dimension, value);
  }

  // Get all proficiencies for a dimension
  getProficiencies(dimension: string): string[] {
    const rows = this.db
      .prepare(
        'SELECT value FROM dimension_proficiency WHERE user_id = ? AND dimension = ? ORDER BY value',
      )
      .all(this.userId, dimension) as Array<{ value: string }>;
    return rows.map((r) => r.value);
  }

  // Get all proficiencies across all dimensions
  getAllProficiencies(): Array<{ dimension: string; value: string; declaredAt: string }> {
    const rows = this.db
      .prepare(
        'SELECT dimension, value, declared_at FROM dimension_proficiency WHERE user_id = ? ORDER BY dimension, value',
      )
      .all(this.userId) as Array<{ dimension: string; value: string; declared_at: string }>;
    return rows.map((r) => ({
      dimension: r.dimension,
      value: r.value,
      declaredAt: r.declared_at,
    }));
  }

  // ============================================================
  // STRUGGLING DETECTION
  // ============================================================

  // Get compounds where user is struggling (consecutive attempts below threshold)
  getStrugglingCompounds(streakThreshold: number): CompoundStats[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM compound_stats
        WHERE user_id = ? AND struggling_streak >= ?
        ORDER BY struggling_streak DESC
      `,
      )
      .all(this.userId, streakThreshold) as CompoundStatsRow[];

    return rows.map((row) => this.rowToCompoundStats(row));
  }

  // Identify dimension values where user is struggling and has declared proficiency
  // Returns list of {dimension, value} that should potentially be demoted
  getStrugglingProficiencies(
    streakThreshold: number,
  ): Array<{ dimension: string; value: string; compoundId: string; streak: number }> {
    const struggling = this.getStrugglingCompounds(streakThreshold);
    const results: Array<{ dimension: string; value: string; compoundId: string; streak: number }> =
      [];

    for (const compound of struggling) {
      // Check each dimension value against proficiencies
      if (this.isProficient('scale', compound.scale)) {
        results.push({
          dimension: 'scale',
          value: compound.scale,
          compoundId: compound.id,
          streak: compound.strugglingStreak,
        });
      }
      if (this.isProficient('position', compound.position)) {
        results.push({
          dimension: 'position',
          value: compound.position,
          compoundId: compound.id,
          streak: compound.strugglingStreak,
        });
      }
      if (this.isProficient('rhythm', compound.rhythm)) {
        results.push({
          dimension: 'rhythm',
          value: compound.rhythm,
          compoundId: compound.id,
          streak: compound.strugglingStreak,
        });
      }
      if (compound.notePattern && this.isProficient('note-pattern', compound.notePattern)) {
        results.push({
          dimension: 'note-pattern',
          value: compound.notePattern,
          compoundId: compound.id,
          streak: compound.strugglingStreak,
        });
      }
    }

    return results;
  }

  // ============================================================
  // STREAKS
  // ============================================================

  // Get streak info for the user
  getStreakInfo(): {
    currentStreak: number;
    longestStreak: number;
    lastPracticeDate: string | null;
    streakFreezes: number;
  } | null {
    const row = this.db.prepare('SELECT * FROM streaks WHERE user_id = ?').get(this.userId) as
      | {
          current_streak: number;
          longest_streak: number;
          last_practice_date: string | null;
          streak_freezes: number;
        }
      | undefined;

    if (!row) return null;
    return {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      lastPracticeDate: row.last_practice_date,
      streakFreezes: row.streak_freezes,
    };
  }

  // Update streak data
  updateStreakData(
    currentStreak: number,
    longestStreak: number,
    lastPracticeDate: string,
    freezes: number,
  ): void {
    this.db
      .prepare(
        `
        INSERT OR REPLACE INTO streaks (user_id, current_streak, longest_streak, last_practice_date, streak_freezes)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(this.userId, currentStreak, longestStreak, lastPracticeDate, freezes);
  }

  // Add streak freezes (earned from mastery achievements)
  addStreakFreezes(count: number): void {
    const info = this.getStreakInfo();
    if (info) {
      this.db
        .prepare('UPDATE streaks SET streak_freezes = streak_freezes + ? WHERE user_id = ?')
        .run(count, this.userId);
    }
  }

  // ============================================================
  // ACHIEVEMENTS
  // ============================================================

  // Record an earned achievement
  earnAchievement(achievementId: string, earnedAt: string): void {
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO achievements (user_id, achievement_id, earned_at)
        VALUES (?, ?, ?)
      `,
      )
      .run(this.userId, achievementId, earnedAt);
  }

  // Check if an achievement has been earned
  hasAchievement(achievementId: string): boolean {
    const row = this.db
      .prepare('SELECT 1 FROM achievements WHERE user_id = ? AND achievement_id = ?')
      .get(this.userId, achievementId);
    return row !== undefined;
  }

  // Get all earned achievement IDs with timestamps
  getEarnedAchievementIds(): Array<{ achievementId: string; earnedAt: string }> {
    const rows = this.db
      .prepare(
        'SELECT achievement_id, earned_at FROM achievements WHERE user_id = ? ORDER BY earned_at',
      )
      .all(this.userId) as Array<{ achievement_id: string; earned_at: string }>;
    return rows.map((r) => ({ achievementId: r.achievement_id, earnedAt: r.earned_at }));
  }

  // ============================================================
  // ACHIEVEMENT QUERY HELPERS
  // ============================================================

  // Get total practice count
  getTotalPracticeCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM practice_log WHERE user_id = ?')
      .get(this.userId) as { count: number };
    return row.count;
  }

  // Get max NPM across all compounds
  getMaxNpmAcrossCompounds(): number {
    const row = this.db
      .prepare('SELECT MAX(best_npm) as max_npm FROM compound_stats WHERE user_id = ?')
      .get(this.userId) as { max_npm: number | null };
    return row.max_npm ?? 0;
  }

  // Count mastered compounds
  countMasteredCompounds(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM compound_stats WHERE user_id = ? AND is_mastered = 1')
      .get(this.userId) as { count: number };
    return row.count;
  }

  // Count expanded compounds
  countExpandedCompounds(): number {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM compound_stats WHERE user_id = ? AND has_expanded = 1',
      )
      .get(this.userId) as { count: number };
    return row.count;
  }

  // Get distinct positions that have been mastered
  getMasteredPositions(): string[] {
    const rows = this.db
      .prepare('SELECT DISTINCT position FROM compound_stats WHERE user_id = ? AND is_mastered = 1')
      .all(this.userId) as Array<{ position: string }>;
    return rows.map((r) => r.position);
  }

  // Get distinct practiced values for a dimension
  getDistinctPracticedValues(dimension: string): string[] {
    let column: string;
    switch (dimension) {
      case 'scale':
        column = 'scale';
        break;
      case 'position':
        column = 'position';
        break;
      case 'rhythm':
        column = 'rhythm_rhythm';
        break;
      case 'note-pattern':
        column = 'note_pattern';
        break;
      default:
        return [];
    }
    const rows = this.db
      .prepare(`SELECT DISTINCT ${column} as val FROM practice_log WHERE user_id = ?`)
      .all(this.userId) as Array<{ val: string }>;
    return rows.map((r) => r.val);
  }
}

interface PracticeLogRow {
  id: number;
  logged_at: string;
  rhythm_rhythm: string;
  rhythm_pattern: string;
  scale: string;
  tonality: string;
  position: string;
  note_pattern: string;
  key: string;
  bpm: number;
  npm: number;
  reasoning: string | null;
}

interface StatsRow {
  signature_id: string;
  dimension: string;
  best_npm: number;
  ema_npm: number;
  attempts: number;
  last_seen: string | null;
  has_expanded: number;
  mastery_streak: number;
  is_mastered: number;
}

interface CompoundStatsRow {
  compound_id: string;
  user_id: number;
  scale: string;
  position: string;
  rhythm: string;
  rhythm_pattern: string;
  note_pattern: string | null;
  articulation: string | null;
  best_npm: number;
  ema_npm: number;
  last_npm: number;
  last_bpm: number;
  attempts: number;
  has_expanded: number;
  mastery_streak: number;
  is_mastered: number;
  struggling_streak: number;
  last_practiced: string | null;
  last_practiced_session: number | null;
}

interface DimensionUnlockRow {
  dimension: string;
  unlocked_at: string;
  unlocked_at_session: number;
}
