import chalk from 'chalk';
export function exerciseCommand(engine, repo, settings) {
    // Check for dimension unlocks before generating suggestion
    const unlocksBefore = repo.getUnlockedDimensions();
    const suggestion = engine.generateCompoundSuggestion();
    // Check if any new dimensions were unlocked
    const unlocksAfter = repo.getUnlockedDimensions();
    const newUnlocks = unlocksAfter.filter(d => !unlocksBefore.includes(d));
    // Display unlock celebration if any
    if (newUnlocks.length > 0) {
        displayDimensionUnlock(newUnlocks, settings);
    }
    // Show compound progress summary
    displayCompoundProgress(repo, settings);
    displaySuggestion(suggestion);
}
function displayDimensionUnlock(dimensions, settings) {
    const line = '═'.repeat(45);
    console.log();
    console.log(chalk.green(line));
    console.log(chalk.green.bold('  🎉 NEW DIMENSION UNLOCKED! 🎉'));
    console.log(chalk.green(line));
    for (const dim of dimensions) {
        const config = settings.dimensionTiers.find(d => d.name === dim);
        const displayName = dim.replace('-', ' ').toUpperCase();
        console.log();
        console.log(chalk.green(`  ${displayName}`));
        console.log(chalk.gray(`  Entry point: ${config?.entryPoint ?? 'unknown'}`));
    }
    console.log();
    console.log(chalk.gray('  You\'ve proven your foundation. Time to explore new territory!'));
    console.log(chalk.green(line));
    console.log();
}
function displayCompoundProgress(repo, settings) {
    const expandedTier0 = repo.countExpandedCompoundsInTier(0);
    const expandedTier1 = repo.countExpandedCompoundsInTier(1);
    const notePatternUnlocked = repo.isDimensionUnlocked('note-pattern');
    const articulationUnlocked = repo.isDimensionUnlocked('articulation');
    // Only show progress if there's something to show
    if (expandedTier0 === 0 && !notePatternUnlocked) {
        return;
    }
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log(chalk.gray('  COMPOUND PROGRESS'));
    if (!notePatternUnlocked) {
        const needed = settings.dimensionTiers.find(d => d.name === 'note-pattern')?.unlockRequirement ?? 5;
        console.log(chalk.gray(`  Foundation: ${expandedTier0}/${needed} compounds expanded`));
        if (expandedTier0 > 0) {
            const progress = Math.min(expandedTier0 / needed, 1);
            const barLen = 20;
            const filled = Math.round(progress * barLen);
            const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(barLen - filled));
            console.log(chalk.gray(`  [${bar}] ${Math.round(progress * 100)}%`));
        }
    }
    else if (!articulationUnlocked) {
        const needed = settings.dimensionTiers.find(d => d.name === 'articulation')?.unlockRequirement ?? 5;
        console.log(chalk.green(`  ✓ Note Pattern unlocked`));
        console.log(chalk.gray(`  Note Patterns: ${expandedTier1}/${needed} compounds expanded`));
    }
    else {
        console.log(chalk.green(`  ✓ Note Pattern unlocked`));
        console.log(chalk.green(`  ✓ Articulation unlocked`));
    }
    console.log(chalk.gray('  ─────────────────────────────────────────────'));
    console.log();
}
export function displaySuggestion(suggestion) {
    const line = '━'.repeat(45);
    console.log(chalk.yellow(line));
    console.log(chalk.yellow.bold(`  PRACTICE SUGGESTION`));
    console.log(chalk.yellow(line));
    console.log(`  ${chalk.gray('Scale:')}     ${formatScale(suggestion.scale.scale)} ${suggestion.tonality}`);
    console.log(`  ${chalk.gray('Position:')}  ${suggestion.position.position}-shape`);
    console.log(`  ${chalk.gray('Rhythm:')}    ${suggestion.rhythm.rhythm} (${suggestion.rhythm.pattern})`);
    console.log(`  ${chalk.gray('Pattern:')}   ${suggestion.notePattern.pattern}`);
    console.log(`  ${chalk.gray('Key:')}       ${suggestion.key}`);
    console.log();
    console.log(`  ${chalk.cyan('→')} ${suggestion.reasoning}`);
    console.log(chalk.yellow(line));
    console.log(`  Log with: ${chalk.green(`chops input -m <bpm>`)}`);
    console.log(chalk.yellow(line));
}
function formatScale(scale) {
    return scale.charAt(0).toUpperCase() + scale.slice(1).replace(/_/g, ' ');
}
//# sourceMappingURL=exercise.js.map