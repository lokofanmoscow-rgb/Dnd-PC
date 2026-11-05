/* Экран боя: подготовка, инициатива, ходы игроков и ИИ */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const R = D.R;
  const G = D.Grid;
  const el = U.el;
  const UI = D.UI;
  const Store = D.Store;

  D.App.register('battle', {
    render(rootEl, params) {
      const self = this;
      const settings = Store.settings();
      let B;
      if (params.load) B = U.deepClone(params.load);
      else {
        const map = (params.mapId && Store.map(params.mapId)) || D.PRESET_MAPS[0];
        B = D.Combat.newBattle(map);
      }
      let destroyed = false;

      /* ---------- Каркас ---------- */
      const nameInp = el('input', { value: B.name, style: { width: '260px' }, oninput: () => (B.name = nameInp.value) });
      const phaseLbl = el('span', { class: 'chip' });
      const topbar = el('div', { class: 'topbar' },
        el('button', { onclick: () => leave() }, '← Меню'),
        el('h2', {}, '⚔️'), nameInp, phaseLbl,
        el('div', { class: 'spacer' }),
        el('button', { title: 'Рисовать на карте прямо во время игры', onclick: () => togglePaint() }, '🖌 Карта'),
        el('button', { onclick: () => addDialog() }, '+ Участник'),
        el('button', { onclick: () => settingsDialog() }, '⚙ Настройки'),
        el('button', { onclick: () => { Store.saveBattle(B); UI.toast('Бой сохранён'); } }, '💾 Сохранить'));
      const initbar = el('div', { class: 'initbar' });
      const left = el('div', { class: 'battle-left' });
      const right = el('div', { class: 'battle-right' });
      const wrap = el('div', { class: 'board-wrap' });
      const tooltip = el('div', { class: 'board-tooltip hidden' });
      const modeBanner = el('div', { class: 'mode-banner hidden' });
      const aiBadge = el('div', { class: 'ai-thinking hidden' }, '🤖 ИИ делает ход…');
      const paintPanel = el('div', { class: 'paint-panel hidden' });
      wrap.append(tooltip, modeBanner, aiBadge, paintPanel, el('div', { class: 'board-zoom' },
        el('button', { class: 'small', onclick: () => board.zoomAt(board.vw / 2, board.vh / 2, 1.2) }, '＋'),
        el('button', { class: 'small', onclick: () => board.zoomAt(board.vw / 2, board.vh / 2, 1 / 1.2) }, '－'),
        el('button', { class: 'small', onclick: () => board.fit() }, '⤢')));
      const logEl = el('div', { class: 'log' });
      rootEl.appendChild(el('div', { class: 'battle' }, topbar, initbar, el('div', { class: 'battle-body' }, left, wrap, right)));

      const dicebox = new D.DiceBox(wrap);
      dicebox.speed = settings.dice;

      /* ---------- Состояние интерфейса ---------- */
      const ui = { mode: 'move', busy: false, targets: [], hover: null, placing: null, dragUid: null, paused: !settings.autoAI, reachMap: null, reachList: null };

      const board = new D.Board(wrap, {
        onClick: (cell, e) => onBoardClick(cell, e),
        onRightClick: (cell, e) => onBoardRight(cell, e),
        onHover: (cell, e, sx, sy) => onBoardHover(cell, sx, sy),
        onLeave: () => tooltip.classList.add('hidden'),
        onDragStart: (cell) => {
          if (ui.mode === 'paint') {
            paintAt(cell);
            return true;
          }
          if (B.phase !== 'setup' || ui.busy) return false;
          const o = G.occupant(B, Math.floor(cell.x), Math.floor(cell.y));
          if (!o) return false;
          ui.dragUid = o.uid;
          board.ov.sel = o.uid;
          return true;
        },
        onDrag: (cell) => {
          if (ui.mode === 'paint') return paintAt(cell);
          const o = E.get(ui.dragUid);
          if (!o) return;
          const x = Math.floor(cell.x - (o.cells - 1) / 2);
          const y = Math.floor(cell.y - (o.cells - 1) / 2);
          board.ov.area = G.footprint(x, y, o.cells);
          board.ov.areaColor = G.canStand(B, o, x, y, { fly: !!o.speed.fly }) && G.canEndAt(B, o, x, y) ? '#7cfc7c' : '#ff5050';
        },
        onDragEnd: (cell) => {
          if (ui.mode === 'paint') return refresh();
          const o = E.get(ui.dragUid);
          ui.dragUid = null;
          board.ov.area = null;
          if (!o) return;
          const x = Math.floor(cell.x - (o.cells - 1) / 2);
          const y = Math.floor(cell.y - (o.cells - 1) / 2);
          if (G.canStand(B, o, x, y, { fly: !!o.speed.fly }) && G.canEndAt(B, o, x, y)) {
            o.x = x;
            o.y = y;
          }
          refresh();
        },
      });
      board.tokens = () => B.combatants;
      board.showEnemyHp = settings.enemyHp;
      board.setMap(B.map);
      requestAnimationFrame(() => board.fit());

      const aiFast = () => settings.aiSpeed === 'fast';
      const isAI = (c) => c && c.controller === 'ai';
      const hooks = {
        log: (html, cls) => appendLog(html, cls),
        float: (c, text, color) => board.floatText(c, text, color),
        roll: (info) => dicebox.show(info, isAI(info.actor) && settings.aiSpeed === 'fast' && settings.dice !== 'off' ? 'fast' : undefined),
        ask: (q, opts, c) => UI.ask(q, opts, c ? 'Решение: ' + c.name : 'Решение'),
        askNumber: async (q, min, max, def) => {
          const v = await UI.prompt(q, def, { type: 'number', min, max });
          return v == null || isNaN(v) ? 0 : U.clamp(Math.round(v), min, max);
        },
        changed: () => scheduleRefresh(),
        animateStep: (c, fx, fy, tx, ty) => board.tweenStep(c, fx, fy, tx, ty, isAI(c) && aiFast() ? 60 : 110),
        flashCells: (cells, color) => board.flashCells(cells, color, 650),
        ended: (result) => setTimeout(() => showEnd(result), 400),
      };
      const E = new D.Combat.Engine(B, hooks);
      const cur = () => E.current();

      /* ---------- Журнал ---------- */
      function appendLog(html, cls) {
        const nearBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 60;
        logEl.appendChild(el('div', { class: cls || '', html }));
        while (logEl.childNodes.length > 500) logEl.removeChild(logEl.firstChild);
        if (nearBottom) logEl.scrollTop = logEl.scrollHeight;
      }
      for (const l of B.log) logEl.appendChild(el('div', { class: l.c, html: l.t }));
      setTimeout(() => (logEl.scrollTop = logEl.scrollHeight), 50);

      /* ---------- Обновление ---------- */
      let refreshPending = false;
      function scheduleRefresh() {
        if (refreshPending) return;
        refreshPending = true;
        requestAnimationFrame(() => {
          refreshPending = false;
          if (!destroyed) refresh();
        });
      }
      function refresh() {
        phaseLbl.textContent = B.phase === 'setup' ? 'Подготовка' : B.phase === 'initiative' ? 'Инициатива' : B.phase === 'combat' ? 'Раунд ' + B.round : B.result === 'victory' ? 'Победа' : 'Поражение';
        renderInitbar();
        renderLeft();
        renderRight();
        computeReach();
        updateOverlays();
        renderPaintPanel();
      }

      function computeReach() {
        const c = cur();
        ui.reachMap = null;
        ui.reachList = null;
        if (B.phase !== 'combat' || !c || isAI(c) || ui.busy || ui.mode !== 'move' || E.incap(c)) return;
        ui.reachMap = E.reachable(c);
        ui.reachList = [];
        for (const rec of ui.reachMap.values()) if ((rec.x !== c.x || rec.y !== c.y) && G.canEndAt(B, c, rec.x, rec.y)) ui.reachList.push(rec);
      }

      function updateOverlays() {
        const ov = board.ov;
        const c = cur();
        ov.current = c ? c.uid : null;
        ov.reach = ui.reachList;
        ov.targets = null;
        ov.chosen = ui.targets.length ? ui.targets : null;
        ov.showCursor = B.phase === 'setup' && !!ui.placing;
        ov.cursorSize = ui.placing ? (E.get(ui.placing) || { cells: 1 }).cells : 1;
        if (!ui.dragUid) ov.area = null;
        ov.rangeCircle = null;
        ov.path = null;
        ov.pathLabel = null;
        if (B.phase === 'combat' && c && !ui.busy && !isAI(c)) {
          const vt = validTargets();
          if (vt) ov.targets = new Set(vt.map((o) => o.uid));
          const area = currentArea();
          if (area) {
            ov.area = area.cells;
            ov.areaColor = area.color;
          }
          const rng = currentRange();
          if (rng) ov.rangeCircle = { x: c.x + c.cells / 2, y: c.y + c.cells / 2, r: rng / 5 + c.cells / 2 };
          if (ui.mode === 'move' && ui.hover && ui.reachMap) {
            const hx = Math.floor(ui.hover.x);
            const hy = Math.floor(ui.hover.y);
            const rec = ui.reachMap.get(G.key(hx, hy));
            if (rec && G.canEndAt(B, c, hx, hy) && (hx !== c.x || hy !== c.y)) {
              ov.path = G.pathTo(ui.reachMap, hx, hy);
              ov.pathCells = c.cells;
              ov.pathLabel = rec.cost * 5 + ' фт.';
            }
          }
        }
        renderModeBanner();
      }

      /* ---------- Полоса инициативы ---------- */
      function renderInitbar() {
        U.clear(initbar);
        if (B.phase === 'setup' || B.phase === 'initiative') {
          initbar.appendChild(el('div', { class: 'round' }, B.phase === 'setup' ? 'Подготовка' : 'Инициатива'));
          initbar.appendChild(el('div', { class: 'muted', style: { fontSize: '13px' } }, B.phase === 'setup'
            ? 'Выберите карту, добавьте героев и монстров, расставьте жетоны (клик по участнику слева, затем по клетке; жетоны можно перетаскивать). Затем — «Начать бой».'
            : 'Игроки по очереди бросают инициативу.'));
          return;
        }
        initbar.appendChild(el('div', { class: 'round' }, 'Раунд', el('b', {}, B.round)));
        const c = cur();
        B.order.forEach((uid) => {
          const o = E.get(uid);
          if (!o) return;
          const frac = U.clamp(o.hp / o.maxHp, 0, 1);
          const showHp = o.side !== 'enemies' || settings.enemyHp;
          initbar.appendChild(el('div', {
            class: 'init-tok' + (c && c.uid === uid ? ' cur' : '') + (o.dead ? ' dead' : '') + (o.hp <= 0 && !o.dead ? ' down' : ''),
            title: o.name + ' — инициатива ' + o.initiative + (showHp ? ', хиты ' + o.hp + '/' + o.maxHp : ''),
            onclick: () => board.centerOn(o.x, o.y),
          }, UI.face(o), el('div', { class: 'ini' }, o.initiative), el('div', { class: 'nm' }, o.name),
          showHp ? el('div', { class: 'hpb' }, el('i', { style: { width: frac * 100 + '%', background: frac > 0.5 ? '#4fc94f' : frac > 0.25 ? '#e0bb3a' : '#e5432f' } })) : null));
        });
      }

      /* ---------- Левая панель ---------- */
      function renderLeft() {
        U.clear(left);
        if (B.phase === 'setup') {
          left.appendChild(renderSetupPanel());
          return;
        }
        left.appendChild(el('div', { style: { padding: '8px 10px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-head)', color: 'var(--accent3)' } }, '📜 Журнал боя'));
        left.appendChild(logEl);
        left.appendChild(renderDiceTray());
      }

      function renderSetupPanel() {
        const box = el('div', { class: 'scroll' });
        box.appendChild(el('div', { class: 'section-title' }, 'Карта'));
        const maps = Store.allMaps();
        box.appendChild(el('div', { class: 'row' },
          U.select(maps.map((m) => ({ value: m.id, label: (m.preset ? '📜 ' : '🗺️ ') + m.name })), B.map.id, async (v) => {
            const m = Store.map(v);
            if (!m) return;
            B.map = U.deepClone({ id: m.id, name: m.name, w: m.w, h: m.h, cells: m.cells });
            B.combatants.forEach((c) => (c.x = -1));
            board.setMap(B.map);
            if (!params.load && (!B.name || B.name.startsWith('Бой: '))) {
              B.name = 'Бой: ' + m.name;
              nameInp.value = B.name;
            }
            autoPlaceAll();
            refresh();
          }, { style: { width: '100%' } })));
        box.appendChild(el('div', { class: 'row', style: { marginTop: '6px' } },
          el('button', { class: 'small', onclick: () => togglePaint() }, '🖌 Рисовать на карте'),
          el('button', { class: 'small', onclick: () => D.App.show('editor', { map: B.map, returnBattle: B }) }, '✏️ В редактор')));
        box.appendChild(el('div', { class: 'section-title' }, 'Участники (' + B.combatants.length + ')'));
        box.appendChild(el('div', { class: 'row wrap' },
          el('button', { class: 'small', onclick: () => pickHeroes() }, '🧙 + Герои'),
          el('button', { class: 'small', onclick: () => pickMonsters() }, '👹 + Монстры'),
          el('button', { class: 'small', onclick: () => { B.combatants.forEach((c) => (c.x = -1)); autoPlaceAll(); refresh(); } }, '↻ Расставить')));
        const list = el('div', { class: 'participants col', style: { gap: '2px', marginTop: '8px' } });
        if (!B.combatants.length) list.appendChild(el('div', { class: 'empty', style: { padding: '16px' } }, 'Добавьте героев и монстров'));
        for (const c of B.combatants) {
          const row = el('div', { class: 'p-row' + (ui.placing === c.uid ? ' sel' : ''), title: 'Клик — выбрать и поставить на клетку' },
            UI.face(c, 'ico'),
            el('div', { class: 'nm', onclick: () => { ui.placing = ui.placing === c.uid ? null : c.uid; if (c.x >= 0) board.centerOn(c.x, c.y); refresh(); } },
              c.name, c.x < 0 ? el('div', { class: 'unplaced' }, 'не на поле') : el('div', { class: 'muted', style: { fontSize: '11px' } }, (c.kind === 'pc' ? c.clsName + ' ' + c.level : 'ПО ' + c.cr) + ' · ❤️' + c.maxHp + ' · 🛡️' + c.ac + (c.customMaxHp || c.customAc ? ' ✎' : ''))),
            U.select(Object.keys(R.SIDES).map((k) => ({ value: k, label: R.SIDES[k].name })), c.side, (v) => { c.side = v; if (c.kind !== 'pc') c.color = R.SIDES[v].color; refresh(); }, { title: 'Сторона' }),
            U.select([{ value: 'human', label: '🎮' }, { value: 'ai', label: '🤖' }], c.controller, (v) => { c.controller = v; refresh(); }, { title: 'Управление: игрок / ИИ' }),
            el('button', { class: 'small ghost', title: 'Убрать', onclick: () => { B.combatants = B.combatants.filter((o) => o !== c); if (ui.placing === c.uid) ui.placing = null; refresh(); } }, '✕'));
          list.appendChild(row);
        }
        box.appendChild(list);
        box.appendChild(el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '8px' } }, '🎮 — ходит игрок (за этим компьютером), 🤖 — ходит ИИ. Монстрами может управлять ведущий: переключите на 🎮.'));
        const placedAll = B.combatants.length && B.combatants.every((c) => c.x >= 0);
        const hasEnemies = B.combatants.some((c) => c.side === 'enemies');
        const hasHeroes = B.combatants.some((c) => c.side !== 'enemies');
        box.appendChild(el('button', {
          class: 'primary end-turn', style: { marginTop: '14px' }, disabled: !placedAll || !hasEnemies || !hasHeroes,
          onclick: () => startInitiative(),
        }, '⚔️ Начать бой — броски инициативы'));
        if (!placedAll && B.combatants.length) box.appendChild(el('div', { class: 'warn', style: { fontSize: '12px', marginTop: '4px' } }, 'Не все участники на поле.'));
        if (B.combatants.length && (!hasEnemies || !hasHeroes)) box.appendChild(el('div', { class: 'warn', style: { fontSize: '12px', marginTop: '4px' } }, 'Нужен хотя бы один участник на стороне врагов и один — на стороне героев/союзников.'));
        return box;
      }

      function renderDiceTray() {
        const formula = el('input', { placeholder: '2к6+3', style: { width: '90px' } });
        const roll = (f) => {
          const r = D.Dice.roll(f);
          const txt = '🎲 Свободный бросок <b>' + U.escapeHtml(f) + '</b>: ' + D.Dice.fmtRolls(r) + ' = <b>' + r.total + '</b>';
          E.log(txt, 'init');
          UI.toast('🎲 ' + f + ' = ' + r.total);
        };
        formula.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && formula.value.trim()) roll(formula.value.trim());
        });
        return el('div', { class: 'dicetray' },
          el('div', { class: 'row wrap', style: { gap: '4px' } }, ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((d) => el('button', { onclick: () => roll('1' + d) }, d))),
          el('div', { class: 'row', style: { marginTop: '6px' } }, formula, el('button', { class: 'small', onclick: () => formula.value.trim() && roll(formula.value.trim()) }, 'Бросить')));
      }

      /* ---------- Правая панель ---------- */
      function renderRight() {
        U.clear(right);
        const scroll = el('div', { class: 'scroll' });
        if (B.phase === 'setup') {
          const sel = ui.placing && E.get(ui.placing);
          scroll.appendChild(el('div', { class: 'section-title' }, 'Как начать'));
          scroll.appendChild(el('ol', { style: { paddingLeft: '18px', lineHeight: 1.6, margin: 0 } },
            el('li', {}, 'Выберите карту.'),
            el('li', {}, 'Добавьте героев (из списка персонажей) и монстров из бестиария.'),
            el('li', {}, 'Расставьте жетоны: перетащите мышью или выберите участника слева и кликните по клетке.'),
            el('li', {}, 'Нажмите «Начать бой» — игроки по очереди бросят инициативу.')));
          if (sel) {
            scroll.appendChild(el('div', { class: 'section-title' }, 'Выбран: ' + sel.name));
            scroll.appendChild(el('div', { class: 'muted' }, sel.x < 0 ? 'Кликните по свободной клетке, чтобы поставить жетон.' : 'Кликните по клетке, чтобы переставить жетон.'));
            scroll.appendChild(statEditor(sel));
            scroll.appendChild(compactInfo(sel));
          }
          right.appendChild(scroll);
          return;
        }
        if (B.phase === 'initiative') {
          scroll.appendChild(el('div', { class: 'muted' }, 'Идут броски инициативы…'));
          right.appendChild(scroll);
          return;
        }
        if (B.phase === 'ended') {
          scroll.appendChild(el('h3', {}, B.result === 'victory' ? '🏆 Победа!' : '💀 Поражение'));
          scroll.appendChild(el('div', {}, 'Опыт за бой: ' + B.xp + ' XP'));
          const heroes = B.combatants.filter((c) => c.kind === 'pc');
          if (heroes.length) scroll.appendChild(el('div', { class: 'muted' }, 'На каждого героя: ' + Math.floor(B.xp / heroes.length) + ' XP'));
          scroll.appendChild(el('div', { class: 'col', style: { marginTop: '12px' } },
            el('button', { class: 'primary', onclick: () => D.App.show('battle', {}) }, '⚔️ Новый бой'),
            el('button', { onclick: () => restartSameSetup() }, '↻ Переиграть с теми же участниками'),
            el('button', { onclick: () => D.App.show('menu') }, '← В меню')));
          right.appendChild(scroll);
          return;
        }
        const c = cur();
        if (!c) return;
        right.appendChild(actorCard(c));
        if (isAI(c)) {
          scroll.appendChild(el('div', { class: 'section-title' }, '🤖 Ход ИИ'));
          if (ui.busy) scroll.appendChild(el('div', { class: 'muted' }, c.name + ' действует…'));
          else {
            scroll.appendChild(el('div', { class: 'muted', style: { marginBottom: '8px' } }, 'Автоход ИИ выключен. Нажмите, чтобы ИИ сделал ход, или возьмите управление на себя.'));
            scroll.appendChild(el('button', { class: 'primary end-turn', onclick: () => runAI() }, '▶ Ход ИИ'));
            scroll.appendChild(el('button', { class: 'end-turn', onclick: () => { c.controller = 'human'; refresh(); } }, '🎮 Управлять вручную'));
          }
          scroll.appendChild(el('label', { class: 'row', style: { marginTop: '10px' } }, el('input', { type: 'checkbox', checked: !ui.paused, onchange: (e) => { ui.paused = !e.target.checked; settings.autoAI = e.target.checked; Store.setSettings(settings); if (!ui.paused && !ui.busy) turnLoop(); } }), 'Автоход ИИ'));
          right.appendChild(scroll);
          return;
        }
        renderActions(scroll, c);
        right.appendChild(scroll);
      }

      /* Правка максимума хитов и КД участника при подготовке */
      function statEditor(c) {
        const hp = el('input', { type: 'number', min: 1, max: 9999, value: c.maxHp, style: { width: '80px' } });
        const ac = el('input', { type: 'number', min: 1, max: 40, value: c.ac, style: { width: '64px' } });
        const apply = () => {
          const h = U.clamp(Math.round(Number(hp.value)) || c.maxHp, 1, 9999);
          const a = U.clamp(Math.round(Number(ac.value)) || c.ac, 1, 40);
          if (h !== c.maxHp) {
            c.maxHp = h;
            c.hp = h;
            c.customMaxHp = h;
          }
          if (a !== c.ac) {
            c.ac = a;
            c.customAc = a;
          }
          setTimeout(refresh, 0);
        };
        hp.addEventListener('change', apply);
        ac.addEventListener('change', apply);
        hp.addEventListener('keydown', (e) => e.key === 'Enter' && hp.blur());
        ac.addEventListener('keydown', (e) => e.key === 'Enter' && ac.blur());
        return el('div', { class: 'stat-edit' },
          el('label', {}, '❤️ Макс. хитов', hp),
          el('label', {}, '🛡️ КД', ac),
          el('button', { class: 'small ghost', title: 'Вернуть исходные значения', onclick: () => resetStats(c) }, '↺'));
      }
      function resetStats(c) {
        let base = null;
        if (c.kind === 'pc') {
          const ch = Store.characters().find((x) => x.id === c.refId);
          if (ch) base = D.Char.toCombatant(ch, c.side);
        } else {
          const m = D.monster(c.refId);
          if (m) base = D.Combat.fromMonster(m, c.side, {});
        }
        if (!base) return;
        if (!c.companionOf) {
          c.maxHp = c.hp = base.maxHp;
          c.ac = base.ac;
        }
        delete c.customMaxHp;
        delete c.customAc;
        refresh();
      }
      async function editStatsDialog(o) {
        const hp = el('input', { type: 'number', min: 1, max: 9999, value: o.maxHp });
        const ac = el('input', { type: 'number', min: 1, max: 40, value: o.ac });
        const r = await UI.modal({
          title: o.name + ': хиты и КД',
          body: el('div', { class: 'form-grid' }, el('label', {}, 'Максимум хитов'), hp, el('label', {}, 'Класс Доспеха'), ac),
          buttons: [{ label: 'Отмена', value: null }, { label: 'Применить', cls: 'primary', value: true }],
        }).promise;
        if (!r) return;
        const h = U.clamp(Math.round(Number(hp.value)) || o.maxHp, 1, 9999);
        const a = U.clamp(Math.round(Number(ac.value)) || o.ac, 1, 40);
        if (B.phase === 'setup' || B.phase === 'initiative') o.hp = h;
        else if (h > o.maxHp && o.hp > 0) o.hp += h - o.maxHp;
        o.maxHp = h;
        o.hp = Math.min(o.hp, h);
        o.ac = a;
        o.customMaxHp = h;
        o.customAc = a;
        if (B.phase === 'combat') E.log('Ведущий меняет ' + E.name(o) + ': макс. хитов ' + h + ', КД ' + a + '.', 'muted');
        refresh();
      }

      function compactInfo(c) {
        const box = el('div', { class: 'col', style: { marginTop: '8px', gap: '4px', fontSize: '12px' } });
        box.appendChild(el('div', {}, '❤️ ' + c.hp + '/' + c.maxHp + ' · 🛡️ КД ' + c.ac + ' · 👣 ' + c.speed.walk + ' фт.' + (c.speed.fly ? ' (полёт ' + c.speed.fly + ')' : '')));
        box.appendChild(el('div', { class: 'muted' }, 'Атаки: ' + c.attacks.map((a) => a.name + ' ' + U.fmtMod(a.toHit)).join(', ')));
        if (c.spells && c.spells.length) box.appendChild(el('div', { class: 'spell' }, 'Заклинания: ' + c.spells.map((id) => D.spell(id).name).join(', ')));
        return box;
      }

      function actorCard(c) {
        const t = B.turn || {};
        const frac = U.clamp(c.hp / c.maxHp, 0, 1);
        const card = el('div', { class: 'actor-card' });
        const sub = c.kind === 'pc' ? c.raceName + ' · ' + c.clsName + ' ' + c.level + ' ур.' + (c.player ? ' · игрок ' + c.player : '') : (R.CREATURE_TYPES[c.type] || '') + ' · ПО ' + c.cr;
        card.appendChild(el('div', { class: 'head' }, UI.face(c), el('div', { class: 'grow' }, el('h3', {}, c.name), el('div', { class: 'muted', style: { fontSize: '12px' } }, sub))));
        const hb = el('div', { class: 'hpbar', title: 'Правый клик по жетону — изменить хиты' },
          el('i', { class: frac > 0.5 ? '' : frac > 0.25 ? 'mid' : 'low', style: { width: frac * 100 + '%' } }),
          c.tempHp ? el('i', { class: 'temp', style: { width: U.clamp(c.tempHp / c.maxHp, 0, 1) * 100 + '%', height: '5px' } }) : null,
          el('span', {}, 'Хиты ' + c.hp + ' / ' + c.maxHp + (c.tempHp ? ' (+' + c.tempHp + ' врем.)' : '')));
        card.appendChild(hb);
        const myTurn = t.uid === c.uid;
        card.appendChild(el('div', { class: 'econ' },
          el('span', { class: 'pip' }, '🛡️ КД ' + E.acOf(c)),
          el('span', { class: 'pip' + (myTurn ? (t.move > 0 ? ' on' : ' off') : '') }, '👣 ' + (myTurn ? t.move + '/' : '') + E.speedOf(c) + ' фт.'),
          el('span', { class: 'pip ' + (myTurn ? (t.actions > 0 ? 'on' : 'off') : '') }, '⚔️ Действие' + (t.actions > 1 ? ' ×' + t.actions : '')),
          el('span', { class: 'pip ' + (myTurn ? (t.bonus ? 'on' : 'off') : '') }, '✴️ Бонусное'),
          el('span', { class: 'pip ' + (!c.reactionUsed && !E.hasEff(c, 'noReactions') ? 'on' : 'off') }, '↩️ Реакция'),
          myTurn && t.attacksLeft > 0 ? el('span', { class: 'pip on' }, '🗡️ Атак: ' + t.attacksLeft) : null));
        const chips = el('div', { class: 'chips' });
        for (const cond of c.conditions) {
          const d = R.CONDITIONS[cond.id];
          chips.appendChild(el('span', { class: 'chip bad', title: d.desc }, d.icon + ' ' + d.name));
        }
        for (const e of c.effects) {
          const d = R.EFFECTS[e.id];
          if (!d || e.silent) continue;
          chips.appendChild(el('span', { class: 'chip ' + (['mockery', 'slowed', 'noReactions', 'hex', 'hunterMark', 'guidingBolt', 'reckless', 'helped', 'faerieFire', 'slowSpell', 'vowOfEnmity', 'acidArrow', 'entropicMark'].includes(e.id) ? 'bad' : 'good') }, d.icon + ' ' + d.name + (e.id === 'inspiration' ? ' (к' + e.value + ')' : '')));
        }
        if (c.concentration) chips.appendChild(el('span', { class: 'chip spell', title: 'Нажмите, чтобы прекратить концентрацию', style: { cursor: 'pointer' }, onclick: () => { E.endConcentration(c, 'добровольно'); refresh(); } }, '🧠 ' + c.concentration.name + ' ✕'));
        if (chips.childNodes.length) card.appendChild(chips);
        if (c.kind === 'pc' && c.hp <= 0 && !c.dead) {
          const boxes = (n, cls) => Array.from({ length: 3 }, (_, i) => el('span', { class: 'box' + (i < n ? ' ' + cls : '') }));
          card.appendChild(el('div', { class: 'death-saves' }, el('span', {}, 'Успехи', boxes(c.death.s, 's')), el('span', {}, 'Провалы', boxes(c.death.f, 'f')), c.stable ? el('span', { class: 'good' }, 'стабилен') : null));
        }
        return card;
      }

      function atkLabel(a, c) {
        const dmg = (a.dmg || []).map((d) => d.dice).join('+');
        let rng = '';
        if (a.kind === 'ranged') rng = a.range ? a.range[0] + '/' + a.range[1] + ' фт.' : '';
        else rng = (a.reach || 5) + ' фт.' + (a.range ? ', бросок ' + a.range[0] + '/' + a.range[1] : '');
        if (a.type === 'gaze' || a.type === 'aoeCondition') return el('span', {}, a.name, el('small', {}, ' спасбросок Сл ' + a.dc));
        return el('span', { style: { display: 'flex', width: '100%', justifyContent: 'space-between', gap: '6px' } }, el('span', {}, a.name, el('small', {}, ' ' + rng)), el('small', {}, U.fmtMod(a.toHit) + ' · ' + dmg));
      }

      function renderActions(scroll, c) {
        const t = B.turn;
        if (!t || t.uid !== c.uid) return;
        const busy = ui.busy;
        if (E.incap(c)) {
          scroll.appendChild(el('div', { class: 'bad', style: { margin: '8px 0' } }, c.hp <= 0 ? 'Без сознания — ход пропускается.' : 'Недееспособен — может только закончить ход.'));
          scroll.appendChild(el('button', { class: 'primary end-turn', disabled: busy, onclick: () => endTurnClick() }, '⏭ Закончить ход'));
          return;
        }
        const grp = (title, ...btns) => {
          const flat = btns.flat().filter(Boolean);
          if (!flat.length) return null;
          return el('div', { class: 'act-group' }, el('div', { class: 'gt' }, title), el('div', { class: 'act-btns' }, flat));
        };
        // Атаки
        const opts = E.attackOptions(c);
        const atkBtns = opts.main.map((o) => el('button', {
          class: 'atk-btn' + (ui.mode === 'attack' && ui.atkId === o.atk.id && !ui.bonusAtk ? ' toggled' : ''),
          disabled: busy || !o.enabled,
          onclick: () => {
            if (o.special && o.atk.type === 'aoeCondition') return run(() => E.doAttack(c, o.atk.id, null));
            setMode('attack', { atkId: o.atk.id, bonusAtk: false });
          },
        }, atkLabel(o.atk, c)));
        let poolInfo = null;
        if (t.pool && t.attacksLeft > 0) poolInfo = el('div', { class: 'muted', style: { fontSize: '11px', width: '100%' } }, 'Мультиатака, осталось: ' + t.pool.map((id) => (c.attacks.find((a) => a.id === id) || c.specials.find((s) => s.id === id) || { name: id }).name).join(', '));
        else if (t.attacksLeft > 0) poolInfo = el('div', { class: 'muted', style: { fontSize: '11px', width: '100%' } }, 'Осталось атак в этом действии: ' + t.attacksLeft);
        const g1 = grp('Атаки' + (c.multiattack && !t.attackActionUsed ? ' (мультиатака)' : ''), poolInfo, atkBtns);
        if (g1) scroll.appendChild(g1);
        if (opts.bonus.length) {
          scroll.appendChild(grp('Бонусные атаки (' + t.bonusAttack.count + ')', opts.bonus.map((o) => el('button', {
            class: 'atk-btn' + (ui.mode === 'attack' && ui.atkId === o.atk.id && ui.bonusAtk ? ' toggled' : ''),
            disabled: busy,
            onclick: () => setMode('attack', { atkId: o.atk.id, bonusAtk: true }),
          }, atkLabel(o.atk, c)))));
        }
        // Особые способности (дыхание и т. п.)
        const specials = c.specials.filter((s) => s.type === 'area');
        if (specials.length) {
          scroll.appendChild(grp('Особые способности', specials.map((s) => el('button', {
            class: ui.mode === 'special' && ui.specialId === s.id ? 'toggled' : '',
            disabled: busy || t.actions <= 0 || !E.specialReady(c, s),
            title: D.describeAction(s),
            onclick: () => setMode('special', { specialId: s.id }),
          }, s.name + (!E.specialReady(c, s) ? ' (не готово)' : c.uses && c.uses[s.id] ? ' (' + (c.uses[s.id].max - c.uses[s.id].used) + ')' : '')))));
        }
        // Заклинания
        if (c.spells && c.spells.length && c.spellcasting) {
          const sc = c.spellcasting;
          const g = el('div', { class: 'act-group' }, el('div', { class: 'gt' }, 'Заклинания · Сл ' + sc.dc + ' · атака ' + U.fmtMod(sc.toHit)));
          const slots = Object.keys(sc.slots);
          if (slots.length) g.appendChild(el('div', { class: 'slots' }, slots.map((k) => el('span', { class: 'slot' + (sc.slots[k].used >= sc.slots[k].max ? ' empty' : '') }, k + ' ур.: ' + (sc.slots[k].max - sc.slots[k].used) + '/' + sc.slots[k].max))));
          const btns = el('div', { class: 'act-btns' });
          const spells = c.spells.map((id) => D.spell(id)).filter(Boolean).sort((a, b) => a.level - b.level);
          for (const sp of spells) {
            if (sp.cast === 'reaction') {
              btns.appendChild(el('button', { disabled: true, title: sp.desc + ' (накладывается автоматически, игра спросит)' }, sp.name + ' ↩'));
              continue;
            }
            let minSlot = sp.level ? E.lowestSlot(c, sp.level) : 0;
            const innate = sp.level > 0 && !minSlot && E.usesInnate(c, sp, 0);
            if (innate) minSlot = 'innate';
            const err = E.castCheck(c, sp, minSlot || sp.level || 0);
            const quickOk = c.flags && c.flags.quickenedSpell && sp.cast === 'action' && !E.castCheck(c, sp, minSlot || sp.level || 0, { quicken: true });
            btns.appendChild(el('button', {
              class: ui.mode === 'spell' && ui.spellId === sp.id ? 'toggled' : '',
              disabled: busy || (!!err && !quickOk) || (sp.level > 0 && !minSlot),
              title: sp.desc + (err ? '\n\n⛔ ' + err : '') + (sp.concentration ? '\n(концентрация)' : ''),
              onclick: () => startSpell(c, sp, !!err && quickOk),
            }, (sp.level ? sp.level + '◆ ' : '') + sp.name + (innate ? ' ◇' : '') + (sp.cast === 'bonus' ? ' ✴' : '') + (sp.concentration ? ' 🧠' : '')));
          }
          g.appendChild(btns);
          scroll.appendChild(g);
        }
        // Умения
        const feats = E.featureActions(c);
        if (feats.length) {
          scroll.appendChild(grp('Умения', feats.map((f) => el('button', {
            class: ui.mode === 'feature' && ui.featureId === f.id ? 'toggled' : '',
            disabled: busy || !f.enabled,
            title: f.cost === 'bonus' ? 'Бонусное действие' : f.cost === 'action' ? 'Действие' : 'Без затрат действия',
            onclick: () => startFeature(c, f),
          }, f.name + (f.cost === 'bonus' ? ' ✴' : '')))));
        }
        // Общие действия
        const hasAction = t.actions > 0;
        const restrained = c.conditions.some((x) => x.id === 'grappled' || (x.id === 'restrained' && (x.escape || x.grappleLink)));
        scroll.appendChild(grp('Действия',
          el('button', { disabled: busy || !hasAction, title: 'Удвоить перемещение', onclick: () => run(() => E.dash(c)) }, '🏃 Рывок'),
          el('button', { disabled: busy || !hasAction, title: 'Перемещение не провоцирует атак по возможности', onclick: () => run(() => E.disengage(c)) }, '↩️ Отход'),
          el('button', { disabled: busy || !hasAction, title: 'Атаки по вам с помехой, спасброски Ловкости с преимуществом', onclick: () => run(() => E.dodge(c)) }, '🌀 Уклонение'),
          el('button', { disabled: busy || !hasAction, title: 'Союзник получит преимущество на следующую атаку по выбранному врагу рядом с вами', onclick: () => setMode('action', { actionId: 'help' }) }, '🤝 Помощь'),
          el('button', { disabled: busy || !(hasAction || (t.attacksLeft > 0 && !t.pool)), title: 'Состязание Атлетики: сбить с ног', onclick: () => setMode('action', { actionId: 'shove' }) }, '💥 Сбить с ног'),
          el('button', { disabled: busy || !(hasAction || (t.attacksLeft > 0 && !t.pool)), title: 'Состязание Атлетики: оттолкнуть на 5 фт.', onclick: () => setMode('action', { actionId: 'push' }) }, '👐 Оттолкнуть'),
          el('button', { disabled: busy || !(hasAction || (t.attacksLeft > 0 && !t.pool)), title: 'Состязание Атлетики: схватить (скорость цели = 0)', onclick: () => setMode('action', { actionId: 'grapple' }) }, '🤼 Захват'),
          restrained ? el('button', { disabled: busy || !hasAction, onclick: () => run(() => E.escape(c)) }, '⛓️ Освободиться') : null,
          E.hasCond(c, 'prone') ? el('button', { disabled: busy, title: 'Стоит половину скорости', onclick: () => run(() => E.standUp(c)) }, '🧍 Встать') : null,
          c.potions > 0 ? el('button', { disabled: busy || !(hasAction || (c.flags.fastHands && t.bonus)), onclick: () => potionClick(c) }, '🧪 Зелье (' + c.potions + ')') : null,
          el('button', { disabled: busy || !hasAction, title: 'Проверка Медицины Сл 10 для умирающего союзника рядом', onclick: () => setMode('action', { actionId: 'stabilize' }) }, '🩹 Стабилизировать'),
          B.combatants.some((o) => o.conditions.some((x) => x.tag === 'sleep') && !E.hostile(c, o)) ? el('button', { disabled: busy || !hasAction, onclick: () => setMode('action', { actionId: 'wake' }) }, '⏰ Разбудить') : null));
        scroll.appendChild(el('button', { class: 'primary end-turn', disabled: busy, onclick: () => endTurnClick() }, '⏭ Закончить ход ', el('span', { class: 'kbd' }, 'Пробел')));
        scroll.appendChild(el('div', { class: 'muted', style: { fontSize: '11px', marginTop: '8px', lineHeight: 1.5 } },
          'Голубые клетки — куда можно пойти. Клик по врагу — атака лучшим доступным оружием. Правый клик по жетону — меню ведущего. Esc — отмена.'));
      }

      /* ---------- Рисование на карте во время игры ---------- */
      function togglePaint() {
        if (ui.mode === 'paint') return setMode('move');
        setMode('paint', { paintTile: ui.paintTile || 'wall' });
      }
      function renderPaintPanel() {
        if (ui.mode !== 'paint') {
          paintPanel.classList.add('hidden');
          return;
        }
        paintPanel.classList.remove('hidden');
        U.clear(paintPanel);
        paintPanel.appendChild(el('div', { class: 'row', style: { marginBottom: '6px' } }, el('b', { style: { color: 'var(--accent3)' } }, '🖌 Кисть ведущего'), el('div', { class: 'grow' }), el('button', { class: 'small', onclick: () => setMode('move') }, '✕')));
        const grid = el('div', { class: 'palette', style: { gridTemplateColumns: 'repeat(5, 1fr)' } });
        for (const id in D.TILES) {
          const cv = el('canvas', { width: 44, height: 44 });
          D.drawTile(cv.getContext('2d'), id, 0, 0, 44, 3, 3, null);
          grid.appendChild(el('div', { class: 'swatch' + (ui.paintTile === id ? ' sel' : ''), title: D.TILES[id].name, onclick: () => { ui.paintTile = id; renderPaintPanel(); } }, cv));
        }
        paintPanel.appendChild(grid);
        paintPanel.appendChild(el('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, 'Выбрано: ' + D.TILES[ui.paintTile].name + '. Кликайте или ведите мышью по карте. Esc — выход.'));
      }
      function paintAt(cell) {
        const x = Math.floor(cell.x);
        const y = Math.floor(cell.y);
        if (!G.inBounds(B.map, x, y)) return;
        const t = D.tile(ui.paintTile);
        if (!t.walk && G.occupant(B, x, y)) return;
        const i = y * B.map.w + x;
        if (B.map.cells[i] === ui.paintTile) return;
        B.map.cells[i] = ui.paintTile;
        board.invalidate([[x, y]]);
      }

      /* ---------- Режимы ---------- */
      function setMode(mode, extra) {
        ui.mode = mode;
        ui.atkId = null;
        ui.bonusAtk = false;
        ui.spellId = null;
        ui.slot = 0;
        ui.featureId = null;
        ui.actionId = null;
        ui.specialId = null;
        ui.quicken = false;
        ui.targets = [];
        Object.assign(ui, extra || {});
        refresh();
      }

      function startSpell(c, sp, quicken) {
        let slot = sp.level ? E.lowestSlot(c, sp.level) : 0;
        if (sp.level && !slot && E.usesInnate(c, sp, 0)) slot = 'innate';
        if (sp.target === 'self' || (sp.area && sp.area.shape === 'aura' && sp.kind !== 'save')) {
          return run(() => E.castSpell(c, sp.id, slot, {}, { quicken }));
        }
        setMode('spell', { spellId: sp.id, slot, quicken });
      }

      function startFeature(c, f) {
        if (f.target === 'self') return run(() => E.useFeature(c, f.id));
        setMode('feature', { featureId: f.id });
      }

      function potionClick(c) {
        const t = B.turn;
        const cost = t.actions > 0 ? 'action' : 'bonus';
        const allies = B.combatants.filter((o) => o !== c && !o.dead && !E.hostile(c, o) && G.distFt(c, o) <= 5 && o.hp < o.maxHp);
        if (!allies.length) return run(() => E.potion(c, c, cost));
        UI.ask('Кому дать зелье лечения?', [{ label: 'Выпить самому', value: c.uid }].concat(allies.map((o) => ({ label: o.name + ' (' + o.hp + '/' + o.maxHp + ')', value: o.uid }))), 'Зелье лечения').then((uid) => {
          if (uid) run(() => E.potion(c, E.get(uid), cost));
        });
      }

      function currentSpell() {
        return ui.mode === 'spell' && ui.spellId ? D.spell(ui.spellId) : null;
      }
      function spellRays(c, sp) {
        if (sp.kind === 'auto') return (sp.darts || 1) + Math.max(0, ui.slot - sp.level);
        if (sp.kind === 'attack') {
          if (sp.scale === 'beams') return E.spellScale(c, sp);
          if (sp.rays) return sp.rays + Math.max(0, ui.slot - sp.level);
          return 1;
        }
        if (sp.target === 'creatures') return (sp.count || 1) + (sp.upcast && sp.upcast.targets ? Math.max(0, ui.slot - sp.level) : 0);
        return 1;
      }

      function currentArea() {
        const c = cur();
        if (!c || !ui.hover) return null;
        let area = null;
        let color = '#ff8a3d';
        if (ui.mode === 'spell') {
          const sp = currentSpell();
          if (sp && sp.area) {
            area = sp.area;
            if (sp.damage) color = R.DAMAGE_COLORS[sp.damage[0].type];
            else color = '#b9a0ff';
          }
          if (sp && sp.kind === 'teleport') {
            const x = Math.floor(ui.hover.x);
            const y = Math.floor(ui.hover.y);
            const ok = G.distToCellFt(c, x, y) <= sp.range && G.canStand(B, c, x, y, {}) && G.canEndAt(B, c, x, y) && G.hasLOSToCell(B.map, c, x, y);
            return { cells: [[x, y]], color: ok ? '#9be7ff' : '#ff5050' };
          }
        } else if (ui.mode === 'special') {
          const s = c.specials.find((x) => x.id === ui.specialId);
          if (s) {
            area = s.area;
            color = R.DAMAGE_COLORS[(s.dmg[0] || {}).type] || color;
          }
        } else if (ui.mode === 'feature') {
          const f = E.featureActions(c).find((x) => x.id === ui.featureId);
          if (f && f.area) {
            area = Object.assign({ origin: 'self' }, f.area);
            color = f.color || (c.ancestry ? R.DAMAGE_COLORS[c.ancestry.type] : color);
          }
          if (f && f.target === 'point') {
            const x = Math.floor(ui.hover.x);
            const y = Math.floor(ui.hover.y);
            const ok = G.distToCellFt(c, x, y) <= (f.range || 30) && G.canStand(B, c, x, y, { fly: true }) && G.canEndAt(B, c, x, y);
            return { cells: [[x, y]], color: ok ? '#9be7ff' : '#ff5050' };
          }
        }
        if (!area) return null;
        return { cells: G.areaCells(B.map, area, c, ui.hover), color };
      }

      function currentRange() {
        const sp = currentSpell();
        if (sp && sp.range > 5) return sp.range;
        if (ui.mode === 'attack') {
          const a = getAtk();
          if (a && a.kind !== 'melee' && a.range) return a.range[0];
        }
        return 0;
      }

      function getAtk() {
        const c = cur();
        if (!c || !ui.atkId) return null;
        let a = c.attacks.find((x) => x.id === ui.atkId) || c.specials.find((x) => x.id === ui.atkId);
        if (!a && ui.bonusAtk && B.turn.bonusAttack && B.turn.bonusAttack.spiritual) a = B.turn.bonusAttack.spiritual;
        return a;
      }

      function validTargets() {
        const c = cur();
        if (!c) return null;
        const all = B.combatants.filter((o) => o.x >= 0 && o.uid !== c.uid);
        if (ui.mode === 'attack') {
          const a = getAtk();
          if (!a) return null;
          if (a.type === 'gaze') return all.filter((o) => !o.dead && G.distFt(c, o) <= a.range && G.hasLOS(B.map, c, o));
          return all.filter((o) => !o.dead && E.attackInfo(c, a, o).ok);
        }
        if (ui.mode === 'spell') {
          const sp = currentSpell();
          if (!sp || !['creature', 'creatures'].includes(sp.target)) return null;
          const range = Math.max(5, sp.range);
          const friendly = ['heal', 'cleanse', 'revive'].includes(sp.kind) || (sp.kind === 'buff' && !sp.hostile);
          const pool = friendly ? B.combatants.filter((o) => o.x >= 0) : all;
          return pool.filter((o) => {
            if (sp.kind === 'revive' ? !o.dead : o.dead) return false;
            if (friendly && E.hostile(c, o)) return false;
            if (G.distFt(c, o) > range) return false;
            if (sp.range > 5 && o !== c && !G.hasLOS(B.map, c, o)) return false;
            return true;
          });
        }
        if (ui.mode === 'feature') {
          const f = E.featureActions(c).find((x) => x.id === ui.featureId);
          if (!f) return null;
          if (f.target === 'ally') return B.combatants.filter((o) => o.x >= 0 && !o.dead && !E.hostile(c, o) && G.distFt(c, o) <= (f.range || 5));
          if (f.target === 'allyOther') return all.filter((o) => !o.dead && !E.hostile(c, o) && G.distFt(c, o) <= (f.range || 60));
          if (f.target === 'enemy') return all.filter((o) => !o.dead && E.hostile(c, o) && G.distFt(c, o) <= (f.range || 5) && (f.filter !== 'quivering' || o.quivering === c.uid));
          return null;
        }
        if (ui.mode === 'action') {
          const id = ui.actionId;
          if (['help', 'shove', 'push', 'grapple'].includes(id)) return all.filter((o) => !o.dead && o.hp > 0 && G.distFt(c, o) <= 5 && (id === 'help' ? E.hostile(c, o) : true));
          if (id === 'stabilize') return all.filter((o) => !o.dead && o.hp <= 0 && o.kind === 'pc' && !o.stable && G.distFt(c, o) <= 5);
          if (id === 'wake') return all.filter((o) => o.conditions.some((x) => x.tag === 'sleep') && G.distFt(c, o) <= 5);
        }
        return null;
      }

      function renderModeBanner() {
        U.clear(modeBanner);
        const c = cur();
        let text = '';
        const extra = [];
        if (B.phase === 'setup' && ui.placing) {
          const o = E.get(ui.placing);
          text = o ? '📍 Поставьте жетон «' + o.name + '» — клик по клетке' : '';
        } else if (B.phase === 'combat' && c && !isAI(c) && !ui.busy) {
          if (ui.mode === 'attack') {
            const a = getAtk();
            text = '🎯 ' + (a ? a.name : '') + ': выберите цель';
          } else if (ui.mode === 'spell') {
            const sp = currentSpell();
            if (sp) {
              const n = spellRays(c, sp);
              if (sp.area) text = '✨ ' + sp.name + ': ' + (sp.area.origin === 'self' ? 'наведите направление и кликните' : 'выберите точку (дистанция ' + sp.range + ' фт.)');
              else if (sp.kind === 'teleport') text = '✨ ' + sp.name + ': выберите клетку в пределах ' + sp.range + ' фт.';
              else text = '✨ ' + sp.name + ': ' + (n > 1 ? 'выберите цели (' + ui.targets.length + '/' + n + ')' : 'выберите цель');
              if (sp.level > 0) {
                const avail = E.availableSlots(c, sp.level);
                if (avail.length > 1) extra.push(el('span', {}, 'Ячейка: '), U.select(avail.map((l) => ({ value: l, label: l + ' ур.' })), ui.slot, (v) => { ui.slot = Number(v); refresh(); }));
              }
              if (ui.quicken) extra.push(el('span', { class: 'chip spell' }, 'ускоренное'));
              if (n > 1 && ui.targets.length && !sp.area) extra.push(el('button', { class: 'small gold', onclick: () => castWithTargets() }, 'Применить'));
            }
          } else if (ui.mode === 'special') text = '🔥 Выберите направление';
          else if (ui.mode === 'feature') text = '✴ Выберите цель';
          else if (ui.mode === 'action') {
            const names = { help: 'Помощь: выберите врага рядом', shove: 'Сбить с ног: выберите цель рядом', push: 'Оттолкнуть: выберите цель рядом', grapple: 'Захват: выберите цель рядом', stabilize: 'Стабилизировать: выберите умирающего союзника рядом', wake: 'Разбудить: выберите спящего рядом' };
            text = names[ui.actionId] || '';
          }
        }
        if (!text) {
          modeBanner.classList.add('hidden');
          return;
        }
        modeBanner.classList.remove('hidden');
        modeBanner.append(el('span', {}, text), ...extra, el('button', { class: 'small', onclick: () => { if (B.phase === 'setup') { ui.placing = null; refresh(); } else setMode('move'); } }, 'Отмена (Esc)'));
      }

      /* ---------- Мышь ---------- */
      function tokenAt(cell) {
        const x = Math.floor(cell.x);
        const y = Math.floor(cell.y);
        const alive = B.combatants.filter((o) => o.x >= 0 && x >= o.x && y >= o.y && x < o.x + o.cells && y < o.y + o.cells);
        return alive.find((o) => !o.dead) || alive[0] || null;
      }

      function onBoardHover(cell, sx, sy) {
        ui.hover = cell;
        const o = tokenAt(cell);
        if (o) {
          const c = cur();
          const showHp = o.side !== 'enemies' || settings.enemyHp;
          const lines = ['<b>' + U.escapeHtml(o.name) + '</b> <span class="muted">' + (o.kind === 'pc' ? o.clsName + ' ' + o.level : 'ПО ' + o.cr) + '</span>'];
          lines.push((showHp ? '❤️ ' + o.hp + '/' + o.maxHp + (o.tempHp ? ' (+' + o.tempHp + ')' : '') + ' · ' : '') + '🛡️ КД ' + E.acOf(o) + ' · ' + R.SIDES[o.side].name);
          if (o.dead) lines.push('<span class="bad">мёртв</span>');
          const conds = o.conditions.map((x) => R.CONDITIONS[x.id].icon + ' ' + R.CONDITIONS[x.id].name).concat(o.effects.filter((e) => R.EFFECTS[e.id] && !e.silent).map((e) => R.EFFECTS[e.id].icon + ' ' + R.EFFECTS[e.id].name));
          if (conds.length) lines.push(conds.join(', '));
          if (c && B.phase === 'combat' && c.uid !== o.uid) {
            lines.push('Расстояние: ' + G.distFt(c, o) + ' фт.');
            const a = ui.mode === 'attack' ? getAtk() : ui.mode === 'move' && E.hostile(c, o) ? quickAttack(c, o, true) : null;
            if (a && a.kind) {
              const info = E.attackInfo(c, a, o);
              if (!info.ok) lines.push('<span class="bad">⛔ ' + info.reason + '</span>');
              else {
                let p = (21 - (E.acOf(o) - a.toHit)) / 20;
                p = U.clamp(p, 0.05, 0.95);
                if (info.mode > 0) p = 1 - (1 - p) * (1 - p);
                if (info.mode < 0) p = p * p;
                lines.push('🎯 ' + a.name + ': шанс ~' + Math.round(p * 100) + '%' + (info.mode > 0 ? ' <span class="good">(преим.: ' + info.adv.join(', ') + ')</span>' : info.mode < 0 ? ' <span class="bad">(помеха: ' + info.dis.join(', ') + ')</span>' : ''));
              }
            }
          }
          tooltip.innerHTML = lines.join('<br>');
          tooltip.classList.remove('hidden');
          const r = wrap.getBoundingClientRect();
          tooltip.style.left = Math.min(sx + 16, r.width - 290) + 'px';
          tooltip.style.top = Math.min(sy + 16, r.height - 120) + 'px';
        } else tooltip.classList.add('hidden');
        updateOverlays();
      }

      function quickAttack(c, o, dry) {
        const opts = E.attackOptions(c);
        let best = null;
        let bestScore = -1;
        for (const opt of opts.main) {
          if (!opt.enabled || opt.special) continue;
          const info = E.attackInfo(c, opt.atk, o);
          if (!info.ok) continue;
          const avg = opt.atk.dmg.reduce((s, d) => s + D.Dice.average(d.dice), 0) + info.mode * 2;
          if (avg > bestScore) {
            bestScore = avg;
            best = opt.atk;
          }
        }
        return best;
      }

      async function onBoardClick(cell, e) {
        if (ui.mode === 'paint') return;
        if (ui.busy) return;
        const x = Math.floor(cell.x);
        const y = Math.floor(cell.y);
        if (B.phase === 'setup') {
          if (ui.placing) {
            const o = E.get(ui.placing);
            if (o && G.canStand(B, o, x, y, { fly: !!o.speed.fly }) && G.canEndAt(B, o, x, y)) {
              o.x = x;
              o.y = y;
              const next = B.combatants.find((q) => q.x < 0);
              ui.placing = next ? next.uid : null;
            } else UI.toast('Сюда нельзя поставить', 'bad');
            refresh();
            return;
          }
          const o = tokenAt(cell);
          if (o) {
            ui.placing = o.uid;
            refresh();
          }
          return;
        }
        if (ui.mode === 'teleportDM') {
          const o = E.get(ui.dmUid);
          if (o && G.canStand(B, o, x, y, { fly: true }) && G.canEndAt(B, o, x, y)) {
            o.x = x;
            o.y = y;
            E.log('Ведущий перемещает ' + E.name(o) + '.', 'muted');
          }
          setMode('move');
          return;
        }
        if (B.phase !== 'combat') return;
        const c = cur();
        if (!c || isAI(c) || E.incap(c)) return;
        const o = tokenAt(cell);
        switch (ui.mode) {
          case 'move': {
            if (o && !o.dead && o.uid !== c.uid && E.hostile(c, o)) {
              const a = quickAttack(c, o);
              if (!a) {
                const anyAtk = E.attackOptions(c).main.find((x) => !x.special);
                UI.toast(anyAtk ? 'Цель недоступна: ' + E.attackInfo(c, anyAtk.atk, o).reason : 'Нет доступных атак (действие использовано)', 'bad');
                return;
              }
              await run(() => E.doAttack(c, a.id, o));
              return;
            }
            const t = G.tile(B.map, x, y);
            if (t.door && G.distToCellFt(c, x, y) <= 5 && !G.occupant(B, x, y)) {
              const i = y * B.map.w + x;
              B.map.cells[i] = t.door === 'open' ? 'doorc' : 'door';
              board.invalidate([[x, y]]);
              E.log(E.name(c) + (t.door === 'open' ? ' закрывает' : ' открывает') + ' дверь.', 'muted');
              refresh();
              return;
            }
            if (ui.reachMap) {
              const rec = ui.reachMap.get(G.key(x, y));
              if (rec && G.canEndAt(B, c, x, y) && (x !== c.x || y !== c.y)) {
                const path = G.pathTo(ui.reachMap, x, y);
                await run(() => E.moveAlong(c, path));
              }
            }
            return;
          }
          case 'attack': {
            const a = getAtk();
            if (!a || !o) return;
            if (a.type === 'gaze') {
              await run(() => E.doAttack(c, a.id, o));
              setMode('move');
              return;
            }
            const info = E.attackInfo(c, a, o);
            if (!info.ok) return UI.toast(info.reason, 'bad');
            const bonus = ui.bonusAtk;
            await run(() => E.doAttack(c, a.id, o, { bonus }));
            const opts = E.attackOptions(c);
            const still = (bonus ? opts.bonus : opts.main).find((q) => q.atk.id === a.id && q.enabled);
            const t = B.turn;
            if (still && t && (bonus ? t.bonusAttack && t.bonusAttack.count > 0 : t.attacksLeft > 0)) setMode('attack', { atkId: a.id, bonusAtk: bonus });
            else setMode('move');
            return;
          }
          case 'spell': {
            const sp = currentSpell();
            if (!sp) return;
            if (sp.area && !(await areaHasTargets())) return;
            if (sp.area) {
              await run(() => E.castSpell(c, sp.id, ui.slot, { point: cell }, { quicken: ui.quicken }));
              setMode('move');
              return;
            }
            if (sp.kind === 'teleport') {
              await run(() => E.castSpell(c, sp.id, ui.slot, { point: cell }, { quicken: ui.quicken }));
              setMode('move');
              return;
            }
            if (!o) return;
            const vt = validTargets() || [];
            if (!vt.includes(o)) {
              let why = 'недопустимая цель';
              if (G.distFt(c, o) > Math.max(5, sp.range)) why = 'слишком далеко (' + G.distFt(c, o) + ' фт., дистанция ' + Math.max(5, sp.range) + ' фт.)';
              else if (sp.range > 5 && !G.hasLOS(B.map, c, o)) why = 'нет линии обзора';
              else if (['heal', 'cleanse', 'revive'].includes(sp.kind) || (sp.kind === 'buff' && !sp.hostile)) why = 'это заклинание — для союзников';
              return UI.toast(o.name + ': ' + why, 'bad');
            }
            const n = spellRays(c, sp);
            const multiSame = sp.kind === 'auto' || sp.kind === 'attack';
            if (!multiSame && ui.targets.includes(o.uid)) ui.targets = ui.targets.filter((u) => u !== o.uid);
            else ui.targets.push(o.uid);
            if (ui.targets.length >= n) await castWithTargets();
            else refresh();
            return;
          }
          case 'special': {
            if (!(await areaHasTargets())) return;
            await run(() => E.doAreaSpecial(c, ui.specialId, cell));
            setMode('move');
            return;
          }
          case 'feature': {
            const f = E.featureActions(c).find((q) => q.id === ui.featureId);
            if (!f) return setMode('move');
            if (f.target === 'area') {
              if (!(await areaHasTargets())) return;
              await run(() => E.useFeature(c, f.id, { aim: cell }));
            } else if (f.target === 'point') await run(() => E.useFeature(c, f.id, { point: cell }));
            else if (o) await run(() => E.useFeature(c, f.id, { target: o }));
            setMode('move');
            return;
          }
          case 'action': {
            if (!o) return;
            const id = ui.actionId;
            if (id === 'help') await run(() => E.help(c, o));
            else if (id === 'shove') await run(() => E.shove(c, o, 'prone'));
            else if (id === 'push') await run(() => E.shove(c, o, 'push'));
            else if (id === 'grapple') await run(() => E.grapple(c, o));
            else if (id === 'stabilize') await run(() => E.stabilize(c, o));
            else if (id === 'wake') await run(() => E.wake(c, o));
            setMode('move');
            return;
          }
          default:
            return;
        }
      }

      async function areaHasTargets() {
        const c = cur();
        const area = currentArea();
        if (!c || !area) return true;
        const hit = G.creaturesInCells(B, area.cells).filter((o) => o.uid !== c.uid && o.hp > 0);
        if (hit.length) return true;
        return UI.confirm('В области нет ни одного существа. Всё равно использовать?', 'Использовать');
      }

      async function castWithTargets() {
        const c = cur();
        const sp = currentSpell();
        if (!c || !sp || !ui.targets.length) return;
        const targets = ui.targets.slice();
        const slot = ui.slot;
        const quicken = ui.quicken;
        await run(() => E.castSpell(c, sp.id, slot, { targets }, { quicken }));
        setMode('move');
      }

      function onBoardRight(cell, e) {
        const o = tokenAt(cell);
        if (!o) {
          if (B.phase === 'setup') {
            ui.placing = null;
            refresh();
          } else if (ui.mode !== 'move') setMode('move');
          return;
        }
        dmMenu(o, e.clientX, e.clientY);
      }

      /* ---------- Меню ведущего ---------- */
      function dmMenu(o, x, y) {
        const items = [{ header: o.name + ' · ❤️ ' + o.hp + '/' + o.maxHp }];
        items.push({ icon: '📄', label: o.kind === 'pc' ? 'Лист персонажа' : 'Статблок', onClick: () => showInfo(o) });
        items.push({ icon: '❤️', label: 'Установить хиты…', onClick: async () => { const v = await UI.prompt('Хиты (' + o.name + ')', o.hp, { type: 'number', min: 0, max: o.maxHp * 3 }); if (v != null && !isNaN(v)) { await E.dmSetHp(o, v); refresh(); } } });
        items.push({ icon: '🗡️', label: 'Нанести урон…', onClick: () => dmDamage(o) });
        items.push({ icon: '💚', label: 'Вылечить…', onClick: async () => { const v = await UI.prompt('Сколько хитов восстановить?', 5, { type: 'number', min: 0 }); if (v) { E.heal(o, v); refresh(); } } });
        items.push({ icon: '🧷', label: 'Состояния…', onClick: () => condDialog(o) });
        items.push({ icon: '🛡️', label: 'Макс. хиты и КД…', onClick: () => editStatsDialog(o) });
        items.push({ sep: true });
        items.push({ icon: o.controller === 'ai' ? '🎮' : '🤖', label: o.controller === 'ai' ? 'Управление: передать игроку' : 'Управление: передать ИИ', onClick: () => { o.controller = o.controller === 'ai' ? 'human' : 'ai'; refresh(); if (cur() === o && o.controller === 'ai' && !ui.paused) turnLoop(); } });
        for (const s of Object.keys(R.SIDES)) if (s !== o.side) items.push({ icon: '🎨', label: 'Сторона: ' + R.SIDES[s].name, onClick: () => { o.side = s; if (o.kind !== 'pc') o.color = R.SIDES[s].color; refresh(); } });
        items.push({ sep: true });
        items.push({ icon: '📍', label: 'Переместить (телепорт)', onClick: () => { if (B.phase === 'setup') { ui.placing = o.uid; refresh(); } else setMode('teleportDM', { dmUid: o.uid }); } });
        if (B.phase === 'combat' && !o.dead) items.push({ icon: '☠️', label: 'Убить', onClick: async () => { await E.dmKill(o); refresh(); } });
        if (o.dead && B.phase === 'combat') items.push({ icon: '✨', label: 'Оживить (1 хит)', onClick: async () => { await E.dmSetHp(o, 1); refresh(); } });
        items.push({ icon: '🗑', label: 'Удалить с поля', onClick: async () => { if (await UI.confirm('Удалить «' + o.name + '» из боя?')) { if (B.phase === 'combat') E.dmRemove(o); else B.combatants = B.combatants.filter((q) => q !== o); refresh(); } } });
        UI.ctxMenu(x, y, items);
      }

      async function dmDamage(o) {
        const amt = el('input', { type: 'number', value: 5, min: 0 });
        const type = U.select(Object.keys(R.DAMAGE_TYPES).map((k) => ({ value: k, label: R.DAMAGE_SHORT[k] })), 'slashing');
        const r = await UI.modal({
          title: 'Урон: ' + o.name,
          body: el('div', { class: 'form-grid' }, el('label', {}, 'Количество'), amt, el('label', {}, 'Вид урона'), type),
          buttons: [{ label: 'Отмена', value: null }, { label: 'Нанести', cls: 'primary', value: true }],
        }).promise;
        if (!r) return;
        await E.applyDamage(o, [{ amount: Math.max(0, Number(amt.value) || 0), type: type.value }], null, { fromAttack: false });
        refresh();
      }

      async function condDialog(o) {
        const grid = el('div', { class: 'check-grid', style: { minWidth: '420px' } });
        for (const id in R.CONDITIONS) {
          const d = R.CONDITIONS[id];
          grid.appendChild(el('label', { title: d.desc }, el('input', { type: 'checkbox', checked: E.hasCond(o, id), onchange: () => { E.dmToggleCond(o, id); refresh(); } }), d.icon + ' ' + d.name));
        }
        await UI.modal({ title: 'Состояния: ' + o.name, body: grid, buttons: [{ label: 'Готово', value: true, cls: 'primary' }] }).promise;
      }

      function showInfo(o) {
        let body;
        if (o.kind === 'pc') {
          const ch = Store.characters().find((x) => x.id === o.refId);
          body = ch ? D.renderSheet(ch) : compactInfo(o);
        } else {
          const m = D.monster(o.refId);
          body = m ? D.renderStatblock(m) : compactInfo(o);
        }
        UI.modal({ title: o.name, body, buttons: [{ label: 'Закрыть', value: true }] });
      }

      /* ---------- Выполнение действий ---------- */
      async function run(fn) {
        if (ui.busy) return;
        ui.busy = true;
        refresh();
        try {
          const r = await fn();
          if (r && r.ok === false && r.reason) UI.toast(r.reason, 'bad');
        } catch (err) {
          console.error(err);
          UI.toast('Ошибка: ' + err.message, 'bad');
        }
        ui.busy = false;
        if (destroyed) return;
        if (ui.mode === 'move') refresh();
        else refresh();
      }

      async function endTurnClick() {
        if (ui.busy || B.phase !== 'combat') return;
        const c = cur();
        if (!c || isAI(c)) return;
        setMode('move');
        ui.busy = true;
        refresh();
        try {
          await E.endTurn();
        } catch (err) {
          console.error(err);
        }
        ui.busy = false;
        turnLoop();
      }

      let loopRunning = false;
      async function turnLoop() {
        if (loopRunning) return;
        loopRunning = true;
        try {
          while (!destroyed && B.phase === 'combat') {
            const c = cur();
            if (!c) break;
            refresh();
            if (isAI(c)) {
              if (ui.paused) break;
              await runAI(true);
              continue;
            }
            if (E.incap(c)) {
              showBanner(c, c.hp <= 0 ? 'без сознания — ход пропускается' : 'недееспособен — ход пропускается');
              ui.busy = true;
              refresh();
              await U.sleep(1300);
              ui.busy = false;
              if (destroyed || cur() !== c) continue;
              await E.endTurn();
              continue;
            }
            showBanner(c);
            board.centerOn(c.x, c.y);
            setMode('move');
            break;
          }
        } finally {
          loopRunning = false;
        }
        refresh();
      }

      async function runAI(fromLoop) {
        const c = cur();
        if (!c || ui.busy) return;
        ui.busy = true;
        aiBadge.classList.remove('hidden');
        aiBadge.textContent = '🤖 ' + c.name + ' делает ход…';
        refresh();
        const delay = settings.aiSpeed === 'fast' ? 120 : settings.aiSpeed === 'slow' ? 900 : 450;
        try {
          await D.AI.takeTurn(E, c, { delay });
        } catch (err) {
          console.error(err);
        }
        ui.busy = false;
        aiBadge.classList.add('hidden');
        if (!fromLoop) turnLoop();
      }

      function showBanner(c, sub) {
        const b = el('div', { class: 'turn-banner' },
          el('div', { class: 't' }, 'Ход: ' + c.name),
          el('div', { class: 's' }, sub || (c.player ? 'Игрок: ' + c.player : c.kind === 'pc' ? c.clsName + ' ' + c.level + ' ур.' : 'Управляет ведущий')));
        wrap.appendChild(b);
        setTimeout(() => b.remove(), 1700);
      }

      /* ---------- Подготовка ---------- */
      function uniqueName(base) {
        const same = B.combatants.filter((c) => c.name === base || c.name.startsWith(base + ' '));
        if (!same.length) return base;
        if (same.length === 1 && same[0].name === base) same[0].name = base + ' 1';
        let n = 2;
        while (B.combatants.some((c) => c.name === base + ' ' + n)) n++;
        return base + ' ' + n;
      }

      function autoPlace(c) {
        const m = B.map;
        // Целевая точка: герои — левая четверть карты, враги — правая
        const tx = c.side === 'enemies' ? m.w * 0.78 : m.w * 0.22;
        const ty = m.h / 2;
        const cand = [];
        for (let y = 0; y < m.h; y++)
          for (let x = 0; x < m.w; x++) {
            const fp = G.footprint(x, y, c.cells);
            if (!fp.every(([fx, fy]) => G.inBounds(m, fx, fy))) continue;
            const tiles = fp.map(([fx, fy]) => G.tile(m, fx, fy));
            if (tiles.some((t) => !t.walk || t.hazard)) continue;
            const pen = tiles.some((t) => t.difficult) ? 3 : 0;
            const dx = x + c.cells / 2 - tx;
            const dy = (y + c.cells / 2 - ty) * 0.8;
            cand.push({ x, y, d: Math.sqrt(dx * dx + dy * dy) + pen });
          }
        cand.sort((a, b) => a.d - b.d);
        for (const p of cand) {
          if (G.canEndAt(B, c, p.x, p.y)) {
            c.x = p.x;
            c.y = p.y;
            return true;
          }
        }
        return false;
      }
      function autoPlaceAll() {
        for (const c of B.combatants) if (c.x < 0) autoPlace(c);
      }

      function addCombatant(c) {
        c.name = uniqueName(c.name);
        B.combatants.push(c);
        autoPlace(c);
        if (B.phase === 'combat') {
          E.addMidCombat(c);
          E.log(E.name(c) + ' вступает в бой (инициатива ' + c.initiative + ').', 'init');
        }
      }

      async function pickHeroes() {
        const chars = Store.characters();
        const chosen = new Set();
        const list = el('div', { class: 'list', style: { minWidth: '460px' } });
        const draw = () => {
          U.clear(list);
          const cs = Store.characters();
          if (!cs.length) list.appendChild(el('div', { class: 'empty' }, 'Нет созданных персонажей.'));
          for (const ch of cs) {
            const s = D.Char.compute(ch);
            const inBattle = B.combatants.some((c) => c.refId === ch.id);
            list.appendChild(el('label', { class: 'list-item' },
              el('input', { type: 'checkbox', checked: chosen.has(ch.id), onchange: (e) => (e.target.checked ? chosen.add(ch.id) : chosen.delete(ch.id)) }),
              el('span', { class: 'ico' }, UI.icon(s.cls.icon)),
              el('div', { class: 'grow' }, el('div', {}, ch.name + (inBattle ? ' (уже в бою)' : '')), el('div', { class: 'muted', style: { fontSize: '12px' } }, (s.sub ? s.sub.name : s.race.name) + ' · ' + s.cls.name + ' ' + s.level + (s.sc ? ' (' + s.sc.name + ')' : '') + ' · ❤️' + s.hp + ' · 🛡️' + s.ac + (ch.player ? ' · ' + ch.player : '')))));
          }
        };
        draw();
        const r = await UI.modal({
          title: 'Добавить героев',
          body: el('div', {}, list),
          buttons: [
            { label: '🎲 Случайная партия', onClick: () => { const p = D.randomParty(); p.list.forEach((ch) => { Store.saveCharacter(ch); chosen.add(ch.id); }); draw(); UI.toast('Создана случайная партия ' + p.level + ' уровня'); } },
            { label: 'Отмена', value: null },
            { label: 'Добавить выбранных', cls: 'primary', value: true },
          ],
        }).promise;
        if (!r) return;
        for (const ch of Store.characters()) {
          if (!chosen.has(ch.id)) continue;
          const c = D.Char.toCombatant(ch, 'heroes');
          c.controller = 'human';
          addCombatant(c);
          const comp = D.Char.makeCompanion(ch, c);
          if (comp) addCombatant(comp);
        }
        refresh();
        void chars;
      }

      async function pickMonsters() {
        const qty = el('input', { type: 'number', value: 1, min: 1, max: 20 });
        const side = U.select(Object.keys(R.SIDES).map((k) => ({ value: k, label: R.SIDES[k].name })), 'enemies');
        const ctrl = U.select([{ value: 'ai', label: '🤖 ИИ' }, { value: 'human', label: '🎮 Ведущий/игрок' }], 'ai');
        let added = 0;
        const counter = el('span', { class: 'muted' });
        const br = D.monsterBrowser({
          onPick: (m) => add(m),
          actions: (m) => el('div', { class: 'row wrap', style: { marginBottom: '12px', background: 'var(--panel2)', padding: '8px', borderRadius: '8px' } },
            el('b', { class: 'row' }, UI.icon(m.icon), m.name), el('span', { class: 'muted' }, 'Кол-во'), qty, side, ctrl,
            el('button', { class: 'primary', onclick: () => add(m) }, '+ Добавить на поле'), counter),
        });
        function add(m) {
          const n = U.clamp(Number(qty.value) || 1, 1, 20);
          for (let i = 0; i < n; i++) {
            const c = D.Combat.fromMonster(m, side.value, { rollHp: settings.rollMonsterHp, controller: ctrl.value });
            addCombatant(c);
          }
          added += n;
          counter.textContent = 'Добавлено: ' + added;
          refresh();
        }
        const body = el('div', { style: { display: 'flex', height: '70vh', width: '1000px', maxWidth: '90vw' } }, br.el);
        await UI.modal({ title: 'Бестиарий — добавить монстров', body, buttons: [{ label: 'Готово', value: true, cls: 'primary' }] }).promise;
        refresh();
      }

      async function addDialog() {
        if (B.phase === 'ended') return;
        const v = await UI.ask('Кого добавить в ' + (B.phase === 'combat' ? 'идущий бой' : 'бой') + '?', [
          { label: '👹 Монстров', value: 'm' },
          { label: '🧙 Героев', value: 'h' },
          { label: 'Отмена', value: null },
        ], 'Новый участник');
        if (v === 'm') pickMonsters();
        if (v === 'h') pickHeroes();
      }

      /* ---------- Инициатива ---------- */
      function startInitiative() {
        B.phase = 'initiative';
        B.combatants.forEach((c) => {
          c.initiative = null;
          c.initRoll = null;
        });
        ui.placing = null;
        refresh();
        initiativeDialog();
      }

      function initiativeDialog() {
        const tbody = el('tbody');
        const status = el('div', { style: { marginBottom: '10px', fontSize: '15px' } });
        const goBtn = el('button', { class: 'primary', disabled: true }, '⚔️ В бой!');
        const order = B.combatants.slice().sort((a, b) => (a.controller === b.controller ? 0 : a.controller === 'human' ? -1 : 1));
        let rolling = false;
        const rollOne = async (c) => {
          if (rolling || c.initiative != null) return;
          rolling = true;
          const r = E.rollInitiative(c);
          await dicebox.show({ kind: 'init', actor: c, label: 'Инициатива', d20: r.roll, bonus: c.initBonus, total: r.total }, settings.dice === 'off' ? 'off' : 'fast');
          rolling = false;
          draw();
        };
        const draw = () => {
          U.clear(tbody);
          const next = order.find((c) => c.initiative == null && c.controller === 'human') || order.find((c) => c.initiative == null);
          for (const c of order) {
            tbody.appendChild(el('tr', { class: next === c ? 'next' : '' },
              el('td', {}, UI.face(c)),
              el('td', {}, el('div', {}, c.name), el('div', { class: 'muted', style: { fontSize: '12px' } }, (c.player ? 'игрок ' + c.player + ' · ' : '') + (c.controller === 'ai' ? '🤖 ИИ' : '🎮') + ' · бонус ' + U.fmtMod(c.initBonus) + (c.initAdv ? ' (преим.)' : ''))),
              el('td', {}, el('span', { class: 'res' }, c.initiative == null ? '—' : c.initiative), c.initRoll ? el('span', { class: 'muted', style: { fontSize: '11px' } }, ' (к20: ' + c.initRoll.rolls.join('/') + ')') : null),
              el('td', {}, c.initiative == null
                ? el('div', { class: 'row' },
                  el('button', { class: next === c ? 'gold' : '', onclick: () => rollOne(c) }, '🎲 Бросить'),
                  el('button', { class: 'small', title: 'Ввести результат настоящего броска', onclick: async () => { const v = await UI.prompt('Результат инициативы ' + c.name + ' (к20 + ' + c.initBonus + ')', '', { type: 'number' }); if (v != null && !isNaN(v)) { E.rollInitiative(c, v); draw(); } } }, '✎'))
                : el('button', { class: 'small ghost', onclick: () => { c.initiative = null; c.initRoll = null; draw(); } }, '↺'))));
          }
          const left = order.filter((c) => c.initiative == null);
          if (!left.length) status.innerHTML = '<span class="good">Все бросили! Порядок определён.</span>';
          else if (next) status.innerHTML = 'Бросает: <b style="color:var(--accent3)">' + U.escapeHtml(next.name) + '</b>' + (next.player ? ' (игрок ' + U.escapeHtml(next.player) + ')' : '') + ' — передайте мышь!';
          goBtn.disabled = left.length > 0;
        };
        draw();
        const body = el('div', { style: { minWidth: '560px' } }, status, el('table', { class: 'init-table' }, tbody));
        const m = UI.modal({
          title: '🎲 Броски инициативы',
          body,
          closable: false,
          buttons: [
            { label: '↩ Назад к расстановке', onClick: (close) => { close(null); B.phase = 'setup'; refresh(); } },
            { label: '🤖 Бросить за ИИ', onClick: async () => { for (const c of order.filter((x) => x.controller === 'ai' && x.initiative == null)) { E.rollInitiative(c); } draw(); } },
            { label: '🎲 Бросить за всех', onClick: () => { for (const c of order.filter((x) => x.initiative == null)) E.rollInitiative(c); draw(); } },
          ],
        });
        m.box.querySelector('.mf').appendChild(goBtn);
        goBtn.onclick = async () => {
          m.close(true);
          await E.beginCombat();
          refresh();
          turnLoop();
        };
      }

      /* ---------- Конец боя ---------- */
      function showEnd(result) {
        if (destroyed) return;
        refresh();
        const heroes = B.combatants.filter((c) => c.kind === 'pc');
        UI.modal({
          title: result === 'victory' ? '🏆 Победа!' : '💀 Поражение',
          body: el('div', { style: { fontSize: '15px', minWidth: '380px', lineHeight: 1.6 } },
            el('div', {}, result === 'victory' ? 'Враги повержены за ' + B.round + ' ' + U.plural(B.round, 'раунд', 'раунда', 'раундов') + '.' : 'Все герои пали…'),
            el('div', {}, 'Опыт: ' + B.xp + ' XP' + (heroes.length ? ' (по ' + Math.floor(B.xp / heroes.length) + ' на героя)' : '')),
            el('div', { class: 'muted', style: { fontSize: '13px' } }, 'Итоги: ' + B.combatants.filter((c) => c.side !== 'enemies').map((c) => c.name + ' ' + (c.dead ? '☠️' : '❤️' + c.hp + '/' + c.maxHp)).join(', '))),
          buttons: [
            { label: 'Посмотреть поле', value: true },
            { label: '↻ Переиграть', onClick: (close) => { close(); restartSameSetup(); } },
            { label: '⚔️ Новый бой', cls: 'primary', onClick: (close) => { close(); D.App.show('battle', {}); } },
          ],
        });
      }

      function restartSameSetup() {
        const fresh = D.Combat.newBattle(Store.map(B.map.id) || B.map, B.name);
        for (const c of B.combatants) {
          let n = null;
          if (c.companionOf) continue;
          if (c.kind === 'pc') {
            const ch = Store.characters().find((x) => x.id === c.refId);
            if (ch) n = D.Char.toCombatant(ch, c.side);
            const comp = ch && n && D.Char.makeCompanion(ch, n);
            if (comp) {
              comp.controller = c.controller;
              fresh.combatants.push(comp);
            }
          } else {
            const m = D.monster(c.refId);
            if (m) n = D.Combat.fromMonster(m, c.side, { rollHp: settings.rollMonsterHp, controller: c.controller });
          }
          if (!n) continue;
          n.name = c.name;
          n.controller = c.controller;
          if (c.customMaxHp) n.maxHp = n.hp = c.customMaxHp;
          if (c.customAc) n.ac = c.customAc;
          n.customMaxHp = c.customMaxHp;
          n.customAc = c.customAc;
          n.x = c.x;
          n.y = c.y;
          fresh.combatants.push(n);
        }
        // Вернуть начальные позиции нельзя — расставим заново
        fresh.combatants.forEach((c) => (c.x = -1));
        D.App.show('battle', { load: fresh, autoplace: true });
      }

      async function settingsDialog() {
        const sp = U.select([{ value: 'fast', label: 'Быстро' }, { value: 'normal', label: 'Нормально' }, { value: 'slow', label: 'Медленно' }], settings.aiSpeed, (v) => (settings.aiSpeed = v));
        const dc = U.select([{ value: 'normal', label: 'С анимацией' }, { value: 'fast', label: 'Быстрая анимация' }, { value: 'off', label: 'Без анимации' }], settings.dice, (v) => (settings.dice = v));
        const hp = el('input', { type: 'checkbox', checked: settings.enemyHp, onchange: (e) => (settings.enemyHp = e.target.checked) });
        const roll = el('input', { type: 'checkbox', checked: settings.rollMonsterHp, onchange: (e) => (settings.rollMonsterHp = e.target.checked) });
        const auto = el('input', { type: 'checkbox', checked: !ui.paused, onchange: (e) => (settings.autoAI = e.target.checked) });
        const grid = el('input', { type: 'checkbox', checked: board.showGrid, onchange: (e) => (settings.grid = e.target.checked) });
        await UI.modal({
          title: '⚙ Настройки боя',
          body: el('div', { class: 'form-grid', style: { gridTemplateColumns: '220px 1fr' } },
            el('label', {}, 'Скорость ходов ИИ'), sp,
            el('label', {}, 'Кубики'), dc,
            el('label', {}, 'Показывать хиты врагов'), el('div', {}, hp),
            el('label', {}, 'Бросать хиты монстров'), el('div', {}, roll, el('span', { class: 'muted' }, ' (для новых)')),
            el('label', {}, 'Автоход ИИ'), el('div', {}, auto),
            el('label', {}, 'Сетка'), el('div', {}, grid)),
          buttons: [{ label: 'Готово', value: true, cls: 'primary' }],
        }).promise;
        Store.setSettings(settings);
        dicebox.speed = settings.dice;
        board.showEnemyHp = settings.enemyHp;
        board.showGrid = settings.grid;
        const wasPaused = ui.paused;
        ui.paused = !settings.autoAI;
        refresh();
        if (wasPaused && !ui.paused) turnLoop();
      }

      async function leave() {
        if (B.phase === 'combat' && B.round > 0) {
          const v = await UI.ask('Выйти в меню? Можно сохранить бой и продолжить позже.', [
            { label: '💾 Сохранить и выйти', value: 'save' },
            { label: 'Выйти без сохранения', value: 'quit' },
            { label: 'Отмена', value: null },
          ], 'Выход');
          if (!v) return;
          if (v === 'save') Store.saveBattle(B);
        }
        D.App.show('menu');
      }

      /* ---------- Клавиатура ---------- */
      const onKey = (e) => {
        if (document.querySelector('.modal-back')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.key === 'Escape') {
          if (B.phase === 'setup') ui.placing = null;
          setMode('move');
        } else if ((e.key === ' ' || e.key === 'Enter') && B.phase === 'combat') {
          e.preventDefault();
          endTurnClick();
        }
      };
      document.addEventListener('keydown', onKey);

      self.destroy = () => {
        destroyed = true;
        board.destroy();
        document.removeEventListener('keydown', onKey);
      };

      // Отладочный доступ (консоль разработчика F12)
      root.__dndBattle = { B, E, board, ui };

      // Старт
      board.showGrid = settings.grid;
      if (params.revalidate) {
        for (const c of B.combatants) if (c.x >= 0 && (!G.canStand(B, c, c.x, c.y, { fly: !!c.speed.fly }) || c.x + c.cells > B.map.w || c.y + c.cells > B.map.h)) c.x = -1;
      }
      if (params.autoplace || params.revalidate) autoPlaceAll();
      refresh();
      if (B.phase === 'initiative') initiativeDialog();
      else if (B.phase === 'combat') {
        if (!B.turn) E.startTurn().then(() => turnLoop());
        else turnLoop();
      }
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
