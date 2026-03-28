// CORTEX - Leaderboard (localStorage)

const STORAGE_KEY = 'cortex_leaderboard';
const MAX_ENTRIES = 20;

export function getLeaderboard() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addEntry(name, score, maxLevel, iqLabel) {
  const board = getLeaderboard();
  board.push({
    name: name.slice(0, 16),
    score,
    maxLevel,
    iq: iqLabel,
    date: new Date().toISOString().split('T')[0]
  });
  board.sort((a, b) => b.score - a.score);
  if (board.length > MAX_ENTRIES) board.length = MAX_ENTRIES;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  return board;
}

export function getRank(score) {
  const board = getLeaderboard();
  const rank = board.filter(e => e.score > score).length + 1;
  return rank;
}

export function clearLeaderboard() {
  localStorage.removeItem(STORAGE_KEY);
}
