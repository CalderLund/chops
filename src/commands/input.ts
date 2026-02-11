import chalk from 'chalk';
import { Engine } from '../core/engine.js';
import { Repository } from '../db/repository.js';
import {
  RhythmSig,
  ScaleSig,
  PositionSig,
  NotePatternSig,
  Settings,
  CompoundStats,
} from '../types.js';
import { compoundId } from '../db/compound.js';

// Display struggling warning if user is having difficulty
function showStrugglingWarning(
  engine: Engine,
  settings: Settings,
  compoundStats: CompoundStats | null,
): void {
  if (!compoundStats) return;

  // Check if this compound is struggling
  const streakThreshold = settings.struggling.streakThreshold;
  if (compoundStats.strugglingStreak >= streakThreshold) {
    console.log();
    console.log(chalk.red('═'.repeat(45)));
    console.log(chalk.red.bold('  ⚠️  STRUGGLING DETECTED'));
    if (compoundStats.strugglingStreak === 1) {
      console.log(chalk.red(`  Performance below ${settings.npmTiers.struggling} NPM`));
    } else {
      console.log(
        chalk.red(
          `  ${compoundStats.strugglingStreak} attempts below ${settings.npmTiers.struggling} NPM`,
        ),
      );
    }
    console.log(chalk.yellow('  Consider:'));
    console.log(chalk.yellow('  • Moving to a simpler variation'));
    console.log(chalk.yellow('  • Using "chops proficient" to adjust skill levels'));
    console.log(chalk.red('═'.repeat(45)));
  }
}

// Get NPM tier label for display
function getNpmTierLabel(npm: number, settings: Settings): string {
  const tiers = settings.npmTiers;
  if (npm < tiers.struggling) return chalk.red('struggling');
  if (npm < tiers.developing) return chalk.yellow('developing');
  if (npm < tiers.progressing) return chalk.blue('progressing');
  if (npm < tiers.fast) return chalk.cyan('fast');
  if (npm < tiers.veryFast) return chalk.green('very fast');
  if (npm < tiers.superFast) return chalk.magenta('super fast');
  return chalk.magenta.bold('shredding');
}

export async function inputCommand(
  engine: Engine,
  repo: Repository,
  settings: Settings,
  bpm: number | undefined,
  custom: boolean,
): Promise<void> {
  if (custom) {
    await interactiveInput(engine, repo, settings, bpm);
  } else {
    if (!bpm || bpm <= 0) {
      console.error(chalk.red('Error: BPM must be a positive number. Use -m <bpm>'));
      console.error(chalk.gray('Or use --custom for interactive mode.'));
      process.exit(1);
    }
    logLastSuggestion(engine, repo, settings, bpm);
  }
}

function logLastSuggestion(
  engine: Engine,
  repo: Repository,
  settings: Settings,
  bpm: number,
): void {
  try {
    const suggestion = engine.getLastSuggestion();
    if (!suggestion) {
      console.error(
        chalk.red('Error: No suggestion to log. Run "chops" first to get a suggestion.'),
      );
      process.exit(1);
    }

    // Track unlocks before logging
    const unlocksBefore = repo.getUnlockedDimensions();

    // Log using compound system
    const entry = engine.logCompoundPractice(
      suggestion.rhythm,
      suggestion.scale,
      suggestion.position,
      suggestion.notePattern,
      suggestion.key,
      bpm,
      suggestion.reasoning,
    );

    // Check for compound expansion (compounds always include all dimensions)
    const compound = {
      scale: entry.scale.scale,
      position: entry.position.position,
      rhythm: entry.rhythm.rhythm,
      rhythmPattern: entry.rhythm.pattern,
      notePattern: entry.notePattern.pattern,
    };
    const compId = compoundId(compound);
    const compoundStats = repo.getCompoundStats(compId);

    const tierLabel = getNpmTierLabel(entry.npm, settings);
    console.log(chalk.green(`✓ Logged ${bpm} BPM (${entry.npm} NPM) - ${tierLabel}`));
    console.log();
    console.log(chalk.gray(`  Rhythm:   ${entry.rhythm.rhythm} (${entry.rhythm.pattern})`));
    console.log(chalk.gray(`  Scale:    ${entry.scale.scale}`));
    console.log(chalk.gray(`  Position: ${entry.position.position}-shape`));
    console.log(chalk.gray(`  Pattern:  ${entry.notePattern.pattern}`));
    console.log(chalk.gray(`  Key:      ${entry.key}`));

    // Show compound status
    if (compoundStats) {
      console.log();
      if (compoundStats.isMastered) {
        console.log(chalk.green(`  🏆 Compound MASTERED!`));
      } else if (compoundStats.hasExpanded) {
        if (compoundStats.masteryStreak > 0) {
          console.log(
            chalk.magenta(
              `  Mastery streak: ${compoundStats.masteryStreak}/${settings.progression.masteryStreak}`,
            ),
          );
        } else {
          console.log(chalk.cyan(`  Compound expanded - neighbors unlocked`));
        }
      } else {
        const progress = Math.min(entry.npm / settings.progression.expansionNpm, 1);
        console.log(
          chalk.yellow(
            `  Expansion progress: ${Math.round(progress * 100)}% (need ${settings.progression.expansionNpm} NPM)`,
          ),
        );
      }
    }

    // Check for struggling
    showStrugglingWarning(engine, settings, compoundStats);

    // Check for new dimension unlocks
    const unlocksAfter = repo.getUnlockedDimensions();
    const newUnlocks = unlocksAfter.filter((d) => !unlocksBefore.includes(d));

    if (newUnlocks.length > 0) {
      console.log();
      console.log(chalk.green('═'.repeat(45)));
      console.log(chalk.green.bold('  🎉 NEW DIMENSION UNLOCKED! 🎉'));
      for (const dim of newUnlocks) {
        const displayName = dim.replace('-', ' ').toUpperCase();
        console.log(chalk.green(`  ${displayName}`));
      }
      console.log(chalk.green('═'.repeat(45)));
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}

async function interactiveInput(
  engine: Engine,
  repo: Repository,
  settings: Settings,
  bpmArg: number | undefined,
): Promise<void> {
  const { default: Enquirer } = await import('enquirer');
  const enquirer = new Enquirer();

  try {
    const lastSuggestion = engine.getLastSuggestion();
    engine.generateCompoundSuggestion();

    console.log(chalk.yellow('\n  CUSTOM PRACTICE ENTRY\n'));

    // BPM
    let bpm = bpmArg;
    if (!bpm) {
      const bpmResponse = (await enquirer.prompt({
        type: 'input',
        name: 'bpm',
        message: 'BPM',
        validate: (value: string) => {
          const num = parseFloat(value);
          if (!num || num <= 0 || isNaN(num)) {
            return 'Please enter a valid positive number';
          }
          return true;
        },
      })) as { bpm: string };
      bpm = parseFloat(bpmResponse.bpm);
    } else {
      console.log(chalk.gray(`  BPM: ${bpm}`));
    }

    // Rhythm
    const rhythms = engine.getAvailableRhythms();
    const defaultRhythm = lastSuggestion?.rhythm.rhythm ?? rhythms[0];
    const rhythmResponse = (await enquirer.prompt({
      type: 'select',
      name: 'rhythm',
      message: 'Rhythm',
      choices: rhythms,
      initial: rhythms.indexOf(defaultRhythm),
    })) as { rhythm: string };

    const pattern = engine.getPatternForRhythm(rhythmResponse.rhythm);

    // Scale
    const scales = engine.getAvailableScales();
    const defaultScale = lastSuggestion?.scale.scale ?? scales[0];
    const scaleResponse = (await enquirer.prompt({
      type: 'select',
      name: 'scale',
      message: 'Scale',
      choices: scales,
      initial: scales.indexOf(defaultScale),
    })) as { scale: string };

    // Position (show as X-shape)
    const positions = engine.getAvailablePositions();
    const defaultPosition = lastSuggestion?.position.position ?? positions[0];
    const positionResponse = (await enquirer.prompt({
      type: 'select',
      name: 'position',
      message: 'Position',
      choices: positions.map((p) => ({ name: p, message: `${p}-shape` })),
      initial: positions.indexOf(defaultPosition),
    })) as { position: string };

    // Note Pattern - always allow selection (lock only affects recommendations)
    const notePatterns = engine.getAvailableNotePatterns();
    const defaultNotePattern = lastSuggestion?.notePattern.pattern ?? notePatterns[0];
    const notePatternResponse = (await enquirer.prompt({
      type: 'select',
      name: 'notePattern',
      message: 'Note Pattern',
      choices: notePatterns,
      initial: notePatterns.indexOf(defaultNotePattern),
    })) as { notePattern: string };
    const selectedNotePattern = notePatternResponse.notePattern;

    // Key
    const keys = engine.getAvailableKeys();
    const defaultKey = lastSuggestion?.key ?? keys[0];
    const keyResponse = (await enquirer.prompt({
      type: 'select',
      name: 'key',
      message: 'Key',
      choices: keys,
      initial: keys.indexOf(defaultKey),
    })) as { key: string };

    // Log the practice using compound system
    const rhythm: RhythmSig = { dimension: 'rhythm', rhythm: rhythmResponse.rhythm, pattern };
    const scale: ScaleSig = { dimension: 'scale', scale: scaleResponse.scale };
    const position: PositionSig = { dimension: 'position', position: positionResponse.position };
    const notePattern: NotePatternSig = { dimension: 'note-pattern', pattern: selectedNotePattern };

    // Track unlocks before logging
    const unlocksBefore = repo.getUnlockedDimensions();

    const entry = engine.logCompoundPractice(
      rhythm,
      scale,
      position,
      notePattern,
      keyResponse.key,
      bpm,
      'Custom practice',
    );

    // Check compound stats (compounds always include all dimensions)
    const compound = {
      scale: entry.scale.scale,
      position: entry.position.position,
      rhythm: entry.rhythm.rhythm,
      rhythmPattern: entry.rhythm.pattern,
      notePattern: entry.notePattern.pattern,
    };
    const compId = compoundId(compound);
    const compoundStats = repo.getCompoundStats(compId);

    const tierLabel = getNpmTierLabel(entry.npm, settings);
    console.log();
    console.log(chalk.green(`✓ Logged ${bpm} BPM (${entry.npm} NPM) - ${tierLabel}`));
    console.log();
    console.log(chalk.gray(`  Rhythm:   ${entry.rhythm.rhythm} (${entry.rhythm.pattern})`));
    console.log(chalk.gray(`  Scale:    ${entry.scale.scale}`));
    console.log(chalk.gray(`  Position: ${entry.position.position}-shape`));
    console.log(chalk.gray(`  Pattern:  ${entry.notePattern.pattern}`));
    console.log(chalk.gray(`  Key:      ${entry.key}`));

    // Show compound status
    if (compoundStats) {
      console.log();
      if (compoundStats.isMastered) {
        console.log(chalk.green(`  🏆 Compound MASTERED!`));
      } else if (compoundStats.hasExpanded) {
        if (compoundStats.masteryStreak > 0) {
          console.log(
            chalk.magenta(
              `  Mastery streak: ${compoundStats.masteryStreak}/${settings.progression.masteryStreak}`,
            ),
          );
        } else {
          console.log(chalk.cyan(`  Compound expanded - neighbors unlocked`));
        }
      } else {
        const progress = Math.min(entry.npm / settings.progression.expansionNpm, 1);
        console.log(
          chalk.yellow(
            `  Expansion progress: ${Math.round(progress * 100)}% (need ${settings.progression.expansionNpm} NPM)`,
          ),
        );
      }
    }

    // Check for struggling
    showStrugglingWarning(engine, settings, compoundStats);

    // Check for new dimension unlocks
    const unlocksAfter = repo.getUnlockedDimensions();
    const newUnlocks = unlocksAfter.filter((d) => !unlocksBefore.includes(d));

    if (newUnlocks.length > 0) {
      console.log();
      console.log(chalk.green('═'.repeat(45)));
      console.log(chalk.green.bold('  🎉 NEW DIMENSION UNLOCKED! 🎉'));
      for (const dim of newUnlocks) {
        const displayName = dim.replace('-', ' ').toUpperCase();
        console.log(chalk.green(`  ${displayName}`));
      }
      console.log(chalk.green('═'.repeat(45)));
    }
  } catch (error) {
    if ((error as Error).message?.includes('cancelled')) {
      console.log(chalk.gray('\nCancelled.'));
      process.exit(0);
    }
    console.error(chalk.red(`Error: ${(error as Error).message}`));
    process.exit(1);
  }
}
