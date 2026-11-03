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

  D.EQUIP = {
    WEAPONS: W,
    ARMOR,
    ARMOR_CAT_NAMES,
    weapon: (id) => W.find((w) => w.id === id),
    armor: (id) => ARMOR.find((a) => a.id === id),
    UNARMED: { id: 'unarmed', name: 'Безоружный удар', cat: 'simple', kind: 'melee', dmg: '1', type: 'bludgeoning', props: {} },
  };
})(typeof window !== 'undefined' ? window : globalThis);
