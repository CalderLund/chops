import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'path';
import { fileURLToPath } from 'url';
import { practiceRoutes } from './routes/practice.js';
import { statsRoutes } from './routes/stats.js';
import { skillsRoutes } from './routes/skills.js';
import { graphRoutes } from './routes/graph.js';
import { usersRoutes } from './routes/users.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function createApp() {
    const app = new Hono();
    // Middleware
    app.use('*', logger());
    app.use('/api/*', cors());
    // API routes
    app.route('/api/practice', practiceRoutes);
    app.route('/api/stats', statsRoutes);
    app.route('/api/skills', skillsRoutes);
    app.route('/api/graph', graphRoutes);
    app.route('/api/users', usersRoutes);
    // Health check
    app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));
    // Serve static files from web/dist in production
    const webDistPath = path.resolve(__dirname, '../../web/dist');
    app.use('/*', serveStatic({ root: webDistPath }));
    // SPA fallback - serve index.html for client-side routing
    app.get('*', serveStatic({ path: path.join(webDistPath, 'index.html') }));
    return app;
}
//# sourceMappingURL=index.js.map