/* Заклинания (SRD 5.1, адаптировано для тактического боя) */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const SCHOOLS = {
    abjuration: 'Ограждение', conjuration: 'Вызов', divination: 'Прорицание', enchantment: 'Очарование',
    evocation: 'Воплощение', illusion: 'Иллюзия', necromancy: 'Некромантия', transmutation: 'Преобразование',
  };

  /*
    kind:
      attack  — бросок атаки заклинанием (attack: 'ranged'|'melee'), beams — число лучей
      save    — спасбросок цели/целей (save: 'dex' ...), half — половина урона при успехе
      auto    — автоматическое попадание (Волшебная стрела)
      heal    — лечение
      buff    — положительный эффект
      control — состояние по спасброску
      sleep   — Усыпление
      teleport— телепортация
      utility — прочее
    target: 'creature' | 'creatures' (count) | 'area' | 'self'
    area: {shape: 'sphere'|'cube'|'cone'|'line'|'aura', size: фт, origin: 'point'|'self'}
  */
  const S = [
    // ---------- Заговоры ----------
    { id: 'firebolt', name: 'Огненный снаряд', level: 0, school: 'evocation', cast: 'action', range: 120, kind: 'attack', attack: 'ranged', target: 'creature',
      damage: [{ dice: '1d10', type: 'fire' }], scale: 'dice', classes: ['sorcerer', 'wizard'],
      desc: 'Дальнобойная атака заклинанием. 1d10 урона огнём (растёт на 5, 11, 17 уровнях).' },
    { id: 'sacredflame', name: 'Священное пламя', level: 0, school: 'evocation', cast: 'action', range: 60, kind: 'save', save: 'dex', half: false, target: 'creature',
      damage: [{ dice: '1d8', type: 'radiant' }], scale: 'dice', classes: ['cleric'],
      desc: 'Спасбросок Ловкости или 1d8 урона излучением. Укрытие не помогает.' },
    { id: 'eldritchblast', name: 'Мистический заряд', level: 0, school: 'evocation', cast: 'action', range: 120, kind: 'attack', attack: 'ranged', target: 'creature',
      damage: [{ dice: '1d10', type: 'force' }], scale: 'beams', classes: ['warlock'],
      desc: 'Луч потрескивающей энергии: 1d10 урона силовым полем. Количество лучей растёт с уровнем.' },
    { id: 'rayoffrost', name: 'Луч холода', level: 0, school: 'evocation', cast: 'action', range: 60, kind: 'attack', attack: 'ranged', target: 'creature',
      damage: [{ dice: '1d8', type: 'cold' }], scale: 'dice', onHit: { effect: 'slowed', duration: 'casterNextStart' }, classes: ['sorcerer', 'wizard'],
      desc: '1d8 урона холодом, скорость цели уменьшается на 10 фт. до начала вашего следующего хода.' },
    { id: 'shockinggrasp', name: 'Электрошок', level: 0, school: 'evocation', cast: 'action', range: 5, kind: 'attack', attack: 'melee', target: 'creature',
      damage: [{ dice: '1d8', type: 'lightning' }], scale: 'dice', onHit: { effect: 'noReactions', duration: 'targetNextStart' }, classes: ['sorcerer', 'wizard'],
      desc: 'Рукопашная атака заклинанием: 1d8 урона электричеством, цель не может совершать реакции до начала своего хода.' },
    { id: 'viciousmockery', name: 'Злая насмешка', level: 0, school: 'enchantment', cast: 'action', range: 60, kind: 'save', save: 'wis', half: false, target: 'creature',
      damage: [{ dice: '1d4', type: 'psychic' }], scale: 'dice', onFail: { effect: 'mockery', duration: 'targetNextEnd' }, classes: ['bard'],
      desc: 'Спасбросок Мудрости или 1d4 урона психической энергией и помеха на следующий бросок атаки.' },
    { id: 'produceflame', name: 'Сотворение пламени', level: 0, school: 'conjuration', cast: 'action', range: 30, kind: 'attack', attack: 'ranged', target: 'creature',
      damage: [{ dice: '1d8', type: 'fire' }], scale: 'dice', classes: ['druid'],
      desc: 'Бросаете пламя: дальнобойная атака заклинанием, 1d8 урона огнём.' },
    { id: 'thornwhip', name: 'Терновый кнут', level: 0, school: 'transmutation', cast: 'action', range: 30, kind: 'attack', attack: 'melee', target: 'creature',
      damage: [{ dice: '1d6', type: 'piercing' }], scale: 'dice', onHit: { pull: 10 }, classes: ['druid'],
      desc: 'Рукопашная атака заклинанием (30 фт.): 1d6 колющего урона, цель Большая или меньше притягивается на 10 фт.' },
    { id: 'poisonspray', name: 'Ядовитые брызги', level: 0, school: 'conjuration', cast: 'action', range: 10, kind: 'save', save: 'con', half: false, target: 'creature',
      damage: [{ dice: '1d12', type: 'poison' }], scale: 'dice', classes: ['druid', 'sorcerer', 'warlock', 'wizard'],
      desc: 'Спасбросок Телосложения или 1d12 урона ядом.' },
    { id: 'chilltouch', name: 'Леденящее прикосновение', level: 0, school: 'necromancy', cast: 'action', range: 120, kind: 'attack', attack: 'ranged', target: 'creature',
      damage: [{ dice: '1d8', type: 'necrotic' }], scale: 'dice', classes: ['sorcerer', 'warlock', 'wizard'],
      desc: 'Призрачная рука: 1d8 урона некротической энергией.' },
    { id: 'acidsplash', name: 'Брызги кислоты', level: 0, school: 'conjuration', cast: 'action', range: 60, kind: 'save', save: 'dex', half: false, target: 'creature',
      damage: [{ dice: '1d6', type: 'acid' }], scale: 'dice', classes: ['sorcerer', 'wizard'],
      desc: 'Спасбросок Ловкости или 1d6 урона кислотой.' },

    // ---------- 1 уровень ----------
    { id: 'magicmissile', name: 'Волшебная стрела', level: 1, school: 'evocation', cast: 'action', range: 120, kind: 'auto', target: 'creature',
      darts: 3, damage: [{ dice: '1d4+1', type: 'force' }], upcast: { darts: 1 }, classes: ['sorcerer', 'wizard'],
      desc: 'Три светящихся дротика всегда попадают: каждый 1d4+1 урона силовым полем. +1 дротик за уровень ячейки выше 1.' },
    { id: 'burninghands', name: 'Огненные ладони', level: 1, school: 'evocation', cast: 'action', range: 0, kind: 'save', save: 'dex', half: true, target: 'area',
      area: { shape: 'cone', size: 15, origin: 'self' }, damage: [{ dice: '3d6', type: 'fire' }], upcast: { dice: '1d6' }, classes: ['sorcerer', 'wizard'],
      desc: 'Конус 15 фт.: спасбросок Ловкости, 3d6 урона огнём (половина при успехе).' },
    { id: 'thunderwave', name: 'Волна грома', level: 1, school: 'evocation', cast: 'action', range: 0, kind: 'save', save: 'con', half: true, target: 'area',
      area: { shape: 'cube', size: 15, origin: 'self' }, damage: [{ dice: '2d8', type: 'thunder' }], upcast: { dice: '1d8' }, onFail: { push: 10 },
      classes: ['bard', 'druid', 'sorcerer', 'wizard'],
      desc: 'Куб 15 фт. от вас: спасбросок Телосложения, 2d8 урона звуком и отталкивание на 10 фт. (половина урона при успехе).' },
    { id: 'curewounds', name: 'Лечение ран', level: 1, school: 'evocation', cast: 'action', range: 5, kind: 'heal', target: 'creature',
      heal: '1d8', upcast: { dice: '1d8' }, classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger'],
      desc: 'Касание: восстанавливает 1d8 + мод. заклинательной характеристики хитов.' },
    { id: 'healingword', name: 'Лечащее слово', level: 1, school: 'evocation', cast: 'bonus', range: 60, kind: 'heal', target: 'creature',
      heal: '1d4', upcast: { dice: '1d4' }, classes: ['bard', 'cleric', 'druid'],
      desc: 'Бонусное действие, 60 фт.: восстанавливает 1d4 + мод. хитов.' },
    { id: 'bless', name: 'Благословение', level: 1, school: 'enchantment', cast: 'action', range: 30, kind: 'buff', target: 'creatures', count: 3,
      effect: 'bless', concentration: true, rounds: 10, upcast: { targets: 1 }, classes: ['cleric', 'paladin'],
      desc: 'До трёх существ добавляют 1d4 к броскам атаки и спасброскам. Концентрация, 1 минута.' },
    { id: 'guidingbolt', name: 'Направленный снаряд', level: 1, school: 'evocation', cast: 'action', range: 120, kind: 'attack', attack: 'ranged', target: 'creature',
      damage: [{ dice: '4d6', type: 'radiant' }], upcast: { dice: '1d6' }, onHit: { effect: 'guidingBolt', duration: 'casterNextEnd' }, classes: ['cleric'],
      desc: '4d6 урона излучением; следующий бросок атаки по цели — с преимуществом.' },
    { id: 'inflictwounds', name: 'Нанесение ран', level: 1, school: 'necromancy', cast: 'action', range: 5, kind: 'attack', attack: 'melee', target: 'creature',
      damage: [{ dice: '3d10', type: 'necrotic' }], upcast: { dice: '1d10' }, classes: ['cleric'],
      desc: 'Рукопашная атака заклинанием: 3d10 урона некротической энергией.' },
    { id: 'shieldoffaith', name: 'Щит веры', level: 1, school: 'abjuration', cast: 'bonus', range: 60, kind: 'buff', target: 'creature',
      effect: 'shieldOfFaith', concentration: true, rounds: 100, classes: ['cleric', 'paladin'],
      desc: 'Бонусное действие: +2 к КД существа. Концентрация, 10 минут.' },
    { id: 'sleep', name: 'Усыпление', level: 1, school: 'enchantment', cast: 'action', range: 90, kind: 'sleep', target: 'area',
      area: { shape: 'sphere', size: 20, origin: 'point' }, pool: '5d8', upcast: { pool: '2d8' }, classes: ['bard', 'sorcerer', 'wizard'],
      desc: 'Сфера 20 фт.: 5d8 хитов существ (начиная с наименьших) засыпают на 1 минуту. Урон будит.' },
    { id: 'huntersmark', name: 'Метка охотника', level: 1, school: 'divination', cast: 'bonus', range: 90, kind: 'buff', target: 'creature', hostile: true,
      effect: 'hunterMark', concentration: true, rounds: 600, classes: ['ranger'],
      desc: 'Бонусное действие: ваши атаки оружием по цели наносят +1d6 урона. Концентрация, 1 час.' },
    { id: 'hex', name: 'Сглаз', level: 1, school: 'enchantment', cast: 'bonus', range: 90, kind: 'buff', target: 'creature', hostile: true,
      effect: 'hex', concentration: true, rounds: 600, classes: ['warlock'],
      desc: 'Бонусное действие: ваши атаки по цели наносят +1d6 урона некротической энергией. Концентрация, 1 час.' },
    { id: 'armsofhadar', name: 'Руки Хадара', level: 1, school: 'conjuration', cast: 'action', range: 0, kind: 'save', save: 'str', half: true, target: 'area',
      area: { shape: 'aura', size: 10, origin: 'self' }, damage: [{ dice: '2d6', type: 'necrotic' }], upcast: { dice: '1d6' }, onFail: { effect: 'noReactions', duration: 'targetNextStart' },
      classes: ['warlock'], desc: 'Все в пределах 10 фт.: спасбросок Силы, 2d6 урона некротической энергией; при провале — без реакций.' },
    { id: 'dissonantwhispers', name: 'Диссонирующий шёпот', level: 1, school: 'enchantment', cast: 'action', range: 60, kind: 'save', save: 'wis', half: true, target: 'creature',
      damage: [{ dice: '3d6', type: 'psychic' }], upcast: { dice: '1d6' }, classes: ['bard'],
      desc: 'Спасбросок Мудрости: 3d6 урона психической энергией (половина при успехе).' },
    { id: 'entangle', name: 'Опутывание', level: 1, school: 'conjuration', cast: 'action', range: 90, kind: 'control', save: 'str', target: 'area',
      area: { shape: 'square', size: 20, origin: 'point' }, condition: 'restrained', escape: 'str', concentration: true, rounds: 10, classes: ['druid'],
      desc: 'Квадрат 20 фт.: спасбросок Силы или существа опутаны. Освободиться — действием, проверка Силы.' },
    { id: 'magearmor', name: 'Доспехи мага', level: 1, school: 'abjuration', cast: 'action', range: 5, kind: 'buff', target: 'creature',
      effect: 'mageArmor', rounds: 4800, classes: ['sorcerer', 'wizard'],
      desc: 'Существо без доспехов: КД = 13 + мод. ЛОВ. 8 часов.' },
    { id: 'shield', name: 'Щит', level: 1, school: 'abjuration', cast: 'reaction', range: 0, kind: 'reaction', target: 'self',
      classes: ['sorcerer', 'wizard'],
      desc: 'Реакция на попадание: +5 к КД до начала вашего следующего хода (в том числе против этой атаки).' },
    { id: 'hellishrebuke', name: 'Адское возмездие', level: 1, school: 'evocation', cast: 'reaction', range: 60, kind: 'reaction', target: 'creature',
      save: 'dex', half: true, damage: [{ dice: '2d10', type: 'fire' }], upcast: { dice: '1d10' }, classes: ['warlock'],
      desc: 'Реакция на получение урона: обидчик проходит спасбросок Ловкости, 2d10 урона огнём (половина при успехе).' },

    // ---------- 2 уровень ----------
    { id: 'scorchingray', name: 'Палящий луч', level: 2, school: 'evocation', cast: 'action', range: 120, kind: 'attack', attack: 'ranged', target: 'creature',
      rays: 3, damage: [{ dice: '2d6', type: 'fire' }], upcast: { rays: 1 }, classes: ['sorcerer', 'wizard'],
      desc: 'Три луча, каждый — дальнобойная атака заклинанием, 2d6 урона огнём.' },
    { id: 'holdperson', name: 'Удержание личности', level: 2, school: 'enchantment', cast: 'action', range: 60, kind: 'control', save: 'wis', target: 'creatures', count: 1,
      filter: 'humanoid', condition: 'paralyzed', repeatSave: true, concentration: true, rounds: 10, upcast: { targets: 1 },
      classes: ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'],
      desc: 'Гуманоид: спасбросок Мудрости или парализован. Повторный спасбросок в конце каждого его хода. Концентрация.' },
    { id: 'shatter', name: 'Дребезги', level: 2, school: 'evocation', cast: 'action', range: 60, kind: 'save', save: 'con', half: true, target: 'area',
      area: { shape: 'sphere', size: 10, origin: 'point' }, damage: [{ dice: '3d8', type: 'thunder' }], upcast: { dice: '1d8' },
      classes: ['bard', 'sorcerer', 'warlock', 'wizard'], desc: 'Сфера 10 фт.: спасбросок Телосложения, 3d8 урона звуком.' },
    { id: 'mistystep', name: 'Туманный шаг', level: 2, school: 'conjuration', cast: 'bonus', range: 30, kind: 'teleport', target: 'point',
      classes: ['sorcerer', 'warlock', 'wizard'], desc: 'Бонусное действие: телепортация на 30 фт. в видимое свободное пространство.' },
    { id: 'spiritualweapon', name: 'Божественное оружие', level: 2, school: 'evocation', cast: 'bonus', range: 60, kind: 'attack', attack: 'melee', target: 'creature',
      damage: [{ dice: '1d8', type: 'force', addMod: true }], upcast: { dice: '1d8', every: 2 }, summon: 'spiritualWeapon', rounds: 10, classes: ['cleric'],
      desc: 'Парящее оружие (60 фт.): рукопашная атака заклинанием, 1d8 + мод. урона силовым полем. Последующие ходы — атака бонусным действием.' },
    { id: 'aid', name: 'Подмога', level: 2, school: 'abjuration', cast: 'action', range: 30, kind: 'buff', target: 'creatures', count: 3,
      effect: 'aid', rounds: 4800, upcast: { aid: 5 }, classes: ['cleric', 'paladin'],
      desc: 'До трёх существ: максимум и текущие хиты увеличиваются на 5.' },
    { id: 'lesserrestoration', name: 'Малое восстановление', level: 2, school: 'abjuration', cast: 'action', range: 5, kind: 'cleanse', target: 'creature',
      removes: ['blinded', 'deafened', 'paralyzed', 'poisoned'], classes: ['bard', 'cleric', 'druid', 'paladin', 'ranger'],
      desc: 'Касание: оканчивает слепоту, глухоту, паралич или отравление.' },

    // ---------- 3 уровень ----------
    { id: 'fireball', name: 'Огненный шар', level: 3, school: 'evocation', cast: 'action', range: 150, kind: 'save', save: 'dex', half: true, target: 'area',
      area: { shape: 'sphere', size: 20, origin: 'point' }, damage: [{ dice: '8d6', type: 'fire' }], upcast: { dice: '1d6' }, classes: ['sorcerer', 'wizard'],
      desc: 'Сфера 20 фт.: спасбросок Ловкости, 8d6 урона огнём (половина при успехе).' },
    { id: 'lightningbolt', name: 'Молния', level: 3, school: 'evocation', cast: 'action', range: 0, kind: 'save', save: 'dex', half: true, target: 'area',
      area: { shape: 'line', size: 100, origin: 'self' }, damage: [{ dice: '8d6', type: 'lightning' }], upcast: { dice: '1d6' }, classes: ['sorcerer', 'wizard'],
      desc: 'Линия 100 фт. × 5 фт.: спасбросок Ловкости, 8d6 урона электричеством.' },
    { id: 'masshealingword', name: 'Множественное лечащее слово', level: 3, school: 'evocation', cast: 'bonus', range: 60, kind: 'heal', target: 'creatures', count: 6,
      heal: '1d4', upcast: { dice: '1d4' }, classes: ['cleric'], desc: 'Бонусное действие: до шести существ восстанавливают 1d4 + мод. хитов.' },
    { id: 'spiritguardians', name: 'Духовные стражи', level: 3, school: 'conjuration', cast: 'action', range: 0, kind: 'aura', target: 'self',
      area: { shape: 'aura', size: 15, origin: 'self' }, save: 'wis', half: true, damage: [{ dice: '3d8', type: 'radiant' }], upcast: { dice: '1d8' },
      concentration: true, rounds: 100, classes: ['cleric'],
      desc: 'Аура 15 фт.: враги, начинающие ход в ней, проходят спасбросок Мудрости, 3d8 урона излучением (половина при успехе).' },
    { id: 'revivify', name: 'Возрождение', level: 3, school: 'necromancy', cast: 'action', range: 5, kind: 'revive', target: 'creature',
      classes: ['cleric', 'paladin'], desc: 'Касание существа, умершего не более минуты назад: оно оживает с 1 хитом.' },
    { id: 'fear', name: 'Ужас', level: 3, school: 'illusion', cast: 'action', range: 0, kind: 'control', save: 'wis', target: 'area',
      area: { shape: 'cone', size: 30, origin: 'self' }, condition: 'frightened', repeatSave: true, concentration: true, rounds: 10,
      classes: ['bard', 'sorcerer', 'warlock', 'wizard'], desc: 'Конус 30 фт.: спасбросок Мудрости или существа испуганы. Концентрация.' },

    // ---------- 4 уровень ----------
    { id: 'icestorm', name: 'Град', level: 4, school: 'evocation', cast: 'action', range: 300, kind: 'save', save: 'dex', half: true, target: 'area',
      area: { shape: 'sphere', size: 20, origin: 'point' }, damage: [{ dice: '2d8', type: 'bludgeoning' }, { dice: '4d6', type: 'cold' }], upcast: { dice: '1d8' },
      classes: ['druid', 'sorcerer', 'wizard'], desc: 'Цилиндр радиусом 20 фт.: спасбросок Ловкости, 2d8 дробящего и 4d6 урона холодом.' },
    { id: 'blight', name: 'Усыхание', level: 4, school: 'necromancy', cast: 'action', range: 30, kind: 'save', save: 'con', half: true, target: 'creature',
      damage: [{ dice: '8d8', type: 'necrotic' }], upcast: { dice: '1d8' }, classes: ['druid', 'sorcerer', 'warlock', 'wizard'],
      desc: 'Спасбросок Телосложения: 8d8 урона некротической энергией (половина при успехе). Не действует на нежить и конструктов.' },

    // ---------- 5 уровень ----------
    { id: 'coneofcold', name: 'Конус холода', level: 5, school: 'evocation', cast: 'action', range: 0, kind: 'save', save: 'con', half: true, target: 'area',
      area: { shape: 'cone', size: 60, origin: 'self' }, damage: [{ dice: '8d8', type: 'cold' }], upcast: { dice: '1d8' }, classes: ['sorcerer', 'wizard'],
      desc: 'Конус 60 фт.: спасбросок Телосложения, 8d8 урона холодом.' },
    { id: 'flamestrike', name: 'Небесный огонь', level: 5, school: 'evocation', cast: 'action', range: 60, kind: 'save', save: 'dex', half: true, target: 'area',
      area: { shape: 'sphere', size: 10, origin: 'point' }, damage: [{ dice: '4d6', type: 'fire' }, { dice: '4d6', type: 'radiant' }], upcast: { dice: '1d6' },
      classes: ['cleric'], desc: 'Столп пламени радиусом 10 фт.: спасбросок Ловкости, 4d6 огнём и 4d6 излучением.' },
    { id: 'masscurewounds', name: 'Множественное лечение ран', level: 5, school: 'evocation', cast: 'action', range: 60, kind: 'heal', target: 'creatures', count: 6,
      heal: '3d8', upcast: { dice: '1d8' }, classes: ['bard', 'cleric', 'druid'], desc: 'До шести существ восстанавливают 3d8 + мод. хитов.' },
    { id: 'holdmonster', name: 'Удержание чудовища', level: 5, school: 'enchantment', cast: 'action', range: 90, kind: 'control', save: 'wis', target: 'creatures', count: 1,
      filter: 'notUndead', condition: 'paralyzed', repeatSave: true, concentration: true, rounds: 10, upcast: { targets: 1 },
      classes: ['bard', 'sorcerer', 'warlock', 'wizard'], desc: 'Существо (не нежить): спасбросок Мудрости или парализовано. Концентрация.' },
  ];

  D.SPELLS = S;
  D.SCHOOLS = SCHOOLS;
  D.spell = (id) => S.find((s) => s.id === id);
  D.classSpells = (clsId, maxLevel) => S.filter((s) => s.classes.includes(clsId) && s.level <= maxLevel);
})(typeof window !== 'undefined' ? window : globalThis);
