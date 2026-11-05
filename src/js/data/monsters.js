/* Бестиарий: полный SRD 5.1 (334 существа, CC-BY-4.0), перевод по терминологии dnd.su.
   Данные создаются tools/srd/convert.py → srd-monsters.js. Здесь — нормализация и вспомогательные функции. */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const M = (D.SRD_MONSTERS || []).map((m) => {
    m.flags = m.flags || {};
    m.traits = m.traits || [];
    m.actions = m.actions || [];
    m.resist = m.resist || [];
    m.immune = m.immune || [];
    m.vuln = m.vuln || [];
    m.condImmune = m.condImmune || [];
    m.xp = m.xp != null ? m.xp : D.R.CR_XP[m.cr] || 0;
    m.prof = m.prof || D.R.crProf(m.cr);
    m.custom = false;
    m.srd = true;
    return m;
  });

  /* Старые идентификаторы (версия 1.0) → новые */
  const ALIAS = {
    vampire: 'vampire-vampire',
    giantrat: 'giant-rat', banditcaptain: 'bandit-captain', animatedarmor: 'animated-armor', blackbear: 'black-bear', brownbear: 'brown-bear',
    direwolf: 'dire-wolf', giantspider: 'giant-spider', whitewyrmling: 'white-dragon-wyrmling', greenwyrmling: 'green-dragon-wyrmling',
    blackwyrmling: 'black-dragon-wyrmling', bluewyrmling: 'blue-dragon-wyrmling', redwyrmling: 'red-dragon-wyrmling', hellhound: 'hell-hound',
    hillgiant: 'hill-giant', trex: 'tyrannosaurus-rex', youngreddragon: 'young-red-dragon', adultreddragon: 'adult-red-dragon',
  };

  D.MONSTERS = M;
  D.MONSTER_ALIAS = ALIAS;
  D.monster = (id) => {
    const k = ALIAS[id] || id;
    return M.find((m) => m.id === k) || (D.customMonsters || []).find((m) => m.id === id);
  };

  D.dmgPhrase = function (type) {
    const phys = { bludgeoning: 'дробящего урона', piercing: 'колющего урона', slashing: 'рубящего урона' };
    return phys[type] || 'урона ' + D.R.DAMAGE_TYPES[type];
  };

  const ruDice = (s) => String(s).replace(/(\d+)d(\d+)/g, '$1к$2').replace(/\+/g, ' + ').replace(/-/g, ' − ');

  /* Текст действия для статблока (для своих монстров генерируется из данных) */
  D.describeAction = function (a) {
    if (a.desc) return a.desc;
    const U = D.U;
    const dmgText = (arr) =>
      arr.map((x) => Math.floor(D.Dice.average(x.dice)) + ' (' + ruDice(x.dice) + ') ' + D.dmgPhrase(x.type)).join(' плюс ');
    if (a.type === 'multi') return 'Совершает за одно действие: ' + a.options.map((o) => o.join(', ')).join(' или ') + '.';
    if (a.type === 'area') {
      const shape = { cone: 'конусом', line: 'линией', sphere: 'сферой', aura: 'вокруг себя' }[a.area.shape] || '';
      return 'Область ' + a.area.size + ' фт. ' + shape + ': спасбросок ' + D.R.ABILITY_GEN[a.save] + ' со Сл ' + a.dc + (a.dmg && a.dmg.length ? ', ' + dmgText(a.dmg) + (a.half ? ' (половина при успехе)' : '') : '') + '.';
    }
    let s = '';
    if (a.type === 'mw') s = 'Рукопашная атака оружием: ' + U.fmtMod(a.toHit) + ' к попаданию, досягаемость ' + (a.reach || 5) + ' фт., одна цель.';
    else if (a.type === 'rw') s = 'Дальнобойная атака оружием: ' + U.fmtMod(a.toHit) + ' к попаданию, дистанция ' + a.range[0] + '/' + a.range[1] + ' фт., одна цель.';
    else if (a.type === 'mrw') s = 'Рукопашная или дальнобойная атака оружием: ' + U.fmtMod(a.toHit) + ' к попаданию, досягаемость ' + (a.reach || 5) + ' фт. или дистанция ' + a.range[0] + '/' + a.range[1] + ' фт., одна цель.';
    if (a.dmg && a.dmg.length) s += ' Попадание: ' + dmgText(a.dmg) + '.';
    return s;
  };
})(typeof window !== 'undefined' ? window : globalThis);
