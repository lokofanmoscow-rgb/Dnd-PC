/* Бестиарий: список монстров и статблоки */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const R = D.R;
  const el = U.el;

  const SKILL_NAMES = R.SKILLS;

  D.renderStatblock = function (m) {
    const sb = el('div', { class: 'statblock' });
    sb.appendChild(el('div', { class: 'token' }, m.icon));
    sb.appendChild(el('h2', {}, m.name));
    sb.appendChild(el('div', { class: 'en' }, m.en || ''));
    sb.appendChild(el('div', { class: 'type' }, R.SIZES[m.size].name + ' ' + (R.CREATURE_TYPES[m.type] || m.type).toLowerCase() + ', ' + m.align));
    sb.appendChild(el('div', { class: 'rule' }));
    const sp = m.speed || {};
    const speedTxt = [sp.walk + ' фт.'].concat(sp.climb ? ['лазая ' + sp.climb + ' фт.'] : [], sp.fly ? ['летая ' + sp.fly + ' фт.'] : [], sp.swim ? ['плавая ' + sp.swim + ' фт.'] : [], sp.burrow ? ['копая ' + sp.burrow + ' фт.'] : []).join(', ');
    const prop = (k, v) => el('div', { class: 'prop' }, el('b', {}, k + ' '), v);
    sb.appendChild(prop('Класс Доспеха', m.ac + (m.acNote ? ' (' + m.acNote + ')' : '')));
    sb.appendChild(prop('Хиты', m.hp + ' (' + m.hd.replace('+', ' + ').replace('-', ' − ') + ')'));
    sb.appendChild(prop('Скорость', speedTxt));
    sb.appendChild(el('div', { class: 'rule' }));
    sb.appendChild(el('div', { class: 'abil' }, R.ABILITIES.map((ab) => el('div', {}, el('b', {}, R.ABILITY_SHORT[ab]), m.abil[ab] + ' (' + U.fmtMod(U.mod(m.abil[ab])) + ')'))));
    sb.appendChild(el('div', { class: 'rule' }));
    if (m.saves) sb.appendChild(prop('Спасброски', Object.keys(m.saves).map((k) => R.ABILITY_SHORT[k] + ' ' + U.fmtMod(m.saves[k])).join(', ')));
    if (m.skills) sb.appendChild(prop('Навыки', Object.keys(m.skills).map((k) => SKILL_NAMES[k].name + ' ' + U.fmtMod(m.skills[k])).join(', ')));
    if (m.vuln && m.vuln.length) sb.appendChild(prop('Уязвимость к урону', m.vuln.map((t) => R.DAMAGE_SHORT[t]).join(', ')));
    if ((m.resist && m.resist.length) || m.resistNonmagical)
      sb.appendChild(prop('Сопротивление урону', (m.resist || []).map((t) => R.DAMAGE_SHORT[t]).concat(m.resistNonmagical ? ['дробящий, колющий и рубящий урон от немагических атак'] : []).join('; ')));
    if (m.immune && m.immune.length) sb.appendChild(prop('Иммунитет к урону', m.immune.map((t) => R.DAMAGE_SHORT[t]).join(', ')));
    if (m.condImmune && m.condImmune.length) sb.appendChild(prop('Иммунитет к состояниям', m.condImmune.map((c) => R.CONDITIONS[c].name.toLowerCase()).join(', ')));
    sb.appendChild(prop('Чувства', m.senses));
    sb.appendChild(prop('Языки', m.lang));
    sb.appendChild(prop('Опасность', m.cr + ' (' + (m.xp || 0).toLocaleString('ru-RU') + ' опыта)' + '   Бонус мастерства ' + U.fmtMod(m.prof)));
    sb.appendChild(el('div', { class: 'rule' }));
    for (const t of m.traits || []) sb.appendChild(el('p', {}, el('b', {}, el('i', {}, t.name + '. ')), t.desc));
    sb.appendChild(el('h4', {}, 'Действия'));
    for (const a of m.actions || []) sb.appendChild(el('p', {}, el('b', {}, el('i', {}, a.name + '. ')), D.describeAction(a)));
    if (m.flags && m.flags.legendaryResistance) sb.appendChild(el('p', { style: { fontSize: '12px', color: '#7a5a3a' } }, 'Легендарные действия в этой версии не используются.'));
    return sb;
  };

  /* Список монстров с фильтрами. onPick(m) — при выборе */
  D.monsterBrowser = function (opts) {
    opts = opts || {};
    const state = { q: '', type: '', cr: '', sel: opts.selected || D.MONSTERS[0].id };
    const listEl = el('div', { class: 'list' });
    const detail = el('div', { style: { overflowY: 'auto', flex: 1, padding: '16px', minHeight: 0 } });
    const search = el('input', { placeholder: '🔍 Поиск (рус./англ.)', style: { width: '100%' }, oninput: () => { state.q = search.value.toLowerCase(); drawList(); } });
    const typeSel = U.select([{ value: '', label: 'Все типы' }].concat(Object.keys(R.CREATURE_TYPES).filter((t) => D.MONSTERS.some((m) => m.type === t)).map((t) => ({ value: t, label: R.CREATURE_TYPES[t] }))), '', (v) => { state.type = v; drawList(); });
    const crSel = U.select([
      { value: '', label: 'Любая опасность' },
      { value: '0-0.5', label: 'ПО 0 – 1/2' },
      { value: '1-2', label: 'ПО 1 – 2' },
      { value: '3-5', label: 'ПО 3 – 5' },
      { value: '6-30', label: 'ПО 6+' },
    ], '', (v) => { state.cr = v; drawList(); });
    function filtered() {
      return D.MONSTERS.filter((m) => {
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
    function drawList() {
      U.clear(listEl);
      for (const m of filtered()) {
        listEl.appendChild(el('div', { class: 'list-item' + (m.id === state.sel ? ' sel' : ''), onclick: () => { state.sel = m.id; drawList(); drawDetail(); }, ondblclick: () => opts.onPick && opts.onPick(m) },
          el('span', { class: 'ico' }, m.icon), el('div', {}, el('div', {}, m.name), el('div', { class: 'muted', style: { fontSize: '11px' } }, R.CREATURE_TYPES[m.type])), el('span', { class: 'cr' }, 'ПО ' + m.cr)));
      }
    }
    function drawDetail() {
      U.clear(detail);
      const m = D.monster(state.sel);
      if (!m) return;
      if (opts.actions) detail.appendChild(opts.actions(m));
      detail.appendChild(D.renderStatblock(m));
    }
    drawList();
    drawDetail();
    const left = el('div', { class: 'sidebar', style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '300px' } }, search, el('div', { class: 'row' }, typeSel, crSel), el('div', { style: { overflowY: 'auto', flex: 1 } }, listEl));
    return { el: el('div', { class: 'body', style: { minHeight: 0 } }, left, el('div', { style: { display: 'flex', flex: 1, minWidth: 0 } }, detail)), get: () => D.monster(state.sel), redraw: drawDetail };
  };

  D.App.register('bestiary', {
    render(rootEl) {
      const br = D.monsterBrowser({});
      rootEl.appendChild(el('div', { class: 'screen' },
        el('div', { class: 'topbar' }, el('button', { onclick: () => D.App.show('menu') }, '← Меню'), el('h2', {}, '📖 Бестиарий'), el('span', { class: 'muted' }, D.MONSTERS.length + ' существ · статблоки SRD 5.1'), el('div', { class: 'spacer' }),
          el('a', { href: 'https://dnd.su/bestiary/', target: '_blank' }, 'Полный бестиарий на dnd.su ↗')),
        br.el));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
