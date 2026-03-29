// HIVEMIND - Leaderboard + Progress (localStorage)

const LB_KEY = 'hivemind_leaderboard';
const PROG_KEY = 'hivemind_progress';
const MAX_ENTRIES = 20;

// ── Leaderboard ────────────────────────────────────────

export function getLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem(LB_KEY)) || [];
  } catch { return []; }
}

export function addEntry(name, totalScore, maxLevel, totalStars) {
  const board = getLeaderboard();
  board.push({
    name: name.slice(0, 16),
    score: totalScore,
    level: maxLevel,
    stars: totalStars,
    date: new Date().toISOString().split('T')[0]
  });
  board.sort((a, b) => b.score - a.score);
  if (board.length > MAX_ENTRIES) board.length = MAX_ENTRIES;
  localStorage.setItem(LB_KEY, JSON.stringify(board));
  return board;
}

export function getRank(score) {
  return getLeaderboard().filter(e => e.score > score).length + 1;
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
