import { Hono } from 'hono';
import { getContext } from '../context.js';
export const skillsRoutes = new Hono();
// Get struggling compounds
skillsRoutes.get('/struggling', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const { engine } = getContext(user);
        const struggling = engine.getStrugglingCompounds();
        return c.json({
            success: true,
            compounds: struggling.map((s) => ({
                id: s.id,
                scale: s.scale,
                position: s.position,
                rhythm: s.rhythm,
                notePattern: s.notePattern,
                strugglingStreak: s.strugglingStreak,
            })),
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
// Get all declared proficiencies
skillsRoutes.get('/proficiencies', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const { repo } = getContext(user);
        const proficiencies = repo.getAllProficiencies();
        return c.json({
            success: true,
            proficiencies: proficiencies.map((p) => ({
                dimension: p.dimension,
                value: p.value,
                declaredAt: p.declaredAt,
            })),
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
// Add a proficiency
skillsRoutes.post('/proficiencies', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const { repo } = getContext(user);
        const body = await c.req.json();
        const { dimension, value } = body;
        if (!dimension || !value) {
            return c.json({ success: false, error: 'Missing dimension or value' }, 400);
        }
        repo.setProficient(dimension, value);
        return c.json({
            success: true,
            message: `Marked proficient in ${dimension}: ${value}`,
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
// Remove a proficiency
skillsRoutes.delete('/proficiencies', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const { repo } = getContext(user);
        const body = await c.req.json();
        const { dimension, value } = body;
        if (!dimension || !value) {
            return c.json({ success: false, error: 'Missing dimension or value' }, 400);
        }
        repo.removeProficient(dimension, value);
        return c.json({
            success: true,
            message: `Removed proficiency in ${dimension}: ${value}`,
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
// Manually expand a compound
skillsRoutes.post('/expand', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const { repo } = getContext(user);
        const body = await c.req.json();
        const { compoundId } = body;
        if (!compoundId) {
            return c.json({ success: false, error: 'Missing compoundId' }, 400);
        }
        // Try to expand existing compound first
        let success = repo.setCompoundExpanded(compoundId, true);
        // If compound doesn't exist, create it first
        if (!success) {
            // Parse compound ID: scale+position+rhythm:pattern+notePattern
            // Example: "pentatonic+E+8ths:xx+stepwise"
            const parts = compoundId.split('+');
            if (parts.length < 3) {
                return c.json({ success: false, error: 'Invalid compound ID format' }, 400);
            }
            const scale = parts[0];
            const position = parts[1];
            const rhythmPart = parts[2]; // "8ths:xx" or "8ths:xx+stepwise"
            // Handle note pattern which comes after rhythm:pattern
            let rhythm;
            let rhythmPattern;
            let notePattern = null;
            if (rhythmPart.includes(':')) {
                const [r, rest] = rhythmPart.split(':');
                rhythm = r;
                rhythmPattern = rest;
            }
            else {
                rhythm = rhythmPart;
                rhythmPattern = 'xx';
            }
            // Check if there's a note pattern (4th part)
            if (parts.length >= 4) {
                notePattern = parts.slice(3).join('+');
            }
            // Create the compound stats entry
            const compound = {
                scale,
                position,
                rhythm,
                rhythmPattern,
                notePattern: notePattern ?? undefined,
                articulation: undefined,
            };
            repo.getOrCreateCompoundStats(compound);
            success = repo.setCompoundExpanded(compoundId, true);
        }
        if (!success) {
            return c.json({ success: false, error: 'Failed to expand compound' }, 500);
        }
        return c.json({
            success: true,
            message: `Expanded compound: ${compoundId}`,
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
// Manually unexpand a compound
skillsRoutes.post('/unexpand', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const { repo } = getContext(user);
        const body = await c.req.json();
        const { compoundId } = body;
        if (!compoundId) {
            return c.json({ success: false, error: 'Missing compoundId' }, 400);
        }
        const success = repo.setCompoundExpanded(compoundId, false);
        if (!success) {
            return c.json({ success: false, error: 'Compound not found' }, 404);
        }
        return c.json({
            success: true,
            message: `Unexpanded compound: ${compoundId}`,
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
// Get struggling proficiencies (proficiencies where user is struggling)
skillsRoutes.get('/struggling-proficiencies', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const { engine } = getContext(user);
        const strugglingProficiencies = engine.getStrugglingProficiencies();
        return c.json({
            success: true,
            proficiencies: strugglingProficiencies.map((p) => ({
                dimension: p.dimension,
                value: p.value,
                compoundId: p.compoundId,
                streak: p.streak,
            })),
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
//# sourceMappingURL=skills.js.map