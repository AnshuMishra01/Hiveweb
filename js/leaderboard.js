// HIVEMIND - Leaderboard + Progress + Session (localStorage)

const LB_KEY = 'hivemind_leaderboard';
const PROG_KEY = 'hivemind_progress';
const SESSION_KEY = 'hivemind_session';
const IQ_KEY = 'hivemind_iq';
const MAX_ENTRIES = 25;

// ── Leaderboard ────────────────────────────────────────

function getLocalBoard() {
  try {
    return JSON.parse(localStorage.getItem(LB_KEY)) || [];
  } catch { return []; }
}

export async function getLeaderboard() {
  return getLocalBoard();
}

export async function addEntry(name, totalScore, maxLevel, totalStars, iq) {
  const board = getLocalBoard();
  const cleanName = name.slice(0, 16);

  // Upsert — update if name exists with better score, otherwise add
  const existing = board.findIndex(e => e.name.toLowerCase() === cleanName.toLowerCase());
  if (existing >= 0) {
    const e = board[existing];
    e.score = Math.max(e.score, totalScore);
    e.level = Math.max(e.level, maxLevel);
    e.stars = Math.max(e.stars, totalStars);
    e.iq = iq || e.iq;
    e.date = new Date().toISOString().split('T')[0];
  } else {
    board.push({
      name: cleanName,
      score: totalScore,
      level: maxLevel,
      stars: totalStars,
      iq: iq || 100,
      date: new Date().toISOString().split('T')[0]
    });
  }

  board.sort((a, b) => b.score - a.score);
  if (board.length > MAX_ENTRIES) board.length = MAX_ENTRIES;
  localStorage.setItem(LB_KEY, JSON.stringify(board));
  return board;
}

export async function getRank(score) {
  return getLocalBoard().filter(e => e.score > score).length + 1;
}

// ── Level progress ─────────────────────────────────────

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

// ── IQ Tracking ────────────────────────────────────────

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

// ── Session Persistence ────────────────────────────────

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
