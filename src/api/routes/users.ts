import { Hono } from 'hono';
import { createDatabase, getOrCreateUser, listUsers } from '../../db/schema.js';

export const usersRoutes = new Hono();

// Get database instance (reuse from context would be better, but keeping it simple)
function getDb() {
  return createDatabase();
}

// List all users
usersRoutes.get('/', async (c) => {
  try {
    const db = getDb();
    const users = listUsers(db);

    return c.json({
      success: true,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Create/ensure user exists
usersRoutes.post('/', async (c) => {
  try {
    const db = getDb();
    const body = await c.req.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return c.json({ success: false, error: 'Invalid user name' }, 400);
    }

    const userId = getOrCreateUser(db, name);

    return c.json({
      success: true,
      user: { id: userId, name },
    });
  } catch (error) {
    return c.json({ success: false, error: String(error) }, 500);
  }
});
