import chalk from 'chalk';
import { parseSigId } from '../types.js';
export function statsCommand(repo, settings) {
    // Show compound stats first (the new system)
    displayCompoundStats(repo, settings);
    // Show dimension unlock progress
    displayDimensionProgress(repo, settings);
    // Show legacy dimension stats for reference
    const allStats = repo.getAllStats();
    if (allStats.length > 0) {
        console.log(chalk.gray('\n  ─────────────────────────────────────────────────────────────────'));
        console.log(chalk.gray.bold('  DIMENSION SIGNATURES (Legacy View)'));
        console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────'));
        // Group by dimension
        const rhythmStats = allStats.filter((s) => s.dimension === 'rhythm');
        const scaleStats = allStats.filter((s) => s.dimension === 'scale');
        const positionStats = allStats.filter((s) => s.dimension === 'position');
        const notePatternStats = allStats.filter((s) => s.dimension === 'note-pattern');
        if (rhythmStats.length > 0) {
            console.log(chalk.gray('\n  Rhythm:'));
            displayLegacyStatsCompact(rhythmStats, settings);
        }
        if (scaleStats.length > 0) {
            console.log(chalk.gray('\n  Scale:'));
            displayLegacyStatsCompact(scaleStats, settings);
        }
        if (positionStats.length > 0) {
            console.log(chalk.gray('\n  Position:'));
            displayLegacyStatsCompact(positionStats, settings);
        }
        if (notePatternStats.length > 0) {
            console.log(chalk.gray('\n  Note Pattern:'));
            displayLegacyStatsCompact(notePatternStats, settings);
        }
    }
    // Explanatory text
    console.log(chalk.gray('\n  ─────────────────────────────────────────────────────────────────'));
    console.log(chalk.gray('  HOW PROGRESSION WORKS'));
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────────────'));
    console.log(chalk.gray(`  • NPM = Notes Per Minute = BPM × notes per beat`));
    console.log(chalk.gray(`      Example: 80 BPM × 2 (8ths) = 160 NPM, 80 BPM × 4 (16ths) = 320 NPM`));
    console.log(chalk.gray(`  • Compounds = Scale + Position + Rhythm combinations`));
    console.log(chalk.gray(`  • ${chalk.yellow('practicing')} = Below expansion threshold (${settings.progression.expansionNpm} NPM)`));
    console.log(chalk.gray(`  • ${chalk.cyan('expanded')}   = Hit ${settings.progression.expansionNpm}+ NPM, neighbors unlocked`));
    console.log(chalk.gray(`  • ${chalk.magenta('streak N/3')} = N consecutive practices at ${settings.progression.masteryNpm}+ NPM`));
    console.log(chalk.gray(`  • ${chalk.green('MASTERED')}  = ${settings.progression.masteryStreak} consecutive at ${settings.progression.masteryNpm}+ NPM`));
    console.log(chalk.gray('  • Only one dimension changes at a time to keep practice focused'));
    console.log();
}
function displayCompoundStats(repo, settings) {
    const compounds = repo.getAllCompoundStats();
    if (compounds.length === 0) {
        console.log(chalk.gray('\n  No compound stats yet. Complete some practice first!'));
        console.log(chalk.gray('  Run "chops" to get started.'));
        return;
    }
    console.log(chalk.yellow.bold('\n  COMPOUND PROGRESS\n'));
    // Sort by attempts descending
    const sorted = [...compounds].sort((a, b) => b.attempts - a.attempts);
    // Header
    console.log(chalk.gray('  ') +
        padRight('Compound', 35) +
        padRight('Attempts', 10) +
        padRight('Best NPM', 10) +
        padRight('Status', 15));
    console.log(chalk.gray('  ' + '─'.repeat(70)));
    for (const c of sorted) {
        // Format compound name
        let compoundName = `${c.scale}+${c.position}+${c.rhythm}`;
        if (c.notePattern) {
            compoundName += `+${c.notePattern}`;
        }
        // Determine status
        let status;
        if (c.isMastered) {
            status = chalk.green('MASTERED');
        }
        else if (c.masteryStreak > 0) {
            status = chalk.magenta(`streak ${c.masteryStreak}/${settings.progression.masteryStreak}`);
        }
        else if (c.hasExpanded) {
            status = chalk.cyan('expanded');
        }
        else {
            status = chalk.yellow('practicing');
        }
        console.log('  ' +
            padRight(compoundName, 35) +
            padRight(String(c.attempts), 10) +
            padRight(String(Math.round(c.bestNpm)), 10) +
            status);
    }
    // Summary
    const expanded = compounds.filter(c => c.hasExpanded).length;
    const mastered = compounds.filter(c => c.isMastered).length;
    console.log();
    console.log(chalk.gray(`  Total: ${compounds.length} compounds, ${expanded} expanded, ${mastered} mastered`));
}
function displayDimensionProgress(repo, settings) {
    console.log(chalk.yellow.bold('\n  DIMENSION UNLOCKS\n'));
    const notePatternUnlocked = repo.isDimensionUnlocked('note-pattern');
    const articulationUnlocked = repo.isDimensionUnlocked('articulation');
    // Tier 0: Always unlocked
    console.log(chalk.green('  ✓ Scale') + chalk.gray(' (Tier 0 - always available)'));
    console.log(chalk.green('  ✓ Position') + chalk.gray(' (Tier 0 - always available)'));
    console.log(chalk.green('  ✓ Rhythm') + chalk.gray(' (Tier 0 - always available)'));
    // Tier 1: Note Pattern
    if (notePatternUnlocked) {
        console.log(chalk.green('  ✓ Note Pattern') + chalk.gray(' (Tier 1 - unlocked!)'));
    }
    else {
        const expanded = repo.countExpandedCompoundsInTier(0);
        const needed = settings.dimensionTiers.find(d => d.name === 'note-pattern')?.unlockRequirement ?? 5;
        console.log(chalk.yellow(`  ○ Note Pattern`) + chalk.gray(` (Tier 1 - ${expanded}/${needed} compounds expanded)`));
    }
    // Tier 2: Articulation
    if (articulationUnlocked) {
        console.log(chalk.green('  ✓ Articulation') + chalk.gray(' (Tier 2 - unlocked!)'));
    }
    else if (notePatternUnlocked) {
        const expanded = repo.countExpandedCompoundsInTier(1);
        const needed = settings.dimensionTiers.find(d => d.name === 'articulation')?.unlockRequirement ?? 5;
        console.log(chalk.gray(`  ○ Articulation`) + chalk.gray(` (Tier 2 - ${expanded}/${needed} compounds expanded)`));
    }
    else {
        console.log(chalk.gray(`  ○ Articulation`) + chalk.gray(` (Tier 2 - unlock Note Pattern first)`));
    }
}
function displayLegacyStatsCompact(stats, settings) {
    const sorted = [...stats].sort((a, b) => b.attempts - a.attempts);
    for (const s of sorted) {
        const sig = parseSigId(s.signatureId);
        let sigName;
        if (sig.dimension === 'rhythm') {
            sigName = `${sig.rhythm}/${sig.pattern}`;
        }
        else if (sig.dimension === 'scale') {
            sigName = sig.scale;
        }
        else if (sig.dimension === 'position') {
            sigName = `${sig.position}-shape`;
        }
        else if (sig.dimension === 'note-pattern') {
            sigName = sig.pattern;
        }
        else {
            sigName = s.signatureId;
        }
        let status;
        if (s.isMastered) {
            status = chalk.green('✓');
        }
        else if (s.hasExpanded) {
            status = chalk.cyan('○');
        }
        else {
            status = chalk.yellow('·');
        }
        console.log(chalk.gray(`    ${status} ${padRight(sigName, 15)} ${s.attempts} attempts, ${Math.round(s.bestNpm)} NPM`));
    }
}
function padRight(str, len) {
    if (str.length >= len)
        return str.slice(0, len);
    return str + ' '.repeat(len - str.length);
}
//# sourceMappingURL=stats.js.map