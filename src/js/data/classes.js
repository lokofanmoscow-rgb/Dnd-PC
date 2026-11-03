/* Классы (Книга игрока / SRD), уровни 1–10 */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const FULL = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2]];
  const HALF = [[], [], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2]];
  const PACT = { count: [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2], level: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5] };

  const FIGHTING_STYLES = {
    archery: { name: 'Стрельба', desc: '+2 к броскам атаки дальнобойным оружием.' },
    defense: { name: 'Защита', desc: '+1 к КД, пока вы носите доспех.' },
    dueling: { name: 'Дуэлянт', desc: '+2 к урону, если в руке одно рукопашное оружие и нет другого оружия.' },
    gwf: { name: 'Сражение большим оружием', desc: 'Перебрасываете 1 и 2 на костях урона двуручного/универсального оружия.' },
    twf: { name: 'Сражение двумя оружиями', desc: 'Добавляете модификатор характеристики к урону атаки второй рукой.' },
  };

  const CLASSES = [
    {
      id: 'barbarian', name: 'Варвар', hitDie: 12, icon: '🪓', saves: ['str', 'con'],
      primary: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
      armor: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'],
      skills: { count: 2, list: ['animal', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
      kit: { armor: 'none', shield: false, weapons: ['greataxe', 'handaxe', 'javelin'] },
      subclass: 'Путь берсерка',
      features: [
        { lv: 1, id: 'rage', name: 'Ярость', desc: 'Бонусным действием: преимущество на проверки и спасброски Силы, бонус к урону рукопашных атак Силой, сопротивление дробящему, колющему и рубящему урону. 10 раундов.' },
        { lv: 1, id: 'unarmoredDefense', name: 'Защита без доспехов', desc: 'Без доспеха КД = 10 + мод. ЛОВ + мод. ТЕЛ (щит разрешён).' },
        { lv: 2, id: 'recklessAttack', name: 'Безрассудная атака', desc: 'Первая атака в ход: преимущество на рукопашные атаки Силой, но атаки по вам тоже с преимуществом до вашего следующего хода.' },
        { lv: 2, id: 'dangerSense', name: 'Чувство опасности', desc: 'Преимущество на спасброски Ловкости.' },
        { lv: 3, id: 'frenzy', name: 'Бешенство', desc: 'В ярости можно бонусным действием совершать одну рукопашную атаку оружием.' },
        { lv: 5, id: 'extraAttack', name: 'Дополнительная атака', desc: 'Две атаки за действие Атака.' },
        { lv: 5, id: 'fastMovement', name: 'Быстрое передвижение', desc: '+10 фт. к скорости без тяжёлого доспеха.' },
        { lv: 7, id: 'feralInstinct', name: 'Дикий инстинкт', desc: 'Преимущество на броски инициативы.' },
        { lv: 9, id: 'brutalCritical', name: 'Сильный критический удар', desc: 'Одна дополнительная кость урона при критическом попадании в рукопашной.' },
      ],
    },
    {
      id: 'bard', name: 'Бард', hitDie: 8, icon: '🎻', saves: ['dex', 'cha'],
      primary: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
      armor: ['light'], weapons: ['simple', 'handcrossbow', 'longsword', 'rapier', 'shortsword'],
      skills: { count: 3, list: 'any' },
      kit: { armor: 'leather', shield: false, weapons: ['rapier', 'dagger'] },
      caster: { ability: 'cha', type: 'full', cantrips: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4], known: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14] },
      subclass: 'Коллегия знаний',
      features: [
        { lv: 1, id: 'spellcasting', name: 'Использование заклинаний', desc: 'Заклинательная характеристика — Харизма.' },
        { lv: 1, id: 'bardicInspiration', name: 'Вдохновение барда', desc: 'Бонусным действием даёт союзнику кость вдохновения, которую он добавит к следующему броску атаки или спасброску.' },
        { lv: 2, id: 'jackOfAllTrades', name: 'Мастер на все руки', desc: 'Половина бонуса мастерства к проверкам без владения (включая инициативу).' },
        { lv: 5, id: 'fontOfInspiration', name: 'Источник вдохновения', desc: 'Кость вдохновения — d8.' },
        { lv: 10, id: 'inspirationD10', name: 'Вдохновение d10', desc: 'Кость вдохновения — d10.' },
      ],
    },
    {
      id: 'cleric', name: 'Жрец', hitDie: 8, icon: '✝️', saves: ['wis', 'cha'],
      primary: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
      armor: ['light', 'medium', 'heavy', 'shield'], weapons: ['simple'],
      skills: { count: 2, list: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
      kit: { armor: 'chainmail', shield: true, weapons: ['mace', 'lightcrossbow'] },
      caster: { ability: 'wis', type: 'full', cantrips: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5], prepared: 'level' },
      subclass: 'Домен жизни',
      features: [
        { lv: 1, id: 'spellcasting', name: 'Использование заклинаний', desc: 'Заклинательная характеристика — Мудрость.' },
        { lv: 1, id: 'discipleOfLife', name: 'Поборник жизни', desc: 'Лечащие заклинания восстанавливают дополнительно 2 + уровень заклинания хитов.' },
        { lv: 2, id: 'channelDivinity', name: 'Божественный канал', desc: 'Изгнание нежити или Сохранение жизни (1 раз, с 6 уровня — 2 раза).' },
        { lv: 8, id: 'divineStrike', name: 'Божественный удар', desc: 'Раз в ход +1d8 урона излучением при попадании оружием.' },
      ],
    },
    {
      id: 'druid', name: 'Друид', hitDie: 8, icon: '🌿', saves: ['int', 'wis'],
      primary: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
      armor: ['light', 'medium', 'shield'], weapons: ['club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'scimitar', 'sickle', 'sling', 'spear'],
      skills: { count: 2, list: ['arcana', 'animal', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
      kit: { armor: 'leather', shield: true, weapons: ['scimitar', 'quarterstaff'] },
      caster: { ability: 'wis', type: 'full', cantrips: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4], prepared: 'level' },
      subclass: 'Круг земли',
      features: [
        { lv: 1, id: 'spellcasting', name: 'Использование заклинаний', desc: 'Заклинательная характеристика — Мудрость.' },
      ],
    },
    {
      id: 'fighter', name: 'Воин', hitDie: 10, icon: '⚔️', saves: ['str', 'con'],
      primary: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
      armor: ['light', 'medium', 'heavy', 'shield'], weapons: ['simple', 'martial'],
      skills: { count: 2, list: ['acrobatics', 'animal', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
      kit: { armor: 'chainmail', shield: true, weapons: ['longsword', 'lightcrossbow', 'handaxe'] },
      fightingStyleAt: 1, asi: [4, 6, 8],
      subclass: 'Чемпион',
      features: [
        { lv: 1, id: 'fightingStyle', name: 'Боевой стиль', desc: 'Выберите боевой стиль.' },
        { lv: 1, id: 'secondWind', name: 'Второе дыхание', desc: 'Бонусным действием восстанавливает 1d10 + уровень воина хитов. 1 раз за бой.' },
        { lv: 2, id: 'actionSurge', name: 'Всплеск действий', desc: 'Одно дополнительное действие в ход. 1 раз за бой.' },
        { lv: 3, id: 'improvedCritical', name: 'Улучшенный критический удар', desc: 'Критическое попадание на 19–20.' },
        { lv: 5, id: 'extraAttack', name: 'Дополнительная атака', desc: 'Две атаки за действие Атака.' },
        { lv: 9, id: 'indomitable', name: 'Упорный', desc: 'Можно перебросить проваленный спасбросок. 1 раз за бой.' },
      ],
    },
    {
      id: 'monk', name: 'Монах', hitDie: 8, icon: '🥋', saves: ['str', 'dex'],
      primary: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
      armor: [], weapons: ['simple', 'shortsword'],
      skills: { count: 2, list: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
      kit: { armor: 'none', shield: false, weapons: ['shortsword', 'dart'] },
      subclass: 'Путь открытой ладони',
      features: [
        { lv: 1, id: 'unarmoredDefenseMonk', name: 'Защита без доспехов', desc: 'Без доспеха и щита КД = 10 + мод. ЛОВ + мод. МДР.' },
        { lv: 1, id: 'martialArts', name: 'Боевые искусства', desc: 'ЛОВ для безоружных ударов и оружия монаха, кость боевых искусств; после атаки — безоружный удар бонусным действием.' },
        { lv: 2, id: 'ki', name: 'Ци', desc: 'Очки ци = уровень: Шквал ударов, Терпеливая оборона, Поступь ветра.' },
        { lv: 2, id: 'unarmoredMovement', name: 'Движение без доспехов', desc: 'Скорость увеличивается.' },
        { lv: 3, id: 'openHand', name: 'Техника открытой ладони', desc: 'Попадания Шквалом ударов могут сбить цель с ног (спасбросок Ловкости).' },
        { lv: 5, id: 'extraAttack', name: 'Дополнительная атака', desc: 'Две атаки за действие Атака.' },
        { lv: 5, id: 'stunningStrike', name: 'Ошеломляющий удар', desc: '1 ци при попадании: спасбросок Телосложения или цель ошеломлена до конца вашего следующего хода.' },
        { lv: 6, id: 'kiStrikes', name: 'Энергетические удары', desc: 'Безоружные удары считаются магическими.' },
        { lv: 7, id: 'evasion', name: 'Увёртливость', desc: 'Успешный спасбросок Ловкости для половины урона — 0 урона, проваленный — половина.' },
      ],
    },
    {
      id: 'paladin', name: 'Паладин', hitDie: 10, icon: '🛡️', saves: ['wis', 'cha'],
      primary: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
      armor: ['light', 'medium', 'heavy', 'shield'], weapons: ['simple', 'martial'],
      skills: { count: 2, list: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
      kit: { armor: 'chainmail', shield: true, weapons: ['longsword', 'javelin'] },
      caster: { ability: 'cha', type: 'half', cantrips: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], prepared: 'half' },
      fightingStyleAt: 2,
      subclass: 'Клятва преданности',
      features: [
        { lv: 1, id: 'layOnHands', name: 'Наложение рук', desc: 'Запас исцеления = 5 × уровень паладина. Действием восстанавливает хиты касанием.' },
        { lv: 2, id: 'fightingStyle', name: 'Боевой стиль', desc: 'Выберите боевой стиль.' },
        { lv: 2, id: 'spellcasting', name: 'Использование заклинаний', desc: 'Заклинательная характеристика — Харизма.' },
        { lv: 2, id: 'divineSmite', name: 'Божественная кара', desc: 'При попадании рукопашным оружием можно потратить ячейку: +2d8 излучением (+1d8 за уровень ячейки выше 1-го, +1d8 против нежити и исчадий).' },
        { lv: 3, id: 'sacredWeapon', name: 'Священное оружие', desc: 'Божественный канал: действием добавляет мод. ХАР к броскам атаки оружием на 10 раундов.' },
        { lv: 5, id: 'extraAttack', name: 'Дополнительная атака', desc: 'Две атаки за действие Атака.' },
        { lv: 6, id: 'auraOfProtection', name: 'Аура защиты', desc: 'Вы и союзники в пределах 10 фт. добавляют мод. ХАР к спасброскам.' },
        { lv: 10, id: 'auraOfCourage', name: 'Аура отваги', desc: 'Вы и союзники в пределах 10 фт. не могут быть испуганы.' },
      ],
    },
    {
      id: 'ranger', name: 'Следопыт', hitDie: 10, icon: '🏹', saves: ['str', 'dex'],
      primary: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
      armor: ['light', 'medium', 'shield'], weapons: ['simple', 'martial'],
      skills: { count: 3, list: ['animal', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
      kit: { armor: 'studded', shield: false, weapons: ['longbow', 'shortsword', 'shortsword'] },
      caster: { ability: 'wis', type: 'half', cantrips: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], known: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6] },
      fightingStyleAt: 2,
      subclass: 'Охотник',
      features: [
        { lv: 2, id: 'fightingStyle', name: 'Боевой стиль', desc: 'Выберите боевой стиль.' },
        { lv: 2, id: 'spellcasting', name: 'Использование заклинаний', desc: 'Заклинательная характеристика — Мудрость.' },
        { lv: 3, id: 'colossusSlayer', name: 'Убийца колоссов', desc: 'Раз в ход +1d8 урона по цели, у которой хиты ниже максимума.' },
        { lv: 5, id: 'extraAttack', name: 'Дополнительная атака', desc: 'Две атаки за действие Атака.' },
      ],
    },
    {
      id: 'rogue', name: 'Плут', hitDie: 8, icon: '🗡️', saves: ['dex', 'int'],
      primary: ['dex', 'con', 'wis', 'cha', 'int', 'str'],
      armor: ['light'], weapons: ['simple', 'handcrossbow', 'longsword', 'rapier', 'shortsword'],
      skills: { count: 4, list: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleight', 'stealth'] },
      kit: { armor: 'leather', shield: false, weapons: ['rapier', 'shortbow', 'dagger'] },
      asi: [4, 8, 10],
      subclass: 'Вор',
      features: [
        { lv: 1, id: 'sneakAttack', name: 'Скрытая атака', desc: 'Раз в ход доп. урон фехтовальным или дальнобойным оружием, если есть преимущество или союзник рядом с целью.' },
        { lv: 2, id: 'cunningAction', name: 'Хитрое действие', desc: 'Бонусным действием: Рывок, Отход или Засада.' },
        { lv: 3, id: 'fastHands', name: 'Быстрые руки', desc: 'Бонусным действием можно использовать предмет (зелье).' },
        { lv: 5, id: 'uncannyDodge', name: 'Невероятное уклонение', desc: 'Реакцией уменьшает вдвое урон от попавшей атаки.' },
        { lv: 7, id: 'evasion', name: 'Увёртливость', desc: 'Успешный спасбросок Ловкости для половины урона — 0 урона, проваленный — половина.' },
      ],
    },
    {
      id: 'sorcerer', name: 'Чародей', hitDie: 6, icon: '🔥', saves: ['con', 'cha'],
      primary: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
      armor: [], weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'lightcrossbow'],
      skills: { count: 2, list: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
      kit: { armor: 'none', shield: false, weapons: ['lightcrossbow', 'dagger'] },
      caster: { ability: 'cha', type: 'full', cantrips: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6], known: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
      subclass: 'Наследие драконьей крови',
      features: [
        { lv: 1, id: 'spellcasting', name: 'Использование заклинаний', desc: 'Заклинательная характеристика — Харизма.' },
        { lv: 1, id: 'draconicResilience', name: 'Драконья устойчивость', desc: '+1 хит за уровень; без доспеха КД = 13 + мод. ЛОВ.' },
        { lv: 2, id: 'fontOfMagic', name: 'Источник магии', desc: 'Очки чародейства = уровень.' },
        { lv: 3, id: 'quickenedSpell', name: 'Метамагия: Ускоренное заклинание', desc: '2 очка чародейства: заклинание с временем накладывания «действие» накладывается бонусным действием.' },
        { lv: 6, id: 'elementalAffinity', name: 'Родство со стихией', desc: '+мод. ХАР к урону огнём от заклинаний.' },
      ],
    },
    {
      id: 'warlock', name: 'Колдун', hitDie: 8, icon: '👁️', saves: ['wis', 'cha'],
      primary: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
      armor: ['light'], weapons: ['simple'],
      skills: { count: 2, list: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
      kit: { armor: 'leather', shield: false, weapons: ['lightcrossbow', 'dagger'] },
      caster: { ability: 'cha', type: 'pact', cantrips: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4], known: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10] },
      subclass: 'Исчадие',
      features: [
        { lv: 1, id: 'pactMagic', name: 'Магия договора', desc: 'Ячейки колдуна восстанавливаются после короткого отдыха.' },
        { lv: 1, id: 'darkOnesBlessing', name: 'Благословение Тёмного', desc: 'Когда вы опускаете хиты врага до 0 — получаете временные хиты = мод. ХАР + уровень колдуна.' },
        { lv: 2, id: 'agonizingBlast', name: 'Воззвание: Мучительный взрыв', desc: '+мод. ХАР к урону Мистического заряда.' },
      ],
    },
    {
      id: 'wizard', name: 'Волшебник', hitDie: 6, icon: '🧙', saves: ['int', 'wis'],
      primary: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
      armor: [], weapons: ['dagger', 'dart', 'sling', 'quarterstaff', 'lightcrossbow'],
      skills: { count: 2, list: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
      kit: { armor: 'none', shield: false, weapons: ['quarterstaff', 'dagger'] },
      caster: { ability: 'int', type: 'full', cantrips: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5], prepared: 'level' },
      subclass: 'Школа воплощения',
      features: [
        { lv: 1, id: 'spellcasting', name: 'Использование заклинаний', desc: 'Заклинательная характеристика — Интеллект.' },
        { lv: 2, id: 'sculptSpells', name: 'Аккуратные заклинания', desc: 'Союзники (1 + уровень заклинания) автоматически избегают урона ваших заклинаний воплощения по площади.' },
        { lv: 6, id: 'potentCantrip', name: 'Мощный заговор', desc: 'При успешном спасброске от вашего заговора цель получает половину урона.' },
        { lv: 10, id: 'empoweredEvocation', name: 'Усиленное воплощение', desc: '+мод. ИНТ к урону заклинаний воплощения.' },
      ],
    },
  ];

  D.CLASSES = CLASSES;
  D.FIGHTING_STYLES = FIGHTING_STYLES;
  D.SLOTS = { FULL, HALF, PACT };
  D.cls = (id) => CLASSES.find((c) => c.id === id);

  D.classSlots = function (cls, level) {
    if (!cls.caster) return {};
    level = Math.max(1, Math.min(10, level));
    if (cls.caster.type === 'pact') {
      return { [PACT.level[level]]: PACT.count[level], pact: true };
    }
    const row = (cls.caster.type === 'full' ? FULL : HALF)[level];
    const out = {};
    row.forEach((n, i) => (out[i + 1] = n));
    return out;
  };

  D.maxSpellLevel = function (cls, level) {
    const s = D.classSlots(cls, level);
    let mx = 0;
    for (const k in s) if (k !== 'pact' && s[k] > 0) mx = Math.max(mx, Number(k));
    return mx;
  };

  D.asiCount = function (cls, level) {
    const levels = cls.asi || [4, 8];
    return levels.filter((l) => l <= level).length;
  };
})(typeof window !== 'undefined' ? window : globalThis);
