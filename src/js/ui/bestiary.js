/* Бестиарий: список монстров и статблоки */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const R = D.R;
  const el = U.el;

  const SKILL_NAMES = R.SKILLS;

  /* ---------- Свои монстры ---------- */
  D.customMonsters = (U.store.get('monsters', []) || []).filter((m) => m && m.id && m.abil);
  D.allMonsters = () => D.MONSTERS.concat(D.customMonsters);
  function saveCustom() {
    U.store.set('monsters', D.customMonsters);
  }
  const DIE_BY_SIZE = { tiny: 4, small: 6, medium: 8, large: 10, huge: 12, gargantuan: 20 };
  function hdFor(hp, size, con) {
    const die = DIE_BY_SIZE[size] || 8;
    const cm = U.mod(con);
    const n = Math.max(1, Math.round(hp / (die / 2 + 0.5 + cm)));
    const b = n * cm;
    return n + 'd' + die + (b > 0 ? '+' + b : b < 0 ? String(b) : '');
  }

  D.monsterEditor = function (base) {
    const m = base ? U.deepClone(base) : {
      id: '', name: 'Новый монстр', en: 'Homebrew', size: 'medium', type: 'monstrosity', align: 'нейтральный', icon: 'horned-reptile',
      ac: 13, acNote: 'природный доспех', hp: 22, hd: '4d8+4', speed: { walk: 30 }, abil: { str: 14, dex: 12, con: 13, int: 6, wis: 10, cha: 7 },
      senses: 'пассивное Восприятие 10', lang: '—', cr: '1', flags: {}, traits: [],
      actions: [{ id: 'a1', name: 'Удар', type: 'mw', toHit: 4, reach: 5, dmg: [{ dice: '1d8+2', type: 'slashing' }] }],
    };
    m.flags = m.flags || {};
    const isCopy = !!base && !base.custom;
    if (isCopy) {
      m.name = base.name + ' (своя версия)';
    }
    const inp = (v, attrs) => el('input', Object.assign({ value: v == null ? '' : v }, attrs || {}));
    const num = (v, min, max) => el('input', { type: 'number', value: v, min: min == null ? 0 : min, max: max == null ? 999 : max, style: { width: '64px' } });
    const f = {
      name: inp(m.name, { style: { width: '100%' } }), icon: D.UI.iconField(m.icon),
      size: U.select(Object.keys(R.SIZES).map((k) => ({ value: k, label: R.SIZES[k].name })), m.size),
      type: U.select(Object.keys(R.CREATURE_TYPES).map((k) => ({ value: k, label: R.CREATURE_TYPES[k] })), m.type),
      ac: num(m.ac, 1, 30), acNote: inp(m.acNote || ''), hp: num(m.hp, 1, 999),
      walk: num(m.speed.walk || 0), fly: num(m.speed.fly || 0), swim: num(m.speed.swim || 0),
      cr: U.select(Object.keys(R.CR_XP).map((k) => ({ value: k, label: 'ПО ' + k + ' (' + R.CR_XP[k] + ' XP)' })), m.cr),
      lang: inp(m.lang || ''), senses: inp(m.senses || '', { style: { width: '100%' } }),
    };
    const ab = {};
    for (const a of R.ABILITIES) ab[a] = num(m.abil[a], 1, 30);
    const flagDefs = [
      ['packTactics', 'Тактика стаи'], ['undeadFortitude', 'Стойкость нежити'], ['aggressive', 'Агрессивный (бонусное перемещение)'],
      ['nimbleEscape', 'Шустрый побег (бонусный Отход)'], ['magicResistance', 'Сопротивление магии'], ['brave', 'Храбрый'], ['reckless', 'Безрассудство'],
    ];
    const flagEls = {};
    const flagsBox = el('div', { class: 'check-grid' }, flagDefs.map(([k, label]) => el('label', {}, (flagEls[k] = el('input', { type: 'checkbox', checked: !!m.flags[k] })), label)));
    const regen = num((m.flags.regeneration && m.flags.regeneration.amount) || 0, 0, 50);
    const legres = num(m.flags.legendaryResistance || 0, 0, 5);
    const dmgCheck = (list) => {
      const box = el('div', { class: 'row wrap', style: { gap: '4px 10px' } });
      const els = {};
      for (const t of Object.keys(R.DAMAGE_TYPES)) box.appendChild(el('label', { style: { fontSize: '12px' } }, (els[t] = el('input', { type: 'checkbox', checked: (list || []).includes(t) })), R.DAMAGE_SHORT[t]));
      return { box, get: () => Object.keys(els).filter((t) => els[t].checked) };
    };
    const resist = dmgCheck(m.resist);
    const immune = dmgCheck(m.immune);
    const vuln = dmgCheck(m.vuln);

    // Атаки
    const multi = (m.actions || []).find((a) => a.type === 'multi');
    const weaponActs = (m.actions || []).filter((a) => ['mw', 'rw', 'mrw'].includes(a.type));
    const otherActs = (m.actions || []).filter((a) => !['mw', 'rw', 'mrw', 'multi'].includes(a.type));
    const rows = [];
    const atkBox = el('div', { class: 'col', style: { gap: '6px' } });
    const typeOpts = Object.keys(R.DAMAGE_TYPES).map((k) => ({ value: k, label: R.DAMAGE_SHORT[k] }));
    function addRow(a) {
      a = a || { id: 'a' + (rows.length + 1), name: 'Атака', type: 'mw', toHit: 4, reach: 5, range: [30, 120], dmg: [{ dice: '1d6+2', type: 'slashing' }] };
      const cnt = multi ? multi.options[0].filter((x) => x === a.id).length : rows.length === 0 ? 0 : 0;
      const r = {
        src: a,
        name: inp(a.name, { style: { width: '150px' } }),
        type: U.select([{ value: 'mw', label: 'ближняя' }, { value: 'rw', label: 'дальняя' }, { value: 'mrw', label: 'метательная' }], a.type),
        toHit: num(a.toHit, -5, 30),
        reach: num(a.reach || 5, 5, 30),
        range: inp(a.range ? a.range.join('/') : '30/120', { style: { width: '70px' } }),
        dice: inp(a.dmg[0] ? a.dmg[0].dice : '1d6', { style: { width: '70px' } }),
        dtype: U.select(typeOpts, a.dmg[0] ? a.dmg[0].type : 'slashing'),
        dice2: inp(a.dmg[1] ? a.dmg[1].dice : '', { style: { width: '60px' }, placeholder: 'доп.' }),
        dtype2: U.select(typeOpts, a.dmg[1] ? a.dmg[1].type : 'fire'),
        times: num(cnt, 0, 6),
      };
      rows.push(r);
      const row = el('div', { class: 'row wrap', style: { gap: '4px', background: 'var(--panel2)', padding: '6px', borderRadius: '6px' } },
        r.name, r.type, el('span', { class: 'muted' }, 'атака'), r.toHit, el('span', { class: 'muted' }, 'досяг.'), r.reach, el('span', { class: 'muted' }, 'дист.'), r.range,
        el('span', { class: 'muted' }, 'урон'), r.dice, r.dtype, el('span', { class: 'muted' }, '+'), r.dice2, r.dtype2,
        el('span', { class: 'muted', title: 'Сколько раз атака входит в Мультиатаку (0 — не входит)' }, '× в мультиатаке'), r.times,
        el('button', { class: 'small ghost', onclick: () => { row.remove(); rows.splice(rows.indexOf(r), 1); } }, '✕'));
      atkBox.appendChild(row);
    }
    weaponActs.forEach(addRow);
    if (!weaponActs.length) addRow();
    const notes = el('textarea', { placeholder: 'Особенности (будут показаны в статблоке)' }, (m.traits || []).filter((t) => t.custom).map((t) => t.desc).join('\n'));

    const body = el('div', { style: { width: '900px', maxWidth: '88vw' } },
      el('div', { class: 'form-grid', style: { gridTemplateColumns: '120px 1fr 120px 1fr' } },
        el('label', {}, 'Название'), f.name, el('label', {}, 'Значок'), f.icon.el,
        el('label', {}, 'Размер'), f.size, el('label', {}, 'Тип'), f.type,
        el('label', {}, 'КД'), el('div', { class: 'row' }, f.ac, f.acNote), el('label', {}, 'Хиты'), f.hp,
        el('label', {}, 'Скорость'), el('div', { class: 'row' }, f.walk, el('span', { class: 'muted' }, 'полёт'), f.fly, el('span', { class: 'muted' }, 'плав.'), f.swim),
        el('label', {}, 'Опасность'), f.cr,
        el('label', {}, 'Чувства'), f.senses, el('label', {}, 'Языки'), f.lang),
      el('div', { class: 'section-title' }, 'Характеристики'),
      el('div', { class: 'row wrap' }, R.ABILITIES.map((a) => el('span', { class: 'row' }, el('b', {}, R.ABILITY_SHORT[a]), ab[a]))),
      el('div', { class: 'section-title' }, 'Атаки'),
      atkBox,
      el('button', { class: 'small', style: { marginTop: '6px' }, onclick: () => addRow() }, '+ Атака'),
      otherActs.length ? el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'Сохранятся особые действия оригинала: ' + otherActs.map((a) => a.name).join(', ')) : null,
      el('div', { class: 'section-title' }, 'Особенности'),
      flagsBox,
      el('div', { class: 'row', style: { marginTop: '6px' } }, el('span', {}, 'Регенерация (хитов в начале хода, огонь/кислота блокирует)'), regen, el('span', {}, 'Легендарное сопротивление'), legres),
      el('div', { class: 'section-title' }, 'Сопротивление урону'), resist.box,
      el('div', { class: 'section-title' }, 'Иммунитет к урону'), immune.box,
      el('div', { class: 'section-title' }, 'Уязвимость к урону'), vuln.box,
      el('div', { class: 'section-title' }, 'Описание особенностей'), notes);

    return UI_modal(body, base && base.custom ? 'Изменить монстра' : 'Свой монстр').then((ok) => {
      if (!ok) return null;
      const out = isCopy || !base ? Object.assign(U.deepClone(m), { id: U.uid('mon'), custom: true }) : Object.assign(m, { custom: true });
      out.name = f.name.value.trim() || 'Безымянный';
      out.icon = f.icon.get() || 'horned-reptile';
      out.en = out.en || 'Homebrew';
      out.size = f.size.value;
      out.type = f.type.value;
      out.tags = out.type === 'humanoid' ? ['humanoid'] : [out.type];
      out.ac = Number(f.ac.value) || 10;
      out.acNote = f.acNote.value;
      out.hp = Math.max(1, Number(f.hp.value) || 1);
      for (const a of R.ABILITIES) out.abil[a] = U.clamp(Number(ab[a].value) || 10, 1, 30);
      out.hd = hdFor(out.hp, out.size, out.abil.con);
      out.speed = { walk: Number(f.walk.value) || 0 };
      if (Number(f.fly.value)) out.speed.fly = Number(f.fly.value);
      if (Number(f.swim.value)) out.speed.swim = Number(f.swim.value);
      out.cr = f.cr.value;
      out.xp = R.CR_XP[out.cr] || 0;
      out.prof = R.crProf(out.cr);
      out.senses = f.senses.value || 'пассивное Восприятие ' + (10 + U.mod(out.abil.wis));
      out.lang = f.lang.value || '—';
      out.resist = resist.get();
      out.immune = immune.get();
      out.vuln = vuln.get();
      delete out.resistText;
      delete out.immuneText;
      delete out.vulnText;
      const flags = Object.assign({}, out.flags);
      for (const [k] of flagDefs) {
        if (flagEls[k].checked) flags[k] = true;
        else delete flags[k];
      }
      if (Number(regen.value)) flags.regeneration = { amount: Number(regen.value), blockedBy: ['acid', 'fire'] };
      else delete flags.regeneration;
      if (Number(legres.value)) flags.legendaryResistance = Number(legres.value);
      else delete flags.legendaryResistance;
      out.flags = flags;
      const acts = rows.map((r, i) => {
        const a = Object.assign({}, r.src);
        a.id = a.id && !a.id.startsWith('a') ? a.id : 'a' + (i + 1);
        a.name = r.name.value || 'Атака';
        a.type = r.type.value;
        a.toHit = Number(r.toHit.value) || 0;
        a.reach = Number(r.reach.value) || 5;
        const rg = String(r.range.value).split('/').map(Number);
        a.range = [rg[0] || 30, rg[1] || (rg[0] || 30) * 4];
        a.dmg = [{ dice: r.dice.value || '1d4', type: r.dtype.value }];
        if (r.dice2.value.trim()) a.dmg.push({ dice: r.dice2.value.trim(), type: r.dtype2.value });
        if (a.type === 'mw') delete a.range;
        return { a, times: Number(r.times.value) || 0 };
      });
      const multiIds = [];
      acts.forEach(({ a, times }) => {
        for (let i = 0; i < times; i++) multiIds.push(a.id);
      });
      const newActs = [];
      if (multiIds.length > 1) newActs.push({ id: 'multiattack', name: 'Мультиатака', type: 'multi', options: [multiIds].concat(multi ? multi.options.slice(1) : []), desc: 'Совершает ' + multiIds.length + ' ' + U.plural(multiIds.length, 'атаку', 'атаки', 'атак') + ': ' + multiIds.map((id) => acts.find((x) => x.a.id === id).a.name.toLowerCase()).join(', ') + '.' });
      out.actions = newActs.concat(acts.map((x) => x.a), otherActs);
      const flagTraits = [];
      if (flags.packTactics) flagTraits.push({ name: 'Тактика стаи', desc: 'Преимущество на атаку, если в пределах 5 фт. от цели есть дееспособный союзник.' });
      if (flags.undeadFortitude) flagTraits.push({ name: 'Стойкость нежити', desc: 'При падении хитов до 0 — спасбросок Телосложения Сл 5 + урон, при успехе остаётся 1 хит.' });
      if (flags.aggressive) flagTraits.push({ name: 'Агрессивный', desc: 'Бонусным действием перемещается к врагу.' });
      if (flags.nimbleEscape) flagTraits.push({ name: 'Шустрый побег', desc: 'Бонусным действием Отход или Засада.' });
      if (flags.magicResistance) flagTraits.push({ name: 'Сопротивление магии', desc: 'Преимущество на спасброски от заклинаний.' });
      if (flags.regeneration) flagTraits.push({ name: 'Регенерация', desc: 'Восстанавливает ' + flags.regeneration.amount + ' хитов в начале хода, если не получил урон огнём или кислотой.' });
      if (flags.legendaryResistance) flagTraits.push({ name: 'Легендарное сопротивление (' + flags.legendaryResistance + '/день)', desc: 'Проваленный спасбросок можно сделать успешным.' });
      const custom = notes.value.trim() ? notes.value.trim().split('\n').filter(Boolean).map((t) => ({ name: 'Особенность', desc: t, custom: true })) : [];
      const orig = (base && !base.custom ? base.traits : []).filter((t) => !t.custom);
      out.traits = (isCopy ? orig : []).concat(isCopy ? [] : flagTraits, custom);
      const idx = D.customMonsters.findIndex((x) => x.id === out.id);
      if (idx >= 0) D.customMonsters[idx] = out;
      else D.customMonsters.push(out);
      saveCustom();
      return out;
    });
  };

  function UI_modal(body, title) {
    return D.UI.modal({ title, body, buttons: [{ label: 'Отмена', value: false }, { label: '💾 Сохранить', value: true, cls: 'primary' }], backdropClose: false }).promise;
  }

  D.deleteCustomMonster = function (id) {
    D.customMonsters = D.customMonsters.filter((m) => m.id !== id);
    saveCustom();
  };

  D.renderStatblock = function (m) {
    const sb = el('div', { class: 'statblock' });
    sb.appendChild(el('div', { class: 'token' }, D.UI.icon(m.icon, { color: '#9a6a30', px: 128 })));
    sb.appendChild(el('h2', {}, m.name));
    sb.appendChild(el('div', { class: 'en' }, m.en || ''));
    sb.appendChild(el('div', { class: 'type' }, R.SIZES[m.size].name + ' ' + (R.CREATURE_TYPES[m.type] || m.type).toLowerCase() + (m.subtype ? ' (' + m.subtype + ')' : '') + ', ' + (m.align || 'без мировоззрения')));
    sb.appendChild(el('div', { class: 'rule' }));
    const sp = m.speed || {};
    const speedTxt = [(sp.walk || 0) + ' фт.'].concat(sp.climb ? ['лазая ' + sp.climb + ' фт.'] : [], sp.fly ? ['летая ' + sp.fly + ' фт.' + (sp.hover ? ' (парит)' : '')] : [], sp.swim ? ['плавая ' + sp.swim + ' фт.'] : [], sp.burrow ? ['копая ' + sp.burrow + ' фт.'] : []).join(', ');
    const prop = (k, v) => el('div', { class: 'prop' }, el('b', {}, k + ' '), v);
    sb.appendChild(prop('Класс Доспеха', m.ac + (m.acNote ? ' (' + m.acNote + ')' : '')));
    sb.appendChild(prop('Хиты', m.hp + (m.hd ? ' (' + m.hd.replace('d', 'к').replace('+', ' + ').replace('-', ' − ') + ')' : '')));
    sb.appendChild(prop('Скорость', speedTxt));
    sb.appendChild(el('div', { class: 'rule' }));
    sb.appendChild(el('div', { class: 'abil' }, R.ABILITIES.map((ab) => el('div', {}, el('b', {}, R.ABILITY_SHORT[ab]), m.abil[ab] + ' (' + U.fmtMod(U.mod(m.abil[ab])) + ')'))));
    sb.appendChild(el('div', { class: 'rule' }));
    if (m.saves && Object.keys(m.saves).length) sb.appendChild(prop('Спасброски', Object.keys(m.saves).map((k) => R.ABILITY_SHORT[k] + ' ' + U.fmtMod(m.saves[k])).join(', ')));
    if (m.skills && Object.keys(m.skills).length) sb.appendChild(prop('Навыки', Object.keys(m.skills).filter((k) => SKILL_NAMES[k]).map((k) => SKILL_NAMES[k].name + ' ' + U.fmtMod(m.skills[k])).join(', ')));
    const dmgList = (arr, extra) => (arr || []).map((t) => R.DAMAGE_TYPES[t] || t).concat(extra || []).join(', ');
    const nonmag = 'дробящий, колющий и рубящий урон от немагических атак';
    const vulnTxt = m.vulnText != null ? m.vulnText : dmgList(m.vuln);
    const resTxt = m.resistText != null ? m.resistText : dmgList(m.resist, m.resistNonmagical ? [nonmag] : []);
    const immTxt = m.immuneText != null ? m.immuneText : dmgList(m.immune, m.immuneNonmagical ? [nonmag] : []);
    if (vulnTxt) sb.appendChild(prop('Уязвимость к урону', vulnTxt));
    if (resTxt) sb.appendChild(prop('Сопротивление урону', resTxt));
    if (immTxt) sb.appendChild(prop('Иммунитет к урону', immTxt));
    if (m.condImmune && m.condImmune.length) sb.appendChild(prop('Иммунитет к состояниям', m.condImmune.filter((c) => R.CONDITIONS[c]).map((c) => R.CONDITIONS[c].name.toLowerCase()).join(', ')));
    sb.appendChild(prop('Чувства', m.senses || '—'));
    sb.appendChild(prop('Языки', m.lang || '—'));
    sb.appendChild(prop('Опасность', m.cr + ' (' + (m.xp || 0).toLocaleString('ru-RU') + ' опыта)' + '   Бонус мастерства ' + U.fmtMod(m.prof || R.crProf(m.cr))));
    sb.appendChild(el('div', { class: 'rule' }));
    for (const t of m.traits || []) sb.appendChild(el('p', {}, el('b', {}, el('i', {}, t.name + '. ')), t.desc));
    if (m.spellcasting) {
      const known = (m.spellcasting.spellsEn || []).concat(Object.keys(m.spellcasting.innate || {})).map((en) => D.spellByEn(en)).filter(Boolean);
      if (known.length) sb.appendChild(el('p', { class: 'muted', style: { fontSize: '12px' } }, 'В бою доступны заклинания: ' + known.map((x) => x.name).join(', ') + '.'));
    }
    sb.appendChild(el('h4', {}, 'Действия'));
    for (const a of m.actions || []) sb.appendChild(el('p', {}, el('b', {}, el('i', {}, a.name + (a.recharge ? ' (перезарядка ' + (a.recharge < 6 ? a.recharge + '–6' : '6') + ')' : a.perDay ? ' (' + a.perDay + '/день)' : '') + '. ')), D.describeAction(a)));
    if (m.reactions && m.reactions.length) {
      sb.appendChild(el('h4', {}, 'Реакции'));
      for (const r of m.reactions) sb.appendChild(el('p', {}, el('b', {}, el('i', {}, r.name + '. ')), r.desc));
    }
    if (m.legendary && m.legendary.length) {
      sb.appendChild(el('h4', {}, 'Легендарные действия'));
      const n = m.legendaryCount || 3;
      sb.appendChild(el('p', {}, 'Может совершить ' + n + ' ' + U.plural(n, 'легендарное действие', 'легендарных действия', 'легендарных действий') + ', выбирая из представленных ниже вариантов. За один раз можно использовать только одно легендарное действие, и только в конце хода другого существа. Потраченные легендарные действия восстанавливаются в начале его хода.'));
      for (const l of m.legendary) sb.appendChild(el('p', {}, el('b', {}, el('i', {}, l.name + '. ')), l.desc || '', l.kind === 'info' ? el('span', { class: 'muted', style: { fontSize: '11px' } }, ' (описательное)') : null));
    }
    return sb;
  };

  /* Список монстров с фильтрами. onPick(m) — при выборе */
  D.monsterBrowser = function (opts) {
    opts = opts || {};
    const state = { q: '', type: '', cr: '', sel: opts.selected || D.MONSTERS[0].id };
    const all = () => D.allMonsters();
    const listEl = el('div', { class: 'list' });
    const detail = el('div', { style: { overflowY: 'auto', flex: 1, padding: '16px', minHeight: 0 } });
    const search = el('input', { placeholder: '🔍 Поиск (рус./англ.)', style: { width: '100%' }, oninput: () => { state.q = search.value.toLowerCase(); drawList(); } });
    const typeSel = U.select([{ value: '', label: 'Все типы' }].concat(Object.keys(R.CREATURE_TYPES).filter((t) => all().some((m) => m.type === t)).map((t) => ({ value: t, label: R.CREATURE_TYPES[t] }))), '', (v) => { state.type = v; drawList(); });
    const crSel = U.select([
      { value: '', label: 'Любая опасность' },
      { value: '0-0.5', label: 'ПО 0 – 1/2' },
      { value: '1-2', label: 'ПО 1 – 2' },
      { value: '3-5', label: 'ПО 3 – 5' },
      { value: '6-10', label: 'ПО 6 – 10' },
      { value: '11-16', label: 'ПО 11 – 16' },
      { value: '17-30', label: 'ПО 17+' },
    ], '', (v) => { state.cr = v; drawList(); });
    function filtered() {
      return all().filter((m) => {
        if (state.q && !(m.name.toLowerCase().includes(state.q) || (m.en || '').toLowerCase().includes(state.q))) return false;
        if (state.type && m.type !== state.type) return false;
        if (state.cr) {
          const [a, b] = state.cr.split('-').map(Number);
          const v = R.crValue(m.cr);
          if (v < a || v > b) return false;
        }
        return true;
      }).sort((a, b) => R.crValue(a.cr) - R.crValue(b.cr) || a.name.localeCompare(b.name, 'ru'));
    }
    let itemEls = new Map();
    function markSel() {
      for (const [id, node] of itemEls) node.classList.toggle('sel', id === state.sel);
    }
    function drawList() {
      U.clear(listEl);
      itemEls = new Map();
      const frag = document.createDocumentFragment();
      for (const m of filtered()) {
        const node = el('div', { class: 'list-item' + (m.id === state.sel ? ' sel' : ''), onclick: () => { if (state.sel === m.id) return; state.sel = m.id; markSel(); drawDetail(); }, ondblclick: () => opts.onPick && opts.onPick(m) },
          el('span', { class: 'ico' }, D.UI.icon(m.icon, { px: 48 })), el('div', { class: 'grow' }, el('div', {}, m.name), el('div', { class: 'muted', style: { fontSize: '11px' } }, R.CREATURE_TYPES[m.type] + (m.custom ? ' · свой' : ''))), el('span', { class: 'cr' }, 'ПО ' + m.cr));
        itemEls.set(m.id, node);
        frag.appendChild(node);
      }
      listEl.appendChild(frag);
    }
    function drawDetail() {
      U.clear(detail);
      detail.scrollTop = 0;
      const m = D.monster(state.sel);
      if (!m) return;
      if (opts.actions) detail.appendChild(opts.actions(m));
      detail.appendChild(D.renderStatblock(m));
    }
    drawList();
    drawDetail();
    const left = el('div', { class: 'sidebar', style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '300px' } }, search, el('div', { class: 'row' }, typeSel, crSel), el('div', { style: { overflowY: 'auto', flex: 1 } }, listEl));
    return {
      el: el('div', { class: 'body', style: { minHeight: 0 } }, left, el('div', { style: { display: 'flex', flex: 1, minWidth: 0 } }, detail)),
      get: () => D.monster(state.sel),
      redraw: drawDetail,
      select: (id) => { state.sel = id; if (itemEls.has(id)) markSel(); else drawList(); drawDetail(); },
      refresh: () => { drawList(); drawDetail(); },
    };
  };

  D.App.register('bestiary', {
    render(rootEl) {
      let br;
      br = D.monsterBrowser({
        actions: (m) => el('div', { class: 'row', style: { marginBottom: '10px' } },
          el('button', { class: 'small', onclick: async () => { const r = await D.monsterEditor(m); if (r) br.select(r.id); } }, m.custom ? '✏️ Изменить' : '📋 Создать свою версию'),
          m.custom ? el('button', { class: 'small danger', onclick: async () => { if (await D.UI.confirm('Удалить монстра «' + m.name + '»?')) { D.deleteCustomMonster(m.id); br.select(D.MONSTERS[0].id); } } }, '🗑 Удалить') : null,
          m.custom ? el('button', { class: 'small', onclick: () => U.downloadJSON(m.name + '.dndmonster.json', { type: 'dnd-monster', monster: m }) }, '⬇ Экспорт') : null),
      });
      rootEl.appendChild(el('div', { class: 'screen' },
        el('div', { class: 'topbar' }, el('button', { onclick: () => D.App.show('menu') }, '← Меню'), el('h2', {}, '📖 Бестиарий'), el('span', { class: 'muted' }, D.MONSTERS.length + ' существ SRD 5.1' + (D.customMonsters.length ? ' + ' + D.customMonsters.length + ' своих' : '')), el('div', { class: 'spacer' }),
          el('button', { class: 'primary', onclick: async () => { const r = await D.monsterEditor(null); if (r) br.select(r.id); } }, '+ Свой монстр'),
          el('button', { onclick: async () => {
            const f = await U.pickFile('.json');
            if (!f) return;
            try {
              const data = JSON.parse(f.data);
              const m = data.monster || data;
              if (!m.abil || !m.actions) throw new Error('bad');
              m.id = U.uid('mon');
              m.custom = true;
              m.flags = m.flags || {};
              m.traits = m.traits || [];
              m.xp = R.CR_XP[m.cr] || 0;
              m.prof = R.crProf(m.cr);
              D.customMonsters.push(m);
              U.store.set('monsters', D.customMonsters);
              br.select(m.id);
              D.UI.toast('Монстр импортирован');
            } catch (e) {
              D.UI.toast('Не удалось прочитать файл', 'bad');
            }
          } }, '⬆ Импорт'),
          el('a', { href: 'https://dnd.su/bestiary/', target: '_blank' }, 'dnd.su ↗')),
        br.el));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
