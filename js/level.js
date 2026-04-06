// HIVEMIND - Level Generator
// Generates multi-agent puzzles with guaranteed solvability via reverse-solving.
// Some levels are intentionally impossible — players can call them out.
// Each agent has its own maze. All agents share the same input.

export const AGENT_COLORS = ['#ff3e5e', '#3ea8ff', '#3eff8e', '#f0c040', '#c850ff'];
export const AGENT_NAMES = ['RED', 'BLUE', 'GREEN', 'GOLD', 'VIOLET'];

const DIRS = {
  up:    { dr: -1, dc: 0 },
  down:  { dr: 1,  dc: 0 },
  left:  { dr: 0,  dc: -1 },
  right: { dr: 0,  dc: 1 }
};
const DIR_KEYS = ['up', 'down', 'left', 'right'];
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function getLevelConfig(levelNum) {
  const n = levelNum;
  return {
    numAgents: Math.min(2 + Math.floor((n - 1) / 6), 5),
    gridSize:  Math.min(5 + Math.floor((n - 1) / 4), 9),
    wallFrac:  Math.min(0.12 + n * 0.008, 0.28),
    solLen:    Math.min(4 + Math.floor(n * 0.7), 28),
    hasPortals: n >= 15,
    hasToggle:  n >= 22
  };
}

export function getDifficulty(levelNum) {
  if (levelNum <= 3)  return { name: 'Novice',       iq: '100' };
  if (levelNum <= 6)  return { name: 'Thinker',      iq: '115' };
  if (levelNum <= 10) return { name: 'Strategist',   iq: '130' };
  if (levelNum <= 15) return { name: 'Mastermind',    iq: '145' };
  if (levelNum <= 21) return { name: 'Prodigy',       iq: '165' };
  if (levelNum <= 28) return { name: 'Genius',        iq: '185' };
  return                      { name: 'Transcendent', iq: '200+' };
}

// ── Grid generation ────────────────────────────────────

function makeGrid(size, wallFrac) {
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  const numWalls = Math.floor(size * size * wallFrac);
  let placed = 0;
  let guard = 0;

  while (placed < numWalls && guard < 500) {
    guard++;
    const r = Math.floor(Math.random() * size);
    const c = Math.floor(Math.random() * size);
    if (grid[r][c] === 0) {
      grid[r][c] = 1;
      if (isConnected(grid, size)) {
        placed++;
      } else {
        grid[r][c] = 0; // undo — would disconnect the grid
      }
    }
  }
  return grid;
}

// BFS flood-fill to ensure all empty cells are reachable
function isConnected(grid, size) {
  let start = null;
  const empty = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 0) {
        empty.push(`${r},${c}`);
        if (!start) start = { r, c };
      }
    }
  }
  if (!start) return true;

  const visited = new Set();
  const queue = [start];
  visited.add(`${start.r},${start.c}`);

  while (queue.length) {
    const { r, c } = queue.shift();
    for (const d of Object.values(DIRS)) {
      const nr = r + d.dr;
      const nc = c + d.dc;
      const key = `${nr},${nc}`;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size && grid[nr][nc] === 0 && !visited.has(key)) {
        visited.add(key);
        queue.push({ r: nr, c: nc });
      }
    }
  }
  return visited.size === empty.length;
}

function randomEmptyCell(grid, size, exclude = []) {
  const exSet = new Set(exclude.map(p => `${p.row},${p.col}`));
  const candidates = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 0 && !exSet.has(`${r},${c}`)) {
        candidates.push({ row: r, col: c });
      }
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Portal generation ──────────────────────────────────

function placePortals(grid, size) {
  const empties = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 0) empties.push({ row: r, col: c });
    }
  }
  if (empties.length < 4) return [];

  // Shuffle and pick 2 pairs
  shuffle(empties);
  return [
    { a: empties[0], b: empties[1], color: '#ff8f00' }
  ];
}

// ── Toggle walls ───────────────────────────────────────

function placeToggleWalls(grid, size) {
  const toggles = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 1 && Math.random() < 0.3) {
        toggles.push({ row: r, col: c });
        if (toggles.length >= 3) return toggles;
      }
    }
  }
  return toggles;
}

// ── Move simulation ────────────────────────────────────

export function moveAgent(pos, dir, grid, size, portals = []) {
  const d = DIRS[dir];
  const nr = pos.row + d.dr;
  const nc = pos.col + d.dc;

  if (nr < 0 || nr >= size || nc < 0 || nc >= size || grid[nr][nc] === 1) {
    return { ...pos }; // blocked
  }

  let newPos = { row: nr, col: nc };

  // Check portals
  for (const p of portals) {
    if (newPos.row === p.a.row && newPos.col === p.a.col) {
      newPos = { row: p.b.row, col: p.b.col };
      break;
    }
    if (newPos.row === p.b.row && newPos.col === p.b.col) {
      newPos = { row: p.a.row, col: p.a.col };
      break;
    }
  }

  return newPos;
}

// ── Reverse-solve to generate start positions ──────────

function reverseSolve(grids, targets, size, solLen, portalSets) {
  const positions = targets.map(t => ({ ...t }));
  const solution = [];

  for (let i = 0; i < solLen; i++) {
    const dirIdx = Math.floor(Math.random() * 4);
    const fwdDir = DIR_KEYS[dirIdx];
    const revDir = OPPOSITE[fwdDir];

    // Move all agents in reverse direction
    for (let a = 0; a < positions.length; a++) {
      positions[a] = moveAgent(positions[a], revDir, grids[a], size, portalSets[a] || []);
    }
    solution.unshift(fwdDir); // prepend to get forward solution
  }

  // Check non-trivial: at least one agent not at target
  const trivial = positions.every((p, i) => p.row === targets[i].row && p.col === targets[i].col);

  return { starts: positions, solution, trivial };
}

// ── Impossible level generator ─────────────────────────

function generateImpossibleLevel(levelNum) {
  const cfg = getLevelConfig(levelNum);

  // Try to create a level that BFS confirms is unsolvable
  for (let attempt = 0; attempt < 20; attempt++) {
    const grids = [];
    const portalSets = [];
    const toggleSets = [];

    // Use higher wall density to increase chance of impossibility
    const wallFrac = Math.min(cfg.wallFrac + 0.08, 0.35);

    for (let a = 0; a < cfg.numAgents; a++) {
      const grid = makeGrid(cfg.gridSize, wallFrac);
      grids.push(grid);
      portalSets.push([]);
      toggleSets.push([]);
    }

    const targets = [];
    const starts = [];
    for (let a = 0; a < cfg.numAgents; a++) {
      targets.push(randomEmptyCell(grids[a], cfg.gridSize));
      starts.push(randomEmptyCell(grids[a], cfg.gridSize, [targets[a]]));
    }

    // Quick trivial check
    const trivial = starts.every((s, i) => s.row === targets[i].row && s.col === targets[i].col);
    if (trivial) continue;

    // BFS to check solvability (with state limit to prevent freeze)
    const sol = solveBFS(starts, targets, grids, cfg.gridSize, portalSets, 200000);

    if (sol === null) {
      // Confirmed impossible!
      return {
        level: levelNum,
        numAgents: cfg.numAgents,
        gridSize: cfg.gridSize,
        grids,
        starts,
        targets,
        par: cfg.solLen,
        solution: null,
        impossible: true,
        portals: portalSets,
        toggleWalls: toggleSets,
        hasPortals: false,
        hasToggle: false
      };
    }
  }

  return null; // couldn't generate impossible level
}

// ── Main level generator ───────────────────────────────

export function generateLevel(levelNum) {
  const cfg = getLevelConfig(levelNum);

  // ~18% chance of impossible level after level 2, only for 2-3 agents
  if (levelNum > 2 && cfg.numAgents <= 3 && Math.random() < 0.18) {
    const impossibleLevel = generateImpossibleLevel(levelNum);
    if (impossibleLevel) return impossibleLevel;
  }

  let attempts = 0;

  while (attempts < 50) {
    attempts++;

    const grids = [];
    const targets = [];
    const portalSets = [];
    const toggleSets = [];

    for (let a = 0; a < cfg.numAgents; a++) {
      const grid = makeGrid(cfg.gridSize, cfg.wallFrac);
      grids.push(grid);

      // Portals
      const portals = cfg.hasPortals ? placePortals(grid, cfg.gridSize) : [];
      portalSets.push(portals);

      // Toggle walls
      const toggles = cfg.hasToggle ? placeToggleWalls(grid, cfg.gridSize) : [];
      toggleSets.push(toggles);
    }

    // Place targets (not on walls, not overlapping within same grid)
    for (let a = 0; a < cfg.numAgents; a++) {
      targets.push(randomEmptyCell(grids[a], cfg.gridSize));
    }

    const { starts, solution, trivial } = reverseSolve(
      grids, targets, cfg.gridSize, cfg.solLen, portalSets
    );

    if (trivial) continue;

    // Verify at least 2 agents move differently on some input
    let diverse = false;
    for (const dir of DIR_KEYS) {
      const moves = starts.map((s, a) => {
        const next = moveAgent(s, dir, grids[a], cfg.gridSize, portalSets[a]);
        return `${next.row - s.row},${next.col - s.col}`;
      });
      if (new Set(moves).size > 1) { diverse = true; break; }
    }
    if (!diverse) continue;

    return {
      level: levelNum,
      numAgents: cfg.numAgents,
      gridSize: cfg.gridSize,
      grids,
      starts,
      targets,
      par: solution.length,
      solution,
      impossible: false,
      portals: portalSets,
      toggleWalls: toggleSets,
      hasPortals: cfg.hasPortals,
      hasToggle: cfg.hasToggle
    };
  }

  // Fallback: try with slightly different params
  return generateLevel(levelNum);
}

// ── Apply toggle walls (called each move) ──────────────

export function applyToggle(grid, toggles, moveCount) {
  // Toggle walls flip every other move
  for (const t of toggles) {
    grid[t.row][t.col] = moveCount % 2 === 0 ? 1 : 0;
  }
}

// ── Check win condition ────────────────────────────────

export function checkWin(positions, targets) {
  return positions.every((p, i) => p.row === targets[i].row && p.col === targets[i].col);
}

// ── Star rating ────────────────────────────────────────

export function getStars(moves, par) {
  if (moves <= par)      return 3;
  if (moves <= par + 3)  return 2;
  return 1;
}

// ── BFS Solver ────────────────────────────────────────

export function solveBFS(positions, targets, grids, gridSize, portalSets, maxStates = 500000) {
  const encodeState = (ps) => ps.map(p => `${p.row},${p.col}`).join('|');
  const targetKey = encodeState(targets);

  const startKey = encodeState(positions);
  if (startKey === targetKey) return [];

  const visited = new Set();
  visited.add(startKey);
  const queue = [{ positions: positions.map(p => ({ ...p })), moves: [] }];

  while (queue.length > 0) {
    if (visited.size > maxStates) return null; // state limit reached

    const { positions: cur, moves } = queue.shift();

    for (const dir of DIR_KEYS) {
      const next = cur.map((p, a) =>
        moveAgent(p, dir, grids[a], gridSize, portalSets[a] || [])
      );
      const key = encodeState(next);

      if (key === targetKey) return [...moves, dir];
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ positions: next, moves: [...moves, dir] });
      }
    }
  }
  return null; // no solution found
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
