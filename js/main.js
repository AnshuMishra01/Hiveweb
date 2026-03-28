// CORTEX - Main Game Controller
import { generatePuzzle, getMaxTime, getDifficultyLabel, PROP_LABELS } from './puzzle.js';
import { Renderer } from './renderer.js';
import { getLeaderboard, addEntry, getRank } from './leaderboard.js';

// ── State ──────────────────────────────────────────────
const State = { MENU: 0, PLAYING: 1, FEEDBACK: 2, GAME_OVER: 3, LEADERBOARD: 4 };

let state = State.MENU;
let level = 1;
let score = 0;
let lives = 3;
let streak = 0;
let bestStreak = 0;
let puzzle = null;
let selectedChoice = -1;
let timerStart = 0;
let elapsed = 0;
let feedbackCorrect = false;
let feedbackTimer = 0;
let hoverChoice = -1;
let animFrame = 0;
let particles = [];

// ── Canvas Setup ───────────────────────────────────────
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
let W, H;

function resizeCanvas() {
  W = Math.min(window.innerWidth, 600);
  H = window.innerHeight;
  renderer.resize(W, H);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Input ──────────────────────────────────────────────
let mouseX = 0, mouseY = 0;

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouseX = e.clientX - rect.left;
  mouseY = e.clientY - rect.top;
});

canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  handleClick(cx, cy);
});

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  const cx = touch.clientX - rect.left;
  const cy = touch.clientY - rect.top;
  mouseX = cx;
  mouseY = cy;
  handleClick(cx, cy);
}, { passive: false });

// ── Layout helpers ─────────────────────────────────────
function getGridLayout() {
  const gridSize = Math.min(W * 0.8, 330);
  const cellSize = (gridSize - 16) / 3;
  const gx = (W - gridSize) / 2;
  const gy = 140;
  return { gx, gy, gridSize, cellSize, gap: 8 };
}

function getChoiceLayout() {
  const { gy, gridSize } = getGridLayout();
  const top = gy + gridSize + 40;
  const choiceSize = Math.min((W - 60) / 4 - 8, 90);
  const totalW = choiceSize * 4 + 24;
  const startX = (W - totalW) / 2;
  return { top, choiceSize, startX };
}

function getChoiceAt(cx, cy) {
  const { top, choiceSize, startX } = getChoiceLayout();
  if (cy < top || cy > top + choiceSize) return -1;
  for (let i = 0; i < 4; i++) {
    const x = startX + i * (choiceSize + 8);
    if (cx >= x && cx <= x + choiceSize) return i;
  }
  return -1;
}

// ── Click Handler ──────────────────────────────────────
function handleClick(cx, cy) {
  if (state === State.MENU) {
    // Play button
    if (cy > H * 0.55 && cy < H * 0.55 + 54 && cx > W / 2 - 100 && cx < W / 2 + 100) {
      startGame();
    }
    // Leaderboard button
    if (cy > H * 0.55 + 70 && cy < H * 0.55 + 124 && cx > W / 2 - 100 && cx < W / 2 + 100) {
      state = State.LEADERBOARD;
    }
    return;
  }

  if (state === State.PLAYING && puzzle) {
    const choice = getChoiceAt(cx, cy);
    if (choice >= 0) {
      selectChoice(choice);
    }
    return;
  }

  if (state === State.GAME_OVER) {
    // Check "Play Again" button
    if (cy > H * 0.72 && cy < H * 0.72 + 50 && cx > W / 2 - 90 && cx < W / 2 + 90) {
      state = State.MENU;
    }
    return;
  }

  if (state === State.LEADERBOARD) {
    // Back button
    if (cy > H - 80 && cy < H - 30 && cx > W / 2 - 80 && cx < W / 2 + 80) {
      state = State.MENU;
    }
    return;
  }
}

// ── Game Logic ─────────────────────────────────────────
function startGame() {
  level = 1;
  score = 0;
  lives = 3;
  streak = 0;
  bestStreak = 0;
  state = State.PLAYING;
  nextPuzzle();
}

function nextPuzzle() {
  puzzle = generatePuzzle(level);
  selectedChoice = -1;
  timerStart = performance.now();
  elapsed = 0;
}

function selectChoice(idx) {
  if (selectedChoice >= 0) return; // Already chose
  selectedChoice = idx;

  const maxTime = getMaxTime(level);
  const timeTaken = elapsed;

  if (idx === puzzle.correctIndex) {
    feedbackCorrect = true;
    streak++;
    if (streak > bestStreak) bestStreak = streak;

    const baseScore = level * 100;
    const timeBonus = Math.max(0, Math.floor((maxTime - timeTaken) * level * 5));
    const streakBonus = streak * 50;
    score += baseScore + timeBonus + streakBonus;

    spawnParticles(true);
  } else {
    feedbackCorrect = false;
    lives--;
    streak = 0;
    spawnParticles(false);
  }

  state = State.FEEDBACK;
  feedbackTimer = performance.now();
}

function afterFeedback() {
  if (lives <= 0) {
    state = State.GAME_OVER;
    promptName();
    return;
  }
  if (feedbackCorrect) level++;
  state = State.PLAYING;
  nextPuzzle();
}

function promptName() {
  // Defer to next frame so canvas updates
  setTimeout(() => {
    const diff = getDifficultyLabel(level);
    let name = prompt(`GAME OVER!\nScore: ${score} | Level: ${level} | IQ Estimate: ${diff.iq}\n\nEnter your name for the leaderboard:`);
    if (name && name.trim()) {
      addEntry(name.trim(), score, level, diff.iq);
    }
  }, 100);
}

// ── Particles ──────────────────────────────────────────
function spawnParticles(success) {
  const { top, choiceSize, startX } = getChoiceLayout();
  const idx = selectedChoice;
  const px = startX + idx * (choiceSize + 8) + choiceSize / 2;
  const py = top + choiceSize / 2;
  const color = success ? '#3eff8e' : '#ff3e5e';

  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;
    const speed = 2 + Math.random() * 3;
    particles.push({
      x: px, y: py,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      color,
      r: 2 + Math.random() * 3
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= dt * 2;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles(ctx) {
  for (const p of particles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ── Render ─────────────────────────────────────────────
function drawHeart(ctx, x, y, s, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.3, x - s, y - s * 0.3, x - s, y + s * 0.1);
  ctx.bezierCurveTo(x - s, y + s * 0.7, x, y + s * 1.1, x, y + s * 1.3);
  ctx.bezierCurveTo(x, y + s * 1.1, x + s, y + s * 0.7, x + s, y + s * 0.1);
  ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3, x, y + s * 0.3);
  ctx.fill();
  ctx.restore();
}

function drawButton(ctx, text, x, y, w, h, hover) {
  ctx.save();
  ctx.beginPath();
  const r = 8;
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  ctx.fillStyle = hover ? 'rgba(240,192,64,0.2)' : 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = hover ? '#f0c040' : 'rgba(255,255,255,0.2)';
  ctx.lineWidth = hover ? 2 : 1;
  ctx.stroke();

  ctx.fillStyle = hover ? '#f0c040' : '#ccc';
  ctx.font = 'bold 16px "JetBrains Mono", "Fira Code", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2);
  ctx.restore();
}

function render() {
  const ctx = renderer.ctx;
  renderer.clear();

  // Background
  ctx.fillStyle = '#08081a';
  ctx.fillRect(0, 0, W, H);

  // Subtle grid lines in background
  ctx.strokeStyle = 'rgba(255,255,255,0.015)';
  ctx.lineWidth = 1;
  for (let i = 0; i < W; i += 40) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
  }
  for (let i = 0; i < H; i += 40) {
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
  }

  if (state === State.MENU) {
    renderMenu(ctx);
  } else if (state === State.PLAYING || state === State.FEEDBACK) {
    renderGame(ctx);
  } else if (state === State.GAME_OVER) {
    renderGameOver(ctx);
  } else if (state === State.LEADERBOARD) {
    renderLeaderboard(ctx);
  }

  drawParticles(ctx);
}

function renderMenu(ctx) {
  // Title
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 56px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CORTEX', W / 2, H * 0.25);

  // Subtitle
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText('Pattern Recognition for Elite Minds', W / 2, H * 0.25 + 35);

  // Animated symbol (pulsing concentric shapes)
  const pulse = 0.8 + Math.sin(animFrame * 0.03) * 0.2;
  ctx.save();
  ctx.translate(W / 2, H * 0.42);
  ctx.scale(pulse, pulse);
  // Outer ring
  ctx.strokeStyle = 'rgba(240,192,64,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.stroke();
  // Inner shapes
  ctx.strokeStyle = 'rgba(240,192,64,0.3)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * 2 * i) / 6 + animFrame * 0.01;
    const r = 22;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Center dot
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(240,192,64,0.4)';
  ctx.fill();
  ctx.restore();

  // Buttons
  const playHover = mouseX > W / 2 - 100 && mouseX < W / 2 + 100 &&
                    mouseY > H * 0.55 && mouseY < H * 0.55 + 54;
  drawButton(ctx, 'PLAY', W / 2 - 100, H * 0.55, 200, 50, playHover);

  const lbHover = mouseX > W / 2 - 100 && mouseX < W / 2 + 100 &&
                  mouseY > H * 0.55 + 70 && mouseY < H * 0.55 + 124;
  drawButton(ctx, 'LEADERBOARD', W / 2 - 100, H * 0.55 + 70, 200, 50, lbHover);

  // Instructions
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.fillText('Deduce the hidden rules. Find the missing cell.', W / 2, H * 0.82);
  ctx.fillText('Each property follows a pattern across rows & columns.', W / 2, H * 0.82 + 20);
  ctx.fillText('More dimensions. Less time. Can you reach 200 IQ?', W / 2, H * 0.82 + 40);
}

function renderGame(ctx) {
  if (state === State.PLAYING) {
    elapsed = (performance.now() - timerStart) / 1000;
  }

  const maxTime = getMaxTime(level);
  const diff = getDifficultyLabel(level);

  // ── Header ───
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 22px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('CORTEX', 16, 30);

  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'right';
  ctx.fillText(`Level ${level}`, W - 16, 20);
  ctx.fillStyle = diff.iq === '200+' ? '#f0c040' : 'rgba(255,255,255,0.4)';
  ctx.fillText(`IQ ~${diff.iq} | ${diff.name}`, W - 16, 38);

  // Score & lives
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '13px "JetBrains Mono", monospace';
  ctx.fillText(`Score: ${score}`, 16, 55);

  // Streak
  if (streak > 0) {
    ctx.fillStyle = '#f0c040';
    ctx.fillText(`Streak: ${streak}x`, 16, 75);
  }

  // Lives (drawn hearts for cross-platform Canvas support)
  for (let i = 0; i < 3; i++) {
    const hx = W - 26 - (2 - i) * 22;
    const hy = 50;
    drawHeart(ctx, hx, hy, 8, i < lives ? '#ff3e5e' : 'rgba(255,255,255,0.15)');
  }

  // Timer bar
  const timerFrac = Math.min(elapsed / maxTime, 1);
  const barY = 92;
  const barW = W - 32;
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(16, barY, barW, 6);
  const timerColor = timerFrac > 0.8 ? '#ff3e5e' : timerFrac > 0.5 ? '#f0c040' : '#3eff8e';
  ctx.fillStyle = timerColor;
  ctx.fillRect(16, barY, barW * (1 - timerFrac), 6);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.max(0, Math.ceil(maxTime - elapsed))}s`, W / 2, barY + 20);

  // Active properties hint
  if (puzzle) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const propNames = puzzle.activeProps.map(p => PROP_LABELS[p]).join(' + ');
    ctx.fillText(`Active: ${propNames}`, W / 2, barY + 35);
  }

  // ── Grid ─────
  if (!puzzle) return;
  const { gx, gy, cellSize, gap } = getGridLayout();

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const x = gx + c * (cellSize + gap);
      const y = gy + r * (cellSize + gap);

      if (r === 2 && c === 2) {
        if (state === State.FEEDBACK) {
          // Show correct answer
          renderer.drawCell(puzzle.answer, x, y, cellSize, cellSize, {
            correct: feedbackCorrect,
            wrong: !feedbackCorrect
          });
        } else {
          renderer.drawQuestionMark(x, y, cellSize, cellSize);
        }
      } else {
        renderer.drawCell(puzzle.grid[r][c], x, y, cellSize, cellSize);
      }
    }
  }

  // ── Choices ───
  const { top, choiceSize, startX } = getChoiceLayout();
  const currentHover = state === State.PLAYING ? getChoiceAt(mouseX, mouseY) : -1;

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '12px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Select the missing piece:', W / 2, top - 12);

  for (let i = 0; i < 4; i++) {
    const x = startX + i * (choiceSize + 8);
    const opts = {};

    if (state === State.FEEDBACK) {
      if (i === puzzle.correctIndex) opts.correct = true;
      if (i === selectedChoice && !feedbackCorrect) opts.wrong = true;
    } else {
      if (i === currentHover) opts.highlight = true;
    }

    renderer.drawCell(puzzle.choices[i], x, top, choiceSize, choiceSize, opts);

    // Choice label
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String.fromCharCode(65 + i), x + choiceSize / 2, top + choiceSize + 16);
  }

  // ── Feedback text ───
  if (state === State.FEEDBACK) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px "JetBrains Mono", monospace';
    if (feedbackCorrect) {
      ctx.fillStyle = '#3eff8e';
      ctx.fillText('CORRECT', W / 2, top + choiceSize + 50);
    } else {
      ctx.fillStyle = '#ff3e5e';
      ctx.fillText(lives > 0 ? 'WRONG' : 'GAME OVER', W / 2, top + choiceSize + 50);
    }
  }

  // Auto-timeout: wrong answer if time runs out
  if (state === State.PLAYING && elapsed >= maxTime) {
    selectedChoice = -1;
    feedbackCorrect = false;
    lives--;
    streak = 0;
    state = State.FEEDBACK;
    feedbackTimer = performance.now();
  }
}

function renderGameOver(ctx) {
  const diff = getDifficultyLabel(level);

  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 36px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', W / 2, H * 0.2);

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '16px "JetBrains Mono", monospace';

  const stats = [
    `Score: ${score}`,
    `Max Level: ${level}`,
    `Best Streak: ${bestStreak}x`,
    `IQ Estimate: ~${diff.iq}`,
    `Rating: ${diff.name}`
  ];

  stats.forEach((s, i) => {
    ctx.fillStyle = i === 3 ? '#f0c040' : 'rgba(255,255,255,0.6)';
    ctx.fillText(s, W / 2, H * 0.35 + i * 30);
  });

  // Rank
  const rank = getRank(score);
  ctx.fillStyle = rank <= 3 ? '#f0c040' : 'rgba(255,255,255,0.5)';
  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillText(`Leaderboard Rank: #${rank}`, W / 2, H * 0.35 + stats.length * 30 + 20);

  // Play Again button
  const btnHover = mouseX > W / 2 - 90 && mouseX < W / 2 + 90 &&
                   mouseY > H * 0.72 && mouseY < H * 0.72 + 50;
  drawButton(ctx, 'PLAY AGAIN', W / 2 - 90, H * 0.72, 180, 50, btnHover);
}

function renderLeaderboard(ctx) {
  ctx.fillStyle = '#f0c040';
  ctx.font = 'bold 28px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LEADERBOARD', W / 2, 50);

  const board = getLeaderboard();

  if (board.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillText('No entries yet. Play to get on the board!', W / 2, 120);
  } else {
    // Header
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('#', 20, 90);
    ctx.fillText('Name', 50, 90);
    ctx.fillText('Score', W * 0.45, 90);
    ctx.fillText('Lvl', W * 0.65, 90);
    ctx.fillText('IQ', W * 0.78, 90);

    // Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(20, 98);
    ctx.lineTo(W - 20, 98);
    ctx.stroke();

    // Entries
    const maxShow = Math.min(board.length, 15);
    for (let i = 0; i < maxShow; i++) {
      const e = board[i];
      const y = 118 + i * 28;
      const isTop3 = i < 3;

      ctx.font = `${isTop3 ? 'bold ' : ''}13px "JetBrains Mono", monospace`;
      ctx.fillStyle = isTop3 ? '#f0c040' : 'rgba(255,255,255,0.6)';

      ctx.textAlign = 'left';
      ctx.fillText(`${i + 1}`, 20, y);
      ctx.fillText(e.name, 50, y);
      ctx.fillText(`${e.score}`, W * 0.45, y);
      ctx.fillText(`${e.maxLevel}`, W * 0.65, y);
      ctx.fillText(`${e.iq}`, W * 0.78, y);
    }
  }

  // Back button
  const btnHover = mouseX > W / 2 - 80 && mouseX < W / 2 + 80 &&
                   mouseY > H - 80 && mouseY < H - 30;
  drawButton(ctx, 'BACK', W / 2 - 80, H - 80, 160, 45, btnHover);
}

// ── Game Loop ──────────────────────────────────────────
let lastTime = performance.now();

function gameLoop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  animFrame++;

  // Feedback auto-advance
  if (state === State.FEEDBACK && now - feedbackTimer > 1200) {
    afterFeedback();
  }

  updateParticles(dt);
  render();
  requestAnimationFrame(gameLoop);
}

// Keyboard support
document.addEventListener('keydown', e => {
  if (state === State.PLAYING && puzzle) {
    const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3, 'a': 0, 'b': 1, 'c': 2, 'd': 3 };
    const idx = keyMap[e.key.toLowerCase()];
    if (idx !== undefined) selectChoice(idx);
  }
  if (state === State.MENU && (e.key === 'Enter' || e.key === ' ')) {
    startGame();
  }
});

requestAnimationFrame(gameLoop);
