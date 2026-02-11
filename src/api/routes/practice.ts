import { Hono } from 'hono';
import { getContext, replayStreaks } from '../context.js';
import { RhythmSig, ScaleSig, PositionSig, NotePatternSig } from '../../types.js';
import { compoundId } from '../../db/compound.js';
import { checkAchievements } from '../../core/achievements.js';

export const practiceRoutes = new Hono();

// Generate a practice suggestion
practiceRoutes.post('/suggest', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { engine } = getContext(user);

    const suggestion = engine.generateCompoundSuggestion();

    return c.json({
      success: true,
      suggestion: {
        rhythm: suggestion.rhythm.rhythm,
        rhythmPattern: suggestion.rhythm.pattern,
        scale: suggestion.scale.scale,
        position: suggestion.position.position,
        notePattern: suggestion.notePattern.pattern,
        key: suggestion.key,
        reasoning: suggestion.reasoning,
        generatedAt: suggestion.generatedAt,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get current suggestion (without generating new one)
practiceRoutes.get('/current', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { engine } = getContext(user);

    const suggestion = engine.getLastSuggestion();

    if (!suggestion) {
      return c.json({ success: true, suggestion: null });
    }

    return c.json({
      success: true,
      suggestion: {
        rhythm: suggestion.rhythm.rhythm,
        rhythmPattern: suggestion.rhythm.pattern,
        scale: suggestion.scale.scale,
        position: suggestion.position.position,
        notePattern: suggestion.notePattern.pattern,
        key: suggestion.key,
        reasoning: suggestion.reasoning,
        generatedAt: suggestion.generatedAt,
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Log a practice session
practiceRoutes.post('/log', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { engine, dimensions } = getContext(user);
    const body = await c.req.json();

    const { bpm, rhythm, rhythmPattern, scale, position, notePattern, key } = body;

    if (typeof bpm !== 'number' || bpm <= 0) {
      return c.json({ success: false, error: 'Invalid BPM' }, 400);
    }

    // If exercise details provided, use them; otherwise use last suggestion
    if (rhythm && scale && position) {
      const rhythmSig: RhythmSig = {
        dimension: 'rhythm',
        rhythm: rhythm,
        pattern: rhythmPattern || dimensions.rhythmDim.getPatternForRhythm(rhythm),
      };
      const scaleSig: ScaleSig = { dimension: 'scale', scale };
      const positionSig: PositionSig = { dimension: 'position', position };
      const notePatternSig: NotePatternSig = {
        dimension: 'note-pattern',
        pattern: notePattern || 'stepwise',
      };

      const entry = engine.logCompoundPractice(
        rhythmSig,
        scaleSig,
        positionSig,
        notePatternSig,
        key || 'C',
        bpm,
      );

      return c.json({
        success: true,
        entry: {
          id: entry.id,
          loggedAt: entry.loggedAt,
          bpm: entry.bpm,
          npm: entry.npm,
          rhythm: entry.rhythm.rhythm,
          rhythmPattern: entry.rhythm.pattern,
          scale: entry.scale.scale,
          position: entry.position.position,
          notePattern: entry.notePattern.pattern,
          key: entry.key,
        },
      });
    } else {
      // Use last suggestion
      const suggestion = engine.getLastSuggestion();
      if (!suggestion) {
        return c.json(
          { success: false, error: 'No suggestion to log. Generate a suggestion first.' },
          400,
        );
      }

      const entry = engine.logCompoundPractice(
        suggestion.rhythm,
        suggestion.scale,
        suggestion.position,
        suggestion.notePattern,
        suggestion.key,
        bpm,
        suggestion.reasoning,
      );

      return c.json({
        success: true,
        entry: {
          id: entry.id,
          loggedAt: entry.loggedAt,
          bpm: entry.bpm,
          npm: entry.npm,
          rhythm: entry.rhythm.rhythm,
          rhythmPattern: entry.rhythm.pattern,
          scale: entry.scale.scale,
          position: entry.position.position,
          notePattern: entry.notePattern.pattern,
          key: entry.key,
        },
      });
    }
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get practice history
practiceRoutes.get('/history', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const limit = parseInt(c.req.query('limit') ?? '20', 10);
    const { repo } = getContext(user);

    const entries = repo.getRecentPractice(limit);

    return c.json({
      success: true,
      entries: entries.map((entry) => ({
        id: entry.id,
        loggedAt: entry.loggedAt,
        bpm: entry.bpm,
        npm: entry.npm,
        rhythm: entry.rhythm.rhythm,
        rhythmPattern: entry.rhythm.pattern,
        scale: entry.scale.scale,
        position: entry.position.position,
        notePattern: entry.notePattern.pattern,
        key: entry.key,
        reasoning: entry.reasoning,
      })),
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get available options for custom exercises
practiceRoutes.get('/options', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { engine } = getContext(user);

    return c.json({
      success: true,
      options: {
        rhythms: engine.getAvailableRhythms(),
        scales: engine.getAvailableScales(),
        positions: engine.getAvailablePositions(),
        notePatterns: engine.getAvailableNotePatterns(),
        keys: engine.getAvailableKeys(),
      },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Update a practice entry
practiceRoutes.put('/history/:id', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const id = parseInt(c.req.param('id'), 10);
    const { repo, dimensions, settings } = getContext(user);
    const body = await c.req.json();

    const { bpm, rhythm, rhythmPattern, scale, position, notePattern, key } = body;

    if (typeof bpm !== 'number' || bpm <= 0) {
      return c.json({ success: false, error: 'Invalid BPM' }, 400);
    }

    const rhythmSig: RhythmSig = {
      dimension: 'rhythm',
      rhythm: rhythm,
      pattern: rhythmPattern || dimensions.rhythmDim.getPatternForRhythm(rhythm),
    };
    const notesPerBeat = dimensions.rhythmDim.getNotesPerBeat(rhythmSig);
    const npm = bpm * notesPerBeat;

    repo.updatePractice(
      id,
      rhythmSig,
      { dimension: 'scale', scale },
      { dimension: 'position', position },
      { dimension: 'note-pattern', pattern: notePattern || 'stepwise' },
      key || 'C',
      bpm,
      npm,
    );

    // Recalculate stats after update
    repo.recalculateAllStats(
      settings.emaAlpha,
      settings.progression.expansionNpm,
      settings.progression.masteryNpm,
      settings.progression.masteryStreak,
      settings.npmTiers.struggling,
    );
    replayStreaks(repo);
    checkAchievements(repo);

    return c.json({ success: true, message: 'Entry updated' });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Delete a practice entry
practiceRoutes.delete('/history/:id', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const id = parseInt(c.req.param('id'), 10);
    const { repo, settings } = getContext(user);

    repo.deletePractice(id);

    // Recalculate stats after delete
    repo.recalculateAllStats(
      settings.emaAlpha,
      settings.progression.expansionNpm,
      settings.progression.masteryNpm,
      settings.progression.masteryStreak,
      settings.npmTiers.struggling,
    );
    replayStreaks(repo);
    checkAchievements(repo);

    return c.json({ success: true, message: 'Entry deleted' });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Get candidate scores and selection probabilities with scoring breakdown
practiceRoutes.get('/candidates', (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { engine, repo } = getContext(user);

    const candidates = engine.generateAllCompoundCandidates();
    const scores = candidates.map((cand) => cand.score);
    const squaredScores = scores.map((s) => s * s);
    const totalSquared = squaredScores.reduce((a, b) => a + b, 0);

    const currentCompound = engine.getCurrentCompound();

    return c.json({
      success: true,
      currentCompound: compoundId(currentCompound),
      candidates: candidates.map((cand, i) => {
        const candidateStats = repo.getCompoundStats(compoundId(cand.compound));

        return {
          compoundId: compoundId(cand.compound),
          score: cand.score,
          probability:
            totalSquared > 0 ? squaredScores[i] / totalSquared : 1 / candidates.length,
          changedDimension: cand.changedDimension ?? 'stay',
          factors: cand.factors,
          recencyBoost: cand.recencyBoost,
          strugglingBoost: cand.strugglingBoost,
          sourceCompoundId: cand.sourceCompoundId,
          stats: candidateStats
            ? {
                attempts: candidateStats.attempts,
                emaNpm: candidateStats.emaNpm,
                hasExpanded: candidateStats.hasExpanded,
                isMastered: candidateStats.isMastered,
                strugglingStreak: candidateStats.strugglingStreak,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Recalculate all stats
practiceRoutes.post('/recalculate', async (c) => {
  try {
    const user = c.req.query('user') ?? 'default';
    const { repo, settings } = getContext(user);

    repo.recalculateAllStats(
      settings.emaAlpha,
      settings.progression.expansionNpm,
      settings.progression.masteryNpm,
      settings.progression.masteryStreak,
      settings.npmTiers.struggling,
    );
    replayStreaks(repo);
    checkAchievements(repo);

    return c.json({ success: true, message: 'Stats recalculated' });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});
