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
    else avatar.appendChild(UI.icon(s.race.icon));
    const sheet = el('div', { class: 'sheet' });
    sheet.appendChild(el('div', { class: 'head' }, avatar, el('div', {},
      el('h2', { style: { margin: 0 } }, ch.name || 'Без имени'),
      el('div', { class: 'muted' }, (s.sub ? s.sub.name : s.race.name) + ' · ' + s.cls.name + ' ' + s.level + ' ур.' + (s.sc ? ' · ' + s.sc.name : '')),
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
      const bonus = Char.bonusSpells(ch);
      for (const id of s.spells) {
        const sp = D.spell(id);
        (byLevel[sp.level] = byLevel[sp.level] || []).push(sp.name + (bonus.includes(id) ? ' ★' : '') + (sc.innate && sc.innate[id] != null ? ' (арканум)' : ''));
      }
      for (const lv of Object.keys(byLevel).sort()) sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, lv === '0' ? 'Заговоры: ' : lv + ' уровень: '), byLevel[lv].join(', ')));
      if (bonus.length) sheet.appendChild(el('div', { class: 'muted', style: { fontSize: '11px' } }, '★ — всегда подготовлены (' + (s.sc ? s.sc.name : 'подкласс') + ')'));
    }
    const res = s.res || {};
    const resList = Object.keys(res).filter((k) => res[k].name).map((k) => res[k].name + (res[k].max >= 99 ? ' (∞)' : ': ' + res[k].max));
    if (resList.length) {
      sheet.appendChild(el('div', { class: 'section-title' }, 'Ресурсы'));
      sheet.appendChild(el('div', { class: 'row wrap', style: { gap: '4px' } }, resList.map((t) => el('span', { class: 'chip' }, t))));
    }
    sheet.appendChild(el('div', { class: 'section-title' }, 'Умения'));
    const feats = Char.features(ch).sort((a, b) => a.lv - b.lv);
    for (const f of feats) sheet.appendChild(el('div', { class: 'feat' + (f.sub ? ' sub' : '') }, el('b', {}, f.name + ' (' + f.lv + (f.sub ? ', ' + f.sub : '') + '). '), f.desc));
    if (s.ancestry) sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, 'Оружие дыхания. '), (s.ancestry.shape === 'line' ? 'Линия 5×30 фт.' : 'Конус 15 фт.') + ', ' + R.DAMAGE_SHORT[s.ancestry.type] + ', спасбросок ' + R.ABILITY_GEN[s.ancestry.save] + ' Сл ' + (8 + s.mods.con + s.prof) + '.'));
    sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, 'Раса. '), s.race.desc + (s.sub ? ' ' + s.sub.desc : '')));
    const arts = (ch.artifacts || []).map((id) => id && D.EQUIP.item(id)).filter(Boolean);
    if (arts.length) {
      sheet.appendChild(el('div', { class: 'section-title' }, 'Артефакты'));
      for (const it of arts) sheet.appendChild(el('div', { class: 'feat row', style: { alignItems: 'flex-start' } }, UI.icon(it.icon, { cls: 'feat-ico' }), el('div', {}, el('b', {}, it.name + '. '), it.desc || '')));
    }
    if (ch.potions) sheet.appendChild(el('div', { class: 'feat' }, el('b', {}, 'Снаряжение. '), 'Зелья лечения: ' + ch.potions + ' (2к4+2).'));
    return sheet;
  };

  /* ---------- Свои доспехи, оружие и артефакты ---------- */
  const DMG_OPTS = () => Object.keys(R.DAMAGE_TYPES).map((k) => ({ value: k, label: R.DAMAGE_TYPES[k] }));
  const numIn = (v, min, max, w) => el('input', { type: 'number', value: v, min, max, style: { width: (w || 70) + 'px' } });

  D.armorEditor = function (base) {
    const a = Object.assign({ id: '', name: 'Мой доспех', cat: 'medium', base: 14, dexMax: 2, str: 0, stealthDis: false, magic: 0 }, base || {});
    const name = el('input', { value: a.name, style: { width: '100%' } });
    const cat = U.select([{ value: 'light', label: 'Лёгкий' }, { value: 'medium', label: 'Средний' }, { value: 'heavy', label: 'Тяжёлый' }], a.cat, (v) => {
      dex.value = v === 'light' ? '99' : v === 'medium' ? '2' : '0';
    });
    const ac = numIn(a.base, 1, 30);
    const dex = U.select([{ value: '99', label: '+ модификатор Ловкости' }, { value: '2', label: '+ Ловкость (макс. 2)' }, { value: '0', label: 'без Ловкости' }], String(a.dexMax >= 99 ? 99 : a.dexMax));
    const str = numIn(a.str || 0, 0, 20);
    const stealth = el('input', { type: 'checkbox', checked: !!a.stealthDis });
    const magic = U.select([0, 1, 2, 3].map((n) => ({ value: n, label: n ? '+' + n : 'нет' })), a.magic || 0);
    const body = el('div', { class: 'form-grid', style: { width: '480px', maxWidth: '86vw' } },
      el('label', {}, 'Название'), name,
      el('label', {}, 'Тип доспеха'), cat,
      el('label', {}, 'Базовый КД'), ac,
      el('label', {}, 'Ловкость'), dex,
      el('label', {}, 'Требование Силы'), el('div', { class: 'row' }, str, el('span', { class: 'muted' }, '0 — нет; иначе −10 фт. скорости при меньшей Силе')),
      el('label', {}, 'Помеха Скрытности'), el('div', {}, stealth),
      el('label', {}, 'Магический бонус'), magic);
    return UI.modal({ title: base ? 'Изменить доспех' : 'Новый доспех', body, buttons: [{ label: 'Отмена', value: false }, { label: '💾 Сохранить', value: true, cls: 'primary' }], backdropClose: false }).promise.then((ok) => {
      if (!ok) return null;
      const out = {
        id: a.id || U.uid('carm'), name: name.value.trim() || 'Доспех', cat: cat.value, base: U.clamp(Number(ac.value) || 10, 1, 30), dexMax: Number(dex.value),
        str: Number(str.value) || 0, stealthDis: stealth.checked, magic: Number(magic.value) || 0, custom: true,
      };
      D.EQUIP.saveCustom('armor', out);
      return out;
    });
  };

  D.weaponEditor = function (base) {
    const w = Object.assign({ id: '', name: 'Моё оружие', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'slashing', props: {}, range: [80, 320], magic: 0, extra: null, anyProf: false }, U.deepClone(base || {}));
    w.props = w.props || {};
    const name = el('input', { value: w.name, style: { width: '100%' } });
    const cat = U.select([{ value: 'simple', label: 'Простое' }, { value: 'martial', label: 'Воинское' }], w.cat);
    const kind = U.select([{ value: 'melee', label: 'Рукопашное' }, { value: 'ranged', label: 'Дальнобойное' }], w.kind);
    const dmg = el('input', { value: w.dmg, style: { width: '80px' }, placeholder: '1d8' });
    const type = U.select(DMG_OPTS(), w.type);
    const pr = {};
    const propDefs = [['finesse', 'Фехтовальное'], ['light', 'Лёгкое'], ['heavy', 'Тяжёлое'], ['twoHanded', 'Двуручное'], ['reach', 'Досягаемость 10 фт.'], ['ammo', 'Боеприпасы'], ['loading', 'Перезарядка']];
    const propsBox = el('div', { class: 'check-grid' }, propDefs.map(([k, l]) => el('label', {}, (pr[k] = el('input', { type: 'checkbox', checked: !!w.props[k] })), l)));
    const thrown = el('input', { type: 'checkbox', checked: !!w.props.thrown });
    const thrownR = el('input', { value: (w.props.thrown || [20, 60]).join('/'), style: { width: '80px' } });
    const vers = el('input', { value: w.props.versatile || '', style: { width: '80px' }, placeholder: 'напр. 1d10' });
    const range = el('input', { value: (w.range || [80, 320]).join('/'), style: { width: '90px' } });
    const exDice = el('input', { value: (w.extra && w.extra.dice) || '', style: { width: '80px' }, placeholder: 'напр. 1d6' });
    const exType = U.select(DMG_OPTS(), (w.extra && w.extra.type) || 'fire');
    const magic = U.select([0, 1, 2, 3].map((n) => ({ value: n, label: n ? '+' + n : 'нет' })), w.magic || 0);
    const any = el('input', { type: 'checkbox', checked: !!w.anyProf });
    const body = el('div', { style: { width: '600px', maxWidth: '88vw' } },
      el('div', { class: 'form-grid' },
        el('label', {}, 'Название'), name,
        el('label', {}, 'Категория'), el('div', { class: 'row' }, cat, kind),
        el('label', {}, 'Урон'), el('div', { class: 'row' }, dmg, type),
        el('label', {}, 'Дальность'), el('div', { class: 'row' }, range, el('span', { class: 'muted' }, 'для дальнобойного: нормальная/максимальная, фт.')),
        el('label', {}, 'Метательное'), el('div', { class: 'row' }, thrown, thrownR, el('span', { class: 'muted' }, 'фт.')),
        el('label', {}, 'Универсальное'), el('div', { class: 'row' }, vers, el('span', { class: 'muted' }, 'кость урона двумя руками')),
        el('label', {}, 'Доп. урон'), el('div', { class: 'row' }, exDice, exType),
        el('label', {}, 'Магический бонус'), magic,
        el('label', {}, 'Владение'), el('label', {}, any, ' владеет любой персонаж')),
      el('div', { class: 'section-title' }, 'Свойства'), propsBox);
    return UI.modal({ title: base ? 'Изменить оружие' : 'Новое оружие', body, buttons: [{ label: 'Отмена', value: false }, { label: '💾 Сохранить', value: true, cls: 'primary' }], backdropClose: false }).promise.then((ok) => {
      if (!ok) return null;
      const validDice = (s) => /^\d*d\d+([+-]\d+)?$|^\d+$/.test(String(s).trim());
      const props = {};
      for (const [k] of propDefs) if (pr[k].checked) props[k] = true;
      if (thrown.checked) {
        const t = thrownR.value.split('/').map(Number);
        props.thrown = [t[0] || 20, t[1] || (t[0] || 20) * 3];
      }
      if (vers.value.trim() && validDice(vers.value)) props.versatile = vers.value.trim();
      const r = range.value.split('/').map(Number);
      const out = {
        id: w.id || U.uid('cwpn'), name: name.value.trim() || 'Оружие', cat: cat.value, kind: kind.value, dmg: validDice(dmg.value) ? dmg.value.trim() : '1d6', type: type.value,
        props, magic: Number(magic.value) || 0, anyProf: any.checked, custom: true,
      };
      if (out.kind === 'ranged') out.range = [r[0] || 80, r[1] || (r[0] || 80) * 4];
      if (exDice.value.trim() && validDice(exDice.value)) out.extra = { dice: exDice.value.trim(), type: exType.value };
      D.EQUIP.saveCustom('weapons', out);
      return out;
    });
  };

  D.itemEditor = function (base) {
    const it = Object.assign({ id: '', name: 'Мой артефакт', icon: 'gem-pendant', desc: '', mods: {} }, U.deepClone(base || {}));
    const m = it.mods || {};
    const name = el('input', { value: it.name, style: { width: '100%' } });
    const icon = UI.iconField(it.icon);
    const desc = el('textarea', { placeholder: 'Описание (необязательно)', style: { minHeight: '50px' } }, it.desc || '');
    const numDefs = [['ac', 'КД'], ['saves', 'Спасброски'], ['attack', 'Атака оружием'], ['damage', 'Урон оружием'], ['spellAttack', 'Атака заклинаниями'], ['spellDC', 'Сл заклинаний'], ['hp', 'Макс. хитов'], ['initiative', 'Инициатива'], ['speed', 'Скорость, фт.'], ['checks', 'Проверки навыков']];
    const nums = {};
    const numBox = el('div', { class: 'form-grid', style: { gridTemplateColumns: '150px 80px 150px 80px' } });
    for (const [k, l] of numDefs) numBox.append(el('label', {}, l), (nums[k] = numIn(m[k] || 0, -10, 50)));
    const resEls = {};
    const resBox = el('div', { class: 'row wrap', style: { gap: '4px 10px' } }, Object.keys(R.DAMAGE_TYPES).map((t) => el('label', { style: { fontSize: '12px' } }, (resEls[t] = el('input', { type: 'checkbox', checked: (m.resist || []).includes(t) })), R.DAMAGE_SHORT[t])));
    const condEls = {};
    const condBox = el('div', { class: 'row wrap', style: { gap: '4px 10px' } }, ['charmed', 'frightened', 'poisoned', 'paralyzed', 'stunned', 'blinded', 'deafened', 'prone', 'restrained', 'grappled'].map((cid) => el('label', { style: { fontSize: '12px' } }, (condEls[cid] = el('input', { type: 'checkbox', checked: (m.condImmune || []).includes(cid) })), R.CONDITIONS[cid].name)));
    const setAb = U.select([{ value: '', label: '— нет —' }].concat(R.ABILITIES.map((a) => ({ value: a, label: R.ABILITY_NAMES[a] }))), Object.keys(m.abilSet || {})[0] || '');
    const setVal = numIn(Object.values(m.abilSet || {})[0] || 19, 3, 30);
    const disp = el('input', { type: 'checkbox', checked: !!m.displacement });
    const body = el('div', { style: { width: '640px', maxWidth: '88vw' } },
      el('div', { class: 'form-grid' }, el('label', {}, 'Название'), name, el('label', {}, 'Значок'), icon.el, el('label', {}, 'Описание'), desc),
      el('div', { class: 'section-title' }, 'Бонусы'), numBox,
      el('div', { class: 'row', style: { marginTop: '6px' } }, el('span', {}, 'Устанавливает характеристику'), setAb, el('span', {}, 'равной'), setVal),
      el('label', { style: { display: 'block', marginTop: '6px' } }, disp, ' Ускользание: атаки по владельцу с помехой, пока по нему не попадут'),
      el('div', { class: 'section-title' }, 'Сопротивление урону'), resBox,
      el('div', { class: 'section-title' }, 'Иммунитет к состояниям'), condBox);
    return UI.modal({ title: base ? 'Изменить артефакт' : 'Новый артефакт', body, buttons: [{ label: 'Отмена', value: false }, { label: '💾 Сохранить', value: true, cls: 'primary' }], backdropClose: false }).promise.then((ok) => {
      if (!ok) return null;
      const mods = {};
      for (const [k] of numDefs) if (Number(nums[k].value)) mods[k] = Number(nums[k].value);
      const resist = Object.keys(resEls).filter((t) => resEls[t].checked);
      if (resist.length) mods.resist = resist;
      const ci = Object.keys(condEls).filter((t) => condEls[t].checked);
      if (ci.length) mods.condImmune = ci;
      if (setAb.value) mods.abilSet = { [setAb.value]: U.clamp(Number(setVal.value) || 19, 3, 30) };
      if (disp.checked) mods.displacement = true;
      const parts = [];
      for (const [k, l] of numDefs) if (mods[k]) parts.push(l + ' ' + U.fmtMod(mods[k]));
      if (resist.length) parts.push('сопротивление: ' + resist.map((t) => R.DAMAGE_SHORT[t]).join(', '));
      if (ci.length) parts.push('иммунитет: ' + ci.map((c) => R.CONDITIONS[c].name.toLowerCase()).join(', '));
      if (mods.abilSet) parts.push(R.ABILITY_NAMES[setAb.value] + ' = ' + mods.abilSet[setAb.value]);
      if (mods.displacement) parts.push('ускользание');
      const out = { id: it.id || U.uid('citem'), name: name.value.trim() || 'Артефакт', icon: icon.get() || 'gem-pendant', mods, desc: desc.value.trim() || parts.join('; ') + '.', custom: true };
      D.EQUIP.saveCustom('items', out);
      return out;
    });
  };

  D.deleteCustomEquip = function (kind, id) {
    const key = { armor: 'customArmor', weapons: 'customWeapons', items: 'customItems' }[kind];
    U.store.set(key, U.store.get(key, []).filter((x) => x.id !== id));
  };

  /* Пользовательское снаряжение персонажа — для экспорта вместе с ним */
  D.charCustomGear = function (list) {
    const out = { armor: [], weapons: [], items: [] };
    for (const ch of list) {
      const a = D.EQUIP.custom.armor().find((x) => x.id === ch.armor);
      if (a && !out.armor.includes(a)) out.armor.push(a);
      for (const w of ch.weapons || []) {
        const x = w && D.EQUIP.custom.weapons().find((y) => y.id === w.id);
        if (x && !out.weapons.includes(x)) out.weapons.push(x);
      }
      for (const id of ch.artifacts || []) {
        const x = id && D.EQUIP.custom.items().find((y) => y.id === id);
        if (x && !out.items.includes(x)) out.items.push(x);
      }
    }
    return out;
  };
  D.importCustomGear = function (g) {
    if (!g) return;
    (g.armor || []).forEach((x) => x && x.id && D.EQUIP.saveCustom('armor', x));
    (g.weapons || []).forEach((x) => x && x.id && D.EQUIP.saveCustom('weapons', x));
    (g.items || []).forEach((x) => x && x.id && D.EQUIP.saveCustom('items', x));
  };

  /* Выбор из плиток с иконками (раса, класс) */
  function iconGrid(items, value, onPick) {
    return el('div', { class: 'icon-grid' }, items.map((it) => el('div', { class: 'opt' + (it.value === value ? ' sel' : ''), title: it.title || '', onclick: () => onPick(it.value) }, UI.icon(it.icon), el('span', {}, it.label))));
  }

  /* ---------- Случайная партия ---------- */
  const NAMES = {
    human: ['Алрик', 'Бренна', 'Дарен', 'Ирина', 'Корвин', 'Лиана', 'Мартин', 'Ольга', 'Ратибор', 'Север', 'Эдмунд', 'Ярослава'],
    dwarf: ['Торгрим', 'Брунхильда', 'Дагнар', 'Гимдис', 'Барин', 'Хельга', 'Торин', 'Эйтри', 'Рургар', 'Катрин'],
    elf: ['Элариэль', 'Аэлар', 'Лиатриэль', 'Таэлин', 'Сильвана', 'Эрдан', 'Наиэль', 'Фаэлар', 'Миялиэ', 'Каэлит'],
    halfling: ['Шнырь', 'Мерри', 'Лидда', 'Пиппин', 'Розочка', 'Кэлли', 'Бинго', 'Тобиас', 'Верна', 'Кондрат'],
    dragonborn: ['Арджхан', 'Бирит', 'Кава', 'Медраш', 'Сора', 'Торинн', 'Хескан', 'Даар', 'Нала', 'Рохар'],
    gnome: ['Бимпноттин', 'Нисси', 'Фонкин', 'Вики', 'Зук', 'Орла', 'Глим', 'Танкель', 'Эллиуин', 'Роондар'],
    halfelf: ['Каэлен', 'Мирабель', 'Тирион', 'Аделина', 'Лорен', 'Сарин', 'Даэрон', 'Иветта', 'Риан', 'Эльвин'],
    halforc: ['Грумш', 'Шара', 'Догрок', 'Вола', 'Краск', 'Энгонг', 'Хольг', 'Мурна', 'Ронк', 'Сутха'],
    tiefling: ['Акменос', 'Лерисса', 'Дамакос', 'Нимия', 'Скаманд', 'Орианна', 'Мордай', 'Каллиста', 'Эфира', 'Зевиэль'],
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  function randomHero(clsId, level, usedNames, color) {
    const ch = Char.blank();
    const race = pick(D.RACES);
    ch.race = race.id;
    ch.subrace = race.subraces.length ? pick(race.subraces).id : '';
    if (race.ancestry) ch.ancestry = pick(Object.keys(race.ancestry));
    ch.cls = clsId;
    const cls = D.cls(clsId);
    ch.subclass = pick(cls.subclasses).id;
    ch.level = level;
    const pool = (NAMES[race.id] || NAMES.human).filter((n) => !usedNames.includes(n));
    ch.name = pick(pool.length ? pool : NAMES.human);
    usedNames.push(ch.name);
    ch.color = color;
    Char.applyClassDefaults(ch);
    ch.totem = pick(Object.keys(Char.TOTEMS));
    ch.companion = pick(Char.COMPANIONS.filter((id) => D.monster(id)));
    if (cls.id === 'sorcerer' && ch.subclass === 'draconic') ch.ancestry = pick(Object.keys(D.DRAGON_ANCESTRY));
    // Характеристики: стандартный набор или бросок 4к6, по приоритету класса
    let vals = Char.STANDARD_ARRAY.slice();
    if (Math.random() < 0.5) {
      for (let t = 0; t < 30; t++) {
        const r = Array.from({ length: 6 }, () => D.Dice.abilityRoll().total).sort((a, b) => b - a);
        if (r[5] >= 8 && r.reduce((x, y) => x + y, 0) >= 70) {
          vals = r;
          break;
        }
      }
    }
    const order = cls.primary.slice(0, 2).concat(shuffle(cls.primary.slice(2)));
    ch.base = {};
    order.forEach((ab, i) => (ch.base[ab] = vals[i]));
    ch.method = 'manual';
    if (race.chooseBonus) ch.raceChoice = order.filter((ab) => ab !== 'cha').slice(0, race.chooseBonus);
    // Увеличения характеристик — в основные
    ch.asi = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    let pts = D.asiCount(cls, level) * 2;
    for (const ab of order) {
      while (pts > 0 && Char.finalAbilities(ch)[ab] < 20) {
        ch.asi[ab]++;
        pts--;
      }
    }
    // Навыки
    const list = cls.skills.list === 'any' ? Object.keys(R.SKILLS) : cls.skills.list;
    ch.skills = shuffle(list).slice(0, cls.skills.count);
    if (cls.fightingStyleAt) ch.fightingStyle = pick(cls.id === 'paladin' ? ['defense', 'dueling', 'gwf'] : cls.id === 'ranger' ? ['archery', 'defense', 'dueling', 'twf'] : Object.keys(D.FIGHTING_STYLES));
    // Заклинания: случайные из доступных
    if (Char.casterOf(ch)) {
      const lim = Char.spellLimits(ch);
      const all = Char.spellList(ch);
      const bonus = Char.bonusSpells(ch);
      const c0 = shuffle(all.filter((s) => s.level === 0)).slice(0, lim.cantrips);
      const maxL = D.maxSpellLevel(cls, level, ch.subclass);
      const lv = shuffle(all.filter((s) => s.level > 0 && !bonus.includes(s.id))).sort((a, b) => (b.level >= maxL - 1 ? 1 : 0) - (a.level >= maxL - 1 ? 1 : 0)).slice(0, lim.spells);
      ch.spells = c0.concat(lv).map((s) => s.id);
    }
    // Магическое снаряжение на высоких уровнях
    if (level >= 5) {
      const items = shuffle(D.EQUIP.ITEMS);
      ch.artifacts = [items[0].id, level >= 11 ? items[1].id : '', level >= 17 ? items[2].id : ''];
      if (level >= 9 && ch.weapons[0]) ch.weapons[0].magic = level >= 15 ? 2 : 1;
    }
    ch.potions = 1 + Math.floor(Math.random() * 3);
    return ch;
  }
  function randomParty() {
    const level = 1 + Math.floor(Math.random() * 10);
    const classes = shuffle(D.CLASSES.map((c) => c.id)).slice(0, 4);
    const colors = shuffle(Char.COLORS);
    const used = Store.characters().map((c) => c.name);
    return { level, list: classes.map((id, i) => randomHero(id, level, used, colors[i])) };
  }
  D.randomParty = randomParty;

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
          else av.appendChild(UI.icon(s.race.icon));
          cards.appendChild(el('div', { class: 'card', onclick: () => D.App.show('creator', { ch }) },
            av,
            el('div', { class: 'grow' },
              el('h3', {}, ch.name),
              el('div', { class: 'meta' }, (s.sub ? s.sub.name : s.race.name) + ', ' + s.cls.name + ' ' + s.level + ' ур.' + (s.sc ? ' (' + s.sc.name + ')' : '')),
              ch.player ? el('div', { class: 'meta' }, 'Игрок: ' + ch.player) : null,
              el('div', { class: 'stats' }, el('span', {}, '❤️ ' + s.hp), el('span', {}, '🛡️ ' + s.ac), el('span', {}, '👣 ' + s.speed))),
            el('div', { class: 'actions' },
              el('button', { class: 'small', title: 'Копировать', onclick: (e) => { e.stopPropagation(); const c2 = U.deepClone(ch); c2.id = U.uid('pc'); c2.name += ' (копия)'; Store.saveCharacter(c2); redraw(); } }, '📋'),
              el('button', { class: 'small', title: 'Экспорт', onclick: (e) => { e.stopPropagation(); U.downloadJSON(ch.name + '.dndchar.json', { type: 'dnd-characters', list: [ch], gear: D.charCustomGear([ch]) }); } }, '⬇'),
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
          D.importCustomGear(data.gear);
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
          el('button', { title: 'Четыре случайных героя: расы, классы, подклассы, имена и характеристики', onclick: () => { const p = randomParty(); p.list.forEach((c) => Store.saveCharacter(c)); redraw(); UI.toast('Случайная партия ' + p.level + ' уровня: ' + p.list.map((c) => c.name + ' (' + D.cls(c.cls).name.toLowerCase() + ')').join(', ')); } }, '🎲 Готовая партия'),
          el('button', { onclick: importChars }, '⬆ Импорт'),
          el('button', { onclick: () => { const list = Store.characters(); U.downloadJSON('персонажи.dndchar.json', { type: 'dnd-characters', list, gear: D.charCustomGear(list) }); } }, '⬇ Экспорт всех'),
          el('button', { class: 'danger', onclick: async () => { const n = Store.characters().length; if (!n) return UI.toast('Список персонажей пуст'); if (await UI.confirm('Удалить всех персонажей (' + n + ')? Это действие нельзя отменить.', 'Удалить всех')) { Store.characters().forEach((c) => Store.deleteCharacter(c.id)); redraw(); UI.toast('Все персонажи удалены'); } } }, '🗑 Удалить всех'),
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
          el('label', {}, 'Уровень'), U.select(Array.from({ length: Char.MAX_LEVEL }, (_, i) => ({ value: i + 1, label: i + 1 + ' уровень' })), ch.level, (v) => { ch.level = Number(v); trimAsi(); ch.spells = trimSpells(); rerender(); }),
          el('label', {}, 'Жетон'), portraitBtns);
        form.appendChild(grid);

        // ---- Раса ----
        form.appendChild(el('div', { class: 'section-title' }, 'Раса'));
        form.appendChild(iconGrid(D.RACES.map((r) => ({ value: r.id, label: r.name, icon: r.icon, title: r.desc })), ch.race, (v) => { ch.race = v; fixSubrace(); ch.raceChoice = []; rerender(); }));
        const raceGrid = el('div', { class: 'form-grid', style: { marginTop: '6px' } },
          race.subraces.length ? el('label', {}, 'Подраса') : null,
          race.subraces.length ? U.select(race.subraces.map((x) => ({ value: x.id, label: x.name })), ch.subrace, (v) => { ch.subrace = v; rerender(); }) : null,
          race.ancestry ? el('label', {}, 'Драконий предок') : null,
          race.ancestry ? U.select(Object.keys(race.ancestry).map((k) => ({ value: k, label: race.ancestry[k].name + ' (' + R.DAMAGE_SHORT[race.ancestry[k].type] + ', ' + (race.ancestry[k].shape === 'line' ? 'линия' : 'конус') + ')' })), ch.ancestry, (v) => { ch.ancestry = v; rerender(); }) : null);
        if (raceGrid.children.length) form.appendChild(raceGrid);

        // ---- Класс и подкласс ----
        form.appendChild(el('div', { class: 'section-title' }, 'Класс'));
        form.appendChild(iconGrid(D.CLASSES.map((c) => ({ value: c.id, label: c.name, icon: c.icon, title: 'Кость хитов к' + c.hitDie })), ch.cls, (v) => { ch.cls = v; ch.subclass = ''; Char.applyClassDefaults(ch); rerender(); }));
        if (!D.subclass(cls, ch.subclass)) ch.subclass = cls.subclasses[0].id;
        const scObj = D.subclass(cls, ch.subclass);
        const subGrid = el('div', { class: 'form-grid', style: { marginTop: '6px' } },
          el('label', {}, cls.subclassTitle || 'Подкласс'),
          el('div', { class: 'row' }, U.select(cls.subclasses.map((x) => ({ value: x.id, label: x.name })), ch.subclass, (v) => { ch.subclass = v; ch.spells = trimSpells(); rerender(); }),
            ch.level < (cls.subclassAt || 3) ? el('span', { class: 'muted' }, 'действует с ' + (cls.subclassAt || 3) + ' уровня') : null));
        if (cls.id === 'barbarian' && ch.subclass === 'totem') subGrid.append(el('label', {}, 'Тотемный дух'), U.select(Object.keys(Char.TOTEMS).map((k) => ({ value: k, label: Char.TOTEMS[k] })), ch.totem || 'bear', (v) => { ch.totem = v; updSheet(); }));
        if (cls.id === 'ranger' && ch.subclass === 'beastmaster') subGrid.append(el('label', {}, 'Спутник-зверь'), U.select(Char.COMPANIONS.filter((id) => D.monster(id)).map((id) => ({ value: id, label: D.monster(id).name + ' (ПО ' + D.monster(id).cr + ')' })), ch.companion || 'wolf', (v) => { ch.companion = v; updSheet(); }));
        if (cls.id === 'sorcerer' && ch.subclass === 'draconic') subGrid.append(el('label', {}, 'Драконий предок'), U.select(Object.keys(D.DRAGON_ANCESTRY).map((k) => ({ value: k, label: D.DRAGON_ANCESTRY[k].name + ' (' + R.DAMAGE_SHORT[D.DRAGON_ANCESTRY[k].type] + ')' })), ch.ancestry || 'red', (v) => { ch.ancestry = v; updSheet(); }));
        form.appendChild(subGrid);
        if (scObj) form.appendChild(el('div', { class: 'muted', style: { fontSize: '12px', margin: '4px 0 0 152px' } }, scObj.features.map((f) => f.lv + ': ' + f.name).join(' · ')));

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
        const NEW = '__new__';
        const acTxt = (a) => (a.cat !== 'none' ? ' — КД ' + a.base + (a.dexMax >= 99 ? ' + ЛОВ' : a.dexMax > 0 ? ' + ЛОВ (макс. 2)' : '') + (a.str ? ', СИЛ ' + a.str : '') + (a.magic ? ', +' + a.magic : '') : '');
        const armorOpts = D.EQUIP.allArmor().filter((a) => Char.armorProficient(ch, a)).map((a) => ({ value: a.id, label: (a.custom ? '★ ' : '') + a.name + acTxt(a) }));
        armorOpts.push({ value: NEW, label: '+ Добавить новый доспех…' });
        if (!armorOpts.find((o) => o.value === ch.armor)) ch.armor = 'none';
        const curArmor = D.EQUIP.armor(ch.armor);
        const editBtns = (kind, obj, after) => obj && obj.custom ? [
          el('button', { class: 'small', title: 'Изменить', onclick: async () => { const r = await D[kind + 'Editor'](obj); if (r) after(r); rerender(); } }, '✏️'),
          el('button', { class: 'small danger', title: 'Удалить из списка', onclick: async () => { if (await UI.confirm('Удалить «' + obj.name + '» из списка своего снаряжения?')) { D.deleteCustomEquip(kind === 'armor' ? 'armor' : kind === 'weapon' ? 'weapons' : 'items', obj.id); after(null); rerender(); } } }, '🗑'),
        ] : null;
        const eq = el('div', { class: 'form-grid' },
          el('label', {}, 'Доспех'), el('div', { class: 'row' },
            U.select(armorOpts, ch.armor, async (v) => {
              if (v === NEW) {
                const a = await D.armorEditor(null);
                if (a) {
                  ch.armor = a.id;
                  if (!Char.armorProficient(ch, a)) UI.toast('Нет владения доспехом этого типа — он не появится в списке', 'bad');
                }
              } else ch.armor = v;
              rerender();
            }),
            curArmor && curArmor.cat !== 'none' ? U.select([0, 1, 2, 3].map((n) => ({ value: n, label: n ? '+' + n : 'обычный' })), ch.armorMagic || 0, (v) => { ch.armorMagic = Number(v); rerender(); }) : null,
            editBtns('armor', curArmor, (r) => (ch.armor = r ? r.id : 'none'))),
          el('label', {}, 'Щит (+2 КД)'), el('div', {}, Char.shieldProficient(ch) ? el('input', { type: 'checkbox', checked: ch.shield, onchange: (e) => { ch.shield = e.target.checked; rerender(); } }) : el('span', { class: 'muted' }, 'нет владения щитами')));
        const wOpts = [{ value: '', label: '— нет —' }].concat(D.EQUIP.allWeapons().map((w) => ({ value: w.id, label: (Char.weaponProficient(ch, w) ? '' : '* ') + (w.custom ? '★ ' : '') + w.name + ' (' + w.dmg + (w.extra ? ' + ' + w.extra.dice : '') + (w.magic ? ', +' + w.magic : '') + ')' })), [{ value: NEW, label: '+ Добавить новое оружие…' }]);
        ch.weapons = (ch.weapons || []).filter((w) => w && D.EQUIP.weapon(w.id));
        for (let i = 0; i < 3; i++) {
          const slot = ch.weapons[i] || { id: '', magic: 0 };
          const wObj = slot.id && D.EQUIP.weapon(slot.id);
          const setW = (id) => {
            const list = ch.weapons.slice();
            if (id) list[i] = { id, magic: slot.magic || 0 };
            else list.splice(i, 1);
            ch.weapons = list.filter((w) => w && w.id);
          };
          eq.appendChild(el('label', {}, 'Оружие ' + (i + 1)));
          eq.appendChild(el('div', { class: 'row' },
            U.select(wOpts, slot.id, async (v) => {
              if (v === NEW) {
                const w = await D.weaponEditor(null);
                if (w) setW(w.id);
              } else setW(v);
              rerender();
            }),
            slot.id ? U.select([0, 1, 2, 3].map((n) => ({ value: n, label: n ? '+' + n + ' (магическое)' : 'обычное' })), slot.magic || 0, (v) => { if (ch.weapons[i]) { ch.weapons[i].magic = Number(v); rerender(); } }) : null,
            editBtns('weapon', wObj, (r) => setW(r ? r.id : ''))));
        }
        const itemOpts = [{ value: '', label: '— нет —' }].concat(D.EQUIP.allItems().map((it) => ({ value: it.id, label: (it.custom ? '★ ' : '') + it.name })), [{ value: NEW, label: '+ Создать свой артефакт…' }]);
        ch.artifacts = (ch.artifacts || []).concat(['', '', '']).slice(0, 3).map((id) => (id && D.EQUIP.item(id) ? id : ''));
        for (let i = 0; i < 3; i++) {
          const it = ch.artifacts[i] && D.EQUIP.item(ch.artifacts[i]);
          eq.appendChild(el('label', {}, 'Артефакт ' + (i + 1)));
          eq.appendChild(el('div', { class: 'row' },
            it ? UI.icon(it.icon, { cls: 'eq-ico' }) : null,
            U.select(itemOpts, ch.artifacts[i], async (v) => {
              if (v === NEW) {
                const n = await D.itemEditor(null);
                if (n) ch.artifacts[i] = n.id;
              } else ch.artifacts[i] = v;
              rerender();
            }, { title: it ? it.desc : '' }),
            it ? el('span', { class: 'muted', style: { fontSize: '12px' } }, it.desc) : null,
            editBtns('item', it, (r) => (ch.artifacts[i] = r ? r.id : ''))));
        }
        eq.appendChild(el('label', {}, 'Зелья лечения'));
        eq.appendChild(el('input', { type: 'number', min: 0, max: 10, value: ch.potions, onchange: (e) => { ch.potions = U.clamp(Number(e.target.value) || 0, 0, 10); updSheet(); } }));
        form.appendChild(eq);
        form.appendChild(el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, '* — нет владения (без бонуса мастерства). ★ — своё снаряжение. Универсальное оружие без щита доступно и в хвате двумя руками.'));

        // ---- Заклинания ----
        const cs = Char.casterOf(ch);
        const maxL = D.maxSpellLevel(cls, ch.level, ch.subclass);
        const sub = race.subraces.find((x) => x.id === ch.subrace);
        if (cs && (cs.type !== 'half' || ch.level >= 2)) {
          const lim = Char.spellLimits(ch);
          const bonus = Char.bonusSpells(ch);
          const avail = Char.spellList(ch).filter((x) => !bonus.includes(x.id));
          const chosen = new Set(ch.spells || []);
          const nC = avail.filter((x) => x.level === 0 && chosen.has(x.id)).length;
          const nS = avail.filter((x) => x.level > 0 && chosen.has(x.id)).length;
          form.appendChild(el('div', { class: 'section-title' }, 'Заклинания — заговоры ' + nC + '/' + lim.cantrips + ', заклинания ' + nS + '/' + lim.spells + ' (макс. ' + maxL + ' уровень)'));
          if (bonus.length) form.appendChild(el('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '4px' } }, 'Всегда подготовлены (' + (scObj ? scObj.name : '') + '): ' + bonus.map((id) => D.spell(id).name).join(', ')));
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
          form.appendChild(el('div', { class: 'muted', style: { fontSize: '12px', marginTop: '4px' } }, 'Наведите на заклинание, чтобы увидеть описание.' + (cs.type === 'pact' && ch.level >= 11 ? ' Заклинания 6–9 уровня колдуна (таинственный арканум) — по разу за бой без ячейки.' : '')));
        } else if (sub && sub.cantrip) {
          form.appendChild(el('div', { class: 'section-title' }, 'Расовый заговор'));
          form.appendChild(el('div', { class: 'muted' }, D.spell(sub.cantrip).name + ' (Интеллект)'));
        }
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
        if (!Char.casterOf(ch)) return [];
        const ok = new Set(Char.spellList(ch).map((x) => x.id));
        const keep = (ch.spells || []).filter((id) => ok.has(id));
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
