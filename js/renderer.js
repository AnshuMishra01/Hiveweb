// HIVEMIND - Canvas Renderer
// Draws multiple grids with agents, targets, walls, portals

import { AGENT_COLORS } from './level.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
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
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);

    // Subtle dot grid
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    for (let x = 20; x < w; x += 30) {
      for (let y = 20; y < h; y += 30) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  tick(dt) {
    this.time += dt;
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

    // Grid border
    ctx.save();
    ctx.strokeStyle = solved ? color : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = solved ? 2 : 1;
    this.roundRect(x - 2, y - 2, totalSize + 4, totalSize + 4, 6);
    ctx.stroke();

    if (solved) {
      ctx.fillStyle = `${color}11`;
      ctx.fill();
    }

    // Label
    ctx.fillStyle = color;
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + totalSize / 2, y - 8);

    // Cells
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cx = x + c * cellSize;
        const cy = y + r * cellSize;

        if (grid[r][c] === 1) {
          // Wall
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
          // Wall pattern (cross-hatch)
          ctx.strokeStyle = 'rgba(255,255,255,0.04)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(cx + 2, cy + 2);
          ctx.lineTo(cx + cellSize - 2, cy + cellSize - 2);
          ctx.moveTo(cx + cellSize - 2, cy + 2);
          ctx.lineTo(cx + 2, cy + cellSize - 2);
          ctx.stroke();
        } else {
          // Empty cell
          ctx.fillStyle = 'rgba(255,255,255,0.015)';
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
        }
      }
    }

    // Toggle walls (blinking)
    if (toggleWalls && toggleWalls.length > 0) {
      for (const tw of toggleWalls) {
        const cx = x + tw.col * cellSize;
        const cy = y + tw.row * cellSize;
        const active = moveCount % 2 === 0;
        if (active) {
          ctx.fillStyle = 'rgba(255, 100, 0, 0.15)';
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
          ctx.strokeStyle = 'rgba(255, 100, 0, 0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
        } else {
          const pulse = 0.1 + Math.sin(this.time * 4) * 0.05;
          ctx.fillStyle = `rgba(255, 100, 0, ${pulse})`;
          ctx.fillRect(cx + 1, cy + 1, cellSize - 2, cellSize - 2);
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
          const pulse = 0.4 + Math.sin(this.time * 3) * 0.2;

          ctx.beginPath();
          ctx.arc(cx, cy, pr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 143, 0, ${pulse})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Spinning inner
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(this.time * 2);
          ctx.beginPath();
          ctx.arc(0, 0, pr * 0.5, 0, Math.PI);
          ctx.strokeStyle = `rgba(255, 143, 0, ${pulse * 0.7})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // Target (pulsing ring)
    if (targetPos) {
      const tx = x + targetPos.col * cellSize + cellSize / 2;
      const ty = y + targetPos.row * cellSize + cellSize / 2;
      const tr = cellSize * 0.35;
      const pulse = 0.4 + Math.sin(this.time * 2.5) * 0.2;

      ctx.beginPath();
      ctx.arc(tx, ty, tr, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Inner dot
      ctx.beginPath();
      ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = pulse * 0.8;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Agent (smooth interpolated position)
    const dp = agentDisplayPos || agentPos;
    if (dp) {
      const ax = x + dp.col * cellSize + cellSize / 2;
      const ay = y + dp.row * cellSize + cellSize / 2;
      const ar = cellSize * 0.3;

      // Glow
      const grad = ctx.createRadialGradient(ax, ay, ar * 0.5, ax, ay, ar * 2);
      grad.addColorStop(0, `${color}33`);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.fillRect(ax - ar * 2, ay - ar * 2, ar * 4, ar * 4);

      // Body
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Highlight
      ctx.beginPath();
      ctx.arc(ax - ar * 0.2, ay - ar * 0.2, ar * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Draw direction indicator ──────────────────────────

  drawDirectionHint(x, y, dir, w) {
    const ctx = this.ctx;
    const s = 14;
    const cx = x + w / 2;
    const cy = y;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const arrows = { up: '\u2191', down: '\u2193', left: '\u2190', right: '\u2192' };
    ctx.fillText(arrows[dir] || '', 0, 0);

    ctx.restore();
  }

  // ── Draw stars ────────────────────────────────────────

  drawStars(x, y, count, maxCount = 3) {
    const ctx = this.ctx;
    ctx.font = '18px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';

    for (let i = 0; i < maxCount; i++) {
      ctx.fillStyle = i < count ? '#f0c040' : 'rgba(255,255,255,0.1)';
      ctx.fillText('\u2605', x + i * 24 - (maxCount - 1) * 12, y);
    }
  }

  // ── Button ────────────────────────────────────────────

  drawButton(x, y, w, h, text, hover, accent = false) {
    const ctx = this.ctx;
    ctx.save();
    this.roundRect(x, y, w, h, 6);

    if (accent) {
      ctx.fillStyle = hover ? '#f0c040' : 'rgba(240,192,64,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#f0c040';
    } else {
      ctx.fillStyle = hover ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = hover ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
    }
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = accent && hover ? '#0a0a1a' : accent ? '#f0c040' : hover ? '#fff' : '#aaa';
    ctx.font = `bold 13px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
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
