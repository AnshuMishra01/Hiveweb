require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Create table on startup ─────────────────────────────

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leaderboard (
      id SERIAL PRIMARY KEY,
      name VARCHAR(16) NOT NULL UNIQUE,
      score INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      stars INTEGER NOT NULL DEFAULT 0,
      iq INTEGER NOT NULL DEFAULT 100,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // Add unique constraint if table already existed without it
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leaderboard_name_key'
      ) THEN
        ALTER TABLE leaderboard ADD CONSTRAINT leaderboard_name_key UNIQUE (name);
      END IF;
    END $$;
  `).catch(() => {});
  console.log('Database ready');
}

// ── API Routes ──────────────────────────────────────────

// GET top 20 leaderboard entries
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT name, score, level, stars, iq, created_at FROM leaderboard ORDER BY score DESC LIMIT 20'
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Check if a name is available
app.get('/api/leaderboard/check/:name', async (req, res) => {
  try {
    const name = req.params.name.trim().slice(0, 16).toLowerCase();
    const { rows } = await pool.query(
      'SELECT name FROM leaderboard WHERE LOWER(name) = $1', [name]
    );
    res.json({ available: rows.length === 0, name: rows[0]?.name || null });
  } catch (err) {
    console.error('GET /api/leaderboard/check error:', err.message);
    res.status(500).json({ error: 'Failed to check name' });
  }
});

// POST new entry or update existing (upsert — keeps best score per name)
app.post('/api/leaderboard', async (req, res) => {
  try {
    const { name, score, level, stars, iq } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const cleanName = name.trim().slice(0, 16);
    const { rows } = await pool.query(
      `INSERT INTO leaderboard (name, score, level, stars, iq)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         score = GREATEST(leaderboard.score, EXCLUDED.score),
         level = GREATEST(leaderboard.level, EXCLUDED.level),
         stars = GREATEST(leaderboard.stars, EXCLUDED.stars),
         iq = EXCLUDED.iq,
         created_at = NOW()
       RETURNING id, name, score, level, stars, iq, created_at`,
      [cleanName, score || 0, level || 1, stars || 0, iq || 100]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to save entry' });
  }
});

// GET rank for a given score
app.get('/api/leaderboard/rank/:score', async (req, res) => {
  try {
    const score = parseInt(req.params.score) || 0;
    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM leaderboard WHERE score > $1',
      [score]
    );
    res.json({ rank: parseInt(rows[0].count) + 1 });
  } catch (err) {
    console.error('GET /api/leaderboard/rank error:', err.message);
    res.status(500).json({ error: 'Failed to get rank' });
  }
});

// ── Start ───────────────────────────────────────────────

const PORT = process.env.PORT || 8080;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HIVEMIND server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB init failed:', err.message);
    process.exit(1);
  });
