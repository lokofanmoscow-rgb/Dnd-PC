/* Геометрия поля: расстояния, линия обзора, поиск пути, шаблоны областей */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const G = {};

  G.inBounds = (map, x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h;
  G.tileId = (map, x, y) => (G.inBounds(map, x, y) ? map.cells[y * map.w + x] : 'wall');
  G.tile = (map, x, y) => D.tile(G.tileId(map, x, y));
  G.key = (x, y) => x + ',' + y;

  G.footprint = function (x, y, cells) {
    const out = [];
    for (let dy = 0; dy < cells; dy++) for (let dx = 0; dx < cells; dx++) out.push([x + dx, y + dy]);
    return out;
  };

  /* Расстояние между существами в клетках (соседние = 1) */
  G.gap = function (ax, ay, as, bx, by, bs) {
    const gx = Math.max(0, bx - (ax + as - 1), ax - (bx + bs - 1));
    const gy = Math.max(0, by - (ay + as - 1), ay - (by + bs - 1));
    return Math.max(gx, gy);
  };
  G.distFt = (a, b) => G.gap(a.x, a.y, a.cells, b.x, b.y, b.cells) * 5;
  G.distFtAt = (a, x, y, b) => G.gap(x, y, a.cells, b.x, b.y, b.cells) * 5;
  G.distToCellFt = (a, x, y) => G.gap(a.x, a.y, a.cells, x, y, 1) * 5;
  G.center = (c) => ({ x: c.x + c.cells / 2, y: c.y + c.cells / 2 });

  /* Линия обзора: стены, деревья, закрытые двери блокируют */
  G.lineClear = function (map, x0, y0, x1, y1, ignore) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(len / 0.2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;
      const cx = Math.floor(px);
      const cy = Math.floor(py);
      if (ignore && ignore.has(G.key(cx, cy))) continue;
      if (!G.tile(map, cx, cy).sight) return false;
    }
    return true;
  };

  G.hasLOS = function (map, a, b) {
    const ignore = new Set();
    G.footprint(a.x, a.y, a.cells).forEach(([x, y]) => ignore.add(G.key(x, y)));
    G.footprint(b.x, b.y, b.cells || 1).forEach(([x, y]) => ignore.add(G.key(x, y)));
    const ca = G.center(a);
    const cb = { x: b.x + (b.cells || 1) / 2, y: b.y + (b.cells || 1) / 2 };
    if (G.lineClear(map, ca.x, ca.y, cb.x, cb.y, ignore)) return true;
    // Проверяем от углов — существо может «выглянуть» из-за угла
    const offs = [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]];
    for (const [ox, oy] of offs) {
      for (const [px, py] of offs) {
        const sx = a.x + ox * a.cells;
        const sy = a.y + oy * a.cells;
        const tx = b.x + px * (b.cells || 1);
        const ty = b.y + py * (b.cells || 1);
        if (G.lineClear(map, sx, sy, tx, ty, ignore)) return true;
      }
    }
    return false;
  };
  G.hasLOSToCell = (map, a, x, y) => G.hasLOS(map, a, { x, y, cells: 1 });

  /* ---------- Вода ---------- */
  /* Водное существо: умеет только плавать (рыбы, акулы, касатка, морской конёк) */
  G.isAquatic = (c) => !!(c && c.speed && c.speed.swim && !c.speed.walk && !c.speed.fly);
  /* Все клетки под существом — вода */
  G.allWet = function (map, c, x, y) {
    const px = x == null ? c.x : x;
    const py = y == null ? c.y : y;
    if (px < 0 || py < 0) return false;
    return G.footprint(px, py, c.cells).every(([fx, fy]) => G.inBounds(map, fx, fy) && !!G.tile(map, fx, fy).wet);
  };
  /* Лишает ли вода действий: существо без скорости плавания, не летит, целиком в воде.
     B.waterRule: 'all' — любая вода, 'deep' — только глубокая, 'off' — без ограничений */
  G.waterLocks = function (B, c, x, y, fly) {
    const rule = B.waterRule || 'all';
    if (rule === 'off' || fly || !c || (c.speed && c.speed.swim)) return false;
    const px = x == null ? c.x : x;
    const py = y == null ? c.y : y;
    if (px < 0 || py < 0) return false;
    return G.footprint(px, py, c.cells).every(([fx, fy]) => {
      if (!G.inBounds(B.map, fx, fy)) return false;
      const t = G.tile(B.map, fx, fy);
      return !!t.wet && (rule === 'all' || !!t.swim);
    });
  };

  /* ---------- Перемещение ---------- */
  G.canStand = function (B, c, x, y, opts) {
    const map = B.map;
    const aquatic = G.isAquatic(c) && !(opts && (opts.placing || opts.fly));
    for (const [fx, fy] of G.footprint(x, y, c.cells)) {
      if (!G.inBounds(map, fx, fy)) return false;
      const t = G.tile(map, fx, fy);
      if (!t.walk && !(opts && opts.fly && t.id === 'pit')) return false;
      if (aquatic && !t.wet) return false;
    }
    return true;
  };

  G.occupant = function (B, x, y, exceptUid) {
    for (const o of B.combatants) {
      if (o.uid === exceptUid || o.dead || o.x < 0) continue;
      if (x >= o.x && y >= o.y && x < o.x + o.cells && y < o.y + o.cells) return o;
    }
    return null;
  };

  G.isHostile = (a, b) => {
    if (a.side === b.side) return false;
    if ((a.side === 'heroes' && b.side === 'allies') || (a.side === 'allies' && b.side === 'heroes')) return false;
    return true;
  };

  G.stepCost = function (B, c, x, y, opts) {
    const fly = opts && opts.fly;
    let difficult = false;
    for (const [fx, fy] of G.footprint(x, y, c.cells)) {
      const t = G.tile(B.map, fx, fy);
      if (fly) continue;
      if (t.difficult) {
        if (t.wet && c.speed && c.speed.swim) continue;
        if (t.id === 'web' && c.flags && c.flags.webWalker) continue;
        difficult = true;
      }
    }
    let cost = difficult ? 2 : 1;
    if (opts && opts.crawl) cost += 1;
    return cost;
  };

  /* Двоичная куча для Дейкстры */
  function Heap() {
    this.a = [];
    this.size = 0;
  }
  Heap.prototype.push = function (v) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= a[i].cost) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
    this.size = a.length;
  };
  Heap.prototype.pop = function () {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    this.size = a.length;
    return top;
  };

  /* Дейкстра. Возвращает Map key -> {cost, prev, x, y}. maxCost в клетках (5 фт = 1) */
  G.reach = function (B, c, maxCost, opts) {
    opts = opts || {};
    const res = new Map();
    const start = G.key(c.x, c.y);
    res.set(start, { cost: 0, prev: null, x: c.x, y: c.y });
    const open = new Heap();
    open.push({ x: c.x, y: c.y, cost: 0 });
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (open.size) {
      const cur = open.pop();
      const curRec = res.get(G.key(cur.x, cur.y));
      if (curRec && cur.cost > curRec.cost) continue;
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!G.canStand(B, c, nx, ny, opts)) continue;
        if (dx && dy) {
          // Нельзя срезать угол между двумя препятствиями
          if (!G.canStand(B, c, cur.x + dx, cur.y, opts) && !G.canStand(B, c, cur.x, cur.y + dy, opts)) continue;
        }
        // Враждебные существа блокируют проход
        let blocked = false;
        for (const [fx, fy] of G.footprint(nx, ny, c.cells)) {
          const o = G.occupant(B, fx, fy, c.uid);
          if (o && G.isHostile(c, o) && o.hp > 0 && !opts.ignoreCreatures) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        let step = G.stepCost(B, c, nx, ny, opts);
        if (opts.avoidHazards) {
          for (const [fx, fy] of G.footprint(nx, ny, c.cells)) if (G.tile(B.map, fx, fy).hazard && !opts.fly) step += 20;
          if (G.waterLocks(B, c, nx, ny, opts.fly)) step += 6;
        }
        const nc = cur.cost + step;
        if (nc > maxCost) continue;
        const k = G.key(nx, ny);
        const ex = res.get(k);
        if (!ex || ex.cost > nc) {
          res.set(k, { cost: nc, prev: G.key(cur.x, cur.y), x: nx, y: ny });
          open.push({ x: nx, y: ny, cost: nc });
        }
      }
    }
    return res;
  };

  /* Можно ли закончить движение в клетке (никто не стоит) */
  G.canEndAt = function (B, c, x, y) {
    for (const [fx, fy] of G.footprint(x, y, c.cells)) {
      const o = G.occupant(B, fx, fy, c.uid);
      if (o) return false;
    }
    return true;
  };

  G.pathTo = function (reachMap, x, y) {
    const path = [];
    let k = G.key(x, y);
    let rec = reachMap.get(k);
    if (!rec) return null;
    while (rec) {
      path.unshift({ x: rec.x, y: rec.y, cost: rec.cost });
      rec = rec.prev ? reachMap.get(rec.prev) : null;
    }
    return path;
  };

  /* ---------- Шаблоны областей ---------- */
  /* Возвращает массив клеток [x,y]. origin: существо (для self) или клетка; aim: {x,y} — точка курсора (в клетках, дробная) */
  G.areaCells = function (map, area, caster, aim) {
    const out = [];
    const sizeC = area.size / 5;
    const add = (x, y) => {
      if (G.inBounds(map, x, y)) out.push([x, y]);
    };
    if (area.shape === 'sphere') {
      const cx = Math.floor(aim.x);
      const cy = Math.floor(aim.y);
      const r = sizeC;
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          if (d <= r + 0.01) add(x, y);
        }
      return out;
    }
    if (area.shape === 'square') {
      const cx = Math.floor(aim.x);
      const cy = Math.floor(aim.y);
      const half = Math.floor(sizeC / 2);
      for (let y = cy - half; y < cy - half + sizeC; y++) for (let x = cx - half; x < cx - half + sizeC; x++) add(x, y);
      return out;
    }
    if (area.shape === 'aura') {
      for (let y = caster.y - sizeC; y < caster.y + caster.cells + sizeC; y++)
        for (let x = caster.x - sizeC; x < caster.x + caster.cells + sizeC; x++) {
          if (x >= caster.x && y >= caster.y && x < caster.x + caster.cells && y < caster.y + caster.cells) continue;
          add(x, y);
        }
      return out;
    }
    const c = G.center(caster);
    let vx = aim.x - c.x;
    let vy = aim.y - c.y;
    const len = Math.sqrt(vx * vx + vy * vy) || 1;
    vx /= len;
    vy /= len;
    if (area.shape === 'cube') {
      // Куб, примыкающий к заклинателю в направлении курсора (8 направлений)
      const ang = Math.atan2(vy, vx);
      const oct = Math.round(ang / (Math.PI / 4));
      const dx = Math.round(Math.cos((oct * Math.PI) / 4));
      const dy = Math.round(Math.sin((oct * Math.PI) / 4));
      let x0;
      let y0;
      const s = sizeC;
      if (dx > 0) x0 = caster.x + caster.cells;
      else if (dx < 0) x0 = caster.x - s;
      else x0 = caster.x + Math.floor((caster.cells - s) / 2);
      if (dy > 0) y0 = caster.y + caster.cells;
      else if (dy < 0) y0 = caster.y - s;
      else y0 = caster.y + Math.floor((caster.cells - s) / 2);
      for (let y = y0; y < y0 + s; y++) for (let x = x0; x < x0 + s; x++) add(x, y);
      return out;
    }
    const half = caster.cells / 2;
    const maxR = sizeC + half + 0.5;
    const bound = Math.ceil(maxR) + 1;
    for (let y = Math.floor(c.y) - bound; y <= Math.floor(c.y) + bound; y++) {
      for (let x = Math.floor(c.x) - bound; x <= Math.floor(c.x) + bound; x++) {
        if (x >= caster.x && y >= caster.y && x < caster.x + caster.cells && y < caster.y + caster.cells) continue;
        const px = x + 0.5 - c.x;
        const py = y + 0.5 - c.y;
        const proj = px * vx + py * vy;
        if (proj <= 0) continue;
        const perp = Math.abs(px * vy - py * vx);
        if (area.shape === 'cone') {
          if (proj - half > sizeC + 0.01) continue;
          const ang = Math.atan2(perp, proj);
          if (ang <= 0.49 || (proj - half <= 1.01 && perp < 0.55)) add(x, y);
        } else if (area.shape === 'line') {
          if (proj - half > sizeC + 0.01) continue;
          if (perp <= 0.55) add(x, y);
        }
      }
    }
    // Стены останавливают конусы и линии: убираем клетки без обзора от заклинателя
    return out.filter(([x, y]) => G.tile(map, x, y).sight && G.lineClear(map, c.x, c.y, x + 0.5, y + 0.5, null));
  };

  G.creaturesInCells = function (B, cells) {
    const set = new Set(cells.map(([x, y]) => G.key(x, y)));
    return B.combatants.filter((o) => !o.dead && o.x >= 0 && G.footprint(o.x, o.y, o.cells).some(([x, y]) => set.has(G.key(x, y))));
  };

  D.Grid = G;
})(typeof window !== 'undefined' ? window : globalThis);
