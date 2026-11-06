/* Каркас приложения: экраны, модальные окна, хранилище, главное меню, справка */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const el = U.el;

  /* ---------- Хранилище ---------- */
  const Store = {
    characters: () => U.store.get('characters', []),
    saveCharacter(ch) {
      const list = Store.characters();
      const i = list.findIndex((x) => x.id === ch.id);
      if (i >= 0) list[i] = ch;
      else list.push(ch);
      U.store.set('characters', list);
    },
    deleteCharacter(id) {
      U.store.set('characters', Store.characters().filter((x) => x.id !== id));
    },
    customMaps: () => U.store.get('maps', []),
    allMaps: () => D.PRESET_MAPS.concat(Store.customMaps()),
    map: (id) => Store.allMaps().find((m) => m.id === id),
    saveMap(m) {
      const list = Store.customMaps();
      const i = list.findIndex((x) => x.id === m.id);
      if (i >= 0) list[i] = m;
      else list.push(m);
      U.store.set('maps', list);
    },
    deleteMap(id) {
      U.store.set('maps', Store.customMaps().filter((x) => x.id !== id));
    },
    battles: () => U.store.get('battles', []),
    saveBattle(B) {
      const list = Store.battles().filter((x) => x.id !== B.id);
      list.unshift({ id: B.id, name: B.name, date: Date.now(), round: B.round, phase: B.phase, state: B });
      U.store.set('battles', list.slice(0, 12));
    },
    deleteBattle(id) {
      U.store.set('battles', Store.battles().filter((x) => x.id !== id));
    },
    autosave: () => U.store.get('autosave', null),
    setAutosave(B) {
      U.store.set('autosave', { name: B.name, date: Date.now(), round: B.round, state: B });
    },
    clearAutosave() {
      U.store.set('autosave', null);
    },
    settings() {
      return Object.assign({ aiSpeed: 'normal', dice: 'normal', enemyHp: true, rollMonsterHp: false, autoAI: true, grid: true, waterRule: 'all' }, U.store.get('settings', {}));
    },
    setSettings(s) {
      U.store.set('settings', s);
    },
  };
  D.Store = Store;

  /* ---------- Элементы интерфейса ---------- */
  const UI = {};
  UI.toast = function (msg, cls) {
    const t = el('div', { class: 'toast ' + (cls || '') }, msg);
    document.getElementById('toast-root').appendChild(t);
    setTimeout(() => t.remove(), 2600);
  };

  UI.modal = function (o) {
    const back = el('div', { class: 'modal-back' });
    const box = el('div', { class: 'modal', style: o.width ? { width: o.width } : null });
    let resolveFn;
    const promise = new Promise((r) => (resolveFn = r));
    const close = (v) => {
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (o.onClose) o.onClose(v);
      resolveFn(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && o.closable !== false) {
        e.stopPropagation();
        close(o.escValue !== undefined ? o.escValue : null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    const head = el('div', { class: 'mh' }, o.title || '', o.closable === false ? null : el('button', { class: 'ghost small x', onclick: () => close(o.escValue !== undefined ? o.escValue : null) }, '✕'));
    const body = el('div', { class: 'mb' });
    if (o.body) body.appendChild(typeof o.body === 'string' ? el('div', { html: o.body }) : o.body);
    box.appendChild(head);
    box.appendChild(body);
    if (o.buttons && o.buttons.length) {
      const foot = el('div', { class: 'mf' });
      for (const b of o.buttons) {
        foot.appendChild(el('button', { class: b.cls || '', onclick: () => (b.onClick ? b.onClick(close) : close(b.value)) }, b.label));
      }
      box.appendChild(foot);
    }
    back.appendChild(box);
    back.addEventListener('mousedown', (e) => {
      if (e.target === back && o.closable !== false && o.backdropClose !== false) close(o.escValue !== undefined ? o.escValue : null);
    });
    document.getElementById('modal-root').appendChild(back);
    return { close, box, body, promise };
  };

  UI.ask = function (question, options, title) {
    const m = UI.modal({
      title: title || 'Решение',
      body: el('div', { style: { fontSize: '15px', lineHeight: '1.5', maxWidth: '520px' } }, question),
      buttons: options.map((o, i) => ({ label: o.label, value: o.value, cls: i === 0 ? 'primary' : '' })),
      closable: false,
    });
    return m.promise;
  };

  UI.confirm = function (text, okLabel) {
    return UI.modal({
      title: 'Подтверждение',
      body: el('div', { style: { fontSize: '15px', maxWidth: '480px' } }, text),
      buttons: [
        { label: 'Отмена', value: false },
        { label: okLabel || 'Да', value: true, cls: 'primary' },
      ],
      escValue: false,
    }).promise;
  };

  UI.prompt = function (title, def, opts) {
    opts = opts || {};
    const inp = el('input', { type: opts.type || 'text', value: def == null ? '' : def, style: { width: '100%' } });
    if (opts.min != null) inp.min = opts.min;
    if (opts.max != null) inp.max = opts.max;
    const m = UI.modal({
      title,
      body: el('div', { class: 'col', style: { minWidth: '320px' } }, opts.label ? el('div', {}, opts.label) : null, inp),
      buttons: [
        { label: 'Отмена', value: null },
        { label: 'OK', cls: 'primary', onClick: (close) => close(opts.type === 'number' ? Number(inp.value) : inp.value) },
      ],
    });
    setTimeout(() => {
      inp.focus();
      inp.select();
    }, 30);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') m.close(opts.type === 'number' ? Number(inp.value) : inp.value);
    });
    return m.promise;
  };

  UI.ctxMenu = function (x, y, items) {
    UI.closeCtx();
    const menu = el('div', { class: 'ctx-menu' });
    for (const it of items) {
      if (it.sep) menu.appendChild(el('div', { class: 'sep' }));
      else if (it.header) menu.appendChild(el('div', { class: 'hd' }, it.header));
      else
        menu.appendChild(
          el('div', {
            class: 'it' + (it.disabled ? ' muted' : ''),
            onclick: () => {
              if (it.disabled) return;
              UI.closeCtx();
              it.onClick();
            },
          }, it.icon ? el('span', { class: 'emoji' }, it.icon) : null, it.label)
        );
    }
    document.body.appendChild(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';
    UI._ctx = menu;
    setTimeout(() => document.addEventListener('mousedown', UI._ctxAway, true), 0);
  };
  UI._ctxAway = function (e) {
    if (UI._ctx && !UI._ctx.contains(e.target)) UI.closeCtx();
  };
  UI.closeCtx = function () {
    if (UI._ctx) UI._ctx.remove();
    UI._ctx = null;
    document.removeEventListener('mousedown', UI._ctxAway, true);
  };

  UI.face = function (c, cls) {
    const f = el('div', { class: cls || 'face', style: { borderColor: c.color || (D.R.SIDES[c.side] || {}).color } });
    if (c.portrait) f.appendChild(el('img', { src: c.portrait }));
    else f.appendChild(UI.icon(c.icon));
    return f;
  };

  /* Иконка game-icons.net: один раз рисуется в растровую картинку и кэшируется.
     Растровые <img> дёшевы для видеокарты даже в длинных списках (векторные контуры
     в сотнях строк бестиария перегружали отрисовку на слабых ПК). */
  const ICON_URLS = {};
  UI.iconURL = function (key, color, px) {
    const d = key && D.ICONS && D.ICONS[key];
    if (!d) return null;
    color = color || '#e6d7b8';
    px = px || 96;
    const k = key + '|' + color + '|' + px;
    if (ICON_URLS[k]) return ICON_URLS[k];
    const cv = document.createElement('canvas');
    cv.width = px;
    cv.height = px;
    const cx = cv.getContext('2d');
    cx.scale(px / 512, px / 512);
    cx.fillStyle = color;
    cx.fill(D.iconPath ? D.iconPath(key) : new Path2D(d));
    let url = cv.toDataURL('image/png');
    // Короткая blob-ссылка вместо длинной data-строки в каждом <img>
    try {
      const bin = atob(url.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      url = URL.createObjectURL(new Blob([arr], { type: 'image/png' }));
    } catch (e) {
      /* остаётся data-ссылка */
    }
    ICON_URLS[k] = url;
    return url;
  };
  UI.icon = function (key, opts) {
    opts = opts || {};
    const url = UI.iconURL(key, opts.color, opts.px);
    if (!url) return el('span', { class: 'ico-emoji' + (opts.cls ? ' ' + opts.cls : '') }, key || '?');
    const img = el('img', { class: 'gi' + (opts.cls ? ' ' + opts.cls : ''), src: url, alt: '', draggable: 'false', decoding: 'async' });
    if (opts.size) {
      img.style.width = opts.size + 'px';
      img.style.height = opts.size + 'px';
    }
    if (opts.title) img.title = opts.title;
    return img;
  };

  /* Выбор иконки из набора game-icons.net */
  UI.pickIcon = function (current) {
    const keys = Object.keys(D.ICONS || {}).sort();
    let picked = current;
    const q = el('input', { placeholder: '🔍 Поиск по названию (англ.)', style: { width: '100%', marginBottom: '8px' } });
    const grid = el('div', { class: 'icon-grid', style: { maxHeight: '60vh', overflowY: 'auto', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))' } });
    const draw = () => {
      U.clear(grid);
      const f = q.value.trim().toLowerCase();
      for (const k of keys) {
        if (f && !k.includes(f)) continue;
        grid.appendChild(el('div', { class: 'opt' + (k === picked ? ' sel' : ''), title: k, onclick: () => { picked = k; m.close(k); } }, UI.icon(k)));
      }
    };
    q.oninput = draw;
    const m = UI.modal({ title: 'Выберите значок', body: el('div', { style: { width: '640px', maxWidth: '86vw' } }, q, grid), buttons: [{ label: 'Отмена', value: null }] });
    draw();
    return m.promise;
  };
  /* Поле выбора значка: кнопка с иконкой + поле для эмодзи */
  UI.iconField = function (value) {
    let cur = value || '';
    const prev = el('button', { class: 'small', type: 'button', style: { fontSize: '22px', minWidth: '44px' } });
    const emoji = el('input', { placeholder: 'или эмодзи', style: { width: '90px' }, value: D.ICONS && D.ICONS[cur] ? '' : cur, oninput: () => { if (emoji.value.trim()) { cur = emoji.value.trim(); show(); } } });
    const show = () => {
      U.clear(prev);
      prev.appendChild(UI.icon(cur || 'cowled'));
    };
    prev.onclick = async () => {
      const k = await UI.pickIcon(cur);
      if (k) {
        cur = k;
        emoji.value = '';
        show();
      }
    };
    show();
    return { el: el('div', { class: 'row' }, prev, emoji), get: () => cur };
  };

  /* Уменьшить картинку до квадрата 256×256 */
  UI.shrinkImage = function (dataUrl, size) {
    size = size || 256;
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = size;
        cv.height = size;
        const cx = cv.getContext('2d');
        const k = Math.max(size / im.width, size / im.height);
        const w = im.width * k;
        const h = im.height * k;
        cx.drawImage(im, (size - w) / 2, (size - h) / 2, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.85));
      };
      im.onerror = () => resolve(null);
      im.src = dataUrl;
    });
  };
  D.UI = UI;

  /* ---------- Маршрутизация экранов ---------- */
  const App = { screens: {}, current: null };
  App.register = function (name, screen) {
    App.screens[name] = screen;
  };
  App.show = function (name, params) {
    UI.closeCtx();
    if (App.current && App.current.destroy) App.current.destroy();
    const root = U.clear(document.getElementById('screen'));
    const scr = App.screens[name];
    App.current = scr;
    App.currentName = name;
    scr.render(root, params || {});
  };
  D.App = App;

  /* ---------- Главное меню ---------- */
  App.register('menu', {
    render(rootEl) {
      const bg = el('canvas', { class: 'bg' });
      const saves = Store.battles();
      const auto = Store.autosave();
      const card = el('div', { class: 'menu-card' },
        el('div', { class: 'logo' }, UI.icon('dragon-head', { color: '#e2563b', px: 168 })),
        el('h1', {}, 'Подземелья и Драконы'),
        el('div', { class: 'subtitle' }, 'Тактический боевой стол · 5-я редакция'),
        el('div', { class: 'menu-buttons' },
          auto && auto.state ? el('button', { class: 'gold', title: 'Бой сохраняется автоматически во время игры', onclick: () => App.show('battle', { load: auto.state }) }, '▶  Продолжить бой: ' + auto.name + ' (раунд ' + auto.round + ')') : null,
          el('button', { class: 'primary', onclick: () => App.show('battle', {}) }, '⚔️  Новый бой'),
          el('button', { disabled: !saves.length, onclick: () => App.loadBattleDialog() }, '📂  Загрузить бой' + (saves.length ? ' (' + saves.length + ')' : '')),
          el('button', { onclick: () => App.show('roster') }, '🧙  Персонажи'),
          el('button', { onclick: () => App.show('editor', {}) }, '🗺️  Редактор карт'),
          el('button', { onclick: () => App.show('bestiary', {}) }, '📖  Бестиарий'),
          el('button', { onclick: () => App.show('help') }, '📜  Правила боя'),
          el('button', { onclick: () => window.close() }, '🚪  Выход')
        ),
        el('div', { class: 'menu-footer' }, 'Игра на одном компьютере: игроки ходят по очереди. ', el('br'),
          'Механики и бестиарий — SRD 5.1 (CC-BY-4.0). Иконки — game-icons.net (CC BY 3.0). Полные правила: ', el('a', { href: 'https://dnd.su/', target: '_blank' }, 'dnd.su'))
      );
      rootEl.appendChild(el('div', { class: 'menu-screen' }, bg, card));
      // Декоративный фон из клеток
      requestAnimationFrame(() => {
        const r = bg.getBoundingClientRect();
        bg.width = r.width;
        bg.height = r.height;
        const cx = bg.getContext('2d');
        const s = 56;
        const ids = ['floor', 'floor', 'flagstone', 'rubble', 'wall', 'grass', 'dirt', 'water', 'lava', 'pillar', 'tree', 'bush'];
        for (let y = 0; y < r.height / s + 1; y++)
          for (let x = 0; x < r.width / s + 1; x++) {
            const id = ids[Math.floor(U.hash2(x, y, 77) * ids.length)];
            D.drawTile(cx, id, x * s, y * s, s, x, y, null);
          }
        const g = cx.createRadialGradient(r.width / 2, r.height / 2, 50, r.width / 2, r.height / 2, Math.max(r.width, r.height) / 1.4);
        g.addColorStop(0, 'rgba(20,16,13,0.2)');
        g.addColorStop(1, 'rgba(20,16,13,1)');
        cx.fillStyle = g;
        cx.fillRect(0, 0, r.width, r.height);
      });
    },
  });

  App.loadBattleDialog = function () {
    const saves = Store.battles();
    const list = el('div', { class: 'list', style: { minWidth: '480px' } });
    const m = UI.modal({ title: 'Сохранённые бои', body: list, buttons: [{ label: 'Закрыть', value: null }] });
    const redraw = () => {
      U.clear(list);
      const cur = Store.battles();
      if (!cur.length) list.appendChild(el('div', { class: 'empty' }, 'Нет сохранений'));
      for (const s of cur) {
        list.appendChild(el('div', { class: 'list-item' },
          el('span', { class: 'ico' }, '⚔️'),
          el('div', { class: 'grow', onclick: () => { m.close(); App.show('battle', { load: s.state }); } },
            el('div', {}, s.name), el('div', { class: 'muted', style: { fontSize: '12px' } }, new Date(s.date).toLocaleString('ru-RU') + ' · ' + (s.phase === 'combat' ? 'раунд ' + s.round : s.phase === 'ended' ? 'завершён' : 'подготовка'))),
          el('button', { class: 'small', onclick: () => { m.close(); App.show('battle', { load: s.state }); } }, 'Загрузить'),
          el('button', { class: 'small danger', onclick: async () => { if (await UI.confirm('Удалить сохранение «' + s.name + '»?')) { Store.deleteBattle(s.id); redraw(); } } }, '🗑')
        ));
      }
    };
    redraw();
    return saves;
  };

  /* ---------- Справка ---------- */
  App.register('help', {
    render(rootEl) {
      const h = el('div', { class: 'help', html: HELP_HTML });
      rootEl.appendChild(el('div', { class: 'screen' },
        el('div', { class: 'topbar' }, el('button', { onclick: () => App.show('menu') }, '← Меню'), el('h2', {}, 'Правила боя (кратко)')),
        el('div', { style: { overflowY: 'auto', flex: 1 } }, h)));
    },
  });

  const HELP_HTML = `
<h3>Как играть</h3>
<p>Все игроки сидят за одним компьютером. Каждый управляет своим персонажем, когда наступает его ход по инициативе. Монстрами управляет ИИ или ведущий (ДМ) — это выбирается для каждого участника при подготовке боя.</p>
<ol>
<li><b>Персонажи</b> — создайте героев: раса, класс и подкласс, уровень (1–20), характеристики (стандартный набор, покупка очков или бросок 4d6), навыки, снаряжение и заклинания.</li>
<li><b>Редактор карт</b> — нарисуйте поле боя: пол, стены, двери, деревья, вода, лава, мебель. Или возьмите готовую карту.</li>
<li><b>Новый бой</b> — выберите карту, добавьте героев и монстров из бестиария, расставьте их на поле (клик по участнику в списке, затем по клетке; жетоны можно перетаскивать). У выбранного участника справа можно изменить максимум хитов и КД.</li>
<li><b>Инициатива</b> — каждый игрок по очереди нажимает «Бросить» (или вводит результат с настоящего кубика). Затем начинается бой.</li>
</ol>
<h3>Ход в бою</h3>
<table>
<tr><th>Что</th><th>Как</th></tr>
<tr><td>Перемещение</td><td>Голубые клетки — куда можно дойти. Наведите — увидите путь и стоимость, кликните — персонаж идёт. Труднопроходимая местность (кусты, вода, обломки) стоит двойное перемещение. Диагональ = 5 фт.</td></tr>
<tr><td>Действие</td><td>Атака, заклинание, Рывок (удвоить перемещение), Отход (без атак по возможности), Уклонение (атаки по вам с помехой), Помощь, Толчок, Захват, зелье.</td></tr>
<tr><td>Бонусное действие</td><td>Только если его даёт умение или заклинание: Второе дыхание, Хитрое действие, Ярость, Лечащее слово, атака второй рукой и т. д.</td></tr>
<tr><td>Реакция</td><td>Атака по возможности (когда враг выходит из вашей досягаемости), Щит, Парирование, Невероятное уклонение, Адское возмездие — игра спросит, если это возможно.</td></tr>
</table>
<h3>Атака</h3>
<p>Бросок к20 + бонус атаки против Класса Доспеха цели. 20 на кости — критическое попадание (кубы урона удваиваются), 1 — промах. <b>Преимущество</b> — бросается два к20, берётся больший; <b>помеха</b> — меньший. Источники: тактика стаи, сбитая с ног цель, невидимость, уклонение, дальний выстрел, враг рядом со стрелком и т. д. — всё учитывается автоматически и видно в журнале.</p>
<h3>Хиты и смерть</h3>
<p>При 0 хитов персонаж игрока теряет сознание и в начале каждого своего хода делает спасбросок от смерти (10+ — успех, три успеха — стабилизация, три провала — смерть; 20 — приходит в себя с 1 хитом). Урон по лежащему без сознания — провал спасброска. Монстры при 0 хитов погибают (тролль регенерирует, пока его не прижгут огнём или кислотой).</p>
<h3>Заклинания</h3>
<p>В игре все 319 заклинаний SRD 5.1. Ячейки заклинаний тратятся при накладывании; заговоры — бесплатно. Наведите на заклинание — увидите описание, время накладывания, дистанцию и длительность. Заклинания со временем накладывания 1 минута и дольше в бою недоступны; описательные (ритуалы, прорицания) выводят эффект в журнал — его разыгрывает ведущий. Зоны (Лунный луч, Облако смерти, Огненная стена) действуют на тех, кто начинает в них ход. Если у врага есть Контрзаклинание, он может прервать ваше заклинание реакцией. Площадные заклинания показывают шаблон (сфера, конус, линия, куб) — наведите и кликните. Заклинания с концентрацией прерываются при получении урона (спасбросок Телосложения) или при накладывании другого заклинания с концентрацией.</p>
<h3>Вода</h3>
<p>Водные существа (рыбы, акулы, касатка, морские коньки, квапперы) плавают по любой воде, но не могут выйти на сушу; если такое существо поставить на сушу, в начале каждого его хода оно задыхается и получает урон (1к10 + 10% максимума хитов). Существа со скоростью плавания (крокодил, тритоны, драконы и др.) свободно плавают и сражаются в воде. Все остальные, оказавшись в воде, могут только перемещаться — без действий и бонусных действий (реакции остаются). Летающие над водой не ограничены. Правило можно смягчить в настройках боя (⚙): только глубокая вода или без ограничений.</p>
<h3>Легендарные действия</h3>
<p>Легендарные существа (взрослые драконы, лич, кракен и др.) в конце хода каждого другого участника могут потратить очки легендарных действий: атаку, взгляд, взмах крыльев и т. п. Очки восстанавливаются в начале их хода. Если таким существом управляет ведущий, игра спросит, какое действие выбрать.</p>
<h3>Состояния</h3>
<table>${Object.values(D.R.CONDITIONS).map((c) => `<tr><td>${c.icon} ${c.name}</td><td>${c.desc}</td></tr>`).join('')}</table>
<h3>Управление</h3>
<table>
<tr><td>Колесо мыши</td><td>Масштаб</td></tr>
<tr><td>Правая / средняя кнопка + перетаскивание</td><td>Сдвиг карты</td></tr>
<tr><td>Правый клик по жетону</td><td>Меню ведущего: хиты, состояния, управление, удаление</td></tr>
<tr><td>Esc</td><td>Отменить выбор действия</td></tr>
<tr><td>Пробел / Enter</td><td>Закончить ход</td></tr>
<tr><td>F11 / F12</td><td>Полный экран / консоль разработчика</td></tr>
</table>
<p class="muted">Игровая механика и бестиарий основаны на System Reference Document 5.1 (Wizards of the Coast, CC-BY-4.0). Иконки — <a href="https://game-icons.net" target="_blank">game-icons.net</a> (Lorc, Delapouite и др., CC BY 3.0). Полные тексты правил, заклинаний и бестиария на русском — на <a href="https://dnd.su/" target="_blank">dnd.su</a>.</p>
`;

  /* ---------- Запуск ---------- */
  window.addEventListener('DOMContentLoaded', () => {
    App.show('menu');
  });
  window.addEventListener('error', (e) => {
    console.error(e.error || e.message);
  });
})(typeof window !== 'undefined' ? window : globalThis);
