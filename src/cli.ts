#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'js-yaml';
import { createDatabase, getOrCreateUser, listUsers } from './db/schema.js';
import { Repository } from './db/repository.js';
import { Engine } from './core/engine.js';
import { DimensionRegistry } from './dimensions/registry.js';
import { Settings, DEFAULT_SETTINGS } from './types.js';
import { exerciseCommand } from './commands/exercise.js';
import { inputCommand } from './commands/input.js';
import { statsCommand } from './commands/stats.js';
import { historyCommand, interactiveHistoryCommand } from './commands/history.js';
import { proficientCommand } from './commands/proficient.js';
import { strugglingCommand } from './commands/struggling.js';

// Session file for storing current user
function getSessionFilePath(): string {
  const dataDir = path.join(os.homedir(), '.guitar-teacher');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, 'session.json');
}

function getSessionUser(): string | null {
  const sessionFile = getSessionFilePath();
  if (!fs.existsSync(sessionFile)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    return data.user ?? null;
  } catch {
    return null;
  }
}

function setSessionUser(user: string): void {
  const sessionFile = getSessionFilePath();
  fs.writeFileSync(sessionFile, JSON.stringify({ user }, null, 2));
}

function clearSessionUser(): void {
  const sessionFile = getSessionFilePath();
  if (fs.existsSync(sessionFile)) {
    fs.unlinkSync(sessionFile);
  }
}

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

// Load settings from config file or use defaults
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
      dimensionTiers: DEFAULT_SETTINGS.dimensionTiers, // Use defaults for now
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

function createEngine(userName: string = 'default') {
  const db = createDatabase();
  const userId = getOrCreateUser(db, userName);
  const repo = new Repository(db, userId);
  const settings = loadSettings();
  const registry = DimensionRegistry.createDefault();
  return {
    engine: new Engine(repo, registry, settings),
    repo,
    settings,
    db,
    dimensions: {
      rhythmDim: registry.rhythmDim,
      scaleDim: registry.scaleDim,
      positionDim: registry.positionDim,
      notePatternDim: registry.notePatternDim,
    },
  };
}

// Create the CLI program
const program = new Command();

program
  .name('chops')
  .description('Guitar practice CLI - adaptive exercise generation')
  .version('1.0.0')
  .option('-u, --user <name>', 'User profile to use', 'default');

// Helper to get user: CLI flag > session file > default
function getUser(cmd: Command): string {
  const opts = cmd.optsWithGlobals();
  // If explicitly set via CLI flag, use that
  if (opts.user && opts.user !== 'default') {
    return opts.user;
  }
  // Check session file
  const sessionUser = getSessionUser();
  if (sessionUser) {
    return sessionUser;
  }
  // Fall back to default
  return 'default';
}

// Suggest command (alias: exercise)
program
  .command('suggest')
  .alias('exercise')
  .description('Generate a practice suggestion')
  .action(function (this: Command) {
    const user = getUser(this);
    const { engine, repo, settings } = createEngine(user);
    exerciseCommand(engine, repo, settings);
  });

program
  .command('input')
  .description('Log a practice session')
  .option('-m, --bpm <number>', 'BPM achieved', parseFloat)
  .option('-c, --custom', 'Interactive mode to specify exercise details')
  .action(async function (this: Command, options) {
    const user = getUser(this);
    const { engine, repo, settings } = createEngine(user);
    await inputCommand(engine, repo, settings, options.bpm, options.custom ?? false);
  });

program
  .command('stats')
  .description('Show progress statistics per signature')
  .action(function (this: Command) {
    const user = getUser(this);
    const { repo, settings } = createEngine(user);
    statsCommand(repo, settings);
  });

program
  .command('history')
  .description('Show recent practice history')
  .option('-n, --limit <number>', 'Number of entries to show', '20')
  .option('-i, --interactive', 'Interactive mode to edit/delete entries')
  .action(async function (this: Command, options) {
    const user = getUser(this);
    const { engine, repo, settings } = createEngine(user);
    if (options.interactive) {
      const editOptions = {
        rhythms: engine.getAvailableRhythms(),
        scales: engine.getAvailableScales(),
        positions: engine.getAvailablePositions(),
        patterns: engine.getAvailableNotePatterns(),
        keys: engine.getAvailableKeys(),
        getPatternForRhythm: (rhythm: string) => engine.getPatternForRhythm(rhythm),
      };
      await interactiveHistoryCommand(repo, settings, editOptions, parseInt(options.limit, 10));
    } else {
      historyCommand(repo, parseInt(options.limit, 10));
    }
  });

// Users command - list all users
program
  .command('users')
  .description('List all user profiles')
  .action(() => {
    const db = createDatabase();
    const users = listUsers(db);
    const currentSession = getSessionUser();

    console.log(chalk.yellow.bold('\n  USER PROFILES\n'));

    if (users.length === 0) {
      console.log(chalk.gray('  No users yet.'));
    } else {
      for (const user of users) {
        const created = new Date(user.createdAt).toLocaleDateString();
        const isCurrent = user.name === currentSession;
        const marker = isCurrent ? chalk.green(' ← logged in') : '';
        console.log(`  ${chalk.cyan(user.name)} ${chalk.gray(`(created ${created})`)}${marker}`);
      }
    }

    console.log();
    console.log(chalk.gray('  Use "chops login <name>" to switch profiles'));
    console.log();
  });

// Login command - set session user
program
  .command('login <username>')
  .description('Log in as a user (persists for session)')
  .action((username: string) => {
    const db = createDatabase();
    getOrCreateUser(db, username); // Ensure user exists
    setSessionUser(username);
    console.log(chalk.green(`\n  Logged in as ${chalk.cyan(username)}\n`));
  });

// Logout command - clear session user
program
  .command('logout')
  .description('Log out (return to default user)')
  .action(() => {
    const currentUser = getSessionUser();
    if (currentUser) {
      clearSessionUser();
      console.log(chalk.yellow(`\n  Logged out from ${chalk.cyan(currentUser)}\n`));
    } else {
      console.log(chalk.gray('\n  Not logged in (using default)\n'));
    }
  });

// Whoami command - show current user
program
  .command('whoami')
  .description('Show current logged-in user')
  .action(() => {
    const sessionUser = getSessionUser();
    if (sessionUser) {
      console.log(chalk.green(`\n  Logged in as ${chalk.cyan(sessionUser)}\n`));
    } else {
      console.log(chalk.gray('\n  Not logged in (using default)\n'));
    }
  });

// Recalculate stats command
program
  .command('recalc')
  .description('Recalculate all stats from practice history')
  .action(function (this: Command) {
    const user = getUser(this);
    const { repo, settings } = createEngine(user);
    console.log(chalk.yellow(`\n  Recalculating stats for ${chalk.cyan(user)}...`));
    repo.recalculateAllStats(
      settings.emaAlpha,
      settings.progression.expansionNpm,
      settings.progression.masteryNpm,
      settings.progression.masteryStreak,
    );
    console.log(chalk.green('  Done!\n'));
  });

// Proficiency command - declare competence in dimensions
program
  .command('proficient')
  .description('Declare proficiency in dimensions (skip prerequisites)')
  .action(async function (this: Command) {
    const user = getUser(this);
    const { engine, repo, dimensions } = createEngine(user);
    await proficientCommand(repo, engine, {
      dimensions: [
        {
          name: 'rhythm',
          displayName: 'Rhythm',
          getValues: () => dimensions.rhythmDim.getAvailableRhythms(),
          getPrerequisites: (value: string) => dimensions.rhythmDim.getPrerequisites(value),
        },
        {
          name: 'scale',
          displayName: 'Scale',
          getValues: () => dimensions.scaleDim.getAvailableScales(),
          getPrerequisites: (value: string) => dimensions.scaleDim.getPrerequisites(value),
        },
        {
          name: 'position',
          displayName: 'Position',
          getValues: () => dimensions.positionDim.getAvailablePositions(),
          getPrerequisites: (value: string) => dimensions.positionDim.getPrerequisites(value),
        },
        {
          name: 'note-pattern',
          displayName: 'Note Pattern',
          getValues: () => dimensions.notePatternDim.getAvailablePatterns(),
          getPrerequisites: (value: string) => dimensions.notePatternDim.getPrerequisites(value),
        },
      ],
    });
  });

// Struggling command - view and manage struggling areas
program
  .command('struggling')
  .description('View struggling compounds and manage difficulty levels')
  .action(async function (this: Command) {
    const user = getUser(this);
    const { engine, repo, settings, dimensions } = createEngine(user);
    await strugglingCommand(repo, engine, settings, {
      dimensions: [
        {
          name: 'rhythm',
          displayName: 'Rhythm',
          getValues: () => dimensions.rhythmDim.getAvailableRhythms(),
        },
        {
          name: 'scale',
          displayName: 'Scale',
          getValues: () => dimensions.scaleDim.getAvailableScales(),
        },
        {
          name: 'position',
          displayName: 'Position',
          getValues: () => dimensions.positionDim.getAvailablePositions(),
        },
        {
          name: 'note-pattern',
          displayName: 'Note Pattern',
          getValues: () => dimensions.notePatternDim.getAvailablePatterns(),
        },
      ],
    });
  });

// Serve command - start the web server
program
  .command('serve')
  .description('Start the web UI server')
  .option('-p, --port <number>', 'Port to listen on', '3847')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    process.env.CHOPS_PORT = String(port);

    console.log(chalk.cyan(`\n  Starting Guitar Teacher web server...`));

    // Dynamically import the server module
    const { serve } = await import('@hono/node-server');
    const { createApp } = await import('./api/index.js');

    const app = createApp();

    serve(
      {
        fetch: app.fetch,
        port,
      },
      (info) => {
        console.log(
          chalk.green(`\n  Server running at ${chalk.cyan(`http://localhost:${info.port}`)}`),
        );
        console.log(chalk.gray(`  API available at http://localhost:${info.port}/api`));
        console.log(chalk.gray(`\n  Press Ctrl+C to stop\n`));
      },
    );
  });

// Open command - start server and open browser
program
  .command('open')
  .description('Start the web UI and open in browser')
  .option('-p, --port <number>', 'Port to listen on', '3847')
  .action(async (options) => {
    const port = parseInt(options.port, 10);
    process.env.CHOPS_PORT = String(port);

    console.log(chalk.cyan(`\n  Starting Guitar Teacher web server...`));

    // Dynamically import modules
    const { serve } = await import('@hono/node-server');
    const { createApp } = await import('./api/index.js');
    const open = await import('open');

    const app = createApp();
    const url = `http://localhost:${port}`;

    serve(
      {
        fetch: app.fetch,
        port,
      },
      async (_info) => {
        console.log(chalk.green(`\n  Server running at ${chalk.cyan(url)}`));
        console.log(chalk.gray(`  Opening browser...`));

        // Open browser
        await open.default(url);

        console.log(chalk.gray(`\n  Press Ctrl+C to stop\n`));
      },
    );
  });

program.parse();
