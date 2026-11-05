/* Расы (Книга игрока / SRD) */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const DRAGON_ANCESTRY = {
    black: { name: 'Чёрный', type: 'acid', shape: 'line', save: 'dex' },
    blue: { name: 'Синий', type: 'lightning', shape: 'line', save: 'dex' },
    brass: { name: 'Латунный', type: 'fire', shape: 'line', save: 'dex' },
    bronze: { name: 'Бронзовый', type: 'lightning', shape: 'line', save: 'dex' },
    copper: { name: 'Медный', type: 'acid', shape: 'line', save: 'dex' },
    gold: { name: 'Золотой', type: 'fire', shape: 'cone', save: 'dex' },
    green: { name: 'Зелёный', type: 'poison', shape: 'cone', save: 'con' },
    red: { name: 'Красный', type: 'fire', shape: 'cone', save: 'dex' },
    silver: { name: 'Серебряный', type: 'cold', shape: 'cone', save: 'con' },
    white: { name: 'Белый', type: 'cold', shape: 'cone', save: 'con' },
  };

  /* bonus — бонусы характеристик; traits — механические особенности */
  const RACES = [
    {
      id: 'human', name: 'Человек', speed: 30, size: 'medium', icon: 'person',
      bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
      desc: 'Самая распространённая и амбициозная раса. +1 ко всем характеристикам.',
      subraces: [],
    },
    {
      id: 'dwarf', name: 'Дварф', speed: 25, size: 'medium', icon: 'dwarf-face',
      bonus: { con: 2 }, darkvision: 60,
      traits: { dwarvenResilience: true, heavyArmorNoSpeedPenalty: true },
      resist: ['poison'],
      desc: 'Тёмное зрение, дварфская стойкость (сопротивление яду, преимущество на спасброски от яда). Скорость не снижается тяжёлым доспехом.',
      subraces: [
        { id: 'hill', name: 'Холмовой дварф', bonus: { wis: 1 }, traits: { dwarvenToughness: true }, desc: '+1 МДР, +1 хит за уровень.' },
        { id: 'mountain', name: 'Горный дварф', bonus: { str: 2 }, armorProf: ['light', 'medium'], desc: '+2 СИЛ, владение лёгкими и средними доспехами.' },
      ],
    },
    {
      id: 'elf', name: 'Эльф', speed: 30, size: 'medium', icon: 'elf-helmet',
      bonus: { dex: 2 }, darkvision: 60, skills: ['perception'],
      traits: { feyAncestry: true },
      desc: 'Тёмное зрение, наследие фей (преимущество против очарования, иммунитет к магическому сну), владение Восприятием.',
      subraces: [
        { id: 'high', name: 'Высший эльф', bonus: { int: 1 }, cantrip: 'firebolt', weapons: ['longsword', 'shortsword', 'shortbow', 'longbow'], desc: '+1 ИНТ, один заговор волшебника (Огненный снаряд), владение мечами и луками.' },
        { id: 'wood', name: 'Лесной эльф', bonus: { wis: 1 }, speed: 35, weapons: ['longsword', 'shortsword', 'shortbow', 'longbow'], desc: '+1 МДР, скорость 35 фт., владение мечами и луками.' },
        { id: 'drow', name: 'Тёмный эльф (дроу)', bonus: { cha: 1 }, darkvision: 120, weapons: ['rapier', 'shortsword', 'handcrossbow'], desc: '+1 ХАР, превосходное тёмное зрение, владение рапирой, коротким мечом и ручным арбалетом.' },
      ],
    },
    {
      id: 'halfling', name: 'Полурослик', speed: 25, size: 'small', icon: 'barefoot',
      bonus: { dex: 2 },
      traits: { lucky: true, brave: true },
      desc: 'Везучий (перебрасывает 1 на d20), храбрый (преимущество против испуга), проворный.',
      subraces: [
        { id: 'lightfoot', name: 'Легконогий', bonus: { cha: 1 }, desc: '+1 ХАР, естественная скрытность.' },
        { id: 'stout', name: 'Коренастый', bonus: { con: 1 }, resist: ['poison'], traits: { dwarvenResilience: true }, desc: '+1 ТЕЛ, устойчивость к яду.' },
      ],
    },
    {
      id: 'dragonborn', name: 'Драконорождённый', speed: 30, size: 'medium', icon: 'dragon-head',
      bonus: { str: 2, cha: 1 },
      traits: { breathWeapon: true },
      desc: 'Оружие дыхания (зависит от предка-дракона), сопротивление урону того же вида.',
      subraces: [],
      ancestry: DRAGON_ANCESTRY,
    },
    {
      id: 'gnome', name: 'Гном', speed: 25, size: 'small', icon: 'bad-gnome',
      bonus: { int: 2 }, darkvision: 60,
      traits: { gnomeCunning: true },
      desc: 'Тёмное зрение, гномья хитрость (преимущество на спасброски ИНТ, МДР и ХАР против магии).',
      subraces: [
        { id: 'forest', name: 'Лесной гном', bonus: { dex: 1 }, desc: '+1 ЛОВ, природная иллюзия.' },
        { id: 'rock', name: 'Скальный гном', bonus: { con: 1 }, desc: '+1 ТЕЛ, ремесленные знания.' },
      ],
    },
    {
      id: 'halfelf', name: 'Полуэльф', speed: 30, size: 'medium', icon: 'elf-ear',
      bonus: { cha: 2 }, darkvision: 60, chooseBonus: 2, extraSkills: 2,
      traits: { feyAncestry: true },
      desc: '+2 ХАР и +1 к двум другим характеристикам на выбор, два навыка на выбор, наследие фей.',
      subraces: [],
    },
    {
      id: 'halforc', name: 'Полуорк', speed: 30, size: 'medium', icon: 'orc-head',
      bonus: { str: 2, con: 1 }, darkvision: 60, skills: ['intimidation'],
      traits: { relentlessEndurance: true, savageAttacks: true },
      desc: 'Непоколебимая стойкость (раз за отдых при 0 хитов остаётся с 1 хитом), свирепые атаки (доп. кость при критическом попадании).',
      subraces: [],
    },
    {
      id: 'tiefling', name: 'Тифлинг', speed: 30, size: 'medium', icon: 'devil-mask',
      bonus: { cha: 2, int: 1 }, darkvision: 60, resist: ['fire'],
      desc: 'Тёмное зрение, адское сопротивление (сопротивление огню).',
      subraces: [],
    },
  ];

  D.RACES = RACES;
  D.DRAGON_ANCESTRY = DRAGON_ANCESTRY;
  D.race = (id) => RACES.find((r) => r.id === id);
})(typeof window !== 'undefined' ? window : globalThis);
