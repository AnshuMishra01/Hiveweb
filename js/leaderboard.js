// HIVEMIND - Leaderboard (PostgreSQL API) + Local Progress/Session (localStorage)

const PROG_KEY = 'hivemind_progress';
const SESSION_KEY = 'hivemind_session';
const IQ_KEY = 'hivemind_iq';

// ── Shared Leaderboard (API) ───────────────────────────

export async function getLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    if (!res.ok) throw new Error('API error');
    const rows = await res.json();
    return rows.map(r => ({
      name: r.name,
      score: r.score,
      level: r.level,
      stars: r.stars,
      iq: r.iq,
      date: r.created_at ? r.created_at.split('T')[0] : ''
    }));
  } catch (err) {
    console.warn('Leaderboard fetch failed, using local fallback:', err.message);
    return getLocalLeaderboard();
  }
}

export async function addEntry(name, totalScore, maxLevel, totalStars, iq) {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.slice(0, 16),
        score: totalScore,
        level: maxLevel,
        stars: totalStars,
        iq: iq || 100
      })
    });
    if (!res.ok) throw new Error('API error');
    return await getLeaderboard();
  } catch (err) {
    console.warn('Leaderboard save failed, using local fallback:', err.message);
    return addLocalEntry(name, totalScore, maxLevel, totalStars, iq);
  }
}

export async function getRank(score) {
  try {
    const res = await fetch(`/api/leaderboard/rank/${score}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    return data.rank;
  } catch {
    const board = getLocalLeaderboard();
    return board.filter(e => e.score > score).length + 1;
  }
}

// ── Local fallback (if API is down) ────────────────────

const LB_KEY = 'hivemind_leaderboard';

function getLocalLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem(LB_KEY)) || [];
  } catch { return []; }
}

function addLocalEntry(name, totalScore, maxLevel, totalStars, iq) {
  const board = getLocalLeaderboard();
  board.push({
    name: name.slice(0, 16),
    score: totalScore,
    level: maxLevel,
    stars: totalStars,
    iq: iq || 100,
    date: new Date().toISOString().split('T')[0]
  });
  board.sort((a, b) => b.score - a.score);
  if (board.length > 20) board.length = 20;
  localStorage.setItem(LB_KEY, JSON.stringify(board));
  return board;
}

// ── Level progress (local) ─────────────────────────────

export function getProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROG_KEY)) || {};
  } catch { return {}; }
}

export function saveLevelResult(level, moves, stars) {
  const prog = getProgress();
  const prev = prog[level];
  if (!prev || stars > prev.stars || (stars === prev.stars && moves < prev.moves)) {
    prog[level] = { moves, stars };
  }
  localStorage.setItem(PROG_KEY, JSON.stringify(prog));
}

export function getMaxUnlockedLevel() {
  const prog = getProgress();
  const levels = Object.keys(prog).map(Number);
  if (levels.length === 0) return 1;
  return Math.max(...levels) + 1;
}

export function getTotalStars() {
  const prog = getProgress();
  return Object.values(prog).reduce((sum, p) => sum + (p.stars || 0), 0);
}

// ── IQ Tracking (local) ───────────────────────────────

export function getIQ() {
  try {
    const val = parseInt(localStorage.getItem(IQ_KEY));
    return isNaN(val) ? 100 : val;
  } catch { return 100; }
}

export function setIQ(val) {
  const clamped = Math.max(50, Math.min(300, Math.round(val)));
  localStorage.setItem(IQ_KEY, String(clamped));
  return clamped;
}

export function adjustIQ(delta) {
  return setIQ(getIQ() + delta);
}

// ── Session Persistence (local) ────────────────────────

export function saveSession(data) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      levelNum: data.levelNum,
      totalScore: data.totalScore,
      totalStars: data.totalStars,
      lives: data.lives,
      timestamp: Date.now()
    }));
  } catch { /* ignore */ }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) {
      clearSession();
      return null;
    }
    return data;
  } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
