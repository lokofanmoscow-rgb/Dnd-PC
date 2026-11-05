/* Базовые справочники правил D&D 5e (терминология — как на dnd.su) */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const R = {};

  R.ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  R.ABILITY_NAMES = {
    str: 'Сила',
    dex: 'Ловкость',
    con: 'Телосложение',
    int: 'Интеллект',
    wis: 'Мудрость',
    cha: 'Харизма',
  };
  R.ABILITY_GEN = { str: 'Силы', dex: 'Ловкости', con: 'Телосложения', int: 'Интеллекта', wis: 'Мудрости', cha: 'Харизмы' };
  R.ABILITY_SHORT = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };

  R.SKILLS = {
    athletics: { name: 'Атлетика', ab: 'str' },
    acrobatics: { name: 'Акробатика', ab: 'dex' },
    sleight: { name: 'Ловкость рук', ab: 'dex' },
    stealth: { name: 'Скрытность', ab: 'dex' },
    arcana: { name: 'Магия', ab: 'int' },
    history: { name: 'История', ab: 'int' },
    investigation: { name: 'Анализ', ab: 'int' },
    nature: { name: 'Природа', ab: 'int' },
    religion: { name: 'Религия', ab: 'int' },
    animal: { name: 'Уход за животными', ab: 'wis' },
    insight: { name: 'Проницательность', ab: 'wis' },
    medicine: { name: 'Медицина', ab: 'wis' },
    perception: { name: 'Восприятие', ab: 'wis' },
    survival: { name: 'Выживание', ab: 'wis' },
    deception: { name: 'Обман', ab: 'cha' },
    intimidation: { name: 'Запугивание', ab: 'cha' },
    performance: { name: 'Выступление', ab: 'cha' },
    persuasion: { name: 'Убеждение', ab: 'cha' },
  };

  R.DAMAGE_TYPES = {
    bludgeoning: 'дробящий',
    piercing: 'колющий',
    slashing: 'рубящий',
    acid: 'кислотой',
    cold: 'холодом',
    fire: 'огнём',
    force: 'силовым полем',
    lightning: 'электричеством',
    necrotic: 'некротической энергией',
    poison: 'ядом',
    psychic: 'психической энергией',
    radiant: 'излучением',
    thunder: 'звуком',
  };
  R.DAMAGE_SHORT = {
    bludgeoning: 'дробящий',
    piercing: 'колющий',
    slashing: 'рубящий',
    acid: 'кислота',
    cold: 'холод',
    fire: 'огонь',
    force: 'силовое поле',
    lightning: 'электричество',
    necrotic: 'некротический',
    poison: 'яд',
    psychic: 'психический',
    radiant: 'излучение',
    thunder: 'звук',
  };
  R.DAMAGE_COLORS = {
    bludgeoning: '#d8c7a8',
    piercing: '#d8c7a8',
    slashing: '#d8c7a8',
    acid: '#9be25a',
    cold: '#8fd8ff',
    fire: '#ff8a3d',
    force: '#d59bff',
    lightning: '#7fb2ff',
    necrotic: '#a0a0a0',
    poison: '#6fcf5a',
    psychic: '#ff8fe0',
    radiant: '#ffe680',
    thunder: '#b0c4ff',
  };
  R.PHYSICAL = ['bludgeoning', 'piercing', 'slashing'];

  R.CONDITIONS = {
    blinded: { name: 'Ослеплённый', icon: '🙈', desc: 'Автоматически проваливает проверки, требующие зрения. Броски атаки по нему с преимуществом, его атаки — с помехой.' },
    charmed: { name: 'Очарованный', icon: '💕', desc: 'Не может атаковать очаровавшего. Тот совершает с преимуществом проверки при социальном взаимодействии.' },
    deafened: { name: 'Оглохший', icon: '🔇', desc: 'Ничего не слышит и автоматически проваливает проверки, требующие слуха.' },
    frightened: { name: 'Испуганный', icon: '😱', desc: 'Помеха к проверкам и броскам атаки, пока источник страха в пределах видимости. Не может добровольно приблизиться к источнику.' },
    grappled: { name: 'Схваченный', icon: '🤼', desc: 'Скорость равна 0. Состояние оканчивается, если схвативший недееспособен или существо выведено из его досягаемости.' },
    incapacitated: { name: 'Недееспособный', icon: '💫', desc: 'Не может совершать действия и реакции.' },
    invisible: { name: 'Невидимый', icon: '👻', desc: 'Броски атаки по нему с помехой, его атаки — с преимуществом.' },
    paralyzed: { name: 'Парализованный', icon: '⚡', desc: 'Недееспособен, не может двигаться и говорить. Проваливает спасброски Силы и Ловкости. Атаки по нему с преимуществом; попадание с 5 футов — критическое.' },
    petrified: { name: 'Окаменевший', icon: '🗿', desc: 'Превращён в камень. Недееспособен, сопротивление всем видам урона, атаки по нему с преимуществом.' },
    poisoned: { name: 'Отравленный', icon: '🤢', desc: 'Помеха к броскам атаки и проверкам характеристик.' },
    prone: { name: 'Сбитый с ног', icon: '⬇️', desc: 'Может только ползти. Помеха к броскам атаки. Атаки по нему с 5 футов — с преимуществом, дальнобойные — с помехой. Встать стоит половину скорости.' },
    restrained: { name: 'Опутанный', icon: '🕸️', desc: 'Скорость 0. Атаки по нему с преимуществом, его атаки — с помехой. Помеха к спасброскам Ловкости.' },
    stunned: { name: 'Ошеломлённый', icon: '😵', desc: 'Недееспособен, не может двигаться. Проваливает спасброски Силы и Ловкости. Атаки по нему с преимуществом.' },
    unconscious: { name: 'Бессознательный', icon: '💤', desc: 'Недееспособен, роняет всё, падает ничком. Проваливает спасброски Силы и Ловкости. Атаки по нему с преимуществом; попадание с 5 футов — критическое.' },
  };

  /* Особые эффекты (не состояния PHB, но отслеживаются в бою) */
  R.EFFECTS = {
    dodge: { name: 'Уклонение', icon: '🌀' },
    disengage: { name: 'Отход', icon: '↩️' },
    rage: { name: 'Ярость', icon: '😡' },
    reckless: { name: 'Безрассудная атака', icon: '🪓' },
    bless: { name: 'Благословение', icon: '✨' },
    shieldOfFaith: { name: 'Щит веры', icon: '🛡️' },
    shield: { name: 'Щит', icon: '🔰' },
    mageArmor: { name: 'Доспехи мага', icon: '🧥' },
    hunterMark: { name: 'Метка охотника', icon: '🎯' },
    hex: { name: 'Сглаз', icon: '🧿' },
    guidingBolt: { name: 'Направленный снаряд', icon: '🌟' },
    mockery: { name: 'Злая насмешка', icon: '🤡' },
    slowed: { name: 'Замедлен (−10 фт)', icon: '🐌' },
    noReactions: { name: 'Без реакций', icon: '⛔' },
    inspiration: { name: 'Вдохновение барда', icon: '🎵' },
    helped: { name: 'Помощь', icon: '🤝' },
    spiritualWeapon: { name: 'Божественное оружие', icon: '🔨' },
    stable: { name: 'Стабилизирован', icon: '❤️‍🩹' },
    dead: { name: 'Мёртв', icon: '☠️' },
    concentration: { name: 'Концентрация', icon: '🧠' },
    regenBlocked: { name: 'Регенерация подавлена', icon: '🔥' },
    reckless_mon: { name: 'Безрассудство', icon: '💢' },
    recklessAtk: { name: 'Безрассудная атака', icon: '🪓' },
    sacredWeapon: { name: 'Священное оружие', icon: '🗡️' },
    aid: { name: 'Подмога', icon: '💪' },
    spiritGuardians: { name: 'Духовные стражи', icon: '👼' },
    faerieFire: { name: 'Огонь фей', icon: '🎇' },
    divineFavor: { name: 'Божественное благоволение', icon: '🌞' },
    thunderousSmite: { name: 'Громовая кара', icon: '🌩️' },
    heroism: { name: 'Героизм', icon: '🦁' },
    magicWeapon: { name: 'Магическое оружие', icon: '✨' },
    barkskin: { name: 'Дубовая кора', icon: '🌳' },
    haste: { name: 'Ускорение', icon: '⚡' },
    slowSpell: { name: 'Замедление', icon: '🐢' },
    stoneskin: { name: 'Каменная кожа', icon: '🪨' },
    vowOfEnmity: { name: 'Клятва вражды', icon: '⚔️' },
    shadowStep: { name: 'Шаг тени', icon: '🌑' },
    holyNimbus: { name: 'Святой нимб', icon: '☀️' },
    acidArrow: { name: 'Кислотная стрела', icon: '🧪' },
    tides: { name: 'Поток хаоса', icon: '🌀' },
    shimmerShield: { name: 'Мерцающий щит', icon: '💠' },
    entropicMark: { name: 'Энтропийная защита', icon: '🕳️' },
  };

  R.SIZES = {
    tiny: { name: 'Крошечный', cells: 1, order: 0 },
    small: { name: 'Маленький', cells: 1, order: 1 },
    medium: { name: 'Средний', cells: 1, order: 2 },
    large: { name: 'Большой', cells: 2, order: 3 },
    huge: { name: 'Огромный', cells: 3, order: 4 },
    gargantuan: { name: 'Громадный', cells: 4, order: 5 },
  };

  R.CREATURE_TYPES = {
    aberration: 'Аберрация',
    beast: 'Зверь',
    celestial: 'Небожитель',
    construct: 'Конструкт',
    dragon: 'Дракон',
    elemental: 'Элементаль',
    fey: 'Фея',
    fiend: 'Исчадие',
    giant: 'Великан',
    humanoid: 'Гуманоид',
    monstrosity: 'Чудовище',
    ooze: 'Слизь',
    plant: 'Растение',
    undead: 'Нежить',
  };

  R.SIDES = {
    heroes: { name: 'Герои', color: '#3d7bd9' },
    enemies: { name: 'Враги', color: '#c8372d' },
    allies: { name: 'Союзники', color: '#3a9d4a' },
  };

  R.CR_XP = {
    '0': 10, '1/8': 25, '1/4': 50, '1/2': 100, '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800,
    '6': 2300, '7': 2900, '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000,
    '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000, '20': 25000,
  };
  R.crValue = function (cr) {
    if (typeof cr === 'number') return cr;
    if (String(cr).includes('/')) {
      const [a, b] = String(cr).split('/').map(Number);
      return a / b;
    }
    return Number(cr);
  };
  R.crProf = function (cr) {
    const v = R.crValue(cr);
    if (v < 5) return 2;
    if (v < 9) return 3;
    if (v < 13) return 4;
    if (v < 17) return 5;
    if (v < 21) return 6;
    if (v < 25) return 7;
    if (v < 29) return 8;
    return 9;
  };

  D.R = R;
})(typeof window !== 'undefined' ? window : globalThis);
