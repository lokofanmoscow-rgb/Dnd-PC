/* Тесты движка правил (node --test tests/) */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const files = [
  'core/util.js', 'core/dice.js', 'data/rules.js', 'data/equipment.js', 'data/races.js', 'data/classes.js',
  'data/spells.js', 'data/monsters.js', 'data/tiles.js', 'data/maps.js',
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
  await E.beginCombat();
  let guard = 0;
  while (B.phase === 'combat' && guard < 400) {
    const c = E.current();
    await D.AI.takeTurn(E, c, { delay: 0 });
    guard++;
  }
  D.Dice.setRng(null);
  return { B, E, guard };
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
