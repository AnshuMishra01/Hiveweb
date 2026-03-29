// HIVEMIND - Main Game Controller
// "One Mind. Many Bodies. Zero Margin for Error."

import {
  generateLevel, moveAgent, checkWin, getStars,
  getDifficulty, AGENT_COLORS, AGENT_NAMES, applyToggle
} from './level.js';
import { Renderer } from './renderer.js';
import {
  getLeaderboard, addEntry, getRank,
  saveLevelResult, getMaxUnlockedLevel, getTotalStars
} from './leaderboard.js';

// ── Constants ──────────────────────────────────────────
const State = { MENU: 0, PLAYING: 1, WIN: 2, GAME_OVER: 3, LEADERBOARD: 4 };
const ANIM_DURATION = 120; // ms

// ── State ──────────────────────────────────────────────
let state = State.MENU;
let level = null;        // current level data
let levelNum = 1;
let positions = [];      // current agent positions [{row,col}, ...]
let displayPos = [];     // animated display positions [{row,col}, ...]
let moveCount = 0;
let undoStack = [];
let totalScore = 0;
let totalStars = 0;
let lives = 5;
let animating = false;
let animStart = 0;
let animFrom = [];
let animTo = [];
let lastMoveDir = null;
let winTime = 0;
let particles = [];
let mouseX = 0, mouseY = 0;

// Swipe tracking
let touchStartX = 0, touchStartY = 0;
let touchStartTime = 0;

// ── Canvas ─────────────────────────────────────────────
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
let W, H;

function resize() {
  W = Math.min(window.innerWidth, 650);
  H = window.innerHeight;
  renderer.resize(W, H);
}
window.addEventListener('resize', resize);
resize();

// ── Input ──────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (state === State.PLAYING && !animating) {
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };
    if (map[e.key]) { e.preventDefault(); executeMove(map[e.key]); }
    if (e.key === 'z' || e.key === 'Z') undo();
    if (e.key === 'r' || e.key === 'R') resetLevel();
  }
  if (state === State.MENU && (e.key === 'Enter' || e.key === ' ')) startGame();
  if (state === State.WIN && (e.key === 'Enter' || e.key === ' ')) nextLevel();
});

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = e.clientX - r.left;
  mouseY = e.clientY - r.top;
});

canvas.addEventListener('click', e => {
  const r = canvas.getBoundingClientRect();
  handleClick(e.clientX - r.left, e.clientY - r.top);
});

canvas.addEventListener('touchstart', e => {
  const t = e.touches[0];
  const r = canvas.getBoundingClientRect();
  touchStartX = t.clientX - r.left;
  touchStartY = t.clientY - r.top;
  touchStartTime = performance.now();
  mouseX = touchStartX;
  mouseY = touchStartY;
}, { passive: true });

canvas.addEventListener('touchend', e => {
  const t = e.changedTouches[0];
  const r = canvas.getBoundingClientRect();
  const endX = t.clientX - r.left;
  const endY = t.clientY - r.top;
  const dx = endX - touchStartX;
  const dy = endY - touchStartY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dt = performance.now() - touchStartTime;

  if (dist < 15 && dt < 300) {
    // Tap
    handleClick(endX, endY);
  } else if (dist > 30 && state === State.PLAYING && !animating) {
    // Swipe
    if (Math.abs(dx) > Math.abs(dy)) {
      executeMove(dx > 0 ? 'right' : 'left');
    } else {
      executeMove(dy > 0 ? 'down' : 'up');
    }
  }
}, { passive: true });

// ── Layout ─────────────────────────────────────────────

function getMazeLayout() {
  if (!level) return { layouts: [], cellSize: 0 };
  const n = level.numAgents;
  const gs = level.gridSize;
  const headerH = 100;
  const footerH = 120;
  const availW = W - 32;
  const availH = H - headerH - footerH;

  let cols, rows;
  if (n <= 2) { cols = 2; rows = 1; }
  else if (n <= 3) { cols = 3; rows = 1; }
  else if (n <= 4) { cols = 2; rows = 2; }
  else { cols = 3; rows = 2; }

  const gapX = 16;
  const gapY = 30;
  const maxCellW = (availW - (cols - 1) * gapX) / (cols * gs);
  const maxCellH = (availH - (rows - 1) * gapY) / (rows * gs);
  const cellSize = Math.floor(Math.min(maxCellW, maxCellH, 50));
  const mazeSize = cellSize * gs;

  const totalW = cols * mazeSize + (cols - 1) * gapX;
  const totalH = rows * mazeSize + (rows - 1) * gapY;
  const startX = (W - totalW) / 2;
  const startY = headerH + (availH - totalH) / 2;

  const layouts = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layouts.push({
      x: startX + col * (mazeSize + gapX),
      y: startY + row * (mazeSize + gapY + 18), // +18 for label
      cellSize,
      mazeSize
    });
  }

  return { layouts, cellSize };
}

function getButtonZones() {
  const bw = 80, bh = 36, gap = 10;
  const y = H - 65;
  const totalW = bw * 4 + gap * 3;
  const sx = (W - totalW) / 2;
  return {
    undo:  { x: sx, y, w: bw, h: bh },
    reset: { x: sx + bw + gap, y, w: bw, h: bh },
    menu:  { x: sx + (bw + gap) * 2, y, w: bw, h: bh },
    next:  { x: sx + (bw + gap) * 3, y, w: bw, h: bh }
  };
}

function isInside(mx, my, zone) {
  return mx >= zone.x && mx <= zone.x + zone.w && my >= zone.y && my <= zone.y + zone.h;
}

// ── Click ──────────────────────────────────────────────

function handleClick(cx, cy) {
  if (state === State.MENU) {
    const btnY = H * 0.55;
    if (cx > W / 2 - 110 && cx < W / 2 + 110) {
      if (cy > btnY && cy < btnY + 50) startGame();
      if (cy > btnY + 64 && cy < btnY + 114) { state = State.LEADERBOARD; }
    }
    return;
  }

  if (state === State.PLAYING) {
    const zones = getButtonZones();
    if (isInside(cx, cy, zones.undo)) undo();
    else if (isInside(cx, cy, zones.reset)) resetLevel();
    else if (isInside(cx, cy, zones.menu)) { state = State.MENU; }
    return;
  }

  if (state === State.WIN) {
    const zones = getButtonZones();
    if (isInside(cx, cy, zones.next)) nextLevel();
    else if (isInside(cx, cy, zones.menu)) { state = State.MENU; }
    return;
  }

  if (state === State.GAME_OVER) {
    if (cx > W / 2 - 90 && cx < W / 2 + 90 && cy > H * 0.7 && cy < H * 0.7 + 50) {
      state = State.MENU;
    }
    return;
  }

  if (state === State.LEADERBOARD) {
    if (cy > H - 70 && cy < H - 24 && cx > W / 2 - 80 && cx < W / 2 + 80) {
      state = State.MENU;
    }
    return;
  }
}

// ── Game Logic ─────────────────────────────────────────

function startGame() {
  levelNum = 1;
  totalScore = 0;
  totalStars = 0;
  lives = 5;
  loadLevel(levelNum);
}

function loadLevel(num) {
  level = generateLevel(num);
  positions = level.starts.map(s => ({ ...s }));
  displayPos = positions.map(p => ({ row: p.row, col: p.col }));
  moveCount = 0;
  undoStack = [];
  lastMoveDir = null;
  animating = false;
  state = State.PLAYING;
}

function executeMove(dir) {
  if (!level || animating) return;

  // Save state for undo
  undoStack.push(positions.map(p => ({ ...p })));

  // Toggle walls if applicable
  if (level.hasToggle) {
    for (let a = 0; a < level.numAgents; a++) {
      applyToggle(level.grids[a], level.toggleWalls[a], moveCount + 1);
    }
  }

  // Compute new positions
  const newPos = positions.map((p, a) =>
    moveAgent(p, dir, level.grids[a], level.gridSize, level.portals[a])
  );

  // Check if any agent actually moved
  const anyMoved = newPos.some((np, i) =>
    np.row !== positions[i].row || np.col !== positions[i].col
  );

  if (!anyMoved) {
    undoStack.pop(); // nothing happened, don't count
    return;
  }

  // Start animation
  animFrom = positions.map(p => ({ ...p }));
  animTo = newPos;
  positions = newPos;
  moveCount++;
  lastMoveDir = dir;
  animating = true;
  animStart = performance.now();

  // Move limit: par * 3 moves max, then lose a life
  const moveLimit = level.par * 3;
  if (moveCount >= moveLimit && !checkWin(positions, level.targets)) {
    animating = false;
    displayPos = positions.map(p => ({ row: p.row, col: p.col }));
    lives--;
    if (lives <= 0) {
      state = State.GAME_OVER;
      promptName();
    } else {
      // Reset level, keep same level number
      loadLevel(levelNum);
    }
  }
}

function updateAnimation(now) {
  if (!animating) return;
  const t = Math.min((now - animStart) / ANIM_DURATION, 1);
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out

  displayPos = animFrom.map((from, i) => ({
    row: from.row + (animTo[i].row - from.row) * ease,
    col: from.col + (animTo[i].col - from.col) * ease
  }));

  if (t >= 1) {
    animating = false;
    displayPos = positions.map(p => ({ row: p.row, col: p.col }));

    // Check win
    if (checkWin(positions, level.targets)) {
      onWin();
    }
  }
}

function onWin() {
  const stars = getStars(moveCount, level.par);
  const levelScore = stars * 100 + Math.max(0, (level.par - moveCount)) * 50 + levelNum * 25;
  totalScore += levelScore;
  totalStars += stars;
  saveLevelResult(levelNum, moveCount, stars);
  winTime = performance.now();
  state = State.WIN;

  // Celebration particles
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H * 0.4,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1,
      color: AGENT_COLORS[Math.floor(Math.random() * level.numAgents)],
      r: 2 + Math.random() * 4
    });
  }
}

function nextLevel() {
  levelNum++;
  loadLevel(levelNum);
}

function promptName() {
  setTimeout(() => {
    const diff = getDifficulty(levelNum);
    let name = prompt(
      `GAME OVER!\nScore: ${totalScore} | Level: ${levelNum} | IQ ~${diff.iq}\n\nEnter your name:`
    );
    if (name && name.trim()) {
      addEntry(name.trim(), totalScore, levelNum, totalStars);
    }
  }, 150);
}

function undo() {
  if (undoStack.length === 0 || animating) return;
  positions = undoStack.pop();
  displayPos = positions.map(p => ({ row: p.row, col: p.col }));
  moveCount = Math.max(0, moveCount - 1);

  if (level.hasToggle) {
    for (let a = 0; a < level.numAgents; a++) {
      applyToggle(level.grids[a], level.toggleWalls[a], moveCount);
    }
  }
}

function resetLevel() {
  if (animating) return;
  positions = level.starts.map(s => ({ ...s }));
  displayPos = positions.map(p => ({ row: p.row, col: p.col }));
  moveCount = 0;
  undoStack = [];

  if (level.hasToggle) {
    for (let a = 0; a < level.numAgents; a++) {
      applyToggle(level.grids[a], level.toggleWalls[a], 0);
    }
  }
}

// ── Particles ──────────────────────────────────────────

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.12;
    p.life -= dt * 1.2;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  const ctx = renderer.ctx;
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ── Render ─────────────────────────────────────────────

function render(now) {
  renderer.clear(W, H);
  const ctx = renderer.ctx;

  if (state === State.MENU) renderMenu(ctx);
  else if (state === State.PLAYING || state === State.WIN) renderGame(ctx);
  else if (state === State.GAME_OVER) renderGameOver(ctx);
  else if (state === State.LEADERBOARD) renderLeaderboard(ctx);

  drawParticles();
}

function renderMenu(ctx) {
  // Title
  renderer.text('HIVEMIND', W / 2, H * 0.2, { color: '#f0c040', size: 48, bold: true });
  renderer.text('One Mind. Many Bodies. Zero Margin for Error.', W / 2, H * 0.2 + 36, {
    color: 'rgba(255,255,255,0.4)', size: 11
  });

  // Animated connected nodes
  const cx = W / 2, cy = H * 0.38;
  const t = performance.now() / 1000;
  const nodes = [];
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 * i) / 5 + t * 0.3;
    const r = 35 + Math.sin(t * 0.8 + i) * 8;
    nodes.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }

  // Connections
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      ctx.strokeStyle = `rgba(240,192,64,${0.08 + Math.sin(t + i + j) * 0.04})`;
      ctx.beginPath();
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(nodes[j].x, nodes[j].y);
      ctx.stroke();
    }
  }

  // Nodes
  for (let i = 0; i < nodes.length; i++) {
    ctx.beginPath();
    ctx.arc(nodes[i].x, nodes[i].y, 6, 0, Math.PI * 2);
    ctx.fillStyle = AGENT_COLORS[i];
    ctx.fill();
  }

  // Center node
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#f0c040';
  ctx.fill();

  // Buttons
  const btnY = H * 0.55;
  const playH = isInside(mouseX, mouseY, { x: W / 2 - 110, y: btnY, w: 220, h: 50 });
  renderer.drawButton(W / 2 - 110, btnY, 220, 50, 'PLAY', playH, true);

  const lbH = isInside(mouseX, mouseY, { x: W / 2 - 110, y: btnY + 64, w: 220, h: 50 });
  renderer.drawButton(W / 2 - 110, btnY + 64, 220, 50, 'LEADERBOARD', lbH);

  // How to play
  const lines = [
    'Arrow keys / WASD / Swipe to move',
    'ALL agents move together, different mazes',
    'Get every agent to its matching target',
    'Z = Undo  |  R = Reset'
  ];
  lines.forEach((l, i) => {
    renderer.text(l, W / 2, H * 0.78 + i * 18, { color: 'rgba(255,255,255,0.25)', size: 11 });
  });
}

function renderGame(ctx) {
  const diff = getDifficulty(levelNum);
  const { layouts, cellSize } = getMazeLayout();

  // ── Header ────
  renderer.text('HIVEMIND', 16, 24, { color: '#f0c040', size: 18, bold: true, align: 'left' });
  renderer.text(`Level ${levelNum}`, W - 16, 18, { color: 'rgba(255,255,255,0.6)', size: 12, align: 'right' });
  renderer.text(`${diff.name} (IQ ~${diff.iq})`, W - 16, 34, {
    color: diff.iq === '200+' ? '#f0c040' : 'rgba(255,255,255,0.35)', size: 11, align: 'right'
  });

  // Moves, par & limit
  const moveLimit = level.par * 3;
  const movePct = moveCount / moveLimit;
  const moveColor = movePct > 0.8 ? '#ff3e5e' : movePct > 0.5 ? '#f0c040' : 'rgba(255,255,255,0.6)';
  renderer.text(`Moves: ${moveCount} / ${moveLimit}`, 16, 48, {
    color: moveColor, size: 12, align: 'left'
  });
  renderer.text(`Par: ${level.par}`, 16, 64, {
    color: 'rgba(255,255,255,0.35)', size: 11, align: 'left'
  });

  // Lives
  for (let i = 0; i < 5; i++) {
    const hx = W - 20 - (4 - i) * 18;
    drawDiamond(ctx, hx, 54, 6, i < lives ? '#f0c040' : 'rgba(255,255,255,0.08)');
  }

  // Score
  renderer.text(`Score: ${totalScore}`, W / 2, 82, { color: 'rgba(255,255,255,0.4)', size: 11 });

  // Features indicator
  const features = [];
  if (level.hasPortals) features.push('PORTALS');
  if (level.hasToggle) features.push('TOGGLE');
  if (features.length) {
    renderer.text(features.join(' + '), W / 2, 68, { color: '#ff8f00', size: 10 });
  }

  // ── Mazes ─────
  for (let a = 0; a < level.numAgents; a++) {
    const lay = layouts[a];
    if (!lay) continue;

    const agentSolved = positions[a].row === level.targets[a].row &&
                        positions[a].col === level.targets[a].col;

    renderer.drawMaze({
      grid: level.grids[a],
      gridSize: level.gridSize,
      x: lay.x,
      y: lay.y,
      cellSize: lay.cellSize,
      agentPos: positions[a],
      agentDisplayPos: displayPos[a],
      targetPos: level.targets[a],
      colorIdx: a,
      portals: level.portals[a],
      toggleWalls: level.hasToggle ? level.toggleWalls[a] : null,
      moveCount,
      solved: agentSolved,
      label: AGENT_NAMES[a]
    });
  }

  // ── Buttons ───
  const zones = getButtonZones();

  if (state === State.WIN) {
    // Win overlay
    const stars = getStars(moveCount, level.par);
    renderer.text('SOLVED!', W / 2, H - 110, { color: '#3eff8e', size: 22, bold: true });
    renderer.drawStars(W / 2, H - 85, stars);

    const nextH = isInside(mouseX, mouseY, zones.next);
    renderer.drawButton(zones.next.x, zones.next.y, zones.next.w, zones.next.h, 'NEXT', nextH, true);
    const menuH = isInside(mouseX, mouseY, zones.menu);
    renderer.drawButton(zones.menu.x, zones.menu.y, zones.menu.w, zones.menu.h, 'MENU', menuH);
  } else {
    const undoH = isInside(mouseX, mouseY, zones.undo);
    renderer.drawButton(zones.undo.x, zones.undo.y, zones.undo.w, zones.undo.h,
      `UNDO (${undoStack.length})`, undoH);

    const resetH = isInside(mouseX, mouseY, zones.reset);
    renderer.drawButton(zones.reset.x, zones.reset.y, zones.reset.w, zones.reset.h, 'RESET', resetH);

    const menuH = isInside(mouseX, mouseY, zones.menu);
    renderer.drawButton(zones.menu.x, zones.menu.y, zones.menu.w, zones.menu.h, 'MENU', menuH);
  }

  // Direction hint
  if (lastMoveDir && state === State.PLAYING) {
    const arrows = { up: '\u2191', down: '\u2193', left: '\u2190', right: '\u2192' };
    renderer.text(arrows[lastMoveDir], W / 2, H - 25, { color: 'rgba(255,255,255,0.15)', size: 20 });
  }
}

function renderGameOver(ctx) {
  renderer.text('GAME OVER', W / 2, H * 0.2, { color: '#ff3e5e', size: 36, bold: true });

  const diff = getDifficulty(levelNum);
  const lines = [
    `Reached Level ${levelNum}`,
    `Total Score: ${totalScore}`,
    `Stars Earned: ${totalStars}`,
    `IQ Estimate: ~${diff.iq}`,
    `Rating: ${diff.name}`
  ];

  lines.forEach((l, i) => {
    const c = i === 3 ? '#f0c040' : 'rgba(255,255,255,0.6)';
    renderer.text(l, W / 2, H * 0.35 + i * 28, { color: c, size: 15 });
  });

  const rank = getRank(totalScore);
  renderer.text(`Leaderboard: #${rank}`, W / 2, H * 0.35 + lines.length * 28 + 15, {
    color: rank <= 3 ? '#f0c040' : 'rgba(255,255,255,0.4)', size: 13
  });

  const bh = isInside(mouseX, mouseY, { x: W / 2 - 90, y: H * 0.7, w: 180, h: 50 });
  renderer.drawButton(W / 2 - 90, H * 0.7, 180, 50, 'MAIN MENU', bh, true);
}

function renderLeaderboard(ctx) {
  renderer.text('LEADERBOARD', W / 2, 45, { color: '#f0c040', size: 26, bold: true });

  const board = getLeaderboard();

  if (board.length === 0) {
    renderer.text('No entries yet. Be the first!', W / 2, 120, {
      color: 'rgba(255,255,255,0.4)', size: 13
    });
  } else {
    // Header
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('#', 24, 85);
    ctx.fillText('Name', 50, 85);
    ctx.fillText('Score', W * 0.5, 85);
    ctx.fillText('Lvl', W * 0.7, 85);
    ctx.fillText('Stars', W * 0.82, 85);

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.moveTo(24, 92); ctx.lineTo(W - 24, 92); ctx.stroke();

    const max = Math.min(board.length, 12);
    for (let i = 0; i < max; i++) {
      const e = board[i];
      const y = 112 + i * 26;
      const top3 = i < 3;
      ctx.font = `${top3 ? 'bold ' : ''}12px "JetBrains Mono", monospace`;
      ctx.fillStyle = top3 ? '#f0c040' : 'rgba(255,255,255,0.55)';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, 24, y);
      ctx.fillText(e.name, 50, y);
      ctx.fillText(`${e.score}`, W * 0.5, y);
      ctx.fillText(`${e.level}`, W * 0.7, y);
      ctx.fillText(`${'★'.repeat(Math.min(e.stars, 99))}`, W * 0.82, y);
    }
  }

  const bh = isInside(mouseX, mouseY, { x: W / 2 - 80, y: H - 70, w: 160, h: 45 });
  renderer.drawButton(W / 2 - 80, H - 70, 160, 45, 'BACK', bh);
}

// ── Helpers ────────────────────────────────────────────

function drawDiamond(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s * 0.7, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s * 0.7, y);
  ctx.closePath();
  ctx.fill();
}

// ── Game Loop ──────────────────────────────────────────

let lastTime = performance.now();

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  renderer.tick(dt);
  updateAnimation(now);
  updateParticles(dt);
  render(now);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
