// HIVEMIND - Canvas Renderer
// Draws multiple grids with agents, targets, walls, portals
// Supports screen shake, trail effects, and glow animations

import { AGENT_COLORS } from './level.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
    // Screen shake
    this.shakeAmount = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    // Agent trails (per agent index → array of recent positions)
    this.trails = {};
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear(w, h) {
    const ctx = this.ctx;

    // Apply screen shake offset
    ctx.save();
    if (this.shakeAmount > 0.1) {
      this.shakeX = (Math.random() - 0.5) * this.shakeAmount;
      this.shakeY = (Math.random() - 0.5) * this.shakeAmount;
      ctx.translate(this.shakeX, this.shakeY);
      this.shakeAmount *= 0.85;
    } else {
      this.shakeAmount = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(-10, -10, w + 20, h + 20);

    // Subtle dot grid
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    for (let x = 20; x < w; x += 30) {
      for (let y = 20; y < h; y += 30) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  endFrame() {
    this.ctx.restore();
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  tick(dt) {
    this.time += dt;
  }

  // ── Record trail point for an agent ───────────────────

  recordTrail(agentIdx, px, py) {
    if (!this.trails[agentIdx]) this.trails[agentIdx] = [];
    const trail = this.trails[agentIdx];
    trail.push({ x: px, y: py, life: 1.0 });
    if (trail.length > 8) trail.shift();
  }

  updateTrails(dt) {
    for (const key of Object.keys(this.trails)) {
      const trail = this.trails[key];
      for (let i = trail.length - 1; i >= 0; i--) {
        trail[i].life -= dt * 4;
        if (trail[i].life <= 0) trail.splice(i, 1);
      }
    }
  }

  clearTrails() {
    this.trails = {};
  }

  // ── Draw a single maze grid ───────────────────────────

  drawMaze(opts) {
    const {
      grid, gridSize, x, y, cellSize,
      agentPos, agentDisplayPos, targetPos,
      colorIdx, portals, toggleWalls, moveCount,
      solved, label
    } = opts;
    const ctx = this.ctx;
    const color = AGENT_COLORS[colorIdx];
    const totalSize = gridSize * cellSize;

    // Grid border with glow when solved
    ctx.save();

    if (solved) {
      // Solved glow
      const glowPulse = 0.15 + Math.sin(this.time * 3) * 0.08;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      this.roundRect(x - 3, y - 3, totalSize + 6, totalSize + 6, 8);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = `${color}${Math.round(glowPulse * 255).toString(16).padStart(2, '0')}`;
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      this.roundRect(x - 2, y - 2, totalSize + 4, totalSize + 4, 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(11, cellSize * 0.28)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + totalSize / 2, y - 10);

    // Cells
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cx = x + c * cellSize;
        const cy = y + r * cellSize;

        if (grid[r][c] === 1) {
          // Wall — solid block with beveled edge look
          ctx.fillStyle = 'rgba(255,255,255,0.055)';
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
          // Inner shadow
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          ctx.fillRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);
          ctx.fillStyle = 'rgba(255,255,255,0.04)';
          ctx.fillRect(cx + 2, cy + 2, cellSize - 4, cellSize - 4);
        } else {
          // Empty cell — subtle tile
          ctx.fillStyle = 'rgba(255,255,255,0.012)';
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
        }
      }
    }

    // Toggle walls
    if (toggleWalls && toggleWalls.length > 0) {
      for (const tw of toggleWalls) {
        const cx = x + tw.col * cellSize;
        const cy = y + tw.row * cellSize;
        const active = moveCount % 2 === 0;
        const pulse = 0.3 + Math.sin(this.time * 5) * 0.15;

        if (active) {
          ctx.fillStyle = `rgba(255, 100, 0, 0.18)`;
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
          ctx.strokeStyle = `rgba(255, 100, 0, ${pulse + 0.1})`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
        } else {
          ctx.fillStyle = `rgba(255, 100, 0, ${pulse * 0.3})`;
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = `rgba(255, 100, 0, 0.15)`;
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
          ctx.setLineDash([]);
        }
      }
    }

    // Portals
    if (portals) {
      for (const p of portals) {
        for (const end of [p.a, p.b]) {
          const cx = x + end.col * cellSize + cellSize / 2;
          const cy = y + end.row * cellSize + cellSize / 2;
          const pr = cellSize * 0.35;
          const pulse = 0.5 + Math.sin(this.time * 3) * 0.2;

          // Outer ring glow
          ctx.shadowColor = '#ff8f00';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(cx, cy, pr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 143, 0, ${pulse})`;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;

          // Spinning arcs
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(this.time * 2.5);
          for (let a = 0; a < 3; a++) {
            ctx.beginPath();
            const start = (Math.PI * 2 * a) / 3;
            ctx.arc(0, 0, pr * 0.55, start, start + 0.8);
            ctx.strokeStyle = `rgba(255, 143, 0, ${pulse * 0.6})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }

    // Target (pulsing concentric rings)
    if (targetPos) {
      const tx = x + targetPos.col * cellSize + cellSize / 2;
      const ty = y + targetPos.row * cellSize + cellSize / 2;
      const tr = cellSize * 0.35;
      const pulse = 0.4 + Math.sin(this.time * 2.5) * 0.2;

      // Expanding ring animation
      const ringT = (this.time * 0.8) % 1;
      ctx.beginPath();
      ctx.arc(tx, ty, tr * (0.5 + ringT * 0.8), 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = (1 - ringT) * 0.2;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Main ring
      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Center crosshair
      const ch = tr * 0.3;
      ctx.strokeStyle = color;
      ctx.globalAlpha = pulse * 0.6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx - ch, ty); ctx.lineTo(tx + ch, ty);
      ctx.moveTo(tx, ty - ch); ctx.lineTo(tx, ty + ch);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Agent trails
    const trail = this.trails[colorIdx];
    if (trail && trail.length > 0) {
      for (const tp of trail) {
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, cellSize * 0.15 * tp.life, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = tp.life * 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // Agent
    const dp = agentDisplayPos || agentPos;
    if (dp) {
      const ax = x + dp.col * cellSize + cellSize / 2;
      const ay = y + dp.row * cellSize + cellSize / 2;
      const ar = cellSize * 0.32;

      // Record trail
      this.recordTrail(colorIdx, ax, ay);

      // Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = solved ? 20 : 10;
      const grad = ctx.createRadialGradient(ax, ay, ar * 0.3, ax, ay, ar * 2.5);
      grad.addColorStop(0, `${color}44`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ax, ay, ar * 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner gradient highlight
      const hlGrad = ctx.createRadialGradient(ax - ar * 0.25, ay - ar * 0.25, 0, ax, ay, ar);
      hlGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
      hlGrad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      hlGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.fillStyle = hlGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Draw stars ────────────────────────────────────────

  drawStars(x, y, count, maxCount = 3, size = 20) {
    const ctx = this.ctx;
    const spacing = size * 1.4;

    for (let i = 0; i < maxCount; i++) {
      const sx = x + i * spacing - (maxCount - 1) * spacing / 2;
      const earned = i < count;

      if (earned) {
        ctx.shadowColor = '#f0c040';
        ctx.shadowBlur = 8;
      }

      this.drawStar(sx, y, earned ? size * 0.5 : size * 0.4, earned ? '#f0c040' : 'rgba(255,255,255,0.1)');
      ctx.shadowBlur = 0;
    }
  }

  drawStar(cx, cy, r, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10 - Math.PI / 2;
      const radius = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(angle) * radius;
      const py = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  // ── Button ────────────────────────────────────────────

  drawButton(x, y, w, h, text, hover, accent = false) {
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(x, y, w, h, 6);

    if (accent) {
      if (hover) {
        ctx.shadowColor = '#f0c040';
        ctx.shadowBlur = 12;
      }
      ctx.fillStyle = hover ? '#f0c040' : 'rgba(240,192,64,0.12)';
      ctx.fill();
      ctx.strokeStyle = '#f0c040';
    } else {
      ctx.fillStyle = hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)';
      ctx.fill();
      ctx.strokeStyle = hover ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.08)';
    }
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = accent && hover ? '#0a0a1a' : accent ? '#f0c040' : hover ? '#fff' : '#999';
    ctx.font = `bold 13px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
  }

  // ── Progress bar ──────────────────────────────────────

  drawProgressBar(x, y, w, h, fraction, color, bgColor = 'rgba(255,255,255,0.04)') {
    const ctx = this.ctx;
    this.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = bgColor;
    ctx.fill();

    if (fraction > 0) {
      const fw = Math.max(h, w * Math.min(fraction, 1));
      this.roundRect(x, y, fw, h, h / 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // ── Helpers ───────────────────────────────────────────

  roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
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
  }

  text(str, x, y, { color = '#fff', size = 14, bold = false, align = 'center' } = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.font = `${bold ? 'bold ' : ''}${size}px "JetBrains Mono", monospace`;
    ctx.textAlign = align;
    ctx.fillText(str, x, y);
  }
}
