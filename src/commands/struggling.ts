import chalk from 'chalk';
import { Repository } from '../db/repository.js';
import { Engine } from '../core/engine.js';
import { Settings } from '../types.js';

export interface StrugglingOptions {
  dimensions: Array<{
    name: string;
    displayName: string;
    getValues: () => string[];
  }>;
}

export async function strugglingCommand(
  repo: Repository,
  engine: Engine,
  settings: Settings,
  options: StrugglingOptions,
): Promise<void> {
  const { default: Enquirer } = await import('enquirer');
  const enquirer = new Enquirer();

  try {
    // Show compounds where user is struggling
    const strugglingCompounds = engine.getStrugglingCompounds();
    const proficiencies = repo.getAllProficiencies();

    console.log(chalk.yellow.bold('\n  STRUGGLING DETECTION\n'));

    if (strugglingCompounds.length === 0) {
      console.log(chalk.gray('  No compounds currently flagged as struggling.'));
      console.log(chalk.gray(`  (Struggling = NPM below ${settings.npmTiers.struggling})\n`));
    } else {
      console.log(chalk.red('  Compounds with struggling attempts:'));
      for (const compound of strugglingCompounds) {
        const parts = [compound.scale, compound.position, compound.rhythm];
        if (compound.notePattern) parts.push(compound.notePattern);
        console.log(
          `  ${chalk.red('•')} ${parts.join(' + ')} ${chalk.gray(`(${compound.strugglingStreak} attempts)`)}`,
        );
      }
      console.log();
    }

    // Show proficiencies that might need review
    const strugglingProfs = engine.getStrugglingProficiencies();
    if (strugglingProfs.length > 0) {
      console.log(chalk.yellow('  Proficiencies that may need review:'));
      const seen = new Set<string>();
      for (const prof of strugglingProfs) {
        const key = `${prof.dimension}:${prof.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          const dimConfig = options.dimensions.find((d) => d.name === prof.dimension);
          const displayName = dimConfig?.displayName ?? prof.dimension;
          console.log(`  ${chalk.yellow('•')} ${displayName}: ${prof.value}`);
        }
      }
      console.log();
    }

    // Select action
    const actionResponse = (await enquirer.prompt({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: 'remove-proficiency', message: 'Remove a proficiency (mark as not yet mastered)' },
        { name: 'view-tiers', message: 'View NPM tier thresholds' },
        { name: 'back', message: chalk.gray('← Back') },
      ],
    })) as { action: string };

    if (actionResponse.action === 'back') {
      return;
    }

    if (actionResponse.action === 'view-tiers') {
      console.log(chalk.yellow.bold('\n  NPM TIER THRESHOLDS\n'));
      console.log(`  ${chalk.red('Struggling')}:     < ${settings.npmTiers.struggling} NPM`);
      console.log(
        `  ${chalk.yellow('Developing')}:    ${settings.npmTiers.struggling} - ${settings.npmTiers.developing - 1} NPM`,
      );
      console.log(
        `  ${chalk.blue('Progressing')}:   ${settings.npmTiers.developing} - ${settings.npmTiers.progressing - 1} NPM`,
      );
      console.log(
        `  ${chalk.cyan('Fast')}:          ${settings.npmTiers.progressing} - ${settings.npmTiers.fast - 1} NPM`,
      );
      console.log(
        `  ${chalk.green('Very Fast')}:     ${settings.npmTiers.fast} - ${settings.npmTiers.veryFast - 1} NPM`,
      );
      console.log(
        `  ${chalk.magenta('Super Fast')}:    ${settings.npmTiers.veryFast} - ${settings.npmTiers.superFast - 1} NPM`,
      );
      console.log(`  ${chalk.magenta.bold('Shredding')}:     ${settings.npmTiers.superFast}+ NPM`);
      console.log();
      return;
    }

    if (actionResponse.action === 'remove-proficiency') {
      if (proficiencies.length === 0) {
        console.log(chalk.yellow('\n  No proficiencies declared.\n'));
        return;
      }

      // Select dimension
      const dimResponse = (await enquirer.prompt({
        type: 'select',
        name: 'dimension',
        message: 'Select dimension',
        choices: options.dimensions
          .filter((d) => proficiencies.some((p) => p.dimension === d.name))
          .map((d) => ({
            name: d.name,
            message: d.displayName,
          })),
      })) as { dimension: string };

      const currentProficiencies = repo.getProficiencies(dimResponse.dimension);

      if (currentProficiencies.length === 0) {
        console.log(chalk.yellow('\n  No proficiencies for this dimension.\n'));
        return;
      }

      const selectedDim = options.dimensions.find((d) => d.name === dimResponse.dimension)!;

      const valueResponse = (await enquirer.prompt({
        type: 'select',
        name: 'value',
        message: `Select ${selectedDim.displayName.toLowerCase()} to mark as not mastered`,
        choices: currentProficiencies,
      })) as { value: string };

      repo.removeProficient(dimResponse.dimension, valueResponse.value);
      console.log(chalk.yellow(`\n  ✓ Removed proficiency: ${valueResponse.value}`));
      console.log(chalk.gray('  Recommendations will now include simpler exercises.\n'));
    }
  } catch (error) {
    if ((error as Error).message?.includes('cancelled')) {
      console.log(chalk.gray('\nCancelled.\n'));
      return;
    }
    throw error;
  }
}
