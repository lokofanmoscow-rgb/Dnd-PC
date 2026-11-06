/* Отрисовка игрового поля на canvas: клетки, жетоны, подсветка, анимации */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const PATHS = {};
  function iconPath(key) {
    if (!key || !D.ICONS || !D.ICONS[key] || typeof Path2D === 'undefined') return null;
    return PATHS[key] || (PATHS[key] = new Path2D(D.ICONS[key]));
  }
  D.iconPath = iconPath;
  /* Готовая растровая иконка с тенью для жетонов: рисуется один раз, затем только копируется */
  const BITMAPS = {};
  function iconBitmap(key, color) {
    const k = key + '|' + color;
    if (BITMAPS[k]) return BITMAPS[k];
    const p = iconPath(key);
    if (!p || typeof document === 'undefined') return null;
    const px = 144;
    const cv = document.createElement('canvas');
    cv.width = px;
    cv.height = px;
    const cx = cv.getContext('2d');
    const k2 = (px * 0.86) / 512;
    cx.translate(px * 0.07, px * 0.06);
    cx.scale(k2, k2);
    cx.shadowColor = 'rgba(0,0,0,0.85)';
    cx.shadowBlur = 10;
    cx.shadowOffsetY = 3;
    cx.fillStyle = color;
    cx.fill(p);
    BITMAPS[k] = cv;
    return cv;
  }
  const U = D.U;

  const BASE = 48;
  const imgCache = {};
  function getImg(src) {
    if (!src) return null;
    if (!imgCache[src]) {
      const im = new Image();
      im.src = src;
      imgCache[src] = im;
    }
    const im = imgCache[src];
    return im.complete && im.naturalWidth ? im : null;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    r = U.clamp(Math.round(r + amt), 0, 255);
    g = U.clamp(Math.round(g + amt), 0, 255);
    b = U.clamp(Math.round(b + amt), 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ---------- Процедурная отрисовка клеток ---------- */
  const Art = {};
  Art.base = function (ctx, color, px, py, s, x, y, jitter) {
    const h = U.hash2(x, y, 3);
    ctx.fillStyle = shade(color, (h - 0.5) * (jitter || 14));
    ctx.fillRect(px, py, s, s);
  };
  Art.speckle = function (ctx, px, py, s, x, y, n, color, size, seed) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const rx = U.hash2(x * 7 + i, y * 13 + i, seed || 1);
      const ry = U.hash2(x * 11 + i, y * 5 + i, (seed || 1) + 9);
      const rs = U.hash2(x + i * 3, y + i * 7, (seed || 1) + 4);
      ctx.fillRect(px + rx * s, py + ry * s, size * (0.5 + rs), size * (0.5 + rs));
    }
  };

  const DRAW = {
    floor(ctx, px, py, s, x, y) {
      Art.base(ctx, '#77716a', px, py, s, x, y, 10);
      ctx.strokeStyle = 'rgba(30,25,20,0.45)';
      ctx.lineWidth = Math.max(1, s / 40);
      const off = (y % 2) * s * 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py + s / 2);
      ctx.lineTo(px + s, py + s / 2);
      ctx.moveTo(px + ((off + s * 0.5) % s), py);
      ctx.lineTo(px + ((off + s * 0.5) % s), py + s / 2);
      ctx.moveTo(px + (off % s) + 0.01, py + s / 2);
      ctx.lineTo(px + (off % s) + 0.01, py + s);
      ctx.stroke();
      Art.speckle(ctx, px, py, s, x, y, 4, 'rgba(255,255,255,0.05)', s / 14, 2);
    },
    flagstone(ctx, px, py, s, x, y) {
      Art.base(ctx, '#8a8378', px, py, s, x, y, 18);
      ctx.strokeStyle = 'rgba(40,32,26,0.55)';
      ctx.lineWidth = Math.max(1, s / 30);
      ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
      Art.speckle(ctx, px, py, s, x, y, 5, 'rgba(0,0,0,0.08)', s / 10, 5);
    },
    wood(ctx, px, py, s, x, y) {
      Art.base(ctx, '#7d5635', px, py, s, x, y, 8);
      ctx.strokeStyle = 'rgba(40,22,10,0.55)';
      ctx.lineWidth = Math.max(1, s / 40);
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(px, py + (s * i) / 4);
        ctx.lineTo(px + s, py + (s * i) / 4);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,220,170,0.08)';
      for (let i = 0; i < 4; i++) {
        const sx = px + U.hash2(x, y * 4 + i, 6) * s;
        ctx.beginPath();
        ctx.moveTo(sx, py + (s * i) / 4);
        ctx.lineTo(sx, py + (s * (i + 1)) / 4);
        ctx.stroke();
      }
    },
    carpet(ctx, px, py, s, x, y) {
      ctx.fillStyle = '#7d2633';
      ctx.fillRect(px, py, s, s);
      ctx.strokeStyle = '#c9a24a';
      ctx.lineWidth = Math.max(1, s / 24);
      ctx.strokeRect(px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.76);
      ctx.fillStyle = 'rgba(201,162,74,0.5)';
      ctx.beginPath();
      ctx.moveTo(px + s / 2, py + s * 0.3);
      ctx.lineTo(px + s * 0.7, py + s / 2);
      ctx.lineTo(px + s / 2, py + s * 0.7);
      ctx.lineTo(px + s * 0.3, py + s / 2);
      ctx.fill();
    },
    grass(ctx, px, py, s, x, y) {
      Art.base(ctx, '#557d3b', px, py, s, x, y, 16);
      ctx.strokeStyle = 'rgba(30,60,20,0.55)';
      ctx.lineWidth = Math.max(1, s / 36);
      for (let i = 0; i < 7; i++) {
        const gx = px + U.hash2(x * 3 + i, y, 8) * s;
        const gy = py + U.hash2(x, y * 3 + i, 9) * s;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + s * 0.04, gy - s * 0.12);
        ctx.stroke();
      }
      Art.speckle(ctx, px, py, s, x, y, 3, 'rgba(200,230,120,0.12)', s / 12, 4);
    },
    dirt(ctx, px, py, s, x, y) {
      Art.base(ctx, '#7b6143', px, py, s, x, y, 14);
      Art.speckle(ctx, px, py, s, x, y, 8, 'rgba(40,25,10,0.3)', s / 16, 3);
      Art.speckle(ctx, px, py, s, x, y, 4, 'rgba(255,230,190,0.1)', s / 16, 7);
    },
    sand(ctx, px, py, s, x, y) {
      Art.base(ctx, '#c8b07a', px, py, s, x, y, 12);
      Art.speckle(ctx, px, py, s, x, y, 10, 'rgba(120,90,40,0.25)', s / 22, 3);
    },
    snow(ctx, px, py, s, x, y) {
      Art.base(ctx, '#dde6ea', px, py, s, x, y, 10);
      Art.speckle(ctx, px, py, s, x, y, 6, 'rgba(140,170,200,0.35)', s / 18, 3);
    },
    bush(ctx, px, py, s, x, y) {
      DRAW.grass(ctx, px, py, s, x, y);
      for (let i = 0; i < 4; i++) {
        const bx = px + s * (0.25 + U.hash2(x + i, y, 2) * 0.5);
        const by = py + s * (0.25 + U.hash2(x, y + i, 3) * 0.5);
        ctx.fillStyle = i % 2 ? '#2f5a21' : '#3c6d2a';
        ctx.beginPath();
        ctx.arc(bx, by, s * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(180,40,60,0.8)';
      Art.speckle(ctx, px + s * 0.2, py + s * 0.2, s * 0.6, x, y, 2, 'rgba(200,50,60,0.9)', s / 18, 11);
    },
    marsh(ctx, px, py, s, x, y) {
      Art.base(ctx, '#4d5933', px, py, s, x, y, 12);
      ctx.fillStyle = 'rgba(40,70,80,0.65)';
      ctx.beginPath();
      ctx.ellipse(px + s * (0.3 + U.hash2(x, y, 4) * 0.4), py + s * (0.4 + U.hash2(y, x, 4) * 0.3), s * 0.28, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      Art.speckle(ctx, px, py, s, x, y, 5, 'rgba(120,150,60,0.4)', s / 14, 6);
    },
    rubble(ctx, px, py, s, x, y) {
      Art.base(ctx, '#6e6760', px, py, s, x, y, 10);
      for (let i = 0; i < 5; i++) {
        const bx = px + s * U.hash2(x + i, y * 2, 12);
        const by = py + s * U.hash2(x * 2, y + i, 13);
        const r = s * (0.06 + U.hash2(x + i, y + i, 14) * 0.08);
        ctx.fillStyle = i % 2 ? '#8d867e' : '#4f4943';
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    ice(ctx, px, py, s, x, y) {
      Art.base(ctx, '#b9dbe8', px, py, s, x, y, 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, s / 40);
      ctx.beginPath();
      ctx.moveTo(px + s * 0.1, py + s * 0.8);
      ctx.lineTo(px + s * 0.5, py + s * 0.4);
      ctx.lineTo(px + s * 0.9, py + s * 0.2);
      ctx.stroke();
    },
    web(ctx, px, py, s, x, y) {
      DRAW.floor(ctx, px, py, s, x, y);
      ctx.strokeStyle = 'rgba(240,240,240,0.65)';
      ctx.lineWidth = Math.max(1, s / 48);
      const cx = px + s / 2;
      const cy = py + s / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * s * 0.55, cy + Math.sin(a) * s * 0.55);
        ctx.stroke();
      }
      for (let r = 0.15; r < 0.5; r += 0.12) {
        ctx.beginPath();
        ctx.arc(cx, cy, s * r, 0, Math.PI * 2);
        ctx.stroke();
      }
    },
    water(ctx, px, py, s, x, y) {
      Art.base(ctx, '#3f7fae', px, py, s, x, y, 8);
      ctx.strokeStyle = 'rgba(200,235,255,0.35)';
      ctx.lineWidth = Math.max(1, s / 32);
      for (let i = 0; i < 2; i++) {
        const wy = py + s * (0.3 + i * 0.4) + U.hash2(x, y + i, 5) * s * 0.1;
        ctx.beginPath();
        ctx.arc(px + s * 0.3, wy, s * 0.12, Math.PI * 1.1, Math.PI * 1.9);
        ctx.arc(px + s * 0.7, wy, s * 0.12, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      }
    },
    deep(ctx, px, py, s, x, y) {
      Art.base(ctx, '#22507e', px, py, s, x, y, 6);
      ctx.strokeStyle = 'rgba(160,210,255,0.22)';
      ctx.lineWidth = Math.max(1, s / 32);
      const wy = py + s * 0.5;
      ctx.beginPath();
      ctx.arc(px + s * 0.5, wy, s * 0.18, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    },
    bridge(ctx, px, py, s, x, y) {
      ctx.fillStyle = '#2d5f88';
      ctx.fillRect(px, py, s, s);
      ctx.fillStyle = '#8b6a41';
      ctx.fillRect(px, py + s * 0.05, s, s * 0.9);
      ctx.strokeStyle = 'rgba(40,22,10,0.6)';
      ctx.lineWidth = Math.max(1, s / 40);
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(px + (s * i) / 5, py + s * 0.05);
        ctx.lineTo(px + (s * i) / 5, py + s * 0.95);
        ctx.stroke();
      }
    },
    lava(ctx, px, py, s, x, y) {
      const g = ctx.createRadialGradient(px + s / 2, py + s / 2, s * 0.1, px + s / 2, py + s / 2, s * 0.75);
      g.addColorStop(0, '#ffb12b');
      g.addColorStop(0.5, '#e2551b');
      g.addColorStop(1, '#8a1d0a');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, s, s);
      ctx.strokeStyle = 'rgba(255,240,140,0.6)';
      ctx.lineWidth = Math.max(1, s / 28);
      ctx.beginPath();
      ctx.moveTo(px + s * U.hash2(x, y, 1), py);
      ctx.lineTo(px + s * 0.5, py + s * 0.5);
      ctx.lineTo(px + s * U.hash2(y, x, 2), py + s);
      ctx.stroke();
    },
    fire(ctx, px, py, s, x, y) {
      DRAW.dirt(ctx, px, py, s, x, y);
      ctx.fillStyle = '#4a2e1a';
      ctx.fillRect(px + s * 0.2, py + s * 0.7, s * 0.6, s * 0.1);
      const flame = (cx, h, col) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(px + s * (cx - 0.18), py + s * 0.72);
        ctx.quadraticCurveTo(px + s * (cx - 0.2), py + s * (0.72 - h * 0.5), px + s * cx, py + s * (0.72 - h));
        ctx.quadraticCurveTo(px + s * (cx + 0.2), py + s * (0.72 - h * 0.5), px + s * (cx + 0.18), py + s * 0.72);
        ctx.fill();
      };
      flame(0.5, 0.55, '#e8541b');
      flame(0.5, 0.38, '#ffb12b');
      flame(0.5, 0.2, '#fff1a0');
    },
    pit(ctx, px, py, s) {
      const g = ctx.createRadialGradient(px + s / 2, py + s / 2, s * 0.05, px + s / 2, py + s / 2, s * 0.7);
      g.addColorStop(0, '#000');
      g.addColorStop(1, '#2a221b');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, s, s);
    },
    wall(ctx, px, py, s, x, y) {
      ctx.fillStyle = '#36312d';
      ctx.fillRect(px, py, s, s);
      ctx.strokeStyle = '#1e1a17';
      ctx.lineWidth = Math.max(1, s / 24);
      const rows = 3;
      for (let r = 0; r < rows; r++) {
        const yy = py + (s * r) / rows;
        ctx.fillStyle = shade('#4a433d', (U.hash2(x, y * 3 + r, 2) - 0.5) * 20);
        const off = (r + y) % 2 ? s / 2 : 0;
        for (let k = -1; k < 2; k++) {
          const xx = px + off + k * s;
          ctx.fillRect(Math.max(px, xx + 1), yy + 1, Math.min(s - 2, px + s - Math.max(px, xx + 1)), s / rows - 2);
        }
        ctx.beginPath();
        ctx.moveTo(px, yy);
        ctx.lineTo(px + s, yy);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(px, py + s * 0.85, s, s * 0.15);
    },
    cave(ctx, px, py, s, x, y) {
      Art.base(ctx, '#4a3f36', px, py, s, x, y, 18);
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.arc(px + s * U.hash2(x + i, y, 7), py + s * U.hash2(x, y + i, 8), s * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    tree(ctx, px, py, s, x, y) {
      DRAW.grass(ctx, px, py, s, x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(px + s * 0.55, py + s * 0.6, s * 0.42, s * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(px + s * 0.4, py + s * 0.38, s * 0.05, px + s * 0.5, py + s * 0.5, s * 0.5);
      g.addColorStop(0, '#5f9e3e');
      g.addColorStop(1, '#1f4417');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px + s * 0.5, py + s * 0.48, s * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(140,200,90,0.25)';
      ctx.beginPath();
      ctx.arc(px + s * 0.38, py + s * 0.36, s * 0.14, 0, Math.PI * 2);
      ctx.fill();
    },
    rock(ctx, px, py, s, x, y) {
      DRAW.dirt(ctx, px, py, s, x, y);
      const g = ctx.createRadialGradient(px + s * 0.4, py + s * 0.38, s * 0.05, px + s * 0.5, py + s * 0.55, s * 0.45);
      g.addColorStop(0, '#a39d96');
      g.addColorStop(1, '#4e4944');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px + s * 0.5, py + s * 0.55, s * 0.4, s * 0.33, 0.3, 0, Math.PI * 2);
      ctx.fill();
    },
    pillar(ctx, px, py, s, x, y) {
      DRAW.floor(ctx, px, py, s, x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(px + s * 0.55, py + s * 0.56, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(px + s * 0.38, py + s * 0.38, s * 0.05, px + s / 2, py + s / 2, s * 0.42);
      g.addColorStop(0, '#d8d2c7');
      g.addColorStop(1, '#7a746b');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.38, 0, Math.PI * 2);
      ctx.fill();
    },
    statue(ctx, px, py, s, x, y) {
      DRAW.floor(ctx, px, py, s, x, y);
      ctx.fillStyle = '#5a554f';
      ctx.fillRect(px + s * 0.12, py + s * 0.12, s * 0.76, s * 0.76);
      ctx.fillStyle = '#b5afa6';
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s * 0.36, s * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(px + s * 0.34, py + s * 0.48, s * 0.32, s * 0.3);
    },
    door(ctx, px, py, s, x, y, map) {
      DRAW.floor(ctx, px, py, s, x, y);
      const horiz = map && isWallish(map, x - 1, y) && isWallish(map, x + 1, y);
      ctx.fillStyle = '#6b4a2b';
      ctx.strokeStyle = '#2b1a0c';
      ctx.lineWidth = Math.max(1, s / 30);
      if (horiz) {
        ctx.fillRect(px, py + s * 0.05, s * 0.12, s * 0.9);
        ctx.strokeRect(px, py + s * 0.05, s * 0.12, s * 0.9);
      } else {
        ctx.fillRect(px + s * 0.05, py, s * 0.9, s * 0.12);
        ctx.strokeRect(px + s * 0.05, py, s * 0.9, s * 0.12);
      }
    },
    doorc(ctx, px, py, s, x, y, map) {
      DRAW.floor(ctx, px, py, s, x, y);
      const horiz = map && isWallish(map, x - 1, y) && isWallish(map, x + 1, y);
      ctx.fillStyle = '#6b4a2b';
      ctx.strokeStyle = '#2b1a0c';
      ctx.lineWidth = Math.max(1, s / 30);
      if (horiz) {
        ctx.fillRect(px, py + s * 0.3, s, s * 0.4);
        ctx.strokeRect(px, py + s * 0.3, s, s * 0.4);
        ctx.fillStyle = '#d4ad55';
        ctx.beginPath();
        ctx.arc(px + s * 0.75, py + s * 0.5, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(px + s * 0.3, py, s * 0.4, s);
        ctx.strokeRect(px + s * 0.3, py, s * 0.4, s);
        ctx.fillStyle = '#d4ad55';
        ctx.beginPath();
        ctx.arc(px + s * 0.5, py + s * 0.72, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    table(ctx, px, py, s, x, y) {
      DRAW.wood(ctx, px, py, s, x, y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(px + s * 0.1, py + s * 0.14, s * 0.84, s * 0.8);
      ctx.fillStyle = '#a0703f';
      ctx.fillRect(px + s * 0.06, py + s * 0.08, s * 0.84, s * 0.8);
      ctx.strokeStyle = '#5a3b1d';
      ctx.lineWidth = Math.max(1, s / 30);
      ctx.strokeRect(px + s * 0.06, py + s * 0.08, s * 0.84, s * 0.8);
      ctx.fillStyle = '#e6dcc8';
      ctx.beginPath();
      ctx.arc(px + s * 0.45, py + s * 0.45, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
    },
    crate(ctx, px, py, s, x, y) {
      DRAW.floor(ctx, px, py, s, x, y);
      ctx.fillStyle = '#9a7443';
      ctx.fillRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8);
      ctx.strokeStyle = '#4d3416';
      ctx.lineWidth = Math.max(1, s / 22);
      ctx.strokeRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8);
      ctx.beginPath();
      ctx.moveTo(px + s * 0.1, py + s * 0.1);
      ctx.lineTo(px + s * 0.9, py + s * 0.9);
      ctx.moveTo(px + s * 0.9, py + s * 0.1);
      ctx.lineTo(px + s * 0.1, py + s * 0.9);
      ctx.stroke();
    },
    barrel(ctx, px, py, s, x, y) {
      DRAW.floor(ctx, px, py, s, x, y);
      ctx.fillStyle = '#7d5a33';
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a2a18';
      ctx.lineWidth = Math.max(1, s / 22);
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.24, 0, Math.PI * 2);
      ctx.stroke();
    },
    chest(ctx, px, py, s, x, y) {
      DRAW.floor(ctx, px, py, s, x, y);
      ctx.fillStyle = '#8b6325';
      ctx.fillRect(px + s * 0.15, py + s * 0.25, s * 0.7, s * 0.5);
      ctx.strokeStyle = '#3d2a0c';
      ctx.lineWidth = Math.max(1, s / 24);
      ctx.strokeRect(px + s * 0.15, py + s * 0.25, s * 0.7, s * 0.5);
      ctx.fillStyle = '#e2b84d';
      ctx.fillRect(px + s * 0.15, py + s * 0.45, s * 0.7, s * 0.07);
      ctx.fillRect(px + s * 0.46, py + s * 0.42, s * 0.08, s * 0.14);
    },
    altar(ctx, px, py, s, x, y) {
      DRAW.floor(ctx, px, py, s, x, y);
      ctx.fillStyle = '#c2bbb0';
      ctx.fillRect(px + s * 0.1, py + s * 0.2, s * 0.8, s * 0.6);
      ctx.strokeStyle = '#6a645c';
      ctx.lineWidth = Math.max(1, s / 30);
      ctx.strokeRect(px + s * 0.1, py + s * 0.2, s * 0.8, s * 0.6);
      ctx.fillStyle = '#ffe680';
      ctx.beginPath();
      ctx.arc(px + s * 0.25, py + s * 0.32, s * 0.05, 0, Math.PI * 2);
      ctx.arc(px + s * 0.75, py + s * 0.32, s * 0.05, 0, Math.PI * 2);
      ctx.fill();
    },
    stairs(ctx, px, py, s, x, y) {
      Art.base(ctx, '#6d665e', px, py, s, x, y, 6);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = shade('#8a8278', -i * 10);
        ctx.fillRect(px, py + (s * i) / 5, s, s / 5 - 1);
      }
    },
  };

  function isWallish(map, x, y) {
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return true;
    const t = D.tile(map.cells[y * map.w + x]);
    return !t.walk && !t.door;
  }

  D.drawTile = function (ctx, id, px, py, s, x, y, map) {
    const fn = DRAW[id] || DRAW.floor;
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, s, s);
    ctx.clip();
    fn(ctx, px, py, s, x, y, map);
    ctx.restore();
  };

  /* ---------- Класс поля ---------- */
  function Board(wrap, opts) {
    this.wrap = wrap;
    this.opts = opts || {};
    this.canvas = U.el('canvas', { class: 'board' });
    wrap.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.map = null;
    this.zoom = 1;
    this.ox = 20;
    this.oy = 20;
    this.cs = BASE;
    this.tokens = () => [];
    this.ov = { reach: null, path: null, area: null, areaColor: '#ff8a3d', targets: null, invalid: null, current: null, sel: null, hoverCell: null, placing: null, cursorCell: null };
    this.floats = [];
    this.tweens = {};
    this.flash = null;
    this.showGrid = true;
    this.showEnemyHp = true;
    this.cache = null;
    this.dirtyCells = null;
    this.running = true;
    this.dpr = root.devicePixelRatio || 1;
    this._bind();
    this._resize();
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(wrap);
    this.fc = 0;
    const loop = () => {
      if (!this.running) return;
      // Когда на доске ничего не анимируется, перерисовываем через кадр (≈30 к/с) — меньше нагрузки на ПК
      const busy = this.floats.length || this.flash || Object.keys(this.tweens).length;
      if (busy || (++this.fc & 1) === 0) this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  const BP = Board.prototype;

  BP.destroy = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    window.removeEventListener('mouseup', this._onUp);
    window.removeEventListener('mousemove', this._onWinMove);
  };

  BP._resize = function () {
    const r = this.wrap.getBoundingClientRect();
    this.dpr = root.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * this.dpr));
    this.vw = r.width;
    this.vh = r.height;
  };

  BP.setMap = function (map, keepView) {
    this.map = map;
    this.cache = null;
    if (!keepView) this.fit();
  };

  BP.invalidate = function (cells) {
    if (!this.cache) return;
    if (!cells) {
      this.cache = null;
      return;
    }
    this.dirtyCells = (this.dirtyCells || []).concat(cells);
  };

  BP._buildCache = function () {
    const m = this.map;
    const cs = m.w * m.h > 6400 ? 24 : m.w * m.h > 2500 ? 32 : BASE;
    this.cacheCs = cs;
    const cv = document.createElement('canvas');
    cv.width = m.w * cs;
    cv.height = m.h * cs;
    const cx = cv.getContext('2d');
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) D.drawTile(cx, m.cells[y * m.w + x], x * cs, y * cs, cs, x, y, m);
    this.cache = cv;
    this.cacheCtx = cx;
  };

  BP._applyDirty = function () {
    if (!this.dirtyCells || !this.cache) return;
    const m = this.map;
    const cs = this.cacheCs;
    const seen = new Set();
    for (const [x, y] of this.dirtyCells) {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
          const k = nx + ',' + ny;
          if (seen.has(k)) continue;
          seen.add(k);
          D.drawTile(this.cacheCtx, m.cells[ny * m.w + nx], nx * cs, ny * cs, cs, nx, ny, m);
        }
    }
    this.dirtyCells = null;
  };

  BP.cellPx = function () {
    return this.cs * this.zoom;
  };
  BP.toCell = function (sx, sy) {
    const s = this.cellPx();
    return { x: (sx - this.ox) / s, y: (sy - this.oy) / s };
  };
  BP.toScreen = function (cx, cy) {
    const s = this.cellPx();
    return { x: this.ox + cx * s, y: this.oy + cy * s };
  };

  BP.fit = function () {
    if (!this.map) return;
    const r = this.wrap.getBoundingClientRect();
    const w = r.width || 800;
    const h = r.height || 600;
    const z = Math.min((w - 40) / (this.map.w * BASE), (h - 40) / (this.map.h * BASE));
    this.zoom = U.clamp(z, 0.08, 2.5);
    const s = this.cellPx();
    this.ox = (w - this.map.w * s) / 2;
    this.oy = (h - this.map.h * s) / 2;
  };

  BP.zoomAt = function (sx, sy, factor) {
    const before = this.toCell(sx, sy);
    this.zoom = U.clamp(this.zoom * factor, 0.08, 3);
    const s = this.cellPx();
    this.ox = sx - before.x * s;
    this.oy = sy - before.y * s;
  };

  BP.centerOn = function (cx, cy) {
    const s = this.cellPx();
    this.ox = this.vw / 2 - (cx + 0.5) * s;
    this.oy = this.vh / 2 - (cy + 0.5) * s;
  };

  BP._bind = function () {
    const cv = this.canvas;
    let down = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      const r = cv.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const cell = this.toCell(sx, sy);
      down = { btn: e.button, sx, sy, ox: this.ox, oy: this.oy, moved: false, cell, drag: false };
      if (e.button === 0 && this.opts.onDragStart && this.opts.onDragStart(cell, e)) down.drag = true;
      if (e.button === 0 && this.opts.onPaintStart && this.opts.onPaintStart(cell, e)) down.paint = true;
    });
    this._onWinMove = (e) => {
      const r = cv.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const cell = this.toCell(sx, sy);
      if (down) {
        if (Math.abs(sx - down.sx) + Math.abs(sy - down.sy) > 4) down.moved = true;
        if ((down.btn === 1 || down.btn === 2) && down.moved) {
          this.ox = down.ox + (sx - down.sx);
          this.oy = down.oy + (sy - down.sy);
        }
        if (down.drag && this.opts.onDrag) this.opts.onDrag(cell, e);
        if (down.paint && this.opts.onPaint) this.opts.onPaint(cell, e);
      }
      const inside = sx >= 0 && sy >= 0 && sx <= r.width && sy <= r.height;
      if (inside) {
        this.ov.cursorCell = cell;
        if (this.opts.onHover) this.opts.onHover(cell, e, sx, sy);
      }
    };
    this._onUp = (e) => {
      if (!down) return;
      const r = cv.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const cell = this.toCell(sx, sy);
      if (down.drag && this.opts.onDragEnd) this.opts.onDragEnd(cell, e);
      else if (down.paint && this.opts.onPaintEnd) this.opts.onPaintEnd(cell, e);
      else if (down.btn === 0 && !down.moved && this.opts.onClick) this.opts.onClick(cell, e);
      else if (down.btn === 2 && !down.moved && this.opts.onRightClick) this.opts.onRightClick(cell, e);
      down = null;
    };
    window.addEventListener('mousemove', this._onWinMove);
    window.addEventListener('mouseup', this._onUp);
    cv.addEventListener('mouseleave', () => {
      this.ov.cursorCell = null;
      if (this.opts.onLeave) this.opts.onLeave();
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
  };

  /* ---------- Анимации ---------- */
  BP.floatText = function (c, text, color) {
    this.floats.push({ uid: c.uid, x: c.x + c.cells / 2, y: c.y, text, color: color || '#fff', t: performance.now(), n: this.floats.filter((f) => f.uid === c.uid && performance.now() - f.t < 400).length });
  };

  BP.tweenStep = function (c, fx, fy, tx, ty, ms) {
    return new Promise((resolve) => {
      this.tweens[c.uid] = { fx, fy, tx, ty, t0: performance.now(), ms: ms || 120, resolve };
      setTimeout(() => {
        const tw = this.tweens[c.uid];
        if (tw && tw.resolve === resolve) {
          delete this.tweens[c.uid];
          resolve();
        }
      }, (ms || 120) + 40);
    });
  };

  BP.flashCells = function (cells, color, ms) {
    return new Promise((resolve) => {
      this.flash = { cells, color, t0: performance.now(), ms: ms || 650 };
      setTimeout(resolve, ms || 650);
    });
  };

  /* ---------- Отрисовка ---------- */
  BP.draw = function () {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0806';
    ctx.fillRect(0, 0, this.vw, this.vh);
    if (!this.map) return;
    if (!this.cache) this._buildCache();
    this._applyDirty();
    const s = this.cellPx();
    const m = this.map;
    ctx.imageSmoothingEnabled = true;
    // Тень под картой
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(this.ox + 6, this.oy + 6, m.w * s, m.h * s);
    ctx.drawImage(this.cache, this.ox, this.oy, m.w * s, m.h * s);

    // Сетка
    if (this.showGrid && s >= 10) {
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= m.w; x++) {
        const px = Math.round(this.ox + x * s) + 0.5;
        ctx.moveTo(px, this.oy);
        ctx.lineTo(px, this.oy + m.h * s);
      }
      for (let y = 0; y <= m.h; y++) {
        const py = Math.round(this.oy + y * s) + 0.5;
        ctx.moveTo(this.ox, py);
        ctx.lineTo(this.ox + m.w * s, py);
      }
      ctx.stroke();
    }
    const ov = this.ov;
    // Достижимые клетки
    if (ov.reach) {
      ctx.fillStyle = 'rgba(90, 170, 255, 0.16)';
      for (const rec of ov.reach) ctx.fillRect(this.ox + rec.x * s, this.oy + rec.y * s, s, s);
      ctx.strokeStyle = 'rgba(120, 190, 255, 0.35)';
      ctx.lineWidth = 1;
      for (const rec of ov.reach) ctx.strokeRect(this.ox + rec.x * s + 1.5, this.oy + rec.y * s + 1.5, s - 3, s - 3);
    }
    // Путь
    if (ov.path && ov.path.length > 1) {
      ctx.strokeStyle = 'rgba(255, 230, 140, 0.9)';
      ctx.lineWidth = Math.max(2, s / 12);
      ctx.setLineDash([s / 6, s / 8]);
      ctx.beginPath();
      const cells = ov.pathCells || 1;
      ov.path.forEach((p, i) => {
        const px = this.ox + (p.x + cells / 2) * s;
        const py = this.oy + (p.y + cells / 2) * s;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      const last = ov.path[ov.path.length - 1];
      ctx.fillStyle = 'rgba(255, 230, 140, 0.35)';
      ctx.fillRect(this.ox + last.x * s, this.oy + last.y * s, s * cells, s * cells);
      if (ov.pathLabel) {
        ctx.font = 'bold ' + Math.max(11, s * 0.28) + 'px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        const tx = this.ox + (last.x + cells / 2) * s;
        const ty = this.oy + (last.y + cells) * s + Math.max(12, s * 0.3);
        ctx.fillText(ov.pathLabel, tx + 1, ty + 1);
        ctx.fillStyle = '#ffe68c';
        ctx.fillText(ov.pathLabel, tx, ty);
      }
    }
    // Зоны заклинаний
    if (ov.zones && ov.zones.length) {
      for (const z of ov.zones) {
        ctx.fillStyle = hexA(z.color || '#c9a0ff', 0.22);
        for (const [x, y] of z.cells) ctx.fillRect(this.ox + x * s, this.oy + y * s, s, s);
        ctx.strokeStyle = hexA(z.color || '#c9a0ff', 0.55);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        const set = new Set(z.cells.map(([x, y]) => x + ',' + y));
        ctx.beginPath();
        for (const [x, y] of z.cells) {
          const px = this.ox + x * s;
          const py = this.oy + y * s;
          if (!set.has(x + ',' + (y - 1))) { ctx.moveTo(px, py); ctx.lineTo(px + s, py); }
          if (!set.has(x + ',' + (y + 1))) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
          if (!set.has(x - 1 + ',' + y)) { ctx.moveTo(px, py); ctx.lineTo(px, py + s); }
          if (!set.has(x + 1 + ',' + y)) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // Область
    if (ov.area) {
      ctx.fillStyle = hexA(ov.areaColor || '#ff8a3d', 0.35);
      ctx.strokeStyle = hexA(ov.areaColor || '#ff8a3d', 0.9);
      ctx.lineWidth = 1.5;
      for (const [x, y] of ov.area) {
        ctx.fillRect(this.ox + x * s, this.oy + y * s, s, s);
        ctx.strokeRect(this.ox + x * s + 1, this.oy + y * s + 1, s - 2, s - 2);
      }
    }
    if (ov.rangeCircle) {
      const rc = ov.rangeCircle;
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.45)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.ox + rc.x * s, this.oy + rc.y * s, rc.r * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Вспышка
    if (this.flash) {
      const f = this.flash;
      const a = 1 - (performance.now() - f.t0) / f.ms;
      if (a <= 0) this.flash = null;
      else {
        ctx.fillStyle = hexA(f.color, 0.6 * a);
        for (const [x, y] of f.cells) ctx.fillRect(this.ox + x * s, this.oy + y * s, s, s);
      }
    }
    // Курсор
    if (ov.cursorCell && ov.showCursor) {
      const cx = Math.floor(ov.cursorCell.x);
      const cy = Math.floor(ov.cursorCell.y);
      const sz = ov.cursorSize || 1;
      if (cx >= 0 && cy >= 0 && cx < m.w && cy < m.h) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.ox + cx * s + 1, this.oy + cy * s + 1, s * sz - 2, s * sz - 2);
      }
    }
    // Жетоны
    const toks = this.tokens().filter((c) => c.x >= 0);
    toks.sort((a, b) => (a.dead === b.dead ? a.cells - b.cells : a.dead ? -1 : 1));
    const now = performance.now();
    for (const c of toks) {
      let dx = c.x;
      let dy = c.y;
      const tw = this.tweens[c.uid];
      if (tw) {
        const t = Math.min(1, (now - tw.t0) / tw.ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        dx = tw.fx + (tw.tx - tw.fx) * e;
        dy = tw.fy + (tw.ty - tw.fy) * e;
        if (t >= 1) {
          delete this.tweens[c.uid];
          tw.resolve();
        }
      }
      this.drawToken(ctx, c, this.ox + dx * s, this.oy + dy * s, s * c.cells, now);
    }
    // Плавающий текст
    this.floats = this.floats.filter((f) => now - f.t < 1500);
    for (const f of this.floats) {
      const age = (now - f.t) / 1500;
      const tok = toks.find((c) => c.uid === f.uid);
      const bx = tok ? tok.x + tok.cells / 2 : f.x;
      const by = tok ? tok.y : f.y;
      const px = this.ox + bx * s;
      const py = this.oy + by * s - age * s * 0.9 - f.n * 16;
      ctx.globalAlpha = Math.min(1, 2.2 * (1 - age));
      ctx.font = 'bold ' + Math.max(14, s * 0.42) + 'px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(f.text, px, py);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, px, py);
      ctx.globalAlpha = 1;
    }
  };

  function hexA(hex, a) {
    if (hex.startsWith('rgb')) return hex;
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  BP.drawToken = function (ctx, c, px, py, size, now) {
    const ov = this.ov;
    const r = size / 2 - Math.max(2, size * 0.06);
    const cx = px + size / 2;
    const cy = py + size / 2;
    const sideColor = (D.R.SIDES[c.side] || D.R.SIDES.enemies).color;
    const down = c.hp <= 0 && !c.dead;
    ctx.save();
    if (c.dead) ctx.globalAlpha = 0.45;
    // Тень
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx + size * 0.04, cy + size * 0.06, r, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    // Подсветка целей
    if (ov.targets && ov.targets.has(c.uid)) {
      ctx.fillStyle = 'rgba(255, 80, 60, 0.28)';
      ctx.beginPath();
      ctx.arc(cx, cy, r + size * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    if (ov.chosen && ov.chosen.includes(c.uid)) {
      ctx.strokeStyle = '#ffe680';
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + size * 0.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Текущий ход
    if (ov.current === c.uid) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      ctx.strokeStyle = 'rgba(255, 215, 110,' + (0.55 + pulse * 0.45) + ')';
      ctx.lineWidth = Math.max(3, size * 0.07);
      ctx.beginPath();
      ctx.arc(cx, cy, r + size * 0.08 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Тело жетона
    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    const img = getImg(c.portrait);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
      ctx.clip();
      const k = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      if (c.dead || down) ctx.filter = 'grayscale(1)';
      ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      ctx.restore();
    } else if (iconPath(c.icon)) {
      const g = ctx.createRadialGradient(cx, cy - r * 0.35, r * 0.1, cx, cy, r);
      g.addColorStop(0, '#3b3027');
      g.addColorStop(1, '#120e0b');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      const bmp = iconBitmap(c.icon, c.dead || down ? '#7d7770' : c.side === 'enemies' ? '#f0d9c2' : '#efe6d2');
      if (bmp) {
        const sz = r * 1.65;
        ctx.drawImage(bmp, cx - sz / 2, cy - sz / 2, sz, sz);
      }
    } else {
      ctx.font = Math.round(r * 1.15) + 'px ' + "'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (c.dead || down) ctx.filter = 'grayscale(1)';
      ctx.fillText(c.icon || '?', cx, cy + r * 0.06);
      ctx.filter = 'none';
    }
    ctx.strokeStyle = c.color || sideColor;
    ctx.lineWidth = Math.max(2.5, size * 0.065);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (c.kind === 'pc' || c.color !== sideColor) {
      ctx.strokeStyle = sideColor;
      ctx.lineWidth = Math.max(1.5, size * 0.03);
      ctx.beginPath();
      ctx.arc(cx, cy, r + Math.max(2, size * 0.045), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (ov.sel === c.uid) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, r + size * 0.11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    if (c.dead) {
      ctx.font = Math.round(r * 0.9) + 'px ' + "'Segoe UI Emoji','Noto Color Emoji',sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠️', cx, cy);
      return;
    }
    // Полоса хитов
    const showHp = c.side !== 'enemies' || this.showEnemyHp;
    const bw = size * 0.78;
    const bh = Math.max(4, size * 0.09);
    const bx = cx - bw / 2;
    const by = py - bh * 0.2;
    if (showHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const frac = U.clamp(c.hp / c.maxHp, 0, 1);
      ctx.fillStyle = frac > 0.5 ? '#4fc94f' : frac > 0.25 ? '#e0bb3a' : '#e5432f';
      ctx.fillRect(bx, by, bw * frac, bh);
      if (c.tempHp > 0) {
        ctx.fillStyle = 'rgba(120,180,255,0.9)';
        ctx.fillRect(bx, by, bw * U.clamp(c.tempHp / c.maxHp, 0, 1), bh / 2);
      }
    } else {
      const frac = c.hp / c.maxHp;
      const label = frac >= 1 ? '' : frac > 0.5 ? 'ранен' : frac > 0 ? 'тяжело ранен' : '';
      if (label) {
        ctx.font = Math.max(9, size * 0.17) + 'px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffb0a0';
        ctx.fillText(label, cx, by + bh);
      }
    }
    // Состояния
    const icons = [];
    for (const cond of c.conditions) {
      const d = D.R.CONDITIONS[cond.id];
      if (d && !icons.includes(d.icon)) icons.push(d.icon);
    }
    for (const e of c.effects) {
      const d = D.R.EFFECTS[e.id];
      if (d && ['rage', 'dodge', 'bless', 'hex', 'hunterMark', 'shieldOfFaith', 'guidingBolt', 'spiritGuardians', 'haste', 'slowSpell', 'faerieFire', 'heroism', 'holyNimbus', 'vowOfEnmity'].includes(e.id) && !icons.includes(d.icon)) icons.push(d.icon);
    }
    if (c.concentration) icons.push('🧠');
    if (icons.length && size >= 20) {
      const is = Math.max(10, size * 0.24);
      ctx.font = is + 'px ' + "'Segoe UI Emoji','Noto Color Emoji',sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      icons.slice(0, 5).forEach((ic, i) => {
        const ix = px + size - is * 0.45 - i * is * 0.85;
        const iy = py + size - is * 0.45;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        ctx.arc(ix, iy, is * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(ic, ix, iy + 1);
      });
    }
    // Имя
    if (size >= 34 && this.zoom >= 0.55) {
      ctx.font = '600 ' + Math.max(10, Math.min(13, size * 0.22)) + 'px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const name = c.name.length > 16 ? c.name.slice(0, 15) + '…' : c.name;
      const ty = py + size - 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.strokeText(name, cx, ty);
      ctx.fillStyle = down ? '#ff9c90' : '#f4ead6';
      ctx.fillText(name, cx, ty);
    }
    if (down) {
      ctx.font = Math.round(r * 0.7) + 'px ' + "'Segoe UI Emoji','Noto Color Emoji',sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.kind === 'pc' ? '💔' : '💤', cx + r * 0.55, cy - r * 0.55);
    }
  };

  D.Board = Board;
})(typeof window !== 'undefined' ? window : globalThis);
