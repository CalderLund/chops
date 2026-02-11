import { sigId, DEFAULT_SETTINGS, } from '../types.js';
import { DimensionRegistry } from '../dimensions/registry.js';
import { scoreCandidate, weightedRandomSelect } from './scoring.js';
import { scoreCompoundCandidate, weightedRandomSelectCompound, } from './compound-scoring.js';
import { bpmToNpm } from './normalizer.js';
import { FileSuggestionStore } from '../db/suggestion.js';
import { compoundId, compoundsEqual, countDimensionChanges, statsToCompound } from '../db/compound.js';
import { updateStreak } from './streaks.js';
import { checkAchievements, ACHIEVEMENT_DEFINITIONS } from './achievements.js';
export class Engine {
    suggestionStore;
    rhythmDim;
    scaleDim;
    positionDim;
    notePatternDim;
    _registry;
    settings;
    randomFn;
    repo;
    constructor(repo, registryOrRhythm, scaleOrSettings, positionOrRandom, notePatternOrStore, settingsOrUndef, randomFnOrUndef, suggestionStoreOrUndef) {
        this.repo = repo;
        if (registryOrRhythm instanceof DimensionRegistry) {
            // New API: Engine(repo, registry, settings?, randomFn?, suggestionStore?)
            this._registry = registryOrRhythm;
            this.rhythmDim = this._registry.rhythmDim;
            this.scaleDim = this._registry.scaleDim;
            this.positionDim = this._registry.positionDim;
            this.notePatternDim = this._registry.notePatternDim;
            this.settings = scaleOrSettings ?? DEFAULT_SETTINGS;
            this.randomFn = positionOrRandom ?? Math.random;
            this.suggestionStore = notePatternOrStore ?? new FileSuggestionStore();
        }
        else {
            // Legacy API: Engine(repo, rhythmDim, scaleDim, positionDim, notePatternDim, settings?, randomFn?, suggestionStore?)
            this.rhythmDim = registryOrRhythm;
            this.scaleDim = scaleOrSettings;
            this.positionDim = positionOrRandom;
            this.notePatternDim = notePatternOrStore;
            this.settings = settingsOrUndef ?? DEFAULT_SETTINGS;
            this.randomFn = randomFnOrUndef ?? Math.random;
            this.suggestionStore = suggestionStoreOrUndef ?? new FileSuggestionStore();
            // Build a registry from the individual dimensions
            this._registry = new DimensionRegistry();
            this._registry.register(this.rhythmDim);
            this._registry.register(this.scaleDim);
            this._registry.register(this.positionDim);
            this._registry.register(this.notePatternDim);
        }
    }
    // Access the dimension registry
    get registry() {
        return this._registry;
    }
    // Generate a suggestion (does NOT save to DB)
    generateSuggestion() {
        // Get most recent practice (or use entry points)
        const lastPractice = this.repo.getLastPractice();
        const previousRhythm = lastPractice?.rhythm ?? this.rhythmDim.getEntryPoint();
        const previousScale = lastPractice?.scale ?? this.scaleDim.getEntryPoint();
        const previousPosition = lastPractice?.position ?? this.positionDim.getEntryPoint();
        const previousNotePattern = lastPractice?.notePattern ?? this.notePatternDim.getEntryPoint();
        // Day 1: Use entry points directly
        const isFirstTime = !lastPractice;
        // Generate candidates (at most 1 dimension change from previous)
        const candidates = isFirstTime
            ? [{ rhythm: previousRhythm, scale: previousScale, position: previousPosition, notePattern: previousNotePattern }]
            : this.generateCandidates(previousRhythm, previousScale, previousPosition, previousNotePattern);
        // Score each candidate
        const now = new Date();
        const scoredCandidates = candidates.map((c) => {
            const context = {
                rhythmStats: this.repo.getStats(sigId(c.rhythm)),
                scaleStats: this.repo.getStats(sigId(c.scale)),
                positionStats: this.repo.getStats(sigId(c.position)),
                notePatternStats: this.repo.getStats(sigId(c.notePattern)),
                previousRhythm,
                previousScale,
                previousPosition,
                previousNotePattern,
                previousRhythmStats: this.repo.getStats(sigId(previousRhythm)),
                previousScaleStats: this.repo.getStats(sigId(previousScale)),
                previousPositionStats: this.repo.getStats(sigId(previousPosition)),
                previousNotePatternStats: this.repo.getStats(sigId(previousNotePattern)),
                settings: this.settings,
                now,
            };
            return {
                ...c,
                score: scoreCandidate(c.rhythm, c.scale, c.position, c.notePattern, context),
            };
        });
        // Select via weighted random
        const selected = weightedRandomSelect(scoredCandidates, scoredCandidates.map((c) => c.score), this.randomFn);
        // Pick a random key
        const key = this.settings.keys[Math.floor(this.randomFn() * this.settings.keys.length)];
        // Generate reasoning
        const reasoning = this.generateReasoning(selected.rhythm, selected.scale, selected.position, selected.notePattern, previousRhythm, previousScale, previousPosition, previousNotePattern);
        // Default tonality to minor for pentatonic (most common), major for others
        const tonality = selected.scale.scale === 'pentatonic' ? 'minor' : 'major';
        const suggestion = {
            rhythm: selected.rhythm,
            scale: selected.scale,
            tonality,
            position: selected.position,
            notePattern: selected.notePattern,
            key,
            reasoning,
            generatedAt: now.toISOString(),
        };
        // Save for later use by input command
        this.suggestionStore.save(suggestion);
        return suggestion;
    }
    // Get the last generated suggestion
    getLastSuggestion() {
        return this.suggestionStore.load();
    }
    // Log a practice session
    logPractice(rhythm, scale, tonality, position, notePattern, key, bpm, reasoning = null) {
        const notesPerBeat = this.rhythmDim.getNotesPerBeat(rhythm);
        const npm = bpmToNpm(bpm, notesPerBeat);
        const entry = this.repo.logPractice(rhythm, scale, tonality, position, notePattern, key, bpm, npm, reasoning, this.settings.emaAlpha);
        // Update progression for each signature
        const { expansionNpm, masteryNpm, masteryStreak } = this.settings.progression;
        this.repo.updateProgression(sigId(rhythm), npm, expansionNpm, masteryNpm, masteryStreak);
        this.repo.updateProgression(sigId(scale), npm, expansionNpm, masteryNpm, masteryStreak);
        this.repo.updateProgression(sigId(position), npm, expansionNpm, masteryNpm, masteryStreak);
        this.repo.updateProgression(sigId(notePattern), npm, expansionNpm, masteryNpm, masteryStreak);
        // Clear the suggestion after logging
        this.suggestionStore.clear();
        return entry;
    }
    // Log the last suggestion
    logLastSuggestion(bpm) {
        const suggestion = this.suggestionStore.load();
        if (!suggestion) {
            throw new Error('No suggestion to log. Run "chops" first to get a suggestion.');
        }
        return this.logPractice(suggestion.rhythm, suggestion.scale, suggestion.tonality, suggestion.position, suggestion.notePattern, suggestion.key, bpm, suggestion.reasoning);
    }
    generateCandidates(previousRhythm, previousScale, previousPosition, previousNotePattern) {
        const candidates = [];
        // Get stats for previous signatures to check expansion
        const prevRhythmStats = this.repo.getStats(sigId(previousRhythm));
        const prevScaleStats = this.repo.getStats(sigId(previousScale));
        const prevPositionStats = this.repo.getStats(sigId(previousPosition));
        const prevNotePatternStats = this.repo.getStats(sigId(previousNotePattern));
        // Option 1: Repeat (0 changes) - only if not mastered
        const repeatCandidate = {
            rhythm: previousRhythm,
            scale: previousScale,
            position: previousPosition,
            notePattern: previousNotePattern,
        };
        if (!this.isCandidateMastered(repeatCandidate)) {
            candidates.push(repeatCandidate);
        }
        // Option 2: Change rhythm only (1 change) - only if rhythm has expanded
        // Only check if the NEW rhythm is mastered (other dimensions can be mastered - they're a solid foundation)
        if (prevRhythmStats?.hasExpanded) {
            const rhythmNeighbors = this.rhythmDim.getNeighbors(previousRhythm);
            for (const rhythmNeighbor of rhythmNeighbors) {
                if (!this.isSignatureMastered(sigId(rhythmNeighbor))) {
                    candidates.push({
                        rhythm: rhythmNeighbor,
                        scale: previousScale,
                        position: previousPosition,
                        notePattern: previousNotePattern,
                    });
                }
            }
        }
        // Option 3: Change scale only (1 change) - only if scale has expanded
        // Only check if the NEW scale is mastered
        if (prevScaleStats?.hasExpanded) {
            const scaleNeighbors = this.scaleDim.getNeighbors(previousScale);
            for (const scaleNeighbor of scaleNeighbors) {
                if (!this.isSignatureMastered(sigId(scaleNeighbor))) {
                    candidates.push({
                        rhythm: previousRhythm,
                        scale: scaleNeighbor,
                        position: previousPosition,
                        notePattern: previousNotePattern,
                    });
                }
            }
        }
        // Option 4: Change position only (1 change) - only if position has expanded
        // Only check if the NEW position is mastered
        if (prevPositionStats?.hasExpanded) {
            const positionNeighbors = this.positionDim.getNeighbors(previousPosition);
            for (const positionNeighbor of positionNeighbors) {
                if (!this.isSignatureMastered(sigId(positionNeighbor))) {
                    candidates.push({
                        rhythm: previousRhythm,
                        scale: previousScale,
                        position: positionNeighbor,
                        notePattern: previousNotePattern,
                    });
                }
            }
        }
        // Option 5: Change note pattern only (1 change) - only if note pattern has expanded
        // Only check if the NEW note pattern is mastered
        if (prevNotePatternStats?.hasExpanded) {
            const notePatternNeighbors = this.notePatternDim.getNeighbors(previousNotePattern);
            for (const notePatternNeighbor of notePatternNeighbors) {
                if (!this.isSignatureMastered(sigId(notePatternNeighbor))) {
                    candidates.push({
                        rhythm: previousRhythm,
                        scale: previousScale,
                        position: previousPosition,
                        notePattern: notePatternNeighbor,
                    });
                }
            }
        }
        // If all candidates were filtered out (multiple signatures mastered),
        // generate a candidate using unmastered neighbors for each dimension
        if (candidates.length === 0) {
            const fallbackCandidate = this.generateUnmasteredCandidate(previousRhythm, previousScale, previousPosition, previousNotePattern);
            candidates.push(fallbackCandidate);
        }
        return candidates;
    }
    // Check if a single signature is mastered
    isSignatureMastered(signatureId) {
        const stats = this.repo.getStats(signatureId);
        return stats?.isMastered ?? false;
    }
    // Check if any signature in a candidate is mastered
    isCandidateMastered(candidate) {
        // Mastered signatures should not appear in suggestions at all
        return (this.isSignatureMastered(sigId(candidate.rhythm)) ||
            this.isSignatureMastered(sigId(candidate.scale)) ||
            this.isSignatureMastered(sigId(candidate.position)) ||
            this.isSignatureMastered(sigId(candidate.notePattern)));
    }
    // Generate a candidate with unmastered signatures for each dimension
    // Used when all 1-dimension-change candidates are filtered out
    generateUnmasteredCandidate(previousRhythm, previousScale, previousPosition, previousNotePattern) {
        // For each dimension, find the first unmastered signature
        // Priority: current -> neighbors -> entry point -> any unmastered
        const rhythm = this.findUnmasteredRhythm(previousRhythm);
        const scale = this.findUnmasteredScale(previousScale);
        const position = this.findUnmasteredPosition(previousPosition);
        const notePattern = this.findUnmasteredNotePattern(previousNotePattern);
        return { rhythm, scale, position, notePattern };
    }
    findUnmasteredRhythm(current) {
        // Try current first
        if (!this.isSignatureMastered(sigId(current))) {
            return current;
        }
        // Try neighbors
        for (const neighbor of this.rhythmDim.getNeighbors(current)) {
            if (!this.isSignatureMastered(sigId(neighbor))) {
                return neighbor;
            }
        }
        // Try all signatures
        for (const sig of this.rhythmDim.getSignatures()) {
            if (!this.isSignatureMastered(sigId(sig))) {
                return sig;
            }
        }
        // Fall back to entry point (everything is mastered - rare edge case)
        return this.rhythmDim.getEntryPoint();
    }
    findUnmasteredScale(current) {
        if (!this.isSignatureMastered(sigId(current))) {
            return current;
        }
        for (const neighbor of this.scaleDim.getNeighbors(current)) {
            if (!this.isSignatureMastered(sigId(neighbor))) {
                return neighbor;
            }
        }
        for (const sig of this.scaleDim.getSignatures()) {
            if (!this.isSignatureMastered(sigId(sig))) {
                return sig;
            }
        }
        return this.scaleDim.getEntryPoint();
    }
    findUnmasteredPosition(current) {
        if (!this.isSignatureMastered(sigId(current))) {
            return current;
        }
        for (const neighbor of this.positionDim.getNeighbors(current)) {
            if (!this.isSignatureMastered(sigId(neighbor))) {
                return neighbor;
            }
        }
        for (const sig of this.positionDim.getSignatures()) {
            if (!this.isSignatureMastered(sigId(sig))) {
                return sig;
            }
        }
        return this.positionDim.getEntryPoint();
    }
    findUnmasteredNotePattern(current) {
        if (!this.isSignatureMastered(sigId(current))) {
            return current;
        }
        for (const neighbor of this.notePatternDim.getNeighbors(current)) {
            if (!this.isSignatureMastered(sigId(neighbor))) {
                return neighbor;
            }
        }
        for (const sig of this.notePatternDim.getSignatures()) {
            if (!this.isSignatureMastered(sigId(sig))) {
                return sig;
            }
        }
        return this.notePatternDim.getEntryPoint();
    }
    generateReasoning(rhythm, scale, position, notePattern, previousRhythm, previousScale, previousPosition, previousNotePattern) {
        const rhythmChanged = rhythm.rhythm !== previousRhythm.rhythm || rhythm.pattern !== previousRhythm.pattern;
        const scaleChanged = scale.scale !== previousScale.scale;
        const positionChanged = position.position !== previousPosition.position;
        const notePatternChanged = notePattern.pattern !== previousNotePattern.pattern;
        const previousRhythmStats = this.repo.getStats(sigId(previousRhythm));
        const previousScaleStats = this.repo.getStats(sigId(previousScale));
        const previousPositionStats = this.repo.getStats(sigId(previousPosition));
        const previousNotePatternStats = this.repo.getStats(sigId(previousNotePattern));
        const rhythmStats = this.repo.getStats(sigId(rhythm));
        const scaleStats = this.repo.getStats(sigId(scale));
        const positionStats = this.repo.getStats(sigId(position));
        const notePatternStats = this.repo.getStats(sigId(notePattern));
        if (!rhythmChanged && !scaleChanged && !positionChanged && !notePatternChanged) {
            if (!previousRhythmStats || previousRhythmStats.attempts < this.settings.stability.minAttempts) {
                return `Repeating to consolidate - rhythm needs more practice`;
            }
            if (!previousScaleStats || previousScaleStats.attempts < this.settings.stability.minAttempts) {
                return `Repeating to consolidate - scale needs more practice`;
            }
            if (!previousPositionStats || previousPositionStats.attempts < this.settings.stability.minAttempts) {
                return `Repeating to consolidate - position needs more practice`;
            }
            if (!previousNotePatternStats || previousNotePatternStats.attempts < this.settings.stability.minAttempts) {
                return `Repeating to consolidate - note pattern needs more practice`;
            }
            return `Repeating to consolidate - building consistency`;
        }
        if (rhythmChanged) {
            const what = rhythm.rhythm !== previousRhythm.rhythm ? 'rhythm' : 'pattern';
            if (!rhythmStats || rhythmStats.attempts === 0) {
                return `Exploring new ${what} - never tried before`;
            }
            if (previousRhythmStats && previousRhythmStats.attempts >= this.settings.stability.minAttempts) {
                return `Stepping up ${what} - ${this.rhythmDim.describe(previousRhythm)} is stable`;
            }
            return `Trying ${what} - ${this.rhythmDim.describe(previousRhythm)} progressing`;
        }
        if (scaleChanged) {
            if (!scaleStats || scaleStats.attempts === 0) {
                return `Exploring new scale - never tried before`;
            }
            if (previousScaleStats && previousScaleStats.attempts >= this.settings.stability.minAttempts) {
                return `Stepping up scale - ${this.scaleDim.describe(previousScale)} is stable`;
            }
            return `Trying scale - ${this.scaleDim.describe(previousScale)} progressing`;
        }
        if (positionChanged) {
            if (!positionStats || positionStats.attempts === 0) {
                return `Exploring new position - never tried before`;
            }
            if (previousPositionStats && previousPositionStats.attempts >= this.settings.stability.minAttempts) {
                return `Stepping up position - ${this.positionDim.describe(previousPosition)} is stable`;
            }
            return `Trying position - ${this.positionDim.describe(previousPosition)} progressing`;
        }
        if (notePatternChanged) {
            if (!notePatternStats || notePatternStats.attempts === 0) {
                return `Exploring new note pattern - never tried before`;
            }
            if (previousNotePatternStats && previousNotePatternStats.attempts >= this.settings.stability.minAttempts) {
                return `Stepping up note pattern - ${this.notePatternDim.describe(previousNotePattern)} is stable`;
            }
            return `Trying note pattern - ${this.notePatternDim.describe(previousNotePattern)} progressing`;
        }
        return `Practice suggestion`;
    }
    // Get available rhythms for interactive mode
    getAvailableRhythms() {
        return this.rhythmDim.getAvailableRhythms();
    }
    // Get pattern for a rhythm (for interactive mode)
    getPatternForRhythm(rhythmId) {
        return this.rhythmDim.getPatternForRhythm(rhythmId);
    }
    // Get available scales for interactive mode
    getAvailableScales() {
        return this.scaleDim.getAvailableScales();
    }
    // Get available positions for interactive mode
    getAvailablePositions() {
        return this.positionDim.getAvailablePositions();
    }
    // Get available note patterns for interactive mode
    getAvailableNotePatterns() {
        return this.notePatternDim.getAvailablePatterns();
    }
    // Get available keys
    getAvailableKeys() {
        return this.settings.keys;
    }
    // ============================================================
    // COMPOUND-BASED PROGRESSION SYSTEM
    // ============================================================
    // Check and perform dimension unlocks
    checkDimensionUnlocks() {
        const unlocked = [];
        const currentSession = this.repo.getCurrentSession();
        for (const dimConfig of this.settings.dimensionTiers) {
            // Skip tier 0 (always available)
            if (dimConfig.tier === 0)
                continue;
            // Skip if already unlocked
            if (this.repo.isDimensionUnlocked(dimConfig.name))
                continue;
            // Check if previous tier has enough expanded compounds
            const prevTier = dimConfig.tier - 1;
            const expandedCount = this.repo.countExpandedCompoundsInTier(prevTier);
            const required = dimConfig.unlockRequirement ?? 5;
            if (expandedCount >= required) {
                // Unlock the dimension!
                // No recalculation needed - compounds already track all dimensions
                // The unlock just enables varying this dimension in recommendations
                this.repo.unlockDimension(dimConfig.name, currentSession);
                unlocked.push(dimConfig.name);
            }
        }
        return unlocked;
    }
    // Get the current compound from last practice (or entry point)
    // Always returns full compound with all dimensions for tracking
    getCurrentCompound() {
        const lastPractice = this.repo.getLastPractice();
        if (!lastPractice) {
            // Entry point compound (all dimensions)
            return {
                scale: this.scaleDim.getEntryPoint().scale,
                position: this.positionDim.getEntryPoint().position,
                rhythm: this.rhythmDim.getEntryPoint().rhythm,
                rhythmPattern: this.rhythmDim.getEntryPoint().pattern,
                notePattern: this.notePatternDim.getEntryPoint().pattern,
                // articulation would be added here when implemented
            };
        }
        return {
            scale: lastPractice.scale.scale,
            position: lastPractice.position.position,
            rhythm: lastPractice.rhythm.rhythm,
            rhythmPattern: lastPractice.rhythm.pattern,
            notePattern: lastPractice.notePattern.pattern,
        };
    }
    // Generate compound candidates
    generateCompoundCandidates(current) {
        const candidates = [];
        const currentStats = this.repo.getCompoundStats(compoundId(current));
        const currentSession = this.repo.getCurrentSession();
        const recentChanges = this.repo.getRecentDimensionChanges(3);
        // Check which dimensions are unlocked
        const notePatternUnlocked = this.repo.isDimensionUnlocked('note-pattern');
        // Option 1: STAY (repeat current compound)
        const stayCandidate = { ...current };
        if (!currentStats?.isMastered) {
            const stayContext = this.buildCompoundScoringContext(stayCandidate, current, currentStats, currentSession, recentChanges);
            candidates.push({
                compound: stayCandidate,
                score: scoreCompoundCandidate(stayCandidate, stayContext),
            });
        }
        // Only generate neighbor candidates if current compound is expanded
        if (currentStats?.hasExpanded) {
            // Option 2: Change scale
            const scaleNeighbors = this.scaleDim.getNeighbors({ dimension: 'scale', scale: current.scale });
            for (const neighbor of scaleNeighbors) {
                const candidate = { ...current, scale: neighbor.scale };
                if (!this.isCompoundMastered(candidate)) {
                    const context = this.buildCompoundScoringContext(candidate, current, currentStats, currentSession, recentChanges);
                    candidates.push({
                        compound: candidate,
                        score: scoreCompoundCandidate(candidate, context),
                    });
                }
            }
            // Option 3: Change position
            const positionNeighbors = this.positionDim.getNeighbors({ dimension: 'position', position: current.position });
            for (const neighbor of positionNeighbors) {
                const candidate = { ...current, position: neighbor.position };
                if (!this.isCompoundMastered(candidate)) {
                    const context = this.buildCompoundScoringContext(candidate, current, currentStats, currentSession, recentChanges);
                    candidates.push({
                        compound: candidate,
                        score: scoreCompoundCandidate(candidate, context),
                    });
                }
            }
            // Option 4: Change rhythm
            const rhythmNeighbors = this.rhythmDim.getNeighbors({
                dimension: 'rhythm',
                rhythm: current.rhythm,
                pattern: current.rhythmPattern,
            });
            for (const neighbor of rhythmNeighbors) {
                const candidate = {
                    ...current,
                    rhythm: neighbor.rhythm,
                    rhythmPattern: neighbor.pattern,
                };
                if (!this.isCompoundMastered(candidate)) {
                    const context = this.buildCompoundScoringContext(candidate, current, currentStats, currentSession, recentChanges);
                    candidates.push({
                        compound: candidate,
                        score: scoreCompoundCandidate(candidate, context),
                    });
                }
            }
            // Option 5: Change note pattern (if unlocked)
            if (notePatternUnlocked && current.notePattern) {
                const notePatternNeighbors = this.notePatternDim.getNeighbors({
                    dimension: 'note-pattern',
                    pattern: current.notePattern,
                });
                for (const neighbor of notePatternNeighbors) {
                    const candidate = { ...current, notePattern: neighbor.pattern };
                    if (!this.isCompoundMastered(candidate)) {
                        const context = this.buildCompoundScoringContext(candidate, current, currentStats, currentSession, recentChanges);
                        candidates.push({
                            compound: candidate,
                            score: scoreCompoundCandidate(candidate, context),
                        });
                    }
                }
            }
        }
        // If no candidates (everything mastered), fall back to entry point
        if (candidates.length === 0) {
            const entryCompound = this.getCurrentCompound();
            candidates.push({
                compound: entryCompound,
                score: 1.0,
            });
        }
        return candidates;
    }
    // Generate candidates from ALL practiced compounds, not just the last one
    // This allows the algorithm to suggest revisiting any branch of the skill tree
    generateAllCompoundCandidates() {
        const allCandidates = [];
        const currentSession = this.repo.getCurrentSession();
        const recentChanges = this.repo.getRecentDimensionChanges(3);
        const currentCompound = this.getCurrentCompound();
        // Get all practiced compounds
        const allStats = this.repo.getAllCompoundStats();
        const practicedCompounds = allStats.filter((s) => s.attempts > 0);
        // Check which dimensions are unlocked
        const notePatternUnlocked = this.repo.isDimensionUnlocked('note-pattern');
        // If no practiced compounds yet, use the entry point
        if (practicedCompounds.length === 0) {
            return [{ compound: currentCompound, score: 1.0 }];
        }
        // For each practiced compound, generate candidates
        for (const stats of practicedCompounds) {
            const compound = statsToCompound(stats);
            // Calculate recency/neglected factors for this compound
            const sessionsSincePractice = currentSession - (stats.lastPracticedSession ?? 0);
            const recencyBoost = this.calculateRecencyBoost(sessionsSincePractice, practicedCompounds.length);
            const strugglingBoost = stats.strugglingStreak > 0 ? 0.5 : 0;
            // Option 1: STAY (repeat this compound) - if not mastered
            if (!stats.isMastered) {
                const stayContext = this.buildCompoundScoringContext(compound, compound, // source is itself
                stats, currentSession, recentChanges);
                const baseScore = scoreCompoundCandidate(compound, stayContext);
                allCandidates.push({
                    compound,
                    score: baseScore + recencyBoost + strugglingBoost,
                });
            }
            // Only generate neighbor candidates if this compound is expanded
            if (stats.hasExpanded) {
                // Change scale
                const scaleNeighbors = this.scaleDim.getNeighbors({ dimension: 'scale', scale: compound.scale });
                for (const neighbor of scaleNeighbors) {
                    const candidate = { ...compound, scale: neighbor.scale };
                    if (!this.isCompoundMastered(candidate)) {
                        const context = this.buildCompoundScoringContext(candidate, compound, stats, currentSession, recentChanges);
                        allCandidates.push({
                            compound: candidate,
                            score: scoreCompoundCandidate(candidate, context) + recencyBoost,
                        });
                    }
                }
                // Change position
                const positionNeighbors = this.positionDim.getNeighbors({ dimension: 'position', position: compound.position });
                for (const neighbor of positionNeighbors) {
                    const candidate = { ...compound, position: neighbor.position };
                    if (!this.isCompoundMastered(candidate)) {
                        const context = this.buildCompoundScoringContext(candidate, compound, stats, currentSession, recentChanges);
                        allCandidates.push({
                            compound: candidate,
                            score: scoreCompoundCandidate(candidate, context) + recencyBoost,
                        });
                    }
                }
                // Change rhythm
                const rhythmNeighbors = this.rhythmDim.getNeighbors({
                    dimension: 'rhythm',
                    rhythm: compound.rhythm,
                    pattern: compound.rhythmPattern,
                });
                for (const neighbor of rhythmNeighbors) {
                    const candidate = {
                        ...compound,
                        rhythm: neighbor.rhythm,
                        rhythmPattern: neighbor.pattern,
                    };
                    if (!this.isCompoundMastered(candidate)) {
                        const context = this.buildCompoundScoringContext(candidate, compound, stats, currentSession, recentChanges);
                        allCandidates.push({
                            compound: candidate,
                            score: scoreCompoundCandidate(candidate, context) + recencyBoost,
                        });
                    }
                }
                // Change note pattern (if unlocked)
                if (notePatternUnlocked && compound.notePattern) {
                    const notePatternNeighbors = this.notePatternDim.getNeighbors({
                        dimension: 'note-pattern',
                        pattern: compound.notePattern,
                    });
                    for (const neighbor of notePatternNeighbors) {
                        const candidate = { ...compound, notePattern: neighbor.pattern };
                        if (!this.isCompoundMastered(candidate)) {
                            const context = this.buildCompoundScoringContext(candidate, compound, stats, currentSession, recentChanges);
                            allCandidates.push({
                                compound: candidate,
                                score: scoreCompoundCandidate(candidate, context) + recencyBoost,
                            });
                        }
                    }
                }
            }
        }
        // Deduplicate candidates by compound ID, keeping the highest score
        const deduped = this.deduplicateCandidates(allCandidates);
        // Enforce 1-dimension-change invariant: only keep candidates within
        // 1 dimension change of the current compound (last practice)
        const filtered = deduped.filter((c) => countDimensionChanges(currentCompound, c.compound) <= 1);
        // If no candidates (everything mastered or filtered), fall back to entry point
        if (filtered.length === 0) {
            return [{ compound: currentCompound, score: 1.0 }];
        }
        return filtered;
    }
    // Calculate recency boost: compounds not practiced recently get a boost
    // to encourage revisiting neglected branches
    calculateRecencyBoost(sessionsSince, totalCompounds) {
        // If only 1-2 compounds practiced, don't penalize recency as much
        if (totalCompounds <= 2) {
            return 0;
        }
        // Boost increases with sessions since practice, capped at 0.5
        // After 5 sessions without practice, gets max boost
        return Math.min(sessionsSince / 10, 0.5);
    }
    // Deduplicate candidates by compound ID, keeping the one with highest score
    deduplicateCandidates(candidates) {
        const byId = new Map();
        for (const candidate of candidates) {
            const id = compoundId(candidate.compound);
            const existing = byId.get(id);
            if (!existing || candidate.score > existing.score) {
                byId.set(id, candidate);
            }
        }
        return Array.from(byId.values());
    }
    buildCompoundScoringContext(candidate, current, currentStats, currentSession, recentChanges) {
        return {
            currentCompound: current,
            currentStats,
            candidateStats: this.repo.getCompoundStats(compoundId(candidate)),
            relatedStats: this.repo.getRelatedCompounds(candidate),
            currentSession,
            recentDimensionChanges: recentChanges,
            config: this.settings.compoundScoring,
            expansionNpm: this.settings.progression.expansionNpm,
        };
    }
    isCompoundMastered(compound) {
        const stats = this.repo.getCompoundStats(compoundId(compound));
        return stats?.isMastered ?? false;
    }
    // Generate suggestion using compound system
    // Now considers ALL practiced compounds, not just the last one
    generateCompoundSuggestion() {
        // Check for dimension unlocks first
        const newUnlocks = this.checkDimensionUnlocks();
        // Get current compound (for reasoning generation)
        const currentCompound = this.getCurrentCompound();
        const isFirstTime = !this.repo.hasAnyPractice();
        // Generate and score candidates from ALL practiced compounds
        const candidates = isFirstTime
            ? [{ compound: currentCompound, score: 1.0 }]
            : this.generateAllCompoundCandidates();
        // Select via weighted random
        const selected = weightedRandomSelectCompound(candidates.map((c) => c.compound), candidates.map((c) => c.score), this.randomFn);
        // Convert compound to suggestion format
        const rhythm = {
            dimension: 'rhythm',
            rhythm: selected.rhythm,
            pattern: selected.rhythmPattern,
        };
        const scale = { dimension: 'scale', scale: selected.scale };
        const position = { dimension: 'position', position: selected.position };
        const notePattern = {
            dimension: 'note-pattern',
            pattern: selected.notePattern ?? this.notePatternDim.getEntryPoint().pattern,
        };
        // Pick a random key
        const key = this.settings.keys[Math.floor(this.randomFn() * this.settings.keys.length)];
        // Generate reasoning
        const reasoning = this.generateCompoundReasoning(selected, currentCompound, newUnlocks);
        // Default tonality
        const tonality = selected.scale === 'pentatonic' ? 'minor' : 'major';
        const suggestion = {
            rhythm,
            scale,
            tonality,
            position,
            notePattern,
            key,
            reasoning,
            generatedAt: new Date().toISOString(),
        };
        this.suggestionStore.save(suggestion);
        return suggestion;
    }
    generateCompoundReasoning(selected, current, newUnlocks) {
        // Check for dimension unlock message
        if (newUnlocks.length > 0) {
            const unlockNames = newUnlocks.join(' and ');
            return `New dimension unlocked: ${unlockNames}! Continuing with your practice.`;
        }
        // Check what changed
        if (compoundsEqual(selected, current)) {
            const stats = this.repo.getCompoundStats(compoundId(current));
            if (!stats?.hasExpanded) {
                return `Building foundation - continue practicing to unlock neighbors`;
            }
            return `Consolidating - reinforcing current skills`;
        }
        // Something changed - identify what
        if (selected.scale !== current.scale) {
            return `Exploring ${selected.scale} scale - ${current.scale} is stable`;
        }
        if (selected.position !== current.position) {
            return `Moving to ${selected.position}-shape - expanding across the neck`;
        }
        if (selected.rhythm !== current.rhythm) {
            return `Trying ${selected.rhythm} - rhythm progression`;
        }
        if (selected.notePattern !== current.notePattern) {
            return `New note pattern: ${selected.notePattern} - pattern progression`;
        }
        return `Practice suggestion`;
    }
    // Log practice and update compound stats
    logCompoundPractice(rhythm, scale, tonality, position, notePattern, key, bpm, reasoning = null) {
        const notesPerBeat = this.rhythmDim.getNotesPerBeat(rhythm);
        const npm = bpmToNpm(bpm, notesPerBeat);
        // Increment session counter
        const sessionNumber = this.repo.incrementSession();
        // Always build full compound for tracking (regardless of unlock status)
        // The "lock" only affects recommendations, not tracking
        const compound = {
            scale: scale.scale,
            position: position.position,
            rhythm: rhythm.rhythm,
            rhythmPattern: rhythm.pattern,
            notePattern: notePattern.pattern,
        };
        // Log the practice (legacy system)
        const entry = this.repo.logPractice(rhythm, scale, tonality, position, notePattern, key, bpm, npm, reasoning, this.settings.emaAlpha);
        // Update legacy signature progression
        const { expansionNpm, masteryNpm, masteryStreak } = this.settings.progression;
        this.repo.updateProgression(sigId(rhythm), npm, expansionNpm, masteryNpm, masteryStreak);
        this.repo.updateProgression(sigId(scale), npm, expansionNpm, masteryNpm, masteryStreak);
        this.repo.updateProgression(sigId(position), npm, expansionNpm, masteryNpm, masteryStreak);
        this.repo.updateProgression(sigId(notePattern), npm, expansionNpm, masteryNpm, masteryStreak);
        // Update compound stats (including struggling detection)
        const strugglingNpm = this.settings.npmTiers.struggling;
        this.repo.updateCompoundStats(compound, npm, bpm, sessionNumber, this.settings.emaAlpha, expansionNpm, masteryNpm, masteryStreak, strugglingNpm);
        // Check for dimension unlocks
        this.checkDimensionUnlocks();
        // Update streak (using calendar date from the logged entry)
        const practiceDate = entry.loggedAt.slice(0, 10);
        updateStreak(this.repo, practiceDate);
        // Check for new achievements
        const newAchievements = checkAchievements(this.repo);
        // Award streak freezes for mastery achievements
        const masteryAchievements = newAchievements.filter((a) => {
            const def = ACHIEVEMENT_DEFINITIONS.find((d) => d.id === a.achievementId);
            return def?.category === 'mastery';
        });
        if (masteryAchievements.length > 0) {
            this.repo.addStreakFreezes(masteryAchievements.length);
        }
        // Clear suggestion
        this.suggestionStore.clear();
        return entry;
    }
    // ============================================================
    // STRUGGLING DETECTION
    // ============================================================
    // Check if user is struggling and identify proficiencies that may need demotion
    // Returns list of {dimension, value} that have hit the struggling threshold
    getStrugglingProficiencies() {
        const streakThreshold = this.settings.struggling.streakThreshold;
        return this.repo.getStrugglingProficiencies(streakThreshold);
    }
    // Get all compounds where user is struggling
    getStrugglingCompounds() {
        const streakThreshold = this.settings.struggling.streakThreshold;
        const compounds = this.repo.getStrugglingCompounds(streakThreshold);
        return compounds.map((c) => ({
            id: c.id,
            strugglingStreak: c.strugglingStreak,
            scale: c.scale,
            position: c.position,
            rhythm: c.rhythm,
            notePattern: c.notePattern,
        }));
    }
    // Get the NPM tier for a given NPM value
    getNpmTier(npm) {
        const tiers = this.settings.npmTiers;
        if (npm < tiers.struggling)
            return 'struggling';
        if (npm < tiers.developing)
            return 'developing';
        if (npm < tiers.progressing)
            return 'progressing';
        if (npm < tiers.fast)
            return 'fast';
        if (npm < tiers.veryFast)
            return 'veryFast';
        if (npm < tiers.superFast)
            return 'superFast';
        return 'shredding';
    }
    // Remove proficiency for a dimension value
    removeProficiency(dimension, value) {
        this.repo.removeProficient(dimension, value);
    }
}
//# sourceMappingURL=engine.js.map