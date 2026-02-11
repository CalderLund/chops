import chalk from 'chalk';
export async function proficientCommand(repo, engine, options) {
    const { default: Enquirer } = await import('enquirer');
    const enquirer = new Enquirer();
    try {
        // Show current proficiencies
        const allProficiencies = repo.getAllProficiencies();
        console.log(chalk.yellow.bold('\n  DIMENSION PROFICIENCY\n'));
        if (allProficiencies.length === 0) {
            console.log(chalk.gray('  No proficiencies declared yet.'));
            console.log(chalk.gray('  Declare proficiency to unlock advanced suggestions.\n'));
        }
        else {
            console.log(chalk.gray('  Current proficiencies:'));
            for (const dim of options.dimensions) {
                const values = allProficiencies
                    .filter((p) => p.dimension === dim.name)
                    .map((p) => p.value);
                if (values.length > 0) {
                    console.log(`  ${chalk.cyan(dim.displayName)}: ${values.join(', ')}`);
                }
            }
            console.log();
        }
        // Select action
        const actionResponse = await enquirer.prompt({
            type: 'select',
            name: 'action',
            message: 'What would you like to do?',
            choices: [
                { name: 'add', message: 'Add proficiency' },
                { name: 'remove', message: 'Remove proficiency' },
                { name: 'back', message: chalk.gray('← Back') },
            ],
        });
        if (actionResponse.action === 'back') {
            return;
        }
        // Select dimension
        const dimResponse = await enquirer.prompt({
            type: 'select',
            name: 'dimension',
            message: 'Select dimension',
            choices: options.dimensions.map((d) => ({
                name: d.name,
                message: d.displayName,
            })),
        });
        const selectedDim = options.dimensions.find((d) => d.name === dimResponse.dimension);
        const availableValues = selectedDim.getValues();
        const currentProficiencies = repo.getProficiencies(selectedDim.name);
        if (actionResponse.action === 'add') {
            // Filter to values not already proficient in
            const addableValues = availableValues.filter((v) => !currentProficiencies.includes(v));
            if (addableValues.length === 0) {
                console.log(chalk.yellow('\n  Already proficient in all values for this dimension.\n'));
                return;
            }
            const valueResponse = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: `Select ${selectedDim.displayName.toLowerCase()} to declare proficiency`,
                choices: addableValues,
            });
            // Get prerequisites
            const prerequisites = selectedDim.getPrerequisites(valueResponse.value);
            const toAdd = [valueResponse.value, ...prerequisites].filter((v) => !currentProficiencies.includes(v));
            // Confirm with prerequisites
            if (prerequisites.length > 0) {
                const newPrereqs = prerequisites.filter((p) => !currentProficiencies.includes(p));
                if (newPrereqs.length > 0) {
                    console.log(chalk.gray(`\n  This will also add prerequisites: ${newPrereqs.join(', ')}`));
                }
            }
            // Add proficiencies
            for (const value of toAdd) {
                repo.setProficient(selectedDim.name, value);
            }
            console.log(chalk.green(`\n  ✓ Added proficiency: ${toAdd.join(', ')}\n`));
        }
        else if (actionResponse.action === 'remove') {
            if (currentProficiencies.length === 0) {
                console.log(chalk.yellow('\n  No proficiencies to remove for this dimension.\n'));
                return;
            }
            const valueResponse = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: `Select ${selectedDim.displayName.toLowerCase()} to remove proficiency`,
                choices: currentProficiencies,
            });
            repo.removeProficient(selectedDim.name, valueResponse.value);
            console.log(chalk.yellow(`\n  ✓ Removed proficiency: ${valueResponse.value}\n`));
        }
    }
    catch (error) {
        if (error.message?.includes('cancelled')) {
            console.log(chalk.gray('\nCancelled.\n'));
            return;
        }
        throw error;
    }
}
//# sourceMappingURL=proficient.js.map