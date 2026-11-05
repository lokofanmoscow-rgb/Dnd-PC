/* Тесты движка правил (node --test tests/) */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const files = [
  'core/util.js', 'core/dice.js', 'data/rules.js', 'data/equipment.js', 'data/races.js', 'data/classes.js',
  'data/spells.js', 'data/srd-monsters.js', 'data/monsters.js', 'data/tiles.js', 'data/maps.js',
  'engine/character.js', 'engine/grid.js', 'engine/combat.js', 'engine/ai.js',
];
for (const f of files) require(path.join(__dirname, '..', 'src', 'js', f));
const D = globalThis.DND;

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeHero(cls, race, level, extra) {
  const ch = D.Char.blank();
  ch.cls = cls;
  ch.race = race;
  ch.level = level;
  const r = D.race(race);
  ch.subrace = r.subraces.length ? r.subraces[0].id : '';
  D.Char.applyClassDefaults(ch);
  Object.assign(ch, extra || {});
  ch.name = cls + level;
  return ch;
}

test('кости', () => {
  D.Dice.setRng(seeded(1));
  for (let i = 0; i < 200; i++) {
    const r = D.Dice.roll('2d6+3');
    assert.ok(r.total >= 5 && r.total <= 15);
  }
  assert.strictEqual(D.Dice.average('2d6+3'), 10);
  assert.strictEqual(D.Dice.max('1d8+2'), 10);
  const crit = D.Dice.roll('1d6', { crit: true });
  assert.strictEqual(crit.rolls.length, 2);
  D.Dice.setRng(null);
});

test('расчёт персонажей всех классов и рас', () => {
  for (const cls of D.CLASSES) {
    for (const race of D.RACES) {
      for (const lv of [1, 3, 5, 10]) {
        const ch = makeHero(cls.id, race.id, lv);
        const s = D.Char.compute(ch);
        assert.ok(s.hp > 0, cls.id + ' hp');
        assert.ok(s.ac >= 10, cls.id + ' ac');
        assert.ok(s.attacks.length > 0);
        const c = D.Char.toCombatant(ch, 'heroes');
        assert.ok(c.maxHp === s.hp);
      }
    }
  }
  const f = makeHero('fighter', 'human', 1);
  const s = D.Char.compute(f);
  // Воин 1 ур., ТЕЛ 14+1 = 15 → +2: 10 + 2 = 12 хитов
  assert.strictEqual(s.hp, 12);
  // Кольчуга 16 + щит 2 + стиль «Защита» 1
  assert.strictEqual(s.ac, 19);
});

test('геометрия: расстояния и области', () => {
  const a = { x: 0, y: 0, cells: 1 };
  const b = { x: 1, y: 1, cells: 1 };
  assert.strictEqual(D.Grid.distFt(a, b), 5);
  const big = { x: 3, y: 0, cells: 2 };
  assert.strictEqual(D.Grid.distFt(a, big), 15);
  const map = { w: 20, h: 20, cells: new Array(400).fill('floor') };
  const caster = { x: 5, y: 5, cells: 1 };
  const cone = D.Grid.areaCells(map, { shape: 'cone', size: 15 }, caster, { x: 10.5, y: 5.5 });
  assert.ok(cone.length >= 5 && cone.length <= 9, 'конус ' + cone.length);
  const line = D.Grid.areaCells(map, { shape: 'line', size: 30 }, caster, { x: 15.5, y: 5.5 });
  assert.strictEqual(line.length, 6);
  const sphere = D.Grid.areaCells(map, { shape: 'sphere', size: 20 }, caster, { x: 10.5, y: 10.5 });
  assert.ok(sphere.length > 40);
});

async function runBattle(seed, heroes, monsters, mapId) {
  D.Dice.setRng(seeded(seed));
  const map = D.PRESET_MAPS.find((m) => m.id === (mapId || 'preset_arena'));
  const B = D.Combat.newBattle(map);
  let x = 3;
  for (const h of heroes) {
    const c = D.Char.toCombatant(h, 'heroes');
    c.controller = 'ai';
    c.x = x++;
    c.y = 3;
    B.combatants.push(c);
  }
  x = 3;
  for (const id of monsters) {
    const c = D.Combat.fromMonster(D.monster(id), 'enemies');
    c.x = x;
    c.y = 12 - (c.cells - 1);
    x += c.cells + 1;
    B.combatants.push(c);
  }
  const E = new D.Combat.Engine(B, {});
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.map((x) => (x && x.stack) || String(x)).join(' '));
  try {
    await E.beginCombat();
    let guard = 0;
    while (B.phase === 'combat' && guard < 400) {
      const c = E.current();
      await D.AI.takeTurn(E, c, { delay: 0 });
      guard++;
    }
    if (errors.length) throw new Error('Ошибка в бою (' + monsters.join(',') + '): ' + errors[0]);
    return { B, E, guard };
  } finally {
    console.error = origErr;
    D.Dice.setRng(null);
  }
}

test('бой ИИ против ИИ доходит до конца', async () => {
  const heroes = [makeHero('fighter', 'human', 3), makeHero('wizard', 'elf', 3), makeHero('cleric', 'dwarf', 3), makeHero('rogue', 'halfling', 3)];
  for (let seed = 1; seed <= 6; seed++) {
    const { B, guard } = await runBattle(seed, heroes, ['goblin', 'goblin', 'orc', 'wolf', 'skeleton'], 'preset_arena');
    assert.ok(B.phase === 'ended', 'бой не закончился за ' + guard + ' ходов (seed ' + seed + ')');
  }
});

test('бой с драконом, троллем и заклинателями', async () => {
  const heroes = [makeHero('paladin', 'dragonborn', 6), makeHero('sorcerer', 'tiefling', 6), makeHero('barbarian', 'halforc', 6), makeHero('monk', 'human', 6), makeHero('bard', 'halfelf', 6)];
  for (let seed = 10; seed <= 13; seed++) {
    const { B, guard } = await runBattle(seed, heroes, ['redwyrmling', 'troll', 'mage', 'priest', 'ghoul'], 'preset_lair');
    assert.ok(B.phase === 'ended' || guard >= 400, 'ошибка в бою');
  }
});

test('все монстры могут сражаться', async () => {
  const heroes = [makeHero('fighter', 'human', 10), makeHero('ranger', 'elf', 10), makeHero('druid', 'gnome', 10), makeHero('warlock', 'human', 10)];
  for (const m of D.MONSTERS) {
    const { B } = await runBattle(77, heroes, [m.id], 'preset_field');
    assert.ok(['ended', 'combat'].includes(B.phase), m.id);
  }
});

test('все подклассы до 20 уровня: расчёт и бой', async () => {
  for (const cls of D.CLASSES) {
    for (const sub of cls.subclasses) {
      for (const lv of [3, 11, 20]) {
        const ch = makeHero(cls.id, 'human', lv, { subclass: sub.id });
        const s = D.Char.compute(ch);
        assert.ok(s.hp > 0 && s.ac >= 10, cls.id + '/' + sub.id);
        const c = D.Char.toCombatant(ch, 'heroes');
        assert.ok(c.attacks.length > 0);
      }
    }
  }
  const party = [];
  for (const cls of D.CLASSES) for (const sub of cls.subclasses) party.push(makeHero(cls.id, 'human', 20, { subclass: sub.id }));
  for (let i = 0; i < party.length; i += 4) {
    const { B } = await runBattle(100 + i, party.slice(i, i + 4), ['adult-red-dragon', 'lich', 'vampire'], 'preset_field');
    assert.ok(['ended', 'combat'].includes(B.phase));
  }
});

test('легендарные действия и сопротивление', async () => {
  const heroes = [makeHero('fighter', 'human', 12), makeHero('paladin', 'human', 12), makeHero('wizard', 'elf', 12), makeHero('cleric', 'dwarf', 12)];
  const { B } = await runBattle(9, heroes, ['adult-blue-dragon'], 'preset_field');
  assert.ok(B.log.some((l) => l.t.includes('легендарное действие')), 'не было легендарных действий');
});

test('дикий облик друида', async () => {
  const map = D.PRESET_MAPS.find((m) => m.id === 'preset_field');
  const B = D.Combat.newBattle(map);
  const dr = D.Char.toCombatant(makeHero('druid', 'human', 6, { subclass: 'moon' }), 'heroes');
  dr.x = 2;
  dr.y = 2;
  const g = D.Combat.fromMonster(D.monster('goblin'), 'enemies');
  g.x = 10;
  g.y = 2;
  B.combatants.push(dr, g);
  const E = new D.Combat.Engine(B, {});
  dr.initiative = 30;
  g.initiative = 1;
  await E.beginCombat();
  const forms = E.wildShapeForms(dr);
  assert.ok(forms.length > 0);
  const bear = forms.find((m) => m.id === 'brown-bear') || forms[0];
  const r = await E.useFeature(dr, 'wildShape', { form: bear.id });
  assert.ok(r.ok, r.reason);
  assert.ok(dr.beast);
  assert.strictEqual(dr.maxHp, D.monster(bear.id).hp);
  const origHp = dr.beast.orig.hp;
  await E.applyDamage(dr, [{ amount: dr.hp + 3, type: 'slashing' }], g, {});
  assert.ok(!dr.beast, 'облик должен спасть');
  assert.strictEqual(dr.hp, origHp - 3);
});

test('заклинания игроков применяются', async () => {
  D.Dice.setRng(seeded(5));
  const map = D.PRESET_MAPS.find((m) => m.id === 'preset_field');
  const B = D.Combat.newBattle(map);
  const wiz = D.Char.toCombatant(makeHero('wizard', 'human', 5, { spells: ['firebolt', 'magicmissile', 'fireball', 'shield', 'sleep'] }), 'heroes');
  wiz.x = 2;
  wiz.y = 2;
  B.combatants.push(wiz);
  const gobs = [];
  for (let i = 0; i < 4; i++) {
    const g = D.Combat.fromMonster(D.monster('goblin'), 'enemies');
    g.x = 10 + (i % 2);
    g.y = 5 + Math.floor(i / 2);
    B.combatants.push(g);
    gobs.push(g);
  }
  const E = new D.Combat.Engine(B, {});
  wiz.initiative = 30;
  gobs.forEach((g) => (g.initiative = 1));
  await E.beginCombat();
  assert.strictEqual(E.current(), wiz);
  const r = await E.castSpell(wiz, 'fireball', 3, { point: { x: 10.5, y: 5.5 } });
  assert.ok(r.ok, r.reason);
  assert.strictEqual(wiz.spellcasting.slots[3].used, 1);
  assert.ok(gobs.every((g) => g.hp < g.maxHp || g.dead));
  D.Dice.setRng(null);
});

function duel(a, b, mapId) {
  const map = D.PRESET_MAPS.find((m) => m.id === (mapId || 'preset_field'));
  const B = D.Combat.newBattle(map);
  B.combatants.push(a, b);
  const E = new D.Combat.Engine(B, {});
  return { B, E };
}

test('сопротивление, уязвимость, иммунитет', async () => {
  const skel = D.Combat.fromMonster(D.monster('skeleton'), 'enemies');
  const mummy = D.Combat.fromMonster(D.monster('mummy'), 'enemies');
  const { E } = duel(skel, mummy);
  await E.applyDamage(skel, [{ amount: 4, type: 'bludgeoning' }], null, {});
  assert.strictEqual(skel.hp, 13 - 8, 'уязвимость удваивает');
  await E.applyDamage(skel, [{ amount: 10, type: 'poison' }], null, {});
  assert.strictEqual(skel.hp, 5, 'иммунитет к яду');
  await E.applyDamage(mummy, [{ amount: 10, type: 'slashing' }], null, { magical: false });
  assert.strictEqual(mummy.hp, 58 - 5, 'сопротивление немагическому');
  await E.applyDamage(mummy, [{ amount: 10, type: 'slashing' }], null, { magical: true });
  assert.strictEqual(mummy.hp, 58 - 15, 'магическое оружие — полный урон');
});

test('0 хитов: персонаж без сознания, спасброски от смерти, смерть монстра', async () => {
  D.Dice.setRng(seeded(3));
  const hero = D.Char.toCombatant(makeHero('fighter', 'human', 1), 'heroes');
  const gob = D.Combat.fromMonster(D.monster('goblin'), 'enemies');
  const { E } = duel(hero, gob);
  await E.applyDamage(hero, [{ amount: hero.hp, type: 'slashing' }], gob, {});
  assert.strictEqual(hero.hp, 0);
  assert.ok(!hero.dead && E.hasCond(hero, 'unconscious') && E.hasCond(hero, 'prone'));
  await E.applyDamage(hero, [{ amount: 1, type: 'slashing' }], gob, { crit: true });
  assert.strictEqual(hero.death.f, 2, 'крит по лежащему — два провала');
  await E.applyDamage(hero, [{ amount: 1, type: 'slashing' }], gob, {});
  assert.ok(hero.dead, 'три провала — смерть');
  await E.applyDamage(gob, [{ amount: 50, type: 'fire' }], hero, {});
  assert.ok(gob.dead);
  D.Dice.setRng(null);
});

test('мгновенная смерть от огромного урона', async () => {
  const hero = D.Char.toCombatant(makeHero('wizard', 'human', 1), 'heroes');
  const ogre = D.Combat.fromMonster(D.monster('ogre'), 'enemies');
  const { E } = duel(hero, ogre);
  await E.applyDamage(hero, [{ amount: hero.maxHp * 2 + 1, type: 'bludgeoning' }], ogre, {});
  assert.ok(hero.dead);
});

test('преимущество и помеха', () => {
  const hero = D.Char.toCombatant(makeHero('fighter', 'human', 3), 'heroes');
  const wolf = D.Combat.fromMonster(D.monster('wolf'), 'enemies');
  const wolf2 = D.Combat.fromMonster(D.monster('wolf'), 'enemies');
  const { B, E } = duel(hero, wolf);
  B.combatants.push(wolf2);
  hero.x = 5; hero.y = 5; wolf.x = 6; wolf.y = 5; wolf2.x = 20; wolf2.y = 5;
  const bite = wolf.attacks[0];
  assert.strictEqual(E.attackMode(wolf, hero, bite, false, 5).mode, 0);
  wolf2.x = 4;
  assert.strictEqual(E.attackMode(wolf, hero, bite, false, 5).mode, 1, 'тактика стаи');
  E.addEff(hero, { id: 'dodge', src: hero.uid });
  assert.strictEqual(E.attackMode(wolf, hero, bite, false, 5).mode, 0, 'тактика стаи + уклонение = обычный бросок');
  hero.effects = [];
  const bow = hero.attacks.find((a) => a.kind === 'ranged');
  assert.strictEqual(E.attackMode(hero, wolf2, bow, true, 5).mode, -1, 'стрельба с врагом рядом — помеха');
  E.addCond(wolf, 'prone', {});
  const sword = hero.attacks[0];
  assert.strictEqual(E.attackMode(hero, wolf, sword, false, 5).mode, 1, 'лежащая цель рядом — преимущество');
});

test('концентрация прерывается уроном и снимает эффекты', async () => {
  D.Dice.setRng(() => 0.01);
  const cleric = D.Char.toCombatant(makeHero('cleric', 'human', 3, { spells: ['sacredflame', 'bless', 'curewounds'] }), 'heroes');
  const ally = D.Char.toCombatant(makeHero('fighter', 'human', 3), 'heroes');
  const gob = D.Combat.fromMonster(D.monster('goblin'), 'enemies');
  const { B, E } = duel(cleric, ally);
  B.combatants.push(gob);
  cleric.x = 2; cleric.y = 2; ally.x = 3; ally.y = 2; gob.x = 10; gob.y = 10;
  cleric.initiative = 20; ally.initiative = 10; gob.initiative = 1;
  await E.beginCombat();
  const r = await E.castSpell(cleric, 'bless', 1, { targets: [cleric.uid, ally.uid] });
  assert.ok(r.ok, r.reason);
  assert.ok(cleric.concentration && E.hasEff(ally, 'bless'));
  await E.applyDamage(cleric, [{ amount: 5, type: 'slashing' }], gob, {});
  assert.ok(!cleric.concentration, 'провал спасброска концентрации');
  assert.ok(!E.hasEff(ally, 'bless'), 'Благословение снято');
  D.Dice.setRng(null);
});

test('атака по возможности при выходе из досягаемости', async () => {
  D.Dice.setRng(seeded(9));
  const hero = D.Char.toCombatant(makeHero('rogue', 'human', 1), 'heroes');
  const orc = D.Combat.fromMonster(D.monster('orc'), 'enemies');
  const { B, E } = duel(hero, orc);
  hero.x = 5; hero.y = 5; orc.x = 6; orc.y = 5;
  hero.initiative = 20; orc.initiative = 1;
  await E.beginCombat();
  let logged = [];
  E.h.log = (t) => logged.push(t);
  const M = E.reachable(hero);
  const path = D.Grid.pathTo(M, 2, 5);
  await E.moveAlong(hero, path);
  assert.ok(logged.some((t) => t.includes('атаку по возможности')), 'орк атакует уходящего');
  assert.ok(orc.reactionUsed);
  D.Dice.setRng(null);
});
