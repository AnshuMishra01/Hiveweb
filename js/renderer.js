// CORTEX - Canvas Renderer
// Draws puzzle cells with shape, color, size, count, fill, rotation properties

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  drawCell(cell, x, y, w, h, opts = {}) {
    const { shape, color, size, count, fill, rotation } = cell;
    const ctx = this.ctx;

    // Cell background
    ctx.save();
    const radius = 8;
    this.roundRect(x, y, w, h, radius);
    ctx.fillStyle = opts.highlight
      ? 'rgba(255,255,255,0.08)'
      : 'rgba(255,255,255,0.03)';
    ctx.fill();

    if (opts.selected) {
      ctx.strokeStyle = '#f0c040';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (opts.correct) {
      ctx.strokeStyle = '#3eff8e';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (opts.wrong) {
      ctx.strokeStyle = '#ff3e5e';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw shapes
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const baseR = Math.min(w, h) * size * 0.4;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((rotation * Math.PI) / 180);

    const shapeR = count === 1 ? baseR : count === 2 ? baseR * 0.7 : baseR * 0.55;
    const gap = shapeR * 2.2;

    let positions;
    if (count === 1) {
      positions = [{ x: 0, y: 0 }];
    } else if (count === 2) {
      positions = [{ x: -gap / 2, y: 0 }, { x: gap / 2, y: 0 }];
    } else {
      positions = [{ x: -gap, y: 0 }, { x: 0, y: 0 }, { x: gap, y: 0 }];
    }

    for (const pos of positions) {
      this.drawShape(pos.x, pos.y, shapeR, shape, color, fill);
    }

    ctx.restore();
    ctx.restore();
  }

  drawQuestionMark(x, y, w, h) {
    const ctx = this.ctx;
    ctx.save();

    const radius = 8;
    this.roundRect(x, y, w, h, radius);
    ctx.fillStyle = 'rgba(240, 192, 64, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240, 192, 64, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(240, 192, 64, 0.6)';
    ctx.font = `bold ${Math.min(w, h) * 0.5}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h / 2);

    ctx.restore();
  }

  drawShape(x, y, r, shape, color, fill) {
    const ctx = this.ctx;
    ctx.beginPath();

    switch (shape) {
      case 'circle':
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
      case 'triangle':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r * 0.866, y + r * 0.5);
        ctx.lineTo(x - r * 0.866, y + r * 0.5);
        ctx.closePath();
        break;
      case 'square':
        ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
        break;
    }

    switch (fill) {
      case 'solid':
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;

      case 'empty':
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;

      case 'striped':
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.save();
        ctx.clip();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = color;
        for (let i = -r * 2; i <= r * 2; i += 5) {
          ctx.beginPath();
          ctx.moveTo(x + i, y - r * 2);
          ctx.lineTo(x + i, y + r * 2);
          ctx.stroke();
        }
        ctx.restore();
        break;
    }
  }

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
}
