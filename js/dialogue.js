// HIVEMIND - Dialogue System
// NPC chat with typing animations, voice, and visual effects

import { speak, stop as stopTTS } from './tts.js';
import { playTypingClick } from './audio.js';

// ── Dialogue Content ──────────────────────────────

const WELCOME = [
  { speaker: 'HIVEMIND', text: "Neural link established. Welcome, Operator." },
  { speaker: 'HIVEMIND', text: "I am HIVEMIND \u2014 a distributed intelligence spanning multiple bodies." },
  { speaker: 'PLAYER', text: "What exactly do I need to do?" },
  { speaker: 'HIVEMIND', text: "My agents are trapped in parallel mazes. They share your commands, but each faces unique obstacles." },
  { speaker: 'HIVEMIND', text: "Move them as one mind. Guide every agent to its target. Simultaneously." },
  { speaker: 'PLAYER', text: "Sounds intense. Let's begin." },
  { speaker: 'HIVEMIND', text: "Initiating Protocol One..." }
];

const LEVEL_INTROS = {
  4: [
    { speaker: 'HIVEMIND', text: "A third mind joins the collective. Three agents, one command." },
    { speaker: 'PLAYER', text: "Three at once..." },
    { speaker: 'HIVEMIND', text: "Overwhelmed already? We're just getting started, Operator." }
  ],
  7: [
    { speaker: 'HIVEMIND', text: "Four agents deployed. Larger grids. Your cognitive capacity is being... assessed." },
    { speaker: 'PLAYER', text: "Assessed for what exactly?" },
    { speaker: 'HIVEMIND', text: "For whether you're worth keeping." }
  ],
  11: [
    { speaker: 'HIVEMIND', text: "Five agents now depend on you. Maximum collective." },
    { speaker: 'HIVEMIND', text: "One wrong move echoes across all of them. No pressure." }
  ],
  15: [
    { speaker: 'HIVEMIND', text: "Spatial anomalies detected. Portals are now active." },
    { speaker: 'PLAYER', text: "Teleportation? This changes everything." },
    { speaker: 'HIVEMIND', text: "Enter one end, emerge from the other. Mind the displacement." }
  ],
  22: [
    { speaker: 'HIVEMIND', text: "The mazes are alive now. Toggle walls shift with every move." },
    { speaker: 'PLAYER', text: "Walls that change state? How do I plan for that?" },
    { speaker: 'HIVEMIND', text: "Don't plan. Feel the rhythm. Timing is everything." }
  ],
  29: [
    { speaker: 'HIVEMIND', text: "You've reached the Transcendent tier. Few Operators make it this far." },
    { speaker: 'HIVEMIND', text: "The hive... respects you." },
    { speaker: 'PLAYER', text: "Let's finish this." }
  ]
};

const WIN_MESSAGES = [
  [{ speaker: 'HIVEMIND', text: "Adequate. The hive acknowledges your solution." }],
  [{ speaker: 'HIVEMIND', text: "Synchronization achieved. Proceeding to next phase." }],
  [{ speaker: 'HIVEMIND', text: "Efficient. I expected worse, Operator." }],
  [{ speaker: 'HIVEMIND', text: "The agents reached their targets. Your neural patterns are... interesting." }],
  [{ speaker: 'HIVEMIND', text: "Solved. The collective moves forward." }],
];

const WIN_PERFECT = [
  [{ speaker: 'HIVEMIND', text: "Optimal solution. Your neural efficiency... impresses me." }],
  [{ speaker: 'HIVEMIND', text: "Perfect sync. You think like a machine. That is a compliment." }],
  [{ speaker: 'HIVEMIND', text: "Flawless. The hive has not seen precision like this in some time." }],
];

const LOSE_LIFE_MESSAGES = [
  [{ speaker: 'HIVEMIND', text: "Connection unstable. You've lost a neural link." },
   { speaker: 'HIVEMIND', text: "Recalibrate and try again, Operator." }],
  [{ speaker: 'HIVEMIND', text: "Too many moves. That cost you a connection." },
   { speaker: 'HIVEMIND', text: "Fewer links remain. Use them wisely." }],
  [{ speaker: 'HIVEMIND', text: "Inefficient pathfinding detected. Link severed." },
   { speaker: 'HIVEMIND', text: "Focus. The hive demands better." }],
];

const GAME_OVER_MESSAGES = [
  [{ speaker: 'HIVEMIND', text: "All connections severed. Neural link terminated." },
   { speaker: 'HIVEMIND', text: "Perhaps the next Operator will perform better." },
   { speaker: 'PLAYER', text: "..." }],
];

// ── State ─────────────────────────────────────────

let active = false;
let messages = [];
let msgIndex = 0;
let charIndex = 0;
let typingTimer = 0;
const TYPING_SPEED = 32; // ms per character
let onComplete = null;
let slideAnim = 0; // 0 = hidden, 1 = fully visible
let cursorBlink = 0;
let waitingForInput = false;
let speakerTransition = 0;
let lastSpeaker = null;

// NPC avatar animation
let avatarPulse = 0;
let avatarParticles = [];

// ── API ───────────────────────────────────────────

export function startDialogue(msgs, callback) {
  if (!msgs || msgs.length === 0) return;
  messages = msgs;
  msgIndex = 0;
  charIndex = 0;
  typingTimer = 0;
  active = true;
  waitingForInput = false;
  slideAnim = 0;
  cursorBlink = 0;
  speakerTransition = 0;
  lastSpeaker = null;
  onComplete = callback || null;
  avatarParticles = [];

  // TTS for first message (only HIVEMIND speaks aloud)
  const first = msgs[0];
  if (first && first.speaker === 'HIVEMIND') {
    speak(first.text, 0.85, 0.7);
  }
}

export function isActive() { return active; }

export function advance() {
  if (!active) return;

  const current = messages[msgIndex];
  if (!current) return;

  if (charIndex < current.text.length) {
    // Skip to end of current message
    charIndex = current.text.length;
    waitingForInput = true;
    return;
  }

  // Move to next message
  msgIndex++;
  if (msgIndex >= messages.length) {
    active = false;
    stopTTS();
    if (onComplete) {
      const cb = onComplete;
      onComplete = null;
      cb();
    }
    return;
  }

  charIndex = 0;
  typingTimer = 0;
  waitingForInput = false;
  cursorBlink = 0;

  // Speaker change animation
  const next = messages[msgIndex];
  if (next.speaker !== lastSpeaker) {
    speakerTransition = 0;
  }

  // TTS for HIVEMIND only
  if (next.speaker === 'HIVEMIND') {
    speak(next.text, 0.85, 0.7);
  }
}

export function update(dt) {
  // Always update slide animation (for smooth close)
  if (active) {
    slideAnim = Math.min(1, slideAnim + dt * 5);
  } else {
    slideAnim = Math.max(0, slideAnim - dt * 4);
    return;
  }

  cursorBlink += dt;
  avatarPulse += dt;
  speakerTransition = Math.min(1, speakerTransition + dt * 5);

  // Typing animation
  const current = messages[msgIndex];
  if (current && charIndex < current.text.length && !waitingForInput) {
    typingTimer += dt * 1000;
    while (typingTimer >= TYPING_SPEED && charIndex < current.text.length) {
      charIndex++;
      typingTimer -= TYPING_SPEED;
      // Typing click on some characters
      if (charIndex % 2 === 0) {
        try { playTypingClick(); } catch (e) { /* audio not ready */ }
      }
    }

    if (charIndex >= current.text.length) {
      waitingForInput = true;
    }
  }

  lastSpeaker = current ? current.speaker : null;

  // Update avatar particles
  for (let i = avatarParticles.length - 1; i >= 0; i--) {
    const p = avatarParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 2.5;
    if (p.life <= 0) avatarParticles.splice(i, 1);
  }

  // Spawn avatar particles
  if (Math.random() < dt * 10 && avatarParticles.length < 15) {
    const angle = Math.random() * Math.PI * 2;
    avatarParticles.push({
      x: 0, y: 0,
      vx: Math.cos(angle) * (15 + Math.random() * 15),
      vy: Math.sin(angle) * (15 + Math.random() * 15),
      life: 1,
      size: 1 + Math.random() * 2
    });
  }
}

export function draw(ctx, W, H, time) {
  if (slideAnim <= 0.01) return;

  const panelH = 190;
  const ease = 1 - Math.pow(1 - slideAnim, 3);
  const slideOffset = (1 - ease) * (panelH + 10);
  const panelY = H - panelH + slideOffset;

  ctx.save();

  // Darken game area above panel
  ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * ease})`;
  ctx.fillRect(0, 0, W, panelY);

  // Panel background
  const grad = ctx.createLinearGradient(0, panelY, 0, panelY + panelH);
  grad.addColorStop(0, 'rgba(8, 8, 28, 0.96)');
  grad.addColorStop(0.5, 'rgba(10, 10, 32, 0.98)');
  grad.addColorStop(1, 'rgba(6, 6, 22, 0.99)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, panelY, W, panelH);

  // Scan lines for atmosphere
  ctx.globalAlpha = 0.015;
  for (let y = panelY; y < panelY + panelH; y += 2) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;

  // Top border glow line
  const current = (active && messages[msgIndex]) ? messages[msgIndex] : null;
  const isNPC = current ? current.speaker === 'HIVEMIND' : true;
  const speakerColor = isNPC ? '#f0c040' : '#3ea8ff';
  const speakerRGB = isNPC ? '240,192,64' : '62,168,255';

  ctx.shadowColor = speakerColor;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(${speakerRGB}, 0.6)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, panelY);
  ctx.lineTo(W, panelY);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Secondary subtle glow line
  ctx.strokeStyle = `rgba(${speakerRGB}, 0.08)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, panelY + 3);
  ctx.lineTo(W, panelY + 3);
  ctx.stroke();

  if (!current) { ctx.restore(); return; }

  // ── Avatar ──────────────────────────────────────
  const avatarSize = 26;
  const avatarX = isNPC ? 44 : W - 44;
  const avatarY = panelY + 55;
  const pulse = 0.5 + Math.sin(avatarPulse * 3) * 0.3;
  const transAlpha = Math.min(1, speakerTransition);

  // Avatar particles (behind avatar)
  for (const p of avatarParticles) {
    ctx.globalAlpha = p.life * 0.4 * transAlpha;
    ctx.beginPath();
    ctx.arc(avatarX + p.x, avatarY + p.y, p.size, 0, Math.PI * 2);
    ctx.fillStyle = speakerColor;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Avatar outer glow ring
  ctx.globalAlpha = transAlpha;
  ctx.shadowColor = speakerColor;
  ctx.shadowBlur = 15 * pulse;
  ctx.beginPath();
  ctx.arc(avatarX, avatarY, avatarSize, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${speakerRGB}, 0.1)`;
  ctx.fill();
  ctx.strokeStyle = speakerColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (isNPC) {
    // HIVEMIND: rotating hexagon
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI * 2 * i) / 6 + time * 0.5;
      const r = avatarSize * 0.55;
      const px = avatarX + Math.cos(a) * r;
      const py = avatarY + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = `rgba(240, 192, 64, ${pulse * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Inner rotating triangle
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * i) / 3 - time * 0.8;
      const r = avatarSize * 0.3;
      const px = avatarX + Math.cos(a) * r;
      const py = avatarY + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = `rgba(240, 192, 64, ${pulse * 0.5})`;
    ctx.fill();

    // Center eye
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f0c040';
    ctx.fill();
  } else {
    // PLAYER: simpler design
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarSize * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(62, 168, 255, ${pulse * 0.5})`;
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(avatarX, avatarY - 5, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#3ea8ff';
    ctx.fill();

    // Shoulders
    ctx.beginPath();
    ctx.arc(avatarX, avatarY + 12, 11, Math.PI + 0.3, -0.3);
    ctx.fillStyle = '#3ea8ff';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ── Speaker Name ────────────────────────────────
  const textX = 90;
  const nameAlpha = transAlpha;

  ctx.globalAlpha = nameAlpha;
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = speakerColor;
  ctx.fillText(isNPC ? 'HIVEMIND' : 'YOU', textX, panelY + 28);

  // Name underline with glow
  ctx.shadowColor = speakerColor;
  ctx.shadowBlur = 6;
  ctx.fillRect(textX, panelY + 33, isNPC ? 72 : 26, 2);
  ctx.shadowBlur = 0;

  // Status dots (animated)
  if (!waitingForInput && charIndex < current.text.length) {
    const dotX = textX + (isNPC ? 82 : 36);
    for (let i = 0; i < 3; i++) {
      const dotAlpha = 0.3 + 0.5 * Math.abs(Math.sin(time * 4 + i * 1.2));
      ctx.beginPath();
      ctx.arc(dotX + i * 8, panelY + 26, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${speakerRGB}, ${dotAlpha})`;
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // ── Message Text (typing animation) ─────────────
  const displayText = current.text.substring(0, charIndex);
  const maxWidth = W - 130;

  ctx.font = '14px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
  ctx.textAlign = 'left';

  // Word wrap
  const words = displayText.split(' ');
  let line = '';
  let lineY = panelY + 62;
  const lineHeight = 22;

  for (const word of words) {
    const testLine = line + (line ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, textX, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, textX, lineY);

  // Blinking cursor
  if (charIndex < current.text.length || (waitingForInput && Math.sin(cursorBlink * 5) > 0)) {
    const cursorX = textX + ctx.measureText(line).width + 3;
    ctx.fillStyle = speakerColor;
    ctx.globalAlpha = charIndex < current.text.length ? 0.9 : 0.6;
    ctx.fillRect(cursorX, lineY - 13, 2, 17);
    ctx.globalAlpha = 1;
  }

  // ── Continue prompt ─────────────────────────────
  if (waitingForInput) {
    const promptAlpha = 0.25 + Math.sin(time * 3) * 0.15;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 255, 255, ${promptAlpha})`;
    ctx.fillText('\u25B6  Click or press SPACE to continue', W / 2, panelY + panelH - 18);

    // Bouncing arrow
    const arrowY = panelY + panelH - 35 + Math.sin(time * 3.5) * 3;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 5, arrowY);
    ctx.lineTo(W / 2, arrowY + 5);
    ctx.lineTo(W / 2 + 5, arrowY);
    ctx.strokeStyle = `rgba(${speakerRGB}, ${promptAlpha * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // ── Message counter ─────────────────────────────
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillText(`${msgIndex + 1} / ${messages.length}`, W - 20, panelY + panelH - 10);

  ctx.restore();
}

// ── Dialogue Getters ──────────────────────────────

export function getWelcomeDialogue() { return [...WELCOME]; }

export function getLevelIntro(levelNum) {
  if (LEVEL_INTROS[levelNum]) return [...LEVEL_INTROS[levelNum]];
  return null;
}

export function getWinDialogue(stars) {
  if (stars === 3) {
    return [...WIN_PERFECT[Math.floor(Math.random() * WIN_PERFECT.length)]];
  }
  return [...WIN_MESSAGES[Math.floor(Math.random() * WIN_MESSAGES.length)]];
}

export function getLoseLifeDialogue() {
  return [...LOSE_LIFE_MESSAGES[Math.floor(Math.random() * LOSE_LIFE_MESSAGES.length)]];
}

export function getGameOverDialogue() {
  return [...GAME_OVER_MESSAGES[Math.floor(Math.random() * GAME_OVER_MESSAGES.length)]];
}
