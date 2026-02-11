import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

const SCHEMA = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- Practice log (completed practices only)
CREATE TABLE IF NOT EXISTS practice_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  logged_at TEXT NOT NULL,
  rhythm_rhythm TEXT NOT NULL,
  rhythm_pattern TEXT NOT NULL,
  scale TEXT NOT NULL,
  tonality TEXT NOT NULL DEFAULT 'major',
  position TEXT NOT NULL,
  note_pattern TEXT NOT NULL DEFAULT 'stepwise',
  articulation TEXT,
  key TEXT NOT NULL,
  bpm INTEGER NOT NULL,
  npm INTEGER NOT NULL,
  reasoning TEXT,
  compound_id TEXT,
  session_number INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Per-signature stats (updated on each log) - kept for backward compatibility
CREATE TABLE IF NOT EXISTS signature_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL DEFAULT 1,
  signature_id TEXT NOT NULL,
  dimension TEXT NOT NULL,
  best_npm INTEGER DEFAULT 0,
  ema_npm REAL DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  last_seen TEXT,
  has_expanded INTEGER DEFAULT 0,
  mastery_streak INTEGER DEFAULT 0,
  is_mastered INTEGER DEFAULT 0,
  UNIQUE(user_id, signature_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Compound stats (the new progression system)
CREATE TABLE IF NOT EXISTS compound_stats (
  compound_id TEXT NOT NULL,
  user_id INTEGER NOT NULL DEFAULT 1,
  scale TEXT NOT NULL,
  position TEXT NOT NULL,
  rhythm TEXT NOT NULL,
  rhythm_pattern TEXT NOT NULL,
  note_pattern TEXT,
  articulation TEXT,
  best_npm INTEGER DEFAULT 0,
  ema_npm REAL DEFAULT 0,
  last_npm INTEGER DEFAULT 0,
  last_bpm INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  has_expanded INTEGER DEFAULT 0,
  mastery_streak INTEGER DEFAULT 0,
  is_mastered INTEGER DEFAULT 0,
  struggling_streak INTEGER DEFAULT 0,
  last_practiced TEXT,
  last_practiced_session INTEGER,
  PRIMARY KEY (user_id, compound_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Dimension unlock tracking
CREATE TABLE IF NOT EXISTS dimension_unlocks (
  user_id INTEGER NOT NULL DEFAULT 1,
  dimension TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  unlocked_at_session INTEGER NOT NULL,
  PRIMARY KEY (user_id, dimension),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Session counter (for staleness calculation) - per user
CREATE TABLE IF NOT EXISTS session_counter (
  user_id INTEGER PRIMARY KEY,
  current_session INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Dimension proficiency (user-declared competence)
CREATE TABLE IF NOT EXISTS dimension_proficiency (
  user_id INTEGER NOT NULL,
  dimension TEXT NOT NULL,
  value TEXT NOT NULL,
  declared_at TEXT NOT NULL,
  PRIMARY KEY (user_id, dimension, value),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Streaks tracking
CREATE TABLE IF NOT EXISTS streaks (
  user_id INTEGER NOT NULL,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_practice_date TEXT,
  streak_freezes INTEGER DEFAULT 0,
  PRIMARY KEY (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
  user_id INTEGER NOT NULL,
  achievement_id TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_log_user ON practice_log(user_id);
CREATE INDEX IF NOT EXISTS idx_log_logged_at ON practice_log(logged_at);
CREATE INDEX IF NOT EXISTS idx_stats_user ON signature_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_stats_dimension ON signature_stats(dimension);
CREATE INDEX IF NOT EXISTS idx_compound_user ON compound_stats(user_id);
CREATE INDEX IF NOT EXISTS idx_compound_scale ON compound_stats(scale);
CREATE INDEX IF NOT EXISTS idx_compound_position ON compound_stats(position);
CREATE INDEX IF NOT EXISTS idx_compound_rhythm ON compound_stats(rhythm);
CREATE INDEX IF NOT EXISTS idx_compound_expanded ON compound_stats(has_expanded);
`;

export function getDbPath(): string {
  const dataDir = path.join(os.homedir(), '.guitar-teacher');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'data.db');
}

export function createDatabase(dbPath?: string): Database.Database {
  const finalPath = dbPath ?? getDbPath();
  const db = new Database(finalPath);
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');

  // Check if there's an existing database that needs migration
  const practiceLogExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='practice_log'")
    .get();

  if (practiceLogExists) {
    // Run migrations for existing database (handles all schema updates)
    runMigrations(db);
  }

  // Create schema (will create new tables or no-op for existing ones)
  db.exec(SCHEMA);

  // Ensure default user exists
  ensureDefaultUser(db);

  return db;
}

// Ensure the default user exists
function ensureDefaultUser(db: Database.Database): void {
  const existing = db.prepare("SELECT id FROM users WHERE name = 'default'").get();
  if (!existing) {
    db.prepare("INSERT INTO users (name, created_at) VALUES ('default', ?)").run(
      new Date().toISOString(),
    );
  }
}

// Get or create a user by name, returns user ID
export function getOrCreateUser(db: Database.Database, name: string): number {
  const existing = db.prepare('SELECT id FROM users WHERE name = ?').get(name) as
    | { id: number }
    | undefined;
  if (existing) {
    return existing.id;
  }

  const result = db
    .prepare('INSERT INTO users (name, created_at) VALUES (?, ?)')
    .run(name, new Date().toISOString());
  return result.lastInsertRowid as number;
}

// Get user ID by name (returns null if not found)
export function getUserId(db: Database.Database, name: string): number | null {
  const row = db.prepare('SELECT id FROM users WHERE name = ?').get(name) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

// List all users
export function listUsers(
  db: Database.Database,
): Array<{ id: number; name: string; createdAt: string }> {
  return db
    .prepare('SELECT id, name, created_at as createdAt FROM users ORDER BY id')
    .all() as Array<{ id: number; name: string; createdAt: string }>;
}

// Migrate existing single-user data to multi-user schema
function migrateToMultiUser(db: Database.Database): void {
  // Check if users table exists
  const usersTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    .get();

  if (usersTableExists) {
    return; // Already migrated
  }

  // Check if we have old-style tables to migrate
  const practiceLogExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='practice_log'")
    .get();

  if (!practiceLogExists) {
    return; // Fresh database, no migration needed
  }

  // Check if practice_log has user_id column (new schema)
  const practiceInfo = db.prepare('PRAGMA table_info(practice_log)').all() as Array<{
    name: string;
  }>;
  const hasUserId = practiceInfo.some((c) => c.name === 'user_id');

  if (hasUserId) {
    return; // Already has new schema
  }

  // Perform migration
  console.log('Migrating database to multi-user schema...');

  // Create users table and default user
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );
  `);

  db.prepare("INSERT INTO users (name, created_at) VALUES ('default', ?)").run(
    new Date().toISOString(),
  );

  // Migrate practice_log
  db.exec(`
    ALTER TABLE practice_log ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1;
  `);

  // Migrate signature_stats - need to recreate with new schema
  const oldStatsExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='signature_stats'")
    .get();

  if (oldStatsExists) {
    const statsInfo = db.prepare('PRAGMA table_info(signature_stats)').all() as Array<{
      name: string;
    }>;
    const statsHasUserId = statsInfo.some((c) => c.name === 'user_id');

    if (!statsHasUserId) {
      // Backup old data
      const oldStats = db.prepare('SELECT * FROM signature_stats').all();

      // Drop and recreate with new schema
      db.exec(`DROP TABLE signature_stats`);
      db.exec(`
        CREATE TABLE signature_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL DEFAULT 1,
          signature_id TEXT NOT NULL,
          dimension TEXT NOT NULL,
          best_npm INTEGER DEFAULT 0,
          ema_npm REAL DEFAULT 0,
          attempts INTEGER DEFAULT 0,
          last_seen TEXT,
          has_expanded INTEGER DEFAULT 0,
          mastery_streak INTEGER DEFAULT 0,
          is_mastered INTEGER DEFAULT 0,
          UNIQUE(user_id, signature_id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);

      // Restore data with user_id = 1
      for (const stat of oldStats as Array<Record<string, unknown>>) {
        db.prepare(
          `
          INSERT INTO signature_stats (user_id, signature_id, dimension, best_npm, ema_npm, attempts, last_seen, has_expanded, mastery_streak, is_mastered)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          stat.signature_id,
          stat.dimension,
          stat.best_npm ?? 0,
          stat.ema_npm ?? 0,
          stat.attempts ?? 0,
          stat.last_seen ?? null,
          stat.has_expanded ?? 0,
          stat.mastery_streak ?? 0,
          stat.is_mastered ?? 0,
        );
      }
    }
  }

  // Migrate compound_stats
  const oldCompoundExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compound_stats'")
    .get();

  if (oldCompoundExists) {
    const compoundInfo = db.prepare('PRAGMA table_info(compound_stats)').all() as Array<{
      name: string;
    }>;
    const compoundHasUserId = compoundInfo.some((c) => c.name === 'user_id');

    if (!compoundHasUserId) {
      // Backup old data
      const oldCompounds = db.prepare('SELECT * FROM compound_stats').all();

      // Drop and recreate with new schema
      db.exec(`DROP TABLE compound_stats`);
      db.exec(`
        CREATE TABLE compound_stats (
          compound_id TEXT NOT NULL,
          user_id INTEGER NOT NULL DEFAULT 1,
          scale TEXT NOT NULL,
          position TEXT NOT NULL,
          rhythm TEXT NOT NULL,
          rhythm_pattern TEXT NOT NULL,
          note_pattern TEXT,
          articulation TEXT,
          best_npm INTEGER DEFAULT 0,
          ema_npm REAL DEFAULT 0,
          attempts INTEGER DEFAULT 0,
          has_expanded INTEGER DEFAULT 0,
          mastery_streak INTEGER DEFAULT 0,
          is_mastered INTEGER DEFAULT 0,
          last_practiced TEXT,
          last_practiced_session INTEGER,
          PRIMARY KEY (user_id, compound_id),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);

      // Restore data with user_id = 1
      for (const comp of oldCompounds as Array<Record<string, unknown>>) {
        db.prepare(
          `
          INSERT INTO compound_stats (user_id, compound_id, scale, position, rhythm, rhythm_pattern, note_pattern, articulation, best_npm, ema_npm, attempts, has_expanded, mastery_streak, is_mastered, last_practiced, last_practiced_session)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        ).run(
          comp.id,
          comp.scale,
          comp.position,
          comp.rhythm,
          comp.rhythm_pattern,
          comp.note_pattern ?? null,
          comp.articulation ?? null,
          comp.best_npm ?? 0,
          comp.ema_npm ?? 0,
          comp.attempts ?? 0,
          comp.has_expanded ?? 0,
          comp.mastery_streak ?? 0,
          comp.is_mastered ?? 0,
          comp.last_practiced ?? null,
          comp.last_practiced_session ?? null,
        );
      }
    }
  }

  // Migrate dimension_unlocks
  const oldUnlocksExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dimension_unlocks'")
    .get();

  if (oldUnlocksExists) {
    const unlocksInfo = db.prepare('PRAGMA table_info(dimension_unlocks)').all() as Array<{
      name: string;
    }>;
    const unlocksHasUserId = unlocksInfo.some((c) => c.name === 'user_id');

    if (!unlocksHasUserId) {
      const oldUnlocks = db.prepare('SELECT * FROM dimension_unlocks').all();
      db.exec(`DROP TABLE dimension_unlocks`);
      db.exec(`
        CREATE TABLE dimension_unlocks (
          user_id INTEGER NOT NULL DEFAULT 1,
          dimension TEXT NOT NULL,
          unlocked_at TEXT NOT NULL,
          unlocked_at_session INTEGER NOT NULL,
          PRIMARY KEY (user_id, dimension),
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);

      for (const unlock of oldUnlocks as Array<Record<string, unknown>>) {
        db.prepare(
          `
          INSERT INTO dimension_unlocks (user_id, dimension, unlocked_at, unlocked_at_session)
          VALUES (1, ?, ?, ?)
        `,
        ).run(unlock.dimension, unlock.unlocked_at, unlock.unlocked_at_session);
      }
    }
  }

  // Migrate session_counter
  const oldSessionExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_counter'")
    .get();

  if (oldSessionExists) {
    const sessionInfo = db.prepare('PRAGMA table_info(session_counter)').all() as Array<{
      name: string;
    }>;
    const sessionHasUserId = sessionInfo.some((c) => c.name === 'user_id');

    if (!sessionHasUserId) {
      const oldSession = db
        .prepare('SELECT current_session FROM session_counter WHERE user_id = 1')
        .get() as { current_session: number } | undefined;
      db.exec(`DROP TABLE session_counter`);
      db.exec(`
        CREATE TABLE session_counter (
          user_id INTEGER PRIMARY KEY,
          current_session INTEGER DEFAULT 0,
          FOREIGN KEY (user_id) REFERENCES users(id)
        );
      `);

      if (oldSession) {
        db.prepare('INSERT INTO session_counter (user_id, current_session) VALUES (1, ?)').run(
          oldSession.current_session,
        );
      }
    }
  }

  console.log('Migration complete. Existing data assigned to user "default".');
}

// Migrations for schema updates
function runMigrations(db: Database.Database): void {
  // Migration 0: Create users table and migrate to multi-user schema
  migrateToMultiUser(db);

  // Migration 1: Add progression columns to signature_stats
  const statsInfo = db.prepare('PRAGMA table_info(signature_stats)').all() as Array<{
    name: string;
  }>;
  const statsColumns = statsInfo.map((c) => c.name);

  if (statsColumns.length > 0 && !statsColumns.includes('has_expanded')) {
    db.exec(`
      ALTER TABLE signature_stats ADD COLUMN has_expanded INTEGER DEFAULT 0;
      ALTER TABLE signature_stats ADD COLUMN mastery_streak INTEGER DEFAULT 0;
      ALTER TABLE signature_stats ADD COLUMN is_mastered INTEGER DEFAULT 0;
    `);
  }

  // Migration for compound system: Add new columns to practice_log
  const practiceInfo = db.prepare('PRAGMA table_info(practice_log)').all() as Array<{
    name: string;
  }>;
  const practiceColumns = practiceInfo.map((c) => c.name);

  if (!practiceColumns.includes('compound_id')) {
    db.exec(`ALTER TABLE practice_log ADD COLUMN compound_id TEXT`);
  }
  if (!practiceColumns.includes('session_number')) {
    db.exec(`ALTER TABLE practice_log ADD COLUMN session_number INTEGER`);
  }
  if (!practiceColumns.includes('articulation')) {
    db.exec(`ALTER TABLE practice_log ADD COLUMN articulation TEXT`);
  }

  // Initialize session counter if needed
  const sessionCounterExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_counter'")
    .get();
  if (sessionCounterExists) {
    const sessionRow = db
      .prepare('SELECT current_session FROM session_counter WHERE user_id = 1')
      .get();
    if (!sessionRow) {
      // Initialize session counter based on practice log count
      const countRow = db.prepare('SELECT COUNT(*) as count FROM practice_log').get() as
        | { count: number }
        | undefined;
      const practiceCount = countRow?.count ?? 0;
      db.prepare('INSERT OR REPLACE INTO session_counter (user_id, current_session) VALUES (1, ?)').run(
        practiceCount,
      );
    }
  }

  // Migration 1b: Add tonality column to practice_log
  const practiceLogInfo = db.prepare('PRAGMA table_info(practice_log)').all() as Array<{
    name: string;
  }>;
  const practiceLogColumns = practiceLogInfo.map((c) => c.name);

  if (!practiceLogColumns.includes('tonality')) {
    db.exec(`ALTER TABLE practice_log ADD COLUMN tonality TEXT NOT NULL DEFAULT 'major'`);
  }

  // Migration 1c: Add struggling_streak column to compound_stats
  const compoundStatsExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='compound_stats'")
    .get();

  if (compoundStatsExists) {
    const compoundInfo = db.prepare('PRAGMA table_info(compound_stats)').all() as Array<{
      name: string;
    }>;
    const compoundColumns = compoundInfo.map((c) => c.name);

    if (!compoundColumns.includes('struggling_streak')) {
      db.exec(`ALTER TABLE compound_stats ADD COLUMN struggling_streak INTEGER DEFAULT 0`);
    }

    // Migration 1d: Add last_npm column to compound_stats
    if (!compoundColumns.includes('last_npm')) {
      db.exec(`ALTER TABLE compound_stats ADD COLUMN last_npm INTEGER DEFAULT 0`);
    }

    // Migration 1e: Add last_bpm column to compound_stats
    if (!compoundColumns.includes('last_bpm')) {
      db.exec(`ALTER TABLE compound_stats ADD COLUMN last_bpm INTEGER DEFAULT 0`);
    }
  }

  // Migration 2: Split fretboard into scale and position
  // Check if we need to migrate from old fretboard columns to new scale/position columns
  const tableInfo = db.prepare('PRAGMA table_info(practice_log)').all() as Array<{ name: string }>;
  const columns = tableInfo.map((c) => c.name);

  // Migration 3: Add streaks and achievements tables
  const streaksTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='streaks'")
    .get();
  if (!streaksTableExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS streaks (
        user_id INTEGER NOT NULL,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_practice_date TEXT,
        streak_freezes INTEGER DEFAULT 0,
        PRIMARY KEY (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
  }

  const achievementsTableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='achievements'")
    .get();
  if (!achievementsTableExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS achievements (
        user_id INTEGER NOT NULL,
        achievement_id TEXT NOT NULL,
        earned_at TEXT NOT NULL,
        PRIMARY KEY (user_id, achievement_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
  }

  // Migration: Merge tonality into scale IDs
  // pentatonic + minor → pentatonic_minor, blues + major → blues_major, etc.
  const hasPentatonicOld = db
    .prepare("SELECT COUNT(*) as count FROM practice_log WHERE scale = 'pentatonic'")
    .get() as { count: number };
  const hasBluesOld = db
    .prepare("SELECT COUNT(*) as count FROM practice_log WHERE scale = 'blues'")
    .get() as { count: number };
  if (hasPentatonicOld.count > 0 || hasBluesOld.count > 0) {
    db.exec(`
      UPDATE practice_log SET scale = 'pentatonic_minor' WHERE scale = 'pentatonic' AND tonality = 'minor';
      UPDATE practice_log SET scale = 'pentatonic_major' WHERE scale = 'pentatonic' AND tonality = 'major';
      UPDATE practice_log SET scale = 'pentatonic_minor' WHERE scale = 'pentatonic' AND (tonality IS NULL OR tonality NOT IN ('major', 'minor'));
      UPDATE practice_log SET scale = 'blues_minor' WHERE scale = 'blues' AND tonality = 'minor';
      UPDATE practice_log SET scale = 'blues_major' WHERE scale = 'blues' AND tonality = 'major';
      UPDATE practice_log SET scale = 'blues_minor' WHERE scale = 'blues' AND (tonality IS NULL OR tonality NOT IN ('major', 'minor'));
    `);

    // Also update 'pentatonic minor' (space-separated old format) if present
    db.exec(`
      UPDATE practice_log SET scale = 'pentatonic_minor' WHERE scale = 'pentatonic minor';
      UPDATE practice_log SET scale = 'pentatonic_major' WHERE scale = 'pentatonic major';
    `);

    // Recalculate stats will be done by the caller if needed
    // Delete compound_stats and signature_stats so they get rebuilt
    db.exec(`DELETE FROM compound_stats`);
    db.exec(`DELETE FROM signature_stats`);
    db.exec(`DELETE FROM session_counter`);
  }

  // Also handle 'pentatonic minor' format in scale column (from old YAML with spaces)
  const hasPentatonicSpace = db
    .prepare("SELECT COUNT(*) as count FROM practice_log WHERE scale = 'pentatonic minor'")
    .get() as { count: number };
  if (hasPentatonicSpace.count > 0) {
    db.exec(`
      UPDATE practice_log SET scale = 'pentatonic_minor' WHERE scale = 'pentatonic minor';
      UPDATE practice_log SET scale = 'pentatonic_major' WHERE scale = 'pentatonic major';
      DELETE FROM compound_stats;
      DELETE FROM signature_stats;
      DELETE FROM session_counter;
    `);
  }

  if (columns.includes('fretboard_scale') && !columns.includes('scale')) {
    // Need to migrate the practice_log table
    db.exec(`
      -- Create new table with updated schema
      CREATE TABLE IF NOT EXISTS practice_log_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        logged_at TEXT NOT NULL,
        rhythm_rhythm TEXT NOT NULL,
        rhythm_pattern TEXT NOT NULL,
        scale TEXT NOT NULL,
        position TEXT NOT NULL,
        note_pattern TEXT NOT NULL DEFAULT 'stepwise',
        key TEXT NOT NULL,
        bpm INTEGER NOT NULL,
        npm INTEGER NOT NULL,
        reasoning TEXT
      );

      -- Copy data from old table to new table
      INSERT INTO practice_log_new (id, logged_at, rhythm_rhythm, rhythm_pattern, scale, position, note_pattern, key, bpm, npm, reasoning)
      SELECT id, logged_at, rhythm_rhythm, rhythm_pattern, fretboard_scale, fretboard_position, note_pattern, key, bpm, npm, reasoning
      FROM practice_log;

      -- Drop old table and rename new one
      DROP TABLE practice_log;
      ALTER TABLE practice_log_new RENAME TO practice_log;

      -- Recreate index
      CREATE INDEX IF NOT EXISTS idx_log_logged_at ON practice_log(logged_at);
    `);

    // Migrate signature_stats: split fretboard stats into scale and position stats
    const fretboardStats = db
      .prepare("SELECT * FROM signature_stats WHERE dimension = 'fretboard'")
      .all() as Array<{
      signature_id: string;
      dimension: string;
      best_npm: number;
      ema_npm: number;
      attempts: number;
      last_seen: string | null;
    }>;

    for (const stat of fretboardStats) {
      // Parse "fretboard:pentatonic:G" into scale and position
      const parts = stat.signature_id.split(':');
      if (parts.length === 3) {
        const scale = parts[1];
        const position = parts[2];

        // Insert or update scale stat
        const scaleId = `scale:${scale}`;
        const existingScale = db
          .prepare('SELECT * FROM signature_stats WHERE signature_id = ?')
          .get(scaleId);
        if (existingScale) {
          db.prepare(
            `
            UPDATE signature_stats
            SET best_npm = MAX(best_npm, ?), ema_npm = ?, attempts = attempts + ?, last_seen = ?
            WHERE signature_id = ?
          `,
          ).run(stat.best_npm, stat.ema_npm, stat.attempts, stat.last_seen, scaleId);
        } else {
          db.prepare(
            `
            INSERT INTO signature_stats (signature_id, dimension, best_npm, ema_npm, attempts, last_seen)
            VALUES (?, 'scale', ?, ?, ?, ?)
          `,
          ).run(scaleId, stat.best_npm, stat.ema_npm, stat.attempts, stat.last_seen);
        }

        // Insert or update position stat
        const positionId = `position:${position}`;
        const existingPosition = db
          .prepare('SELECT * FROM signature_stats WHERE signature_id = ?')
          .get(positionId);
        if (existingPosition) {
          db.prepare(
            `
            UPDATE signature_stats
            SET best_npm = MAX(best_npm, ?), ema_npm = ?, attempts = attempts + ?, last_seen = ?
            WHERE signature_id = ?
          `,
          ).run(stat.best_npm, stat.ema_npm, stat.attempts, stat.last_seen, positionId);
        } else {
          db.prepare(
            `
            INSERT INTO signature_stats (signature_id, dimension, best_npm, ema_npm, attempts, last_seen)
            VALUES (?, 'position', ?, ?, ?, ?)
          `,
          ).run(positionId, stat.best_npm, stat.ema_npm, stat.attempts, stat.last_seen);
        }
      }

      // Delete old fretboard stat
      db.prepare('DELETE FROM signature_stats WHERE signature_id = ?').run(stat.signature_id);
    }
  }
}

export function createInMemoryDatabase(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);
  // Create default user for tests
  db.prepare("INSERT INTO users (name, created_at) VALUES ('default', ?)").run(
    new Date().toISOString(),
  );
  return db;
}
