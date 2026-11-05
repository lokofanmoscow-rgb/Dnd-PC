/* Редактор карт */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const el = U.el;
  const UI = D.UI;
  const Store = D.Store;

  function newMap(w, h, fill, name) {
    return { id: U.uid('map'), name: name || 'Новая карта', w, h, cells: new Array(w * h).fill(fill || 'floor') };
  }

  D.App.register('editor', {
    render(rootEl, params) {
      const self = this;
      let map = params.map ? U.deepClone(params.map) : newMap(24, 16, 'floor');
      if (map.preset) {
        map = U.deepClone(map);
      }
      let tile = 'wall';
      let tool = 'brush';
      let brush = 1;
      let dirty = false;
      const undo = [];
      const redo = [];
      let rectStart = null;

      const nameInp = el('input', { value: map.name, style: { width: '240px' }, oninput: () => { map.name = nameInp.value; dirty = true; } });
      const sizeLbl = el('span', { class: 'muted', style: { whiteSpace: 'nowrap' } });
      const status = el('span', { class: 'muted' });
      const wrap = el('div', { class: 'board-wrap' });
      const hint = el('div', { class: 'board-hint' }, 'ЛКМ — рисовать · ПКМ/СКМ — сдвиг · колесо — масштаб · Ctrl+Z — отмена');
      wrap.appendChild(hint);

      const board = new D.Board(wrap, {
        onPaintStart: (cell, e) => {
          pushUndo();
          if (tool === 'brush' || tool === 'erase') paint(cell);
          else if (tool === 'fill') flood(cell);
          else if (tool === 'pick') pick(cell);
          else if (tool === 'rect' || tool === 'frame') rectStart = { x: Math.floor(cell.x), y: Math.floor(cell.y) };
          return true;
        },
        onPaint: (cell) => {
          if (tool === 'brush' || tool === 'erase') paint(cell);
          if ((tool === 'rect' || tool === 'frame') && rectStart) showRect(cell);
        },
        onPaintEnd: (cell) => {
          if ((tool === 'rect' || tool === 'frame') && rectStart) {
            applyRect(cell);
            rectStart = null;
            board.ov.area = null;
          }
        },
        onHover: (cell) => {
          const x = Math.floor(cell.x);
          const y = Math.floor(cell.y);
          if (x >= 0 && y >= 0 && x < map.w && y < map.h) {
            const t = D.tile(map.cells[y * map.w + x]);
            status.textContent = '(' + x + ', ' + y + ') · ' + t.name + (t.difficult ? ' · труднопроходимо' : '') + (!t.walk ? ' · непроходимо' : '') + (!t.sight ? ' · блокирует обзор' : '');
          }
        },
      });
      board.ov.showCursor = true;
      board.setMap(map);

      function cellsIn(cell) {
        const out = [];
        const cx = Math.floor(cell.x);
        const cy = Math.floor(cell.y);
        const off = Math.floor((brush - 1) / 2);
        for (let dy = 0; dy < brush; dy++)
          for (let dx = 0; dx < brush; dx++) {
            const x = cx - off + dx;
            const y = cy - off + dy;
            if (x >= 0 && y >= 0 && x < map.w && y < map.h) out.push([x, y]);
          }
        return out;
      }
      function setCell(x, y, t) {
        if (map.cells[y * map.w + x] === t) return false;
        map.cells[y * map.w + x] = t;
        return true;
      }
      function paint(cell) {
        const t = tool === 'erase' ? 'floor' : tile;
        const changed = cellsIn(cell).filter(([x, y]) => setCell(x, y, t));
        if (changed.length) {
          board.invalidate(changed);
          dirty = true;
        }
      }
      function flood(cell) {
        const sx = Math.floor(cell.x);
        const sy = Math.floor(cell.y);
        if (sx < 0 || sy < 0 || sx >= map.w || sy >= map.h) return;
        const from = map.cells[sy * map.w + sx];
        if (from === tile) return;
        const stack = [[sx, sy]];
        const changed = [];
        while (stack.length) {
          const [x, y] = stack.pop();
          if (x < 0 || y < 0 || x >= map.w || y >= map.h) continue;
          if (map.cells[y * map.w + x] !== from) continue;
          map.cells[y * map.w + x] = tile;
          changed.push([x, y]);
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        board.invalidate(changed);
        dirty = true;
      }
      function pick(cell) {
        const x = Math.floor(cell.x);
        const y = Math.floor(cell.y);
        if (x < 0 || y < 0 || x >= map.w || y >= map.h) return;
        tile = map.cells[y * map.w + x];
        setTool('brush');
        renderPalette();
      }
      function rectCells(a, cell, frameOnly) {
        const b = { x: U.clamp(Math.floor(cell.x), 0, map.w - 1), y: U.clamp(Math.floor(cell.y), 0, map.h - 1) };
        const x0 = Math.min(a.x, b.x);
        const x1 = Math.max(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const y1 = Math.max(a.y, b.y);
        const out = [];
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++) if (!frameOnly || x === x0 || x === x1 || y === y0 || y === y1) out.push([x, y]);
        return out;
      }
      function showRect(cell) {
        board.ov.area = rectCells(rectStart, cell, tool === 'frame');
        board.ov.areaColor = '#ffe680';
      }
      function applyRect(cell) {
        const cells = rectCells(rectStart, cell, tool === 'frame').filter(([x, y]) => setCell(x, y, tile));
        board.invalidate(cells);
        dirty = true;
      }
      function pushUndo() {
        undo.push({ w: map.w, h: map.h, cells: map.cells.slice() });
        if (undo.length > 60) undo.shift();
        redo.length = 0;
      }
      function restore(s) {
        map.w = s.w;
        map.h = s.h;
        map.cells = s.cells.slice();
        board.setMap(map, true);
        updateSize();
      }
      function doUndo() {
        if (!undo.length) return;
        redo.push({ w: map.w, h: map.h, cells: map.cells.slice() });
        restore(undo.pop());
      }
      function doRedo() {
        if (!redo.length) return;
        undo.push({ w: map.w, h: map.h, cells: map.cells.slice() });
        restore(redo.pop());
      }
      function updateSize() {
        sizeLbl.textContent = map.w + ' × ' + map.h + ' клеток (' + map.w * 5 + ' × ' + map.h * 5 + ' фт.)';
      }
      updateSize();

      // ----- Палитра -----
      const palette = el('div');
      function swatch(id) {
        const cv = el('canvas', { width: 44, height: 44 });
        D.drawTile(cv.getContext('2d'), id, 0, 0, 44, 3, 3, null);
        const t = D.TILES[id];
        return el('div', { class: 'swatch' + (tile === id ? ' sel' : ''), title: t.name + (t.difficult ? ' (труднопроходимо)' : '') + (!t.walk ? ' (непроходимо)' : '') + (t.hazard ? ' (урон ' + t.hazard.dice + ')' : ''), onclick: () => { tile = id; if (tool === 'erase' || tool === 'pick') setTool('brush'); renderPalette(); } }, cv, el('span', {}, t.name));
      }
      function renderPalette() {
        U.clear(palette);
        for (const cat of D.TILE_CATS) {
          palette.appendChild(el('div', { class: 'section-title' }, cat));
          const grid = el('div', { class: 'palette' });
          for (const id in D.TILES) if (D.TILES[id].cat === cat) grid.appendChild(swatch(id));
          palette.appendChild(grid);
        }
      }
      renderPalette();

      const toolBtns = {};
      const TOOLS = [
        ['brush', '🖌️ Кисть'],
        ['rect', '⬛ Прямоугольник'],
        ['frame', '🔲 Рамка'],
        ['fill', '🪣 Заливка'],
        ['pick', '💧 Пипетка'],
        ['erase', '🧽 Ластик'],
      ];
      function setTool(t) {
        tool = t;
        for (const k in toolBtns) toolBtns[k].classList.toggle('toggled', k === t);
        board.ov.cursorSize = t === 'brush' || t === 'erase' ? brush : 1;
      }
      const toolsEl = el('div', { class: 'tools' }, TOOLS.map(([id, label]) => (toolBtns[id] = el('button', { class: 'small', onclick: () => setTool(id) }, label))));
      const brushSel = U.select([{ value: 1, label: 'Кисть 1×1' }, { value: 2, label: 'Кисть 2×2' }, { value: 3, label: 'Кисть 3×3' }], 1, (v) => { brush = Number(v); setTool(tool); });
      setTool('brush');

      // ----- Действия -----
      async function confirmDiscard() {
        if (!dirty) return true;
        return UI.confirm('Есть несохранённые изменения. Продолжить без сохранения?', 'Продолжить');
      }
      function save(asCopy) {
        if (map.preset || asCopy) {
          map = Object.assign({}, map, { id: U.uid('map'), preset: false, name: map.preset && !asCopy ? map.name + ' (копия)' : asCopy ? map.name + ' (копия)' : map.name });
          delete map.preset;
          nameInp.value = map.name;
        }
        map.name = nameInp.value || 'Без названия';
        Store.saveMap(U.deepClone(map));
        dirty = false;
        UI.toast('Карта «' + map.name + '» сохранена');
      }
      async function openDialog() {
        if (!(await confirmDiscard())) return;
        const list = el('div', { class: 'list', style: { minWidth: '420px' } });
        const m = UI.modal({ title: 'Открыть карту', body: list, buttons: [{ label: 'Закрыть', value: null }] });
        const redraw = () => {
          U.clear(list);
          for (const mp of Store.allMaps()) {
            list.appendChild(el('div', { class: 'list-item' },
              el('span', { class: 'ico' }, mp.preset ? '📜' : '🗺️'),
              el('div', { class: 'grow', onclick: () => { m.close(); load(mp); } }, el('div', {}, mp.name), el('div', { class: 'muted', style: { fontSize: '12px' } }, mp.w + '×' + mp.h + (mp.preset ? ' · готовая карта' : ''))),
              mp.preset ? null : el('button', { class: 'small danger', onclick: async () => { if (await UI.confirm('Удалить карту «' + mp.name + '»?')) { Store.deleteMap(mp.id); redraw(); } } }, '🗑')
            ));
          }
        };
        redraw();
      }
      function load(mp) {
        map = U.deepClone(mp);
        nameInp.value = map.name;
        undo.length = 0;
        redo.length = 0;
        dirty = false;
        board.setMap(map);
        updateSize();
      }
      async function newDialog() {
        if (!(await confirmDiscard())) return;
        const w = el('input', { type: 'number', value: 24, min: 6, max: 120 });
        const h = el('input', { type: 'number', value: 16, min: 6, max: 120 });
        const fill = U.select(Object.keys(D.TILES).filter((k) => D.TILES[k].walk).map((k) => ({ value: k, label: D.TILES[k].name })), 'floor');
        const border = el('input', { type: 'checkbox', checked: true });
        const r = await UI.modal({
          title: 'Новая карта',
          body: el('div', { class: 'form-grid' }, el('label', {}, 'Ширина'), w, el('label', {}, 'Высота'), h, el('label', {}, 'Основа'), fill, el('label', {}, 'Стены по краям'), el('div', {}, border)),
          buttons: [{ label: 'Отмена', value: null }, { label: 'Создать', cls: 'primary', value: true }],
        }).promise;
        if (!r) return;
        const W = U.clamp(Number(w.value) || 24, 6, 120);
        const H = U.clamp(Number(h.value) || 16, 6, 120);
        const m = newMap(W, H, fill.value);
        if (border.checked) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) m.cells[y * W + x] = 'wall';
        load(m);
      }
      async function resizeDialog() {
        const w = el('input', { type: 'number', value: map.w, min: 6, max: 120 });
        const h = el('input', { type: 'number', value: map.h, min: 6, max: 120 });
        const r = await UI.modal({
          title: 'Изменить размер',
          body: el('div', { class: 'form-grid' }, el('label', {}, 'Ширина'), w, el('label', {}, 'Высота'), h),
          buttons: [{ label: 'Отмена', value: null }, { label: 'Применить', cls: 'primary', value: true }],
        }).promise;
        if (!r) return;
        pushUndo();
        const W = U.clamp(Number(w.value) || map.w, 6, 120);
        const H = U.clamp(Number(h.value) || map.h, 6, 120);
        const cells = new Array(W * H).fill('floor');
        for (let y = 0; y < Math.min(H, map.h); y++) for (let x = 0; x < Math.min(W, map.w); x++) cells[y * W + x] = map.cells[y * map.w + x];
        map.w = W;
        map.h = H;
        map.cells = cells;
        board.setMap(map);
        updateSize();
        dirty = true;
      }
      function exportMap() {
        U.downloadJSON((map.name || 'map').replace(/[\\/:*?"<>|]/g, '_') + '.dndmap.json', { type: 'dnd-map', version: 1, map: { name: map.name, w: map.w, h: map.h, cells: map.cells } });
      }
      async function importMap() {
        const f = await U.pickFile('.json');
        if (!f) return;
        try {
          const data = JSON.parse(f.data);
          const m = data.map || data;
          if (!m.w || !m.h || !Array.isArray(m.cells) || m.cells.length !== m.w * m.h) throw new Error('bad');
          m.cells = m.cells.map((c) => (D.TILES[c] ? c : 'floor'));
          load({ id: U.uid('map'), name: m.name || f.name, w: m.w, h: m.h, cells: m.cells });
          dirty = true;
          UI.toast('Карта импортирована — не забудьте сохранить');
        } catch (e) {
          UI.toast('Не удалось прочитать файл карты', 'bad');
        }
      }

      const onKey = (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.ctrlKey && (e.key === 'z' || e.key === 'я')) {
          e.preventDefault();
          doUndo();
        } else if (e.ctrlKey && (e.key === 'y' || e.key === 'н')) {
          e.preventDefault();
          doRedo();
        } else if (e.ctrlKey && (e.key === 's' || e.key === 'ы')) {
          e.preventDefault();
          save(false);
        }
      };
      document.addEventListener('keydown', onKey);

      const sidebar = el('div', { class: 'sidebar' },
        el('div', { class: 'section-title' }, 'Инструменты'),
        toolsEl,
        el('div', { class: 'row', style: { marginTop: '8px' } }, brushSel),
        el('div', { class: 'row', style: { marginTop: '8px' } },
          el('button', { class: 'small', onclick: doUndo, title: 'Ctrl+Z' }, '↶ Отменить'),
          el('button', { class: 'small', onclick: doRedo, title: 'Ctrl+Y' }, '↷ Повторить')),
        palette
      );

      rootEl.appendChild(el('div', { class: 'screen' },
        el('div', { class: 'topbar' },
          el('button', { onclick: async () => { if (await confirmDiscard()) D.App.show(params.returnBattle ? 'battle' : 'menu', params.returnBattle ? { load: params.returnBattle } : {}); } }, params.returnBattle ? '← Назад к бою' : '← Меню'),
          el('h2', {}, '🗺️ Редактор карт'),
          nameInp,
          sizeLbl,
          el('div', { class: 'spacer' }),
          el('button', { onclick: newDialog }, '📄 Новая'),
          el('button', { onclick: openDialog }, '📂 Открыть'),
          el('button', { onclick: resizeDialog }, '📐 Размер'),
          el('button', { onclick: () => save(false), class: 'gold', title: 'Ctrl+S' }, '💾 Сохранить'),
          el('button', { onclick: () => save(true) }, 'Копия'),
          el('button', { onclick: exportMap, title: 'Сохранить в файл' }, '⬇ Экспорт'),
          el('button', { onclick: importMap, title: 'Загрузить из файла' }, '⬆ Импорт'),
          params.returnBattle
            ? el('button', { class: 'primary', onclick: () => { const rb = params.returnBattle; rb.map = U.deepClone({ id: map.id, name: map.name, w: map.w, h: map.h, cells: map.cells }); D.App.show('battle', { load: rb, revalidate: true }); } }, '↩ Вернуться в бой')
            : el('button', { class: 'primary', onclick: async () => { if (dirty) save(false); D.App.show('battle', { mapId: map.id }); } }, '⚔️ Бой на этой карте')
        ),
        el('div', { class: 'body' }, sidebar, el('div', { class: 'col grow', style: { gap: 0 } }, wrap, el('div', { style: { padding: '4px 10px', background: 'var(--panel)', borderTop: '1px solid var(--line)', fontSize: '12px' } }, status)))
      ));
      requestAnimationFrame(() => board.fit());
      self.destroy = () => {
        board.destroy();
        document.removeEventListener('keydown', onKey);
      };
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
