/* Список персонажей и создание персонажа */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const R = D.R;
  const el = U.el;
  const UI = D.UI;
  const Store = D.Store;
  const Char = D.Char;

  /* ---------- Лист персонажа (превью) ---------- */
  D.renderSheet = function (ch) {
    const s = Char.compute(ch);
    const avatar = el('div', { class: 'big-avatar', style: { borderColor: ch.color } });
    if (ch.portrait) avatar.appendChild(el('img', { src: ch.portrait }));
    else avatar.appendChild(document.createTextNode(s.race.icon));
    const sheet = el('div', { class: 'sheet' });
    sheet.appendChild(el('div', { class: 'head' }, avatar, el('div', {},
      el('h2', { style: { margin: 0 } }, ch.name || 'Без имени'),
      el('div', { class: 'muted' }, (s.sub ? s.sub.name : s.race.name) + ' · ' + s.cls.name + ' ' + s.level + ' ур. · ' + s.cls.subclass),
      ch.player ? el('div', { class: 'muted' }, 'Игрок: ' + ch.player) : null)));
    sheet.appendChild(el('div', { class: 'abils' }, R.ABILITIES.map((ab) => el('div', { class: 'abil' }, el('div', { class: 'n' }, R.ABILITY_SHORT[ab]), el('div', { class: 'm' }, U.fmtMod(s.mods[ab])), el('div', { class: 's' }, s.abil[ab])))));
    sheet.appendChild(el('div', { class: 'vitals' },
      el('div', { class: 'vital' }, el('div', { class: 'v' }, s.ac), el('div', { class: 'l' }, 'КД · ' + s.acNote)),
      el('div', { class: 'vital' }, el('div', { class: 'v good' }, s.hp), el('div', { class: 'l' }, 'Хиты (к' + s.cls.hitDie + ')')),
      el('div', { class: 'vital' }, el('div', { class: 'v' }, s.speed), el('div', { class: 'l' }, 'Скорость, фт.')),
      el('div', { class: 'vital' }, el('div', { class: 'v' }, U.fmtMod(s.initiative)), el('div', { class: 'l' }, 'Инициатива'))));
    sheet.appendChild(el('div', { class: 'row wrap', style: { marginTop: '8px', fontSize: '12px' } },
      el('span', { class: 'chip' }, 'Мастерство ' + U.fmtMod(s.prof)),
      el('span', { class: 'chip' }, 'Пасс. Восприятие ' + s.passivePerception),
      s.darkvision ? el('span', { class: 'chip' }, 'Тёмное зрение ' + s.darkvision + ' фт.') : null,
      s.resist.length ? el('span', { class: 'chip good' }, 'Сопротивление: ' + s.resist.map((t) => R.DAMAGE_SHORT[t]).join(', ')) : null));
    sheet.appendChild(el('div', { class: 'section-title' }, 'Спасброски'));
    sheet.appendChild(el('div', { class: 'row wrap' }, R.ABILITIES.map((ab) => el('span', { class: 'chip' + (s.cls.saves.includes(ab) ? ' good' : '') }, R.ABILITY_SHORT[ab] + ' ' + U.fmtMod(s.saves[ab])))));
    sheet.appendChild(el('div', { class: 'section-title' }, 'Навыки'));
    const profSkills = new Set([...(ch.skills || []), ...(s.race.skills || [])]);
    sheet.appendChild(el('div', { class: 'row wrap', style: { gap: '4px' } }, Object.keys(R.SKILLS).map((sk) => el('span', { class: 'chip' + (profSkills.has(sk) ? ' good' : ''), style: { opacity: profSkills.has(sk) ? 1 : 0.65 } }, R.SKILLS[sk].name + ' ' + U.fmtMod(s.skills[sk])))));
    sheet.appendChild(el('div', { class: 'section-title' }, 'Атаки'));
    const tbl = el('table', {}, el('tr', {}, el('th', {}, 'Оружие'), el('th', {}, 'Атака'), el('th', {}, 'Урон'), el('th', {}, 'Дальность')));
    for (const a of s.attacks) {
      tbl.appendChild(el('tr', {},
        el('td', {}, a.name + (a.proficient === false ? ' *' : '')),
        el('td', {}, U.fmtMod(a.toHit)),
        el('td', {}, a.dmg.map((d) => d.dice + ' ' + R.DAMAGE_SHORT[d.type]).join(' + ')),
        el('td', {}, a.kind === 'ranged' ? a.range.join('/') : (a.reach || 5) + (a.range ? ' / ' + a.range.join('/') : ''))));
    }
    sheet.appendChild(tbl);
    if (s.spellcasting && s.spells.length) {
      sheet.appendChild(el('div', { class: 'section-title' }, 'Заклинания'));
      const sc = s.spellcasting;
      sheet.appendChild(el('div', { class: 'row wrap' },
        el('span', { class: 'chip spell' }, 'Сл спасброска ' + sc.dc),
        el('span', { class: 'chip spell' }, 'Атака ' + U.fmtMod(sc.toHit)),
        Object.keys(sc.slots).map((k) => el('span', { class: 'chip spell' }, k + ' ур.: ' + sc.slots[k].max + ' яч.'))));
      const byLevel = {};
      for (const id of s.spells) {
        const sp = D.spell(id);
        (byLevel[sp.level] = byLevel[sp.level] || []).push(sp.name);
      }
      for (const lv of Object.keys(byLevel).sort()) sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, lv === '0' ? 'Заговоры: ' : lv + ' уровень: '), byLevel[lv].join(', ')));
    }
    sheet.appendChild(el('div', { class: 'section-title' }, 'Умения'));
    const feats = s.cls.features.filter((f) => f.lv <= s.level);
    for (const f of feats) sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, f.name + ' (' + f.lv + '). '), f.desc));
    if (s.ancestry) sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, 'Оружие дыхания. '), (s.ancestry.shape === 'line' ? 'Линия 5×30 фт.' : 'Конус 15 фт.') + ', ' + R.DAMAGE_SHORT[s.ancestry.type] + ', спасбросок ' + R.ABILITY_GEN[s.ancestry.save] + ' Сл ' + (8 + s.mods.con + s.prof) + '.'));
    sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, 'Раса. '), s.race.desc + (s.sub ? ' ' + s.sub.desc : '')));
    if (ch.potions) sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, 'Снаряжение. '), 'Зелья лечения: ' + ch.potions + ' (2к4+2).'));
    return sheet;
  };

  /* ---------- Готовая партия ---------- */
  function premade() {
    const defs = [
      { name: 'Торгрим', cls: 'fighter', race: 'dwarf', subrace: 'mountain', color: '#d9a43d' },
      { name: 'Элариэль', cls: 'wizard', race: 'elf', subrace: 'high', color: '#9b59b6' },
      { name: 'Мирна', cls: 'cleric', race: 'human', subrace: '', color: '#f1c40f' },
      { name: 'Шнырь', cls: 'rogue', race: 'halfling', subrace: 'lightfoot', color: '#2bb3a6' },
    ];
    return defs.map((d) => {
      const ch = Char.blank();
      Object.assign(ch, { name: d.name, cls: d.cls, race: d.race, subrace: d.subrace, color: d.color, level: 3 });
      Char.applyClassDefaults(ch);
      return ch;
    });
  }

  /* ---------- Список персонажей ---------- */
  D.App.register('roster', {
    render(rootEl) {
      const cards = el('div', { class: 'cards' });
      const redraw = () => {
        U.clear(cards);
        const list = Store.characters();
        if (!list.length) cards.appendChild(el('div', { class: 'empty', style: { gridColumn: '1/-1' } }, 'Пока нет персонажей. Создайте героя или возьмите готовую партию.'));
        for (const ch of list) {
          let s;
          try {
            s = Char.compute(ch);
          } catch (e) {
            continue;
          }
          const av = el('div', { class: 'avatar', style: { borderColor: ch.color } });
          if (ch.portrait) av.appendChild(el('img', { src: ch.portrait }));
          else av.appendChild(document.createTextNode(s.race.icon));
          cards.appendChild(el('div', { class: 'card', onclick: () => D.App.show('creator', { ch }) },
            av,
            el('div', { class: 'grow' },
              el('h3', {}, ch.name),
              el('div', { class: 'meta' }, (s.sub ? s.sub.name : s.race.name) + ', ' + s.cls.name + ' ' + s.level + ' ур.'),
              ch.player ? el('div', { class: 'meta' }, 'Игрок: ' + ch.player) : null,
              el('div', { class: 'stats' }, el('span', {}, '❤️ ' + s.hp), el('span', {}, '🛡️ ' + s.ac), el('span', {}, '👣 ' + s.speed))),
            el('div', { class: 'actions' },
              el('button', { class: 'small', title: 'Копировать', onclick: (e) => { e.stopPropagation(); const c2 = U.deepClone(ch); c2.id = U.uid('pc'); c2.name += ' (копия)'; Store.saveCharacter(c2); redraw(); } }, '📋'),
              el('button', { class: 'small', title: 'Экспорт', onclick: (e) => { e.stopPropagation(); U.downloadJSON(ch.name + '.dndchar.json', { type: 'dnd-characters', list: [ch] }); } }, '⬇'),
              el('button', { class: 'small danger', title: 'Удалить', onclick: async (e) => { e.stopPropagation(); if (await UI.confirm('Удалить персонажа «' + ch.name + '»?')) { Store.deleteCharacter(ch.id); redraw(); } } }, '🗑'))
          ));
        }
      };
      redraw();
      const importChars = async () => {
        const f = await U.pickFile('.json');
        if (!f) return;
        try {
          const data = JSON.parse(f.data);
          const list = data.list || (Array.isArray(data) ? data : [data]);
          let n = 0;
          for (const ch of list) {
            if (!ch || !ch.cls || !ch.race || !D.cls(ch.cls) || !D.race(ch.race)) continue;
            ch.id = U.uid('pc');
            Store.saveCharacter(Object.assign(Char.blank(), ch));
            n++;
          }
          UI.toast('Импортировано персонажей: ' + n);
          redraw();
        } catch (e) {
          UI.toast('Не удалось прочитать файл', 'bad');
        }
      };
      rootEl.appendChild(el('div', { class: 'screen' },
        el('div', { class: 'topbar' },
          el('button', { onclick: () => D.App.show('menu') }, '← Меню'),
          el('h2', {}, '🧙 Персонажи'),
          el('div', { class: 'spacer' }),
          el('button', { onclick: () => { premade().forEach((c) => Store.saveCharacter(c)); redraw(); UI.toast('Добавлена готовая партия 3 уровня'); } }, '🎲 Готовая партия'),
          el('button', { onclick: importChars }, '⬆ Импорт'),
          el('button', { onclick: () => U.downloadJSON('персонажи.dndchar.json', { type: 'dnd-characters', list: Store.characters() }) }, '⬇ Экспорт всех'),
          el('button', { class: 'primary', onclick: () => D.App.show('creator', {}) }, '+ Создать персонажа')),
        cards));
    },
  });

  /* ---------- Создание персонажа ---------- */
  D.App.register('creator', {
    render(rootEl, params) {
      const isNew = !params.ch;
      const ch = params.ch ? Object.assign(Char.blank(), U.deepClone(params.ch)) : Char.blank();
      if (!ch.asi) ch.asi = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
      const back = params.back || 'roster';
      const form = el('div', { class: 'creator-form' });
      const sheetBox = el('div', { class: 'creator-sheet' });

      const updSheet = () => {
        U.clear(sheetBox);
        try {
          sheetBox.appendChild(D.renderSheet(ch));
        } catch (e) {
          sheetBox.appendChild(el('div', { class: 'bad' }, 'Ошибка расчёта: ' + e.message));
        }
      };
      const rerender = () => {
        const sc = form.scrollTop;
        U.clear(form);
        build();
        form.scrollTop = sc;
        updSheet();
      };

      function fixSubrace() {
        const r = D.race(ch.race);
        if (r.subraces.length && !r.subraces.find((s) => s.id === ch.subrace)) ch.subrace = r.subraces[0].id;
        if (!r.subraces.length) ch.subrace = '';
      }

      function build() {
        const cls = D.cls(ch.cls);
        const race = D.race(ch.race);
        // ---- Основное ----
        form.appendChild(el('div', { class: 'section-title' }, 'Основное'));
        const portraitBtns = el('div', { class: 'row' },
          el('button', { class: 'small', onclick: async () => { const f = await U.pickFile('image/*'); if (f) { ch.portrait = await UI.shrinkImage(f.data, 256); rerender(); } } }, '🖼️ Загрузить портрет'),
          ch.portrait ? el('button', { class: 'small', onclick: () => { ch.portrait = null; rerender(); } }, 'Убрать') : null,
          el('input', { type: 'color', value: ch.color, oninput: (e) => { ch.color = e.target.value; updSheet(); } }),
          el('span', { class: 'muted' }, 'цвет жетона'));
        const grid = el('div', { class: 'form-grid' },
          el('label', {}, 'Имя'), el('input', { value: ch.name, oninput: (e) => { ch.name = e.target.value; updSheet(); } }),
          el('label', {}, 'Игрок'), el('input', { value: ch.player, placeholder: 'Имя игрока', oninput: (e) => { ch.player = e.target.value; updSheet(); } }),
          el('label', {}, 'Раса'), U.select(D.RACES.map((r) => ({ value: r.id, label: r.icon + ' ' + r.name })), ch.race, (v) => { ch.race = v; fixSubrace(); ch.raceChoice = []; rerender(); }),
          race.subraces.length ? el('label', {}, 'Подраса') : null,
          race.subraces.length ? U.select(race.subraces.map((s) => ({ value: s.id, label: s.name })), ch.subrace, (v) => { ch.subrace = v; rerender(); }) : null,
          race.ancestry ? el('label', {}, 'Драконий предок') : null,
          race.ancestry ? U.select(Object.keys(race.ancestry).map((k) => ({ value: k, label: race.ancestry[k].name + ' (' + R.DAMAGE_SHORT[race.ancestry[k].type] + ', ' + (race.ancestry[k].shape === 'line' ? 'линия' : 'конус') + ')' })), ch.ancestry, (v) => { ch.ancestry = v; rerender(); }) : null,
          el('label', {}, 'Класс'), U.select(D.CLASSES.map((c) => ({ value: c.id, label: c.icon + ' ' + c.name })), ch.cls, (v) => { ch.cls = v; Char.applyClassDefaults(ch); rerender(); }),
          el('label', {}, 'Уровень'), U.select(Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: i + 1 + ' уровень' })), ch.level, (v) => { ch.level = Number(v); trimAsi(); ch.spells = trimSpells(); rerender(); }),
          el('label', {}, 'Жетон'), portraitBtns);
        form.appendChild(grid);
        form.appendChild(el('div', { class: 'muted', style: { margin: '6px 0 0 152px', fontSize: '12px' } }, race.desc + (D.race(ch.race).subraces.find((s) => s.id === ch.subrace) ? ' ' + D.race(ch.race).subraces.find((s) => s.id === ch.subrace).desc : '')));

        // ---- Характеристики ----
        form.appendChild(el('div', { class: 'section-title' }, 'Характеристики'));
        const methodSel = U.select([
          { value: 'standard', label: 'Стандартный набор (15, 14, 13, 12, 10, 8)' },
          { value: 'pointbuy', label: 'Покупка очков (27)' },
          { value: 'roll', label: 'Бросок 4к6 (без наименьшего)' },
          { value: 'manual', label: 'Вручную' },
        ], ch.method, (v) => {
          ch.method = v;
          if (v === 'standard') ch.base = assignByPriority(Char.STANDARD_ARRAY);
          if (v === 'pointbuy') ch.base = { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 };
          if (v === 'roll') rollStats();
          rerender();
        });
        const topRow = el('div', { class: 'row' }, methodSel);
        if (ch.method === 'roll') topRow.appendChild(el('button', { class: 'small gold', onclick: () => { rollStats(); rerender(); } }, '🎲 Перебросить'));
        if (ch.method === 'pointbuy') {
          const left = Char.POINTS - Char.pointBuyCost(ch.base);
          topRow.appendChild(el('span', { class: left < 0 ? 'bad' : 'good' }, 'Осталось очков: ' + left));
        }
        if (ch.method === 'roll' && ch.rollPool) topRow.appendChild(el('span', { class: 'muted' }, 'Выпало: ' + ch.rollPool.map((r) => r.total + ' [' + r.rolls.join(',') + ']').join('  ')));
        form.appendChild(topRow);

        const rb = Char.raceBonus(ch);
        const fin = Char.finalAbilities(ch);
        const asiTotal = D.asiCount(cls, ch.level) * 2;
        const asiUsed = U.sum(Object.values(ch.asi));
        const tbl = el('table', { class: 'abil-table', style: { marginTop: '8px' } },
          el('tr', {}, el('th', {}, ''), el('th', {}, 'Значение'), el('th', {}, 'Раса'), race.chooseBonus ? el('th', {}, '+1 на выбор') : null, asiTotal ? el('th', {}, 'Увеличение (' + (asiTotal - asiUsed) + ')') : null, el('th', {}, 'Итог'), el('th', {}, 'Мод.')));
        const pool = ch.method === 'standard' ? Char.STANDARD_ARRAY : ch.method === 'roll' && ch.rollPool ? ch.rollPool.map((r) => r.total) : null;
        for (const ab of R.ABILITIES) {
          let ctrl;
          if (pool) {
            ctrl = U.select(pool.map((v, i) => ({ value: v, label: String(v) })).filter((o, i, arr) => arr.findIndex((x) => x.value === o.value) === i).sort((a, b) => b.value - a.value), ch.base[ab], (v) => {
              v = Number(v);
              const other = R.ABILITIES.find((o) => o !== ab && ch.base[o] === v);
              if (other) ch.base[other] = ch.base[ab];
              ch.base[ab] = v;
              rerender();
            });
          } else if (ch.method === 'pointbuy') {
            ctrl = el('div', { class: 'row', style: { justifyContent: 'center' } },
              el('button', { class: 'small', disabled: ch.base[ab] <= 8, onclick: () => { ch.base[ab]--; rerender(); } }, '−'),
              el('b', { style: { width: '24px', display: 'inline-block' } }, ch.base[ab]),
              el('button', { class: 'small', disabled: ch.base[ab] >= 15 || Char.pointBuyCost(Object.assign({}, ch.base, { [ab]: ch.base[ab] + 1 })) > Char.POINTS, onclick: () => { ch.base[ab]++; rerender(); } }, '+'));
          } else {
            ctrl = el('input', { type: 'number', min: 3, max: 20, value: ch.base[ab], onchange: (e) => { ch.base[ab] = U.clamp(Number(e.target.value) || 10, 3, 20); rerender(); } });
          }
          const choose = race.chooseBonus
            ? el('td', {}, ab === 'cha' ? '' : el('input', {
              type: 'checkbox', checked: (ch.raceChoice || []).includes(ab), disabled: !(ch.raceChoice || []).includes(ab) && (ch.raceChoice || []).length >= race.chooseBonus,
              onchange: (e) => { ch.raceChoice = (ch.raceChoice || []).filter((x) => x !== ab); if (e.target.checked) ch.raceChoice.push(ab); rerender(); },
            }))
            : null;
          const asiCell = asiTotal
            ? el('td', {}, el('div', { class: 'row', style: { justifyContent: 'center' } },
              el('button', { class: 'small', disabled: !ch.asi[ab], onclick: () => { ch.asi[ab]--; rerender(); } }, '−'),
              el('span', { style: { width: '18px', display: 'inline-block' } }, ch.asi[ab] ? '+' + ch.asi[ab] : '0'),
              el('button', { class: 'small', disabled: asiUsed >= asiTotal || fin[ab] >= 20, onclick: () => { ch.asi[ab]++; rerender(); } }, '+')))
            : null;
          tbl.appendChild(el('tr', {},
            el('td', {}, R.ABILITY_NAMES[ab]),
            el('td', {}, ctrl),
            el('td', { class: rb[ab] ? 'good' : 'muted' }, rb[ab] ? '+' + rb[ab] : '—'),
            choose, asiCell,
            el('td', { class: 'final' }, fin[ab]),
            el('td', {}, U.fmtMod(U.mod(fin[ab])))));
        }
        form.appendChild(tbl);

        // ---- Навыки ----
        const extra = race.extraSkills || 0;
        const limit = cls.skills.count + extra;
        const allowed = extra || cls.skills.list === 'any' ? Object.keys(R.SKILLS) : cls.skills.list;
        const raceSkills = race.skills || [];
        ch.skills = (ch.skills || []).filter((s) => allowed.includes(s) && !raceSkills.includes(s)).slice(0, limit);
        form.appendChild(el('div', { class: 'section-title' }, 'Навыки (' + ch.skills.length + ' из ' + limit + ')'));
        const sg = el('div', { class: 'check-grid' });
        for (const sk of Object.keys(R.SKILLS)) {
          const fromRace = raceSkills.includes(sk);
          const can = allowed.includes(sk);
          const checked = fromRace || ch.skills.includes(sk);
          const dis = fromRace || !can || (!checked && ch.skills.length >= limit);
          sg.appendChild(el('label', { class: dis && !checked ? 'disabled' : '' },
            el('input', { type: 'checkbox', checked, disabled: dis, onchange: (e) => { if (e.target.checked) ch.skills.push(sk); else ch.skills = ch.skills.filter((x) => x !== sk); rerender(); } }),
            R.SKILLS[sk].name + ' (' + R.ABILITY_SHORT[R.SKILLS[sk].ab] + ')' + (fromRace ? ' — раса' : '')));
        }
        form.appendChild(sg);

        // ---- Боевой стиль ----
        if (cls.fightingStyleAt && ch.level >= cls.fightingStyleAt) {
          form.appendChild(el('div', { class: 'section-title' }, 'Боевой стиль'));
          const styles = cls.id === 'paladin' ? ['defense', 'dueling', 'gwf'] : cls.id === 'ranger' ? ['archery', 'defense', 'dueling', 'twf'] : Object.keys(D.FIGHTING_STYLES);
          if (!styles.includes(ch.fightingStyle)) ch.fightingStyle = styles[0];
          form.appendChild(el('div', { class: 'row' }, U.select(styles.map((k) => ({ value: k, label: D.FIGHTING_STYLES[k].name })), ch.fightingStyle, (v) => { ch.fightingStyle = v; rerender(); }),
            el('span', { class: 'muted' }, D.FIGHTING_STYLES[ch.fightingStyle].desc)));
        }

        // ---- Снаряжение ----
        form.appendChild(el('div', { class: 'section-title' }, 'Снаряжение'));
        const armorOpts = D.EQUIP.ARMOR.filter((a) => Char.armorProficient(ch, a)).map((a) => ({ value: a.id, label: a.name + (a.cat !== 'none' ? ' — КД ' + a.base + (a.dexMax >= 99 ? ' + ЛОВ' : a.dexMax > 0 ? ' + ЛОВ (макс. 2)' : '') + (a.str ? ', СИЛ ' + a.str : '') : '') }));
        if (!armorOpts.find((o) => o.value === ch.armor)) ch.armor = 'none';
        const eq = el('div', { class: 'form-grid' },
          el('label', {}, 'Доспех'), U.select(armorOpts, ch.armor, (v) => { ch.armor = v; rerender(); }),
          el('label', {}, 'Щит (+2 КД)'), el('div', {}, cls.armor.includes('shield') ? el('input', { type: 'checkbox', checked: ch.shield, onchange: (e) => { ch.shield = e.target.checked; rerender(); } }) : el('span', { class: 'muted' }, 'нет владения щитами')));
        const wOpts = [{ value: '', label: '— нет —' }].concat(D.EQUIP.WEAPONS.map((w) => ({ value: w.id, label: (Char.weaponProficient(ch, w) ? '' : '* ') + w.name + ' (' + w.dmg + ')' })));
        for (let i = 0; i < 3; i++) {
          const slot = (ch.weapons || [])[i] || { id: '', magic: 0 };
          eq.appendChild(el('label', {}, 'Оружие ' + (i + 1)));
          eq.appendChild(el('div', { class: 'row' },
            U.select(wOpts, slot.id, (v) => { ch.weapons = ch.weapons || []; ch.weapons[i] = { id: v, magic: slot.magic || 0 }; ch.weapons = ch.weapons.filter((w, j) => w && (w.id || j < 3)); rerender(); }),
            U.select([0, 1, 2, 3].map((n) => ({ value: n, label: n ? '+' + n + ' (магическое)' : 'обычное' })), slot.magic || 0, (v) => { if (ch.weapons[i]) { ch.weapons[i].magic = Number(v); rerender(); } })));
        }
        eq.appendChild(el('label', {}, 'Зелья лечения'));
        eq.appendChild(el('input', { type: 'number', min: 0, max: 10, value: ch.potions, onchange: (e) => { ch.potions = U.clamp(Number(e.target.value) || 0, 0, 10); updSheet(); } }));
        form.appendChild(eq);
        form.appendChild(el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, '* — нет владения (без бонуса мастерства). Универсальное оружие без щита доступно и в хвате двумя руками.'));

        // ---- Заклинания ----
        const maxL = D.maxSpellLevel(cls, ch.level);
        const sub = race.subraces.find((s) => s.id === ch.subrace);
        if (cls.caster && (cls.caster.type !== 'half' || ch.level >= 2)) {
          const lim = Char.spellLimits(ch);
          const avail = D.classSpells(cls.id, maxL);
          const chosen = new Set(ch.spells || []);
          const nC = avail.filter((s) => s.level === 0 && chosen.has(s.id)).length;
          const nS = avail.filter((s) => s.level > 0 && chosen.has(s.id)).length;
          form.appendChild(el('div', { class: 'section-title' }, 'Заклинания — заговоры ' + nC + '/' + lim.cantrips + ', заклинания ' + nS + '/' + lim.spells + ' (макс. ' + maxL + ' уровень)'));
          const sgr = el('div', { class: 'check-grid' });
          for (const sp of avail) {
            const isC = sp.level === 0;
            const checked = chosen.has(sp.id);
            const full = isC ? nC >= lim.cantrips : nS >= lim.spells;
            sgr.appendChild(el('label', { title: sp.desc, class: !checked && full ? 'disabled' : '' },
              el('input', { type: 'checkbox', checked, disabled: !checked && full, onchange: (e) => { if (e.target.checked) ch.spells.push(sp.id); else ch.spells = ch.spells.filter((x) => x !== sp.id); rerender(); } }),
              el('span', {}, sp.name), el('span', { class: 'spell-tag' }, isC ? 'заговор' : sp.level + ' ур.'), sp.concentration ? el('span', { class: 'spell-tag', title: 'Концентрация' }, 'К') : null));
          }
          form.appendChild(sgr);
          form.appendChild(el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'Наведите на заклинание, чтобы увидеть описание. Полные тексты — на dnd.su.'));
        } else if (sub && sub.cantrip) {
          form.appendChild(el('div', { class: 'section-title' }, 'Расовый заговор'));
          form.appendChild(el('div', { class: 'muted' }, D.spell(sub.cantrip).name + ' (Интеллект)'));
        }

        // ---- Заметки ----
        form.appendChild(el('div', { class: 'section-title' }, 'Заметки'));
        form.appendChild(el('textarea', { value: ch.notes || '', placeholder: 'Предыстория, характер, снаряжение…', oninput: (e) => (ch.notes = e.target.value) }));
        form.appendChild(el('div', { style: { height: '30px' } }));
      }

      function assignByPriority(vals) {
        const cls = D.cls(ch.cls);
        const sorted = vals.slice().sort((a, b) => b - a);
        const base = {};
        cls.primary.forEach((ab, i) => (base[ab] = sorted[i]));
        return base;
      }
      function rollStats() {
        ch.rollPool = Array.from({ length: 6 }, () => D.Dice.abilityRoll());
        ch.base = assignByPriority(ch.rollPool.map((r) => r.total));
      }
      function trimAsi() {
        const total = D.asiCount(D.cls(ch.cls), ch.level) * 2;
        let used = U.sum(Object.values(ch.asi));
        for (const ab of R.ABILITIES.slice().reverse()) {
          while (used > total && ch.asi[ab] > 0) {
            ch.asi[ab]--;
            used--;
          }
        }
      }
      function trimSpells() {
        const cls = D.cls(ch.cls);
        if (!cls.caster) return [];
        const maxL = D.maxSpellLevel(cls, ch.level);
        const keep = (ch.spells || []).filter((id) => {
          const s = D.spell(id);
          return s && s.classes.includes(cls.id) && s.level <= maxL;
        });
        return keep.length ? keep : Char.defaultSpells(ch);
      }

      const save = () => {
        if (!ch.name.trim()) {
          UI.toast('Введите имя персонажа', 'bad');
          return;
        }
        if (ch.method === 'pointbuy' && Char.pointBuyCost(ch.base) > Char.POINTS) {
          UI.toast('Потрачено больше 27 очков', 'bad');
          return;
        }
        ch.weapons = (ch.weapons || []).filter((w) => w && w.id);
        delete ch.rollPool;
        Store.saveCharacter(ch);
        UI.toast('Персонаж «' + ch.name + '» сохранён');
        D.App.show(back);
      };

      rootEl.appendChild(el('div', { class: 'screen' },
        el('div', { class: 'topbar' },
          el('button', { onclick: () => D.App.show(back) }, '← Назад'),
          el('h2', {}, isNew ? '✨ Новый персонаж' : '✏️ ' + ch.name),
          el('div', { class: 'spacer' }),
          el('button', { onclick: () => { const cls = D.cls(ch.cls); ch.method = 'standard'; Char.applyClassDefaults(ch); rerender(); UI.toast('Характеристики и снаряжение по умолчанию для класса «' + cls.name + '»'); } }, '↺ По умолчанию'),
          el('button', { class: 'primary', onclick: save }, '💾 Сохранить')),
        el('div', { class: 'creator' }, form, sheetBox)));
      build();
      updSheet();
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
