import {
  RhythmSig,
  ScaleSig,
  PositionSig,
  NotePatternSig,
  Settings,
  Compound,
  CompoundStats,
  sigId,
  DEFAULT_SETTINGS,
} from '../types.js';
import { Repository, PracticeEntry } from '../db/repository.js';
import { RhythmDimension } from '../dimensions/rhythm/index.js';
import { ScaleDimension } from '../dimensions/scale/index.js';
import { PositionDimension } from '../dimensions/position/index.js';
import { NotePatternDimension } from '../dimensions/note-pattern/index.js';
import { DimensionRegistry } from '../dimensions/registry.js';
import { scoreCandidate, weightedRandomSelect, ScoringContext } from './scoring.js';
import {
  scoreCompoundCandidate,
  weightedRandomSelectCompound,
  CompoundScoringContext,
  calculateConsolidationScore,
  calculateStalenessScore,
  calculateReadinessScore,
  calculateDiversityScore,
} from './compound-scoring.js';
import { bpmToNpm } from './normalizer.js';
import { Suggestion, SuggestionStore, FileSuggestionStore } from '../db/suggestion.js';
import {
  compoundId,
  compoundsEqual,
  countDimensionChanges,
  getChangedDimension,
  statsToCompound,
} from '../db/compound.js';
import { updateStreak } from './streaks.js';
import { checkAchievements, ACHIEVEMENT_DEFINITIONS } from './achievements.js';

export interface Candidate {
  rhythm: RhythmSig;
  scale: ScaleSig;
  position: PositionSig;
  notePattern: NotePatternSig;
}

export interface CompoundCandidateFactors {
  consolidation: { raw: number; weighted: number };
  staleness: { raw: number; weighted: number };
  readiness: { raw: number; weighted: number };
  diversity: { raw: number; weighted: number };
}

export interface CompoundCandidate {
  compound: Compound;
  score: number;
  factors: CompoundCandidateFactors;
  recencyBoost: number;
  strugglingBoost: number;
  sourceCompoundId: string;
  changedDimension: string | null;
}

export class Engine {
  private suggestionStore: SuggestionStore;
  private rhythmDim: RhythmDimension;
  private scaleDim: ScaleDimension;
  private positionDim: PositionDimension;
  private notePatternDim: NotePatternDimension;
  private _registry: DimensionRegistry;
  private settings: Settings;
  private randomFn: () => number;
  private repo: Repository;

  constructor(
    repo: Repository,
    registryOrRhythm: DimensionRegistry | RhythmDimension,
    scaleOrSettings?: ScaleDimension | Settings,
    positionOrRandom?: PositionDimension | (() => number),
    notePatternOrStore?: NotePatternDimension | SuggestionStore,
    settingsOrUndef?: Settings,
    randomFnOrUndef?: () => number,
    suggestionStoreOrUndef?: SuggestionStore,
  ) {
    this.repo = repo;

    if (registryOrRhythm instanceof DimensionRegistry) {
      // New API: Engine(repo, registry, settings?, randomFn?, suggestionStore?)
      this._registry = registryOrRhythm;
      this.rhythmDim = this._registry.rhythmDim;
      this.scaleDim = this._registry.scaleDim;
      this.positionDim = this._registry.positionDim;
      this.notePatternDim = this._registry.notePatternDim;
      this.settings = (scaleOrSettings as Settings | undefined) ?? DEFAULT_SETTINGS;
      this.randomFn = (positionOrRandom as (() => number) | undefined) ?? Math.random;
      this.suggestionStore =
        (notePatternOrStore as SuggestionStore | undefined) ?? new FileSuggestionStore();
    } else {
      // Legacy API: Engine(repo, rhythmDim, scaleDim, positionDim, notePatternDim, settings?, randomFn?, suggestionStore?)
      this.rhythmDim = registryOrRhythm;
      this.scaleDim = scaleOrSettings as ScaleDimension;
      this.positionDim = positionOrRandom as PositionDimension;
      this.notePatternDim = notePatternOrStore as NotePatternDimension;
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
  get registry(): DimensionRegistry {
    return this._registry;
  }

  // Generate a suggestion (does NOT save to DB)
  generateSuggestion(): Suggestion {
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
      ? [
          {
            rhythm: previousRhythm,
            scale: previousScale,
            position: previousPosition,
            notePattern: previousNotePattern,
          },
        ]
      : this.generateCandidates(
          previousRhythm,
          previousScale,
          previousPosition,
          previousNotePattern,
        );

    // Score each candidate
    const now = new Date();
    const scoredCandidates = candidates.map((c) => {
      const context: ScoringContext = {
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
    const selected = weightedRandomSelect(
      scoredCandidates,
      scoredCandidates.map((c) => c.score),
      this.randomFn,
    );

    // Pick a random key
    const key = this.settings.keys[Math.floor(this.randomFn() * this.settings.keys.length)];

    // Generate reasoning
    const reasoning = this.generateReasoning(
      selected.rhythm,
      selected.scale,
      selected.position,
      selected.notePattern,
      previousRhythm,
      previousScale,
      previousPosition,
      previousNotePattern,
    );

    const suggestion: Suggestion = {
      rhythm: selected.rhythm,
      scale: selected.scale,
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
  getLastSuggestion(): Suggestion | null {
    return this.suggestionStore.load();
  }

  // Log a practice session
  logPractice(
    rhythm: RhythmSig,
    scale: ScaleSig,
    position: PositionSig,
    notePattern: NotePatternSig,
    key: string,
    bpm: number,
    reasoning: string | null = null,
  ): PracticeEntry {
    const notesPerBeat = this.rhythmDim.getNotesPerBeat(rhythm);
    const npm = bpmToNpm(bpm, notesPerBeat);

    const entry = this.repo.logPractice(
      rhythm,
      scale,
      position,
      notePattern,
      key,
      bpm,
      npm,
      reasoning,
      this.settings.emaAlpha,
    );

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
  logLastSuggestion(bpm: number): PracticeEntry {
    const suggestion = this.suggestionStore.load();
    if (!suggestion) {
      throw new Error('No suggestion to log. Run "chops" first to get a suggestion.');
    }

    return this.logPractice(
      suggestion.rhythm,
      suggestion.scale,
      suggestion.position,
      suggestion.notePattern,
      suggestion.key,
      bpm,
      suggestion.reasoning,
    );
  }

  private generateCandidates(
    previousRhythm: RhythmSig,
    previousScale: ScaleSig,
    previousPosition: PositionSig,
    previousNotePattern: NotePatternSig,
  ): Candidate[] {
    const candidates: Candidate[] = [];

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
      const fallbackCandidate = this.generateUnmasteredCandidate(
        previousRhythm,
        previousScale,
        previousPosition,
        previousNotePattern,
      );
      candidates.push(fallbackCandidate);
    }

    return candidates;
  }

  // Check if a single signature is mastered
  private isSignatureMastered(signatureId: string): boolean {
    const stats = this.repo.getStats(signatureId);
    return stats?.isMastered ?? false;
  }

  // Check if any signature in a candidate is mastered
  private isCandidateMastered(candidate: Candidate): boolean {
    // Mastered signatures should not appear in suggestions at all
    return (
      this.isSignatureMastered(sigId(candidate.rhythm)) ||
      this.isSignatureMastered(sigId(candidate.scale)) ||
      this.isSignatureMastered(sigId(candidate.position)) ||
      this.isSignatureMastered(sigId(candidate.notePattern))
    );
  }

  // Generate a candidate with unmastered signatures for each dimension
  // Used when all 1-dimension-change candidates are filtered out
  private generateUnmasteredCandidate(
    previousRhythm: RhythmSig,
    previousScale: ScaleSig,
    previousPosition: PositionSig,
    previousNotePattern: NotePatternSig,
  ): Candidate {
    // For each dimension, find the first unmastered signature
    // Priority: current -> neighbors -> entry point -> any unmastered
    const rhythm = this.findUnmasteredRhythm(previousRhythm);
    const scale = this.findUnmasteredScale(previousScale);
    const position = this.findUnmasteredPosition(previousPosition);
    const notePattern = this.findUnmasteredNotePattern(previousNotePattern);

    return { rhythm, scale, position, notePattern };
  }

  private findUnmasteredRhythm(current: RhythmSig): RhythmSig {
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

  private findUnmasteredScale(current: ScaleSig): ScaleSig {
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

  private findUnmasteredPosition(current: PositionSig): PositionSig {
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

  private findUnmasteredNotePattern(current: NotePatternSig): NotePatternSig {
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

  private generateReasoning(
    rhythm: RhythmSig,
    scale: ScaleSig,
    position: PositionSig,
    notePattern: NotePatternSig,
    previousRhythm: RhythmSig,
    previousScale: ScaleSig,
    previousPosition: PositionSig,
    previousNotePattern: NotePatternSig,
  ): string {
    const rhythmChanged =
      rhythm.rhythm !== previousRhythm.rhythm || rhythm.pattern !== previousRhythm.pattern;
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
      if (
        !previousRhythmStats ||
        previousRhythmStats.attempts < this.settings.stability.minAttempts
      ) {
        return `Repeating to consolidate - rhythm needs more practice`;
      }
      if (
        !previousScaleStats ||
        previousScaleStats.attempts < this.settings.stability.minAttempts
      ) {
        return `Repeating to consolidate - scale needs more practice`;
      }
      if (
        !previousPositionStats ||
        previousPositionStats.attempts < this.settings.stability.minAttempts
      ) {
        return `Repeating to consolidate - position needs more practice`;
      }
      if (
        !previousNotePatternStats ||
        previousNotePatternStats.attempts < this.settings.stability.minAttempts
      ) {
        return `Repeating to consolidate - note pattern needs more practice`;
      }
      return `Repeating to consolidate - building consistency`;
    }

    if (rhythmChanged) {
      const what = rhythm.rhythm !== previousRhythm.rhythm ? 'rhythm' : 'pattern';
      if (!rhythmStats || rhythmStats.attempts === 0) {
        return `Exploring new ${what} - never tried before`;
      }
      if (
        previousRhythmStats &&
        previousRhythmStats.attempts >= this.settings.stability.minAttempts
      ) {
        return `Stepping up ${what} - ${this.rhythmDim.describe(previousRhythm)} is stable`;
      }
      return `Trying ${what} - ${this.rhythmDim.describe(previousRhythm)} progressing`;
    }

    if (scaleChanged) {
      if (!scaleStats || scaleStats.attempts === 0) {
        return `Exploring new scale - never tried before`;
      }
      if (
        previousScaleStats &&
        previousScaleStats.attempts >= this.settings.stability.minAttempts
      ) {
        return `Stepping up scale - ${this.scaleDim.describe(previousScale)} is stable`;
      }
      return `Trying scale - ${this.scaleDim.describe(previousScale)} progressing`;
    }

    if (positionChanged) {
      if (!positionStats || positionStats.attempts === 0) {
        return `Exploring new position - never tried before`;
      }
      if (
        previousPositionStats &&
        previousPositionStats.attempts >= this.settings.stability.minAttempts
      ) {
        return `Stepping up position - ${this.positionDim.describe(previousPosition)} is stable`;
      }
      return `Trying position - ${this.positionDim.describe(previousPosition)} progressing`;
    }

    if (notePatternChanged) {
      if (!notePatternStats || notePatternStats.attempts === 0) {
        return `Exploring new note pattern - never tried before`;
      }
      if (
        previousNotePatternStats &&
        previousNotePatternStats.attempts >= this.settings.stability.minAttempts
      ) {
        return `Stepping up note pattern - ${this.notePatternDim.describe(previousNotePattern)} is stable`;
      }
      return `Trying note pattern - ${this.notePatternDim.describe(previousNotePattern)} progressing`;
    }

    return `Practice suggestion`;
  }

  // Get available rhythms for interactive mode
  getAvailableRhythms(): string[] {
    return this.rhythmDim.getAvailableRhythms();
  }

  // Get pattern for a rhythm (for interactive mode)
  getPatternForRhythm(rhythmId: string): string {
    return this.rhythmDim.getPatternForRhythm(rhythmId);
  }

  // Get available scales for interactive mode
  getAvailableScales(): string[] {
    return this.scaleDim.getAvailableScales();
  }

  // Get available positions for interactive mode
  getAvailablePositions(): string[] {
    return this.positionDim.getAvailablePositions();
  }

  // Get available note patterns for interactive mode
  getAvailableNotePatterns(): string[] {
    return this.notePatternDim.getAvailablePatterns();
  }

  // Get available keys
  getAvailableKeys(): string[] {
    return this.settings.keys;
  }

  // ============================================================
  // COMPOUND-BASED PROGRESSION SYSTEM
  // ============================================================

  // Check and perform dimension unlocks
  checkDimensionUnlocks(): string[] {
    const unlocked: string[] = [];
    const currentSession = this.repo.getCurrentSession();

    for (const dimConfig of this.settings.dimensionTiers) {
      // Skip tier 0 (always available)
      if (dimConfig.tier === 0) continue;

      // Skip if already unlocked
      if (this.repo.isDimensionUnlocked(dimConfig.name)) continue;

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
  getCurrentCompound(): Compound {
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
  generateCompoundCandidates(current: Compound): CompoundCandidate[] {
    const candidates: CompoundCandidate[] = [];
    const currentStats = this.repo.getCompoundStats(compoundId(current));
    const currentSession = this.repo.getCurrentSession();
    const recentChanges = this.repo.getRecentDimensionChanges(3);
    const currentCid = compoundId(current);

    // Check which dimensions are unlocked
    const notePatternUnlocked = this.repo.isDimensionUnlocked('note-pattern');

    // Option 1: STAY (repeat current compound)
    const stayCandidate = { ...current };
    if (!currentStats?.isMastered) {
      const stayContext = this.buildCompoundScoringContext(
        stayCandidate,
        current,
        currentStats,
        currentSession,
        recentChanges,
      );
      candidates.push(
        this.buildEnrichedCandidate(stayCandidate, stayContext, currentCid, current, 0, 0),
      );
    }

    // Only generate tier-0 neighbor candidates if current compound is expanded
    if (currentStats?.hasExpanded) {
      // Option 2: Change scale
      const scaleNeighbors = this.scaleDim.getNeighbors({
        dimension: 'scale',
        scale: current.scale,
      });
      for (const neighbor of scaleNeighbors) {
        const candidate: Compound = { ...current, scale: neighbor.scale };
        if (!this.isCompoundMastered(candidate)) {
          const context = this.buildCompoundScoringContext(
            candidate,
            current,
            currentStats,
            currentSession,
            recentChanges,
          );
          candidates.push(
            this.buildEnrichedCandidate(candidate, context, currentCid, current, 0, 0),
          );
        }
      }

      // Option 3: Change position
      const positionNeighbors = this.positionDim.getNeighbors({
        dimension: 'position',
        position: current.position,
      });
      for (const neighbor of positionNeighbors) {
        const candidate: Compound = { ...current, position: neighbor.position };
        if (!this.isCompoundMastered(candidate)) {
          const context = this.buildCompoundScoringContext(
            candidate,
            current,
            currentStats,
            currentSession,
            recentChanges,
          );
          candidates.push(
            this.buildEnrichedCandidate(candidate, context, currentCid, current, 0, 0),
          );
        }
      }

      // Option 4: Change rhythm
      const rhythmNeighbors = this.rhythmDim.getNeighbors({
        dimension: 'rhythm',
        rhythm: current.rhythm,
        pattern: current.rhythmPattern,
      });
      for (const neighbor of rhythmNeighbors) {
        const candidate: Compound = {
          ...current,
          rhythm: neighbor.rhythm,
          rhythmPattern: neighbor.pattern,
        };
        if (!this.isCompoundMastered(candidate)) {
          const context = this.buildCompoundScoringContext(
            candidate,
            current,
            currentStats,
            currentSession,
            recentChanges,
          );
          candidates.push(
            this.buildEnrichedCandidate(candidate, context, currentCid, current, 0, 0),
          );
        }
      }
    }

    // Higher-tier dimensions: gated by dimension unlock, not compound expansion
    if (notePatternUnlocked && current.notePattern) {
      const notePatternNeighbors = this.notePatternDim.getNeighbors({
        dimension: 'note-pattern',
        pattern: current.notePattern,
      });
      for (const neighbor of notePatternNeighbors) {
        const candidate: Compound = { ...current, notePattern: neighbor.pattern };
        if (!this.isCompoundMastered(candidate)) {
          const context = this.buildCompoundScoringContext(
            candidate,
            current,
            currentStats,
            currentSession,
            recentChanges,
          );
          candidates.push(
            this.buildEnrichedCandidate(candidate, context, currentCid, current, 0, 0),
          );
        }
      }
    }

    // If no candidates (everything mastered), fall back to entry point
    if (candidates.length === 0) {
      const entryCompound = this.getCurrentCompound();
      const fallbackContext = this.buildCompoundScoringContext(
        entryCompound,
        current,
        currentStats,
        currentSession,
        recentChanges,
      );
      candidates.push(
        this.buildEnrichedCandidate(entryCompound, fallbackContext, currentCid, current, 0, 0),
      );
    }

    return candidates;
  }

  // Generate candidates from ALL practiced compounds, not just the last one
  // This allows the algorithm to suggest revisiting any branch of the skill tree
  generateAllCompoundCandidates(): CompoundCandidate[] {
    const allCandidates: CompoundCandidate[] = [];
    const currentSession = this.repo.getCurrentSession();
    const recentChanges = this.repo.getRecentDimensionChanges(3);
    const currentCompound = this.getCurrentCompound();
    const currentCompoundStats = this.repo.getCompoundStats(compoundId(currentCompound));

    // Get all practiced compounds
    const allStats = this.repo.getAllCompoundStats();
    const practicedCompounds = allStats.filter((s) => s.attempts > 0);

    // Check which dimensions are unlocked
    const notePatternUnlocked = this.repo.isDimensionUnlocked('note-pattern');

    // If no practiced compounds yet, use the entry point
    if (practicedCompounds.length === 0) {
      const cid = compoundId(currentCompound);
      return [
        {
          compound: currentCompound,
          score: 1.0,
          factors: {
            consolidation: { raw: 0, weighted: 0 },
            staleness: { raw: 0, weighted: 0 },
            readiness: { raw: 0, weighted: 0 },
            diversity: { raw: 0, weighted: 0 },
          },
          recencyBoost: 0,
          strugglingBoost: 0,
          sourceCompoundId: cid,
          changedDimension: null,
        },
      ];
    }

    // For each practiced compound, generate candidates
    for (const stats of practicedCompounds) {
      const compound = statsToCompound(stats);
      const sourceCid = compoundId(compound);

      // Calculate recency/neglected factors for this compound
      const sessionsSincePractice = currentSession - (stats.lastPracticedSession ?? 0);
      const recencyBoost = this.calculateRecencyBoost(
        sessionsSincePractice,
        practicedCompounds.length,
      );
      const strugglingBoost = stats.strugglingStreak > 0 ? 0.5 : 0;

      // Option 1: STAY (repeat this compound) - if not mastered
      if (!stats.isMastered) {
        // Score STAY against the global current compound, not the source.
        // This prevents non-current compounds from getting inflated consolidation
        // (e.g., an old unexpanded compound getting consolidation=1.0 just because
        // the student touched it once and moved on to harder material).
        const stayContext = this.buildCompoundScoringContext(
          compound,
          currentCompound,
          currentCompoundStats,
          currentSession,
          recentChanges,
        );
        allCandidates.push(
          this.buildEnrichedCandidate(
            compound,
            stayContext,
            sourceCid,
            currentCompound,
            recencyBoost,
            strugglingBoost,
          ),
        );
      }

      // Only generate tier-0 neighbor candidates if this compound is expanded.
      // Expansion gates exploration of scale/position/rhythm to prevent premature
      // branching before the student has consolidated the current compound.
      if (stats.hasExpanded) {
        // Change scale
        const scaleNeighbors = this.scaleDim.getNeighbors({
          dimension: 'scale',
          scale: compound.scale,
        });
        for (const neighbor of scaleNeighbors) {
          const candidate: Compound = { ...compound, scale: neighbor.scale };
          if (!this.isCompoundMastered(candidate)) {
            const context = this.buildCompoundScoringContext(
              candidate,
              compound,
              stats,
              currentSession,
              recentChanges,
            );
            allCandidates.push(
              this.buildEnrichedCandidate(
                candidate,
                context,
                sourceCid,
                currentCompound,
                recencyBoost,
                0,
              ),
            );
          }
        }

        // Change position
        const positionNeighbors = this.positionDim.getNeighbors({
          dimension: 'position',
          position: compound.position,
        });
        for (const neighbor of positionNeighbors) {
          const candidate: Compound = { ...compound, position: neighbor.position };
          if (!this.isCompoundMastered(candidate)) {
            const context = this.buildCompoundScoringContext(
              candidate,
              compound,
              stats,
              currentSession,
              recentChanges,
            );
            allCandidates.push(
              this.buildEnrichedCandidate(
                candidate,
                context,
                sourceCid,
                currentCompound,
                recencyBoost,
                0,
              ),
            );
          }
        }

        // Change rhythm
        const rhythmNeighbors = this.rhythmDim.getNeighbors({
          dimension: 'rhythm',
          rhythm: compound.rhythm,
          pattern: compound.rhythmPattern,
        });
        for (const neighbor of rhythmNeighbors) {
          const candidate: Compound = {
            ...compound,
            rhythm: neighbor.rhythm,
            rhythmPattern: neighbor.pattern,
          };
          if (!this.isCompoundMastered(candidate)) {
            const context = this.buildCompoundScoringContext(
              candidate,
              compound,
              stats,
              currentSession,
              recentChanges,
            );
            allCandidates.push(
              this.buildEnrichedCandidate(
                candidate,
                context,
                sourceCid,
                currentCompound,
                recencyBoost,
                0,
              ),
            );
          }
        }
      }

      // Higher-tier dimensions (note-pattern, articulation) are gated by
      // dimension unlock, NOT by compound expansion. Once the dimension is
      // unlocked the student should be able to explore it on any practiced
      // compound — the unlock itself already proves sufficient mastery.
      if (notePatternUnlocked && compound.notePattern) {
        const notePatternNeighbors = this.notePatternDim.getNeighbors({
          dimension: 'note-pattern',
          pattern: compound.notePattern,
        });
        for (const neighbor of notePatternNeighbors) {
          const candidate: Compound = { ...compound, notePattern: neighbor.pattern };
          if (!this.isCompoundMastered(candidate)) {
            const context = this.buildCompoundScoringContext(
              candidate,
              compound,
              stats,
              currentSession,
              recentChanges,
            );
            allCandidates.push(
              this.buildEnrichedCandidate(
                candidate,
                context,
                sourceCid,
                currentCompound,
                recencyBoost,
                0,
              ),
            );
          }
        }
      }
    }

    // Deduplicate candidates by compound ID, keeping the highest score
    const deduped = this.deduplicateCandidates(allCandidates);

    // Enforce 1-dimension-change invariant: only keep candidates within
    // 1 dimension change of the current compound (last practice)
    const filtered = deduped.filter(
      (c) => countDimensionChanges(currentCompound, c.compound) <= 1,
    );

    // If no candidates (everything mastered or filtered), fall back to entry point
    if (filtered.length === 0) {
      const cid = compoundId(currentCompound);
      return [
        {
          compound: currentCompound,
          score: 1.0,
          factors: {
            consolidation: { raw: 0, weighted: 0 },
            staleness: { raw: 0, weighted: 0 },
            readiness: { raw: 0, weighted: 0 },
            diversity: { raw: 0, weighted: 0 },
          },
          recencyBoost: 0,
          strugglingBoost: 0,
          sourceCompoundId: cid,
          changedDimension: null,
        },
      ];
    }

    return filtered;
  }

  // Calculate recency boost: compounds not practiced recently get a boost
  // to encourage revisiting neglected branches
  private calculateRecencyBoost(sessionsSince: number, totalCompounds: number): number {
    // If only 1-2 compounds practiced, don't penalize recency as much
    if (totalCompounds <= 2) {
      return 0;
    }
    // Boost increases with sessions since practice, capped at 0.5
    // After 5 sessions without practice, gets max boost
    return Math.min(sessionsSince / 10, 0.5);
  }

  // Deduplicate candidates by compound ID, keeping the one with highest score
  private deduplicateCandidates(candidates: CompoundCandidate[]): CompoundCandidate[] {
    const byId = new Map<string, CompoundCandidate>();
    for (const candidate of candidates) {
      const id = compoundId(candidate.compound);
      const existing = byId.get(id);
      if (!existing || candidate.score > existing.score) {
        byId.set(id, candidate);
      }
    }
    return Array.from(byId.values());
  }

  private buildCompoundScoringContext(
    candidate: Compound,
    current: Compound,
    currentStats: CompoundStats | null,
    currentSession: number,
    recentChanges: string[],
  ): CompoundScoringContext {
    return {
      currentCompound: current,
      currentStats,
      candidateStats: this.repo.getCompoundStats(compoundId(candidate)),
      relatedStats: this.repo.getRelatedCompounds(candidate),
      currentSession,
      recentDimensionChanges: recentChanges,
      config: this.settings.compoundScoring,
      expansionNpm: this.settings.progression.expansionNpm,
      masteryNpm: this.settings.progression.masteryNpm,
    };
  }

  private buildEnrichedCandidate(
    candidate: Compound,
    context: CompoundScoringContext,
    sourceCompoundId: string,
    currentCompound: Compound,
    recencyBoost: number,
    strugglingBoost: number,
  ): CompoundCandidate {
    const config = context.config;
    const consolidation = calculateConsolidationScore(
      candidate,
      context.currentCompound,
      context.currentStats,
      context.masteryNpm,
    );
    const staleness = calculateStalenessScore(
      context.candidateStats,
      context.currentSession,
      config.stalenessSessions,
    );
    const readiness = calculateReadinessScore(
      candidate,
      context.candidateStats,
      context.relatedStats,
      config.transferCoefficients,
      context.expansionNpm,
    );
    const diversity = calculateDiversityScore(
      candidate,
      context.currentCompound,
      context.recentDimensionChanges,
    );

    const baseScore = scoreCompoundCandidate(candidate, context);

    return {
      compound: candidate,
      score: baseScore + recencyBoost + strugglingBoost,
      factors: {
        consolidation: { raw: consolidation, weighted: config.consolidationWeight * consolidation },
        staleness: { raw: staleness, weighted: config.stalenessWeight * staleness },
        readiness: { raw: readiness, weighted: config.readinessWeight * readiness },
        diversity: { raw: diversity, weighted: config.diversityWeight * diversity },
      },
      recencyBoost,
      strugglingBoost,
      sourceCompoundId,
      changedDimension: getChangedDimension(currentCompound, candidate),
    };
  }

  private isCompoundMastered(compound: Compound): boolean {
    const stats = this.repo.getCompoundStats(compoundId(compound));
    return stats?.isMastered ?? false;
  }

  // Generate suggestion using compound system
  // Now considers ALL practiced compounds, not just the last one
  generateCompoundSuggestion(): Suggestion {
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
    const selected = weightedRandomSelectCompound(
      candidates.map((c) => c.compound),
      candidates.map((c) => c.score),
      this.randomFn,
    );

    // Convert compound to suggestion format
    const rhythm: RhythmSig = {
      dimension: 'rhythm',
      rhythm: selected.rhythm,
      pattern: selected.rhythmPattern,
    };
    const scale: ScaleSig = { dimension: 'scale', scale: selected.scale };
    const position: PositionSig = { dimension: 'position', position: selected.position };
    const notePattern: NotePatternSig = {
      dimension: 'note-pattern',
      pattern: selected.notePattern ?? this.notePatternDim.getEntryPoint().pattern,
    };

    // Pick a random key
    const key = this.settings.keys[Math.floor(this.randomFn() * this.settings.keys.length)];

    // Generate reasoning
    const reasoning = this.generateCompoundReasoning(selected, currentCompound, newUnlocks);

    const suggestion: Suggestion = {
      rhythm,
      scale,
      position,
      notePattern,
      key,
      reasoning,
      generatedAt: new Date().toISOString(),
    };

    this.suggestionStore.save(suggestion);
    return suggestion;
  }

  private generateCompoundReasoning(
    selected: Compound,
    current: Compound,
    newUnlocks: string[],
  ): string {
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
  logCompoundPractice(
    rhythm: RhythmSig,
    scale: ScaleSig,
    position: PositionSig,
    notePattern: NotePatternSig,
    key: string,
    bpm: number,
    reasoning: string | null = null,
  ): PracticeEntry {
    const notesPerBeat = this.rhythmDim.getNotesPerBeat(rhythm);
    const npm = bpmToNpm(bpm, notesPerBeat);

    // Increment session counter
    const sessionNumber = this.repo.incrementSession();

    // Always build full compound for tracking (regardless of unlock status)
    // The "lock" only affects recommendations, not tracking
    const compound: Compound = {
      scale: scale.scale,
      position: position.position,
      rhythm: rhythm.rhythm,
      rhythmPattern: rhythm.pattern,
      notePattern: notePattern.pattern,
    };

    // Log the practice (legacy system)
    const entry = this.repo.logPractice(
      rhythm,
      scale,
      position,
      notePattern,
      key,
      bpm,
      npm,
      reasoning,
      this.settings.emaAlpha,
    );

    // Update legacy signature progression
    const { expansionNpm, masteryNpm, masteryStreak } = this.settings.progression;
    this.repo.updateProgression(sigId(rhythm), npm, expansionNpm, masteryNpm, masteryStreak);
    this.repo.updateProgression(sigId(scale), npm, expansionNpm, masteryNpm, masteryStreak);
    this.repo.updateProgression(sigId(position), npm, expansionNpm, masteryNpm, masteryStreak);
    this.repo.updateProgression(sigId(notePattern), npm, expansionNpm, masteryNpm, masteryStreak);

    // Update compound stats (including struggling detection)
    const strugglingNpm = this.settings.npmTiers.struggling;
    this.repo.updateCompoundStats(
      compound,
      npm,
      bpm,
      sessionNumber,
      this.settings.emaAlpha,
      expansionNpm,
      masteryNpm,
      masteryStreak,
      strugglingNpm,
    );

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
  getStrugglingProficiencies(): Array<{
    dimension: string;
    value: string;
    compoundId: string;
    streak: number;
  }> {
    const streakThreshold = this.settings.struggling.streakThreshold;
    return this.repo.getStrugglingProficiencies(streakThreshold);
  }

  // Get all compounds where user is struggling
  getStrugglingCompounds(): Array<{
    id: string;
    strugglingStreak: number;
    scale: string;
    position: string;
    rhythm: string;
    notePattern: string | null;
  }> {
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
  getNpmTier(npm: number): string {
    const tiers = this.settings.npmTiers;
    if (npm < tiers.struggling) return 'struggling';
    if (npm < tiers.developing) return 'developing';
    if (npm < tiers.progressing) return 'progressing';
    if (npm < tiers.fast) return 'fast';
    if (npm < tiers.veryFast) return 'veryFast';
    if (npm < tiers.superFast) return 'superFast';
    return 'shredding';
  }

  // Remove proficiency for a dimension value
  removeProficiency(dimension: string, value: string): void {
    this.repo.removeProficient(dimension, value);
  }
}
