import { serve } from '@hono/node-server';
import { createApp } from './api/index.js';

const PORT = parseInt(process.env.CHOPS_PORT || '3847', 10);

const app = createApp();

console.log(`Starting Guitar Teacher server on port ${PORT}...`);

serve(
  {
    fetch: app.fetch,
    port: PORT,
  },
  (info) => {
    console.log(`Server running at http://localhost:${info.port}`);
    console.log(`API available at http://localhost:${info.port}/api`);
  },
);
