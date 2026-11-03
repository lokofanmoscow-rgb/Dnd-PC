/* Персонажи игроков: расчёт производных характеристик и превращение в участника боя */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const R = D.R;

  const Char = {};

  Char.STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
  Char.POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
  Char.POINTS = 27;

  Char.COLORS = ['#3d7bd9', '#d9a43d', '#9b59b6', '#2bb3a6', '#e67e22', '#e84393', '#6ab04c', '#c0392b', '#7f8c8d', '#f1c40f'];

  Char.blank = function () {
    const cls = D.cls('fighter');
    const ch = {
      id: U.uid('pc'),
      name: 'Новый герой',
      player: '',
      race: 'human',
      subrace: '',
      cls: 'fighter',
      level: 1,
      ancestry: 'red',
      method: 'standard',
      base: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 },
      raceChoice: [],
      asi: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
      skills: [],
      fightingStyle: 'defense',
      armor: cls.kit.armor,
      shield: cls.kit.shield,
      weapons: cls.kit.weapons.map((id) => ({ id, magic: 0 })),
      potions: 2,
      spells: [],
      color: Char.COLORS[Math.floor(Math.random() * Char.COLORS.length)],
      portrait: null,
      notes: '',
    };
    Char.applyClassDefaults(ch);
    return ch;
  };

  /* Распределить стандартный набор под класс и подобрать снаряжение */
  Char.applyClassDefaults = function (ch) {
    const cls = D.cls(ch.cls);
    const arr = Char.STANDARD_ARRAY.slice();
    const base = {};
    cls.primary.forEach((ab, i) => (base[ab] = arr[i]));
    ch.base = base;
    ch.armor = cls.kit.armor;
    ch.shield = cls.kit.shield;
    ch.weapons = cls.kit.weapons.map((id) => ({ id, magic: 0 }));
    ch.skills = (cls.skills.list === 'any' ? Object.keys(R.SKILLS) : cls.skills.list).slice(0, cls.skills.count);
    ch.fightingStyle = cls.id === 'ranger' ? 'archery' : cls.id === 'paladin' ? 'defense' : 'defense';
    ch.spells = Char.defaultSpells(ch);
  };

  Char.defaultSpells = function (ch) {
    const cls = D.cls(ch.cls);
    if (!cls.caster) return [];
    const lim = Char.spellLimits(ch);
    const all = D.classSpells(cls.id, D.maxSpellLevel(cls, ch.level));
    const cantrips = all.filter((s) => s.level === 0).slice(0, lim.cantrips).map((s) => s.id);
    const leveled = all.filter((s) => s.level > 0).sort((a, b) => b.level - a.level).slice(0, lim.spells).map((s) => s.id);
    return cantrips.concat(leveled);
  };

  Char.spellLimits = function (ch) {
    const cls = D.cls(ch.cls);
    if (!cls.caster) return { cantrips: 0, spells: 0 };
    const lv = U.clamp(ch.level, 1, 10);
    const cantrips = cls.caster.cantrips[lv - 1] || 0;
    let spells = 0;
    if (cls.caster.known) spells = cls.caster.known[lv - 1];
    else {
      const ab = Char.finalAbilities(ch)[cls.caster.ability];
      const m = U.mod(ab);
      spells = cls.caster.prepared === 'half' ? Math.max(1, m + Math.floor(lv / 2)) : Math.max(1, m + lv);
      if (cls.caster.prepared === 'half' && lv < 2) spells = 0;
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

  Char.finalAbilities = function (ch) {
    const rb = Char.raceBonus(ch);
    const out = {};
    for (const ab of R.ABILITIES) out[ab] = Math.min(20, (ch.base[ab] || 10) + rb[ab] + ((ch.asi && ch.asi[ab]) || 0));
    return out;
  };

  Char.pointBuyCost = function (base) {
    let s = 0;
    for (const ab of R.ABILITIES) s += Char.POINT_COST[base[ab]] != null ? Char.POINT_COST[base[ab]] : 99;
    return s;
  };

  function weaponProficient(cls, race, sub, w) {
    if (cls.weapons.includes(w.cat) || cls.weapons.includes(w.id)) return true;
    if (sub && sub.weapons && sub.weapons.includes(w.id)) return true;
    return false;
  }

  function armorProficient(cls, sub, a) {
    if (a.cat === 'none') return true;
    if (cls.armor.includes(a.cat)) return true;
    if (sub && sub.armorProf && sub.armorProf.includes(a.cat)) return true;
    return false;
  }
  Char.armorProficient = (ch, a) => armorProficient(D.cls(ch.cls), (D.race(ch.race).subraces || []).find((s) => s.id === ch.subrace), a);
  Char.weaponProficient = (ch, w) => weaponProficient(D.cls(ch.cls), D.race(ch.race), (D.race(ch.race).subraces || []).find((s) => s.id === ch.subrace), w);

  Char.has = (ch, featureId) => {
    const cls = D.cls(ch.cls);
    return cls.features.some((f) => f.id === featureId && f.lv <= ch.level);
  };

  /* Полный расчёт листа персонажа */
  Char.compute = function (ch) {
    const cls = D.cls(ch.cls);
    const race = D.race(ch.race);
    const sub = race.subraces.find((s) => s.id === ch.subrace) || null;
    const lv = U.clamp(ch.level || 1, 1, 10);
    const abil = Char.finalAbilities(ch);
    const mods = {};
    for (const ab of R.ABILITIES) mods[ab] = U.mod(abil[ab]);
    const prof = U.profBonus(lv);
    const has = (id) => cls.features.some((f) => f.id === id && f.lv <= lv);
    const traits = Object.assign({}, race.traits || {}, (sub && sub.traits) || {});

    // Хиты
    let hp = cls.hitDie + mods.con;
    for (let i = 2; i <= lv; i++) hp += Math.max(1, Math.floor(cls.hitDie / 2) + 1 + mods.con);
    if (traits.dwarvenToughness) hp += lv;
    if (has('draconicResilience')) hp += lv;
    hp = Math.max(1, hp);

    // КД
    const armor = D.EQUIP.armor(ch.armor) || D.EQUIP.armor('none');
    const shieldProf = cls.armor.includes('shield');
    const shield = !!ch.shield && shieldProf;
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
    } else {
      ac = armor.base + Math.min(mods.dex, armor.dexMax);
      acNote = armor.name.toLowerCase();
      if (ch.fightingStyle === 'defense' && hasStyle(ch, cls)) ac += 1;
    }
    if (shield) {
      ac += 2;
      acNote += ', щит';
    }

    // Скорость
    let speed = (sub && sub.speed) || race.speed;
    if (armor.cat === 'heavy' && armor.str && abil.str < armor.str && !traits.heavyArmorNoSpeedPenalty) speed -= 10;
    if (has('fastMovement') && armor.cat !== 'heavy') speed += 10;
    if (has('unarmoredMovement') && armor.cat === 'none' && !shield) speed += lv >= 10 ? 20 : lv >= 6 ? 15 : 10;

    // Спасброски
    const saves = {};
    for (const ab of R.ABILITIES) saves[ab] = mods[ab] + (cls.saves.includes(ab) ? prof : 0);

    // Навыки
    const skillSet = new Set([...(ch.skills || []), ...(race.skills || [])]);
    const skills = {};
    const jack = has('jackOfAllTrades');
    for (const sk in R.SKILLS) {
      const m = mods[R.SKILLS[sk].ab];
      skills[sk] = m + (skillSet.has(sk) ? prof : jack ? Math.floor(prof / 2) : 0);
    }
    const initiative = mods.dex + (jack ? Math.floor(prof / 2) : 0);

    // Атаки оружием
    const attacks = [];
    const weaponsList = (ch.weapons || []).filter((w) => D.EQUIP.weapon(w.id));
    const monkDie = lv >= 17 ? 10 : lv >= 11 ? 8 : lv >= 5 ? 6 : 4;
    const isMonkWeapon = (w) => cls.id === 'monk' && (w.id === 'shortsword' || (w.cat === 'simple' && w.kind === 'melee' && !w.props.twoHanded && !w.props.heavy));
    const styleOk = hasStyle(ch, cls);
    weaponsList.forEach((slot, idx) => {
      const w = D.EQUIP.weapon(slot.id);
      const magic = slot.magic || 0;
      const proficient = weaponProficient(cls, race, sub, w);
      let ability = w.kind === 'ranged' ? 'dex' : 'str';
      if (w.props.finesse || isMonkWeapon(w)) ability = mods.dex > mods.str ? 'dex' : 'str';
      const abMod = mods[ability];
      let toHit = abMod + (proficient ? prof : 0) + magic;
      if (w.kind === 'ranged' && styleOk && ch.fightingStyle === 'archery') toHit += 2;
      const base = {
        weaponId: w.id,
        slot: idx,
        magic,
        magical: magic > 0,
        ability,
        abMod,
        proficient,
        props: w.props,
        light: !!w.props.light,
        finesse: !!w.props.finesse,
        heavy: !!w.props.heavy,
        twoHanded: !!w.props.twoHanded,
        weapon: true,
      };
      let dice = w.dmg;
      if (isMonkWeapon(w)) dice = Dice_max(dice, '1d' + monkDie);
      const dmgBonus = abMod + magic;
      const name = w.name + (magic ? ' +' + magic : '');
      if (w.kind === 'ranged') {
        attacks.push(Object.assign({}, base, {
          id: 'w' + idx, name, kind: 'ranged', toHit, range: (w.range || w.props.thrown).slice(), reach: 0,
          dmg: [{ dice: dice + fmtB(dmgBonus), type: w.type }], dieOnly: dice, dmgBonus,
        }));
      } else {
        const reach = w.props.reach ? 10 : 5;
        const oneHand = {
          id: 'w' + idx, name, kind: w.props.thrown ? 'both' : 'melee', toHit, reach, range: w.props.thrown ? w.props.thrown.slice() : null,
          dmg: [{ dice: dice + fmtB(dmgBonus + (styleOk && ch.fightingStyle === 'dueling' && !w.props.twoHanded ? 2 : 0)), type: w.type }],
          dieOnly: dice, dmgBonus, dueling: styleOk && ch.fightingStyle === 'dueling' && !w.props.twoHanded,
          gwf: styleOk && ch.fightingStyle === 'gwf' && w.props.twoHanded,
        };
        attacks.push(Object.assign({}, base, oneHand));
        if (w.props.versatile && !shield) {
          attacks.push(Object.assign({}, base, {
            id: 'w' + idx + 'v', name: name + ' (двумя руками)', kind: 'melee', toHit, reach,
            dmg: [{ dice: w.props.versatile + fmtB(dmgBonus), type: w.type }], dieOnly: w.props.versatile, dmgBonus,
            gwf: styleOk && ch.fightingStyle === 'gwf', twoHanded: true, versatileGrip: true,
          }));
        }
      }
    });
    // Безоружный удар
    {
      const ability = cls.id === 'monk' && mods.dex > mods.str ? 'dex' : 'str';
      const abMod = mods[ability];
      const dice = cls.id === 'monk' ? '1d' + monkDie : '';
      const flat = cls.id === 'monk' ? abMod : Math.max(1, 1 + abMod);
      attacks.push({
        id: 'unarmed', name: 'Безоружный удар', kind: 'melee', toHit: abMod + prof, reach: 5, ability, abMod,
        dmg: [{ dice: dice ? dice + fmtB(flat) : String(flat), type: 'bludgeoning' }], dieOnly: dice || '0', dmgBonus: flat,
        weapon: true, unarmed: true, magical: has('kiStrikes'), props: {}, proficient: true,
      });
    }

    // Заклинания
    let spellcasting = null;
    const spells = [];
    if (cls.caster && (cls.caster.type !== 'half' || lv >= 2)) {
      const ab = cls.caster.ability;
      const slotsRaw = D.classSlots(cls, lv);
      const slots = {};
      for (const k in slotsRaw) if (k !== 'pact') slots[k] = { max: slotsRaw[k], used: 0 };
      spellcasting = {
        ability: ab, mod: mods[ab], dc: 8 + prof + mods[ab], toHit: prof + mods[ab], slots, pact: !!slotsRaw.pact,
        maxLevel: D.maxSpellLevel(cls, lv), casterLevel: lv,
      };
      const maxL = spellcasting.maxLevel;
      (ch.spells || []).forEach((id) => {
        const s = D.spell(id);
        if (s && s.classes.includes(cls.id) && s.level <= maxL) spells.push(id);
      });
    }
    // Расовый заговор высшего эльфа
    if (sub && sub.cantrip && D.spell(sub.cantrip)) {
      if (!spells.includes(sub.cantrip)) spells.push(sub.cantrip);
      if (!spellcasting) spellcasting = { ability: 'int', mod: mods.int, dc: 8 + prof + mods.int, toHit: prof + mods.int, slots: {}, maxLevel: 0, casterLevel: lv, racialOnly: true };
    }

    // Ресурсы
    const res = {};
    if (has('rage')) res.rage = { max: lv >= 6 ? 4 : lv >= 3 ? 3 : 2, used: 0, name: 'Ярость' };
    if (has('secondWind')) res.secondWind = { max: 1, used: 0, name: 'Второе дыхание' };
    if (has('actionSurge')) res.actionSurge = { max: 1, used: 0, name: 'Всплеск действий' };
    if (has('indomitable')) res.indomitable = { max: 1, used: 0, name: 'Упорный' };
    if (has('ki')) res.ki = { max: lv, used: 0, name: 'Ци' };
    if (has('layOnHands')) res.layOnHands = { max: 5 * lv, used: 0, name: 'Наложение рук (хиты)' };
    if (has('bardicInspiration')) res.inspiration = { max: Math.max(1, mods.cha), used: 0, name: 'Вдохновение барда' };
    if (has('channelDivinity')) res.channel = { max: lv >= 6 ? 2 : 1, used: 0, name: 'Божественный канал' };
    if (has('sacredWeapon')) res.channel = { max: 1, used: 0, name: 'Божественный канал' };
    if (has('fontOfMagic')) res.sorcery = { max: lv, used: 0, name: 'Очки чародейства' };
    if (traits.relentlessEndurance) res.relentless = { max: 1, used: 0, name: 'Непоколебимая стойкость' };
    if (traits.breathWeapon) res.breath = { max: 1, used: 0, name: 'Оружие дыхания' };

    const resist = [...(race.resist || []), ...((sub && sub.resist) || [])];
    let ancestry = null;
    if (traits.breathWeapon) {
      ancestry = D.DRAGON_ANCESTRY[ch.ancestry] || D.DRAGON_ANCESTRY.red;
      resist.push(ancestry.type);
    }

    const feats = {};
    cls.features.forEach((f) => {
      if (f.lv <= lv) feats[f.id] = true;
    });

    return {
      abil, mods, prof, hp, ac, acNote, speed, saves, skills, initiative, attacks, spellcasting, spells, res, resist,
      ancestry, traits, feats, level: lv, cls, race, sub, armor, shield,
      sneakDice: has('sneakAttack') ? Math.ceil(lv / 2) : 0,
      rageDamage: lv >= 9 ? 3 : 2,
      monkDie,
      inspirationDie: lv >= 10 ? 10 : lv >= 5 ? 8 : 6,
      critRange: has('improvedCritical') ? 19 : 20,
      passivePerception: 10 + skills.perception,
      darkvision: (sub && sub.darkvision) || race.darkvision || 0,
      size: race.size,
    };
  };

  function hasStyle(ch, cls) {
    return cls.fightingStyleAt && ch.level >= cls.fightingStyleAt;
  }
  function fmtB(b) {
    return b > 0 ? '+' + b : b < 0 ? String(b) : '';
  }
  function Dice_max(a, b) {
    return D.Dice.average(a) >= D.Dice.average(b) ? a : b;
  }

  /* Превращение в участника боя */
  Char.toCombatant = function (ch, side) {
    const c = Char.compute(ch);
    const cls = c.cls;
    const flags = Object.assign({}, c.traits);
    for (const k in c.feats) flags[k] = true;
    flags.sneakDice = c.sneakDice;
    flags.rageDamage = c.rageDamage;
    flags.inspirationDie = c.inspirationDie;
    flags.critRange = c.critRange;
    flags.fightingStyle = cls.fightingStyleAt && ch.level >= cls.fightingStyleAt ? ch.fightingStyle : null;
    flags.monkDie = c.monkDie;
    const slots = c.spellcasting ? U.deepClone(c.spellcasting.slots) : {};
    return {
      uid: U.uid('c'),
      refId: ch.id,
      kind: 'pc',
      name: ch.name,
      player: ch.player || '',
      icon: c.race.icon || cls.icon,
      clsIcon: cls.icon,
      portrait: ch.portrait || null,
      color: ch.color || '#3d7bd9',
      side: side || 'heroes',
      controller: 'human',
      size: c.size,
      cells: 1,
      type: 'humanoid',
      race: ch.race,
      tags: ['humanoid', ch.race],
      level: c.level,
      clsId: cls.id,
      clsName: cls.name,
      raceName: (c.sub ? c.sub.name : c.race.name),
      abil: c.abil,
      mods: c.mods,
      prof: c.prof,
      saves: c.saves,
      skills: c.skills,
      ac: c.ac,
      acNote: c.acNote,
      armorCat: c.armor.cat,
      hasShield: c.shield,
      maxHp: c.hp,
      hp: c.hp,
      tempHp: 0,
      speed: { walk: c.speed },
      resist: c.resist,
      immune: [],
      vuln: [],
      condImmune: [],
      attacks: c.attacks,
      multiattack: null,
      extraAttacks: ch.cls === 'fighter' && c.level >= 11 ? 2 : c.feats.extraAttack ? 1 : 0,
      specials: [],
      spellcasting: c.spellcasting ? Object.assign({}, c.spellcasting, { slots }) : null,
      spells: c.spells,
      res: c.res,
      flags,
      ancestry: c.ancestry,
      potions: ch.potions || 0,
      conditions: [],
      effects: [],
      concentration: null,
      death: { s: 0, f: 0 },
      dead: false,
      stable: false,
      initiative: null,
      initBonus: c.initiative,
      initAdv: !!c.feats.feralInstinct,
      passivePerception: c.passivePerception,
      x: -1,
      y: -1,
    };
  };

  D.Char = Char;
})(typeof window !== 'undefined' ? window : globalThis);
