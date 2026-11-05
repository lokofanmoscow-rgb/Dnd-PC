/* Персонажи игроков: расчёт производных характеристик и превращение в участника боя */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const R = D.R;

  const Char = {};
  Char.MAX_LEVEL = 20;
  Char.STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
  Char.POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  Char.POINTS = 27;
  Char.COLORS = ['#3d7bd9', '#d9a43d', '#9b59b6', '#2bb3a6', '#e67e22', '#e84393', '#6ab04c', '#c0392b', '#7f8c8d', '#f1c40f'];
  Char.COMPANIONS = ['wolf', 'panther', 'boar', 'giant-badger', 'giant-poisonous-snake', 'giant-wolf-spider', 'mastiff', 'giant-crab', 'blood-hawk', 'giant-weasel'];
  Char.TOTEMS = { bear: 'Медведь', eagle: 'Орёл', wolf: 'Волк' };

  Char.blank = function () {
    const ch = {
      id: U.uid('pc'), name: 'Новый герой', player: '', race: 'human', subrace: '', cls: 'fighter', subclass: 'champion', level: 1,
      ancestry: 'red', totem: 'bear', companion: 'wolf', method: 'standard', base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
      raceChoice: [], asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, skills: [], fightingStyle: 'defense',
      armor: 'chainmail', armorMagic: 0, shield: true, weapons: [], artifacts: ['', '', ''], potions: 2, spells: [],
      color: Char.COLORS[Math.floor(Math.random() * Char.COLORS.length)], portrait: null,
    };
    Char.applyClassDefaults(ch);
    return ch;
  };

  Char.applyClassDefaults = function (ch) {
    const cls = D.cls(ch.cls);
    const arr = Char.STANDARD_ARRAY.slice();
    const base = {};
    cls.primary.forEach((ab, i) => (base[ab] = arr[i]));
    ch.base = base;
    ch.armor = cls.kit.armor;
    ch.armorMagic = 0;
    ch.shield = cls.kit.shield;
    ch.weapons = cls.kit.weapons.map((id) => ({ id, magic: 0 }));
    ch.skills = (cls.skills.list === 'any' ? Object.keys(R.SKILLS) : cls.skills.list).slice(0, cls.skills.count);
    ch.fightingStyle = cls.id === 'ranger' ? 'archery' : 'defense';
    if (!D.subclass(cls, ch.subclass)) ch.subclass = cls.subclasses[0].id;
    ch.spells = Char.defaultSpells(ch);
  };

  Char.subclassActive = (ch) => {
    const cls = D.cls(ch.cls);
    return ch.level >= (cls.subclassAt || 3) ? D.subclass(cls, ch.subclass) : null;
  };

  Char.casterOf = (ch) => D.casterOf(D.cls(ch.cls), ch.subclass, ch.level);

  Char.spellList = function (ch) {
    const cls = D.cls(ch.cls);
    const cs = Char.casterOf(ch);
    if (!cs) return [];
    const listId = cs.list || cls.id;
    return D.classSpells(listId, D.maxSpellLevel(cls, ch.level, ch.subclass));
  };

  /* Заклинания домена/клятвы/круга — всегда подготовлены */
  Char.bonusSpells = function (ch) {
    const sub = Char.subclassActive(ch);
    if (!sub || !sub.spells) return [];
    const out = [];
    for (const lv in sub.spells) if (ch.level >= Number(lv)) sub.spells[lv].forEach((id) => D.spell(id) && out.push(id));
    return out;
  };

  Char.defaultSpells = function (ch) {
    if (!Char.casterOf(ch)) return [];
    const lim = Char.spellLimits(ch);
    const all = Char.spellList(ch);
    const bonus = Char.bonusSpells(ch);
    const combat = (s) => (s.kind !== 'utility' && s.cast !== 'long' ? 1 : 0);
    const cantrips = all.filter((s) => s.level === 0).sort((a, b) => combat(b) - combat(a)).slice(0, lim.cantrips).map((s) => s.id);
    const leveled = all.filter((s) => s.level > 0 && !bonus.includes(s.id)).sort((a, b) => combat(b) - combat(a) || b.level - a.level).slice(0, lim.spells).map((s) => s.id);
    return cantrips.concat(leveled);
  };

  Char.spellLimits = function (ch) {
    const cs = Char.casterOf(ch);
    if (!cs) return { cantrips: 0, spells: 0 };
    const lv = U.clamp(ch.level, 1, 20);
    const cantrips = cs.cantrips[lv - 1] || 0;
    let spells = 0;
    if (cs.known) spells = cs.known[lv - 1];
    else {
      const m = U.mod(Char.finalAbilities(ch)[cs.ability]);
      spells = cs.prepared === 'half' ? Math.max(1, m + Math.floor(lv / 2)) : Math.max(1, m + lv);
      if (cs.prepared === 'half' && lv < 2) spells = 0;
    }
    return { cantrips, spells };
  };

  Char.raceBonus = function (ch) {
    const race = D.race(ch.race);
    const out = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 };
    for (const k in race.bonus) out[k] += race.bonus[k];
    const sub = race.subraces.find((s) => s.id === ch.subrace);
    if (sub && sub.bonus) for (const k in sub.bonus) out[k] += sub.bonus[k];
    if (race.chooseBonus) (ch.raceChoice || []).slice(0, race.chooseBonus).forEach((k) => (out[k] += 1));
    return out;
  };

  Char.itemMods = function (ch) {
    const mods = { ac: 0, acUnarmored: 0, saves: 0, checks: 0, attack: 0, damage: 0, spellAttack: 0, spellDC: 0, hp: 0, initiative: 0, speedMult: 1, speedMin: 0,
      speed: 0, resist: [], immune: [], condImmune: [], abilSet: {}, abilBonus: {}, displacement: false, names: [] };
    for (const id of ch.artifacts || []) {
      const it = id && D.EQUIP.item(id);
      if (!it) continue;
      mods.names.push(it.name);
      const m = it.mods || {};
      for (const k of ['ac', 'acUnarmored', 'saves', 'checks', 'attack', 'damage', 'spellAttack', 'spellDC', 'hp', 'initiative', 'speed']) mods[k] += Number(m[k]) || 0;
      if (m.speedMult) mods.speedMult = Math.max(mods.speedMult, m.speedMult);
      if (m.speedMin) mods.speedMin = Math.max(mods.speedMin, m.speedMin);
      if (m.displacement) mods.displacement = true;
      (m.resist || []).forEach((t) => mods.resist.push(t));
      (m.immune || []).forEach((t) => mods.immune.push(t));
      (m.condImmune || []).forEach((t) => mods.condImmune.push(t));
      for (const k in m.abilSet || {}) mods.abilSet[k] = Math.max(mods.abilSet[k] || 0, m.abilSet[k]);
      for (const k in m.abilBonus || {}) mods.abilBonus[k] = (mods.abilBonus[k] || 0) + m.abilBonus[k];
    }
    return mods;
  };

  Char.finalAbilities = function (ch) {
    const rb = Char.raceBonus(ch);
    const cls = D.cls(ch.cls);
    const out = {};
    for (const ab of R.ABILITIES) out[ab] = Math.min(20, (ch.base[ab] || 10) + rb[ab] + ((ch.asi && ch.asi[ab]) || 0));
    if (cls.id === 'barbarian' && ch.level >= 20) {
      out.str = Math.min(24, out.str + 4);
      out.con = Math.min(24, out.con + 4);
    }
    const im = Char.itemMods(ch);
    for (const k in im.abilBonus) out[k] = Math.min(20, out[k] + im.abilBonus[k]);
    for (const k in im.abilSet) out[k] = Math.max(out[k], im.abilSet[k]);
    return out;
  };

  Char.pointBuyCost = function (base) {
    let s = 0;
    for (const ab of R.ABILITIES) s += Char.POINT_COST[base[ab]] != null ? Char.POINT_COST[base[ab]] : 99;
    return s;
  };

  function profLists(ch) {
    const cls = D.cls(ch.cls);
    const race = D.race(ch.race);
    const sub = race.subraces.find((s) => s.id === ch.subrace) || null;
    const sc = Char.subclassActive(ch) || (D.subclass(cls, ch.subclass) && cls.subclassAt <= 1 ? D.subclass(cls, ch.subclass) : null);
    const armor = cls.armor.concat((sub && sub.armorProf) || [], (sc && sc.armor) || []);
    const weapons = cls.weapons.concat((sub && sub.weapons) || [], (sc && sc.weapons) || []);
    return { armor, weapons };
  }
  Char.armorProficient = (ch, a) => a.cat === 'none' || profLists(ch).armor.includes(a.cat);
  Char.weaponProficient = (ch, w) => {
    const p = profLists(ch).weapons;
    return p.includes(w.cat) || p.includes(w.id) || !!w.anyProf;
  };
  Char.shieldProficient = (ch) => profLists(ch).armor.includes('shield');

  /* Все умения персонажа с учётом подкласса */
  Char.features = function (ch) {
    const cls = D.cls(ch.cls);
    const lv = ch.level;
    const out = cls.features.filter((f) => f.lv <= lv);
    const sc = D.subclass(cls, ch.subclass);
    if (sc && lv >= (cls.subclassAt || 3)) sc.features.filter((f) => f.lv <= lv).forEach((f) => out.push(Object.assign({ sub: sc.name }, f)));
    return out;
  };

  Char.compute = function (ch) {
    const cls = D.cls(ch.cls);
    const race = D.race(ch.race);
    const sub = race.subraces.find((s) => s.id === ch.subrace) || null;
    const lv = U.clamp(ch.level || 1, 1, 20);
    const sc = Char.subclassActive(ch);
    const feats = {};
    Char.features(ch).forEach((f) => (feats[f.id] = true));
    const has = (id) => !!feats[id];
    const im = Char.itemMods(ch);
    const abil = Char.finalAbilities(ch);
    const mods = {};
    for (const ab of R.ABILITIES) mods[ab] = U.mod(abil[ab]);
    const prof = U.profBonus(lv);
    const traits = Object.assign({}, race.traits || {}, (sub && sub.traits) || {});

    // Хиты
    let hp = cls.hitDie + mods.con;
    for (let i = 2; i <= lv; i++) hp += Math.max(1, Math.floor(cls.hitDie / 2) + 1 + mods.con);
    if (traits.dwarvenToughness) hp += lv;
    if (has('draconicResilience')) hp += lv;
    hp = Math.max(1, hp + im.hp);

    // КД
    const armor = D.EQUIP.armor(ch.armor) || D.EQUIP.armor('none');
    const shield = !!ch.shield && Char.shieldProficient(ch);
    const armorMagic = armor.cat === 'none' ? 0 : (Number(ch.armorMagic) || 0) + (Number(armor.magic) || 0);
    let ac;
    let acNote;
    if (armor.cat === 'none') {
      ac = 10 + mods.dex;
      acNote = 'без доспеха';
      if (has('unarmoredDefense')) {
        ac = 10 + mods.dex + mods.con;
        acNote = 'защита без доспехов';
      } else if (has('unarmoredDefenseMonk') && !shield) {
        ac = 10 + mods.dex + mods.wis;
        acNote = 'защита без доспехов';
      } else if (has('draconicResilience')) {
        ac = 13 + mods.dex;
        acNote = 'драконья устойчивость';
      }
      if (im.acUnarmored && !shield) ac += im.acUnarmored;
    } else {
      ac = armor.base + Math.min(mods.dex, armor.dexMax) + armorMagic;
      acNote = armor.name.toLowerCase() + (armorMagic ? ' +' + armorMagic : '');
      if (ch.fightingStyle === 'defense' && hasStyle(ch, cls)) ac += 1;
    }
    if (shield) {
      ac += 2;
      acNote += ', щит';
    }
    ac += im.ac;

    // Скорость
    let speed = (sub && sub.speed) || race.speed;
    if (armor.cat === 'heavy' && armor.str && abil.str < armor.str && !traits.heavyArmorNoSpeedPenalty) speed -= 10;
    if (has('fastMovement') && armor.cat !== 'heavy') speed += 10;
    if (has('unarmoredMovement') && armor.cat === 'none' && !shield) speed += lv >= 18 ? 30 : lv >= 14 ? 25 : lv >= 10 ? 20 : lv >= 6 ? 15 : 10;
    speed = Math.max(im.speedMin, speed + im.speed) * im.speedMult;
    let fly = 0;
    if (has('dragonWings') || has('stormborn')) fly = speed;

    // Спасброски
    const saves = {};
    const saveProf = cls.saves.slice();
    if (has('slipperyMind')) saveProf.push('wis');
    for (const ab of R.ABILITIES) saves[ab] = mods[ab] + (saveProf.includes(ab) || has('diamondSoul') ? prof : 0) + im.saves;

    // Навыки
    const skillSet = new Set([...(ch.skills || []), ...(race.skills || [])]);
    const skills = {};
    const jack = has('jackOfAllTrades');
    const athlete = has('remarkableAthlete');
    for (const sk in R.SKILLS) {
      const ab = R.SKILLS[sk].ab;
      let half = jack || (athlete && ['str', 'dex', 'con'].includes(ab)) ? Math.floor(prof / 2) : 0;
      if (athlete && ['str', 'dex', 'con'].includes(ab)) half = Math.ceil(prof / 2);
      skills[sk] = mods[ab] + (skillSet.has(sk) ? prof : half) + im.checks;
    }
    let initiative = mods.dex + (jack ? Math.floor(prof / 2) : athlete ? Math.ceil(prof / 2) : 0) + im.checks + im.initiative;

    // Атаки
    const attacks = [];
    const weaponsList = (ch.weapons || []).filter((w) => w && D.EQUIP.weapon(w.id));
    const monkDie = lv >= 17 ? 10 : lv >= 11 ? 8 : lv >= 5 ? 6 : 4;
    const isMonkWeapon = (w) => cls.id === 'monk' && (w.id === 'shortsword' || (w.cat === 'simple' && w.kind === 'melee' && !w.props.twoHanded && !w.props.heavy));
    const styleOk = hasStyle(ch, cls);
    weaponsList.forEach((slot, idx) => {
      const w = D.EQUIP.weapon(slot.id);
      const magic = (slot.magic || 0) + (Number(w.magic) || 0);
      const proficient = Char.weaponProficient(ch, w);
      let ability = w.kind === 'ranged' ? 'dex' : 'str';
      if (w.props.finesse || isMonkWeapon(w)) ability = mods.dex > mods.str ? 'dex' : 'str';
      const abMod = mods[ability];
      let toHit = abMod + (proficient ? prof : 0) + magic + im.attack;
      if (w.kind === 'ranged' && styleOk && ch.fightingStyle === 'archery') toHit += 2;
      const extraDmg = w.extra && w.extra.dice ? [{ dice: w.extra.dice, type: w.extra.type || 'fire' }] : [];
      const base = {
        weaponId: w.id, slot: idx, magic, magical: magic > 0 || !!w.magical, ability, abMod, proficient, props: w.props,
        light: !!w.props.light, finesse: !!w.props.finesse, heavy: !!w.props.heavy, twoHanded: !!w.props.twoHanded, weapon: true,
      };
      let dice = w.dmg;
      if (isMonkWeapon(w)) dice = biggerDie(dice, '1d' + monkDie);
      const dmgBonus = abMod + magic + im.damage;
      const name = w.name + (slot.magic ? ' +' + slot.magic : '');
      if (w.kind === 'ranged') {
        attacks.push(Object.assign({}, base, {
          id: 'w' + idx, name, kind: 'ranged', toHit, range: (w.range || w.props.thrown || [80, 320]).slice(), reach: 0,
          dmg: [{ dice: dice + fmtB(dmgBonus), type: w.type }].concat(extraDmg), dieOnly: dice, dmgBonus,
        }));
      } else {
        const reach = w.props.reach ? 10 : 5;
        const duel = styleOk && ch.fightingStyle === 'dueling' && !w.props.twoHanded;
        attacks.push(Object.assign({}, base, {
          id: 'w' + idx, name, kind: w.props.thrown ? 'both' : 'melee', toHit, reach, range: w.props.thrown ? w.props.thrown.slice() : null,
          dmg: [{ dice: dice + fmtB(dmgBonus + (duel ? 2 : 0)), type: w.type }].concat(extraDmg), dieOnly: dice, dmgBonus, dueling: duel,
          gwf: styleOk && ch.fightingStyle === 'gwf' && w.props.twoHanded,
        }));
        if (w.props.versatile && !shield) {
          attacks.push(Object.assign({}, base, {
            id: 'w' + idx + 'v', name: name + ' (двумя руками)', kind: 'melee', toHit, reach,
            dmg: [{ dice: w.props.versatile + fmtB(dmgBonus), type: w.type }].concat(extraDmg), dieOnly: w.props.versatile, dmgBonus,
            gwf: styleOk && ch.fightingStyle === 'gwf', twoHanded: true, versatileGrip: true,
          }));
        }
      }
    });
    {
      const ability = cls.id === 'monk' && mods.dex > mods.str ? 'dex' : 'str';
      const abMod = mods[ability];
      const dice = cls.id === 'monk' ? '1d' + monkDie : '';
      const flat = cls.id === 'monk' ? abMod : Math.max(1, 1 + abMod);
      attacks.push({
        id: 'unarmed', name: 'Безоружный удар', kind: 'melee', toHit: abMod + prof + im.attack, reach: 5, ability, abMod,
        dmg: [{ dice: dice ? dice + fmtB(flat + im.damage) : String(flat + im.damage), type: 'bludgeoning' }], dieOnly: dice || '0', dmgBonus: flat,
        weapon: true, unarmed: true, magical: has('kiStrikes'), props: {}, proficient: true,
      });
    }

    // Заклинания
    let spellcasting = null;
    const spells = [];
    const cs = Char.casterOf(ch);
    if (cs && (cs.type !== 'half' || lv >= 2)) {
      const ab = cs.ability;
      const slotsRaw = D.classSlots(cls, lv, ch.subclass);
      const slots = {};
      for (const k in slotsRaw) if (k !== 'pact') slots[k] = { max: slotsRaw[k], used: 0 };
      spellcasting = {
        ability: ab, mod: mods[ab], dc: 8 + prof + mods[ab] + im.spellDC, toHit: prof + mods[ab] + im.spellAttack, slots, pact: !!slotsRaw.pact,
        maxLevel: D.maxSpellLevel(cls, lv, ch.subclass), casterLevel: lv, innate: {},
      };
      const maxL = spellcasting.maxLevel;
      const listIds = new Set(Char.spellList(ch).map((s) => s.id));
      (ch.spells || []).forEach((id) => {
        const s = D.spell(id);
        if (s && listIds.has(id) && s.level <= maxL) spells.push(id);
      });
      Char.bonusSpells(ch).forEach((id) => {
        if (!spells.includes(id) && D.spell(id).level <= Math.max(maxL, 1)) spells.push(id);
      });
      // Таинственный арканум колдуна: 6–9 уровень раз за бой без ячейки
      if (cs.type === 'pact') {
        spells.forEach((id) => {
          const s = D.spell(id);
          if (s.level >= 6) spellcasting.innate[id] = 1;
        });
      }
    }
    if (sub && sub.cantrip && D.spell(sub.cantrip)) {
      if (!spells.includes(sub.cantrip)) spells.push(sub.cantrip);
      if (!spellcasting) spellcasting = { ability: 'int', mod: mods.int, dc: 8 + prof + mods.int, toHit: prof + mods.int, slots: {}, maxLevel: 0, casterLevel: lv, innate: {}, racialOnly: true };
    }

    // Ресурсы
    const res = {};
    if (has('rage')) res.rage = { max: lv >= 20 ? 99 : lv >= 17 ? 6 : lv >= 12 ? 5 : lv >= 6 ? 4 : lv >= 3 ? 3 : 2, used: 0, name: 'Ярость' };
    if (has('secondWind')) res.secondWind = { max: 1, used: 0, name: 'Второе дыхание' };
    if (has('actionSurge')) res.actionSurge = { max: lv >= 17 ? 2 : 1, used: 0, name: 'Всплеск действий' };
    if (has('indomitable')) res.indomitable = { max: lv >= 17 ? 3 : lv >= 13 ? 2 : 1, used: 0, name: 'Упорный' };
    if (has('ki')) res.ki = { max: lv, used: 0, name: 'Ци' };
    if (has('layOnHands')) res.layOnHands = { max: 5 * lv, used: 0, name: 'Наложение рук (хиты)' };
    if (has('bardicInspiration')) res.inspiration = { max: Math.max(1, mods.cha), used: 0, name: 'Вдохновение барда' };
    if (has('channelDivinity')) res.channel = { max: lv >= 18 ? 3 : lv >= 6 ? 2 : 1, used: 0, name: 'Божественный канал' };
    if (cls.id === 'paladin' && lv >= 3) res.channel = { max: 1, used: 0, name: 'Божественный канал' };
    if (has('fontOfMagic')) res.sorcery = { max: lv, used: 0, name: 'Очки чародейства' };
    if (has('combatSuperiority')) res.superiority = { max: lv >= 15 ? 6 : lv >= 7 ? 5 : 4, used: 0, die: lv >= 18 ? 12 : lv >= 10 ? 10 : 8, name: 'Кости превосходства' };
    if (has('wildShape')) res.wildShape = { max: lv >= 20 ? 99 : 2, used: 0, name: 'Дикий облик' };
    if (has('warPriest')) res.warPriest = { max: Math.max(1, mods.wis), used: 0, name: 'Военный жрец' };
    if (has('wardingFlare')) res.wardingFlare = { max: Math.max(1, mods.wis), used: 0, name: 'Защитная вспышка' };
    if (has('wrathOfStorm')) res.wrathOfStorm = { max: Math.max(1, mods.wis), used: 0, name: 'Гнев бури' };
    if (has('wholenessOfBody')) res.wholeness = { max: 1, used: 0, name: 'Целостность тела' };
    if (has('feyPresence')) res.feyPresence = { max: 1, used: 0, name: 'Присутствие феи' };
    if (has('darkOnesLuck')) res.darkLuck = { max: 1, used: 0, name: 'Удача Тёмного' };
    if (has('hurlThroughHell')) res.hurl = { max: 1, used: 0, name: 'Бросок сквозь ад' };
    if (has('overchannel')) res.overchannel = { max: 1, used: 0, name: 'Перегрузка' };
    if (has('tidesOfChaos')) res.tides = { max: 1, used: 0, name: 'Поток хаоса' };
    if (has('strokeOfLuck')) res.strokeOfLuck = { max: 1, used: 0, name: 'Удача' };
    if (has('holyNimbus')) res.holyNimbus = { max: 1, used: 0, name: 'Святой нимб' };
    if (has('undyingSentinel')) res.undying = { max: 1, used: 0, name: 'Неумирающий страж' };
    if (has('entropicWard')) res.entropic = { max: 1, used: 0, name: 'Энтропийная защита' };
    if (traits.relentlessEndurance) res.relentless = { max: 1, used: 0, name: 'Непоколебимая стойкость' };
    if (traits.breathWeapon) res.breath = { max: 1, used: 0, name: 'Оружие дыхания' };

    const resist = [...(race.resist || []), ...((sub && sub.resist) || []), ...im.resist];
    const immune = [...im.immune];
    const condImmune = [...im.condImmune];
    let ancestry = null;
    if (traits.breathWeapon || (cls.id === 'sorcerer' && ch.subclass === 'draconic')) ancestry = D.DRAGON_ANCESTRY[ch.ancestry] || D.DRAGON_ANCESTRY.red;
    if (traits.breathWeapon) resist.push(ancestry.type);
    if (has('fiendishResilience')) resist.push('fire');
    if (has('thoughtShield')) resist.push('psychic');
    if (has('inuredToUndeath')) resist.push('necrotic');
    if (has('purityOfBody') || has('naturesWard')) {
      immune.push('poison');
      condImmune.push('poisoned');
    }
    if (has('beguilingDefenses')) condImmune.push('charmed');

    return {
      abil, mods, prof, hp, ac, acNote, speed, fly, saves, skills, initiative, attacks, spellcasting, spells, res, resist, immune, condImmune,
      ancestry, traits, feats, level: lv, cls, race, sub, sc, armor, shield, itemMods: im,
      sneakDice: has('sneakAttack') ? Math.ceil(lv / 2) : 0,
      rageDamage: lv >= 16 ? 4 : lv >= 9 ? 3 : 2,
      brutalDice: lv >= 17 ? 3 : lv >= 13 ? 2 : lv >= 9 ? 1 : 0,
      monkDie,
      inspirationDie: lv >= 15 ? 12 : lv >= 10 ? 10 : lv >= 5 ? 8 : 6,
      critRange: has('superiorCritical') ? 18 : has('improvedCritical') ? 19 : 20,
      passivePerception: 10 + skills.perception,
      darkvision: (sub && sub.darkvision) || race.darkvision || 0,
      size: race.size,
      extraAttacks: cls.id === 'fighter' ? (lv >= 20 ? 3 : lv >= 11 ? 2 : lv >= 5 ? 1 : 0) : feats.extraAttack ? 1 : 0,
    };
  };

  function hasStyle(ch, cls) {
    return cls.fightingStyleAt && ch.level >= cls.fightingStyleAt;
  }
  function fmtB(b) {
    return b > 0 ? '+' + b : b < 0 ? String(b) : '';
  }
  function biggerDie(a, b) {
    return D.Dice.average(a) >= D.Dice.average(b) ? a : b;
  }

  /* Превращение в участника боя */
  Char.toCombatant = function (ch, side) {
    const c = Char.compute(ch);
    const cls = c.cls;
    const flags = Object.assign({}, c.traits);
    for (const k in c.feats) flags[k] = true;
    Object.assign(flags, {
      sneakDice: c.sneakDice, rageDamage: c.rageDamage, brutalCritical: c.brutalDice, inspirationDie: c.inspirationDie, critRange: c.critRange,
      fightingStyle: cls.fightingStyleAt && ch.level >= cls.fightingStyleAt ? ch.fightingStyle : null, monkDie: c.monkDie,
      subclass: c.sc ? c.sc.id : null, totem: ch.subclass === 'totem' ? ch.totem || 'bear' : null, displacement: c.itemMods.displacement,
      divineStrikeDice: ch.level >= 14 ? 2 : 1, auraRange: ch.level >= 18 ? 30 : 10,
    });
    if (c.feats.divineStrike) flags.divineStrikeType = ch.subclass === 'tempest' ? 'thunder' : ch.subclass === 'war' ? 'weapon' : 'radiant';
    const slots = c.spellcasting ? U.deepClone(c.spellcasting.slots) : {};
    const speed = { walk: c.speed };
    if (c.fly) speed.fly = c.fly;
    const out = {
      uid: U.uid('c'), refId: ch.id, kind: 'pc', name: ch.name, player: ch.player || '',
      icon: cls.icon, raceIcon: c.race.icon, portrait: ch.portrait || null, color: ch.color || '#3d7bd9', side: side || 'heroes', controller: 'human',
      size: c.size, cells: 1, type: 'humanoid', race: ch.race, tags: ['humanoid', ch.race], level: c.level, clsId: cls.id, clsName: cls.name,
      subName: c.sc ? c.sc.name : '', raceName: c.sub ? c.sub.name : c.race.name,
      abil: c.abil, mods: c.mods, prof: c.prof, saves: c.saves, skills: c.skills, ac: c.ac, acNote: c.acNote, armorCat: c.armor.cat, hasShield: c.shield,
      maxHp: c.hp, hp: c.hp, tempHp: 0, speed,
      resist: c.resist, immune: c.immune, vuln: [], condImmune: c.condImmune,
      attacks: c.attacks, multiattack: null, extraAttacks: c.extraAttacks, specials: [],
      spellcasting: c.spellcasting ? Object.assign({}, c.spellcasting, { slots, innate: Object.assign({}, c.spellcasting.innate) }) : null,
      spells: c.spells, res: c.res, flags, ancestry: c.ancestry, potions: ch.potions || 0,
      conditions: [], effects: [], concentration: null, death: { s: 0, f: 0 }, dead: false, stable: false,
      initiative: null, initBonus: c.initiative, initAdv: !!c.feats.feralInstinct, passivePerception: c.passivePerception, x: -1, y: -1,
    };
    if (flags.arcaneWard) out.ward = { hp: 2 * c.level + c.mods.int, max: 2 * c.level + c.mods.int };
    return out;
  };

  /* Спутник следопыта-повелителя зверей */
  Char.makeCompanion = function (ch, pc) {
    if (ch.cls !== 'ranger' || ch.subclass !== 'beastmaster' || ch.level < 3) return null;
    const m = D.monster(ch.companion || 'wolf') || D.monster('wolf');
    const c = D.Combat.fromMonster(m, pc.side, { controller: 'human' });
    const prof = U.profBonus(ch.level);
    c.name = m.name + ' (спутник ' + ch.name + ')';
    c.ac += prof;
    c.maxHp = Math.max(c.maxHp, 4 * ch.level);
    c.hp = c.maxHp;
    c.attacks.forEach((a) => {
      a.toHit += prof;
      if (a.dmg[0]) a.dmg[0] = { dice: a.dmg[0].dice + '+' + prof, type: a.dmg[0].type };
    });
    if (ch.level >= 11 && c.attacks[0]) c.multiattack = [[c.attacks[0].id, c.attacks[0].id]];
    c.color = pc.color;
    c.companionOf = pc.uid;
    c.player = pc.player;
    return c;
  };

  D.Char = Char;
})(typeof window !== 'undefined' ? window : globalThis);
