import { Hono } from 'hono';
import { getContext } from '../context.js';
import { buildGraph, buildExpandedGraph } from '../services/graph-builder.js';
export const graphRoutes = new Hono();
// Get graph layout (practiced compounds only)
graphRoutes.get('/layout', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const expanded = c.req.query('expanded') === 'true';
        const { repo, settings, dimensions } = getContext(user);
        const graph = expanded
            ? buildExpandedGraph(repo, settings, dimensions)
            : buildGraph(repo, settings, dimensions);
        return c.json({
            success: true,
            ...graph,
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
// Get stats for a specific compound node
graphRoutes.get('/node/:id', async (c) => {
    try {
        const user = c.req.query('user') ?? 'default';
        const compoundId = c.req.param('id');
        const { repo, engine } = getContext(user);
        const stats = repo.getCompoundStats(compoundId);
        if (!stats) {
            return c.json({
                success: true,
                node: {
                    id: compoundId,
                    exists: false,
                    attempts: 0,
                    bestNpm: 0,
                    emaNpm: 0,
                },
            });
        }
        return c.json({
            success: true,
            node: {
                id: stats.id,
                exists: true,
                scale: stats.scale,
                position: stats.position,
                rhythm: stats.rhythm,
                rhythmPattern: stats.rhythmPattern,
                notePattern: stats.notePattern,
                bestNpm: stats.bestNpm,
                emaNpm: stats.emaNpm,
                attempts: stats.attempts,
                hasExpanded: stats.hasExpanded,
                masteryStreak: stats.masteryStreak,
                isMastered: stats.isMastered,
                strugglingStreak: stats.strugglingStreak,
                lastPracticed: stats.lastPracticed,
                tier: engine.getNpmTier(stats.emaNpm),
            },
        });
    }
    catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});
//# sourceMappingURL=graph.js.map