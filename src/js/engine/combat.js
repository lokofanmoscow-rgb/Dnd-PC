/* Боевой движок D&D 5e: инициатива, ходы, атаки, спасброски, урон, состояния, заклинания */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const R = D.R;
  const G = D.Grid;
  const Dice = D.Dice;

  const INCAP = ['incapacitated', 'paralyzed', 'stunned', 'unconscious', 'petrified'];
  const C = {};

  /* ---------- Монстр → участник боя ---------- */
  C.fromMonster = function (m, side, opts) {
    opts = opts || {};
    side = side || 'enemies';
    const mods = {};
    for (const ab of R.ABILITIES) mods[ab] = U.mod(m.abil[ab]);
    const prof = m.prof || R.crProf(m.cr);
    const saves = {};
    for (const ab of R.ABILITIES) saves[ab] = m.saves && m.saves[ab] != null ? m.saves[ab] : mods[ab];
    const skills = {};
    for (const sk in R.SKILLS) skills[sk] = m.skills && m.skills[sk] != null ? m.skills[sk] : mods[R.SKILLS[sk].ab];
    const attacks = [];
    const specials = [];
    let multiattack = null;
    const recharge = {};
    for (const a of m.actions || []) {
      if (a.type === 'multi') {
        multiattack = a.options.map((o) => o.slice());
        continue;
      }
      if (a.type === 'mw' || a.type === 'rw' || a.type === 'mrw') {
        attacks.push({
          id: a.id, name: a.name, kind: a.type === 'mw' ? 'melee' : a.type === 'rw' ? 'ranged' : 'both',
          toHit: a.toHit, reach: a.reach || 5, range: a.range || null, dmg: a.dmg || [], rangedDmg: a.rangedDmg || null,
          onHit: a.onHit || null, recharge: a.recharge || 0, weapon: true, monster: true, magical: !!a.magical,
          ability: a.type === 'rw' ? 'dex' : 'str',
        });
        if (a.recharge) recharge[a.id] = true;
      } else {
        specials.push(U.deepClone(a));
        if (a.recharge) recharge[a.id] = true;
      }
    }
    let hp = m.hp;
    if (opts.rollHp && m.hd) hp = Math.max(1, Dice.roll(m.hd).total);
    let sc = null;
    if (m.spellcasting) {
      sc = {
        ability: m.spellcasting.ability, mod: mods[m.spellcasting.ability], dc: m.spellcasting.dc, toHit: m.spellcasting.toHit,
        slots: {}, casterLevel: m.spellcasting.casterLevel || Math.max(1, Math.round(R.crValue(m.cr) * 2)), maxLevel: 0,
      };
      for (const k in m.spellcasting.slots) {
        sc.slots[k] = { max: m.spellcasting.slots[k], used: 0 };
        sc.maxLevel = Math.max(sc.maxLevel, Number(k));
      }
    }
    const res = {};
    if (m.flags && m.flags.legendaryResistance) res.legendary = { max: m.flags.legendaryResistance, used: 0, name: 'Легендарное сопротивление' };
    if (m.flags && m.flags.relentless) res.relentlessM = { max: 1, used: 0, name: 'Неутомимость' };
    return {
      uid: U.uid('c'), refId: m.id, kind: 'monster', name: opts.name || m.name, icon: m.icon || '👾', portrait: m.portrait || null,
      color: R.SIDES[side].color, side, controller: opts.controller || 'ai',
      size: m.size, cells: (R.SIZES[m.size] || R.SIZES.medium).cells, type: m.type, tags: m.tags || [m.type], race: null,
      abil: Object.assign({}, m.abil), mods, prof, saves, skills, ac: m.ac, acNote: m.acNote || '', armorCat: 'natural', hasShield: false,
      maxHp: hp, hp, tempHp: 0, speed: Object.assign({ walk: 30 }, m.speed),
      resist: (m.resist || []).slice(), immune: (m.immune || []).slice(), vuln: (m.vuln || []).slice(), resistNonmagical: !!m.resistNonmagical,
      condImmune: (m.condImmune || []).slice(),
      attacks, multiattack, extraAttacks: 0, specials, spellcasting: sc, spells: sc ? m.spellcasting.spells.slice() : [],
      res, flags: U.deepClone(m.flags || {}), recharge, potions: 0,
      conditions: [], effects: [], concentration: null, death: { s: 0, f: 0 }, dead: false, stable: false,
      initiative: null, initBonus: mods.dex, initAdv: false, passivePerception: 10 + skills.perception,
      xp: m.xp || 0, cr: m.cr, x: -1, y: -1,
    };
  };

  C.newBattle = function (map, name) {
    return {
      id: U.uid('battle'),
      name: name || 'Бой: ' + map.name,
      map: U.deepClone({ id: map.id, name: map.name, w: map.w, h: map.h, cells: map.cells }),
      combatants: [],
      phase: 'setup',
      round: 0,
      order: [],
      turnIdx: 0,
      turn: null,
      log: [],
      xp: 0,
      result: null,
      fpImmune: {},
      created: Date.now(),
    };
  };

  const DEFAULT_HOOKS = {
    log() {},
    float() {},
    roll: async () => {},
    ask: async (q, opts) => opts[0].value,
    askNumber: async (q, min, max, def) => def,
    changed() {},
    animateStep: async () => {},
    flashCells: async () => {},
    ended() {},
  };

  function Engine(B, hooks) {
    this.B = B;
    this.h = Object.assign({}, DEFAULT_HOOKS, hooks || {});
  }
  const P = Engine.prototype;

  /* ---------- Утилиты ---------- */
  P.get = function (uid) {
    return this.B.combatants.find((c) => c.uid === uid);
  };
  P.current = function () {
    const B = this.B;
    if (B.phase !== 'combat') return null;
    return this.get(B.order[B.turnIdx]);
  };
  P.name = function (c) {
    return '<b class="side-' + c.side + '">' + U.escapeHtml(c.name) + '</b>';
  };
  P.log = function (html, cls) {
    this.B.log.push({ t: html, c: cls || '' });
    if (this.B.log.length > 500) this.B.log.splice(0, this.B.log.length - 500);
    this.h.log(html, cls || '');
  };
  P.turnKey = function () {
    return this.B.round + ':' + this.B.turnIdx;
  };

  P.hasCond = (c, id) => c.conditions.some((x) => x.id === id);
  P.hasEff = (c, id) => c.effects.some((x) => x.id === id);
  P.getEff = (c, id) => c.effects.find((x) => x.id === id);
  P.incap = function (c) {
    return c.dead || c.hp <= 0 || c.conditions.some((x) => INCAP.includes(x.id));
  };
  P.conscious = function (c) {
    return !c.dead && c.hp > 0 && !this.hasCond(c, 'unconscious');
  };
  P.hostile = (a, b) => G.isHostile(a, b);
  P.canReact = function (c) {
    return !c.dead && c.hp > 0 && !this.incap(c) && !c.reactionUsed && !this.hasEff(c, 'noReactions');
  };

  P.addCond = function (c, id, opts) {
    opts = opts || {};
    if (c.dead) return false;
    if (c.condImmune.includes(id)) {
      this.log(this.name(c) + ' невосприимчив к состоянию «' + R.CONDITIONS[id].name + '».', 'muted');
      return false;
    }
    if (id === 'frightened' && this.auraOfCourage(c)) {
      this.log(this.name(c) + ' защищён Аурой отваги.', 'muted');
      return false;
    }
    if (id === 'prone' && this.hasCond(c, 'prone')) return true;
    const cond = Object.assign({ id }, opts);
    c.conditions.push(cond);
    if (['paralyzed', 'stunned', 'unconscious', 'petrified'].includes(id) && !this.hasCond(c, 'incapacitated')) {
      // недееспособность учитывается функцией incap()
    }
    if (INCAP.includes(id) && c.concentration) this.endConcentration(c, 'недееспособен');
    if (id === 'unconscious' && this.hasEff(c, 'rage')) this.removeEff(c, 'rage');
    this.h.changed();
    return true;
  };
  P.removeCond = function (c, id, pred) {
    const before = c.conditions.length;
    c.conditions = c.conditions.filter((x) => !(x.id === id && (!pred || pred(x))));
    if (before !== c.conditions.length) this.h.changed();
    return before !== c.conditions.length;
  };
  P.addEff = function (c, eff) {
    if (eff.unique !== false) c.effects = c.effects.filter((x) => !(x.id === eff.id && x.src === eff.src));
    c.effects.push(eff);
    this.h.changed();
  };
  P.removeEff = function (c, id, pred) {
    c.effects = c.effects.filter((x) => !(x.id === id && (!pred || pred(x))));
    this.h.changed();
  };

  P.auraOfCourage = function (c) {
    return this.B.combatants.some((p) => p.flags && p.flags.auraOfCourage && !this.hostile(p, c) && this.conscious(p) && G.distFt(p, c) <= 10);
  };

  P.speedOf = function (c) {
    if (c.dead || c.hp <= 0) return 0;
    if (this.hasCond(c, 'grappled') || this.hasCond(c, 'restrained') || this.hasCond(c, 'paralyzed') || this.hasCond(c, 'stunned') || this.hasCond(c, 'petrified')) return 0;
    let s = c.speed.walk || 0;
    if (c.speed.fly && !this.hasCond(c, 'prone')) s = Math.max(s, c.speed.fly);
    if (this.hasEff(c, 'slowed')) s -= 10;
    return Math.max(0, s);
  };
  P.canFly = function (c) {
    return !!c.speed.fly && !this.hasCond(c, 'prone');
  };

  P.acOf = function (c) {
    let ac = c.ac;
    if (this.hasEff(c, 'mageArmor') && (c.armorCat === 'none')) ac = Math.max(ac, 13 + c.mods.dex + (c.hasShield ? 2 : 0));
    if (this.hasEff(c, 'shieldOfFaith')) ac += 2;
    if (this.hasEff(c, 'shield')) ac += 5;
    return ac;
  };

  P.reachOf = function (c) {
    let r = 0;
    for (const a of c.attacks) if (a.kind !== 'ranged') r = Math.max(r, a.reach || 5);
    return r;
  };

  P.tickDurations = function (who, at) {
    for (const c of this.B.combatants) {
      for (const list of ['conditions', 'effects']) {
        const keep = [];
        for (const x of c[list]) {
          if (x.expire && x.expire.who === who && x.expire.at === at) {
            x.expire.n -= 1;
            if (x.expire.n <= 0) {
              const nm = list === 'conditions' ? R.CONDITIONS[x.id].name : (R.EFFECTS[x.id] || { name: x.name || x.id }).name;
              if (!c.dead && !x.silent) this.log(this.name(c) + ': эффект «' + nm + '» закончился.', 'muted');
              if (x.id === 'aid') {
                c.maxHp -= x.value || 0;
                c.hp = Math.min(c.hp, c.maxHp);
              }
              continue;
            }
          }
          keep.push(x);
        }
        c[list] = keep;
      }
      if (c.concentration && c.concentration.expire && who === c.uid && at === 'start') {
        c.concentration.expire.n -= 1;
        if (c.concentration.expire.n <= 0) this.endConcentration(c, 'время действия истекло');
      }
    }
  };

  /* ---------- Концентрация ---------- */
  P.startConcentration = function (c, spell, rounds) {
    if (c.concentration) this.endConcentration(c, 'новое заклинание');
    const key = U.uid('conc');
    c.concentration = { key, spellId: spell.id, name: spell.name, expire: rounds ? { n: rounds } : null };
    return key;
  };
  P.endConcentration = function (c, reason) {
    if (!c.concentration) return;
    const key = c.concentration.key;
    const nm = c.concentration.name;
    c.concentration = null;
    for (const o of this.B.combatants) {
      o.conditions = o.conditions.filter((x) => x.conc !== key);
      o.effects = o.effects.filter((x) => x.conc !== key);
    }
    this.log(this.name(c) + ' теряет концентрацию на «' + nm + '»' + (reason ? ' (' + reason + ')' : '') + '.', 'warn');
    this.h.changed();
  };

  /* ---------- Броски ---------- */
  P.blessBonus = function (c) {
    if (!this.hasEff(c, 'bless')) return 0;
    return Dice.die(4);
  };

  P.auraOfProtection = function (c) {
    let best = 0;
    for (const p of this.B.combatants) {
      if (!p.flags || !p.flags.auraOfProtection || this.hostile(p, c) || !this.conscious(p)) continue;
      if (G.distFt(p, c) <= 10) best = Math.max(best, Math.max(1, p.mods.cha));
    }
    return best;
  };

  P.useInspiration = async function (c, total, need) {
    const eff = this.getEff(c, 'inspiration');
    if (!eff) return 0;
    if (total >= need || total + eff.value < need) return 0;
    const r = Dice.die(eff.value);
    this.removeEff(c, 'inspiration');
    this.log(this.name(c) + ' использует Вдохновение барда: +' + r + ' (d' + eff.value + ').', 'good');
    return r;
  };

  P.check = async function (c, skill, opts) {
    opts = opts || {};
    let mode = 0;
    const adv = [];
    const dis = [];
    if (this.hasCond(c, 'poisoned')) dis.push('отравлен');
    if (this.hasCond(c, 'frightened')) dis.push('испуган');
    if (this.hasEff(c, 'rage') && R.SKILLS[skill].ab === 'str') adv.push('ярость');
    if (adv.length && !dis.length) mode = 1;
    if (dis.length && !adv.length) mode = -1;
    const roll = Dice.d20(mode, c.flags && c.flags.lucky);
    const bonus = c.skills[skill] != null ? c.skills[skill] : c.mods[R.SKILLS[skill].ab];
    const total = roll.value + bonus;
    await this.h.roll({ kind: 'check', actor: c, label: R.SKILLS[skill].name, d20: roll, bonus, total, vs: opts.dc });
    return { total, roll };
  };

  P.save = async function (c, ab, dc, opts) {
    opts = opts || {};
    const abName = R.ABILITY_GEN[ab];
    if (['str', 'dex'].includes(ab) && c.conditions.some((x) => ['paralyzed', 'stunned', 'unconscious', 'petrified'].includes(x.id))) {
      this.log(this.name(c) + ' автоматически проваливает спасбросок ' + abName + '.', 'bad');
      return { ok: false, total: 0, nat: 0, auto: true };
    }
    const adv = [];
    const dis = [];
    const f = c.flags || {};
    if (opts.magic && f.gnomeCunning && ['int', 'wis', 'cha'].includes(ab)) adv.push('гномья хитрость');
    if (opts.magic && f.magicResistance) adv.push('сопротивление магии');
    if (ab === 'dex' && this.hasEff(c, 'dodge') && !this.incap(c)) adv.push('уклонение');
    if (ab === 'dex' && f.dangerSense && !this.hasCond(c, 'blinded') && !this.incap(c)) adv.push('чувство опасности');
    if (ab === 'str' && this.hasEff(c, 'rage')) adv.push('ярость');
    if (opts.poison && f.dwarvenResilience) adv.push('дварфская стойкость');
    if (opts.cond === 'charmed' && (f.feyAncestry || f.darkDevotion)) adv.push('наследие');
    if (opts.cond === 'frightened' && (f.brave || f.darkDevotion)) adv.push('храбрость');
    if (ab === 'dex' && this.hasCond(c, 'restrained')) dis.push('опутан');
    const mode = adv.length && !dis.length ? 1 : dis.length && !adv.length ? -1 : 0;
    let roll = Dice.d20(mode, f.lucky);
    let bonus = c.saves[ab];
    const bless = this.blessBonus(c);
    const aura = this.auraOfProtection(c);
    bonus += aura;
    let total = roll.value + bonus + bless;
    total += await this.useInspiration(c, total, dc);
    let ok = total >= dc;
    await this.h.roll({ kind: 'save', actor: c, label: 'Спасбросок ' + abName, d20: roll, bonus: bonus + bless, total, vs: dc, ok });
    let extra = (bless ? ' (благословение +' + bless + ')' : '') + (aura ? ' (аура +' + aura + ')' : '') + (mode > 0 ? ' [преимущество]' : mode < 0 ? ' [помеха]' : '');
    if (!ok && c.res && c.res.indomitable && c.res.indomitable.used < c.res.indomitable.max) {
      const use = await this.askReactor(c, c.name + ' провалил спасбросок (' + total + ' против Сл ' + dc + '). Использовать «Упорный» и перебросить?', [
        { label: 'Перебросить', value: true },
        { label: 'Нет', value: false },
      ], true);
      if (use) {
        c.res.indomitable.used++;
        roll = Dice.d20(0, f.lucky);
        total = roll.value + bonus;
        ok = total >= dc;
        extra += ' (Упорный — переброс)';
        await this.h.roll({ kind: 'save', actor: c, label: 'Переброс спасброска', d20: roll, bonus, total, vs: dc, ok });
      }
    }
    this.log(this.name(c) + ' — спасбросок ' + abName + ': ' + rollTxt(roll) + ' ' + U.fmtMod(bonus) + ' = <b>' + total + '</b> против Сл ' + dc + extra + ' — ' + (ok ? '<span class="good">успех</span>' : '<span class="bad">провал</span>'));
    if (!ok && c.res && c.res.legendary && c.res.legendary.used < c.res.legendary.max) {
      c.res.legendary.used++;
      ok = true;
      this.log(this.name(c) + ' использует Легендарное сопротивление (' + (c.res.legendary.max - c.res.legendary.used) + ' осталось) — спасбросок успешен!', 'warn');
    }
    return { ok, total, nat: roll.value };
  };

  function rollTxt(roll) {
    if (roll.rolls.length === 1) return '[' + roll.rolls[0] + ']';
    return '[' + roll.rolls.join(', ') + ' → ' + roll.value + ']';
  }

  P.askReactor = async function (c, question, options, aiDefault) {
    if (c.controller === 'ai') return aiDefault;
    return this.h.ask(question, options, c);
  };

  /* ---------- Инициатива ---------- */
  P.rollInitiative = function (c, manual) {
    let total;
    let roll = null;
    if (manual != null) total = Number(manual);
    else {
      roll = Dice.d20(c.initAdv ? 1 : 0, c.flags && c.flags.lucky);
      total = roll.value + c.initBonus;
    }
    c.initiative = total;
    c.initRoll = roll;
    this.log(this.name(c) + ' — инициатива: ' + (roll ? rollTxt(roll) + ' ' + U.fmtMod(c.initBonus) + ' = ' : '') + '<b>' + total + '</b>', 'init');
    this.h.changed();
    return { total, roll };
  };

  P.sortInitiative = function () {
    const B = this.B;
    const list = B.combatants.filter((c) => c.x >= 0 && !c.dead);
    list.forEach((c) => (c._tie = Math.random()));
    list.sort((a, b) => (b.initiative || 0) - (a.initiative || 0) || b.abil.dex - a.abil.dex || a._tie - b._tie);
    B.order = list.map((c) => c.uid);
  };

  P.beginCombat = async function () {
    const B = this.B;
    for (const c of B.combatants) if (c.initiative == null && c.x >= 0) this.rollInitiative(c);
    this.sortInitiative();
    B.phase = 'combat';
    B.round = 1;
    B.turnIdx = 0;
    B.hadSides = {
      heroes: B.combatants.some((c) => c.side !== 'enemies'),
      enemies: B.combatants.some((c) => c.side === 'enemies'),
    };
    this.log('⚔️ <b>Бой начинается! Раунд 1</b>', 'round');
    await this.startTurn();
  };

  /* ---------- Ходы ---------- */
  P.startTurn = async function () {
    const B = this.B;
    if (B.phase !== 'combat') return;
    const c = this.current();
    if (!c || c.dead) return this.nextTurn();
    B.turn = {
      uid: c.uid, move: 0, actions: 1, bonus: true, attacksLeft: 0, pool: null, bonusAttack: null,
      attackActionUsed: false, moved: 0, startX: c.x, startY: c.y, bonusSpell: false, leveledSpell: false,
      disengaged: false, rampage: false, lastSlot: null, lastLight: false, lastUnarmed: false, attacked: false,
      flags: {},
    };
    c.reactionUsed = false;
    this.log('— Ход: ' + this.name(c) + (c.player ? ' <span class="muted">(игрок ' + U.escapeHtml(c.player) + ')</span>' : ''), 'turn');
    this.tickDurations(c.uid, 'start');

    // Перезарядка способностей
    for (const id in c.recharge || {}) {
      if (!c.recharge[id]) {
        const spec = c.specials.find((s) => s.id === id) || c.attacks.find((a) => a.id === id);
        const need = (spec && spec.recharge) || 5;
        const r = Dice.die(6);
        if (r >= need) {
          c.recharge[id] = true;
          this.log(this.name(c) + ': «' + (spec ? spec.name : id) + '» перезаряжено (d6 = ' + r + ').', 'warn');
        }
      }
    }

    // Регенерация
    if (c.flags && c.flags.regeneration) {
      if (c.regenBlocked) {
        c.regenBlocked = false;
        if (c.hp <= 0) {
          this.kill(c, 'не смог регенерировать');
        } else this.log(this.name(c) + ' не регенерирует в этот ход (огонь/кислота).', 'muted');
      } else if (c.hp < c.maxHp || c.down) {
        const amt = c.flags.regeneration.amount || 10;
        const was = c.hp;
        c.hp = Math.min(c.maxHp, c.hp + amt);
        if (c.down) {
          c.down = false;
          this.removeCond(c, 'unconscious');
          this.log(this.name(c) + ' поднимается, регенерируя!', 'bad');
        }
        this.log(this.name(c) + ' регенерирует ' + (c.hp - was) + ' хитов.', 'warn');
        this.h.float(c, '+' + (c.hp - was), '#7cfc7c');
      }
    }
    if (c.dead) {
      await this.checkEnd();
      return this.nextTurn();
    }

    // Спасброски от смерти
    if (c.kind === 'pc' && c.hp <= 0 && !c.stable) {
      await this.deathSave(c);
      if (c.dead) {
        await this.checkEnd();
        if (B.phase !== 'combat') return;
      }
    }

    // Ауры врагов (Духовные стражи) и зловоние
    for (const o of B.combatants) {
      if (o.dead || o.x < 0 || o.uid === c.uid) continue;
      const aura = this.getEff(o, 'spiritGuardians');
      if (aura && this.hostile(o, c) && G.distFt(o, c) <= aura.data.size && c.hp > 0) {
        this.log(this.name(c) + ' начинает ход в Духовных стражах ' + this.name(o) + '.', 'spell');
        const sv = await this.save(c, 'wis', aura.data.dc, { magic: true });
        const dmg = Dice.roll(aura.data.dice);
        await this.applyDamage(c, [{ amount: sv.ok ? Math.floor(dmg.total / 2) : dmg.total, type: 'radiant' }], o, { magical: true, spell: true });
      }
      if (o.flags && o.flags.stench && this.hostile(o, c) && o.hp > 0 && G.distFt(o, c) <= 5 && c.hp > 0 && !(c.stenchImmune || {})[o.uid]) {
        const sv = await this.save(c, 'con', o.flags.stench.dc, { poison: true });
        if (!sv.ok) {
          if (this.addCond(c, 'poisoned', { src: o.uid, expire: { who: c.uid, at: 'start', n: 1 } })) this.log(this.name(c) + ' отравлен зловонием.', 'bad');
        } else {
          c.stenchImmune = c.stenchImmune || {};
          c.stenchImmune[o.uid] = true;
        }
      }
    }

    // Опасная местность в начале хода
    await this.hazardAt(c, 'start');
    if (c.dead) {
      await this.checkEnd();
      return this.nextTurn();
    }

    // Безрассудство монстров
    if (c.flags && c.flags.reckless && c.controller === 'ai' && c.hp > 0 && !this.incap(c)) {
      this.addEff(c, { id: 'reckless', src: c.uid, expire: { who: c.uid, at: 'start', n: 1 }, silent: true });
      this.addEff(c, { id: 'recklessAtk', src: c.uid, expire: { who: c.uid, at: 'end', n: 1 }, silent: true });
      this.log(this.name(c) + ' атакует безрассудно.', 'muted');
    }

    B.turn.move = this.speedOf(c);
    this.h.changed();
  };

  P.hazardAt = async function (c, when) {
    if (c.dead || c.x < 0 || this.canFly(c)) return;
    let worst = null;
    for (const [x, y] of G.footprint(c.x, c.y, c.cells)) {
      const t = G.tile(this.B.map, x, y);
      if (t.hazard && (!worst || Dice.average(t.hazard.dice) > Dice.average(worst.hazard.dice))) worst = t;
    }
    if (!worst) return;
    const r = Dice.roll(worst.hazard.dice);
    this.log(this.name(c) + ' ' + (when === 'start' ? 'находится' : 'попадает') + ' в «' + worst.name + '»: ' + r.total + ' ' + D.dmgPhrase(worst.hazard.type) + ' ' + Dice.fmtRolls(r), 'bad');
    await this.applyDamage(c, [{ amount: r.total, type: worst.hazard.type }], null, { magical: false });
  };

  P.deathSave = async function (c) {
    const roll = Dice.d20(0, c.flags && c.flags.lucky);
    await this.h.roll({ kind: 'death', actor: c, label: 'Спасбросок от смерти', d20: roll, bonus: 0, total: roll.value, vs: 10, ok: roll.value >= 10 });
    if (roll.value === 20) {
      c.hp = 1;
      c.death = { s: 0, f: 0 };
      this.removeCond(c, 'unconscious');
      this.log(this.name(c) + ' — спасбросок от смерти: <b>20!</b> Приходит в себя с 1 хитом!', 'good');
      this.h.float(c, '+1', '#7cfc7c');
    } else if (roll.value >= 10) {
      c.death.s++;
      this.log(this.name(c) + ' — спасбросок от смерти: ' + roll.value + ' — успех (' + c.death.s + '/3).', 'good');
      if (c.death.s >= 3) {
        c.stable = true;
        this.log(this.name(c) + ' стабилизирован.', 'good');
      }
    } else {
      c.death.f += roll.value === 1 ? 2 : 1;
      this.log(this.name(c) + ' — спасбросок от смерти: ' + roll.value + ' — провал (' + Math.min(3, c.death.f) + '/3).', 'bad');
      if (c.death.f >= 3) this.kill(c, 'не пережил ран');
    }
    this.h.changed();
  };

  P.endTurn = async function () {
    const B = this.B;
    const c = this.current();
    if (!c) return;
    // Повторные спасброски в конце хода
    for (const cond of c.conditions.slice()) {
      if (cond.save && cond.save.at === 'end' && !c.dead) {
        this.log(this.name(c) + ' пытается избавиться от состояния «' + R.CONDITIONS[cond.id].name + '».', 'muted');
        const sv = await this.save(c, cond.save.ab, cond.save.dc, { magic: !!cond.conc, cond: cond.id });
        if (sv.ok) {
          c.conditions = c.conditions.filter((x) => x !== cond);
          if (cond.alsoRemove) cond.alsoRemove.forEach((id) => this.removeCond(c, id, (x) => x.src === cond.src));
          this.log(this.name(c) + ' больше не ' + R.CONDITIONS[cond.id].name.toLowerCase() + '.', 'good');
        }
      }
    }
    this.tickDurations(c.uid, 'end');
    this.h.changed();
    if (await this.checkEnd()) return;
    await this.nextTurn();
  };

  P.nextTurn = async function () {
    const B = this.B;
    if (B.phase !== 'combat') return;
    const alive = B.order.filter((uid) => {
      const o = this.get(uid);
      return o && !o.dead;
    });
    if (!alive.length) return;
    let guard = 0;
    do {
      B.turnIdx++;
      if (B.turnIdx >= B.order.length) {
        B.turnIdx = 0;
        B.round++;
        this.log('🔔 <b>Раунд ' + B.round + '</b>', 'round');
      }
      guard++;
    } while (guard < 500 && (!this.get(B.order[B.turnIdx]) || this.get(B.order[B.turnIdx]).dead));
    await this.startTurn();
  };

  P.checkEnd = async function () {
    const B = this.B;
    if (B.phase !== 'combat' || !B.hadSides) return false;
    const enemiesLeft = B.combatants.some((c) => c.side === 'enemies' && !c.dead && c.x >= 0 && (c.hp > 0 || c.down));
    const heroesLeft = B.combatants.some((c) => c.side !== 'enemies' && !c.dead && c.x >= 0 && c.hp > 0);
    if (B.hadSides.enemies && !enemiesLeft) {
      B.phase = 'ended';
      B.result = 'victory';
      this.log('🏆 <b>Победа!</b> Все враги повержены. Опыт: ' + B.xp + ' XP.', 'round');
      this.h.ended('victory');
      this.h.changed();
      return true;
    }
    if (B.hadSides.heroes && !heroesLeft) {
      B.phase = 'ended';
      B.result = 'defeat';
      this.log('💀 <b>Поражение…</b> Все герои пали.', 'round');
      this.h.ended('defeat');
      this.h.changed();
      return true;
    }
    return false;
  };

  /* ---------- Смерть и урон ---------- */
  P.kill = function (c, reason) {
    if (c.dead) return;
    c.dead = true;
    c.hp = 0;
    c.down = false;
    c.deathRound = this.B.round;
    if (c.concentration) this.endConcentration(c, 'гибель');
    c.conditions = [];
    c.effects = c.effects.filter((e) => e.id === 'aid');
    if (c.side === 'enemies') this.B.xp += c.xp || 0;
    // Освобождаем схваченных
    for (const o of this.B.combatants) o.conditions = o.conditions.filter((x) => !(x.src === c.uid && (x.id === 'grappled' || x.grappleLink)));
    this.log('☠️ ' + this.name(c) + ' погибает' + (reason ? ' (' + reason + ')' : '') + '.', 'bad');
    this.h.float(c, '☠', '#ff5555');
    this.h.changed();
  };

  P.applyDamage = async function (tgt, parts, src, opts) {
    opts = opts || {};
    if (!tgt || tgt.dead) return 0;
    let total = 0;
    const segs = [];
    let blocked = false;
    for (const p of parts) {
      if (!p || p.amount <= 0) continue;
      let a = p.amount;
      let note = '';
      if (tgt.immune.includes(p.type)) {
        a = 0;
        note = 'иммунитет';
      } else {
        const phys = R.PHYSICAL.includes(p.type);
        const res = tgt.resist.includes(p.type) || (phys && tgt.resistNonmagical && !opts.magical) || (phys && this.hasEff(tgt, 'rage')) || this.hasCond(tgt, 'petrified');
        if (res) {
          a = Math.floor(a / 2);
          note = 'сопротивление';
        }
        if (tgt.vuln.includes(p.type)) {
          a *= 2;
          note = 'уязвимость';
        }
      }
      if (tgt.flags && tgt.flags.regeneration && (tgt.flags.regeneration.blockedBy || []).includes(p.type)) blocked = true;
      total += a;
      segs.push(a + ' ' + R.DAMAGE_SHORT[p.type] + (note ? ' (' + note + ')' : ''));
    }
    if (blocked) tgt.regenBlocked = true;
    if (total <= 0) {
      this.log(this.name(tgt) + ' не получает урона' + (segs.length ? ' (' + segs.join(', ') + ')' : '') + '.', 'muted');
      return 0;
    }
    // Временные хиты
    let dmg = total;
    if (tgt.tempHp > 0) {
      const absorbed = Math.min(tgt.tempHp, dmg);
      tgt.tempHp -= absorbed;
      dmg -= absorbed;
      if (absorbed) segs.push('поглощено временными хитами: ' + absorbed);
    }
    this.h.float(tgt, '-' + total, '#ff6b5b');
    // Сон и изгнание прерываются уроном
    if (this.removeCond(tgt, 'unconscious', (x) => x.tag === 'sleep')) {
      this.log(this.name(tgt) + ' просыпается от боли.', 'muted');
    }
    this.removeCond(tgt, 'frightened', (x) => x.tag === 'turned');

    const before = tgt.hp;
    if (before <= 0) {
      if (tgt.kind === 'pc' && !tgt.dead) {
        this.log(this.name(tgt) + ' получает ' + total + ' урона, находясь без сознания (' + segs.join(', ') + ').', 'bad');
        if (dmg >= tgt.maxHp) this.kill(tgt, 'смертельный урон');
        else {
          tgt.stable = false;
          tgt.death.f += opts.crit ? 2 : 1;
          this.log(this.name(tgt) + ': провал спасброска от смерти (' + Math.min(3, tgt.death.f) + '/3).', 'bad');
          if (tgt.death.f >= 3) this.kill(tgt, 'добит');
        }
      }
      await this.checkEnd();
      return total;
    }
    tgt.hp -= dmg;
    this.log(this.name(tgt) + ' получает <b class="dmg">' + total + '</b> урона (' + segs.join(', ') + '). Хиты: ' + Math.max(0, tgt.hp) + '/' + tgt.maxHp, 'dmg');
    if (tgt.hp <= 0) {
      const overflow = -tgt.hp;
      tgt.hp = 0;
      let saved = false;
      if (tgt.flags && tgt.flags.undeadFortitude && !parts.some((p) => p.type === 'radiant') && !opts.crit) {
        const sv = await this.save(tgt, 'con', 5 + total, {});
        if (sv.ok) {
          tgt.hp = 1;
          saved = true;
          this.log(this.name(tgt) + ' не падает — Стойкость нежити!', 'warn');
        }
      }
      if (!saved && tgt.res && tgt.res.relentlessM && tgt.res.relentlessM.used < 1 && total <= tgt.flags.relentless) {
        tgt.res.relentlessM.used++;
        tgt.hp = 1;
        saved = true;
        this.log(this.name(tgt) + ' остаётся на ногах (Неутомимость).', 'warn');
      }
      if (!saved && tgt.res && tgt.res.relentless && tgt.res.relentless.used < 1 && overflow < tgt.maxHp) {
        tgt.res.relentless.used++;
        tgt.hp = 1;
        saved = true;
        this.log(this.name(tgt) + ' остаётся с 1 хитом (Непоколебимая стойкость).', 'good');
      }
      if (!saved) this.dropToZero(tgt, overflow, src, opts);
    }
    // Концентрация
    if (tgt.concentration && !tgt.dead && tgt.hp > 0) {
      const dc = Math.max(10, Math.floor(total / 2));
      this.log(this.name(tgt) + ' поддерживает концентрацию (Сл ' + dc + ').', 'muted');
      const sv = await this.save(tgt, 'con', dc, {});
      if (!sv.ok) this.endConcentration(tgt, 'урон');
    }
    // Адское возмездие
    if (src && !tgt.dead && tgt.hp > 0 && this.hostile(tgt, src) && !src.dead && opts.fromAttack !== false) {
      await this.tryHellishRebuke(tgt, src);
    }
    this.h.changed();
    await this.checkEnd();
    return total;
  };

  P.dropToZero = function (tgt, overflow, src, opts) {
    if (src && src.flags && src.flags.darkOnesBlessing && this.hostile(src, tgt)) {
      const th = Math.max(1, src.mods.cha + (src.level || 1));
      if (th > src.tempHp) {
        src.tempHp = th;
        this.log(this.name(src) + ' получает ' + th + ' временных хитов (Благословение Тёмного).', 'good');
      }
    }
    if (src && src.flags && src.flags.rampage && this.B.turn && this.B.turn.uid === src.uid && opts && opts.melee) this.B.turn.rampage = true;
    if (tgt.kind === 'pc') {
      if (overflow >= tgt.maxHp) {
        this.kill(tgt, 'мгновенная смерть от огромного урона');
        return;
      }
      tgt.death = { s: 0, f: 0 };
      tgt.stable = false;
      this.removeEff(tgt, 'rage');
      this.addCond(tgt, 'unconscious', { tag: 'dying' });
      this.addCond(tgt, 'prone', {});
      this.log('💔 ' + this.name(tgt) + ' теряет сознание и при смерти!', 'bad');
      return;
    }
    if (tgt.flags && tgt.flags.regeneration && !tgt.regenBlocked) {
      tgt.down = true;
      this.addCond(tgt, 'unconscious', { tag: 'regen' });
      this.addCond(tgt, 'prone', {});
      this.log(this.name(tgt) + ' падает… но раны уже затягиваются! (добейте огнём или кислотой)', 'warn');
      return;
    }
    this.kill(tgt);
  };

  P.heal = function (tgt, amount, src) {
    if (!tgt || tgt.dead) return 0;
    if (['undead', 'construct'].includes(tgt.type) && src) {
      this.log('Лечение не действует на ' + this.name(tgt) + '.', 'muted');
      return 0;
    }
    const was = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + amount);
    const got = tgt.hp - was;
    if (was <= 0 && tgt.hp > 0) {
      tgt.death = { s: 0, f: 0 };
      tgt.stable = false;
      tgt.down = false;
      this.removeCond(tgt, 'unconscious', (x) => x.tag !== 'sleep');
      this.log(this.name(tgt) + ' приходит в себя!', 'good');
    }
    this.log(this.name(tgt) + ' восстанавливает <b class="heal">' + got + '</b> хитов (' + tgt.hp + '/' + tgt.maxHp + ').', 'heal');
    this.h.float(tgt, '+' + got, '#7cfc7c');
    this.h.changed();
    return got;
  };

  /* ---------- Атака ---------- */
  P.attackMode = function (att, tgt, atk, isRanged, dist) {
    const adv = [];
    const dis = [];
    const B = this.B;
    if (this.hasCond(tgt, 'blinded')) adv.push('цель ослеплена');
    if (this.hasCond(tgt, 'paralyzed')) adv.push('цель парализована');
    if (this.hasCond(tgt, 'stunned')) adv.push('цель ошеломлена');
    if (this.hasCond(tgt, 'unconscious')) adv.push('цель без сознания');
    if (this.hasCond(tgt, 'restrained')) adv.push('цель опутана');
    if (this.hasCond(tgt, 'petrified')) adv.push('цель окаменела');
    if (this.hasCond(tgt, 'prone')) {
      if (dist <= 5) adv.push('цель лежит рядом');
      else dis.push('цель лежит далеко');
    }
    if (this.hasCond(att, 'invisible')) adv.push('атакующий невидим');
    if (this.hasCond(tgt, 'invisible')) dis.push('цель невидима');
    if (this.hasEff(tgt, 'reckless')) adv.push('безрассудство цели');
    if (this.hasEff(tgt, 'guidingBolt')) adv.push('направленный снаряд');
    if (tgt.effects.some((e) => e.id === 'helped' && !this.hostile(this.get(e.src) || att, att))) adv.push('помощь союзника');
    if (this.hasEff(att, 'recklessAtk') && !isRanged && atk.ability === 'str' && !atk.isSpell) adv.push('безрассудная атака');
    if (att.flags && att.flags.packTactics) {
      const ally = B.combatants.some((o) => o.uid !== att.uid && !o.dead && !this.hostile(o, att) && this.hostile(o, tgt) && !this.incap(o) && o.x >= 0 && G.distFt(o, tgt) <= 5);
      if (ally) adv.push('тактика стаи');
    }
    if (this.hasCond(att, 'blinded')) dis.push('атакующий ослеплён');
    if (this.hasCond(att, 'poisoned')) dis.push('отравлен');
    if (this.hasCond(att, 'frightened')) dis.push('испуган');
    if (this.hasCond(att, 'restrained')) dis.push('опутан');
    if (this.hasCond(att, 'prone')) dis.push('атакующий лежит');
    if (this.hasEff(tgt, 'dodge') && !this.incap(tgt)) dis.push('цель уклоняется');
    if (this.hasEff(att, 'mockery')) dis.push('злая насмешка');
    if (isRanged) {
      const near = B.combatants.some((o) => !o.dead && o.x >= 0 && this.hostile(o, att) && !this.incap(o) && G.distFt(o, att) <= 5);
      if (near) dis.push('враг рядом');
      if (atk.range && dist > atk.range[0]) dis.push('большая дистанция');
    }
    const mode = adv.length && !dis.length ? 1 : dis.length && !adv.length ? -1 : 0;
    return { mode, adv, dis };
  };

  P.attackInfo = function (att, atk, tgt) {
    const realDist = G.distFt(att, tgt);
    const dist = atk.proxyMelee && realDist <= (atk.reach || 5) ? 5 : realDist;
    let isRanged = atk.kind === 'ranged';
    if (atk.kind === 'both') isRanged = dist > (atk.reach || 5);
    const reach = atk.reach || 5;
    let ok = true;
    let reason = '';
    if (!isRanged && dist > reach) {
      ok = false;
      reason = 'слишком далеко (' + dist + ' фт., досягаемость ' + reach + ' фт.)';
    }
    if (isRanged) {
      const maxR = atk.range ? atk.range[1] : reach;
      if (dist > maxR) {
        ok = false;
        reason = 'вне дистанции (' + dist + ' фт., макс. ' + maxR + ' фт.)';
      } else if (!G.hasLOS(this.B.map, att, tgt)) {
        ok = false;
        reason = 'нет линии обзора';
      }
    } else if (realDist > 5 && !G.hasLOS(this.B.map, att, tgt)) {
      ok = false;
      reason = 'нет линии обзора';
    }
    if (tgt.dead) {
      ok = false;
      reason = 'цель мертва';
    }
    if (tgt.uid === att.uid) {
      ok = false;
      reason = 'нельзя атаковать себя';
    }
    if (this.hasCond(att, 'charmed') && att.conditions.some((x) => x.id === 'charmed' && x.src === tgt.uid)) {
      ok = false;
      reason = 'очарован целью';
    }
    const m = ok ? this.attackMode(att, tgt, atk, isRanged, dist) : { mode: 0, adv: [], dis: [] };
    return { ok, reason, dist, isRanged, mode: m.mode, adv: m.adv, dis: m.dis };
  };

  P.critRange = function (att, atk) {
    if (atk.isSpell) return 20;
    return (att.flags && att.flags.critRange) || 20;
  };

  P.attack = async function (att, atk, tgt, ctx) {
    ctx = ctx || {};
    const info = this.attackInfo(att, atk, tgt);
    if (!info.ok) {
      this.log(this.name(att) + ' не может атаковать: ' + info.reason + '.', 'muted');
      return { ok: false, reason: info.reason };
    }
    const B = this.B;
    const turn = B.turn || {};
    if (turn.uid === att.uid) turn.attacked = true;
    // Расход разовых эффектов на цели
    const guided = this.getEff(tgt, 'guidingBolt');
    if (guided) this.removeEff(tgt, 'guidingBolt');
    const helped = tgt.effects.find((e) => e.id === 'helped' && !this.hostile(this.get(e.src) || att, att));
    if (helped) tgt.effects = tgt.effects.filter((e) => e !== helped);
    if (this.hasEff(att, 'mockery')) this.removeEff(att, 'mockery');

    const roll = Dice.d20(info.mode, att.flags && att.flags.lucky);
    let bonus = atk.toHit;
    const sacred = this.getEff(att, 'sacredWeapon');
    if (sacred && atk.weapon && !atk.monster) bonus += sacred.value;
    const bless = this.blessBonus(att);
    let total = roll.value + bonus + bless;
    const ac = this.acOf(tgt);
    let crit = roll.value >= this.critRange(att, atk);
    let hit = roll.value === 20 || crit || (roll.value !== 1 && total >= ac);
    if (!hit && roll.value !== 1) {
      const add = await this.useInspiration(att, total, ac);
      total += add;
      hit = total >= ac;
    }
    if (hit && info.dist <= 5 && (this.hasCond(tgt, 'paralyzed') || this.hasCond(tgt, 'unconscious'))) crit = true;

    await this.h.roll({ kind: 'attack', actor: att, target: tgt, label: atk.name, d20: roll, bonus: bonus + bless, total, vs: ac, ok: hit, crit });

    const modeTxt = info.mode > 0 ? ' <span class="adv">[преимущество: ' + info.adv.join(', ') + ']</span>' : info.mode < 0 ? ' <span class="dis">[помеха: ' + info.dis.join(', ') + ']</span>' : '';
    const head = this.name(att) + ' ' + (ctx.opportunity ? 'совершает атаку по возможности' : 'атакует') + ' ' + this.name(tgt) + ' (' + U.escapeHtml(atk.name) + '): ' +
      rollTxt(roll) + ' ' + U.fmtMod(bonus) + (bless ? ' +' + bless + ' (благ.)' : '') + ' = <b>' + total + '</b> против КД ' + ac + modeTxt;

    // Реакции цели: Щит, Парирование
    if (hit && roll.value !== 20 && !crit) {
      if (this.canReact(tgt) && (tgt.spells || []).includes('shield') && total < ac + 5 && this.lowestSlot(tgt, 1)) {
        const use = await this.askReactor(tgt, tgt.name + ': по вам попадают (' + total + ' против КД ' + ac + '). Наложить «Щит» (+5 КД)?', [
          { label: 'Наложить Щит', value: true },
          { label: 'Нет', value: false },
        ], true);
        if (use) {
          const lvl = this.lowestSlot(tgt, 1);
          this.useSlot(tgt, lvl);
          tgt.reactionUsed = true;
          this.addEff(tgt, { id: 'shield', src: tgt.uid, expire: { who: tgt.uid, at: 'start', n: 1 } });
          this.log(this.name(tgt) + ' накладывает <i>Щит</i> реакцией! КД ' + (ac + 5) + '.', 'spell');
          hit = total >= ac + 5;
        }
      }
      if (hit && !info.isRanged && tgt.flags && tgt.flags.parry && this.canReact(tgt) && total < ac + tgt.flags.parry) {
        const use = await this.askReactor(tgt, tgt.name + ': парировать удар (+' + tgt.flags.parry + ' КД)?', [
          { label: 'Парировать', value: true },
          { label: 'Нет', value: false },
        ], true);
        if (use) {
          tgt.reactionUsed = true;
          hit = false;
          this.log(this.name(tgt) + ' парирует удар!', 'warn');
        }
      }
    }

    if (!hit) {
      this.log(head + ' — <span class="miss">' + (roll.value === 1 ? 'критический промах!' : 'промах') + '</span>', 'attack');
      this.h.float(tgt, 'Промах', '#cccccc');
      this.h.changed();
      return { ok: true, hit: false, roll };
    }
    this.log(head + ' — <span class="hit">' + (crit ? 'КРИТИЧЕСКОЕ ПОПАДАНИЕ!' : 'попадание') + '</span>', crit ? 'crit' : 'attack');

    // Урон
    const parts = await this.rollAttackDamage(att, atk, tgt, crit, info, ctx);
    // Невероятное уклонение
    if (tgt.flags && tgt.flags.uncannyDodge && this.canReact(tgt) && parts.length) {
      const sum = parts.reduce((s, p) => s + p.amount, 0);
      const use = await this.askReactor(tgt, tgt.name + ': использовать Невероятное уклонение (урон ' + sum + ' → ' + Math.floor(sum / 2) + ')?', [
        { label: 'Уклониться', value: true },
        { label: 'Нет', value: false },
      ], sum >= 6);
      if (use) {
        tgt.reactionUsed = true;
        parts.forEach((p) => (p.amount = Math.floor(p.amount / 2)));
        this.log(this.name(tgt) + ' использует Невероятное уклонение — урон уменьшен вдвое.', 'good');
      }
    }
    const magical = !!atk.magical || !!atk.isSpell;
    await this.applyDamage(tgt, parts, att, { crit, magical, melee: !info.isRanged, fromAttack: true });

    // Эффекты при попадании
    if (!tgt.dead) await this.onHitEffects(att, atk, tgt, ctx, info);
    this.h.changed();
    return { ok: true, hit: true, crit, roll };
  };

  P.rollAttackDamage = async function (att, atk, tgt, crit, info, ctx) {
    const parts = [];
    const notes = [];
    const B = this.B;
    const tk = this.turnKey();
    att.once = att.once || {};
    const onceOk = (k) => att.once[k] !== tk;
    const useOnce = (k) => (att.once[k] = tk);
    const f = att.flags || {};

    let dmgList = atk.dmg;
    if (info.isRanged && atk.rangedDmg) dmgList = atk.rangedDmg;
    if (ctx.offhand && !atk.monster) {
      const bonus = f.fightingStyle === 'twf' ? atk.dmgBonus : Math.min(0, atk.abMod) + (atk.magic || 0);
      dmgList = [{ dice: atk.dieOnly + (bonus > 0 ? '+' + bonus : bonus < 0 ? String(bonus) : ''), type: atk.dmg[0].type }];
    }
    dmgList.forEach((dm, i) => {
      const r = Dice.roll(dm.dice, { crit, rerollBelow: i === 0 && atk.gwf ? 2 : 0 });
      let amount = Math.max(0, r.total);
      if (dm.addMod && att.spellcasting) amount += att.spellcasting.mod;
      parts.push({ amount, type: dm.type, txt: dm.dice + ' ' + Dice.fmtRolls(r) });
    });
    const physType = (dmgList[0] && dmgList[0].type) || 'bludgeoning';
    const weaponAtk = atk.weapon && !atk.isSpell;
    const meleeW = weaponAtk && !info.isRanged;

    if (weaponAtk && this.hasEff(att, 'rage') && meleeW && atk.ability === 'str') {
      parts.push({ amount: f.rageDamage || 2, type: physType, txt: 'ярость' });
    }
    // Скрытая атака
    if (f.sneakDice && weaponAtk && (atk.finesse || info.isRanged) && onceOk('sneak')) {
      const allyNear = B.combatants.some((o) => o.uid !== att.uid && !o.dead && !this.hostile(o, att) && this.hostile(o, tgt) && !this.incap(o) && o.x >= 0 && G.distFt(o, tgt) <= 5);
      if (info.mode > 0 || (allyNear && info.mode >= 0)) {
        useOnce('sneak');
        const r = Dice.roll(f.sneakDice + 'd6', { crit });
        parts.push({ amount: r.total, type: physType, txt: 'скрытая атака ' + Dice.fmtRolls(r) });
      }
    }
    // Сглаз / Метка охотника
    const hex = tgt.effects.find((e) => e.id === 'hex' && e.src === att.uid);
    if (hex) {
      const r = Dice.roll('1d6', { crit });
      parts.push({ amount: r.total, type: 'necrotic', txt: 'сглаз' });
    }
    const mark = tgt.effects.find((e) => e.id === 'hunterMark' && e.src === att.uid);
    if (mark && weaponAtk) {
      const r = Dice.roll('1d6', { crit });
      parts.push({ amount: r.total, type: physType, txt: 'метка охотника' });
    }
    if (f.colossusSlayer && weaponAtk && tgt.hp < tgt.maxHp && onceOk('colossus')) {
      useOnce('colossus');
      const r = Dice.roll('1d8', { crit });
      parts.push({ amount: r.total, type: physType, txt: 'убийца колоссов' });
    }
    if (f.divineStrike && weaponAtk && onceOk('divineStrike')) {
      useOnce('divineStrike');
      const r = Dice.roll('1d8', { crit });
      parts.push({ amount: r.total, type: 'radiant', txt: 'божественный удар' });
    }
    if (f.martialAdvantage && weaponAtk && onceOk('martialAdv')) {
      const allyNear = B.combatants.some((o) => o.uid !== att.uid && !o.dead && !this.hostile(o, att) && this.hostile(o, tgt) && !this.incap(o) && o.x >= 0 && G.distFt(o, tgt) <= 5);
      if (allyNear) {
        useOnce('martialAdv');
        const r = Dice.roll(f.martialAdvantage, { crit });
        parts.push({ amount: r.total, type: physType, txt: 'воинское превосходство' });
      }
    }
    if (ctx.charge) {
      const r = Dice.roll(ctx.charge.dmg[0].dice, { crit });
      parts.push({ amount: r.total, type: ctx.charge.dmg[0].type, txt: 'атака в броске' });
    }
    if (crit && meleeW) {
      const die = (atk.dieOnly || (atk.dmg[0] && atk.dmg[0].dice) || '1d4').match(/\d*d\d+/);
      if (die) {
        const one = '1d' + die[0].split('d')[1];
        if (f.savageAttacks && onceOk('savage')) {
          useOnce('savage');
          const r = Dice.roll(one);
          parts.push({ amount: r.total, type: physType, txt: 'свирепые атаки' });
        }
        if (f.brutalCritical) {
          const r = Dice.roll(one);
          parts.push({ amount: r.total, type: physType, txt: 'сильный критический удар' });
        }
      }
    }
    // Божественная кара
    if (f.divineSmite && meleeW && att.spellcasting && this.anySlot(att)) {
      const avail = this.availableSlots(att);
      const options = avail.map((l) => ({ label: 'Ячейка ' + l + ' ур. (+' + Math.min(5, 1 + l) + 'd8)', value: l }));
      options.push({ label: 'Не использовать', value: 0 });
      const aiChoice = crit || ['undead', 'fiend'].includes(tgt.type) ? avail[0] : 0;
      const lvl = await this.askReactor(att, att.name + ' попадает по ' + tgt.name + (crit ? ' (КРИТ!)' : '') + '. Использовать Божественную кару?', options, aiChoice);
      if (lvl) {
        this.useSlot(att, lvl);
        let dice = Math.min(5, 1 + lvl);
        if (['undead', 'fiend'].includes(tgt.type)) dice += 1;
        const r = Dice.roll(dice + 'd8', { crit });
        parts.push({ amount: r.total, type: 'radiant', txt: 'божественная кара ' + Dice.fmtRolls(r) });
      }
    }
    for (const p of parts) notes.push(p.amount + ' ' + R.DAMAGE_SHORT[p.type] + (p.txt ? ' <span class="muted">(' + p.txt + ')</span>' : ''));
    this.log('Урон: ' + notes.join(' + '), 'dmgroll');
    return parts.map((p) => ({ amount: p.amount, type: p.type }));
  };

  P.onHitEffects = async function (att, atk, tgt, ctx, info) {
    const oh = atk.onHit;
    if (oh) {
      const skip = (oh.notTypes && oh.notTypes.includes(tgt.type)) || (oh.notRace && tgt.race === oh.notRace);
      if (!skip) {
        if (oh.save && oh.condition) {
          const sv = await this.save(tgt, oh.save, oh.dc, { cond: oh.condition });
          if (!sv.ok) {
            const opts = { src: att.uid };
            if (oh.repeat) opts.save = { ab: oh.save, dc: oh.dc, at: 'end' };
            if (oh.rounds) opts.expire = { who: tgt.uid, at: 'end', n: oh.rounds };
            if (this.addCond(tgt, oh.condition, opts)) this.log(this.name(tgt) + ': ' + R.CONDITIONS[oh.condition].name.toLowerCase() + '!', 'bad');
          }
        } else if (oh.save && oh.damage) {
          const sv = await this.save(tgt, oh.save, oh.dc, { poison: oh.damage.some((x) => x.type === 'poison') });
          const prt = oh.damage.map((dm) => {
            const r = Dice.roll(dm.dice);
            return { amount: sv.ok ? (oh.half ? Math.floor(r.total / 2) : 0) : r.total, type: dm.type };
          });
          await this.applyDamage(tgt, prt, att, { fromAttack: false });
        } else if (oh.condition) {
          const sizeOk = !oh.sizeMax || R.SIZES[tgt.size].order <= R.SIZES[oh.sizeMax].order;
          if (sizeOk) {
            const opts = { src: att.uid };
            if (oh.escapeDC) opts.escape = { dc: oh.escapeDC };
            if (this.addCond(tgt, oh.condition, opts)) {
              this.log(this.name(tgt) + ': ' + R.CONDITIONS[oh.condition].name.toLowerCase() + '!', 'bad');
              if (oh.alsoRestrained) this.addCond(tgt, 'restrained', { src: att.uid, grappleLink: true });
            }
          }
        }
      }
    }
    // Атака в броске (кабан, минотавр)
    if (ctx.charge && !tgt.dead) {
      const ch = ctx.charge;
      const sv = await this.save(tgt, ch.save, ch.dc, {});
      if (!sv.ok) {
        if (ch.push) this.push(att, tgt, ch.push);
        if (ch.prone && this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног!', 'bad');
      }
    }
    // Ошеломляющий удар монаха
    if (att.flags && att.flags.stunningStrike && atk.weapon && !info.isRanged && att.res.ki && att.res.ki.used < att.res.ki.max && !tgt.dead && !this.hasCond(tgt, 'stunned')) {
      const use = await this.askReactor(att, att.name + ': потратить 1 ци на Ошеломляющий удар?', [
        { label: 'Ошеломить (1 ци)', value: true },
        { label: 'Нет', value: false },
      ], false);
      if (use) {
        att.res.ki.used++;
        const dc = 8 + att.prof + att.mods.wis;
        const sv = await this.save(tgt, 'con', dc, {});
        if (!sv.ok && this.addCond(tgt, 'stunned', { src: att.uid, expire: { who: att.uid, at: 'end', n: 2 } })) this.log(this.name(tgt) + ' ошеломлён!', 'bad');
      }
    }
    // Техника открытой ладони
    if (ctx.flurry && att.flags && att.flags.openHand && !tgt.dead) {
      const dc = 8 + att.prof + att.mods.wis;
      const sv = await this.save(tgt, 'dex', dc, {});
      if (!sv.ok && this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног открытой ладонью!', 'bad');
    }
  };

  P.push = function (src, tgt, ft) {
    const sc = G.center(src);
    const tc = G.center(tgt);
    let dx = Math.sign(Math.round(tc.x - sc.x));
    let dy = Math.sign(Math.round(tc.y - sc.y));
    if (!dx && !dy) dx = 1;
    let moved = 0;
    for (let i = 0; i < ft / 5; i++) {
      const nx = tgt.x + dx;
      const ny = tgt.y + dy;
      if (!G.canStand(this.B, tgt, nx, ny, {}) || !G.canEndAt(this.B, tgt, nx, ny)) break;
      tgt.x = nx;
      tgt.y = ny;
      moved += 5;
    }
    if (moved) this.log(this.name(tgt) + ' отброшен на ' + moved + ' фт.', 'muted');
    this.h.changed();
  };

  P.pull = function (src, tgt, ft) {
    let moved = 0;
    for (let i = 0; i < ft / 5; i++) {
      if (G.distFt(src, tgt) <= 5) break;
      const sc = G.center(src);
      const tc = G.center(tgt);
      const dx = Math.sign(Math.round(sc.x - tc.x));
      const dy = Math.sign(Math.round(sc.y - tc.y));
      const nx = tgt.x + dx;
      const ny = tgt.y + dy;
      if (!G.canStand(this.B, tgt, nx, ny, {}) || !G.canEndAt(this.B, tgt, nx, ny)) break;
      tgt.x = nx;
      tgt.y = ny;
      moved += 5;
    }
    if (moved) this.log(this.name(tgt) + ' притянут на ' + moved + ' фт.', 'muted');
    this.h.changed();
  };

  /* ---------- Действие «Атака» и пулы атак ---------- */
  P.attackOptions = function (c) {
    const B = this.B;
    const t = B.turn;
    const out = { main: [], bonus: [] };
    if (!t || t.uid !== c.uid || this.incap(c)) return out;
    if (t.attacksLeft > 0 || t.actions > 0) {
      for (const a of c.attacks) {
        if (a.recharge && c.recharge && !c.recharge[a.id]) continue;
        let enabled = true;
        if (t.pool && t.attacksLeft > 0 && !t.pool.includes(a.id)) enabled = false;
        out.main.push({ atk: a, enabled });
      }
      for (const s of c.specials) {
        if (s.type === 'gaze' || s.type === 'aoeCondition') {
          let enabled = true;
          if (t.pool && t.attacksLeft > 0 && !t.pool.includes(s.id)) enabled = false;
          if (!t.pool && t.attacksLeft > 0) enabled = false;
          if (!c.multiattack || !c.multiattack.some((o) => o.includes(s.id))) enabled = enabled && t.actions > 0 && t.attacksLeft === 0;
          out.main.push({ atk: s, enabled, special: true });
        }
      }
    }
    if (t.bonusAttack && t.bonusAttack.count > 0) {
      const ba = t.bonusAttack;
      for (const a of c.attacks) {
        if (ba.unarmedOnly && !a.unarmed) continue;
        if (ba.ids && !ba.ids.includes(a.id)) continue;
        if (ba.meleeOnly && a.kind === 'ranged') continue;
        if (ba.offhand && (!a.light || a.kind === 'ranged' || a.slot === t.lastSlot)) continue;
        out.bonus.push({ atk: a, enabled: true });
      }
      if (ba.spiritual) out.bonus.push({ atk: ba.spiritual, enabled: true });
    }
    return out;
  };

  P.doAttack = async function (c, atkId, tgt, opts) {
    opts = opts || {};
    const B = this.B;
    const t = B.turn;
    if (!t || t.uid !== c.uid) return { ok: false, reason: 'не ваш ход' };
    let atk = c.attacks.find((a) => a.id === atkId);
    let ctx = {};
    if (opts.bonus) {
      const ba = t.bonusAttack;
      if (!ba || ba.count <= 0) return { ok: false, reason: 'нет бонусной атаки' };
      if (ba.spiritual && atkId === ba.spiritual.id) atk = ba.spiritual;
      if (!atk) return { ok: false, reason: 'нет атаки' };
      const info = this.attackInfo(c, atk, tgt);
      if (!info.ok) return { ok: false, reason: info.reason };
      ba.count--;
      if (ba.offhand) ctx.offhand = true;
      if (ba.flurry) ctx.flurry = true;
      if (ba.count <= 0) t.bonusAttack = null;
      return this.attack(c, atk, tgt, ctx);
    }
    const special = !atk && c.specials.find((s) => s.id === atkId);
    if (!atk && !special) return { ok: false, reason: 'нет такой атаки' };
    if (atk) {
      const info = this.attackInfo(c, atk, tgt);
      if (!info.ok) return { ok: false, reason: info.reason };
    }
    if (t.attacksLeft <= 0) {
      if (t.actions <= 0) return { ok: false, reason: 'действие уже использовано' };
      t.actions--;
      t.attackActionUsed = true;
      const opts2 = (c.multiattack || []).filter((o) => o.includes(atkId));
      if (opts2.length) {
        opts2.sort((a, b) => b.length - a.length);
        t.pool = opts2[0].slice();
        t.attacksLeft = t.pool.length;
      } else {
        t.pool = null;
        t.attacksLeft = 1 + (c.extraAttacks || 0);
      }
    }
    if (t.pool) {
      const idx = t.pool.indexOf(atkId);
      if (idx < 0) return { ok: false, reason: 'эта атака не входит в мультиатаку' };
      t.pool.splice(idx, 1);
      t.attacksLeft = t.pool.length;
      if (!t.attacksLeft) t.pool = null;
    } else t.attacksLeft--;
    if (special) return this.doSpecialTarget(c, special, tgt);
    t.lastSlot = atk.slot != null ? atk.slot : null;
    t.lastLight = !!atk.light && atk.kind !== 'ranged';
    t.lastUnarmed = !!atk.unarmed || (c.clsId === 'monk' && atk.weapon && !atk.heavy && !atk.twoHanded);
    // Рывок (charge)
    if (c.flags && c.flags.charge && c.flags.charge.attack === atk.id && !t.flags.chargeUsed) {
      const ch = c.flags.charge;
      const startDist = G.gap(t.startX, t.startY, c.cells, tgt.x, tgt.y, tgt.cells) * 5;
      const nowDist = G.distFt(c, tgt);
      if (t.moved >= ch.dist && startDist - nowDist >= ch.dist - 5) {
        ctx.charge = ch;
        t.flags.chargeUsed = true;
        this.log(this.name(c) + ' атакует в броске!', 'warn');
      }
    }
    if (atk.recharge) c.recharge[atk.id] = false;
    return this.attack(c, atk, tgt, ctx);
  };

  /* Особые действия монстров на одну цель / всех (взгляд, ужасающая внешность) */
  P.doSpecialTarget = async function (c, s, tgt) {
    if (s.type === 'gaze') {
      if (!tgt || G.distFt(c, tgt) > s.range || !G.hasLOS(this.B.map, c, tgt)) {
        this.log(this.name(c) + ': цель вне досягаемости взгляда.', 'muted');
        return { ok: true };
      }
      this.log(this.name(c) + ' использует «' + s.name + '» на ' + this.name(tgt) + '.', 'spell');
      const sv = await this.save(tgt, s.save, s.dc, { cond: s.condition });
      if (!sv.ok && this.addCond(tgt, s.condition, { src: c.uid, expire: { who: c.uid, at: 'end', n: 2 } })) this.log(this.name(tgt) + ': ' + R.CONDITIONS[s.condition].name.toLowerCase() + '!', 'bad');
      return { ok: true };
    }
    if (s.type === 'aoeCondition') {
      this.log(this.name(c) + ' использует «' + s.name + '»!', 'spell');
      const B = this.B;
      B.fpImmune[c.uid] = B.fpImmune[c.uid] || {};
      for (const o of B.combatants) {
        if (o.dead || o.x < 0 || !this.hostile(c, o) || o.hp <= 0) continue;
        if (G.distFt(c, o) > s.range || !G.hasLOS(B.map, c, o)) continue;
        if (B.fpImmune[c.uid][o.uid]) continue;
        const sv = await this.save(o, s.save, s.dc, { cond: s.condition });
        if (!sv.ok) {
          if (this.addCond(o, s.condition, { src: c.uid, save: s.repeat ? { ab: s.save, dc: s.dc, at: 'end' } : null, expire: { who: o.uid, at: 'end', n: s.rounds || 10 } }))
            this.log(this.name(o) + ': ' + R.CONDITIONS[s.condition].name.toLowerCase() + '!', 'bad');
        } else if (s.once) B.fpImmune[c.uid][o.uid] = true;
      }
      return { ok: true };
    }
    return { ok: false };
  };

  /* Дыхание и другие способности по площади */
  P.doAreaSpecial = async function (c, specialId, aim) {
    const t = this.B.turn;
    const s = c.specials.find((x) => x.id === specialId);
    if (!s) return { ok: false, reason: 'нет способности' };
    if (!t || t.uid !== c.uid || t.actions <= 0) return { ok: false, reason: 'нет действия' };
    if (c.recharge && c.recharge[s.id] === false) return { ok: false, reason: 'не перезаряжено' };
    t.actions--;
    if (c.recharge && s.recharge) c.recharge[s.id] = false;
    const cells = G.areaCells(this.B.map, s.area, c, aim);
    await this.h.flashCells(cells, s.dmg && s.dmg[0] ? R.DAMAGE_COLORS[s.dmg[0].type] : '#fff');
    this.log('🔥 ' + this.name(c) + ' использует «' + s.name + '»!', 'spell');
    const targets = G.creaturesInCells(this.B, cells).filter((o) => o.uid !== c.uid);
    const rolled = s.dmg.map((dm) => ({ type: dm.type, r: Dice.roll(dm.dice) }));
    this.log('Урон: ' + rolled.map((x) => x.r.total + ' ' + R.DAMAGE_SHORT[x.type] + ' ' + Dice.fmtRolls(x.r)).join(' + '), 'dmgroll');
    for (const o of targets) await this.areaSaveDamage(c, o, s.save, s.dc, rolled, s.half !== false, { magical: true });
    this.h.changed();
    return { ok: true };
  };

  P.areaSaveDamage = async function (src, o, ab, dc, rolled, half, opts) {
    if (o.dead) return;
    const sv = await this.save(o, ab, dc, { magic: !!opts.spell, poison: rolled.some((x) => x.type === 'poison') });
    let mult;
    if (ab === 'dex' && o.flags && o.flags.evasion && half) mult = sv.ok ? 0 : 0.5;
    else mult = sv.ok ? (half ? 0.5 : opts.potent ? 0.5 : 0) : 1;
    const parts = rolled.map((x) => ({ amount: Math.floor((x.r.total + (x.bonus || 0)) * mult), type: x.type }));
    await this.applyDamage(o, parts, src, Object.assign({ fromAttack: false }, opts));
    return sv;
  };

  /* ---------- Заклинания ---------- */
  P.availableSlots = function (c, minLevel) {
    const out = [];
    if (!c.spellcasting) return out;
    for (const k in c.spellcasting.slots) {
      const s = c.spellcasting.slots[k];
      if (Number(k) >= (minLevel || 1) && s.used < s.max) out.push(Number(k));
    }
    return out.sort((a, b) => a - b);
  };
  P.anySlot = function (c) {
    return this.availableSlots(c, 1).length > 0;
  };
  P.lowestSlot = function (c, min) {
    const a = this.availableSlots(c, min);
    return a.length ? a[0] : 0;
  };
  P.useSlot = function (c, lvl) {
    const s = c.spellcasting && c.spellcasting.slots[lvl];
    if (s && s.used < s.max) s.used++;
  };

  P.spellScale = function (c, spell) {
    const lv = c.kind === 'pc' ? c.level : (c.spellcasting && c.spellcasting.casterLevel) || 1;
    return 1 + (lv >= 5 ? 1 : 0) + (lv >= 11 ? 1 : 0) + (lv >= 17 ? 1 : 0);
  };

  P.spellDice = function (c, spell, slotLevel, dice, noUpcast) {
    let p = Dice.parse(dice);
    let count = p.terms.length ? p.terms[0].count : 0;
    const sides = p.terms.length ? p.terms[0].sides : 0;
    if (spell.level === 0 && spell.scale === 'dice') count *= this.spellScale(c, spell);
    if (!noUpcast && spell.level > 0 && spell.upcast && spell.upcast.dice && slotLevel > spell.level) {
      const up = Dice.parse(spell.upcast.dice).terms[0];
      const steps = Math.floor((slotLevel - spell.level) / (spell.upcast.every || 1));
      if (up.sides === sides) count += up.count * steps;
      else return dice + '+' + up.count * steps + 'd' + up.sides;
    }
    return (count ? count + 'd' + sides : '') + (p.bonus ? (p.bonus > 0 ? '+' : '') + p.bonus : '');
  };

  P.castCheck = function (c, spell, slotLevel, opts) {
    opts = opts || {};
    const t = this.B.turn;
    if (!t || t.uid !== c.uid) return 'не ваш ход';
    if (this.incap(c)) return 'недееспособен';
    if (!(c.spells || []).includes(spell.id)) return 'заклинание не известно';
    if (spell.level > 0) {
      const s = c.spellcasting && c.spellcasting.slots[slotLevel];
      if (!s || s.used >= s.max) return 'нет ячейки ' + slotLevel + ' уровня';
      if (slotLevel < spell.level) return 'слишком низкий уровень ячейки';
    }
    let cast = spell.cast;
    if (opts.quicken && cast === 'action') cast = 'bonus';
    if (cast === 'action') {
      if (t.actions <= 0) return 'действие уже использовано';
      if (t.bonusSpell && spell.level > 0) return 'после бонусного заклинания можно только заговор';
    } else if (cast === 'bonus') {
      if (!t.bonus) return 'бонусное действие уже использовано';
      if (t.leveledSpell) return 'после заклинания действием нельзя бонусное заклинание';
    } else if (cast === 'reaction') return 'накладывается реакцией автоматически';
    if (opts.quicken) {
      if (!c.res.sorcery || c.res.sorcery.max - c.res.sorcery.used < 2) return 'нужно 2 очка чародейства';
    }
    return null;
  };

  /* targeting: {targets: [uid...], point: {x,y}} */
  P.castSpell = async function (c, spellId, slotLevel, targeting, opts) {
    opts = opts || {};
    const spell = D.spell(spellId);
    if (!spell) return { ok: false, reason: 'нет заклинания' };
    slotLevel = spell.level === 0 ? 0 : slotLevel || spell.level;
    const err = this.castCheck(c, spell, slotLevel, opts);
    if (err) return { ok: false, reason: err };
    const t = this.B.turn;
    const sc = c.spellcasting || { dc: 10, toHit: 2, mod: 0 };
    targeting = targeting || {};
    const tgts = (targeting.targets || []).map((u) => this.get(u)).filter(Boolean);

    // Проверка дистанции
    for (const o of tgts) {
      const range = spell.range || 5;
      if (spell.range > 0 && G.distFt(c, o) > range) return { ok: false, reason: o.name + ' вне дистанции (' + range + ' фт.)' };
      if (spell.range > 5 && !G.hasLOS(this.B.map, c, o)) return { ok: false, reason: 'нет линии обзора к ' + o.name };
    }
    if (targeting.point && spell.area && spell.area.origin === 'point') {
      if (G.distToCellFt(c, Math.floor(targeting.point.x), Math.floor(targeting.point.y)) > spell.range) return { ok: false, reason: 'точка вне дистанции' };
    }
    if (spell.target === 'point' && targeting.point) {
      const px = Math.floor(targeting.point.x);
      const py = Math.floor(targeting.point.y);
      if (G.distToCellFt(c, px, py) > spell.range) return { ok: false, reason: 'слишком далеко' };
      if (!G.canStand(this.B, c, px, py, {}) || !G.canEndAt(this.B, c, px, py)) return { ok: false, reason: 'место занято' };
      if (!G.hasLOSToCell(this.B.map, c, px, py)) return { ok: false, reason: 'нет линии обзора' };
    }
    if (['creature', 'creatures'].includes(spell.target) && !tgts.length) return { ok: false, reason: 'выберите цель' };

    // Расход
    let cast = spell.cast;
    if (opts.quicken && cast === 'action') {
      cast = 'bonus';
      c.res.sorcery.used += 2;
      this.log(this.name(c) + ' ускоряет заклинание (2 очка чародейства).', 'spell');
    }
    if (cast === 'action') t.actions--;
    else if (cast === 'bonus') {
      t.bonus = false;
      t.bonusSpell = true;
    }
    if (cast === 'action' && spell.level > 0) t.leveledSpell = true;
    if (spell.level > 0) this.useSlot(c, slotLevel);
    let conc = null;
    if (spell.concentration) conc = this.startConcentration(c, spell, spell.rounds);

    this.log('✨ ' + this.name(c) + ' накладывает <i>' + spell.name + '</i>' + (spell.level > 0 ? ' (ячейка ' + slotLevel + ' ур.)' : '') + '.', 'spell');
    const extraLv = Math.max(0, slotLevel - spell.level);
    const f = c.flags || {};
    let bonusOnce = 0;
    if (f.empoweredEvocation && spell.school === 'evocation') bonusOnce += c.mods.int;
    const affinity = f.elementalAffinity && spell.damage && spell.damage.some((d) => d.type === 'fire') ? c.mods.cha : 0;
    bonusOnce += affinity;

    switch (spell.kind) {
      case 'attack': {
        let n = 1;
        if (spell.scale === 'beams') n = this.spellScale(c, spell);
        if (spell.rays) n = spell.rays + (spell.upcast && spell.upcast.rays ? extraLv * spell.upcast.rays : 0);
        const list = tgts.length ? tgts : [];
        for (let i = 0; i < n; i++) {
          const tgt = list[Math.min(i, list.length - 1)];
          if (!tgt || tgt.dead) continue;
          const dmg = spell.damage.map((dm, di) => {
            let dice = this.spellDice(c, spell, slotLevel, dm.dice, di > 0);
            let bonus = 0;
            if (spell.id === 'eldritchblast' && f.agonizingBlast) bonus += c.mods.cha;
            if (dm.addMod) bonus += sc.mod;
            if (i === 0 && bonusOnce) bonus += bonusOnce;
            return { dice: dice + (bonus ? (bonus > 0 ? '+' : '') + bonus : ''), type: dm.type };
          });
          const atk = {
            id: 'spell_' + spell.id, name: spell.name + (n > 1 ? ' #' + (i + 1) : ''), kind: spell.attack === 'ranged' ? 'ranged' : 'melee',
            toHit: sc.toHit, reach: spell.attack === 'melee' ? Math.max(5, spell.range) : 5, range: [spell.range, spell.range],
            dmg, isSpell: true, magical: true, spellId: spell.id, proxyMelee: spell.summon === 'spiritualWeapon',
          };
          const res = await this.attack(c, atk, tgt, {});
          if (res.hit && !tgt.dead && spell.onHit) await this.spellOnHit(c, spell, tgt, conc);
        }
        if (spell.summon === 'spiritualWeapon') {
          this.addEff(c, {
            id: 'spiritualWeapon', src: c.uid, expire: { who: c.uid, at: 'start', n: spell.rounds || 10 },
            data: { dice: this.spellDice(c, spell, slotLevel, '1d8'), toHit: sc.toHit, mod: sc.mod },
          });
        }
        break;
      }
      case 'auto': {
        const darts = (spell.darts || 1) + (spell.upcast && spell.upcast.darts ? extraLv : 0);
        for (let i = 0; i < darts; i++) {
          const tgt = tgts[i % tgts.length];
          if (!tgt || tgt.dead) continue;
          const r = Dice.roll(spell.damage[0].dice);
          const amt = r.total + (i === 0 ? bonusOnce : 0);
          this.log('Дротик ' + (i + 1) + ' → ' + this.name(tgt) + ': ' + amt + ' ' + R.DAMAGE_SHORT[spell.damage[0].type], 'dmgroll');
          await this.applyDamage(tgt, [{ amount: amt, type: spell.damage[0].type }], c, { magical: true, spell: true });
        }
        break;
      }
      case 'save': {
        let victims;
        if (spell.target === 'area') {
          const cells = G.areaCells(this.B.map, spell.area, c, targeting.point || { x: c.x + 2, y: c.y });
          await this.h.flashCells(cells, R.DAMAGE_COLORS[spell.damage[0].type]);
          victims = G.creaturesInCells(this.B, cells).filter((o) => o.uid !== c.uid || spell.area.origin === 'point');
          if (f.sculptSpells && spell.school === 'evocation') {
            let protect = 1 + spell.level;
            victims = victims.filter((o) => {
              if (!this.hostile(c, o) && protect > 0) {
                protect--;
                this.log(this.name(o) + ' защищён Аккуратными заклинаниями.', 'muted');
                return false;
              }
              return true;
            });
          }
        } else victims = tgts;
        const rolled = spell.damage.map((dm, i) => ({ type: dm.type, r: Dice.roll(this.spellDice(c, spell, slotLevel, dm.dice, i > 0)), bonus: i === 0 ? bonusOnce : 0 }));
        this.log('Урон: ' + rolled.map((x) => x.r.total + (x.bonus || 0) + ' ' + R.DAMAGE_SHORT[x.type] + ' ' + Dice.fmtRolls(x.r)).join(' + '), 'dmgroll');
        for (const o of victims) {
          if (spell.id === 'blight' && ['undead', 'construct'].includes(o.type)) {
            this.log('Усыхание не действует на ' + this.name(o) + '.', 'muted');
            continue;
          }
          const sv = await this.areaSaveDamage(c, o, spell.save, sc.dc, rolled, !!spell.half, { magical: true, spell: true, potent: spell.level === 0 && f.potentCantrip });
          if (sv && !sv.ok && !o.dead && spell.onFail) await this.spellOnFail(c, spell, o, conc);
        }
        break;
      }
      case 'heal': {
        const count = (spell.count || 1);
        for (const o of tgts.slice(0, count)) {
          const r = Dice.roll(this.spellDice(c, spell, slotLevel, spell.heal));
          let amt = r.total + sc.mod;
          if (f.discipleOfLife && spell.level > 0) amt += 2 + slotLevel;
          await this.h.flashCells([[o.x, o.y]], '#7cfc7c');
          this.heal(o, Math.max(0, amt), c);
        }
        break;
      }
      case 'buff': {
        const count = (spell.count || 1) + (spell.upcast && spell.upcast.targets ? extraLv : 0);
        for (const o of tgts.slice(0, count)) {
          if (spell.effect === 'aid') {
            const v = 5 + 5 * extraLv;
            o.maxHp += v;
            o.hp += v;
            this.addEff(o, { id: 'aid', src: c.uid, value: v, unique: false, expire: { who: c.uid, at: 'start', n: spell.rounds } });
            this.log(this.name(o) + ': максимум хитов +' + v + '.', 'good');
            continue;
          }
          if (spell.effect === 'mageArmor' && o.armorCat !== 'none') {
            this.log(this.name(o) + ' носит доспехи — Доспехи мага не действуют.', 'muted');
            continue;
          }
          this.addEff(o, { id: spell.effect, src: c.uid, conc, expire: { who: c.uid, at: 'start', n: spell.rounds || 10 } });
          this.log(this.name(o) + ': ' + (R.EFFECTS[spell.effect] || { name: spell.name }).name + '.', 'good');
        }
        break;
      }
      case 'control': {
        let victims;
        if (spell.target === 'area') {
          const cells = G.areaCells(this.B.map, spell.area, c, targeting.point || { x: c.x + 2, y: c.y });
          await this.h.flashCells(cells, '#c9a0ff');
          victims = G.creaturesInCells(this.B, cells).filter((o) => o.uid !== c.uid && (spell.id !== 'fear' || this.hostile(c, o)));
        } else {
          const count = (spell.count || 1) + (spell.upcast && spell.upcast.targets ? extraLv : 0);
          victims = tgts.slice(0, count);
        }
        for (const o of victims) {
          if (spell.filter === 'humanoid' && !(o.type === 'humanoid' || (o.tags || []).includes('humanoid'))) {
            this.log(this.name(o) + ' не гуманоид — заклинание не действует.', 'muted');
            continue;
          }
          if (spell.filter === 'notUndead' && o.type === 'undead') {
            this.log('Заклинание не действует на нежить.', 'muted');
            continue;
          }
          const sv = await this.save(o, spell.save, sc.dc, { magic: true, cond: spell.condition });
          if (!sv.ok) {
            const cond = { src: c.uid, conc, expire: { who: c.uid, at: 'start', n: spell.rounds || 10 } };
            if (spell.repeatSave) cond.save = { ab: spell.save, dc: sc.dc, at: 'end' };
            if (spell.escape) cond.escape = { dc: sc.dc, ab: spell.escape };
            if (this.addCond(o, spell.condition, cond)) this.log(this.name(o) + ': ' + R.CONDITIONS[spell.condition].name.toLowerCase() + '!', 'bad');
          }
        }
        break;
      }
      case 'sleep': {
        const cells = G.areaCells(this.B.map, spell.area, c, targeting.point || { x: c.x, y: c.y });
        await this.h.flashCells(cells, '#a0b8ff');
        let pool = Dice.roll(spell.pool + (extraLv ? '+' + 2 * extraLv + 'd8' : '')).total;
        this.log('Усыпление: запас хитов ' + pool + '.', 'spell');
        const victims = G.creaturesInCells(this.B, cells)
          .filter((o) => o.hp > 0 && !this.hasCond(o, 'unconscious') && o.type !== 'undead' && !o.condImmune.includes('charmed') && !(o.flags && o.flags.feyAncestry))
          .sort((a, b) => a.hp - b.hp);
        for (const o of victims) {
          if (o.hp > pool) break;
          pool -= o.hp;
          this.addCond(o, 'unconscious', { tag: 'sleep', src: c.uid, expire: { who: c.uid, at: 'start', n: 10 } });
          this.addCond(o, 'prone', {});
          this.log(this.name(o) + ' засыпает!', 'bad');
        }
        break;
      }
      case 'teleport': {
        const p = targeting.point;
        if (p) {
          c.x = Math.floor(p.x);
          c.y = Math.floor(p.y);
          this.log(this.name(c) + ' исчезает в серебристом тумане и появляется в другом месте.', 'spell');
          await this.hazardAt(c, 'enter');
        }
        break;
      }
      case 'cleanse': {
        for (const o of tgts) {
          for (const id of spell.removes) if (this.removeCond(o, id)) this.log(this.name(o) + ': «' + R.CONDITIONS[id].name + '» снято.', 'good');
        }
        break;
      }
      case 'revive': {
        const o = tgts[0];
        if (o && o.dead && this.B.round - (o.deathRound || 0) <= 10 && o.type !== 'undead' && o.type !== 'construct') {
          o.dead = false;
          o.hp = 1;
          o.death = { s: 0, f: 0 };
          o.stable = false;
          o.conditions = [];
          if (!this.B.order.includes(o.uid)) this.B.order.push(o.uid);
          this.log('🌟 ' + this.name(o) + ' возвращается к жизни!', 'good');
          this.h.float(o, '+1', '#ffe680');
        } else this.log('Возрождение не удалось.', 'muted');
        break;
      }
      case 'aura': {
        this.addEff(c, {
          id: 'spiritGuardians', src: c.uid, conc,
          data: { size: spell.area.size, dc: sc.dc, dice: this.spellDice(c, spell, slotLevel, spell.damage[0].dice) },
        });
        this.log('Вокруг ' + this.name(c) + ' кружат духовные стражи.', 'spell');
        break;
      }
      default:
        break;
    }
    this.h.changed();
    await this.checkEnd();
    return { ok: true };
  };

  P.spellOnHit = async function (c, spell, tgt, conc) {
    const oh = spell.onHit;
    if (oh.effect) {
      let expire;
      if (oh.duration === 'casterNextStart') expire = { who: c.uid, at: 'start', n: 1 };
      else if (oh.duration === 'casterNextEnd') expire = { who: c.uid, at: 'end', n: 2 };
      else if (oh.duration === 'targetNextStart') expire = { who: tgt.uid, at: 'start', n: 1 };
      else expire = { who: tgt.uid, at: 'end', n: 1 };
      this.addEff(tgt, { id: oh.effect, src: c.uid, expire });
    }
    if (oh.pull && R.SIZES[tgt.size].order <= R.SIZES.large.order) this.pull(c, tgt, oh.pull);
  };

  P.spellOnFail = async function (c, spell, tgt, conc) {
    const of = spell.onFail;
    if (of.push) this.push(c, tgt, of.push);
    if (of.effect) {
      let expire = { who: tgt.uid, at: 'end', n: 1 };
      if (of.duration === 'targetNextStart') expire = { who: tgt.uid, at: 'start', n: 1 };
      this.addEff(tgt, { id: of.effect, src: c.uid, expire });
    }
  };

  P.tryHellishRebuke = async function (tgt, src) {
    if (!(tgt.spells || []).includes('hellishrebuke') || !this.canReact(tgt) || !this.lowestSlot(tgt, 1)) return;
    if (G.distFt(tgt, src) > 60 || !G.hasLOS(this.B.map, tgt, src)) return;
    const use = await this.askReactor(tgt, tgt.name + ' получил урон от ' + src.name + '. Ответить Адским возмездием?', [
      { label: 'Адское возмездие', value: true },
      { label: 'Нет', value: false },
    ], true);
    if (!use) return;
    const spell = D.spell('hellishrebuke');
    const lvl = this.lowestSlot(tgt, 1);
    this.useSlot(tgt, lvl);
    tgt.reactionUsed = true;
    this.log('🔥 ' + this.name(tgt) + ' отвечает <i>Адским возмездием</i>!', 'spell');
    const r = Dice.roll(this.spellDice(tgt, spell, lvl, '2d10'));
    await this.areaSaveDamage(tgt, src, 'dex', tgt.spellcasting.dc, [{ type: 'fire', r }], true, { magical: true, spell: true });
  };

  /* ---------- Перемещение ---------- */
  P.reachable = function (c) {
    const t = this.B.turn;
    const budget = t && t.uid === c.uid ? Math.floor(t.move / 5) : 0;
    const fly = this.canFly(c);
    const crawl = this.hasCond(c, 'prone');
    return G.reach(this.B, c, budget, { fly, crawl });
  };

  P.moveAlong = async function (c, path, opts) {
    opts = opts || {};
    const B = this.B;
    const t = B.turn;
    if (!path || path.length < 2) return { ok: false };
    const fly = this.canFly(c);
    const crawl = this.hasCond(c, 'prone');
    for (let i = 1; i < path.length; i++) {
      if (c.dead || c.hp <= 0 || B.phase !== 'combat') break;
      const step = path[i];
      const costCells = G.stepCost(B, c, step.x, step.y, { fly, crawl });
      if (!opts.free && t.move < costCells * 5) break;
      // Атаки по возможности
      if (!t.disengaged && !opts.noOA) {
        for (const h of B.combatants) {
          if (h.dead || h.x < 0 || !this.hostile(h, c) || !this.canReact(h)) continue;
          const reach = this.reachOf(h);
          if (!reach) continue;
          const before = G.distFt(h, c);
          const after = G.distFtAt(c, step.x, step.y, h);
          if (before <= reach && after > reach) {
            const atk = this.bestMelee(h, before);
            if (!atk) continue;
            const yes = await this.askReactor(h, c.name + ' уходит из зоны досягаемости. ' + h.name + ': совершить атаку по возможности?', [
              { label: 'Атаковать (' + atk.name + ')', value: true },
              { label: 'Пропустить', value: false },
            ], true);
            if (yes) {
              h.reactionUsed = true;
              await this.attack(h, atk, c, { opportunity: true });
              if (c.dead || c.hp <= 0 || this.speedOf(c) === 0) break;
            }
          }
        }
        if (c.dead || c.hp <= 0 || this.speedOf(c) === 0) break;
      }
      const fx = c.x;
      const fy = c.y;
      c.x = step.x;
      c.y = step.y;
      if (!opts.free) t.move -= costCells * 5;
      t.moved += 5;
      await this.h.animateStep(c, fx, fy, step.x, step.y);
      // Схвативший уходит — захват прекращается
      for (const o of B.combatants) {
        const g = o.conditions.find((x) => x.id === 'grappled' && x.src === c.uid);
        if (g && G.distFt(o, c) > 5) {
          this.removeCond(o, 'grappled', (x) => x.src === c.uid);
          this.removeCond(o, 'restrained', (x) => x.src === c.uid && x.grappleLink);
        }
      }
      const tl = G.tile(B.map, step.x, step.y);
      if (tl.hazard && !fly) await this.hazardAt(c, 'enter');
    }
    this.h.changed();
    await this.checkEnd();
    return { ok: true };
  };

  P.bestMelee = function (h, dist) {
    let best = null;
    let bestAvg = -1;
    for (const a of h.attacks) {
      if (a.kind === 'ranged') continue;
      if ((a.reach || 5) < dist) continue;
      if (a.recharge && h.recharge && !h.recharge[a.id]) continue;
      const avg = a.dmg.reduce((s, d) => s + Dice.average(d.dice), 0);
      if (avg > bestAvg) {
        bestAvg = avg;
        best = a;
      }
    }
    return best;
  };

  /* ---------- Общие действия ---------- */
  P.spend = function (c, cost) {
    const t = this.B.turn;
    if (!t || t.uid !== c.uid) return 'не ваш ход';
    if (this.incap(c)) return 'недееспособен';
    if (cost === 'action') {
      if (t.actions <= 0) return 'действие уже использовано';
      t.actions--;
    } else if (cost === 'bonus') {
      if (!t.bonus) return 'бонусное действие уже использовано';
      t.bonus = false;
    }
    return null;
  };

  P.dash = function (c, cost) {
    const err = this.spend(c, cost || 'action');
    if (err) return { ok: false, reason: err };
    this.B.turn.move += this.speedOf(c);
    this.log(this.name(c) + ' совершает Рывок.', 'action');
    this.h.changed();
    return { ok: true };
  };
  P.disengage = function (c, cost) {
    const err = this.spend(c, cost || 'action');
    if (err) return { ok: false, reason: err };
    this.B.turn.disengaged = true;
    this.log(this.name(c) + ' совершает Отход — его перемещение не провоцирует атак.', 'action');
    this.h.changed();
    return { ok: true };
  };
  P.dodge = function (c, cost) {
    const err = this.spend(c, cost || 'action');
    if (err) return { ok: false, reason: err };
    this.addEff(c, { id: 'dodge', src: c.uid, expire: { who: c.uid, at: 'start', n: 1 } });
    this.log(this.name(c) + ' совершает Уклонение.', 'action');
    return { ok: true };
  };
  P.help = function (c, enemy) {
    if (!enemy || G.distFt(c, enemy) > 5) return { ok: false, reason: 'враг должен быть в пределах 5 фт.' };
    const err = this.spend(c, 'action');
    if (err) return { ok: false, reason: err };
    this.addEff(enemy, { id: 'helped', src: c.uid, expire: { who: c.uid, at: 'start', n: 1 } });
    this.log(this.name(c) + ' помогает союзникам: следующая атака по ' + this.name(enemy) + ' — с преимуществом.', 'action');
    return { ok: true };
  };
  P.standUp = function (c) {
    const t = this.B.turn;
    if (!this.hasCond(c, 'prone')) return { ok: false, reason: 'не лежит' };
    const half = Math.ceil(this.speedOf(c) / 2 / 5) * 5;
    if (t.move < half) return { ok: false, reason: 'не хватает перемещения' };
    t.move -= half;
    this.removeCond(c, 'prone');
    this.log(this.name(c) + ' встаёт на ноги (−' + half + ' фт.).', 'action');
    return { ok: true };
  };
  P.potion = async function (c, target, cost) {
    target = target || c;
    if (c.potions <= 0) return { ok: false, reason: 'нет зелий' };
    if (G.distFt(c, target) > 5) return { ok: false, reason: 'цель далеко' };
    const err = this.spend(c, cost || 'action');
    if (err) return { ok: false, reason: err };
    c.potions--;
    const r = Dice.roll('2d4+2');
    this.log(this.name(c) + (target === c ? ' выпивает' : ' даёт ' + this.name(target)) + ' зелье лечения ' + Dice.fmtRolls(r) + '.', 'action');
    this.heal(target, r.total);
    return { ok: true };
  };
  P.stabilize = async function (c, target) {
    if (!target || target.hp > 0 || target.dead || G.distFt(c, target) > 5) return { ok: false, reason: 'нужен умирающий союзник рядом' };
    const err = this.spend(c, 'action');
    if (err) return { ok: false, reason: err };
    const r = await this.check(c, 'medicine', { dc: 10 });
    if (r.total >= 10) {
      target.stable = true;
      this.log(this.name(c) + ' стабилизирует ' + this.name(target) + ' (Медицина ' + r.total + ').', 'good');
    } else this.log(this.name(c) + ' не смог стабилизировать ' + this.name(target) + ' (Медицина ' + r.total + ').', 'bad');
    this.h.changed();
    return { ok: true };
  };
  P.wake = function (c, target) {
    if (!target || G.distFt(c, target) > 5 || !this.hasCond(target, 'unconscious') || !target.conditions.some((x) => x.tag === 'sleep')) return { ok: false, reason: 'нужен спящий союзник рядом' };
    const err = this.spend(c, 'action');
    if (err) return { ok: false, reason: err };
    this.removeCond(target, 'unconscious', (x) => x.tag === 'sleep');
    this.log(this.name(c) + ' будит ' + this.name(target) + '.', 'action');
    return { ok: true };
  };

  /* Толчок и захват — заменяют одну атаку действия «Атака» */
  P.useAttackSlot = function (c) {
    const t = this.B.turn;
    if (t.attacksLeft <= 0) {
      if (t.actions <= 0) return 'действие уже использовано';
      t.actions--;
      t.attackActionUsed = true;
      t.pool = null;
      t.attacksLeft = 1 + (c.extraAttacks || 0);
    }
    if (t.pool) return 'идёт мультиатака';
    t.attacksLeft--;
    return null;
  };

  P.contest = async function (c, tgt) {
    const a = await this.check(c, 'athletics');
    const defSkill = (tgt.skills.athletics || 0) >= (tgt.skills.acrobatics || 0) ? 'athletics' : 'acrobatics';
    let d;
    if (this.incap(tgt)) d = { total: -99 };
    else d = await this.check(tgt, defSkill);
    this.log('Состязание: ' + this.name(c) + ' Атлетика ' + a.total + ' против ' + this.name(tgt) + ' ' + R.SKILLS[defSkill].name + ' ' + (d.total < -50 ? '(недееспособен)' : d.total), 'muted');
    return a.total > d.total;
  };

  P.shove = async function (c, tgt, mode) {
    if (!tgt || G.distFt(c, tgt) > 5) return { ok: false, reason: 'цель должна быть рядом' };
    if (R.SIZES[tgt.size].order > R.SIZES[c.size].order + 1) return { ok: false, reason: 'цель слишком большая' };
    const err = this.useAttackSlot(c);
    if (err) return { ok: false, reason: err };
    this.log(this.name(c) + ' пытается ' + (mode === 'push' ? 'оттолкнуть' : 'сбить с ног') + ' ' + this.name(tgt) + '.', 'action');
    const win = await this.contest(c, tgt);
    if (win) {
      if (mode === 'push') this.push(c, tgt, 5);
      else if (this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног!', 'good');
    } else this.log('Не получилось.', 'muted');
    return { ok: true };
  };

  P.grapple = async function (c, tgt) {
    if (!tgt || G.distFt(c, tgt) > 5) return { ok: false, reason: 'цель должна быть рядом' };
    if (R.SIZES[tgt.size].order > R.SIZES[c.size].order + 1) return { ok: false, reason: 'цель слишком большая' };
    const err = this.useAttackSlot(c);
    if (err) return { ok: false, reason: err };
    this.log(this.name(c) + ' пытается схватить ' + this.name(tgt) + '.', 'action');
    const win = await this.contest(c, tgt);
    if (win) {
      if (this.addCond(tgt, 'grappled', { src: c.uid })) this.log(this.name(tgt) + ' схвачен!', 'good');
    } else this.log('Захват не удался.', 'muted');
    return { ok: true };
  };

  P.escape = async function (c) {
    const g = c.conditions.find((x) => x.id === 'grappled' || (x.id === 'restrained' && (x.escape || x.grappleLink)));
    if (!g) return { ok: false, reason: 'нечего преодолевать' };
    const err = this.spend(c, 'action');
    if (err) return { ok: false, reason: err };
    const src = this.get(g.src);
    let success;
    const esc = g.escape || (c.conditions.find((x) => x.escape && x.src === g.src) || {}).escape;
    if (esc && esc.dc) {
      const skill = (c.skills.athletics || 0) >= (c.skills.acrobatics || 0) || esc.ab === 'str' ? 'athletics' : 'acrobatics';
      const r = await this.check(c, skill, { dc: esc.dc });
      success = r.total >= esc.dc;
      this.log(this.name(c) + ' пытается высвободиться: ' + r.total + ' против Сл ' + esc.dc + '.', 'action');
    } else if (src) {
      const a = await this.check(c, (c.skills.athletics || 0) >= (c.skills.acrobatics || 0) ? 'athletics' : 'acrobatics');
      const d = await this.check(src, 'athletics');
      success = a.total > d.total;
      this.log(this.name(c) + ' вырывается: ' + a.total + ' против ' + d.total + '.', 'action');
    } else success = true;
    if (success) {
      c.conditions = c.conditions.filter((x) => !(x.src === g.src && (x.id === 'grappled' || x.id === 'restrained')));
      this.log(this.name(c) + ' освобождается!', 'good');
    } else this.log('Не удалось освободиться.', 'bad');
    this.h.changed();
    return { ok: true };
  };

  /* ---------- Умения классов ---------- */
  P.featureActions = function (c) {
    const out = [];
    const t = this.B.turn;
    if (!t || t.uid !== c.uid || this.incap(c)) return out;
    const f = c.flags || {};
    const res = c.res || {};
    const left = (r) => r && r.used < r.max;
    const add = (id, name, cost, enabled, extra) => out.push(Object.assign({ id, name, cost, enabled: !!enabled }, extra || {}));
    const hasAction = t.actions > 0;
    const hasBonus = t.bonus;
    if (f.secondWind) add('secondWind', 'Второе дыхание (1d10+' + c.level + ')', 'bonus', hasBonus && left(res.secondWind), { target: 'self' });
    if (f.actionSurge) add('actionSurge', 'Всплеск действий', 'free', left(res.actionSurge), { target: 'self' });
    if (f.rage) {
      if (this.hasEff(c, 'rage')) add('endRage', 'Прекратить ярость', 'free', true, { target: 'self' });
      else add('rage', 'Ярость', 'bonus', hasBonus && left(res.rage) && c.armorCat !== 'heavy', { target: 'self' });
    }
    if (f.recklessAttack && !t.attacked && !this.hasEff(c, 'recklessAtk')) add('reckless', 'Безрассудная атака', 'free', true, { target: 'self' });
    if (f.frenzy && this.hasEff(c, 'rage')) add('frenzy', 'Бешенство: атака', 'bonus', hasBonus, { target: 'self' });
    // Атака второй рукой
    if (t.attackActionUsed && t.lastLight && hasBonus) {
      const other = c.attacks.some((a) => a.light && a.kind !== 'ranged' && a.slot !== t.lastSlot && a.slot != null);
      if (other) add('offhand', 'Атака второй рукой', 'bonus', true, { target: 'self' });
    }
    if (f.martialArts) add('martialArts', 'Боевые искусства: удар', 'bonus', hasBonus && t.attackActionUsed && t.lastUnarmed, { target: 'self' });
    if (f.ki) {
      add('flurry', 'Шквал ударов (1 ци)', 'bonus', hasBonus && t.attackActionUsed && left(res.ki), { target: 'self' });
      add('patientDefense', 'Терпеливая оборона (1 ци)', 'bonus', hasBonus && left(res.ki), { target: 'self' });
      add('stepDash', 'Поступь ветра: Рывок (1 ци)', 'bonus', hasBonus && left(res.ki), { target: 'self' });
    }
    if (f.cunningAction) {
      add('cunningDash', 'Хитрое действие: Рывок', 'bonus', hasBonus, { target: 'self' });
      add('cunningDisengage', 'Хитрое действие: Отход', 'bonus', hasBonus, { target: 'self' });
    }
    if (f.nimbleEscape) add('cunningDisengage', 'Шустрый побег: Отход', 'bonus', hasBonus, { target: 'self' });
    if (f.aggressive) add('aggressive', 'Агрессивный: перемещение', 'bonus', hasBonus, { target: 'self' });
    if (f.rampage && t.rampage) add('rampage', 'Неистовство: укус', 'bonus', hasBonus, { target: 'self' });
    if (f.layOnHands) add('layOnHands', 'Наложение рук (' + (res.layOnHands.max - res.layOnHands.used) + ')', 'action', hasAction && left(res.layOnHands), { target: 'ally', range: 5 });
    if (f.bardicInspiration) add('inspiration', 'Вдохновение барда (d' + f.inspirationDie + ')', 'bonus', hasBonus && left(res.inspiration), { target: 'allyOther', range: 60 });
    if (f.channelDivinity && c.clsId === 'cleric') {
      add('turnUndead', 'Изгнание нежити', 'action', hasAction && left(res.channel), { target: 'self' });
      add('preserveLife', 'Сохранение жизни (' + 5 * c.level + ')', 'action', hasAction && left(res.channel), { target: 'self' });
    }
    if (f.sacredWeapon) add('sacredWeapon', 'Священное оружие', 'action', hasAction && left(res.channel) && !this.hasEff(c, 'sacredWeapon'), { target: 'self' });
    if (f.breathWeapon && c.ancestry) add('dragonBreath', 'Оружие дыхания (' + R.DAMAGE_SHORT[c.ancestry.type] + ')', 'action', hasAction && left(res.breath), { target: 'area', area: c.ancestry.shape === 'line' ? { shape: 'line', size: 30 } : { shape: 'cone', size: 15 } });
    const sw = this.getEff(c, 'spiritualWeapon');
    if (sw) add('spiritualWeapon', 'Божественное оружие: атака', 'bonus', hasBonus && !t.bonusSpell, { target: 'self' });
    return out;
  };

  P.useFeature = async function (c, id, args) {
    args = args || {};
    const t = this.B.turn;
    const res = c.res || {};
    const f = c.flags || {};
    const fail = (reason) => ({ ok: false, reason });
    switch (id) {
      case 'secondWind': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        res.secondWind.used++;
        const r = Dice.roll('1d10+' + c.level);
        this.log(this.name(c) + ' использует Второе дыхание ' + Dice.fmtRolls(r) + '.', 'action');
        this.heal(c, r.total);
        return { ok: true };
      }
      case 'actionSurge':
        res.actionSurge.used++;
        t.actions++;
        this.log(this.name(c) + ' использует Всплеск действий — дополнительное действие!', 'action');
        this.h.changed();
        return { ok: true };
      case 'rage': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        res.rage.used++;
        this.addEff(c, { id: 'rage', src: c.uid, expire: { who: c.uid, at: 'start', n: 10 } });
        this.log('😡 ' + this.name(c) + ' впадает в ЯРОСТЬ!', 'action');
        return { ok: true };
      }
      case 'endRage':
        this.removeEff(c, 'rage');
        this.log(this.name(c) + ' успокаивается.', 'muted');
        return { ok: true };
      case 'reckless':
        this.addEff(c, { id: 'recklessAtk', src: c.uid, expire: { who: c.uid, at: 'end', n: 1 }, silent: true });
        this.addEff(c, { id: 'reckless', src: c.uid, expire: { who: c.uid, at: 'start', n: 1 } });
        this.log(this.name(c) + ' атакует безрассудно: преимущество на атаки Силой, но и по нему — с преимуществом.', 'action');
        return { ok: true };
      case 'frenzy': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        t.bonusAttack = { count: 1, meleeOnly: true };
        this.log(this.name(c) + ' в бешенстве готовит дополнительную атаку.', 'action');
        return { ok: true };
      }
      case 'offhand': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        t.bonusAttack = { count: 1, offhand: true };
        return { ok: true };
      }
      case 'martialArts': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        t.bonusAttack = { count: 1, unarmedOnly: true };
        return { ok: true };
      }
      case 'flurry': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        res.ki.used++;
        t.bonusAttack = { count: 2, unarmedOnly: true, flurry: true };
        this.log(this.name(c) + ' начинает Шквал ударов!', 'action');
        return { ok: true };
      }
      case 'patientDefense': {
        res.ki.used++;
        return this.dodge(c, 'bonus');
      }
      case 'stepDash':
        res.ki.used++;
        return this.dash(c, 'bonus');
      case 'cunningDash':
        return this.dash(c, 'bonus');
      case 'cunningDisengage':
        return this.disengage(c, 'bonus');
      case 'aggressive': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        t.move += c.speed.walk;
        this.log(this.name(c) + ' агрессивно рвётся вперёд (+' + c.speed.walk + ' фт. к врагу).', 'action');
        return { ok: true };
      }
      case 'rampage': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        t.move += Math.floor(c.speed.walk / 2);
        t.bonusAttack = { count: 1, ids: ['bite'] };
        t.rampage = false;
        this.log(this.name(c) + ' в неистовстве!', 'action');
        return { ok: true };
      }
      case 'layOnHands': {
        const tgt = args.target;
        if (!tgt || G.distFt(c, tgt) > 5) return fail('нужна цель рядом');
        const pool = res.layOnHands.max - res.layOnHands.used;
        const need = Math.max(1, tgt.maxHp - tgt.hp);
        const amount = Math.min(pool, args.amount != null ? args.amount : await this.h.askNumber('Сколько хитов восстановить? (запас ' + pool + ')', 1, pool, Math.min(pool, need)));
        if (!amount) return fail('отменено');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.layOnHands.used += amount;
        this.log(this.name(c) + ' накладывает руки на ' + this.name(tgt) + '.', 'action');
        this.heal(tgt, amount);
        return { ok: true };
      }
      case 'inspiration': {
        const tgt = args.target;
        if (!tgt || tgt === c || G.distFt(c, tgt) > 60) return fail('нужен союзник в пределах 60 фт.');
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        res.inspiration.used++;
        this.addEff(tgt, { id: 'inspiration', src: c.uid, value: f.inspirationDie, expire: { who: tgt.uid, at: 'start', n: 100 } });
        this.log(this.name(c) + ' вдохновляет ' + this.name(tgt) + ' (d' + f.inspirationDie + ').', 'action');
        return { ok: true };
      }
      case 'turnUndead': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.channel.used++;
        const dc = 8 + c.prof + c.mods.wis;
        this.log('✝️ ' + this.name(c) + ' изгоняет нежить!', 'spell');
        const destroyCR = c.level >= 8 ? 1 : c.level >= 5 ? 0.5 : -1;
        for (const o of this.B.combatants) {
          if (o.dead || o.type !== 'undead' || !this.hostile(c, o) || G.distFt(c, o) > 30) continue;
          const sv = await this.save(o, 'wis', dc, { magic: true });
          if (!sv.ok) {
            if (R.crValue(o.cr || 99) <= destroyCR) this.kill(o, 'уничтожена божественной силой');
            else if (this.addCond(o, 'frightened', { src: c.uid, tag: 'turned', expire: { who: o.uid, at: 'end', n: 10 } })) this.log(this.name(o) + ' изгнан и в страхе бежит!', 'good');
          }
        }
        this.h.changed();
        return { ok: true };
      }
      case 'preserveLife': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.channel.used++;
        let pool = 5 * c.level;
        this.log('✝️ ' + this.name(c) + ' использует Сохранение жизни.', 'spell');
        const allies = this.B.combatants
          .filter((o) => !o.dead && !this.hostile(c, o) && G.distFt(c, o) <= 30 && o.hp < Math.floor(o.maxHp / 2) && !['undead', 'construct'].includes(o.type))
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
        for (const o of allies) {
          if (pool <= 0) break;
          const amt = Math.min(pool, Math.floor(o.maxHp / 2) - o.hp);
          if (amt > 0) {
            pool -= amt;
            this.heal(o, amt);
          }
        }
        return { ok: true };
      }
      case 'sacredWeapon': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.channel.used++;
        this.addEff(c, { id: 'sacredWeapon', src: c.uid, value: Math.max(1, c.mods.cha), expire: { who: c.uid, at: 'start', n: 10 } });
        this.log(this.name(c) + ' освящает оружие (+' + Math.max(1, c.mods.cha) + ' к атакам).', 'spell');
        return { ok: true };
      }
      case 'dragonBreath': {
        if (!args.aim) return fail('выберите направление');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.breath.used++;
        const anc = c.ancestry;
        const area = anc.shape === 'line' ? { shape: 'line', size: 30, origin: 'self' } : { shape: 'cone', size: 15, origin: 'self' };
        const cells = G.areaCells(this.B.map, area, c, args.aim);
        await this.h.flashCells(cells, R.DAMAGE_COLORS[anc.type]);
        const dice = (c.level >= 16 ? 5 : c.level >= 11 ? 4 : c.level >= 6 ? 3 : 2) + 'd6';
        const r = Dice.roll(dice);
        this.log('🐲 ' + this.name(c) + ' использует оружие дыхания: ' + r.total + ' ' + R.DAMAGE_SHORT[anc.type] + ' ' + Dice.fmtRolls(r), 'spell');
        const dc = 8 + c.mods.con + c.prof;
        for (const o of G.creaturesInCells(this.B, cells)) if (o.uid !== c.uid) await this.areaSaveDamage(c, o, anc.save, dc, [{ type: anc.type, r }], true, { magical: true });
        return { ok: true };
      }
      case 'spiritualWeapon': {
        const sw = this.getEff(c, 'spiritualWeapon');
        if (!sw) return fail('нет оружия');
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        t.bonusAttack = {
          count: 1,
          spiritual: { id: 'spiritualWeaponAtk', name: 'Божественное оружие', kind: 'melee', toHit: sw.data.toHit, reach: 60, proxyMelee: true, dmg: [{ dice: sw.data.dice + (sw.data.mod ? '+' + sw.data.mod : ''), type: 'force' }], isSpell: true, magical: true },
        };
        return { ok: true };
      }
      default:
        return fail('неизвестное умение');
    }
  };

  /* ---------- Инструменты ведущего ---------- */
  P.dmSetHp = async function (c, hp) {
    hp = Math.round(Number(hp));
    if (isNaN(hp)) return;
    if (hp < c.hp) await this.applyDamage(c, [{ amount: c.hp - hp, type: 'force' }], null, { fromAttack: false });
    else if (hp > c.hp) {
      if (c.dead) {
        c.dead = false;
        c.hp = 0;
        if (!this.B.order.includes(c.uid) && this.B.phase === 'combat') this.B.order.push(c.uid);
      }
      this.heal(c, hp - c.hp);
    }
    this.h.changed();
  };
  P.dmToggleCond = function (c, id) {
    if (this.hasCond(c, id)) {
      this.removeCond(c, id);
      this.log('Ведущий снимает с ' + this.name(c) + ' состояние «' + R.CONDITIONS[id].name + '».', 'muted');
    } else {
      c.conditions.push({ id, src: 'dm' });
      this.log('Ведущий накладывает на ' + this.name(c) + ' состояние «' + R.CONDITIONS[id].name + '».', 'muted');
      if (INCAP.includes(id) && c.concentration) this.endConcentration(c, 'недееспособен');
    }
    this.h.changed();
  };
  P.dmKill = async function (c) {
    this.kill(c, 'по решению ведущего');
    await this.checkEnd();
  };
  P.dmRemove = function (c) {
    const B = this.B;
    const cur = this.current();
    B.combatants = B.combatants.filter((o) => o !== c);
    const idx = B.order.indexOf(c.uid);
    if (idx >= 0) {
      B.order.splice(idx, 1);
      if (idx < B.turnIdx) B.turnIdx--;
    }
    if (cur && cur.uid === c.uid && B.phase === 'combat') {
      B.turnIdx--;
      this.nextTurn();
    }
    this.h.changed();
  };
  P.addMidCombat = function (c) {
    const B = this.B;
    if (c.initiative == null) this.rollInitiative(c);
    const cur = this.current();
    B.order.push(c.uid);
    const list = B.order.map((u) => this.get(u)).filter(Boolean);
    list.sort((a, b) => (b.initiative || 0) - (a.initiative || 0) || b.abil.dex - a.abil.dex);
    B.order = list.map((o) => o.uid);
    if (cur) B.turnIdx = B.order.indexOf(cur.uid);
    this.h.changed();
  };

  C.Engine = Engine;
  C.INCAP = INCAP;
  D.Combat = C;
})(typeof window !== 'undefined' ? window : globalThis);
