// HIVEMIND - Main Game Controller
// "One Mind. Many Bodies. Zero Margin for Error."

import {
  generateLevel, moveAgent, checkWin, getStars,
  getDifficulty, AGENT_COLORS, AGENT_NAMES, applyToggle, solveBFS
} from './level.js';
import { Renderer } from './renderer.js';
import {
  getLeaderboard, addEntry, getRank,
  saveLevelResult, getMaxUnlockedLevel, getTotalStars,
  getIQ, adjustIQ, saveSession, loadSession, clearSession
} from './leaderboard.js';
import * as audio from './audio.js';
import * as dialogue from './dialogue.js';
import * as tts from './tts.js';

// ── Constants ──────────────────────────────────────────
const State = { MENU: 0, PLAYING: 1, WIN: 2, GAME_OVER: 3, LEADERBOARD: 4, AGE_GATE: 5 };
const ANIM_DURATION = 130; // ms

// ── State ──────────────────────────────────────────────
let state = State.MENU;
let welcomeShown = false;
let ambientStarted = false;
let level = null;
let levelNum = 1;
let positions = [];
let displayPos = [];
let moveCount = 0;
let undoStack = [];
let totalScore = 0;
let totalStars = 0;
let lives = 5;
let playerIQ = getIQ();
let playerName = localStorage.getItem('hivemind_name') || '';
let animating = false;
let animStart = 0;
let animFrom = [];
let animTo = [];
let lastMoveDir = null;
let winTime = 0;
let particles = [];
let mouseX = 0, mouseY = 0;

// Hint system
let hintSolution = null;
let hintIndex = 0;
let hintMessage = '';
let hintMessageTime = 0;

// Impossible claim feedback
let claimMessage = '';
let claimMessageTime = 0;
let claimMessageColor = '#3eff8e';

// Swipe
let touchStartX = 0, touchStartY = 0, touchStartTime = 0;

// Leaderboard cache (async API can't be called in render loop)
let cachedBoard = [];
let cachedRank = 1;
let boardDirty = true;

function refreshLeaderboard() {
  getLeaderboard().then(board => { cachedBoard = board; }).catch(() => {});
  getRank(totalScore).then(rank => { cachedRank = rank; }).catch(() => {});
}

// Fetch leaderboard on startup
refreshLeaderboard();

// Track which agents just landed on target (for per-agent sound)
let prevOnTarget = [];

// ── Canvas — FULL WIDTH ────────────────────────────────
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
let W, H;

function resize() {
  W = window.innerWidth;   // full width — no cap
  H = window.innerHeight;
  renderer.resize(W, H);
}
window.addEventListener('resize', resize);
resize();

// ── Input ──────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') { audio.toggleMute(); tts.setEnabled(!audio.isMuted()); return; }

  // Dialogue input — blocks all other input
  if (dialogue.isActive()) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); dialogue.advance(); }
    return;
  }

  // Age gate
  if (state === State.AGE_GATE) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); confirmAge(); }
    return;
  }

  if (state === State.PLAYING && !animating) {
    const map = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right',
      W: 'up', S: 'down', A: 'left', D: 'right'
    };
    if (map[e.key]) { e.preventDefault(); executeMove(map[e.key]); }
    if (e.key === 'z' || e.key === 'Z') { undo(); audio.playUndo(); }
    if (e.key === 'r' || e.key === 'R') { resetLevel(); audio.playReset(); }
    if (e.key === 'h' || e.key === 'H') { showHint(); }
    if (e.key === 'i' || e.key === 'I') { claimImpossible(); }
  }
  if (state === State.MENU && (e.key === 'Enter' || e.key === ' ')) { startGame(); audio.playClick(); }
  if (state === State.WIN && (e.key === 'Enter' || e.key === ' ')) { nextLevel(); audio.playClick(); }
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
    handleClick(endX, endY);
  } else if (dist > 30 && state === State.PLAYING && !animating) {
    if (Math.abs(dx) > Math.abs(dy)) executeMove(dx > 0 ? 'right' : 'left');
    else executeMove(dy > 0 ? 'down' : 'up');
  }
}, { passive: true });

// ── Layout ─────────────────────────────────────────────

function getMazeLayout() {
  if (!level) return { layouts: [], cellSize: 0 };
  const n = level.numAgents;
  const gs = level.gridSize;
  const headerH = 100;
  const footerH = 130;
  const availW = W - 60;
  const availH = H - headerH - footerH;

  let cols, rows;
  if (n <= 2) { cols = 2; rows = 1; }
  else if (n <= 3) { cols = 3; rows = 1; }
  else if (n <= 4) { cols = 2; rows = 2; }
  else { cols = 3; rows = 2; }

  const gapX = Math.min(40, W * 0.03);
  const gapY = 36;
  const maxCellW = (availW - (cols - 1) * gapX) / (cols * gs);
  const maxCellH = (availH - (rows - 1) * gapY) / (rows * gs);
  const cellSize = Math.floor(Math.min(maxCellW, maxCellH, 70));
  const mazeSize = cellSize * gs;

  const totalW = cols * mazeSize + (cols - 1) * gapX;
  const totalH = rows * (mazeSize + 22) + (rows - 1) * gapY;
  const startX = (W - totalW) / 2;
  const startY = headerH + (availH - totalH) / 2;

  const layouts = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layouts.push({
      x: startX + col * (mazeSize + gapX),
      y: startY + row * (mazeSize + gapY + 22),
      cellSize,
      mazeSize
    });
  }

  return { layouts, cellSize };
}

function getButtonZones() {
  const bw = 90, bh = 40, gap = 10;
  const y = H - 72;
  const totalW = bw * 5 + gap * 4;
  const sx = (W - totalW) / 2;
  return {
    undo:       { x: sx, y, w: bw, h: bh },
    reset:      { x: sx + (bw + gap), y, w: bw, h: bh },
    impossible: { x: sx + (bw + gap) * 2, y, w: bw, h: bh },
    menu:       { x: sx + (bw + gap) * 3, y, w: bw, h: bh },
    next:       { x: sx + (bw + gap) * 4, y, w: bw, h: bh }
  };
}

function getMuteZone() {
  return { x: W - 50, y: 6, w: 36, h: 26 };
}

function isInside(mx, my, zone) {
  return mx >= zone.x && mx <= zone.x + zone.w && my >= zone.y && my <= zone.y + zone.h;
}

// ── Click ──────────────────────────────────────────────

function handleClick(cx, cy) {
  // Dialogue input — blocks all other clicks
  if (dialogue.isActive()) {
    dialogue.advance();
    return;
  }

  // Mute button (global)
  if (isInside(cx, cy, getMuteZone())) {
    audio.toggleMute();
    tts.setEnabled(!audio.isMuted());
    audio.playClick();
    return;
  }

  // Age gate
  if (state === State.AGE_GATE) {
    const btnY = H * 0.58;
    if (cx > W / 2 - 140 && cx < W / 2 + 140) {
      if (cy > btnY && cy < btnY + 54) { confirmAge(); }
      if (cy > btnY + 68 && cy < btnY + 122) {
        // Exit: navigate away
        window.location.href = 'about:blank';
      }
    }
    return;
  }

  if (state === State.MENU) {
    // Change name button
    const cnZone = { x: W / 2 + 120, y: H * 0.18 + 50, w: 90, h: 22 };
    if (playerName && isInside(cx, cy, cnZone)) { changeName(); audio.playClick(); return; }

    const btnY = H * 0.55;
    if (cx > W / 2 - 120 && cx < W / 2 + 120) {
      if (cy > btnY && cy < btnY + 54) { startGame(); audio.playClick(); }
      if (cy > btnY + 68 && cy < btnY + 122) { state = State.LEADERBOARD; refreshLeaderboard(); audio.playClick(); }
    }
    return;
  }

  if (state === State.PLAYING) {
    const zones = getButtonZones();
    if (isInside(cx, cy, zones.undo)) { undo(); audio.playUndo(); }
    else if (isInside(cx, cy, zones.reset)) { resetLevel(); audio.playReset(); }
    else if (isInside(cx, cy, zones.impossible)) { claimImpossible(); audio.playClick(); }
    else if (isInside(cx, cy, zones.menu)) { state = State.MENU; audio.playClick(); }
    return;
  }

  if (state === State.WIN) {
    const zones = getButtonZones();
    if (isInside(cx, cy, zones.next)) { nextLevel(); audio.playClick(); }
    else if (isInside(cx, cy, zones.menu)) { state = State.MENU; audio.playClick(); }
    return;
  }

  if (state === State.GAME_OVER) {
    if (cx > W / 2 - 100 && cx < W / 2 + 100 && cy > H * 0.7 && cy < H * 0.7 + 54) {
      state = State.MENU; audio.playClick();
    }
    return;
  }

  if (state === State.LEADERBOARD) {
    if (cy > H - 76 && cy < H - 26 && cx > W / 2 - 90 && cx < W / 2 + 90) {
      state = State.MENU; audio.playClick();
    }
    return;
  }
}

// ── Game Logic ─────────────────────────────────────────

function confirmAge() {
  localStorage.setItem('hivemind_age_verified', 'true');
  audio.playClick();
  state = State.MENU;
  startAmbientAudio();
}

function startAmbientAudio() {
  if (!ambientStarted) {
    audio.startAmbient();
    ambientStarted = true;
  }
}

async function startGame() {
  startAmbientAudio();

  // Ask for name if not set
  if (!playerName) {
    const name = await askForUniqueName('Choose a unique player name:');
    if (!name) return; // cancelled
    playerName = name;
    localStorage.setItem('hivemind_name', name);
  }

  // Try to resume saved session
  const session = loadSession();
  if (session && !welcomeShown) {
    levelNum = session.levelNum;
    totalScore = session.totalScore;
    totalStars = session.totalStars;
    lives = session.lives;
  } else if (!session) {
    levelNum = 1;
    totalScore = 0;
    totalStars = 0;
    lives = 5;
  }

  playerIQ = getIQ();

  if (!welcomeShown) {
    welcomeShown = true;
    loadLevel(levelNum, true);
    dialogue.startDialogue(dialogue.getWelcomeDialogue(), null);
  } else {
    levelNum = 1;
    totalScore = 0;
    totalStars = 0;
    lives = 5;
    loadLevel(levelNum);
  }
}

function changeName() {
  const name = prompt(`Current name: ${playerName}\n\nEnter new name (or cancel):`);
  if (name && name.trim()) {
    const clean = name.trim().slice(0, 16);
    fetch(`/api/leaderboard/check/${encodeURIComponent(clean)}`)
      .then(r => r.json())
      .then(data => {
        if (data.available) {
          playerName = clean;
          localStorage.setItem('hivemind_name', clean);
        } else {
          alert(`"${clean}" is already taken!`);
        }
      })
      .catch(() => {
        playerName = clean;
        localStorage.setItem('hivemind_name', clean);
      });
  }
}

function loadLevel(num, skipIntro = false) {
  level = generateLevel(num);
  positions = level.starts.map(s => ({ ...s }));
  displayPos = positions.map(p => ({ row: p.row, col: p.col }));
  moveCount = 0;
  undoStack = [];
  lastMoveDir = null;
  animating = false;
  prevOnTarget = positions.map((p, i) =>
    p.row === level.targets[i].row && p.col === level.targets[i].col
  );
  renderer.clearTrails();
  hintSolution = null;
  hintIndex = 0;
  hintMessage = '';
  claimMessage = '';
  state = State.PLAYING;
  audio.playLevelStart();

  // Save session progress
  persistSession();

  // Level intro dialogue for milestone levels
  if (!skipIntro) {
    const intro = dialogue.getLevelIntro(num);
    if (intro) {
      dialogue.startDialogue(intro, null);
    }
  }
}

function persistSession() {
  saveSession({
    levelNum,
    totalScore,
    totalStars,
    lives
  });
}

function showHint() {
  if (!level) return;
  const sol = solveBFS(positions, level.targets, level.grids, level.gridSize, level.portals);
  if (!sol || sol.length === 0) {
    hintMessage = 'No solution exists! Try pressing IMPOSSIBLE (I)';
    hintMessageTime = performance.now();
    return;
  }
  hintSolution = sol;
  hintIndex = 0;
  const arrows = { up: '\u2191 UP', down: '\u2193 DOWN', left: '\u2190 LEFT', right: '\u2192 RIGHT' };
  hintMessage = `HINT: ${arrows[sol[0]]}  (${sol.length} moves total)`;
  hintMessageTime = performance.now();
  console.log(`%cFull solution (${sol.length} moves):`, 'color: #3ea8ff; font-weight: bold');
  sol.forEach((d, i) => console.log(`  ${i + 1}. ${arrows[d]}`));
}

// ── Impossible Claim ───────────────────────────────────

function claimImpossible() {
  if (!level || animating) return;

  // Actually check solvability from CURRENT position via BFS
  const sol = solveBFS(positions, level.targets, level.grids, level.gridSize, level.portals);
  const actuallyImpossible = (sol === null);

  if (actuallyImpossible) {
    // Correct! The level IS impossible
    const bonus = 500 + levelNum * 50;
    totalScore += bonus;
    playerIQ = adjustIQ(10);

    claimMessage = `GENIUS! Level was impossible! +${bonus} pts, IQ ${playerIQ}`;
    claimMessageColor = '#3eff8e';
    claimMessageTime = performance.now();

    audio.playWin();

    // Celebration particles
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.4,
        y: H * 0.4 + (Math.random() - 0.5) * 80,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 1,
        color: '#3eff8e',
        r: 2 + Math.random() * 4
      });
    }

    // Move to next level after a brief pause
    saveLevelResult(levelNum, 0, 3);
    totalStars += 3;
    persistSession();

    setTimeout(() => { nextLevel(); }, 1200);
  } else {
    // Wrong! The level IS solvable — penalty
    const penalty = 200;
    totalScore = Math.max(0, totalScore - penalty);
    playerIQ = adjustIQ(-10);
    lives--;

    claimMessage = `WRONG! A solution exists. -${penalty} pts, -1 life, IQ ${playerIQ}`;
    claimMessageColor = '#ff3e5e';
    claimMessageTime = performance.now();

    audio.playLoseLife();
    renderer.shake(12);

    persistSession();

    if (lives <= 0) {
      state = State.GAME_OVER;
      refreshLeaderboard();
      audio.playGameOver();
      dialogue.startDialogue(dialogue.getGameOverDialogue(), () => { promptName(); });
    }
  }
}

function executeMove(dir) {
  if (!level || animating) return;

  undoStack.push(positions.map(p => ({ ...p })));
  hintSolution = null; // invalidate hint on move

  if (level.hasToggle) {
    for (let a = 0; a < level.numAgents; a++) {
      applyToggle(level.grids[a], level.toggleWalls[a], moveCount + 1);
    }
  }

  const newPos = positions.map((p, a) =>
    moveAgent(p, dir, level.grids[a], level.gridSize, level.portals[a])
  );

  const anyMoved = newPos.some((np, i) =>
    np.row !== positions[i].row || np.col !== positions[i].col
  );

  if (!anyMoved) {
    undoStack.pop();
    audio.playBlocked();
    renderer.shake(4);
    return;
  }

  // Check for portal usage
  const usedPortal = newPos.some((np, a) => {
    const portals = level.portals[a];
    if (!portals || portals.length === 0) return false;
    for (const p of portals) {
      const moved = moveAgent(positions[a], dir, level.grids[a], level.gridSize, []);
      if ((moved.row !== np.row || moved.col !== np.col)) return true;
    }
    return false;
  });
  if (usedPortal) audio.playPortal();

  animFrom = positions.map(p => ({ ...p }));
  animTo = newPos;
  positions = newPos;
  moveCount++;
  lastMoveDir = dir;
  animating = true;
  animStart = performance.now();

  audio.playMove();

  // Move limit check (impossible levels have no move limit)
  const moveLimit = level.impossible ? Infinity : level.par * 3;
  if (moveCount >= moveLimit && !checkWin(positions, level.targets)) {
    animating = false;
    displayPos = positions.map(p => ({ row: p.row, col: p.col }));
    lives--;
    playerIQ = adjustIQ(-5);
    audio.playLoseLife();
    renderer.shake(12);
    persistSession();
    if (lives <= 0) {
      state = State.GAME_OVER;
      refreshLeaderboard();
      audio.playGameOver();
      dialogue.startDialogue(dialogue.getGameOverDialogue(), () => { promptName(); });
    } else {
      dialogue.startDialogue(dialogue.getLoseLifeDialogue(), () => { loadLevel(levelNum, true); });
    }
  }
}

function updateAnimation(now) {
  if (!animating) return;
  const t = Math.min((now - animStart) / ANIM_DURATION, 1);
  const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  displayPos = animFrom.map((from, i) => ({
    row: from.row + (animTo[i].row - from.row) * ease,
    col: from.col + (animTo[i].col - from.col) * ease
  }));

  if (t >= 1) {
    animating = false;
    displayPos = positions.map(p => ({ row: p.row, col: p.col }));

    // Check per-agent target landing (for sound)
    const nowOnTarget = positions.map((p, i) =>
      p.row === level.targets[i].row && p.col === level.targets[i].col
    );
    for (let i = 0; i < nowOnTarget.length; i++) {
      if (nowOnTarget[i] && !prevOnTarget[i]) {
        audio.playAgentLand();
        // Spawn small burst at that agent
        const { layouts } = getMazeLayout();
        if (layouts[i]) {
          const lay = layouts[i];
          const px = lay.x + positions[i].col * lay.cellSize + lay.cellSize / 2;
          const py = lay.y + positions[i].row * lay.cellSize + lay.cellSize / 2;
          for (let j = 0; j < 8; j++) {
            const a = (Math.PI * 2 * j) / 8;
            particles.push({
              x: px, y: py,
              vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5,
              life: 1, color: AGENT_COLORS[i], r: 3
            });
          }
        }
      }
    }
    prevOnTarget = nowOnTarget;

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
  playerIQ = adjustIQ(stars >= 3 ? 5 : stars >= 2 ? 3 : 1);
  saveLevelResult(levelNum, moveCount, stars);
  persistSession();

  // Update leaderboard in DB on every win (upsert keeps best score)
  if (playerName) {
    addEntry(playerName, totalScore, levelNum, totalStars, playerIQ)
      .then(() => refreshLeaderboard()).catch(() => {});
  }
  winTime = performance.now();
  state = State.WIN;

  audio.playWin();

  // Win dialogue
  dialogue.startDialogue(dialogue.getWinDialogue(stars), null);

  // Big celebration particles
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x: W / 2 + (Math.random() - 0.5) * W * 0.5,
      y: H * 0.35 + (Math.random() - 0.5) * 100,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      life: 1,
      color: AGENT_COLORS[Math.floor(Math.random() * level.numAgents)],
      r: 2 + Math.random() * 5
    });
  }
}

function nextLevel() {
  levelNum++;
  loadLevel(levelNum);
}

function promptName() {
  clearSession();
  setTimeout(async () => {
    if (playerName) {
      // Auto-submit with saved name
      await addEntry(playerName, totalScore, levelNum, totalStars, playerIQ);
      refreshLeaderboard();
    } else {
      // No name set — ask for one
      const name = await askForUniqueName(`GAME OVER! Score: ${totalScore} | IQ: ${playerIQ}\n\nEnter your name:`);
      if (name) {
        playerName = name;
        localStorage.setItem('hivemind_name', name);
        await addEntry(name, totalScore, levelNum, totalStars, playerIQ);
        refreshLeaderboard();
      }
    }
  }, 200);
}

async function askForUniqueName(message) {
  while (true) {
    const name = prompt(message);
    if (!name || !name.trim()) return null;
    const clean = name.trim().slice(0, 16);
    try {
      const res = await fetch(`/api/leaderboard/check/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data.available) return clean;
      message = `"${clean}" is already taken! Pick another name:`;
    } catch {
      // API down — allow it locally
      return clean;
    }
  }
}

function undo() {
  if (undoStack.length === 0 || animating) return;
  positions = undoStack.pop();
  displayPos = positions.map(p => ({ row: p.row, col: p.col }));
  moveCount = Math.max(0, moveCount - 1);
  prevOnTarget = positions.map((p, i) =>
    p.row === level.targets[i].row && p.col === level.targets[i].col
  );

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
  prevOnTarget = positions.map((p, i) =>
    p.row === level.targets[i].row && p.col === level.targets[i].col
  );
  renderer.clearTrails();

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
    p.life -= dt * 1.5;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  const ctx = renderer.ctx;
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

// ── Render ─────────────────────────────────────────────

function render(now) {
  renderer.clear(W, H);
  const ctx = renderer.ctx;

  if (state === State.AGE_GATE) renderAgeGate(ctx, now);
  else if (state === State.MENU) renderMenu(ctx, now);
  else if (state === State.PLAYING || state === State.WIN) renderGame(ctx);
  else if (state === State.GAME_OVER) renderGameOver(ctx);
  else if (state === State.LEADERBOARD) renderLeaderboard(ctx);

  drawParticles();

  // Dialogue overlay (renders on top of everything)
  dialogue.draw(ctx, W, H, now / 1000);

  // Mute button (always visible)
  drawMuteButton(ctx);

  renderer.endFrame();
}

function drawMuteButton(ctx) {
  const z = getMuteZone();
  const hover = isInside(mouseX, mouseY, z);
  ctx.save();
  ctx.fillStyle = hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
  ctx.fillRect(z.x, z.y, z.w, z.h);
  ctx.fillStyle = audio.isMuted() ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.5)';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(audio.isMuted() ? '\uD83D\uDD07' : '\uD83D\uDD0A', z.x + z.w / 2, z.y + z.h / 2);
  ctx.restore();
}

function renderAgeGate(ctx, now) {
  const t = now / 1000;

  // Ominous red radial glow
  const grad = ctx.createRadialGradient(W / 2, H * 0.15, 0, W / 2, H * 0.15, 350);
  grad.addColorStop(0, 'rgba(255, 30, 30, 0.06)');
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Pulsing border vignette
  const vPulse = 0.03 + Math.sin(t * 1.5) * 0.015;
  const vGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
  vGrad.addColorStop(0, 'transparent');
  vGrad.addColorStop(1, `rgba(255, 20, 20, ${vPulse})`);
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, W, H);

  // Warning triangle
  const iconY = H * 0.18;
  ctx.save();
  ctx.shadowColor = '#ff3e5e';
  ctx.shadowBlur = 25 + Math.sin(t * 2) * 8;

  ctx.beginPath();
  ctx.moveTo(W / 2, iconY - 32);
  ctx.lineTo(W / 2 + 38, iconY + 28);
  ctx.lineTo(W / 2 - 38, iconY + 28);
  ctx.closePath();
  ctx.strokeStyle = '#ff3e5e';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Exclamation mark
  ctx.fillStyle = '#ff3e5e';
  ctx.font = 'bold 30px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', W / 2, iconY + 6);
  ctx.restore();

  // Title
  ctx.save();
  ctx.shadowColor = '#ff3e5e';
  ctx.shadowBlur = 18;
  renderer.text('AGE VERIFICATION', W / 2, H * 0.3, { color: '#ff3e5e', size: 30, bold: true });
  ctx.shadowBlur = 0;
  ctx.restore();

  // Divider line
  ctx.strokeStyle = 'rgba(255, 62, 94, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 130, H * 0.34);
  ctx.lineTo(W / 2 + 130, H * 0.34);
  ctx.stroke();

  // Description text
  const lines = [
    'This game contains mature themes and',
    'psychological content intended for',
    'players aged 18 and above.',
    '',
    'By proceeding, you confirm that you',
    'are at least 18 years of age.'
  ];

  lines.forEach((line, i) => {
    renderer.text(line, W / 2, H * 0.40 + i * 24, {
      color: line ? 'rgba(255, 255, 255, 0.6)' : 'transparent', size: 14
    });
  });

  // Buttons
  const btnY = H * 0.58;
  const confirmZone = { x: W / 2 - 140, y: btnY, w: 280, h: 54 };
  const exitZone = { x: W / 2 - 140, y: btnY + 68, w: 280, h: 54 };

  const confirmHover = isInside(mouseX, mouseY, confirmZone);
  renderer.drawButton(confirmZone.x, confirmZone.y, confirmZone.w, confirmZone.h,
    'I AM 18 OR OLDER', confirmHover, true);

  const exitHover = isInside(mouseX, mouseY, exitZone);
  renderer.drawButton(exitZone.x, exitZone.y, exitZone.w, exitZone.h, 'EXIT', exitHover);

  // Subtle animated particles
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 8; i++) {
    const px = W / 2 + Math.sin(t * 0.3 + i * 1.8) * 180;
    const py = H * 0.5 + Math.cos(t * 0.25 + i * 2.1) * 120;
    ctx.beginPath();
    ctx.arc(px, py, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3e5e';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Footer
  renderer.text('HIVEMIND', W / 2, H - 30, { color: 'rgba(255, 255, 255, 0.12)', size: 11 });
}

function renderMenu(ctx, now) {
  const t = now / 1000;

  // Title with glow
  ctx.save();
  ctx.shadowColor = '#f0c040';
  ctx.shadowBlur = 20;
  renderer.text('HIVEMIND', W / 2, H * 0.18, { color: '#f0c040', size: 58, bold: true });
  ctx.shadowBlur = 0;
  ctx.restore();

  renderer.text('One Mind. Many Bodies. Zero Margin for Error.', W / 2, H * 0.18 + 40, {
    color: 'rgba(255,255,255,0.35)', size: 13
  });

  // Player info line
  let infoY = H * 0.18 + 60;
  if (playerName) {
    const iq = getIQ();
    renderer.text(`Player: ${playerName}   IQ: ${iq}`, W / 2, infoY, {
      color: '#3ea8ff', size: 12
    });
    // Change name button (small, right of player info)
    const cnZone = { x: W / 2 + 120, y: infoY - 10, w: 90, h: 22 };
    const cnH = isInside(mouseX, mouseY, cnZone);
    ctx.save();
    ctx.fillStyle = cnH ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    renderer.roundRect(cnZone.x, cnZone.y, cnZone.w, cnZone.h, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = cnH ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CHANGE NAME', cnZone.x + cnZone.w / 2, cnZone.y + cnZone.h / 2);
    ctx.restore();
    infoY += 18;
  }

  // Show saved session info
  const session = loadSession();
  if (session && session.levelNum > 1) {
    renderer.text(`Resume: Level ${session.levelNum} | Score: ${session.totalScore}`, W / 2, infoY, {
      color: 'rgba(62,168,255,0.5)', size: 11
    });
  }

  // Animated network graph
  const cx = W / 2, cy = H * 0.38;
  const nodeCount = 7;
  const nodes = [];
  for (let i = 0; i < nodeCount; i++) {
    const a = (Math.PI * 2 * i) / nodeCount + t * 0.25;
    const r = 50 + Math.sin(t * 0.6 + i * 1.2) * 12;
    nodes.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }

  // Connections with pulse
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const alpha = 0.06 + Math.sin(t * 1.5 + i * 0.7 + j * 0.3) * 0.04;
      ctx.strokeStyle = `rgba(240,192,64,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(nodes[i].x, nodes[i].y);
      ctx.lineTo(nodes[j].x, nodes[j].y);
      ctx.stroke();

      // Traveling pulse dot along some connections
      if ((i + j) % 3 === 0) {
        const pulseFrac = (t * 0.5 + i * 0.2) % 1;
        const px = nodes[i].x + (nodes[j].x - nodes[i].x) * pulseFrac;
        const py = nodes[i].y + (nodes[j].y - nodes[i].y) * pulseFrac;
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240,192,64,${0.3 * (1 - Math.abs(pulseFrac - 0.5) * 2)})`;
        ctx.fill();
      }
    }
  }

  // Nodes with glow
  for (let i = 0; i < nodes.length; i++) {
    const c = AGENT_COLORS[i % AGENT_COLORS.length];
    ctx.shadowColor = c;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(nodes[i].x, nodes[i].y, 7, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Center node
  ctx.shadowColor = '#f0c040';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#f0c040';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Buttons
  const btnY = H * 0.55;
  const playH = isInside(mouseX, mouseY, { x: W / 2 - 120, y: btnY, w: 240, h: 54 });
  renderer.drawButton(W / 2 - 120, btnY, 240, 54, 'PLAY', playH, true);

  const lbH = isInside(mouseX, mouseY, { x: W / 2 - 120, y: btnY + 68, w: 240, h: 54 });
  renderer.drawButton(W / 2 - 120, btnY + 68, 240, 54, 'LEADERBOARD', lbH);

  // Instructions
  const instrLines = [
    'Arrow keys / WASD / Swipe to move all agents at once',
    'Each agent has a unique maze — same input, different obstacles',
    'Get every agent to its target simultaneously',
    'Z = Undo | R = Reset | H = Hint | I = Impossible | M = Mute'
  ];
  instrLines.forEach((l, i) => {
    renderer.text(l, W / 2, H * 0.78 + i * 20, { color: 'rgba(255,255,255,0.22)', size: 12 });
  });
}

function renderGame(ctx) {
  const diff = getDifficulty(levelNum);
  const { layouts } = getMazeLayout();

  // ── Header ────
  ctx.save();
  ctx.shadowColor = '#f0c040';
  ctx.shadowBlur = 8;
  renderer.text('HIVEMIND', 24, 28, { color: '#f0c040', size: 20, bold: true, align: 'left' });
  ctx.shadowBlur = 0;
  ctx.restore();

  renderer.text(`Level ${levelNum}`, W - 60, 20, { color: 'rgba(255,255,255,0.6)', size: 13, align: 'right' });

  // Show player IQ instead of static difficulty IQ
  const iqColor = playerIQ >= 150 ? '#f0c040' : playerIQ >= 120 ? '#3ea8ff' : playerIQ < 80 ? '#ff3e5e' : 'rgba(255,255,255,0.4)';
  renderer.text(`IQ: ${playerIQ}  (${diff.name})`, W - 60, 38, {
    color: iqColor, size: 11, align: 'right'
  });

  // Move progress bar
  const moveLimit = level.impossible ? 15 : level.par * 3;
  const movePct = level.impossible ? 0 : moveCount / moveLimit;
  const barX = 24, barY = 50, barW = 200;
  const barColor = movePct > 0.8 ? '#ff3e5e' : movePct > 0.5 ? '#f0c040' : '#3ea8ff';
  renderer.drawProgressBar(barX, barY, barW, 6, movePct, barColor);

  const moveColor = movePct > 0.8 ? '#ff3e5e' : movePct > 0.5 ? '#f0c040' : 'rgba(255,255,255,0.5)';
  renderer.text(`Moves: ${moveCount}${level.impossible ? '' : ` / ${moveLimit}`}`, barX, barY + 20, {
    color: moveColor, size: 11, align: 'left'
  });
  if (!level.impossible) {
    renderer.text(`Par: ${level.par}`, barX + barW, barY + 20, {
      color: 'rgba(255,255,255,0.25)', size: 11, align: 'right'
    });
  }

  // Lives
  for (let i = 0; i < 5; i++) {
    const hx = W - 64 - (4 - i) * 20;
    drawDiamond(ctx, hx, 58, 7, i < lives ? '#f0c040' : 'rgba(255,255,255,0.06)');
  }

  // Score centered
  const scoreLabel = playerName ? `${playerName}  |  Score: ${totalScore}` : `Score: ${totalScore}`;
  renderer.text(scoreLabel, W / 2, 88, { color: 'rgba(255,255,255,0.3)', size: 11 });

  // Features
  const features = [];
  if (level.hasPortals) features.push('PORTALS');
  if (level.hasToggle) features.push('TOGGLE WALLS');
  if (features.length) {
    ctx.save();
    ctx.shadowColor = '#ff8f00';
    ctx.shadowBlur = 6;
    renderer.text(features.join(' + '), W / 2, 72, { color: '#ff8f00', size: 10 });
    ctx.shadowBlur = 0;
    ctx.restore();
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
    const stars = getStars(moveCount, level.par);

    ctx.save();
    ctx.shadowColor = '#3eff8e';
    ctx.shadowBlur = 15;
    renderer.text('SOLVED!', W / 2, H - 120, { color: '#3eff8e', size: 26, bold: true });
    ctx.shadowBlur = 0;
    ctx.restore();

    renderer.drawStars(W / 2, H - 90, stars);

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

    // Impossible button — red accent style
    const impH = isInside(mouseX, mouseY, zones.impossible);
    ctx.save();
    const impZone = zones.impossible;
    ctx.fillStyle = impH ? 'rgba(255, 62, 94, 0.25)' : 'rgba(255, 62, 94, 0.08)';
    ctx.strokeStyle = impH ? '#ff3e5e' : 'rgba(255, 62, 94, 0.3)';
    ctx.lineWidth = 1.5;
    renderer.roundRect(impZone.x, impZone.y, impZone.w, impZone.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = impH ? '#ff3e5e' : 'rgba(255, 62, 94, 0.7)';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IMPOSSIBLE', impZone.x + impZone.w / 2, impZone.y + impZone.h / 2);
    ctx.restore();

    const menuH = isInside(mouseX, mouseY, zones.menu);
    renderer.drawButton(zones.menu.x, zones.menu.y, zones.menu.w, zones.menu.h, 'MENU', menuH);
  }

  // Claim message (impossible result feedback)
  if (claimMessage && performance.now() - claimMessageTime < 6000) {
    const elapsed = performance.now() - claimMessageTime;
    const alpha = Math.min(1, 1 - (elapsed - 3500) / 2500);
    if (alpha > 0) {
      ctx.save();
      ctx.shadowColor = claimMessageColor;
      ctx.shadowBlur = 10 * alpha;
      ctx.globalAlpha = alpha;
      renderer.text(claimMessage, W / 2, H - 155, {
        color: claimMessageColor, size: 13, bold: true
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // Hint message
  if (hintMessage && performance.now() - hintMessageTime < 8000) {
    const alpha = Math.min(1, 1 - (performance.now() - hintMessageTime - 5000) / 3000);
    if (alpha > 0) {
      ctx.save();
      ctx.shadowColor = '#3ea8ff';
      ctx.shadowBlur = 10;
      ctx.globalAlpha = alpha;
      renderer.text(hintMessage, W / 2, H - 140, {
        color: '#3ea8ff', size: 14, bold: true
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // Direction arrow (fade out)
  if (lastMoveDir && state === State.PLAYING) {
    const arrows = { up: '\u2191', down: '\u2193', left: '\u2190', right: '\u2192' };
    renderer.text(arrows[lastMoveDir], W / 2, H - 28, { color: 'rgba(255,255,255,0.12)', size: 22 });
  }
}

function renderGameOver(ctx) {
  ctx.save();
  ctx.shadowColor = '#ff3e5e';
  ctx.shadowBlur = 20;
  renderer.text('GAME OVER', W / 2, H * 0.18, { color: '#ff3e5e', size: 40, bold: true });
  ctx.shadowBlur = 0;
  ctx.restore();

  const lines = [
    `Reached Level ${levelNum}`,
    `Total Score: ${totalScore}`,
    `Stars Earned: ${totalStars}`,
    `IQ: ${playerIQ}`,
    `Rating: ${getDifficulty(levelNum).name}`
  ];

  lines.forEach((l, i) => {
    const c = i === 3 ? '#f0c040' : 'rgba(255,255,255,0.55)';
    renderer.text(l, W / 2, H * 0.34 + i * 32, { color: c, size: 16 });
  });

  renderer.text(`Leaderboard: #${cachedRank}`, W / 2, H * 0.34 + lines.length * 32 + 18, {
    color: cachedRank <= 3 ? '#f0c040' : 'rgba(255,255,255,0.35)', size: 14
  });

  const bh = isInside(mouseX, mouseY, { x: W / 2 - 100, y: H * 0.7, w: 200, h: 54 });
  renderer.drawButton(W / 2 - 100, H * 0.7, 200, 54, 'MAIN MENU', bh, true);
}

function renderLeaderboard(ctx) {
  ctx.save();
  ctx.shadowColor = '#f0c040';
  ctx.shadowBlur = 12;
  renderer.text('LEADERBOARD', W / 2, 50, { color: '#f0c040', size: 30, bold: true });
  ctx.shadowBlur = 0;
  ctx.restore();

  const board = cachedBoard;
  // Center the table with max width
  const tableW = Math.min(W - 60, 650);
  const tableX = (W - tableW) / 2;

  if (board.length === 0) {
    renderer.text('No entries yet. Be the first!', W / 2, 130, {
      color: 'rgba(255,255,255,0.35)', size: 14
    });
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('#', tableX, 95);
    ctx.fillText('Name', tableX + 36, 95);
    ctx.fillText('Score', tableX + tableW * 0.40, 95);
    ctx.fillText('Lvl', tableX + tableW * 0.55, 95);
    ctx.fillText('Stars', tableX + tableW * 0.68, 95);
    ctx.fillText('IQ', tableX + tableW * 0.82, 95);
    ctx.fillText('Date', tableX + tableW * 0.90, 95);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(tableX, 102); ctx.lineTo(tableX + tableW, 102); ctx.stroke();

    const max = Math.min(board.length, 14);
    for (let i = 0; i < max; i++) {
      const e = board[i];
      const y = 124 + i * 28;
      const top3 = i < 3;
      ctx.font = `${top3 ? 'bold ' : ''}12px "JetBrains Mono", monospace`;
      ctx.fillStyle = top3 ? '#f0c040' : 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, tableX, y);
      ctx.fillText(e.name, tableX + 36, y);
      ctx.fillText(`${e.score}`, tableX + tableW * 0.40, y);
      ctx.fillText(`${e.level}`, tableX + tableW * 0.55, y);
      ctx.fillText(`${e.stars}\u2605`, tableX + tableW * 0.68, y);
      ctx.fillText(`${e.iq || '?'}`, tableX + tableW * 0.82, y);
      ctx.fillText(e.date || '', tableX + tableW * 0.90, y);
    }
  }

  const bh = isInside(mouseX, mouseY, { x: W / 2 - 90, y: H - 76, w: 180, h: 50 });
  renderer.drawButton(W / 2 - 90, H - 76, 180, 50, 'BACK', bh);
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
  const dt = Math.min((now - lastTime) / 1000, 0.05); // cap dt
  lastTime = now;

  renderer.tick(dt);
  renderer.updateTrails(dt);
  dialogue.update(dt);
  updateAnimation(now);
  updateParticles(dt);
  render(now);

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// Expose for console debugging / hint solving
window.__hivemind = {
  getState: () => ({ level, positions, moveCount, playerIQ }),
  solve: () => {
    if (!level) return 'No level loaded';
    if (level.impossible) return 'This level is IMPOSSIBLE! Press I or click IMPOSSIBLE to claim it.';
    const sol = solveBFS(positions, level.targets, level.grids, level.gridSize, level.portals);
    if (!sol) return 'No solution found from current state';
    const arrows = { up: '\u2191 UP', down: '\u2193 DOWN', left: '\u2190 LEFT', right: '\u2192 RIGHT' };
    return sol.map((d, i) => `Step ${i + 1}: ${arrows[d]}`).join('\n');
  },
  isImpossible: () => level ? level.impossible : null
};
