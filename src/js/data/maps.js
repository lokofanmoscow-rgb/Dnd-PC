/* Готовые карты (генерируются детерминированно) */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function blank(w, h, fill) {
    return { w, h, cells: new Array(w * h).fill(fill) };
  }
  function set(m, x, y, t) {
    if (x >= 0 && y >= 0 && x < m.w && y < m.h) m.cells[y * m.w + x] = t;
  }
  function get(m, x, y) {
    return m.cells[y * m.w + x];
  }
  function rect(m, x0, y0, x1, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(m, x, y, t);
  }
  function frame(m, x0, y0, x1, y1, t) {
    for (let x = x0; x <= x1; x++) {
      set(m, x, y0, t);
      set(m, x, y1, t);
    }
    for (let y = y0; y <= y1; y++) {
      set(m, x0, y, t);
      set(m, x1, y, t);
    }
  }

  function arena() {
    const m = blank(22, 16, 'sand');
    frame(m, 0, 0, 21, 15, 'wall');
    [[4, 4], [17, 4], [4, 11], [17, 11], [10, 7], [11, 8]].forEach(([x, y]) => set(m, x, y, 'pillar'));
    set(m, 10, 0, 'doorc');
    set(m, 11, 15, 'doorc');
    rect(m, 9, 3, 12, 3, 'rubble');
    rect(m, 9, 12, 12, 12, 'rubble');
    return { id: 'preset_arena', name: 'Гладиаторская арена', ...m };
  }

  function forest() {
    const r = rng(42);
    const m = blank(28, 20, 'grass');
    for (let y = 0; y < m.h; y++) {
      // ручей
      const cx = 15 + Math.round(Math.sin(y / 3) * 2);
      set(m, cx, y, 'water');
      set(m, cx + 1, y, 'water');
      if (y % 5 === 2) set(m, cx - 1, y, 'water');
    }
    // мост
    for (let x = 12; x < 20; x++) if (get(m, x, 9) === 'water') set(m, x, 9, 'bridge');
    for (let x = 12; x < 20; x++) if (get(m, x, 10) === 'water') set(m, x, 10, 'bridge');
    // деревья и кусты
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(r() * m.w);
      const y = Math.floor(r() * m.h);
      if (get(m, x, y) !== 'grass') continue;
      if (x > 4 && x < 23 && y > 6 && y < 13) continue;
      set(m, x, y, r() < 0.55 ? 'tree' : 'bush');
    }
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(r() * m.w);
      const y = Math.floor(r() * m.h);
      if (get(m, x, y) === 'grass') set(m, x, y, 'rock');
    }
    rect(m, 3, 8, 7, 11, 'dirt');
    set(m, 5, 9, 'fire');
    return { id: 'preset_forest', name: 'Лесная поляна у ручья', ...m };
  }

  function tavern() {
    const m = blank(26, 18, 'grass');
    rect(m, 1, 1, 24, 15, 'wood');
    frame(m, 1, 1, 24, 15, 'wall');
    // стойка
    rect(m, 3, 3, 9, 3, 'table');
    set(m, 3, 2, 'barrel');
    set(m, 5, 2, 'barrel');
    set(m, 7, 2, 'barrel');
    set(m, 9, 2, 'crate');
    // столы
    [[6, 7], [11, 6], [16, 7], [7, 11], [13, 11], [18, 11]].forEach(([x, y]) => {
      set(m, x, y, 'table');
      set(m, x + 1, y, 'table');
    });
    // ковёр и камин
    rect(m, 12, 8, 15, 9, 'carpet');
    set(m, 23, 7, 'fire');
    set(m, 23, 8, 'fire');
    // кладовая
    frame(m, 18, 1, 24, 5, 'wall');
    set(m, 20, 5, 'door');
    set(m, 22, 2, 'chest');
    set(m, 19, 2, 'crate');
    set(m, 19, 3, 'crate');
    set(m, 23, 4, 'barrel');
    // входы
    set(m, 12, 15, 'door');
    set(m, 13, 15, 'door');
    set(m, 1, 9, 'doorc');
    set(m, 2, 13, 'stairs');
    set(m, 3, 13, 'stairs');
    // улица
    rect(m, 10, 16, 15, 17, 'dirt');
    return { id: 'preset_tavern', name: 'Таверна «Пьяный дракон»', ...m };
  }

  function dungeon() {
    const r = rng(7);
    const m = blank(32, 22, 'wall');
    const rooms = [
      [2, 2, 9, 7],
      [14, 2, 22, 8],
      [25, 3, 30, 10],
      [2, 12, 10, 19],
      [14, 13, 21, 19],
      [24, 14, 30, 19],
    ];
    rooms.forEach(([x0, y0, x1, y1]) => rect(m, x0, y0, x1, y1, 'floor'));
    // коридоры
    rect(m, 9, 4, 14, 5, 'flagstone');
    rect(m, 22, 5, 25, 6, 'flagstone');
    rect(m, 5, 7, 6, 12, 'flagstone');
    rect(m, 10, 15, 14, 16, 'flagstone');
    rect(m, 21, 16, 24, 16, 'flagstone');
    rect(m, 17, 8, 18, 13, 'flagstone');
    rect(m, 27, 10, 28, 14, 'flagstone');
    // двери
    set(m, 10, 4, 'door');
    set(m, 13, 5, 'doorc');
    set(m, 5, 8, 'door');
    set(m, 17, 12, 'door');
    set(m, 23, 16, 'doorc');
    set(m, 27, 13, 'door');
    // убранство
    [[16, 4], [20, 4], [16, 6], [20, 6]].forEach(([x, y]) => set(m, x, y, 'pillar'));
    set(m, 18, 3, 'statue');
    set(m, 28, 6, 'altar');
    set(m, 29, 4, 'chest');
    set(m, 3, 3, 'crate');
    set(m, 4, 3, 'barrel');
    set(m, 26, 18, 'chest');
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(r() * m.w);
      const y = Math.floor(r() * m.h);
      if (get(m, x, y) === 'floor') set(m, x, y, 'rubble');
    }
    rect(m, 15, 15, 17, 17, 'water');
    set(m, 3, 18, 'web');
    set(m, 4, 18, 'web');
    set(m, 3, 17, 'web');
    return { id: 'preset_dungeon', name: 'Подземелье забытого храма', ...m };
  }

  function lair() {
    const r = rng(99);
    const m = blank(30, 22, 'floor');
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        const dx = (x - m.w / 2) / (m.w / 2);
        const dy = (y - m.h / 2) / (m.h / 2);
        const d = dx * dx + dy * dy + (r() - 0.5) * 0.25;
        if (d > 0.82) set(m, x, y, 'cave');
        else if (r() < 0.06) set(m, x, y, 'rubble');
      }
    }
    for (let x = 0; x < m.w; x++) {
      const y = 11 + Math.round(Math.sin(x / 2.5) * 1.5);
      if (get(m, x, y) !== 'cave') set(m, x, y, 'lava');
      if (get(m, x, y + 1) !== 'cave') set(m, x, y + 1, 'lava');
    }
    for (let y = 8; y < 15; y++) if (get(m, 14, y) === 'lava') set(m, 14, y, 'bridge');
    for (let y = 8; y < 15; y++) if (get(m, 15, y) === 'lava') set(m, 15, y, 'bridge');
    [[8, 5], [21, 5], [9, 17], [20, 17]].forEach(([x, y]) => set(m, x, y, 'rock'));
    set(m, 15, 4, 'chest');
    set(m, 14, 4, 'chest');
    return { id: 'preset_lair', name: 'Логово дракона', ...m };
  }

  function ship() {
    const W = 40;
    const H = 30;
    const m = blank(W, H, 'deep');
    // Мели, риф и песчаный островок
    const ring = (cx, cy, rx, ry, t) => {
      for (let y = cy - ry; y <= cy + ry; y++)
        for (let x = cx - rx; x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(m, x, y, t);
    };
    ring(5, 5, 4, 3, 'water');
    ring(5, 5, 2, 1, 'sand');
    set(m, 4, 5, 'rock');
    ring(34, 25, 3, 2, 'water');
    [[33, 25], [35, 24], [34, 26]].forEach(([x, y]) => set(m, x, y, 'rock'));
    ring(35, 4, 2, 2, 'water');
    set(m, 35, 4, 'rock');
    // Корпус корабля: корма слева, острый нос справа
    for (let y = 11; y <= 18; y++) {
      const dy = Math.abs(y - 14.5);
      const bow = 30 - Math.round(dy * 1.6);
      const stern = dy > 3 ? 10 : 9;
      rect(m, stern, y, bow, y, 'wood');
    }
    set(m, 31, 14, 'wood');
    set(m, 31, 15, 'wood');
    // Каюта капитана на корме
    for (let x = 9; x <= 13; x++) {
      set(m, x, 11, 'wall');
      set(m, x, 18, 'wall');
    }
    for (let y = 11; y <= 18; y++) {
      set(m, 9, y, 'wall');
      set(m, 13, y, 'wall');
    }
    rect(m, 10, 12, 12, 17, 'carpet');
    set(m, 13, 14, 'door');
    set(m, 13, 15, 'door');
    set(m, 10, 12, 'chest');
    set(m, 11, 16, 'table');
    // Мачты, груз, люк в трюм, штурвал
    set(m, 18, 14, 'pillar');
    set(m, 25, 15, 'pillar');
    [[16, 12], [17, 12], [16, 17], [21, 12], [22, 17], [23, 17], [27, 13]].forEach(([x, y]) => set(m, x, y, 'crate'));
    [[19, 12], [20, 17], [24, 12], [27, 16]].forEach(([x, y]) => set(m, x, y, 'barrel'));
    set(m, 21, 14, 'stairs');
    set(m, 21, 15, 'stairs');
    set(m, 14, 14, 'table');
    // Шлюпка за кормой
    rect(m, 3, 20, 5, 21, 'wood');
    return { id: 'preset_ship', name: 'Корабль посреди океана', ...m };
  }

  function field() {
    const m = blank(30, 20, 'grass');
    return { id: 'preset_field', name: 'Чистое поле', ...m };
  }

  D.PRESET_MAPS = [tavern(), forest(), ship(), dungeon(), arena(), lair(), field()].map((m) => Object.assign(m, { preset: true }));
})(typeof window !== 'undefined' ? window : globalThis);
