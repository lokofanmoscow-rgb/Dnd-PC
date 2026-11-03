/* Бестиарий (статблоки по SRD 5.1, CC-BY-4.0; названия — как на dnd.su) */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const A = (str, dex, con, int, wis, cha) => ({ str, dex, con, int, wis, cha });
  const d = (dice, type) => ({ dice, type });
  const mw = (id, name, toHit, dmg, o) => Object.assign({ id, name, type: 'mw', toHit, reach: 5, dmg }, o || {});
  const rw = (id, name, toHit, range, dmg, o) => Object.assign({ id, name, type: 'rw', toHit, range, dmg }, o || {});
  const mrw = (id, name, toHit, range, dmg, o) => Object.assign({ id, name, type: 'mrw', toHit, reach: 5, range, dmg }, o || {});
  const multi = (desc, ...options) => ({ id: 'multiattack', name: 'Мультиатака', type: 'multi', options, desc });
  const breath = (id, name, shape, size, save, dc, dmg, o) =>
    Object.assign({ id, name, type: 'area', recharge: 5, area: { shape, size, origin: 'self' }, save, dc, dmg, half: true }, o || {});
  const T = (name, desc) => ({ name, desc });

  const M = [
    // ---------------- ПО 0 – 1/8 ----------------
    { id: 'commoner', name: 'Простолюдин', en: 'Commoner', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое мировоззрение', icon: '👨‍🌾',
      ac: 10, hp: 4, hd: '1d8', speed: { walk: 30 }, abil: A(10, 10, 10, 10, 10, 10), senses: 'пассивное Восприятие 10', lang: 'любой один язык (обычно Общий)', cr: '0',
      actions: [mw('club', 'Дубинка', 2, [d('1d4', 'bludgeoning')])] },
    { id: 'giantrat', name: 'Гигантская крыса', en: 'Giant Rat', size: 'small', type: 'beast', align: 'без мировоззрения', icon: '🐀',
      ac: 12, hp: 7, hd: '2d6', speed: { walk: 30 }, abil: A(7, 15, 11, 2, 10, 4), senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: '—', cr: '1/8',
      flags: { packTactics: true },
      traits: [T('Тонкий нюх', 'Крыса совершает с преимуществом проверки Мудрости (Восприятие), полагающиеся на обоняние.'), T('Тактика стаи', 'Преимущество на атаку, если в пределах 5 фт. от цели есть дееспособный союзник крысы.')],
      actions: [mw('bite', 'Укус', 4, [d('1d4+2', 'piercing')])] },
    { id: 'kobold', name: 'Кобольд', en: 'Kobold', size: 'small', type: 'humanoid', tags: ['humanoid'], align: 'законно-злой', icon: '🦎',
      ac: 12, hp: 5, hd: '2d6-2', speed: { walk: 30 }, abil: A(7, 15, 9, 8, 7, 8), senses: 'тёмное зрение 60 фт., пассивное Восприятие 8', lang: 'Общий, Драконий', cr: '1/8',
      flags: { packTactics: true },
      traits: [T('Чувствительность к солнцу', 'На солнечном свету помеха к атакам и проверкам Восприятия, полагающимся на зрение.'), T('Тактика стаи', 'Преимущество на атаку, если в пределах 5 фт. от цели есть дееспособный союзник.')],
      actions: [mw('dagger', 'Кинжал', 4, [d('1d4+2', 'piercing')]), rw('sling', 'Праща', 4, [30, 120], [d('1d4+2', 'bludgeoning')])] },
    { id: 'bandit', name: 'Бандит', en: 'Bandit', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое не законное', icon: '🦹',
      ac: 12, acNote: 'кожаный доспех', hp: 11, hd: '2d8+2', speed: { walk: 30 }, abil: A(11, 12, 12, 10, 10, 10), senses: 'пассивное Восприятие 10', lang: 'любой один язык', cr: '1/8',
      actions: [mw('scimitar', 'Скимитар', 3, [d('1d6+1', 'slashing')]), rw('lightcrossbow', 'Лёгкий арбалет', 3, [80, 320], [d('1d8+1', 'piercing')])] },
    { id: 'guard', name: 'Стражник', en: 'Guard', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое мировоззрение', icon: '💂',
      ac: 16, acNote: 'кольчужная рубаха, щит', hp: 11, hd: '2d8+2', speed: { walk: 30 }, abil: A(13, 12, 12, 10, 11, 10), skills: { perception: 2 },
      senses: 'пассивное Восприятие 12', lang: 'любой один язык', cr: '1/8',
      actions: [mrw('spear', 'Копьё', 3, [20, 60], [d('1d6+1', 'piercing')])] },
    { id: 'cultist', name: 'Культист', en: 'Cultist', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое не доброе', icon: '🕯️',
      ac: 12, acNote: 'кожаный доспех', hp: 9, hd: '2d8', speed: { walk: 30 }, abil: A(11, 12, 10, 10, 11, 10), skills: { deception: 2, religion: 2 },
      senses: 'пассивное Восприятие 10', lang: 'любой один язык', cr: '1/8', flags: { darkDevotion: true },
      traits: [T('Тёмная преданность', 'Преимущество на спасброски от очарования и испуга.')],
      actions: [mw('scimitar', 'Скимитар', 3, [d('1d6+1', 'slashing')])] },

    // ---------------- ПО 1/4 ----------------
    { id: 'acolyte', name: 'Аколит', en: 'Acolyte', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое мировоззрение', icon: '🙏',
      ac: 10, hp: 9, hd: '2d8', speed: { walk: 30 }, abil: A(10, 10, 10, 10, 14, 11), skills: { medicine: 4, religion: 2 },
      senses: 'пассивное Восприятие 12', lang: 'любой один язык (обычно Общий)', cr: '1/4',
      spellcasting: { ability: 'wis', dc: 12, toHit: 4, slots: { 1: 3 }, spells: ['sacredflame', 'bless', 'curewounds'] },
      traits: [T('Использование заклинаний', 'Заклинатель 1 уровня (Мудрость, Сл 12, +4). Заговоры: священное пламя. 1 уровень (3 ячейки): благословение, лечение ран.')],
      actions: [mw('club', 'Дубинка', 2, [d('1d4', 'bludgeoning')])] },
    { id: 'goblin', name: 'Гоблин', en: 'Goblin', size: 'small', type: 'humanoid', tags: ['humanoid', 'goblinoid'], align: 'нейтрально-злой', icon: '👺',
      ac: 15, acNote: 'кожаный доспех, щит', hp: 7, hd: '2d6', speed: { walk: 30 }, abil: A(8, 14, 10, 10, 8, 8), skills: { stealth: 6 },
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 9', lang: 'Общий, Гоблинский', cr: '1/4', flags: { nimbleEscape: true },
      traits: [T('Шустрый побег', 'Гоблин может бонусным действием совершить действие Отход или Засада.')],
      actions: [mw('scimitar', 'Скимитар', 4, [d('1d6+2', 'slashing')]), rw('shortbow', 'Короткий лук', 4, [80, 320], [d('1d6+2', 'piercing')])] },
    { id: 'skeleton', name: 'Скелет', en: 'Skeleton', size: 'medium', type: 'undead', align: 'законно-злой', icon: '💀',
      ac: 13, acNote: 'обрывки доспехов', hp: 13, hd: '2d8+4', speed: { walk: 30 }, abil: A(10, 14, 15, 6, 8, 5),
      vuln: ['bludgeoning'], immune: ['poison'], condImmune: ['poisoned'],
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 9', lang: 'понимает языки, известные при жизни, но не говорит', cr: '1/4',
      actions: [mw('shortsword', 'Короткий меч', 4, [d('1d6+2', 'piercing')]), rw('shortbow', 'Короткий лук', 4, [80, 320], [d('1d6+2', 'piercing')])] },
    { id: 'zombie', name: 'Зомби', en: 'Zombie', size: 'medium', type: 'undead', align: 'нейтрально-злой', icon: '🧟',
      ac: 8, hp: 22, hd: '3d8+9', speed: { walk: 20 }, abil: A(13, 6, 16, 3, 6, 5), saves: { wis: 0 }, immune: ['poison'], condImmune: ['poisoned'],
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 8', lang: 'понимает языки, известные при жизни, но не говорит', cr: '1/4', flags: { undeadFortitude: true },
      traits: [T('Стойкость нежити', 'Если урон опускает хиты зомби до 0, он проходит спасбросок Телосложения со Сл 5 + полученный урон. При успехе хиты опускаются до 1. Не работает против урона излучением и критических попаданий.')],
      actions: [mw('slam', 'Размашистый удар', 3, [d('1d6+1', 'bludgeoning')])] },
    { id: 'wolf', name: 'Волк', en: 'Wolf', size: 'medium', type: 'beast', align: 'без мировоззрения', icon: '🐺',
      ac: 13, acNote: 'природный доспех', hp: 11, hd: '2d8+2', speed: { walk: 40 }, abil: A(12, 15, 12, 3, 12, 6), skills: { perception: 3, stealth: 4 },
      senses: 'пассивное Восприятие 13', lang: '—', cr: '1/4', flags: { packTactics: true },
      traits: [T('Тонкий слух и нюх', 'Преимущество на проверки Восприятия, полагающиеся на слух и обоняние.'), T('Тактика стаи', 'Преимущество на атаку, если в пределах 5 фт. от цели есть дееспособный союзник.')],
      actions: [mw('bite', 'Укус', 4, [d('2d4+2', 'piercing')], { onHit: { save: 'str', dc: 11, condition: 'prone', text: 'Если цель — существо, она должна преуспеть в спасброске Силы со Сл 11, иначе будет сбита с ног.' } })] },
    { id: 'boar', name: 'Кабан', en: 'Boar', size: 'medium', type: 'beast', align: 'без мировоззрения', icon: '🐗',
      ac: 11, acNote: 'природный доспех', hp: 11, hd: '2d8+2', speed: { walk: 40 }, abil: A(13, 11, 12, 2, 9, 5), senses: 'пассивное Восприятие 9', lang: '—', cr: '1/4',
      flags: { charge: { dist: 20, attack: 'tusk', dmg: [d('1d6', 'slashing')], save: 'str', dc: 11, prone: true }, relentless: 7 },
      traits: [T('Рывок', 'Если кабан переместится как минимум на 20 фт. по прямой к цели и попадёт клыком, цель получает дополнительно 3 (1d6) рубящего урона и должна преуспеть в спасброске Силы со Сл 11, иначе сбивается с ног.'),
        T('Неутомимость (перезарядка после отдыха)', 'Если кабан получает 7 или менее урона, опускающего хиты до 0, его хиты опускаются до 1.')],
      actions: [mw('tusk', 'Клык', 3, [d('1d6+1', 'slashing')])] },
    { id: 'animatedarmor', name: 'Оживлённые доспехи', en: 'Animated Armor', size: 'medium', type: 'construct', align: 'без мировоззрения', icon: '🛡️',
      ac: 18, acNote: 'природный доспех', hp: 33, hd: '6d8+6', speed: { walk: 25 }, abil: A(14, 11, 13, 1, 3, 1),
      immune: ['poison', 'psychic'], condImmune: ['blinded', 'charmed', 'deafened', 'frightened', 'paralyzed', 'petrified', 'poisoned'],
      senses: 'слепое зрение 60 фт. (слеп за пределами), пассивное Восприятие 6', lang: '—', cr: '1',
      traits: [T('Обманчивая внешность', 'Пока доспехи неподвижны, их не отличить от обычных доспехов.')],
      actions: [multi('Доспехи совершают две рукопашные атаки.', ['slam', 'slam']), mw('slam', 'Размашистый удар', 4, [d('1d6+2', 'bludgeoning')])] },

    // ---------------- ПО 1/2 ----------------
    { id: 'orc', name: 'Орк', en: 'Orc', size: 'medium', type: 'humanoid', tags: ['humanoid', 'orc'], align: 'хаотично-злой', icon: '👹',
      ac: 13, acNote: 'шкурный доспех', hp: 15, hd: '2d8+6', speed: { walk: 30 }, abil: A(16, 12, 16, 7, 11, 10), skills: { intimidation: 2 },
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: 'Общий, Орочий', cr: '1/2', flags: { aggressive: true },
      traits: [T('Агрессивный', 'Бонусным действием орк может переместиться на расстояние, не превышающее его скорость, к враждебному существу, которое он видит.')],
      actions: [mw('greataxe', 'Секира', 5, [d('1d12+3', 'slashing')]), mrw('javelin', 'Метательное копьё', 5, [30, 120], [d('1d6+3', 'piercing')])] },
    { id: 'hobgoblin', name: 'Хобгоблин', en: 'Hobgoblin', size: 'medium', type: 'humanoid', tags: ['humanoid', 'goblinoid'], align: 'законно-злой', icon: '🎎',
      ac: 18, acNote: 'кольчуга, щит', hp: 11, hd: '2d8+2', speed: { walk: 30 }, abil: A(13, 12, 12, 10, 10, 9),
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: 'Общий, Гоблинский', cr: '1/2', flags: { martialAdvantage: '2d6' },
      traits: [T('Воинское превосходство', 'Один раз в ход хобгоблин может причинить дополнительно 7 (2d6) урона существу, по которому попал атакой оружием, если в пределах 5 фт. от цели есть его дееспособный союзник.')],
      actions: [mw('longsword', 'Длинный меч', 3, [d('1d8+1', 'slashing')]), rw('longbow', 'Длинный лук', 3, [150, 600], [d('1d8+1', 'piercing')])] },
    { id: 'gnoll', name: 'Гнолл', en: 'Gnoll', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'хаотично-злой', icon: '🐆',
      ac: 15, acNote: 'шкурный доспех, щит', hp: 22, hd: '5d8', speed: { walk: 30 }, abil: A(14, 12, 11, 6, 10, 7),
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: 'Гнолльский', cr: '1/2', flags: { rampage: true },
      traits: [T('Неистовство', 'Если гнолл в свой ход опускает хиты существа до 0 рукопашной атакой, он может бонусным действием переместиться на половину скорости и совершить атаку укусом.')],
      actions: [mw('bite', 'Укус', 4, [d('1d4+2', 'piercing')]), mrw('spear', 'Копьё', 4, [20, 60], [d('1d6+2', 'piercing')]), rw('longbow', 'Длинный лук', 3, [150, 600], [d('1d8+1', 'piercing')])] },
    { id: 'thug', name: 'Головорез', en: 'Thug', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое не доброе', icon: '👊',
      ac: 11, acNote: 'кожаный доспех', hp: 32, hd: '5d8+10', speed: { walk: 30 }, abil: A(15, 11, 14, 10, 10, 11), skills: { intimidation: 2 },
      senses: 'пассивное Восприятие 10', lang: 'любой один язык', cr: '1/2', flags: { packTactics: true },
      traits: [T('Тактика стаи', 'Преимущество на атаку, если в пределах 5 фт. от цели есть дееспособный союзник.')],
      actions: [multi('Головорез совершает две рукопашные атаки.', ['mace', 'mace']), mw('mace', 'Булава', 4, [d('1d6+2', 'bludgeoning')]),
        rw('heavycrossbow', 'Тяжёлый арбалет', 2, [100, 400], [d('1d10', 'piercing')])] },
    { id: 'blackbear', name: 'Чёрный медведь', en: 'Black Bear', size: 'medium', type: 'beast', align: 'без мировоззрения', icon: '🐻',
      ac: 11, acNote: 'природный доспех', hp: 19, hd: '3d8+6', speed: { walk: 40, climb: 30 }, abil: A(15, 10, 14, 2, 12, 7), skills: { perception: 3 },
      senses: 'пассивное Восприятие 13', lang: '—', cr: '1/2',
      actions: [multi('Медведь совершает две атаки: одну укусом и одну когтями.', ['bite', 'claws']), mw('bite', 'Укус', 3, [d('1d6+2', 'piercing')]), mw('claws', 'Когти', 3, [d('2d4+2', 'slashing')])] },
    { id: 'worg', name: 'Ворг', en: 'Worg', size: 'large', type: 'monstrosity', align: 'нейтрально-злой', icon: '🐺',
      ac: 13, acNote: 'природный доспех', hp: 26, hd: '4d10+4', speed: { walk: 50 }, abil: A(16, 13, 13, 7, 11, 8), skills: { perception: 4 },
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 14', lang: 'Гоблинский, Ворговый', cr: '1/2',
      actions: [mw('bite', 'Укус', 5, [d('2d6+3', 'piercing')], { onHit: { save: 'str', dc: 13, condition: 'prone', text: 'Цель должна преуспеть в спасброске Силы со Сл 13, иначе будет сбита с ног.' } })] },
    { id: 'lizardfolk', name: 'Ящеролюд', en: 'Lizardfolk', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'нейтральный', icon: '🐊',
      ac: 15, acNote: 'природный доспех, щит', hp: 22, hd: '4d8+4', speed: { walk: 30, swim: 30 }, abil: A(15, 10, 13, 7, 12, 7), skills: { perception: 3, stealth: 4, survival: 5 },
      senses: 'пассивное Восприятие 13', lang: 'Драконий', cr: '1/2',
      actions: [multi('Ящеролюд совершает две рукопашные атаки, каждую разным оружием.', ['bite', 'club'], ['bite', 'shield'], ['club', 'shield']),
        mw('bite', 'Укус', 4, [d('1d6+2', 'piercing')]), mw('club', 'Тяжёлая дубина', 4, [d('1d6+2', 'bludgeoning')]),
        mrw('javelin', 'Метательное копьё', 4, [30, 120], [d('1d6+2', 'piercing')]), mw('shield', 'Шипастый щит', 4, [d('1d6+2', 'piercing')])] },

    // ---------------- ПО 1 ----------------
    { id: 'ghoul', name: 'Гуль', en: 'Ghoul', size: 'medium', type: 'undead', align: 'хаотично-злой', icon: '🦴',
      ac: 12, hp: 22, hd: '5d8', speed: { walk: 30 }, abil: A(13, 15, 10, 7, 10, 6), immune: ['poison'], condImmune: ['charmed', 'poisoned'],
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: 'Общий', cr: '1',
      actions: [mw('bite', 'Укус', 2, [d('2d6+2', 'piercing')]),
        mw('claws', 'Когти', 4, [d('2d4+2', 'slashing')], { onHit: { save: 'con', dc: 10, condition: 'paralyzed', repeat: true, rounds: 10, notTypes: ['undead'], notRace: 'elf', text: 'Если цель — существо, не являющееся эльфом или нежитью, она должна преуспеть в спасброске Телосложения со Сл 10, иначе станет парализованной на 1 минуту (повтор спасброска в конце каждого её хода).' } })] },
    { id: 'bugbear', name: 'Багбир', en: 'Bugbear', size: 'medium', type: 'humanoid', tags: ['humanoid', 'goblinoid'], align: 'хаотично-злой', icon: '🧸',
      ac: 16, acNote: 'шкурный доспех, щит', hp: 27, hd: '5d8+5', speed: { walk: 30 }, abil: A(15, 14, 13, 8, 11, 9), skills: { stealth: 6, survival: 2 },
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: 'Общий, Гоблинский', cr: '1',
      traits: [T('Громила', 'Рукопашное оружие наносит одну дополнительную кость урона (учтено).')],
      actions: [mw('morningstar', 'Моргенштерн', 4, [d('2d8+2', 'piercing')]), mrw('javelin', 'Метательное копьё', 4, [30, 120], [d('2d6+2', 'piercing')], { rangedDmg: [d('1d6+2', 'piercing')] })] },
    { id: 'giantspider', name: 'Гигантский паук', en: 'Giant Spider', size: 'large', type: 'beast', align: 'без мировоззрения', icon: '🕷️',
      ac: 14, acNote: 'природный доспех', hp: 26, hd: '4d10+4', speed: { walk: 30, climb: 30 }, abil: A(14, 16, 12, 2, 11, 4), skills: { stealth: 7 },
      senses: 'слепое зрение 10 фт., тёмное зрение 60 фт., пассивное Восприятие 10', lang: '—', cr: '1', flags: { webWalker: true },
      traits: [T('Паучье лазание', 'Может лазать по сложным поверхностям, включая потолок.'), T('Хождение по паутине', 'Игнорирует ограничения перемещения, вызванные паутиной.')],
      actions: [mw('bite', 'Укус', 5, [d('1d8+3', 'piercing')], { onHit: { save: 'con', dc: 11, damage: [d('2d8', 'poison')], half: true, text: 'Цель должна совершить спасбросок Телосложения со Сл 11, получая 9 (2d8) урона ядом при провале или половину при успехе.' } }),
        rw('web', 'Паутина (перезарядка 5–6)', 5, [30, 60], [], { recharge: 5, onHit: { condition: 'restrained', escapeDC: 12, text: 'Цель опутана паутиной. Действием можно попытаться высвободиться (проверка Силы Сл 12).' } })] },
    { id: 'brownbear', name: 'Бурый медведь', en: 'Brown Bear', size: 'large', type: 'beast', align: 'без мировоззрения', icon: '🐻',
      ac: 11, acNote: 'природный доспех', hp: 34, hd: '4d10+12', speed: { walk: 40, climb: 30 }, abil: A(19, 10, 16, 2, 13, 7), skills: { perception: 3 },
      senses: 'пассивное Восприятие 13', lang: '—', cr: '1',
      actions: [multi('Медведь совершает две атаки: одну укусом и одну когтями.', ['bite', 'claws']), mw('bite', 'Укус', 6, [d('1d8+4', 'piercing')]), mw('claws', 'Когти', 6, [d('2d6+4', 'slashing')])] },
    { id: 'direwolf', name: 'Лютоволк', en: 'Dire Wolf', size: 'large', type: 'beast', align: 'без мировоззрения', icon: '🐺',
      ac: 14, acNote: 'природный доспех', hp: 37, hd: '5d10+10', speed: { walk: 50 }, abil: A(17, 15, 15, 3, 12, 7), skills: { perception: 3, stealth: 4 },
      senses: 'пассивное Восприятие 13', lang: '—', cr: '1', flags: { packTactics: true },
      traits: [T('Тактика стаи', 'Преимущество на атаку, если в пределах 5 фт. от цели есть дееспособный союзник.')],
      actions: [mw('bite', 'Укус', 5, [d('2d6+3', 'piercing')], { onHit: { save: 'str', dc: 13, condition: 'prone', text: 'Цель должна преуспеть в спасброске Силы со Сл 13, иначе будет сбита с ног.' } })] },
    { id: 'harpy', name: 'Гарпия', en: 'Harpy', size: 'medium', type: 'monstrosity', align: 'хаотично-злой', icon: '🦅',
      ac: 11, hp: 38, hd: '7d8+7', speed: { walk: 20, fly: 40 }, abil: A(12, 13, 12, 7, 10, 13), senses: 'пассивное Восприятие 10', lang: 'Общий', cr: '1',
      actions: [multi('Гарпия совершает две атаки: одну когтями и одну дубинкой.', ['claws', 'club']), mw('claws', 'Когти', 3, [d('2d4+1', 'slashing')]), mw('club', 'Дубинка', 3, [d('1d4+1', 'bludgeoning')])] },

    // ---------------- ПО 2 ----------------
    { id: 'ogre', name: 'Огр', en: 'Ogre', size: 'large', type: 'giant', align: 'хаотично-злой', icon: '🦍',
      ac: 11, acNote: 'шкурный доспех', hp: 59, hd: '7d10+21', speed: { walk: 40 }, abil: A(19, 8, 16, 5, 7, 7),
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 8', lang: 'Общий, Великаний', cr: '2',
      actions: [mw('greatclub', 'Палица', 6, [d('2d8+4', 'bludgeoning')]), mrw('javelin', 'Метательное копьё', 6, [30, 120], [d('2d6+4', 'piercing')])] },
    { id: 'ghast', name: 'Гаст', en: 'Ghast', size: 'medium', type: 'undead', align: 'хаотично-злой', icon: '🤮',
      ac: 13, hp: 36, hd: '8d8', speed: { walk: 30 }, abil: A(16, 17, 10, 11, 10, 8), resist: ['necrotic'], immune: ['poison'], condImmune: ['charmed', 'poisoned'],
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: 'Общий', cr: '2', flags: { stench: { dc: 10 } },
      traits: [T('Зловоние', 'Любое существо, начинающее ход в пределах 5 фт. от гаста, должно преуспеть в спасброске Телосложения со Сл 10, иначе станет отравленным до начала своего следующего хода.')],
      actions: [mw('bite', 'Укус', 3, [d('2d8+3', 'piercing')]),
        mw('claws', 'Когти', 5, [d('2d6+3', 'slashing')], { onHit: { save: 'con', dc: 10, condition: 'paralyzed', repeat: true, rounds: 10, notTypes: ['undead'], text: 'Если цель — не нежить, она должна преуспеть в спасброске Телосложения со Сл 10, иначе станет парализованной на 1 минуту.' } })] },
    { id: 'berserker', name: 'Берсерк', en: 'Berserker', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое хаотичное', icon: '😡',
      ac: 13, acNote: 'шкурный доспех', hp: 67, hd: '9d8+27', speed: { walk: 30 }, abil: A(16, 12, 17, 9, 11, 9), senses: 'пассивное Восприятие 10', lang: 'любой один язык', cr: '2',
      flags: { reckless: true },
      traits: [T('Безрассудство', 'В начале своего хода берсерк может получить преимущество на все рукопашные атаки оружием в этот ход, но атаки по нему совершаются с преимуществом до начала его следующего хода.')],
      actions: [mw('greataxe', 'Секира', 5, [d('1d12+3', 'slashing')])] },
    { id: 'banditcaptain', name: 'Капитан бандитов', en: 'Bandit Captain', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое не законное', icon: '🤠',
      ac: 15, acNote: 'проклёпанный кожаный доспех', hp: 65, hd: '10d8+20', speed: { walk: 30 }, abil: A(15, 16, 14, 14, 11, 14), saves: { str: 4, dex: 5, wis: 2 },
      skills: { athletics: 4, deception: 4 }, senses: 'пассивное Восприятие 10', lang: 'любые два языка', cr: '2', flags: { parry: 2 },
      traits: [T('Парирование (реакция)', 'Капитан добавляет 2 к КД против одной рукопашной атаки, которая должна попасть по нему.')],
      actions: [multi('Капитан совершает три рукопашные атаки: две скимитаром и одну кинжалом. Или две дальнобойные атаки кинжалами.', ['scimitar', 'scimitar', 'dagger'], ['dagger', 'dagger']),
        mw('scimitar', 'Скимитар', 5, [d('1d6+3', 'slashing')]), mrw('dagger', 'Кинжал', 5, [20, 60], [d('1d4+3', 'piercing')])] },
    { id: 'priest', name: 'Священник', en: 'Priest', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое мировоззрение', icon: '⛪',
      ac: 13, acNote: 'кольчужная рубаха', hp: 27, hd: '5d8+5', speed: { walk: 30 }, abil: A(10, 10, 12, 13, 16, 13), skills: { medicine: 7, persuasion: 3, religion: 4 },
      senses: 'пассивное Восприятие 13', lang: 'любые два языка', cr: '2',
      spellcasting: { ability: 'wis', dc: 13, toHit: 5, slots: { 1: 4, 2: 3, 3: 2 }, spells: ['sacredflame', 'curewounds', 'guidingbolt', 'spiritualweapon', 'lesserrestoration', 'spiritguardians'] },
      traits: [T('Использование заклинаний', 'Заклинатель 5 уровня (Мудрость, Сл 13, +5). Заговоры: священное пламя. 1 ур. (4): лечение ран, направленный снаряд. 2 ур. (3): малое восстановление, божественное оружие. 3 ур. (2): духовные стражи.')],
      actions: [mw('mace', 'Булава', 2, [d('1d6', 'bludgeoning')])] },
    { id: 'whitewyrmling', name: 'Белый дракон, вирмлинг', en: 'White Dragon Wyrmling', size: 'medium', type: 'dragon', align: 'хаотично-злой', icon: '🐉',
      ac: 16, acNote: 'природный доспех', hp: 32, hd: '5d8+10', speed: { walk: 30, burrow: 15, fly: 60, swim: 30 }, abil: A(14, 10, 14, 5, 10, 11),
      saves: { dex: 2, con: 4, wis: 2, cha: 2 }, skills: { perception: 4, stealth: 2 }, immune: ['cold'],
      senses: 'слепое зрение 10 фт., тёмное зрение 60 фт., пассивное Восприятие 14', lang: 'Драконий', cr: '2',
      actions: [mw('bite', 'Укус', 4, [d('1d10+2', 'piercing'), d('1d4', 'cold')]), breath('breath', 'Холодное дыхание (перезарядка 5–6)', 'cone', 15, 'con', 12, [d('5d8', 'cold')])] },
    { id: 'greenwyrmling', name: 'Зелёный дракон, вирмлинг', en: 'Green Dragon Wyrmling', size: 'medium', type: 'dragon', align: 'законно-злой', icon: '🐉',
      ac: 17, acNote: 'природный доспех', hp: 38, hd: '7d8+7', speed: { walk: 30, fly: 60, swim: 30 }, abil: A(15, 12, 13, 14, 11, 13),
      saves: { dex: 3, con: 3, wis: 2, cha: 3 }, skills: { perception: 4, stealth: 3 }, immune: ['poison'], condImmune: ['poisoned'],
      senses: 'слепое зрение 10 фт., тёмное зрение 60 фт., пассивное Восприятие 14', lang: 'Драконий', cr: '2',
      actions: [mw('bite', 'Укус', 4, [d('1d10+2', 'piercing'), d('1d6', 'poison')]), breath('breath', 'Ядовитое дыхание (перезарядка 5–6)', 'cone', 15, 'con', 11, [d('6d6', 'poison')])] },
    { id: 'blackwyrmling', name: 'Чёрный дракон, вирмлинг', en: 'Black Dragon Wyrmling', size: 'medium', type: 'dragon', align: 'хаотично-злой', icon: '🐉',
      ac: 17, acNote: 'природный доспех', hp: 33, hd: '6d8+6', speed: { walk: 30, fly: 60, swim: 30 }, abil: A(15, 14, 13, 10, 11, 13),
      saves: { dex: 4, con: 3, wis: 2, cha: 3 }, skills: { perception: 4, stealth: 4 }, immune: ['acid'],
      senses: 'слепое зрение 10 фт., тёмное зрение 60 фт., пассивное Восприятие 14', lang: 'Драконий', cr: '2',
      actions: [mw('bite', 'Укус', 4, [d('1d10+2', 'piercing'), d('1d4', 'acid')]), breath('breath', 'Кислотное дыхание (перезарядка 5–6)', 'line', 15, 'dex', 11, [d('5d8', 'acid')])] },

    // ---------------- ПО 3 ----------------
    { id: 'bluewyrmling', name: 'Синий дракон, вирмлинг', en: 'Blue Dragon Wyrmling', size: 'medium', type: 'dragon', align: 'законно-злой', icon: '🐉',
      ac: 17, acNote: 'природный доспех', hp: 52, hd: '8d8+16', speed: { walk: 30, burrow: 15, fly: 60 }, abil: A(17, 10, 15, 12, 11, 15),
      saves: { dex: 2, con: 4, wis: 2, cha: 4 }, skills: { perception: 4, stealth: 2 }, immune: ['lightning'],
      senses: 'слепое зрение 10 фт., тёмное зрение 60 фт., пассивное Восприятие 14', lang: 'Драконий', cr: '3',
      actions: [mw('bite', 'Укус', 5, [d('1d10+3', 'piercing'), d('1d6', 'lightning')]), breath('breath', 'Дыхание молнией (перезарядка 5–6)', 'line', 30, 'dex', 12, [d('4d10', 'lightning')])] },
    { id: 'hellhound', name: 'Адская гончая', en: 'Hell Hound', size: 'medium', type: 'fiend', align: 'законно-злой', icon: '🐕',
      ac: 15, acNote: 'природный доспех', hp: 45, hd: '7d8+14', speed: { walk: 50 }, abil: A(17, 12, 14, 6, 13, 6), skills: { perception: 5 }, immune: ['fire'],
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 15', lang: 'понимает Инфернальный, но не говорит', cr: '3', flags: { packTactics: true },
      traits: [T('Тактика стаи', 'Преимущество на атаку, если в пределах 5 фт. от цели есть дееспособный союзник.')],
      actions: [mw('bite', 'Укус', 5, [d('1d8+3', 'piercing'), d('2d6', 'fire')]), breath('breath', 'Огненное дыхание (перезарядка 5–6)', 'cone', 15, 'dex', 12, [d('6d6', 'fire')])] },
    { id: 'knight', name: 'Рыцарь', en: 'Knight', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое мировоззрение', icon: '🤺',
      ac: 18, acNote: 'латы', hp: 52, hd: '8d8+16', speed: { walk: 30 }, abil: A(16, 11, 14, 11, 11, 15), saves: { con: 4, wis: 2 },
      senses: 'пассивное Восприятие 10', lang: 'любой один язык (обычно Общий)', cr: '3', flags: { brave: true, parry: 2 },
      traits: [T('Храбрый', 'Преимущество на спасброски от испуга.'), T('Парирование (реакция)', '+2 к КД против одной рукопашной атаки, которая должна попасть.')],
      actions: [multi('Рыцарь совершает две рукопашные атаки.', ['greatsword', 'greatsword']), mw('greatsword', 'Двуручный меч', 5, [d('2d6+3', 'slashing')]),
        rw('heavycrossbow', 'Тяжёлый арбалет', 2, [100, 400], [d('1d10', 'piercing')])] },
    { id: 'veteran', name: 'Ветеран', en: 'Veteran', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое мировоззрение', icon: '🎖️',
      ac: 17, acNote: 'наборный доспех', hp: 58, hd: '9d8+18', speed: { walk: 30 }, abil: A(16, 13, 14, 10, 11, 10), skills: { athletics: 5, perception: 2 },
      senses: 'пассивное Восприятие 12', lang: 'любой один язык (обычно Общий)', cr: '3',
      actions: [multi('Ветеран совершает две атаки длинным мечом и одну — коротким мечом.', ['longsword', 'longsword', 'shortsword'], ['heavycrossbow', 'heavycrossbow']),
        mw('longsword', 'Длинный меч', 5, [d('1d8+3', 'slashing')]), mw('shortsword', 'Короткий меч', 5, [d('1d6+3', 'piercing')]),
        rw('heavycrossbow', 'Тяжёлый арбалет', 3, [100, 400], [d('1d10+1', 'piercing')])] },
    { id: 'mummy', name: 'Мумия', en: 'Mummy', size: 'medium', type: 'undead', align: 'законно-злой', icon: '🤕',
      ac: 11, acNote: 'природный доспех', hp: 58, hd: '9d8+18', speed: { walk: 20 }, abil: A(16, 8, 15, 6, 10, 12), saves: { wis: 2 },
      vuln: ['fire'], resistNonmagical: true, immune: ['necrotic', 'poison'], condImmune: ['charmed', 'frightened', 'paralyzed', 'poisoned'],
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 10', lang: 'языки, известные при жизни', cr: '3',
      actions: [multi('Мумия использует Ужасающий взгляд и совершает одну атаку гниющим кулаком.', ['glare', 'fist']),
        mw('fist', 'Гниющий кулак', 5, [d('2d6+3', 'bludgeoning'), d('3d6', 'necrotic')]),
        { id: 'glare', name: 'Ужасающий взгляд', type: 'gaze', range: 60, save: 'wis', dc: 11, condition: 'frightened', untilEndOfSourceNextTurn: true,
          desc: 'Одно существо в пределах 60 фт. должно преуспеть в спасброске Мудрости со Сл 11, иначе станет испуганным до конца следующего хода мумии.' }] },
    { id: 'wight', name: 'Умертвие', en: 'Wight', size: 'medium', type: 'undead', align: 'нейтрально-злой', icon: '👻',
      ac: 14, acNote: 'проклёпанный кожаный доспех', hp: 45, hd: '6d8+18', speed: { walk: 30 }, abil: A(15, 14, 16, 10, 13, 15), skills: { perception: 3, stealth: 4 },
      resist: ['necrotic'], resistNonmagical: true, immune: ['poison'], condImmune: ['poisoned'],
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 13', lang: 'языки, известные при жизни', cr: '3',
      actions: [multi('Умертвие совершает две атаки длинным мечом или две — длинным луком. Одну атаку мечом можно заменить Высасыванием жизни.', ['longsword', 'longsword'], ['lifedrain', 'longsword'], ['longbow', 'longbow']),
        mw('lifedrain', 'Высасывание жизни', 4, [d('1d6+2', 'necrotic')]), mw('longsword', 'Длинный меч', 4, [d('1d8+2', 'slashing')]),
        rw('longbow', 'Длинный лук', 4, [150, 600], [d('1d8+2', 'piercing')])] },
    { id: 'minotaur', name: 'Минотавр', en: 'Minotaur', size: 'large', type: 'monstrosity', align: 'хаотично-злой', icon: '🐂',
      ac: 14, acNote: 'природный доспех', hp: 76, hd: '9d10+27', speed: { walk: 40 }, abil: A(18, 11, 16, 6, 16, 9), skills: { perception: 7 },
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 17', lang: 'Бездны', cr: '3',
      flags: { reckless: true, charge: { dist: 10, attack: 'gore', dmg: [d('2d8', 'piercing')], save: 'str', dc: 14, prone: true, push: 10 } },
      traits: [T('Атака в броске', 'Если минотавр переместится как минимум на 10 фт. по прямой к цели и попадёт рогами, цель получает дополнительно 9 (2d8) колющего урона и должна преуспеть в спасброске Силы со Сл 14, иначе её оттолкнёт на 10 фт. и собьёт с ног.'),
        T('Безрассудство', 'В начале хода может получить преимущество на все рукопашные атаки, но атаки по нему тоже с преимуществом.')],
      actions: [mw('greataxe', 'Секира', 6, [d('2d12+4', 'slashing')]), mw('gore', 'Бодание', 6, [d('2d8+4', 'piercing')])] },
    { id: 'owlbear', name: 'Совомед', en: 'Owlbear', size: 'large', type: 'monstrosity', align: 'без мировоззрения', icon: '🦉',
      ac: 13, acNote: 'природный доспех', hp: 59, hd: '7d10+21', speed: { walk: 40 }, abil: A(20, 12, 17, 3, 12, 7), skills: { perception: 3 },
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 13', lang: '—', cr: '3',
      actions: [multi('Совомед совершает две атаки: одну клювом и одну когтями.', ['beak', 'claws']), mw('beak', 'Клюв', 7, [d('1d10+5', 'piercing')]), mw('claws', 'Когти', 7, [d('2d8+5', 'slashing')])] },
    { id: 'manticore', name: 'Мантикора', en: 'Manticore', size: 'large', type: 'monstrosity', align: 'законно-злой', icon: '🦁',
      ac: 14, acNote: 'природный доспех', hp: 68, hd: '8d10+24', speed: { walk: 30, fly: 50 }, abil: A(17, 16, 17, 7, 12, 8),
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 11', lang: 'Общий', cr: '3',
      actions: [multi('Мантикора совершает три атаки: одну укусом и две когтями, или три атаки шипами хвоста.', ['bite', 'claw', 'claw'], ['spike', 'spike', 'spike']),
        mw('bite', 'Укус', 5, [d('1d8+3', 'piercing')]), mw('claw', 'Коготь', 5, [d('1d6+3', 'slashing')]), rw('spike', 'Шип хвоста', 5, [100, 200], [d('1d8+3', 'piercing')])] },

    // ---------------- ПО 4–6 ----------------
    { id: 'redwyrmling', name: 'Красный дракон, вирмлинг', en: 'Red Dragon Wyrmling', size: 'medium', type: 'dragon', align: 'хаотично-злой', icon: '🐲',
      ac: 17, acNote: 'природный доспех', hp: 75, hd: '10d8+30', speed: { walk: 30, climb: 30, fly: 60 }, abil: A(19, 10, 17, 12, 11, 15),
      saves: { dex: 2, con: 5, wis: 2, cha: 4 }, skills: { perception: 4, stealth: 2 }, immune: ['fire'],
      senses: 'слепое зрение 10 фт., тёмное зрение 60 фт., пассивное Восприятие 14', lang: 'Драконий', cr: '4',
      actions: [mw('bite', 'Укус', 6, [d('1d10+4', 'piercing'), d('1d6', 'fire')]), breath('breath', 'Огненное дыхание (перезарядка 5–6)', 'cone', 15, 'dex', 13, [d('7d6', 'fire')])] },
    { id: 'troll', name: 'Тролль', en: 'Troll', size: 'large', type: 'giant', align: 'хаотично-злой', icon: '🦧',
      ac: 15, acNote: 'природный доспех', hp: 84, hd: '8d10+40', speed: { walk: 30 }, abil: A(18, 13, 20, 7, 9, 7), skills: { perception: 2 },
      senses: 'тёмное зрение 60 фт., пассивное Восприятие 12', lang: 'Великаний', cr: '5', flags: { regeneration: { amount: 10, blockedBy: ['acid', 'fire'] } },
      traits: [T('Регенерация', 'Тролль восстанавливает 10 хитов в начале своего хода. Если он получает урон кислотой или огнём, эта особенность не действует в начале его следующего хода. Тролль умирает, только если начинает ход с 0 хитов и не регенерирует.')],
      actions: [multi('Тролль совершает три атаки: одну укусом и две когтями.', ['bite', 'claw', 'claw']), mw('bite', 'Укус', 7, [d('1d6+4', 'piercing')]), mw('claw', 'Коготь', 7, [d('2d6+4', 'slashing')])] },
    { id: 'hillgiant', name: 'Холмовой великан', en: 'Hill Giant', size: 'huge', type: 'giant', align: 'хаотично-злой', icon: '⛰️',
      ac: 13, acNote: 'природный доспех', hp: 105, hd: '10d12+40', speed: { walk: 40 }, abil: A(21, 8, 19, 5, 9, 6), skills: { perception: 2 },
      senses: 'пассивное Восприятие 12', lang: 'Великаний', cr: '5',
      actions: [multi('Великан совершает две атаки палицей.', ['greatclub', 'greatclub']), mw('greatclub', 'Палица', 8, [d('3d8+5', 'bludgeoning')], { reach: 10 }),
        rw('rock', 'Камень', 8, [60, 240], [d('3d10+5', 'bludgeoning')])] },
    { id: 'mage', name: 'Маг', en: 'Mage', size: 'medium', type: 'humanoid', tags: ['humanoid'], align: 'любое мировоззрение', icon: '🧙',
      ac: 15, acNote: '12 без доспехов мага', hp: 40, hd: '9d8', speed: { walk: 30 }, abil: A(9, 14, 11, 17, 12, 11), saves: { int: 6, wis: 4 }, skills: { arcana: 6, history: 6 },
      senses: 'пассивное Восприятие 11', lang: 'любые четыре языка', cr: '6',
      spellcasting: { ability: 'int', dc: 14, toHit: 6, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 }, spells: ['firebolt', 'magicmissile', 'shield', 'mistystep', 'fireball', 'icestorm', 'coneofcold'], casterLevel: 9 },
      traits: [T('Использование заклинаний', 'Заклинатель 9 уровня (Интеллект, Сл 14, +6). Заговоры: огненный снаряд. 1 ур. (4): волшебная стрела, щит, доспехи мага. 2 ур. (3): туманный шаг. 3 ур. (3): огненный шар. 4 ур. (3): град. 5 ур. (1): конус холода.')],
      actions: [mrw('dagger', 'Кинжал', 5, [20, 60], [d('1d4+2', 'piercing')])] },

    // ---------------- ПО 8+ ----------------
    { id: 'trex', name: 'Тираннозавр', en: 'Tyrannosaurus Rex', size: 'huge', type: 'beast', align: 'без мировоззрения', icon: '🦖',
      ac: 13, acNote: 'природный доспех', hp: 136, hd: '13d12+52', speed: { walk: 50 }, abil: A(25, 10, 19, 2, 12, 9), skills: { perception: 4 },
      senses: 'пассивное Восприятие 14', lang: '—', cr: '8',
      actions: [multi('Тираннозавр совершает две атаки: одну укусом и одну хвостом (по разным целям).', ['bite', 'tail']),
        mw('bite', 'Укус', 10, [d('4d12+7', 'piercing')], { reach: 10, onHit: { condition: 'grappled', alsoRestrained: true, escapeDC: 17, sizeMax: 'medium', text: 'Если цель Средняя или меньше, она схвачена (Сл высвобождения 17) и опутана.' } }),
        mw('tail', 'Хвост', 10, [d('3d8+7', 'bludgeoning')], { reach: 10 })] },
    { id: 'youngreddragon', name: 'Молодой красный дракон', en: 'Young Red Dragon', size: 'large', type: 'dragon', align: 'хаотично-злой', icon: '🐲',
      ac: 18, acNote: 'природный доспех', hp: 178, hd: '17d10+85', speed: { walk: 40, climb: 40, fly: 80 }, abil: A(23, 10, 21, 14, 11, 19),
      saves: { dex: 4, con: 9, wis: 4, cha: 8 }, skills: { perception: 8, stealth: 4 }, immune: ['fire'],
      senses: 'слепое зрение 30 фт., тёмное зрение 120 фт., пассивное Восприятие 18', lang: 'Общий, Драконий', cr: '10',
      actions: [multi('Дракон совершает три атаки: одну укусом и две когтями.', ['bite', 'claw', 'claw']),
        mw('bite', 'Укус', 10, [d('2d10+6', 'piercing'), d('1d6', 'fire')], { reach: 10 }), mw('claw', 'Коготь', 10, [d('2d6+6', 'slashing')]),
        breath('breath', 'Огненное дыхание (перезарядка 5–6)', 'cone', 30, 'dex', 17, [d('16d6', 'fire')])] },
    { id: 'adultreddragon', name: 'Взрослый красный дракон', en: 'Adult Red Dragon', size: 'huge', type: 'dragon', align: 'хаотично-злой', icon: '🐉',
      ac: 19, acNote: 'природный доспех', hp: 256, hd: '19d12+133', speed: { walk: 40, climb: 40, fly: 80 }, abil: A(27, 10, 25, 16, 13, 21),
      saves: { dex: 6, con: 13, wis: 7, cha: 11 }, skills: { perception: 13, stealth: 6 }, immune: ['fire'],
      senses: 'слепое зрение 60 фт., тёмное зрение 120 фт., пассивное Восприятие 23', lang: 'Общий, Драконий', cr: '17', flags: { legendaryResistance: 3 },
      traits: [T('Легендарное сопротивление (3/день)', 'Если дракон проваливает спасбросок, он может вместо этого сделать его успешным.')],
      actions: [multi('Дракон может использовать Ужасающую внешность. Затем он совершает три атаки: одну укусом и две когтями.', ['presence', 'bite', 'claw', 'claw'], ['bite', 'claw', 'claw'], ['tail', 'claw', 'claw']),
        mw('bite', 'Укус', 14, [d('2d10+8', 'piercing'), d('2d6', 'fire')], { reach: 10 }), mw('claw', 'Коготь', 14, [d('2d6+8', 'slashing')]),
        mw('tail', 'Хвост', 14, [d('2d8+8', 'bludgeoning')], { reach: 15 }),
        { id: 'presence', name: 'Ужасающая внешность', type: 'aoeCondition', range: 120, save: 'wis', dc: 19, condition: 'frightened', repeat: true, rounds: 10, once: true,
          desc: 'Все враги в пределах 120 фт. проходят спасбросок Мудрости со Сл 19, иначе становятся испуганными на 1 минуту (повтор в конце каждого хода).' },
        breath('breath', 'Огненное дыхание (перезарядка 5–6)', 'cone', 60, 'dex', 21, [d('18d6', 'fire')])] },
  ];

  // Производные поля
  for (const m of M) {
    m.xp = D.R.CR_XP[m.cr] || 0;
    m.prof = D.R.crProf(m.cr);
    m.flags = m.flags || {};
    m.traits = m.traits || [];
    m.custom = false;
  }

  D.MONSTERS = M;
  D.monster = (id) => M.find((m) => m.id === id) || (D.customMonsters || []).find((m) => m.id === id);

  /* Текст действия для статблока */
  D.dmgPhrase = function (type) {
    const phys = { bludgeoning: 'дробящего урона', piercing: 'колющего урона', slashing: 'рубящего урона' };
    return phys[type] || 'урона ' + D.R.DAMAGE_TYPES[type];
  };

  D.describeAction = function (a) {
    const U = D.U;
    const dmgText = (arr) =>
      arr
        .map((x) => {
          const avg = Math.floor(D.Dice.average(x.dice));
          return avg + ' (' + x.dice.replace(/\+/, ' + ').replace(/-/, ' − ') + ') ' + D.dmgPhrase(x.type);
        })
        .join(' плюс ');
    if (a.type === 'multi' || a.type === 'gaze' || a.type === 'aoeCondition') return a.desc;
    if (a.type === 'area') {
      const shape = { cone: 'конусом', line: 'линией', sphere: 'сферой' }[a.area.shape] || '';
      return 'Существо выдыхает энергию ' + a.area.size + '-футовым ' + shape + (a.area.shape === 'line' ? ' шириной 5 фт.' : '') +
        '. Все в этой области должны совершить спасбросок ' + D.R.ABILITY_GEN[a.save] +
        ' со Сл ' + a.dc + ', получая ' + dmgText(a.dmg) + ' при провале или половину при успехе.';
    }
    let s = '';
    if (a.type === 'mw') s = 'Рукопашная атака оружием: ' + U.fmtMod(a.toHit) + ' к попаданию, досягаемость ' + (a.reach || 5) + ' фт., одна цель.';
    else if (a.type === 'rw') s = 'Дальнобойная атака оружием: ' + U.fmtMod(a.toHit) + ' к попаданию, дистанция ' + a.range[0] + '/' + a.range[1] + ' фт., одна цель.';
    else if (a.type === 'mrw') s = 'Рукопашная или дальнобойная атака оружием: ' + U.fmtMod(a.toHit) + ' к попаданию, досягаемость ' + (a.reach || 5) + ' фт. или дистанция ' + a.range[0] + '/' + a.range[1] + ' фт., одна цель.';
    if (a.dmg && a.dmg.length) s += ' Попадание: ' + dmgText(a.dmg) + (a.rangedDmg ? ' или ' + dmgText(a.rangedDmg) + ' при дальнобойной атаке' : '') + '.';
    if (a.onHit && a.onHit.text) s += ' ' + a.onHit.text;
    return s;
  };
})(typeof window !== 'undefined' ? window : globalThis);
