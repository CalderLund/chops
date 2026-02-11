import chalk from 'chalk';
import { bpmToNpm } from '../core/normalizer.js';
export function historyCommand(repo, limit = 20) {
    const entries = repo.getRecentPractice(limit);
    if (entries.length === 0) {
        console.log(chalk.gray('No practice history yet. Run "chops" to get started.'));
        return;
    }
    displayHistory(entries);
}
export async function interactiveHistoryCommand(repo, settings, options, limit = 50) {
    const { default: Enquirer } = await import('enquirer');
    const enquirer = new Enquirer();
    while (true) {
        const entries = repo.getRecentPractice(limit);
        if (entries.length === 0) {
            console.log(chalk.gray('No practice history yet.'));
            return;
        }
        // Build choices for selection
        const choices = entries.map((entry) => ({
            name: entry.id.toString(),
            message: formatEntryForSelect(entry),
            value: entry.id,
        }));
        choices.push({
            name: 'back',
            message: chalk.gray('← Exit'),
            value: -1,
        });
        try {
            const response = await enquirer.prompt({
                type: 'select',
                name: 'entryId',
                message: 'Select an entry to view/edit',
                choices,
            });
            const entryId = parseInt(response.entryId, 10);
            if (entryId === -1 || isNaN(entryId)) {
                return;
            }
            const entry = repo.getPracticeById(entryId);
            if (!entry) {
                console.log(chalk.red('Entry not found.'));
                continue;
            }
            // Show entry details and edit menu
            await showEntryEditor(enquirer, repo, entry, settings, options);
        }
        catch (error) {
            if (error.message?.includes('cancelled')) {
                return;
            }
            throw error;
        }
    }
}
function displayHistory(entries) {
    console.log(chalk.yellow.bold('\n  PRACTICE HISTORY\n'));
    // Header
    console.log(chalk.gray('  ') +
        padRight('Date', 12) +
        padRight('Rhythm', 12) +
        padRight('Scale', 18) +
        padRight('Position', 9) +
        padRight('Pattern', 10) +
        padRight('Key', 4) +
        padRight('BPM', 5) +
        padRight('NPM', 5));
    console.log(chalk.gray('  ' + '─'.repeat(75)));
    for (const entry of entries) {
        const date = formatDate(entry.loggedAt);
        const rhythm = `${entry.rhythm.rhythm}/${entry.rhythm.pattern}`;
        const scale = `${entry.scale.scale} ${entry.tonality}`;
        const position = `${entry.position.position}-shape`;
        const notePattern = entry.notePattern.pattern;
        console.log('  ' +
            padRight(date, 12) +
            padRight(rhythm, 12) +
            padRight(scale, 18) +
            padRight(position, 9) +
            padRight(notePattern, 10) +
            padRight(entry.key, 4) +
            padRight(String(entry.bpm), 5) +
            padRight(String(entry.npm), 5));
    }
    console.log();
}
function formatEntryForSelect(entry) {
    const date = formatDate(entry.loggedAt);
    const rhythm = `${entry.rhythm.rhythm}/${entry.rhythm.pattern}`;
    const scale = `${entry.scale.scale} ${entry.tonality}`;
    const position = `${entry.position.position}-shape`;
    return `${date}  ${padRight(rhythm, 12)} ${padRight(scale, 16)} ${padRight(position, 8)} ${padRight(entry.notePattern.pattern, 8)} ${entry.key}  ${chalk.cyan(entry.bpm + ' BPM')} ${chalk.gray(entry.npm + ' NPM')}`;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function showEntryEditor(enquirer, repo, entry, settings, options) {
    // Working copy of entry values
    let rhythm = entry.rhythm;
    let scale = entry.scale;
    let tonality = entry.tonality;
    let position = entry.position;
    let notePattern = entry.notePattern;
    let key = entry.key;
    let bpm = entry.bpm;
    while (true) {
        console.log(chalk.yellow('\n  ─────────────────────────────────────────'));
        console.log(chalk.yellow.bold('  EDIT ENTRY'));
        console.log(chalk.yellow('  ─────────────────────────────────────────'));
        console.log(`  ${chalk.gray('Date:')}     ${formatDateLong(entry.loggedAt)}`);
        console.log();
        // Build choices showing current values
        // All dimensions are editable (lock only affects recommendations, not tracking)
        const choices = [
            { name: 'rhythm', message: `Rhythm:    ${chalk.cyan(rhythm.rhythm)}` },
            { name: 'scale', message: `Scale:     ${chalk.cyan(scale.scale)}` },
            { name: 'tonality', message: `Tonality:  ${chalk.cyan(tonality)}` },
            { name: 'position', message: `Position:  ${chalk.cyan(position.position + '-shape')}` },
            { name: 'pattern', message: `Pattern:   ${chalk.cyan(notePattern.pattern)}` },
            { name: 'key', message: `Key:       ${chalk.cyan(key)}` },
            { name: 'bpm', message: `BPM:       ${chalk.cyan(bpm.toString())}` },
            { name: 'divider', message: chalk.gray('─'.repeat(30)), disabled: true },
            { name: 'save', message: chalk.green('✓ Save changes') },
            { name: 'delete', message: chalk.red('🗑️  Delete entry') },
            { name: 'back', message: chalk.gray('← Back (discard changes)') },
        ];
        const response = await enquirer.prompt({
            type: 'select',
            name: 'field',
            message: 'Select a field to edit',
            choices,
        });
        if (response.field === 'back') {
            return;
        }
        if (response.field === 'save') {
            const notesPerBeat = getNotesPerBeat(rhythm.rhythm);
            const npm = bpmToNpm(bpm, notesPerBeat);
            repo.updatePractice(entry.id, rhythm, scale, tonality, position, notePattern, key, bpm, npm);
            repo.recalculateAllStats(settings.emaAlpha, settings.progression.expansionNpm, settings.progression.masteryNpm, settings.progression.masteryStreak);
            console.log(chalk.green('✓ Entry updated'));
            return;
        }
        if (response.field === 'delete') {
            await deleteEntry(enquirer, repo, entry, settings);
            return;
        }
        // Edit the selected field
        if (response.field === 'rhythm') {
            const result = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: 'Select rhythm',
                choices: options.rhythms,
                initial: options.rhythms.indexOf(rhythm.rhythm),
            });
            const pattern = options.getPatternForRhythm(result.value);
            rhythm = { dimension: 'rhythm', rhythm: result.value, pattern };
        }
        if (response.field === 'scale') {
            const result = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: 'Select scale',
                choices: options.scales,
                initial: options.scales.indexOf(scale.scale),
            });
            scale = { dimension: 'scale', scale: result.value };
        }
        if (response.field === 'tonality') {
            const result = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: 'Select tonality',
                choices: options.tonalities,
                initial: options.tonalities.indexOf(tonality),
            });
            tonality = result.value;
        }
        if (response.field === 'position') {
            const result = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: 'Select position',
                choices: options.positions.map(p => ({ name: p, message: `${p}-shape` })),
                initial: options.positions.indexOf(position.position),
            });
            position = { dimension: 'position', position: result.value };
        }
        if (response.field === 'pattern') {
            const result = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: 'Select note pattern',
                choices: options.patterns,
                initial: options.patterns.indexOf(notePattern.pattern),
            });
            notePattern = { dimension: 'note-pattern', pattern: result.value };
        }
        if (response.field === 'key') {
            const result = await enquirer.prompt({
                type: 'select',
                name: 'value',
                message: 'Select key',
                choices: options.keys,
                initial: options.keys.indexOf(key),
            });
            key = result.value;
        }
        if (response.field === 'bpm') {
            const result = await enquirer.prompt({
                type: 'input',
                name: 'value',
                message: 'Enter BPM',
                initial: bpm.toString(),
                validate: (value) => {
                    const num = parseFloat(value);
                    if (!num || num <= 0 || isNaN(num)) {
                        return 'Please enter a valid positive number';
                    }
                    return true;
                },
            });
            bpm = parseFloat(result.value);
        }
    }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteEntry(enquirer, repo, entry, settings) {
    const response = await enquirer.prompt({
        type: 'confirm',
        name: 'confirm',
        message: chalk.red(`Delete entry from ${formatDateLong(entry.loggedAt)}?`),
        initial: false,
    });
    if (response.confirm) {
        repo.deletePractice(entry.id);
        repo.recalculateAllStats(settings.emaAlpha, settings.progression.expansionNpm, settings.progression.masteryNpm, settings.progression.masteryStreak);
        console.log(chalk.green('✓ Entry deleted'));
    }
    else {
        console.log(chalk.gray('Cancelled'));
    }
}
function getNotesPerBeat(rhythm) {
    const notesPerBeatMap = {
        '8ths': 2,
        'triplets': 3,
        '16ths': 4,
        'quintuplets': 5,
        'sextuplets': 6,
    };
    return notesPerBeatMap[rhythm] ?? 2;
}
function formatDate(isoString) {
    const d = new Date(isoString);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${mins}`;
}
function formatDateLong(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString();
}
function padRight(str, len) {
    if (str.length >= len)
        return str.slice(0, len);
    return str + ' '.repeat(len - str.length);
}
//# sourceMappingURL=history.js.map