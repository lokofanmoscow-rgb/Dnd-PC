/* Оружие и доспехи (Книга игрока / SRD 5.1) */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  /* props: finesse — фехтовальное, light — лёгкое, heavy — тяжёлое, twoHanded — двуручное,
     reach — досягаемость, thrown — метательное, ammo — боеприпасы, loading — перезарядка,
     versatile — универсальное (кость при хвате двумя руками) */
  const W = [
    // Простое рукопашное
    { id: 'club', name: 'Дубинка', cat: 'simple', kind: 'melee', dmg: '1d4', type: 'bludgeoning', props: { light: true } },
    { id: 'dagger', name: 'Кинжал', cat: 'simple', kind: 'melee', dmg: '1d4', type: 'piercing', props: { finesse: true, light: true, thrown: [20, 60] } },
    { id: 'greatclub', name: 'Палица', cat: 'simple', kind: 'melee', dmg: '1d8', type: 'bludgeoning', props: { twoHanded: true } },
    { id: 'handaxe', name: 'Ручной топор', cat: 'simple', kind: 'melee', dmg: '1d6', type: 'slashing', props: { light: true, thrown: [20, 60] } },
    { id: 'javelin', name: 'Метательное копьё', cat: 'simple', kind: 'melee', dmg: '1d6', type: 'piercing', props: { thrown: [30, 120] } },
    { id: 'lighthammer', name: 'Лёгкий молот', cat: 'simple', kind: 'melee', dmg: '1d4', type: 'bludgeoning', props: { light: true, thrown: [20, 60] } },
    { id: 'mace', name: 'Булава', cat: 'simple', kind: 'melee', dmg: '1d6', type: 'bludgeoning', props: {} },
    { id: 'quarterstaff', name: 'Боевой посох', cat: 'simple', kind: 'melee', dmg: '1d6', type: 'bludgeoning', props: { versatile: '1d8' } },
    { id: 'sickle', name: 'Серп', cat: 'simple', kind: 'melee', dmg: '1d4', type: 'slashing', props: { light: true } },
    { id: 'spear', name: 'Копьё', cat: 'simple', kind: 'melee', dmg: '1d6', type: 'piercing', props: { thrown: [20, 60], versatile: '1d8' } },
    // Простое дальнобойное
    { id: 'lightcrossbow', name: 'Лёгкий арбалет', cat: 'simple', kind: 'ranged', dmg: '1d8', type: 'piercing', props: { ammo: true, loading: true, twoHanded: true }, range: [80, 320] },
    { id: 'dart', name: 'Дротик', cat: 'simple', kind: 'ranged', dmg: '1d4', type: 'piercing', props: { finesse: true, thrown: [20, 60] }, range: [20, 60] },
    { id: 'shortbow', name: 'Короткий лук', cat: 'simple', kind: 'ranged', dmg: '1d6', type: 'piercing', props: { ammo: true, twoHanded: true }, range: [80, 320] },
    { id: 'sling', name: 'Праща', cat: 'simple', kind: 'ranged', dmg: '1d4', type: 'bludgeoning', props: { ammo: true }, range: [30, 120] },
    // Воинское рукопашное
    { id: 'battleaxe', name: 'Боевой топор', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'slashing', props: { versatile: '1d10' } },
    { id: 'flail', name: 'Цеп', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'bludgeoning', props: {} },
    { id: 'glaive', name: 'Глефа', cat: 'martial', kind: 'melee', dmg: '1d10', type: 'slashing', props: { heavy: true, reach: true, twoHanded: true } },
    { id: 'greataxe', name: 'Секира', cat: 'martial', kind: 'melee', dmg: '1d12', type: 'slashing', props: { heavy: true, twoHanded: true } },
    { id: 'greatsword', name: 'Двуручный меч', cat: 'martial', kind: 'melee', dmg: '2d6', type: 'slashing', props: { heavy: true, twoHanded: true } },
    { id: 'halberd', name: 'Алебарда', cat: 'martial', kind: 'melee', dmg: '1d10', type: 'slashing', props: { heavy: true, reach: true, twoHanded: true } },
    { id: 'longsword', name: 'Длинный меч', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'slashing', props: { versatile: '1d10' } },
    { id: 'maul', name: 'Молот', cat: 'martial', kind: 'melee', dmg: '2d6', type: 'bludgeoning', props: { heavy: true, twoHanded: true } },
    { id: 'morningstar', name: 'Моргенштерн', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'piercing', props: {} },
    { id: 'pike', name: 'Пика', cat: 'martial', kind: 'melee', dmg: '1d10', type: 'piercing', props: { heavy: true, reach: true, twoHanded: true } },
    { id: 'rapier', name: 'Рапира', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'piercing', props: { finesse: true } },
    { id: 'scimitar', name: 'Скимитар', cat: 'martial', kind: 'melee', dmg: '1d6', type: 'slashing', props: { finesse: true, light: true } },
    { id: 'shortsword', name: 'Короткий меч', cat: 'martial', kind: 'melee', dmg: '1d6', type: 'piercing', props: { finesse: true, light: true } },
    { id: 'trident', name: 'Трезубец', cat: 'martial', kind: 'melee', dmg: '1d6', type: 'piercing', props: { thrown: [20, 60], versatile: '1d8' } },
    { id: 'warpick', name: 'Боевая кирка', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'piercing', props: {} },
    { id: 'warhammer', name: 'Боевой молот', cat: 'martial', kind: 'melee', dmg: '1d8', type: 'bludgeoning', props: { versatile: '1d10' } },
    { id: 'whip', name: 'Кнут', cat: 'martial', kind: 'melee', dmg: '1d4', type: 'slashing', props: { finesse: true, reach: true } },
    // Воинское дальнобойное
    { id: 'handcrossbow', name: 'Ручной арбалет', cat: 'martial', kind: 'ranged', dmg: '1d6', type: 'piercing', props: { ammo: true, light: true, loading: true }, range: [30, 120] },
    { id: 'heavycrossbow', name: 'Тяжёлый арбалет', cat: 'martial', kind: 'ranged', dmg: '1d10', type: 'piercing', props: { ammo: true, heavy: true, loading: true, twoHanded: true }, range: [100, 400] },
    { id: 'longbow', name: 'Длинный лук', cat: 'martial', kind: 'ranged', dmg: '1d8', type: 'piercing', props: { ammo: true, heavy: true, twoHanded: true }, range: [150, 600] },
  ];

  const ARMOR = [
    { id: 'none', name: 'Без доспеха', cat: 'none', base: 10, dexMax: 99 },
    { id: 'padded', name: 'Стёганый доспех', cat: 'light', base: 11, dexMax: 99, stealthDis: true },
    { id: 'leather', name: 'Кожаный доспех', cat: 'light', base: 11, dexMax: 99 },
    { id: 'studded', name: 'Проклёпанный кожаный доспех', cat: 'light', base: 12, dexMax: 99 },
    { id: 'hide', name: 'Шкурный доспех', cat: 'medium', base: 12, dexMax: 2 },
    { id: 'chainshirt', name: 'Кольчужная рубаха', cat: 'medium', base: 13, dexMax: 2 },
    { id: 'scale', name: 'Чешуйчатый доспех', cat: 'medium', base: 14, dexMax: 2, stealthDis: true },
    { id: 'breastplate', name: 'Кираса', cat: 'medium', base: 14, dexMax: 2 },
    { id: 'halfplate', name: 'Полулаты', cat: 'medium', base: 15, dexMax: 2, stealthDis: true },
    { id: 'ringmail', name: 'Колечный доспех', cat: 'heavy', base: 14, dexMax: 0, stealthDis: true },
    { id: 'chainmail', name: 'Кольчуга', cat: 'heavy', base: 16, dexMax: 0, str: 13, stealthDis: true },
    { id: 'splint', name: 'Наборный доспех', cat: 'heavy', base: 17, dexMax: 0, str: 15, stealthDis: true },
    { id: 'plate', name: 'Латы', cat: 'heavy', base: 18, dexMax: 0, str: 15, stealthDis: true },
  ];

  const ARMOR_CAT_NAMES = { none: '—', light: 'Лёгкий', medium: 'Средний', heavy: 'Тяжёлый' };

  /* Артефакты и магические предметы (mods: бонусы к характеристикам персонажа) */
  const ITEMS = [
    { id: 'ringprotection', name: 'Кольцо защиты', icon: 'ring', mods: { ac: 1, saves: 1 }, desc: '+1 к КД и спасброскам.' },
    { id: 'cloakprotection', name: 'Плащ защиты', icon: 'cloak', mods: { ac: 1, saves: 1 }, desc: '+1 к КД и спасброскам.' },
    { id: 'bracersdefense', name: 'Наручи защиты', icon: 'bracers', mods: { acUnarmored: 2 }, desc: '+2 к КД, если нет доспеха и щита.' },
    { id: 'iounprotection', name: 'Камень Иоун (защита)', icon: 'gems', mods: { ac: 1 }, desc: '+1 к КД.' },
    { id: 'stoneluck', name: 'Камень удачи', icon: 'rune-stone', mods: { saves: 1, checks: 1 }, desc: '+1 к проверкам характеристик и спасброскам.' },
    { id: 'amulethealth', name: 'Амулет здоровья', icon: 'gem-pendant', mods: { abilSet: { con: 19 } }, desc: 'Телосложение становится 19.' },
    { id: 'gauntletsogre', name: 'Рукавицы силы огра', icon: 'gauntlet', mods: { abilSet: { str: 19 } }, desc: 'Сила становится 19.' },
    { id: 'headbandintellect', name: 'Обруч интеллекта', icon: 'headband-knot', mods: { abilSet: { int: 19 } }, desc: 'Интеллект становится 19.' },
    { id: 'beltgiant', name: 'Пояс силы холмового великана', icon: 'belt', mods: { abilSet: { str: 21 } }, desc: 'Сила становится 21.' },
    { id: 'beltfire', name: 'Пояс силы огненного великана', icon: 'belt', mods: { abilSet: { str: 25 } }, desc: 'Сила становится 25.' },
    { id: 'beltstorm', name: 'Пояс силы штормового великана', icon: 'belt', mods: { abilSet: { str: 29 } }, desc: 'Сила становится 29.' },
    { id: 'beltdwarven', name: 'Пояс дварфов', icon: 'belt', mods: { abilBonus: { con: 2 }, resist: ['poison'] }, desc: 'Телосложение +2 (максимум 20), сопротивление яду.' },
    { id: 'bootsspeed', name: 'Сапоги скорости', icon: 'boots', mods: { speedMult: 2 }, desc: 'Скорость ходьбы удваивается.' },
    { id: 'bootsstriding', name: 'Сапоги бега и прыжков', icon: 'boots', mods: { speedMin: 30 }, desc: 'Скорость ходьбы не меньше 30 фт.' },
    { id: 'cloakdisplacement', name: 'Плащ ускользания', icon: 'cloak', mods: { displacement: true }, desc: 'Атаки по вам совершаются с помехой, пока вы не получили урон в этом раунде.' },
    { id: 'ringfire', name: 'Кольцо сопротивления огню', icon: 'ring', mods: { resist: ['fire'] }, desc: 'Сопротивление урону огнём.' },
    { id: 'ringcold', name: 'Кольцо сопротивления холоду', icon: 'ring', mods: { resist: ['cold'] }, desc: 'Сопротивление урону холодом.' },
    { id: 'ringlightning', name: 'Кольцо сопротивления электричеству', icon: 'ring', mods: { resist: ['lightning'] }, desc: 'Сопротивление урону электричеством.' },
    { id: 'ringnecrotic', name: 'Кольцо сопротивления некротической энергии', icon: 'ring', mods: { resist: ['necrotic'] }, desc: 'Сопротивление урону некротической энергией.' },
    { id: 'broochshielding', name: 'Брошь защиты', icon: 'eye-shield', mods: { resist: ['force'] }, desc: 'Сопротивление урону силовым полем.' },
    { id: 'periaptpoison', name: 'Периапт защиты от яда', icon: 'heart-necklace', mods: { immune: ['poison'], condImmune: ['poisoned'] }, desc: 'Иммунитет к яду и отравлению.' },
    { id: 'ringfreeaction', name: 'Кольцо свободы действий', icon: 'ring', mods: { condImmune: ['paralyzed', 'restrained'] }, desc: 'Нельзя парализовать или опутать.' },
    { id: 'wandwarmage1', name: 'Жезл боевого мага +1', icon: 'crystal-wand', mods: { spellAttack: 1 }, desc: '+1 к броскам атаки заклинаниями.' },
    { id: 'wandwarmage2', name: 'Жезл боевого мага +2', icon: 'crystal-wand', mods: { spellAttack: 2 }, desc: '+2 к броскам атаки заклинаниями.' },
    { id: 'rodpact', name: 'Жезл хранителя договора +1', icon: 'unstable-orb', mods: { spellAttack: 1, spellDC: 1 }, desc: '+1 к атакам и Сл заклинаний.' },
    { id: 'amuletdevout', name: 'Амулет набожных +1', icon: 'gem-pendant', mods: { spellAttack: 1, spellDC: 1 }, desc: '+1 к атакам и Сл заклинаний.' },
    { id: 'helmbrilliance', name: 'Венец отваги', icon: 'helmet', mods: { condImmune: ['frightened'] }, desc: 'Нельзя испугать.' },
    { id: 'periaptvitality', name: 'Талисман жизненной силы', icon: 'heart-necklace', mods: { hp: 10 }, desc: '+10 к максимуму хитов.' },
    { id: 'gloveswarrior', name: 'Перчатки воителя', icon: 'gauntlet', mods: { attack: 1, damage: 1 }, desc: '+1 к броскам атаки и урону оружием.' },
    { id: 'feathertoken', name: 'Перо стремительности', icon: 'feather', mods: { initiative: 5 }, desc: '+5 к инициативе.' },
  ];

  /* Свои доспехи, оружие и артефакты — хранятся общим списком для всех персонажей */
  const custom = {
    armor: () => (D.U ? D.U.store.get('customArmor', []) : []),
    weapons: () => (D.U ? D.U.store.get('customWeapons', []) : []),
    items: () => (D.U ? D.U.store.get('customItems', []) : []),
  };
  function saveCustom(kind, obj) {
    const key = { armor: 'customArmor', weapons: 'customWeapons', items: 'customItems' }[kind];
    const list = D.U.store.get(key, []).filter((x) => x.id !== obj.id);
    list.push(obj);
    D.U.store.set(key, list);
  }

  D.EQUIP = {
    WEAPONS: W,
    ARMOR,
    ITEMS,
    ARMOR_CAT_NAMES,
    allWeapons: () => W.concat(custom.weapons()),
    allArmor: () => ARMOR.concat(custom.armor()),
    allItems: () => ITEMS.concat(custom.items()),
    weapon: (id) => W.find((w) => w.id === id) || custom.weapons().find((w) => w.id === id),
    armor: (id) => ARMOR.find((a) => a.id === id) || custom.armor().find((a) => a.id === id),
    item: (id) => ITEMS.find((a) => a.id === id) || custom.items().find((a) => a.id === id),
    saveCustom,
    custom,
    UNARMED: { id: 'unarmed', name: 'Безоружный удар', cat: 'simple', kind: 'melee', dmg: '1', type: 'bludgeoning', props: {} },
  };
})(typeof window !== 'undefined' ? window : globalThis);
