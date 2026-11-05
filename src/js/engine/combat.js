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
    const flags = U.deepClone(m.flags || {});
    const attacks = [];
    const specials = [];
    let multiattack = null;
    const recharge = {};
    const uses = {};
    for (const a of m.actions || []) {
      if (a.type === 'multi') {
        multiattack = a.options.map((o) => o.slice());
        continue;
      }
      if (a.type === 'mw' || a.type === 'rw' || a.type === 'mrw') {
        let onHit = a.onHit || null;
        if (onHit && !Array.isArray(onHit)) onHit = [onHit];
        attacks.push({
          id: a.id, name: a.name, kind: a.type === 'mw' ? 'melee' : a.type === 'rw' ? 'ranged' : 'both',
          toHit: a.toHit, reach: a.reach || 5, range: a.range || null, dmg: a.dmg || [], rangedDmg: a.rangedDmg || null, dmgHalfHp: a.dmgHalfHp || null,
          onHit, recharge: a.recharge || 0, weapon: !a.spellAttack, monster: true, magical: !!a.magical || !!a.spellAttack || !!flags.magicalAttacks,
          ability: a.type === 'rw' ? 'dex' : 'str', spellAttack: !!a.spellAttack,
        });
        if (a.recharge) recharge[a.id] = true;
      } else if (a.type && a.type !== 'info') {
        const sp = U.deepClone(a);
        specials.push(sp);
        if (a.recharge) recharge[a.rechargeKey || a.id] = true;
        if (a.perDay) uses[a.id] = { max: a.perDay, used: 0 };
      }
    }
    let hp = m.hp;
    if (opts.rollHp && m.hd) hp = Math.max(1, Dice.roll(m.hd).total);
    let sc = null;
    let spells = [];
    if (m.spellcasting) {
      const msc = m.spellcasting;
      const ab = msc.ability || 'int';
      sc = {
        ability: ab, mod: mods[ab], dc: msc.dc || 8 + prof + mods[ab], toHit: msc.toHit != null ? msc.toHit : prof + mods[ab],
        slots: {}, casterLevel: msc.casterLevel || Math.max(1, Math.round(R.crValue(m.cr) * 1.5)), maxLevel: 0, innate: {},
      };
      for (const k in msc.slots || {}) {
        sc.slots[k] = { max: msc.slots[k], used: 0 };
        sc.maxLevel = Math.max(sc.maxLevel, Number(k));
      }
      const ids = new Set(msc.spells || []);
      (msc.spellsEn || []).forEach((en) => {
        const s = D.spellByEn ? D.spellByEn(en) : null;
        if (s) ids.add(s.id);
      });
      for (const en in msc.innate || {}) {
        const s = D.spellByEn ? D.spellByEn(en) : null;
        if (s) {
          sc.innate[s.id] = msc.innate[en];
          ids.add(s.id);
        }
      }
      spells = Array.from(ids).filter((id) => D.spell(id));
    }
    const res = {};
    if (flags.legendaryResistance) res.legendary = { max: flags.legendaryResistance, used: 0, name: 'Легендарное сопротивление' };
    if (flags.relentless) res.relentlessM = { max: 1, used: 0, name: 'Неутомимость' };
    return {
      uid: U.uid('c'), refId: m.id, kind: 'monster', name: opts.name || m.name, icon: m.icon || 'cowled', portrait: m.portrait || null,
      color: R.SIDES[side].color, side, controller: opts.controller || 'ai',
      size: m.size, cells: (R.SIZES[m.size] || R.SIZES.medium).cells, type: m.type, tags: m.tags || [m.type], race: null,
      abil: Object.assign({}, m.abil), mods, prof, saves, skills, ac: m.ac, acNote: m.acNote || '', armorCat: 'natural', hasShield: false,
      maxHp: hp, hp, tempHp: 0, speed: Object.assign({ walk: 30 }, m.speed),
      resist: (m.resist || []).slice(), immune: (m.immune || []).slice(), vuln: (m.vuln || []).slice(),
      resistNonmagical: !!m.resistNonmagical, immuneNonmagical: !!m.immuneNonmagical, condImmune: (m.condImmune || []).slice(),
      attacks, multiattack, extraAttacks: 0, specials, spellcasting: sc, spells,
      legendary: m.legendary ? U.deepClone(m.legendary) : null, legendaryMax: m.legendary ? m.legendaryCount || 3 : 0, legendaryPoints: m.legendary ? m.legendaryCount || 3 : 0,
      res, flags, recharge, uses, potions: 0, swarm: !!m.swarm,
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
    if (id === 'frightened' && (this.auraNear(c, 'auraOfCourage') || this.hasEff(c, 'heroism'))) {
      this.log(this.name(c) + ' не поддаётся страху.', 'muted');
      return false;
    }
    if (id === 'charmed' && this.auraNear(c, 'auraOfDevotion')) {
      this.log(this.name(c) + ' защищён Аурой преданности.', 'muted');
      return false;
    }
    if ((id === 'charmed' || id === 'frightened') && c.flags && c.flags.mindlessRage && this.hasEff(c, 'rage')) {
      this.log(this.name(c) + ' в бездумной ярости не поддаётся эффекту.', 'muted');
      return false;
    }
    if (id === 'prone' && this.hasCond(c, 'prone')) return true;
    const cond = Object.assign({ id }, opts);
    c.conditions.push(cond);
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

  P.auraNear = function (c, flag) {
    return this.B.combatants.some((p) => p.flags && p.flags[flag] && !p.dead && p.x >= 0 && !this.hostile(p, c) && this.conscious(p) && G.distFt(p, c) <= ((p.flags.auraRange) || 10));
  };
  P.auraOfCourage = function (c) {
    return this.auraNear(c, 'auraOfCourage');
  };

  P.speedOf = function (c) {
    if (c.dead || c.hp <= 0 || c.banished) return 0;
    if (this.hasCond(c, 'grappled') || this.hasCond(c, 'restrained') || this.hasCond(c, 'paralyzed') || this.hasCond(c, 'stunned') || this.hasCond(c, 'petrified')) return 0;
    let s = c.speed.walk || 0;
    if (c.speed.fly && !this.hasCond(c, 'prone')) s = Math.max(s, c.speed.fly);
    if (this.hasEff(c, 'slowed')) s -= 10;
    if (this.hasEff(c, 'haste')) s *= 2;
    if (this.hasEff(c, 'slowSpell')) s = Math.floor(s / 2 / 5) * 5;
    return Math.max(0, s);
  };
  P.canFly = function (c) {
    return !!c.speed.fly && !this.hasCond(c, 'prone');
  };

  P.acOf = function (c) {
    let ac = c.ac;
    if (this.hasEff(c, 'mageArmor') && c.armorCat === 'none') ac = Math.max(ac, 13 + c.mods.dex + (c.hasShield ? 2 : 0));
    if (this.hasEff(c, 'barkskin')) ac = Math.max(ac, 16);
    if (this.hasEff(c, 'shieldOfFaith')) ac += 2;
    if (this.hasEff(c, 'shield')) ac += 5;
    if (this.hasEff(c, 'haste')) ac += 2;
    if (this.hasEff(c, 'slowSpell')) ac -= 2;
    const ss = c.effects.find((e) => e.id === 'shimmerShield');
    if (ss) ac += ss.value || 2;
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
      if (o.banished && o.banished.conc === key) this.unbanish(o);
    }
    this.log(this.name(c) + ' теряет концентрацию на «' + nm + '»' + (reason ? ' (' + reason + ')' : '') + '.', 'warn');
    this.h.changed();
  };
  P.unbanish = function (o) {
    const pos = o.banished;
    o.banished = null;
    const tryPlace = (x, y) => {
      if (G.canStand(this.B, o, x, y, {}) && G.canEndAt(this.B, o, x, y)) {
        o.x = x;
        o.y = y;
        return true;
      }
      return false;
    };
    let placed = tryPlace(pos.x, pos.y);
    for (let r = 1; r < 10 && !placed; r++)
      for (let dy = -r; dy <= r && !placed; dy++) for (let dx = -r; dx <= r && !placed; dx++) placed = tryPlace(pos.x + dx, pos.y + dy);
    this.log(this.name(o) + ' возвращается из изгнания.', 'spell');
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
      if (!p.flags || !p.flags.auraOfProtection || p.x < 0 || this.hostile(p, c) || !this.conscious(p)) continue;
      if (G.distFt(p, c) <= (p.flags.auraRange || 10)) best = Math.max(best, Math.max(1, p.mods.cha));
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
    if (opts.magic && (f.magicResistance || f.spellResistance)) adv.push('сопротивление магии');
    if (ab === 'dex' && this.hasEff(c, 'dodge') && !this.incap(c)) adv.push('уклонение');
    if (ab === 'dex' && this.hasEff(c, 'haste')) adv.push('ускорение');
    if (ab === 'dex' && f.dangerSense && !this.hasCond(c, 'blinded') && !this.incap(c)) adv.push('чувство опасности');
    if (ab === 'str' && this.hasEff(c, 'rage')) adv.push('ярость');
    if (opts.poison && f.dwarvenResilience) adv.push('дварфская стойкость');
    if (opts.cond === 'charmed' && (f.feyAncestry || f.darkDevotion)) adv.push('наследие');
    if (opts.cond === 'frightened' && (f.brave || f.darkDevotion)) adv.push('храбрость');
    if (opts.cond && f.twoHeads && ['blinded', 'charmed', 'deafened', 'frightened', 'stunned', 'unconscious'].includes(opts.cond)) adv.push('несколько голов');
    if ((opts.cond === 'frightened' || opts.cond === 'charmed') && this.auraNear(c, 'countercharm')) adv.push('контрочарование');
    if (ab === 'dex' && this.hasCond(c, 'restrained')) dis.push('опутан');
    const mode = adv.length && !dis.length ? 1 : dis.length && !adv.length ? -1 : 0;
    let roll = Dice.d20(mode, f.lucky);
    let bonus = c.saves[ab];
    if (ab === 'dex' && this.hasEff(c, 'slowSpell')) bonus -= 2;
    const bless = this.blessBonus(c);
    const aura = this.auraOfProtection(c);
    bonus += aura;
    let total = roll.value + bonus + bless;
    total += await this.useInspiration(c, total, dc);
    let ok = total >= dc;
    await this.h.roll({ kind: 'save', actor: c, label: 'Спасбросок ' + abName, d20: roll, bonus: bonus + bless, total, vs: dc, ok });
    let extra = (bless ? ' (благословение +' + bless + ')' : '') + (aura ? ' (аура +' + aura + ')' : '') + (mode > 0 ? ' [преимущество]' : mode < 0 ? ' [помеха]' : '');
    if (!ok && c.res && c.res.darkLuck && c.res.darkLuck.used < c.res.darkLuck.max && total + 10 >= dc) {
      const use = await this.askReactor(c, c.name + ' провалил спасбросок (' + total + ' против Сл ' + dc + '). Использовать Удачу Тёмного (+1к10)?', [
        { label: '+1к10', value: true }, { label: 'Нет', value: false }], true);
      if (use) {
        c.res.darkLuck.used++;
        const r = Dice.die(10);
        total += r;
        ok = total >= dc;
        extra += ' (Удача Тёмного +' + r + ')';
      }
    }
    if (!ok && f.diamondSoul && c.res.ki && c.res.ki.used < c.res.ki.max) {
      const use = await this.askReactor(c, c.name + ' провалил спасбросок (' + total + ' против Сл ' + dc + '). Алмазная душа: перебросить за 1 ци?', [
        { label: 'Перебросить (1 ци)', value: true }, { label: 'Нет', value: false }], true);
      if (use) {
        c.res.ki.used++;
        roll = Dice.d20(0, f.lucky);
        total = roll.value + bonus;
        ok = total >= dc;
        extra += ' (Алмазная душа — переброс)';
        await this.h.roll({ kind: 'save', actor: c, label: 'Переброс спасброска', d20: roll, bonus, total, vs: dc, ok });
      }
    }
    if (!ok && c.res && c.res.indomitable && c.res.indomitable.used < c.res.indomitable.max) {
      const use = await this.askReactor(c, c.name + ' провалил спасбросок (' + total + ' против Сл ' + dc + '). Использовать «Упорный» и перебросить?', [
        { label: 'Перебросить', value: true }, { label: 'Нет', value: false }], true);
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
    return { ok, total, nat: roll.value, margin: total - dc };
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
    for (const c of B.combatants) {
      c.acted = false;
      if (c.initiative == null && c.x >= 0) this.rollInitiative(c);
    }
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
    if (c.banished) {
      this.log(this.name(c) + ' находится в изгнании и пропускает ход.', 'muted');
      return this.nextTurn();
    }
    B.turn = {
      uid: c.uid, move: 0, actions: 1, bonus: true, attacksLeft: 0, pool: null, bonusAttack: null,
      attackActionUsed: false, moved: 0, startX: c.x, startY: c.y, bonusSpell: false, leveledSpell: false,
      disengaged: false, rampage: false, lastSlot: null, lastLight: false, lastUnarmed: false, attacked: false,
      castCantripAction: false, castSpellAction: false, flags: {},
    };
    c.reactionUsed = false;
    c.legendaryPoints = c.legendaryMax || 0;
    this.log('— Ход: ' + this.name(c) + (c.player ? ' <span class="muted">(игрок ' + U.escapeHtml(c.player) + ')</span>' : ''), 'turn');
    this.tickDurations(c.uid, 'start');

    // Перезарядка способностей
    for (const id in c.recharge || {}) {
      if (!c.recharge[id]) {
        const spec = c.specials.find((s) => (s.rechargeKey || s.id) === id) || c.attacks.find((a) => a.id === id);
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
      const rg = c.flags.regeneration;
      if (c.regenBlocked) {
        c.regenBlocked = false;
        if (c.hp <= 0) this.kill(c, 'не смог регенерировать');
        else this.log(this.name(c) + ' не регенерирует в этот ход.', 'muted');
      } else if ((c.hp < c.maxHp || c.down) && !(rg.needsHp && c.hp <= 0 && !c.down)) {
        const amt = rg.amount || 10;
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
    // Уцелевший (чемпион 18)
    if (c.flags && c.flags.survivor && c.hp > 0 && c.hp <= c.maxHp / 2) {
      const amt = 5 + c.mods.con;
      this.log(this.name(c) + ' — Уцелевший.', 'good');
      this.heal(c, amt);
    }
    // Героизм
    const hero = this.getEff(c, 'heroism');
    if (hero && c.hp > 0) {
      const v = Math.max(1, hero.value || 1);
      if (c.tempHp < v) c.tempHp = v;
    }

    // Спасброски от смерти
    if (c.kind === 'pc' && c.hp <= 0 && !c.stable) {
      await this.deathSave(c);
      if (c.dead) {
        await this.checkEnd();
        if (B.phase !== 'combat') return;
      }
    }

    // Огненная аура существа (в начале его хода)
    if (c.flags && c.flags.fireAura && c.hp > 0) {
      for (const o of B.combatants) {
        if (o === c || o.dead || o.x < 0 || G.distFt(c, o) > c.flags.fireAura.range) continue;
        const r = Dice.roll(c.flags.fireAura.dice);
        this.log(this.name(o) + ' обжигается аурой ' + this.name(c) + '.', 'bad');
        await this.applyDamage(o, [{ amount: r.total, type: c.flags.fireAura.type || 'fire' }], c, { fromAttack: false });
      }
    }

    // Ауры других существ
    for (const o of B.combatants) {
      if (o.dead || o.x < 0 || o.uid === c.uid || c.dead) continue;
      const aura = this.getEff(o, 'spiritGuardians');
      if (aura && this.hostile(o, c) && G.distFt(o, c) <= aura.data.size && c.hp > 0) {
        this.log(this.name(c) + ' начинает ход в Духовных стражах ' + this.name(o) + '.', 'spell');
        const sv = await this.save(c, 'wis', aura.data.dc, { magic: true });
        const dmg = Dice.roll(aura.data.dice);
        await this.applyDamage(c, [{ amount: sv.ok ? Math.floor(dmg.total / 2) : dmg.total, type: 'radiant' }], o, { magical: true, spell: true, fromAttack: false });
      }
      const nimbus = this.getEff(o, 'holyNimbus');
      if (nimbus && this.hostile(o, c) && G.distFt(o, c) <= 30 && c.hp > 0) {
        this.log(this.name(c) + ' обжигается святым нимбом ' + this.name(o) + '.', 'spell');
        await this.applyDamage(c, [{ amount: 10, type: 'radiant' }], o, { magical: true, fromAttack: false });
      }
      if (o.flags && o.flags.stench && this.hostile(o, c) && o.hp > 0 && G.distFt(o, c) <= (o.flags.stench.range || 5) && c.hp > 0 && !(c.stenchImmune || {})[o.uid]) {
        const sv = await this.save(c, 'con', o.flags.stench.dc, { poison: true });
        if (!sv.ok) {
          if (this.addCond(c, 'poisoned', { src: o.uid, expire: { who: c.uid, at: 'start', n: 1 } })) this.log(this.name(c) + ' отравлен зловонием.', 'bad');
        } else {
          c.stenchImmune = c.stenchImmune || {};
          c.stenchImmune[o.uid] = true;
        }
      }
      if (o.flags && o.flags.fearAura && this.hostile(o, c) && o.hp > 0 && !this.incap(o) && G.distFt(o, c) <= o.flags.fearAura.range && c.hp > 0 && !(c.fearImmune || {})[o.uid]) {
        const sv = await this.save(c, 'wis', o.flags.fearAura.dc, { cond: 'frightened' });
        if (!sv.ok) {
          if (this.addCond(c, 'frightened', { src: o.uid, expire: { who: c.uid, at: 'start', n: 1 } })) this.log(this.name(c) + ' в ужасе от ауры ' + this.name(o) + '.', 'bad');
        } else {
          c.fearImmune = c.fearImmune || {};
          c.fearImmune[o.uid] = true;
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
    if (this.hasEff(c, 'haste')) B.turn.flags.hasteAction = true;
    c.acted = true;
    c.dispOff = false;
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
    // Длительный урон (кислотная стрела и т. п.)
    for (const e of c.effects.slice()) {
      if (e.dot && !c.dead) {
        const r = Dice.roll(e.dot.dice);
        this.log(this.name(c) + ': ' + ((R.EFFECTS[e.id] || {}).name || 'эффект') + '.', 'bad');
        await this.applyDamage(c, [{ amount: r.total, type: e.dot.type }], this.get(e.src), { magical: true, fromAttack: false });
        if (e.dotOnce) c.effects = c.effects.filter((x) => x !== e);
      }
    }
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
    for (const e of c.effects.slice()) {
      if (e.save && e.save.at === 'end' && !c.dead) {
        const sv = await this.save(c, e.save.ab, e.save.dc, { magic: true });
        if (sv.ok) {
          c.effects = c.effects.filter((x) => x !== e);
          this.log(this.name(c) + ' избавляется от эффекта «' + ((R.EFFECTS[e.id] || {}).name || e.id) + '».', 'good');
        }
      }
    }
    this.tickDurations(c.uid, 'end');
    // Бросок сквозь ад: возвращение и психический урон
    for (const o of B.combatants) {
      if (o.banished && o.banished.hurl && o.banished.src === c.uid) {
        o.banished.turns--;
        if (o.banished.turns <= 0) {
          this.unbanish(o);
          if (o.type !== 'fiend') await this.applyDamage(o, [{ amount: Dice.roll('10d10').total, type: 'psychic' }], c, { fromAttack: false, magical: true });
        }
      }
    }
    if (this.hasEff(c, 'entropicMark')) c.effects = c.effects.filter((e) => e.id !== 'entropicMark');
    this.h.changed();
    if (await this.checkEnd()) return;
    await this.legendaryPhase(c);
    if (await this.checkEnd()) return;
    await this.nextTurn();
  };

  /* ---------- Легендарные действия: в конце хода другого существа ---------- */
  P.legendaryOptions = function (L) {
    const out = [];
    for (const la of L.legendary || []) {
      if ((la.cost || 1) > L.legendaryPoints) continue;
      if (la.kind === 'attack') {
        for (const id of la.attacks || []) {
          const atk = L.attacks.find((a) => a.id === id);
          if (!atk) continue;
          const tg = this.B.combatants.filter((o) => !o.dead && o.x >= 0 && o.hp > 0 && this.hostile(L, o) && this.attackInfo(L, atk, o).ok);
          if (tg.length) out.push({ la, atk, targets: tg });
        }
      } else if (la.kind === 'special' && la.type) {
        if (la.type === 'area') {
          const cells = G.areaCells(this.B.map, la.area, L, { x: L.x + L.cells / 2, y: L.y + L.cells / 2 });
          const hit = G.creaturesInCells(this.B, cells).filter((o) => o !== L && this.hostile(L, o) && o.hp > 0);
          if (hit.length) out.push({ la, area: true, hits: hit.length });
        } else if (la.type === 'gaze') {
          const tg = this.B.combatants.filter((o) => !o.dead && o.x >= 0 && o.hp > 0 && this.hostile(L, o) && G.distFt(L, o) <= la.range && G.hasLOS(this.B.map, L, o));
          if (tg.length) out.push({ la, targets: tg, gaze: true });
        } else if (la.type === 'healSelf' && L.hp < L.maxHp) out.push({ la, heal: true });
        else if (la.type === 'teleport' && L.controller === 'ai') {
          const dest = this.teleportDest(L, la.range || 60);
          if (dest) out.push({ la, teleport: dest });
        }
      } else if (la.kind === 'useSpecial') {
        const sp = L.specials.find((s) => s.id === la.special);
        if (sp) out.push({ la, special: sp });
      }
    }
    return out;
  };

  /* Куда телепортироваться ИИ: к самому слабому врагу */
  P.teleportDest = function (c, range) {
    const B = this.B;
    const foes = B.combatants.filter((o) => !o.dead && o.x >= 0 && o.hp > 0 && this.hostile(c, o)).sort((a, b) => a.hp - b.hp);
    const reach = this.reachOf(c) || 5;
    for (const o of foes) {
      if (G.distFt(c, o) <= reach) return null;
      for (let dy = -c.cells; dy <= o.cells; dy++)
        for (let dx = -c.cells; dx <= o.cells; dx++) {
          const x = o.x + dx;
          const y = o.y + dy;
          if (!G.canStand(B, c, x, y, { fly: true }) || !G.canEndAt(B, c, x, y)) continue;
          if (G.distToCellFt(c, x, y) > range) continue;
          return { x: x + 0.5, y: y + 0.5 };
        }
    }
    return null;
  };

  P.legendaryPhase = async function (endedC) {
    const B = this.B;
    for (const L of B.combatants) {
      if (B.phase !== 'combat') return;
      if (!L.legendary || L === endedC || L.dead || L.x < 0 || L.hp <= 0 || this.incap(L) || L.legendaryPoints <= 0) continue;
      const opts = this.legendaryOptions(L);
      if (!opts.length) continue;
      let pick = null;
      let tgt = null;
      if (L.controller === 'ai') {
        if (Math.random() < 0.25 && L.legendaryPoints < L.legendaryMax) continue;
        const scored = opts.map((o) => ({ o, s: o.area ? o.hits * 10 * (o.la.cost || 1) : o.heal ? 4 : o.special ? 12 : 6 / (o.la.cost || 1) }));
        scored.sort((a, b) => b.s - a.s);
        pick = scored[0].o;
        if (pick.targets) tgt = pick.targets.slice().sort((a, b) => a.hp - b.hp)[0];
      } else {
        const choices = opts.map((o, i) => ({ label: o.la.name + (o.atk ? ' — ' + o.atk.name : '') + (o.la.cost > 1 ? ' (' + o.la.cost + ')' : ''), value: i }));
        choices.push({ label: 'Пропустить', value: -1 });
        const v = await this.h.ask(L.name + ': легендарное действие (осталось ' + L.legendaryPoints + ')?', choices, L);
        if (v == null || v < 0) continue;
        pick = opts[v];
        if (pick.targets) {
          if (pick.targets.length === 1) tgt = pick.targets[0];
          else {
            const tv = await this.h.ask('Цель легендарного действия:', pick.targets.map((o) => ({ label: o.name + ' (' + o.hp + ' хит.)', value: o.uid })), L);
            tgt = this.get(tv);
          }
        }
      }
      if (!pick) continue;
      L.legendaryPoints -= pick.la.cost || 1;
      this.log('👑 ' + this.name(L) + ' — легендарное действие: ' + U.escapeHtml(pick.la.name) + '.', 'warn');
      if (pick.atk && tgt) await this.attack(L, pick.atk, tgt, { legendary: true });
      else if (pick.area) await this.resolveAreaSpecial(L, pick.la, { x: L.x + L.cells / 2, y: L.y + L.cells / 2 });
      else if (pick.gaze && tgt) await this.doSpecialTarget(L, pick.la, tgt);
      else if (pick.heal) this.heal(L, Dice.roll(pick.la.dice || '2d8').total);
      else if (pick.teleport) await this.monsterTeleport(L, { range: (pick.la.range || 60) + 5 }, pick.teleport);
      else if (pick.special) await this.useMonsterSpecialAuto(L, pick.special);
      this.h.changed();
    }
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
    for (const o of this.B.combatants) o.conditions = o.conditions.filter((x) => !(x.src === c.uid && (x.id === 'grappled' || x.grappleLink)));
    this.log('☠️ ' + this.name(c) + ' погибает' + (reason ? ' (' + reason + ')' : '') + '.', 'bad');
    this.h.float(c, '☠', '#ff5555');
    if (c.flags && c.flags.deathBurst) {
      this._bursts = this._bursts || [];
      this._bursts.push(c);
    }
    this.h.changed();
  };

  P.processBursts = async function () {
    if (this._bursting) return;
    this._bursting = true;
    try {
      while (this._bursts && this._bursts.length) {
        const c = this._bursts.shift();
        const db = c.flags.deathBurst;
        if (!db || c.x < 0) continue;
        const cells = G.areaCells(this.B.map, { shape: 'aura', size: db.radius }, c, null);
        await this.h.flashCells(cells, db.dmg && db.dmg[0] ? R.DAMAGE_COLORS[db.dmg[0].type] : '#dddddd');
        this.log('💥 ' + this.name(c) + ' взрывается после смерти!', 'warn');
        const rolled = db.dmg ? db.dmg.map((d) => ({ type: d.type, r: Dice.roll(d.dice) })) : [];
        for (const o of G.creaturesInCells(this.B, cells)) {
          if (o === c || o.dead) continue;
          if (rolled.length) await this.areaSaveDamage(c, o, db.save, db.dc, rolled, db.half !== false, { magical: true });
          else if (db.condition) {
            const sv = await this.save(o, db.save, db.dc, { cond: db.condition });
            if (!sv.ok && this.addCond(o, db.condition, { src: c.uid, expire: { who: o.uid, at: 'end', n: 1 } })) this.log(this.name(o) + ': ' + R.CONDITIONS[db.condition].name.toLowerCase() + '!', 'bad');
          }
        }
      }
    } finally {
      this._bursting = false;
    }
  };

  P.applyDamage = async function (tgt, parts, src, opts) {
    opts = opts || {};
    if (!tgt || tgt.dead || tgt.banished) return 0;
    let total = 0;
    const segs = [];
    let blocked = false;
    let absorbed = 0;
    const f = tgt.flags || {};
    const raging = this.hasEff(tgt, 'rage');
    for (const p of parts) {
      if (!p || p.amount <= 0) continue;
      let a = p.amount;
      let note = '';
      const phys = R.PHYSICAL.includes(p.type);
      const nonmag = phys && !opts.magical;
      if (f.absorb && f.absorb.includes(p.type)) {
        absorbed += a;
        segs.push(a + ' ' + R.DAMAGE_SHORT[p.type] + ' (поглощение)');
        continue;
      }
      if (tgt.immune.includes(p.type) || (nonmag && tgt.immuneNonmagical)) {
        a = 0;
        note = 'иммунитет';
      } else {
        let res = tgt.resist.includes(p.type) || this.hasCond(tgt, 'petrified');
        if (nonmag && (tgt.resistNonmagical || this.hasEff(tgt, 'stoneskin') || f.avatarOfBattle)) res = true;
        if (phys && raging) res = true;
        if (raging && f.totem === 'bear' && p.type !== 'psychic') res = true;
        if (opts.spell && (f.spellResistance || f.resistSpells || this.auraNear(tgt, 'auraOfWarding'))) res = true;
        if (res) {
          a = Math.floor(a / 2);
          note = 'сопротивление';
        }
        if (tgt.vuln.includes(p.type)) {
          a *= 2;
          note = note ? note + ', уязвимость' : 'уязвимость';
        }
      }
      if (f.regeneration && (f.regeneration.blockedBy || []).includes(p.type)) blocked = true;
      total += a;
      segs.push(a + ' ' + R.DAMAGE_SHORT[p.type] + (note ? ' (' + note + ')' : ''));
    }
    if (blocked) tgt.regenBlocked = true;
    if (absorbed > 0) {
      this.log(this.name(tgt) + ' поглощает урон и восстанавливает силы!', 'warn');
      this.heal(tgt, absorbed);
    }
    if (total <= 0) {
      if (!absorbed) this.log(this.name(tgt) + ' не получает урона' + (segs.length ? ' (' + segs.join(', ') + ')' : '') + '.', 'muted');
      return 0;
    }
    let dmg = total;
    // Магическая защита (ограждение)
    if (tgt.ward && tgt.ward.hp > 0) {
      const w = Math.min(tgt.ward.hp, dmg);
      tgt.ward.hp -= w;
      dmg -= w;
      segs.push('магическая защита поглощает ' + w);
    }
    // Временные хиты
    if (tgt.tempHp > 0 && dmg > 0) {
      const ab = Math.min(tgt.tempHp, dmg);
      tgt.tempHp -= ab;
      dmg -= ab;
      if (ab) segs.push('поглощено временными хитами: ' + ab);
    }
    if (opts.noKill && dmg >= tgt.hp && tgt.hp > 0) dmg = Math.max(0, tgt.hp - 1);
    this.h.float(tgt, '-' + total, '#ff6b5b');
    if (this.removeCond(tgt, 'unconscious', (x) => x.tag === 'sleep')) this.log(this.name(tgt) + ' просыпается от боли.', 'muted');
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
      await this.processBursts();
      await this.checkEnd();
      return total;
    }
    tgt.hp -= dmg;
    this.log(this.name(tgt) + ' получает <b class="dmg">' + total + '</b> урона (' + segs.join(', ') + '). Хиты: ' + Math.max(0, tgt.hp) + '/' + tgt.maxHp, 'dmg');
    if (tgt.hp <= 0 && opts.disintegrate) {
      tgt.hp = 0;
      if (tgt.beast) this.revertWildShape(tgt, true);
      this.kill(tgt, 'обращён в прах');
    } else if (tgt.hp <= 0 && tgt.beast) {
      const overflow = -tgt.hp;
      this.log(this.name(tgt) + ' теряет звериный облик!', 'warn');
      this.revertWildShape(tgt, true);
      if (overflow > 0) {
        tgt.hp -= overflow;
        this.log(this.name(tgt) + ' получает оставшиеся ' + overflow + ' урона. Хиты: ' + Math.max(0, tgt.hp) + '/' + tgt.maxHp, 'dmg');
      }
    }
    if (tgt.hp <= 0 && !tgt.dead) {
      const overflow = -tgt.hp;
      tgt.hp = 0;
      let saved = false;
      if (f.undeadFortitude && !parts.some((p) => p.type === 'radiant') && !opts.crit) {
        const sv = await this.save(tgt, 'con', 5 + total, {});
        if (sv.ok) {
          tgt.hp = 1;
          saved = true;
          this.log(this.name(tgt) + ' не падает — Стойкость нежити!', 'warn');
        }
      }
      if (!saved && tgt.res && tgt.res.relentlessM && tgt.res.relentlessM.used < 1 && total <= f.relentless) {
        tgt.res.relentlessM.used++;
        tgt.hp = 1;
        saved = true;
        this.log(this.name(tgt) + ' остаётся на ногах (Неутомимость).', 'warn');
      }
      if (!saved && raging && f.relentlessRage && overflow < tgt.maxHp) {
        tgt.relentlessDC = tgt.relentlessDC || 10;
        const sv = await this.save(tgt, 'con', tgt.relentlessDC, {});
        tgt.relentlessDC += 5;
        if (sv.ok) {
          tgt.hp = 1;
          saved = true;
          this.log(this.name(tgt) + ' не падает — Непреклонная ярость!', 'good');
        }
      }
      if (!saved && tgt.res && tgt.res.undying && tgt.res.undying.used < 1 && overflow < tgt.maxHp) {
        tgt.res.undying.used++;
        tgt.hp = 1;
        saved = true;
        this.log(this.name(tgt) + ' остаётся с 1 хитом (Неумирающий страж).', 'good');
      }
      if (!saved && tgt.res && tgt.res.relentless && tgt.res.relentless.used < 1 && overflow < tgt.maxHp) {
        tgt.res.relentless.used++;
        tgt.hp = 1;
        saved = true;
        this.log(this.name(tgt) + ' остаётся с 1 хитом (Непоколебимая стойкость).', 'good');
      }
      if (!saved) this.dropToZero(tgt, overflow, src, opts);
    }
    // Мрачная жатва
    if (src && tgt.dead && src.flags && src.flags.grimHarvest && opts.spellLevel > 0 && !['undead', 'construct'].includes(tgt.type) && src !== tgt) {
      const amt = opts.spellLevel * (opts.school === 'necromancy' ? 3 : 2);
      this.log(this.name(src) + ' — Мрачная жатва.', 'good');
      this.heal(src, amt);
    }
    // Концентрация
    if (tgt.concentration && !tgt.dead && tgt.hp > 0) {
      const dc = Math.max(10, Math.floor(total / 2));
      this.log(this.name(tgt) + ' поддерживает концентрацию (Сл ' + dc + ').', 'muted');
      const sv = await this.save(tgt, 'con', dc, {});
      if (!sv.ok) this.endConcentration(tgt, 'урон');
    }
    if (src && src !== tgt && !src.dead && this.hostile(tgt, src) && opts.fromAttack !== false) {
      const near = G.distFt(tgt, src) <= 5;
      // Раскалённое тело
      if (f.heatedBody && opts.melee && near && !tgt.dead) {
        const r = Dice.roll(f.heatedBody.dice);
        this.log(this.name(src) + ' обжигается о ' + this.name(tgt) + '.', 'bad');
        await this.applyDamage(src, [{ amount: r.total, type: f.heatedBody.type || 'fire' }], tgt, { fromAttack: false, magical: true });
      }
      if (!tgt.dead && tgt.hp > 0 && !src.dead) {
        // Гнев бури
        if (f.wrathOfStorm && near && this.canReact(tgt) && tgt.res.wrathOfStorm && tgt.res.wrathOfStorm.used < tgt.res.wrathOfStorm.max) {
          const use = await this.askReactor(tgt, tgt.name + ': ответить Гневом бури (2d8 электричеством)?', [{ label: 'Гнев бури', value: true }, { label: 'Нет', value: false }], true);
          if (use) {
            tgt.reactionUsed = true;
            tgt.res.wrathOfStorm.used++;
            this.log('⚡ ' + this.name(tgt) + ' обрушивает Гнев бури на ' + this.name(src) + '!', 'spell');
            await this.areaSaveDamage(tgt, src, 'dex', 8 + tgt.prof + tgt.mods.wis, [{ type: 'lightning', r: Dice.roll('2d8') }], true, { magical: true });
          }
        }
        // Возмездие берсерка
        if (f.retaliation && near && this.canReact(tgt) && !src.dead) {
          const atk = this.bestMelee(tgt, G.distFt(tgt, src));
          if (atk) {
            const use = await this.askReactor(tgt, tgt.name + ': Возмездие — атаковать ' + src.name + ' реакцией?', [{ label: 'Атаковать', value: true }, { label: 'Нет', value: false }], true);
            if (use) {
              tgt.reactionUsed = true;
              await this.attack(tgt, atk, src, { opportunity: true });
            }
          }
        }
        if (!tgt.dead && tgt.hp > 0 && !src.dead) await this.tryHellishRebuke(tgt, src);
      }
    }
    this.h.changed();
    await this.processBursts();
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
    if (tgt.swarm) {
      this.log(this.name(tgt) + ' (рой) не может восстанавливать хиты.', 'muted');
      return 0;
    }
    const was = tgt.hp;
    tgt.hp = Math.min(tgt.maxHp, tgt.hp + Math.max(0, amount));
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
    let adv = [];
    const dis = [];
    const B = this.B;
    const af = att.flags || {};
    const tf = tgt.flags || {};
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
    if (this.hasEff(tgt, 'faerieFire')) adv.push('огонь фей');
    if (tgt.effects.some((e) => e.id === 'vowOfEnmity' && e.src === att.uid)) adv.push('клятва вражды');
    if (tgt.effects.some((e) => e.id === 'helped' && !this.hostile(this.get(e.src) || att, att))) adv.push('помощь союзника');
    if (this.hasEff(att, 'recklessAtk') && !isRanged && atk.ability === 'str' && !atk.isSpell) adv.push('безрассудная атака');
    if (this.hasEff(att, 'shadowStep') && !isRanged) adv.push('шаг тени');
    if (this.hasEff(att, 'tides')) adv.push('поток хаоса');
    if (af.packTactics) {
      const ally = B.combatants.some((o) => o.uid !== att.uid && !o.dead && !this.hostile(o, att) && this.hostile(o, tgt) && !this.incap(o) && o.x >= 0 && G.distFt(o, tgt) <= 5);
      if (ally) adv.push('тактика стаи');
    }
    if (af.bloodFrenzy && tgt.hp < tgt.maxHp) adv.push('кровавое бешенство');
    if (af.grappler && tgt.conditions.some((x) => x.id === 'grappled' && x.src === att.uid)) adv.push('захват');
    if (af.assassinate && B.phase === 'combat' && B.round === 1 && !tgt.acted) adv.push('убийство');
    if (!isRanged && B.combatants.some((o) => o.flags && o.flags.totem === 'wolf' && o !== att && !o.dead && o.x >= 0 && !this.hostile(o, att) && this.hasEff(o, 'rage') && G.distFt(o, tgt) <= 5))
      adv.push('тотем волка');
    if (this.hasCond(att, 'blinded')) dis.push('атакующий ослеплён');
    if (this.hasCond(att, 'poisoned')) dis.push('отравлен');
    if (this.hasCond(att, 'frightened')) dis.push('испуган');
    if (this.hasCond(att, 'restrained')) dis.push('опутан');
    if (this.hasCond(att, 'prone')) dis.push('атакующий лежит');
    if (this.hasEff(tgt, 'dodge') && !this.incap(tgt)) dis.push('цель уклоняется');
    if (this.hasEff(att, 'mockery')) dis.push('злая насмешка');
    if (this.hasEff(att, 'oaDis')) dis.push('цель ускользает');
    if (att.effects.some((e) => e.id === 'entropicMark' && e.src === tgt.uid)) adv.push('энтропийная защита');
    if (tf.displacement && !tgt.dispOff && !this.incap(tgt)) dis.push('плащ ускользания');
    if (isRanged) {
      const near = B.combatants.some((o) => !o.dead && o.x >= 0 && this.hostile(o, att) && !this.incap(o) && G.distFt(o, att) <= 5);
      if (near) dis.push('враг рядом');
      if (atk.range && dist > atk.range[0]) dis.push('большая дистанция');
    }
    if (tf.elusive && !this.incap(tgt)) adv = [];
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
    const af = att.flags || {};
    if (turn.uid === att.uid) turn.attacked = true;
    const guided = this.getEff(tgt, 'guidingBolt');
    if (guided) this.removeEff(tgt, 'guidingBolt');
    const helped = tgt.effects.find((e) => e.id === 'helped' && !this.hostile(this.get(e.src) || att, att));
    if (helped) tgt.effects = tgt.effects.filter((e) => e !== helped);
    if (this.hasEff(att, 'mockery')) this.removeEff(att, 'mockery');
    if (this.hasEff(att, 'tides')) this.removeEff(att, 'tides');
    if (this.hasEff(att, 'shadowStep') && !info.isRanged) this.removeEff(att, 'shadowStep');

    // Реакции до броска: защитная вспышка, энтропийная защита, стиль «Защита»
    const addDis = async (who, label) => {
      info.dis.push(label);
      info.mode = info.adv.length && !info.dis.length ? 1 : info.dis.length && !info.adv.length ? -1 : 0;
      who.reactionUsed = true;
      this.log(this.name(who) + ': ' + label + ' — помеха на атаку.', 'good');
    };
    if (this.hostile(att, tgt) && info.mode >= 0) {
      const tf = tgt.flags || {};
      if (tf.wardingFlare && this.canReact(tgt) && tgt.res.wardingFlare && tgt.res.wardingFlare.used < tgt.res.wardingFlare.max && G.distFt(att, tgt) <= 30 && !this.hasCond(att, 'blinded')) {
        const use = await this.askReactor(tgt, tgt.name + ': ' + att.name + ' атакует вас. Защитная вспышка (помеха на атаку)?', [{ label: 'Вспышка', value: true }, { label: 'Нет', value: false }], true);
        if (use) {
          tgt.res.wardingFlare.used++;
          await addDis(tgt, 'защитная вспышка');
        }
      }
      if (info.mode >= 0 && tf.entropicWard && this.canReact(tgt) && tgt.res.entropic && tgt.res.entropic.used < 1) {
        const use = await this.askReactor(tgt, tgt.name + ': Энтропийная защита (помеха на атаку)?', [{ label: 'Использовать', value: true }, { label: 'Нет', value: false }], true);
        if (use) {
          tgt.res.entropic.used++;
          ctx.entropic = tgt.uid;
          await addDis(tgt, 'энтропийная защита');
        }
      }
      if (info.mode >= 0) {
        const prot = B.combatants.find((o) => o !== tgt && o.flags && o.flags.fightingStyle === 'protection' && o.hasShield && !o.dead && o.x >= 0 && !this.hostile(o, tgt) && this.canReact(o) && G.distFt(o, tgt) <= 5);
        if (prot) {
          const use = await this.askReactor(prot, prot.name + ': защитить ' + tgt.name + ' щитом (помеха на атаку)?', [{ label: 'Защитить', value: true }, { label: 'Нет', value: false }], true);
          if (use) await addDis(prot, 'стиль «Защита» (' + prot.name + ')');
        }
      }
    }

    const roll = Dice.d20(info.mode, af.lucky);
    let bonus = atk.toHit;
    const sacred = this.getEff(att, 'sacredWeapon');
    if (sacred && atk.weapon && !atk.monster) bonus += sacred.value;
    if (this.hasEff(att, 'magicWeapon') && atk.weapon && !atk.isSpell) bonus += 1;
    const bless = this.blessBonus(att);
    let total = roll.value + bonus + bless;
    const ac = this.acOf(tgt);
    let crit = roll.value >= this.critRange(att, atk);
    let hit = roll.value === 20 || crit || (roll.value !== 1 && total >= ac);
    let extraTxt = '';
    if (!hit && roll.value !== 1) {
      const add = await this.useInspiration(att, total, ac);
      total += add;
      hit = total >= ac;
    }
    // Точная атака мастера боя
    if (!hit && roll.value !== 1 && af.combatSuperiority && atk.weapon && att.res.superiority && att.res.superiority.used < att.res.superiority.max && total + att.res.superiority.die >= ac) {
      const use = await this.askReactor(att, att.name + ': промах (' + total + ' против КД ' + ac + '). Точная атака (+d' + att.res.superiority.die + ')?', [{ label: 'Точная атака', value: true }, { label: 'Нет', value: false }], total + att.res.superiority.die / 2 >= ac);
      if (use) {
        att.res.superiority.used++;
        const r = Dice.die(att.res.superiority.die);
        total += r;
        extraTxt += ' +' + r + ' (точная атака)';
        hit = total >= ac;
      }
    }
    // Направленный удар (жрец войны)
    if (!hit && roll.value !== 1 && af.guidedStrike && att.res.channel && att.res.channel.used < att.res.channel.max && total + 10 >= ac) {
      const use = await this.askReactor(att, att.name + ': промах (' + total + ' против КД ' + ac + '). Направленный удар (+10, Божественный канал)?', [{ label: '+10', value: true }, { label: 'Нет', value: false }], true);
      if (use) {
        att.res.channel.used++;
        total += 10;
        extraTxt += ' +10 (направленный удар)';
        hit = true;
      }
    }
    // Удача (плут 20)
    if (!hit && att.res && att.res.strokeOfLuck && att.res.strokeOfLuck.used < 1) {
      const use = await this.askReactor(att, att.name + ': промах. Использовать «Удачу» и превратить в попадание?', [{ label: 'Попадание!', value: true }, { label: 'Нет', value: false }], false);
      if (use) {
        att.res.strokeOfLuck.used++;
        hit = true;
        extraTxt += ' (Удача)';
      }
    }
    if (hit && info.dist <= 5 && (this.hasCond(tgt, 'paralyzed') || this.hasCond(tgt, 'unconscious'))) crit = true;

    // Острое слово барда коллегии знаний
    if (hit && roll.value !== 20 && !crit && this.hostile(att, tgt)) {
      const bard = B.combatants.find((o) => o.flags && o.flags.cuttingWords && !o.dead && o.x >= 0 && this.hostile(o, att) && this.canReact(o) && o.res.inspiration && o.res.inspiration.used < o.res.inspiration.max && G.distFt(o, att) <= 60 && total - (o.flags.inspirationDie || 6) < ac);
      if (bard) {
        const use = await this.askReactor(bard, bard.name + ': ' + att.name + ' попадает (' + total + ' против КД ' + ac + '). Использовать Острое слово (−d' + bard.flags.inspirationDie + ')?', [{ label: 'Острое слово', value: true }, { label: 'Нет', value: false }], true);
        if (use) {
          bard.reactionUsed = true;
          bard.res.inspiration.used++;
          const r = Dice.die(bard.flags.inspirationDie || 6);
          total -= r;
          extraTxt += ' −' + r + ' (острое слово)';
          hit = total >= ac;
          this.log(this.name(bard) + ' язвит: −' + r + ' к броску атаки.', 'good');
        }
      }
    }

    await this.h.roll({ kind: 'attack', actor: att, target: tgt, label: atk.name, d20: roll, bonus: bonus + bless, total, vs: ac, ok: hit, crit });

    const modeTxt = info.mode > 0 ? ' <span class="adv">[преимущество: ' + info.adv.join(', ') + ']</span>' : info.mode < 0 ? ' <span class="dis">[помеха: ' + info.dis.join(', ') + ']</span>' : '';
    const head = this.name(att) + ' ' + (ctx.opportunity ? 'совершает атаку по возможности' : 'атакует') + ' ' + this.name(tgt) + ' (' + U.escapeHtml(atk.name) + '): ' +
      rollTxt(roll) + ' ' + U.fmtMod(bonus) + (bless ? ' +' + bless + ' (благ.)' : '') + extraTxt + ' = <b>' + total + '</b> против КД ' + ac + modeTxt;

    // Невидимость (обычная) рассеивается при атаке
    if (this.removeCond(att, 'invisible', (x) => x.tag === 'invis')) this.log(this.name(att) + ' становится видимым.', 'muted');

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
      if (ctx.entropic === tgt.uid) this.addEff(att, { id: 'entropicMark', src: tgt.uid, expire: { who: tgt.uid, at: 'end', n: 2 } });
      this.h.changed();
      return { ok: true, hit: false, roll };
    }
    this.log(head + ' — <span class="hit">' + (crit ? 'КРИТИЧЕСКОЕ ПОПАДАНИЕ!' : 'попадание') + '</span>', crit ? 'crit' : 'attack');
    if (tgt.flags && tgt.flags.displacement) tgt.dispOff = true;

    // Приёмы мастера боя
    if (af.combatSuperiority && atk.weapon && !atk.isSpell && att.res.superiority && att.res.superiority.used < att.res.superiority.max) {
      const opts = [{ label: 'Без приёма', value: '' }];
      if (R.SIZES[tgt.size].order <= R.SIZES.large.order && !this.hasCond(tgt, 'prone')) opts.push({ label: 'Сбивание с ног (+d' + att.res.superiority.die + ')', value: 'trip' });
      opts.push({ label: 'Угрожающая атака (+d' + att.res.superiority.die + ')', value: 'menace' });
      if (R.SIZES[tgt.size].order <= R.SIZES.large.order) opts.push({ label: 'Отталкивающая атака (+d' + att.res.superiority.die + ')', value: 'push' });
      opts.push({ label: 'Просто урон (+d' + att.res.superiority.die + ')', value: 'dmg' });
      const aiPick = att.res.superiority.used < att.res.superiority.max - 1 ? (opts.find((o) => o.value === 'trip') ? 'trip' : 'menace') : '';
      const pick = await this.askReactor(att, att.name + ': использовать боевой приём?', opts, aiPick);
      if (pick) {
        att.res.superiority.used++;
        ctx.maneuver = pick;
      }
    }

    // Урон
    const parts = await this.rollAttackDamage(att, atk, tgt, crit, info, ctx);
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
    // Отражение снарядов (монах)
    if (tgt.flags && tgt.flags.deflectMissiles && info.isRanged && atk.weapon && !atk.isSpell && this.canReact(tgt) && parts.length) {
      const use = await this.askReactor(tgt, tgt.name + ': Отражение снарядов (уменьшить урон на 1d10+' + (tgt.mods.dex + tgt.level) + ')?', [{ label: 'Отразить', value: true }, { label: 'Нет', value: false }], true);
      if (use) {
        tgt.reactionUsed = true;
        let red = Dice.roll('1d10').total + tgt.mods.dex + (tgt.level || 1);
        this.log(this.name(tgt) + ' отражает снаряд (−' + red + ' урона).', 'good');
        for (const p of parts) {
          const d = Math.min(p.amount, red);
          p.amount -= d;
          red -= d;
        }
      }
    }
    const magical = !!atk.magical || !!atk.isSpell || (this.hasEff(att, 'magicWeapon') && atk.weapon);
    const before = tgt.hp + (tgt.tempHp || 0);
    await this.applyDamage(tgt, parts, att, { crit, magical, melee: !info.isRanged, fromAttack: true, spell: !!atk.isSpell, spellLevel: ctx.spellLevel || 0, school: ctx.school });
    ctx.dealt = Math.max(0, before - (tgt.hp + (tgt.tempHp || 0)));

    if (!tgt.dead) await this.onHitEffects(att, atk, tgt, ctx, info);
    this.h.changed();
    return { ok: true, hit: true, crit, roll, dealt: ctx.dealt };
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
    if (atk.dmgHalfHp && att.hp <= att.maxHp / 2) dmgList = Array.isArray(atk.dmgHalfHp) ? atk.dmgHalfHp : [{ dice: atk.dmgHalfHp, type: (atk.dmg[0] || {}).type || 'piercing' }];
    if (ctx.offhand && !atk.monster) {
      const bonus = f.fightingStyle === 'twf' ? atk.dmgBonus : Math.min(0, atk.abMod) + (atk.magic || 0);
      dmgList = [{ dice: atk.dieOnly + (bonus > 0 ? '+' + bonus : bonus < 0 ? String(bonus) : ''), type: atk.dmg[0].type }].concat(atk.dmg.slice(1));
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
    const add = (dice, type, txt) => {
      const r = Dice.roll(dice, { crit });
      parts.push({ amount: r.total, type, txt: txt + ' ' + Dice.fmtRolls(r) });
    };

    if (weaponAtk && this.hasEff(att, 'rage') && meleeW && atk.ability === 'str') parts.push({ amount: f.rageDamage || 2, type: physType, txt: 'ярость' });
    if (this.hasEff(att, 'magicWeapon') && weaponAtk) parts.push({ amount: 1, type: physType, txt: 'магическое оружие' });
    // Скрытая атака
    if (f.sneakDice && weaponAtk && (atk.finesse || info.isRanged || atk.monster) && onceOk('sneak')) {
      const allyNear = B.combatants.some((o) => o.uid !== att.uid && !o.dead && !this.hostile(o, att) && this.hostile(o, tgt) && !this.incap(o) && o.x >= 0 && G.distFt(o, tgt) <= 5);
      if (info.mode > 0 || (allyNear && info.mode >= 0)) {
        useOnce('sneak');
        add(f.sneakDice + 'd6', physType, 'скрытая атака');
      }
    }
    const hex = tgt.effects.find((e) => e.id === 'hex' && e.src === att.uid);
    if (hex) add('1d6', 'necrotic', 'сглаз');
    const mark = tgt.effects.find((e) => e.id === 'hunterMark' && e.src === att.uid);
    if (mark && weaponAtk) add('1d6', physType, 'метка охотника');
    if (f.colossusSlayer && weaponAtk && tgt.hp < tgt.maxHp && onceOk('colossus')) {
      useOnce('colossus');
      add('1d8', physType, 'убийца колоссов');
    }
    if (f.divineStrike && weaponAtk && onceOk('divineStrike')) {
      useOnce('divineStrike');
      const tp = f.divineStrikeType === 'weapon' ? physType : f.divineStrikeType || 'radiant';
      add((f.divineStrikeDice || 1) + 'd8', tp, 'божественный удар');
    }
    if (f.improvedSmite && meleeW) add('1d8', 'radiant', 'улучшенная кара');
    if (this.hasEff(att, 'divineFavor') && weaponAtk) add('1d4', 'radiant', 'благоволение');
    if (this.hasEff(att, 'thunderousSmite') && meleeW) {
      add('2d6', 'thunder', 'громовая кара');
      ctx.thunderous = true;
      this.removeEff(att, 'thunderousSmite');
      if (att.concentration && att.concentration.spellId === 'thunderoussmite') {
        att.concentration = null;
      }
    }
    if (f.martialAdvantage && weaponAtk && onceOk('martialAdv')) {
      const allyNear = B.combatants.some((o) => o.uid !== att.uid && !o.dead && !this.hostile(o, att) && this.hostile(o, tgt) && !this.incap(o) && o.x >= 0 && G.distFt(o, tgt) <= 5);
      if (allyNear) {
        useOnce('martialAdv');
        add(f.martialAdvantage, physType, 'воинское превосходство');
      }
    }
    if (f.foeSlayer && weaponAtk && onceOk('foeSlayer')) {
      useOnce('foeSlayer');
      parts.push({ amount: Math.max(0, att.mods.wis), type: physType, txt: 'убийца врагов' });
    }
    if (ctx.maneuver && att.res.superiority) add('1d' + att.res.superiority.die, physType, 'боевой приём');
    if (ctx.charge && ctx.charge.dmg && ctx.charge.dmg[0]) add(ctx.charge.dmg[0].dice, ctx.charge.dmg[0].type, 'атака в броске');
    // Боевое вдохновение (коллегия доблести)
    const insp = att.effects.find((e) => e.id === 'inspiration' && e.valor);
    if (insp && weaponAtk) {
      const use = await this.askReactor(att, att.name + ': добавить Вдохновение барда (d' + insp.value + ') к урону?', [{ label: 'Добавить', value: true }, { label: 'Нет', value: false }], crit || tgt.hp < 15);
      if (use) {
        this.removeEff(att, 'inspiration');
        parts.push({ amount: Dice.die(insp.value), type: physType, txt: 'боевое вдохновение' });
      }
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
        const bc = typeof f.brutalCritical === 'number' ? f.brutalCritical : f.brutalCritical ? 1 : 0;
        if (bc > 0) {
          const r = Dice.roll(bc + 'd' + die[0].split('d')[1]);
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
        add(dice + 'd8', 'radiant', 'божественная кара');
      }
    }
    for (const p of parts) notes.push(p.amount + ' ' + R.DAMAGE_SHORT[p.type] + (p.txt ? ' <span class="muted">(' + p.txt + ')</span>' : ''));
    this.log('Урон: ' + notes.join(' + '), 'dmgroll');
    return parts.map((p) => ({ amount: p.amount, type: p.type }));
  };

  P.onHitEffects = async function (att, atk, tgt, ctx, info) {
    const list = Array.isArray(atk.onHit) ? atk.onHit : atk.onHit ? [atk.onHit] : [];
    for (const oh of list) {
      if (tgt.dead) break;
      if ((oh.notTypes && oh.notTypes.includes(tgt.type)) || (oh.notRace && tgt.race === oh.notRace)) continue;
      if (oh.sizeMax && R.SIZES[tgt.size].order > R.SIZES[oh.sizeMax].order) continue;
      let failed = true;
      if (oh.save) {
        const sv = await this.save(tgt, oh.save, oh.dc, { cond: oh.condition, poison: (oh.damage || []).some((x) => x.type === 'poison') || oh.condition === 'poisoned' });
        failed = !sv.ok;
        if (oh.damage) {
          const prt = oh.damage.map((dm) => {
            const r = Dice.roll(dm.dice);
            return { amount: failed ? r.total : oh.half ? Math.floor(r.total / 2) : 0, type: dm.type };
          });
          if (prt.some((p) => p.amount > 0)) await this.applyDamage(tgt, prt, att, { fromAttack: false, magical: !!atk.magical });
        }
      } else if (oh.damage) {
        const prt = oh.damage.map((dm) => ({ amount: Dice.roll(dm.dice).total, type: dm.type }));
        await this.applyDamage(tgt, prt, att, { fromAttack: false, magical: !!atk.magical });
      }
      if (tgt.dead || !failed) continue;
      if (oh.condition) {
        const opts = { src: att.uid };
        if (oh.escapeDC) opts.escape = { dc: oh.escapeDC };
        if (oh.repeat) opts.save = { ab: oh.save, dc: oh.dc, at: 'end' };
        if (oh.rounds) opts.expire = { who: tgt.uid, at: 'end', n: oh.rounds };
        else if (!oh.escapeDC && oh.save && !oh.repeat) opts.expire = { who: tgt.uid, at: 'end', n: 10 };
        if (this.addCond(tgt, oh.condition, opts)) {
          this.log(this.name(tgt) + ': ' + R.CONDITIONS[oh.condition].name.toLowerCase() + '!', 'bad');
          if (oh.alsoRestrained) this.addCond(tgt, 'restrained', { src: att.uid, grappleLink: true });
        }
      }
      if (oh.push) this.push(att, tgt, oh.push);
      if (oh.drainMax && ctx.dealt > 0) {
        tgt.maxHp = Math.max(0, tgt.maxHp - ctx.dealt);
        tgt.hp = Math.min(tgt.hp, tgt.maxHp);
        this.log(this.name(tgt) + ': максимум хитов уменьшен на ' + ctx.dealt + ' (' + tgt.maxHp + ').', 'bad');
        if (tgt.maxHp <= 0) this.kill(tgt, 'жизненная сила иссякла');
      }
      if (oh.heal && ctx.dealt > 0) this.heal(att, ctx.dealt);
      if (oh.killBelow && tgt.hp > 0 && tgt.hp <= oh.killBelow) {
        tgt.hp = 0;
        this.kill(tgt, 'сражён наповал');
      }
    }
    if (tgt.dead) return;
    // Атака в броске (кабан, минотавр)
    if (ctx.charge && (ctx.charge.save || ctx.charge.prone || ctx.charge.push)) {
      const ch = ctx.charge;
      const sv = ch.save ? await this.save(tgt, ch.save, ch.dc, {}) : { ok: false };
      if (!sv.ok) {
        if (ch.push) this.push(att, tgt, ch.push);
        if (ch.prone && this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног!', 'bad');
      }
    }
    // Громовая кара
    if (ctx.thunderous) {
      const sv = await this.save(tgt, 'str', att.spellcasting ? att.spellcasting.dc : 13, { magic: true });
      if (!sv.ok) {
        this.push(att, tgt, 10);
        if (this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног громовой карой!', 'bad');
      }
    }
    // Приёмы мастера боя
    if (ctx.maneuver && ctx.maneuver !== 'dmg') {
      const dc = 8 + att.prof + Math.max(att.mods.str, att.mods.dex);
      if (ctx.maneuver === 'trip') {
        const sv = await this.save(tgt, 'str', dc, {});
        if (!sv.ok && this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног!', 'bad');
      } else if (ctx.maneuver === 'menace') {
        const sv = await this.save(tgt, 'wis', dc, { cond: 'frightened' });
        if (!sv.ok && this.addCond(tgt, 'frightened', { src: att.uid, expire: { who: att.uid, at: 'end', n: 2 } })) this.log(this.name(tgt) + ' испуган!', 'bad');
      } else if (ctx.maneuver === 'push') {
        const sv = await this.save(tgt, 'str', dc, {});
        if (!sv.ok) this.push(att, tgt, 15);
      }
    }
    const af = att.flags || {};
    // Ошеломляющий удар монаха
    if (af.stunningStrike && atk.weapon && !info.isRanged && att.res.ki && att.res.ki.used < att.res.ki.max && !this.hasCond(tgt, 'stunned')) {
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
    // Дрожащая ладонь
    if (af.quiveringPalm && atk.unarmed && att.res.ki && att.res.ki.max - att.res.ki.used >= 3 && !tgt.quivering) {
      const use = await this.askReactor(att, att.name + ': вложить Дрожащую ладонь (3 ци)?', [{ label: 'Дрожащая ладонь', value: true }, { label: 'Нет', value: false }], false);
      if (use) {
        att.res.ki.used += 3;
        tgt.quivering = att.uid;
        this.log(this.name(att) + ' запускает в ' + this.name(tgt) + ' смертельные вибрации.', 'warn');
      }
    }
    // Техника открытой ладони
    if (ctx.flurry && af.openHand) {
      const dc = 8 + att.prof + att.mods.wis;
      const pick = await this.askReactor(att, att.name + ': техника открытой ладони — эффект?', [
        { label: 'Сбить с ног (Лов)', value: 'prone' },
        { label: 'Оттолкнуть на 15 фт. (Сил)', value: 'push' },
        { label: 'Лишить реакций', value: 'noreact' },
      ], 'prone');
      if (pick === 'prone') {
        const sv = await this.save(tgt, 'dex', dc, {});
        if (!sv.ok && this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног открытой ладонью!', 'bad');
      } else if (pick === 'push') {
        const sv = await this.save(tgt, 'str', dc, {});
        if (!sv.ok) this.push(att, tgt, 15);
      } else if (pick === 'noreact') {
        this.addEff(tgt, { id: 'noReactions', src: att.uid, expire: { who: att.uid, at: 'end', n: 2 } });
        this.log(this.name(tgt) + ' не может совершать реакции.', 'bad');
      }
    }
    // Бросок сквозь ад
    if (att.res && att.res.hurl && att.res.hurl.used < 1 && !tgt.banished && this.hostile(att, tgt)) {
      const use = await this.askReactor(att, att.name + ': Бросок сквозь ад для ' + tgt.name + '?', [{ label: 'Бросить сквозь ад', value: true }, { label: 'Нет', value: false }], tgt.maxHp >= 40);
      if (use) {
        att.res.hurl.used++;
        tgt.banished = { x: tgt.x, y: tgt.y, hurl: true, src: att.uid, turns: 2 };
        tgt.x = -1;
        tgt.y = -1;
        this.log('🔥 ' + this.name(tgt) + ' исчезает в адском пламени!', 'spell');
      }
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
        const inMulti = c.multiattack && c.multiattack.some((o) => o.includes(s.id));
        if ((s.type === 'gaze' || s.type === 'aoeCondition') && inMulti) {
          let enabled = this.specialReady(c, s);
          if (t.pool && t.attacksLeft > 0 && !t.pool.includes(s.id)) enabled = false;
          if (!t.pool && t.attacksLeft > 0) enabled = false;
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
        if (ba.weaponOnly && !a.weapon) continue;
        if (ba.offhand && (!a.light || a.kind === 'ranged' || a.slot === t.lastSlot)) continue;
        out.bonus.push({ atk: a, enabled: true });
      }
      if (ba.spiritual) out.bonus.push({ atk: ba.spiritual, enabled: true });
    }
    return out;
  };

  P.specialReady = function (c, s) {
    if (s.recharge && c.recharge && c.recharge[s.rechargeKey || s.id] === false) return false;
    if (c.uses && c.uses[s.id] && c.uses[s.id].used >= c.uses[s.id].max) return false;
    return true;
  };
  P.spendSpecial = function (c, s) {
    if (s.recharge && c.recharge) c.recharge[s.rechargeKey || s.id] = false;
    if (c.uses && c.uses[s.id]) c.uses[s.id].used++;
  };

  P.doAttack = async function (c, atkId, tgt, opts) {
    opts = opts || {};
    const B = this.B;
    const t = B.turn;
    if (!t || t.uid !== c.uid) return { ok: false, reason: 'не ваш ход' };
    let atk = c.attacks.find((a) => a.id === atkId);
    const ctx = {};
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
    } else if (!this.specialReady(c, special)) return { ok: false, reason: 'способность недоступна' };
    if (t.attacksLeft <= 0) {
      if (t.actions <= 0) {
        if (t.flags.hasteAction && atk) {
          t.flags.hasteAction = false;
          t.pool = null;
          t.attacksLeft = 1;
          this.log(this.name(c) + ' использует действие ускорения для атаки.', 'muted');
        } else return { ok: false, reason: 'действие уже использовано' };
      } else {
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
    }
    if (t.pool) {
      const idx = t.pool.indexOf(atkId);
      if (idx < 0) return { ok: false, reason: 'эта атака не входит в мультиатаку' };
      t.pool.splice(idx, 1);
      t.attacksLeft = t.pool.length;
      if (!t.attacksLeft) t.pool = null;
    } else t.attacksLeft--;
    if (special) {
      this.spendSpecial(c, special);
      return this.doSpecialTarget(c, special, tgt);
    }
    t.lastSlot = atk.slot != null ? atk.slot : null;
    t.lastLight = !!atk.light && atk.kind !== 'ranged';
    t.lastUnarmed = !!atk.unarmed || (c.clsId === 'monk' && atk.weapon && !atk.heavy && !atk.twoHanded);
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

  /* Особые действия монстров: взгляд, ужасающая внешность, лечение касанием, цели по выбору */
  P.doSpecialTarget = async function (c, s, tgt) {
    const B = this.B;
    if (s.type === 'gaze') {
      if (!tgt || G.distFt(c, tgt) > s.range || !G.hasLOS(B.map, c, tgt)) {
        this.log(this.name(c) + ': цель вне досягаемости взгляда.', 'muted');
        return { ok: true };
      }
      this.log(this.name(c) + ' использует «' + s.name + '» на ' + this.name(tgt) + '.', 'spell');
      if (s.dropTo0) {
        if (!this.hasCond(tgt, 'frightened')) {
          this.log('Не действует: цель не испугана.', 'muted');
          return { ok: true };
        }
        const sv = await this.save(tgt, s.save, s.dc, { magic: true });
        if (!sv.ok) {
          const amt = tgt.hp + (tgt.tempHp || 0);
          tgt.tempHp = 0;
          await this.applyDamage(tgt, [{ amount: amt, type: 'psychic' }], c, { fromAttack: false, magical: true });
        }
        return { ok: true };
      }
      if (!s.condition) return { ok: true };
      const sv = await this.save(tgt, s.save, s.dc, { cond: s.condition, magic: true });
      if (!sv.ok) {
        const opts = { src: c.uid, expire: { who: c.uid, at: 'end', n: Math.max(2, (s.rounds || 1) + 1) } };
        if (s.repeat) opts.save = { ab: s.save, dc: s.dc, at: 'end' };
        if (this.addCond(tgt, s.condition, opts)) this.log(this.name(tgt) + ': ' + R.CONDITIONS[s.condition].name.toLowerCase() + '!', 'bad');
      }
      return { ok: true };
    }
    if (s.type === 'aoeCondition') {
      this.log(this.name(c) + ' использует «' + s.name + '»!', 'spell');
      B.fpImmune[c.uid] = B.fpImmune[c.uid] || {};
      for (const o of B.combatants) {
        if (o.dead || o.x < 0 || !this.hostile(c, o) || o.hp <= 0) continue;
        if (s.notTypes && s.notTypes.includes(o.type)) continue;
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
    if (s.type === 'healTouch') {
      if (!tgt || G.distFt(c, tgt) > 5) return { ok: false, reason: 'нужен союзник рядом' };
      this.log(this.name(c) + ' использует «' + s.name + '».', 'spell');
      this.heal(tgt, Dice.roll(s.dice || '4d8').total);
      for (const id of ['blinded', 'deafened', 'poisoned']) this.removeCond(tgt, id);
      return { ok: true };
    }
    if (s.type === 'targets') {
      const list = this.B.combatants
        .filter((o) => !o.dead && o.x >= 0 && o.hp > 0 && this.hostile(c, o) && G.distFt(c, o) <= (s.range || 60) && G.hasLOS(B.map, c, o))
        .sort((a, b) => G.distFt(c, a) - G.distFt(c, b));
      const picked = tgt && list.includes(tgt) ? [tgt].concat(list.filter((o) => o !== tgt)) : list;
      this.log('⚡ ' + this.name(c) + ' использует «' + s.name + '»!', 'spell');
      for (const o of picked.slice(0, s.count || 1)) {
        const rolled = (s.dmg || []).map((d) => ({ type: d.type, r: Dice.roll(d.dice) }));
        await this.areaSaveDamage(c, o, s.save, s.dc, rolled, s.half !== false, { magical: true });
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
    if (!this.specialReady(c, s)) return { ok: false, reason: 'не перезаряжено' };
    if (s.area && s.area.origin === 'point' && s.range && aim && G.distToCellFt(c, Math.floor(aim.x), Math.floor(aim.y)) > s.range) return { ok: false, reason: 'слишком далеко (' + s.range + ' фт.)' };
    t.actions--;
    this.spendSpecial(c, s);
    await this.resolveAreaSpecial(c, s, aim);
    return { ok: true };
  };

  P.resolveAreaSpecial = async function (c, s, aim) {
    const cells = G.areaCells(this.B.map, s.area, c, aim);
    await this.h.flashCells(cells, s.dmg && s.dmg[0] ? R.DAMAGE_COLORS[s.dmg[0].type] : '#c9a0ff');
    this.log('🔥 ' + this.name(c) + ' использует «' + s.name + '»!', 'spell');
    const targets = G.creaturesInCells(this.B, cells).filter((o) => o.uid !== c.uid && !(s.notTypes && s.notTypes.includes(o.type)));
    const rolled = (s.dmg || []).map((dm) => ({ type: dm.type, r: Dice.roll(dm.dice) }));
    if (rolled.length) this.log('Урон: ' + rolled.map((x) => x.r.total + ' ' + R.DAMAGE_SHORT[x.type] + ' ' + Dice.fmtRolls(x.r)).join(' + '), 'dmgroll');
    for (const o of targets) {
      if (o.dead) continue;
      let sv;
      if (rolled.length) sv = await this.areaSaveDamage(c, o, s.save, s.dc, rolled, s.half !== false, { magical: true });
      else sv = await this.save(o, s.save, s.dc, { cond: s.condition, magic: true });
      if (sv && !sv.ok && !o.dead) {
        if (s.condition) {
          const opts = { src: c.uid, tag: s.tag, expire: { who: o.uid, at: 'end', n: s.rounds || 1 } };
          if (s.repeat) opts.save = { ab: s.save, dc: s.dc, at: 'end' };
          if (this.addCond(o, s.condition, opts)) this.log(this.name(o) + ': ' + R.CONDITIONS[s.condition].name.toLowerCase() + '!', 'bad');
        }
        if (s.push) this.push(c, o, s.push);
      }
    }
    this.h.changed();
  };

  /* Монстр использует особую способность сам (легендарные действия, «Цели по выбору») */
  P.useMonsterSpecialAuto = async function (c, s) {
    if (s.type === 'targets') return this.doSpecialTarget(c, s, null);
    if (s.type === 'area') {
      const best = D.AI ? D.AI.bestAim(this, c, s.area, c, (s.dmg || []).reduce((a, d) => a + Dice.average(d.dice), 0) || 10, s.save, s.dc, s.dmg && s.dmg[0] ? s.dmg[0].type : null) : null;
      if (best && best.aim) return this.resolveAreaSpecial(c, s, best.aim);
    }
    if (s.type === 'aoeCondition') return this.doSpecialTarget(c, s, null);
    return null;
  };

  /* Телепортация монстра (действие или легендарное) */
  P.monsterTeleport = async function (c, s, point) {
    const px = Math.floor(point.x);
    const py = Math.floor(point.y);
    if (G.distToCellFt(c, px, py) > (s.range || 30)) return { ok: false, reason: 'слишком далеко' };
    if (!G.canStand(this.B, c, px, py, { fly: true }) || !G.canEndAt(this.B, c, px, py)) return { ok: false, reason: 'место занято' };
    c.x = px;
    c.y = py;
    this.log('✨ ' + this.name(c) + ' телепортируется.', 'spell');
    this.h.changed();
    return { ok: true };
  };

  P.areaSaveDamage = async function (src, o, ab, dc, rolled, half, opts) {
    if (o.dead || o.banished) return null;
    const sv = await this.save(o, ab, dc, { magic: !!opts.spell, poison: rolled.some((x) => x.type === 'poison') });
    let mult;
    if (ab === 'dex' && o.flags && o.flags.evasion && half && !this.incap(o)) mult = sv.ok ? 0 : 0.5;
    else mult = sv.ok ? (half ? 0.5 : opts.potent ? 0.5 : 0) : 1;
    const parts = rolled.map((x) => ({ amount: Math.floor((x.r.total + (x.bonus || 0)) * mult), type: x.type }));
    if (parts.some((p) => p.amount > 0)) await this.applyDamage(o, parts, src, Object.assign({ fromAttack: false }, opts));
    else this.log(this.name(o) + ' не получает урона.', 'muted');
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
    if (opts.free) return null;
    if (c.beast && !(c.flags && c.flags.beastSpells)) return 'в зверином облике нельзя колдовать';
    if (!(c.spells || []).includes(spell.id)) return 'заклинание не известно';
    const sc = c.spellcasting || {};
    const innate = sc.innate && sc.innate[spell.id] != null;
    if (innate && (slotLevel === 'innate' || !slotLevel || !sc.slots[slotLevel] || sc.slots[slotLevel].used >= sc.slots[slotLevel].max)) {
      const times = sc.innate[spell.id];
      const used = (sc.innateUsed || {})[spell.id] || 0;
      if (times > 0 && used >= times) return 'использования исчерпаны';
    } else if (spell.level > 0) {
      const s = sc.slots && sc.slots[slotLevel];
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

  /* Нужна ли ячейка: врождённые заклинания и арканум — без ячеек */
  P.usesInnate = function (c, spell, slotLevel) {
    const sc = c.spellcasting || {};
    if (!sc.innate || sc.innate[spell.id] == null) return false;
    if (slotLevel === 'innate') return true;
    if (spell.level === 0) return true;
    const s = sc.slots && sc.slots[slotLevel];
    return !s || s.used >= s.max;
  };

  /* targeting: {targets: [uid...], point: {x,y}} */
  P.castSpell = async function (c, spellId, slotLevel, targeting, opts) {
    opts = opts || {};
    const spell = D.spell(spellId);
    if (!spell) return { ok: false, reason: 'нет заклинания' };
    const innate = !opts.free && this.usesInnate(c, spell, slotLevel);
    if (spell.level === 0) slotLevel = 0;
    else if (innate || slotLevel === 'innate' || !slotLevel) slotLevel = innate ? Math.max(spell.level, (c.spellcasting && c.spellcasting.innateLevel) || 0) : slotLevel || spell.level;
    if (opts.free) slotLevel = opts.slotLevel || spell.level;
    const err = this.castCheck(c, spell, innate ? 'innate' : slotLevel, opts);
    if (err) return { ok: false, reason: err };
    const t = this.B.turn;
    const sc = Object.assign({ dc: 10, toHit: 2, mod: 0 }, c.spellcasting || {});
    if (opts.dc) sc.dc = opts.dc;
    targeting = targeting || {};
    const tgts = (targeting.targets || []).map((u) => this.get(u)).filter(Boolean);

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
    let cast = opts.castAs || spell.cast;
    if (opts.quicken && cast === 'action') {
      cast = 'bonus';
      c.res.sorcery.used += 2;
      this.log(this.name(c) + ' ускоряет заклинание (2 очка чародейства).', 'spell');
    }
    if (cast === 'action') {
      t.actions--;
      t.flags.castAction = true;
      if (spell.level === 0) t.flags.castCantrip = true;
    } else if (cast === 'bonus') {
      t.bonus = false;
      t.bonusSpell = true;
    }
    if (cast === 'action' && spell.level > 0) t.leveledSpell = true;
    if (innate) {
      const isc = c.spellcasting;
      isc.innateUsed = isc.innateUsed || {};
      isc.innateUsed[spell.id] = (isc.innateUsed[spell.id] || 0) + 1;
    } else if (spell.level > 0 && !opts.free) this.useSlot(c, slotLevel);
    let conc = null;
    if (spell.concentration) conc = this.startConcentration(c, spell, spell.rounds);
    if (this.removeCond(c, 'invisible', (x) => x.tag === 'invis')) this.log(this.name(c) + ' становится видимым.', 'muted');

    this.log('✨ ' + this.name(c) + ' накладывает <i>' + spell.name + '</i>' + (spell.level > 0 ? (innate ? ' (без ячейки)' : opts.free ? '' : ' (ячейка ' + slotLevel + ' ур.)') : '') + '.', 'spell');
    const extraLv = Math.max(0, slotLevel - spell.level);
    const f = c.flags || {};
    let bonusOnce = 0;
    if (f.empoweredEvocation && spell.school === 'evocation') bonusOnce += c.mods.int;
    const anc = c.ancestry;
    if (f.elementalAffinity && spell.damage && spell.damage.some((d) => d.type === ((anc && anc.type) || 'fire'))) bonusOnce += c.mods.cha;
    if (f.potentSpellcasting && spell.level === 0 && spell.damage) bonusOnce += c.mods.wis;
    // Максимальный урон: Перегрузка (волшебник) и Разрушительный гнев (жрец бури)
    let maximize = false;
    if (spell.damage && spell.level >= 1 && spell.level <= 5 && c.res && c.res.overchannel && c.res.overchannel.used < 1) {
      const use = await this.askReactor(c, c.name + ': Перегрузка — максимальный урон от «' + spell.name + '»?', [{ label: 'Перегрузка', value: true }, { label: 'Нет', value: false }], spell.level >= 3);
      if (use) {
        c.res.overchannel.used++;
        maximize = true;
      }
    }
    if (!maximize && spell.damage && f.destructiveWrath && spell.damage.some((d) => d.type === 'lightning' || d.type === 'thunder') && c.res.channel && c.res.channel.used < c.res.channel.max) {
      const use = await this.askReactor(c, c.name + ': Разрушительный гнев — максимальный урон (Божественный канал)?', [{ label: 'Да', value: true }, { label: 'Нет', value: false }], spell.level >= 3);
      if (use) {
        c.res.channel.used++;
        maximize = true;
      }
    }
    let empower = false;
    if (spell.damage && f.empoweredSpell && c.res.sorcery && c.res.sorcery.used < c.res.sorcery.max && !opts.free) {
      empower = await this.askReactor(c, c.name + ': Усиленное заклинание (1 очко чародейства, переброс слабых костей)?', [{ label: 'Усилить', value: true }, { label: 'Нет', value: false }], spell.level >= 3);
      if (empower) c.res.sorcery.used++;
    }
    const rollD = (dice) => {
      if (maximize) {
        const v = Dice.max(dice);
        return { total: v, rolls: [{ value: v, sign: 1 }], bonus: 0, formula: dice, max: true };
      }
      const r = Dice.roll(dice);
      if (empower) {
        const r2 = Dice.roll(dice);
        return r2.total > r.total ? r2 : r;
      }
      return r;
    };
    const dmgOpts = { magical: true, spell: true, spellLevel: spell.level > 0 ? slotLevel : 0, school: spell.school };
    let dmgType = null;
    if (spell.randomType) dmgType = spell.randomType[Math.floor(Math.random() * spell.randomType.length)];
    const typeOf = (dm) => (dmgType && dm === spell.damage[0] ? dmgType : dm.type);

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
            const dice = this.spellDice(c, spell, slotLevel, dm.dice, di > 0);
            let bonus = 0;
            if (spell.id === 'eldritchblast' && f.agonizingBlast) bonus += c.mods.cha;
            if (dm.addMod) bonus += sc.mod;
            if (i === 0 && bonusOnce) bonus += bonusOnce;
            const d = maximize ? String(Dice.max(dice)) : dice;
            return { dice: d + (bonus ? (bonus > 0 ? '+' : '') + bonus : ''), type: typeOf(dm) };
          });
          const atk = {
            id: 'spell_' + spell.id, name: spell.name + (n > 1 ? ' #' + (i + 1) : ''), kind: spell.attack === 'ranged' ? 'ranged' : 'melee',
            toHit: sc.toHit, reach: spell.attack === 'melee' ? Math.max(5, spell.range) : 5, range: [spell.range, spell.range],
            dmg, isSpell: true, magical: true, spellId: spell.id, proxyMelee: spell.summon === 'spiritualWeapon',
          };
          const res = await this.attack(c, atk, tgt, { spellLevel: dmgOpts.spellLevel, school: spell.school });
          if (res.hit && spell.onHit) await this.spellOnHit(c, spell, tgt, conc, res);
          if (res.hit && !tgt.dead && spell.id === 'eldritchblast' && f.repellingBlast && R.SIZES[tgt.size].order <= R.SIZES.large.order) this.push(c, tgt, 10);
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
          const r = rollD(spell.damage[0].dice);
          const amt = r.total + (i === 0 ? bonusOnce : 0);
          this.log('Дротик ' + (i + 1) + ' → ' + this.name(tgt) + ': ' + amt + ' ' + R.DAMAGE_SHORT[spell.damage[0].type], 'dmgroll');
          await this.applyDamage(tgt, [{ amount: amt, type: spell.damage[0].type }], c, dmgOpts);
        }
        break;
      }
      case 'save': {
        let victims;
        if (spell.target === 'area') {
          const cells = G.areaCells(this.B.map, spell.area, c, targeting.point || { x: c.x + 2, y: c.y });
          await this.h.flashCells(cells, R.DAMAGE_COLORS[typeOf(spell.damage[0])]);
          victims = G.creaturesInCells(this.B, cells).filter((o) => o.uid !== c.uid || spell.area.origin === 'point');
          if (spell.hostileOnly) victims = victims.filter((o) => this.hostile(c, o));
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
        } else {
          const count = (spell.count || 1) + (spell.upcast && spell.upcast.targets ? extraLv : 0);
          victims = tgts.slice(0, count);
        }
        const rolled = spell.damage.map((dm, i) => ({ type: typeOf(dm), r: rollD(this.spellDice(c, spell, slotLevel, dm.dice, i > 0)), bonus: i === 0 ? bonusOnce : 0 }));
        if (dmgType) this.log('Вид урона: ' + R.DAMAGE_TYPES[dmgType] + '.', 'spell');
        this.log('Урон: ' + rolled.map((x) => x.r.total + (x.bonus || 0) + ' ' + R.DAMAGE_SHORT[x.type] + ' ' + Dice.fmtRolls(x.r)).join(' + '), 'dmgroll');
        for (const o of victims) {
          if (o.dead) continue;
          if (spell.id === 'blight' && ['undead', 'construct'].includes(o.type)) {
            this.log('Усыхание не действует на ' + this.name(o) + '.', 'muted');
            continue;
          }
          const sv = await this.areaSaveDamage(c, o, spell.save, sc.dc, rolled, !!spell.half, Object.assign({ potent: spell.level === 0 && f.potentCantrip, noKill: !!spell.noKill, disintegrate: !!spell.disintegrate }, dmgOpts));
          if (sv && !sv.ok && !o.dead && spell.onFail) await this.spellOnFail(c, spell, o, conc);
        }
        break;
      }
      case 'heal': {
        const count = spell.count || 1;
        let pool = spell.healPool || 0;
        const list = tgts.slice(0, count);
        for (const o of list) {
          let amt;
          if (spell.healFull) amt = o.maxHp;
          else if (spell.healPool) {
            amt = Math.min(pool, o.maxHp - o.hp);
            pool -= amt;
          } else if (spell.healFlat) amt = spell.healFlat + (spell.upcastFlat || 0) * extraLv;
          else {
            const dice = this.spellDice(c, spell, slotLevel, spell.heal);
            amt = (f.supremeHealing ? Dice.max(dice) : Dice.roll(dice).total) + (spell.noMod ? 0 : sc.mod);
          }
          if (f.discipleOfLife && spell.level > 0) amt += 2 + slotLevel;
          await this.h.flashCells([[o.x, o.y]], '#7cfc7c');
          this.heal(o, Math.max(0, amt), c);
          for (const id of spell.removes || []) if (this.removeCond(o, id)) this.log(this.name(o) + ': «' + R.CONDITIONS[id].name + '» снято.', 'good');
        }
        if (f.blessedHealer && spell.level > 0 && list.some((o) => o !== c)) {
          this.log(this.name(c) + ' — Благословенный целитель.', 'good');
          this.heal(c, 2 + slotLevel);
        }
        break;
      }
      case 'buff': {
        const count = (spell.count || 1) + (spell.upcast && spell.upcast.targets ? extraLv : 0);
        const list = spell.target === 'self' ? [c] : tgts.slice(0, count);
        for (const o of list) {
          const expire = { who: c.uid, at: 'start', n: spell.rounds || 10 };
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
          if (spell.effect === 'falseLife') {
            const v = Dice.roll('1d4+4').total + 5 * extraLv;
            if (v > o.tempHp) o.tempHp = v;
            this.log(this.name(o) + ' получает ' + v + ' временных хитов.', 'good');
            continue;
          }
          if (spell.effect === 'invisibility' || spell.effect === 'greaterInvisibility') {
            if (this.addCond(o, 'invisible', { src: c.uid, conc, tag: spell.effect === 'invisibility' ? 'invis' : 'greater', expire })) this.log(this.name(o) + ' становится невидимым.', 'good');
            continue;
          }
          const eff = { id: spell.effect, src: c.uid, conc, expire };
          if (spell.effect === 'heroism') eff.value = Math.max(1, sc.mod);
          this.addEff(o, eff);
          if (spell.effect === 'heroism') this.removeCond(o, 'frightened');
          this.log(this.name(o) + ': ' + (R.EFFECTS[spell.effect] || { name: spell.name }).name + '.', 'good');
        }
        break;
      }
      case 'control': {
        let victims;
        if (spell.target === 'area') {
          const cells = G.areaCells(this.B.map, spell.area, c, targeting.point || { x: c.x + 2, y: c.y });
          await this.h.flashCells(cells, '#c9a0ff');
          victims = G.creaturesInCells(this.B, cells).filter((o) => o.uid !== c.uid && ((spell.id !== 'fear' && !spell.hostileOnly) || this.hostile(c, o)));
        } else {
          const count = (spell.count || 1) + (spell.upcast && spell.upcast.targets ? extraLv : 0);
          victims = tgts.slice(0, count);
        }
        for (const o of victims) {
          if (o.dead) continue;
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
            const expire = { who: c.uid, at: 'start', n: spell.rounds || 10 };
            if (spell.effect) {
              const eff = { id: spell.effect, src: c.uid, conc, expire };
              if (spell.repeatSave) eff.save = { ab: spell.save, dc: sc.dc, at: 'end' };
              this.addEff(o, eff);
              if (spell.effect === 'slowSpell') this.addEff(o, { id: 'noReactions', src: c.uid, conc, expire, silent: true });
              this.log(this.name(o) + ': ' + (R.EFFECTS[spell.effect] || { name: spell.name }).name.toLowerCase() + '!', 'bad');
            }
            if (spell.condition) {
              const cond = { src: c.uid, conc, expire };
              if (spell.repeatSave) cond.save = { ab: spell.save, dc: sc.dc, at: 'end' };
              if (spell.escape) cond.escape = { dc: sc.dc, ab: spell.escape };
              if (this.addCond(o, spell.condition, cond)) this.log(this.name(o) + ': ' + R.CONDITIONS[spell.condition].name.toLowerCase() + '!', 'bad');
            }
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
          this.log(this.name(c) + ' исчезает и появляется в другом месте.', 'spell');
          await this.hazardAt(c, 'enter');
        }
        break;
      }
      case 'cleanse': {
        for (const o of tgts) {
          for (const id of spell.removes) if (this.removeCond(o, id)) this.log(this.name(o) + ': «' + R.CONDITIONS[id].name + '» снято.', 'good');
          if (spell.id === 'greaterrestoration') {
            o.effects = o.effects.filter((e) => !['hex', 'slowSpell', 'faerieFire'].includes(e.id) || !this.hostile(this.get(e.src) || o, o));
          }
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
      case 'dispel': {
        for (const o of tgts) {
          const before = o.effects.length + o.conditions.length;
          o.effects = o.effects.filter((e) => !(e.conc || ['bless', 'hex', 'hunterMark', 'faerieFire', 'slowSpell', 'haste', 'heroism', 'shieldOfFaith', 'mageArmor', 'barkskin', 'stoneskin', 'magicWeapon', 'divineFavor'].includes(e.id)));
          o.conditions = o.conditions.filter((x) => !x.conc);
          if (o.concentration) this.endConcentration(o, 'рассеивание магии');
          for (const other of this.B.combatants) {
            if (other.banished && other.banished.src === o.uid && !other.banished.hurl) this.unbanish(other);
          }
          const removed = before - (o.effects.length + o.conditions.length);
          this.log(removed ? 'Магические эффекты на ' + this.name(o) + ' рассеяны.' : 'На ' + this.name(o) + ' нет магии для рассеивания.', removed ? 'good' : 'muted');
        }
        break;
      }
      case 'banish': {
        const o = tgts[0];
        if (o && !o.dead) {
          const sv = await this.save(o, spell.save || 'cha', sc.dc, { magic: true });
          if (!sv.ok) {
            o.banished = { x: o.x, y: o.y, conc, src: c.uid };
            o.x = -1;
            o.y = -1;
            if (o.concentration) this.endConcentration(o, 'изгнан');
            this.log('🌀 ' + this.name(o) + ' изгнан на другой план!', 'spell');
          } else if (conc) this.endConcentration(c, 'цель устояла');
        }
        break;
      }
      case 'kill': {
        const o = tgts[0];
        if (o && !o.dead) {
          if (o.hp <= (spell.threshold || 100)) {
            o.hp = 0;
            if (o.beast) this.revertWildShape(o, true);
            this.kill(o, spell.name);
          } else this.log('У ' + this.name(o) + ' слишком много хитов — заклинание не действует.', 'muted');
        }
        break;
      }
      case 'pwstun': {
        const o = tgts[0];
        if (o && !o.dead) {
          if (o.hp <= (spell.threshold || 150)) {
            if (this.addCond(o, 'stunned', { src: c.uid, save: { ab: 'con', dc: sc.dc, at: 'end' }, expire: { who: o.uid, at: 'end', n: 100 } })) this.log(this.name(o) + ' ошеломлён!', 'bad');
          } else this.log('У ' + this.name(o) + ' слишком много хитов — заклинание не действует.', 'muted');
        }
        break;
      }
      default:
        break;
    }
    // Магия хаоса: дикая магия
    if (f.wildSurge && spell.level > 0 && !c.dead) await this.wildSurge(c);
    // Ограждающая защита восстанавливается от заклинаний ограждения
    if (c.ward && spell.school === 'abjuration' && spell.level > 0) {
      const add = Math.min(c.ward.max - c.ward.hp, 2 * slotLevel);
      if (add > 0) {
        c.ward.hp += add;
        this.log(this.name(c) + ': магическая защита +' + add + ' (' + c.ward.hp + '/' + c.ward.max + ').', 'good');
      }
    }
    this.h.changed();
    await this.processBursts();
    await this.checkEnd();
    return { ok: true };
  };

  P.wildSurge = async function (c) {
    const r = Dice.die(20);
    if (r > 1 && !this.hasEff(c, 'tidesUsed')) return;
    if (this.hasEff(c, 'tidesUsed')) this.removeEff(c, 'tidesUsed');
    const roll = Dice.die(6);
    this.log('🌀 <b>Волна дикой магии!</b>', 'warn');
    if (roll === 1) {
      const cells = G.areaCells(this.B.map, { shape: 'aura', size: 30 }, c, null);
      await this.h.flashCells(cells, '#ff8a3d');
      const fr = Dice.roll('5d6');
      for (const o of G.creaturesInCells(this.B, cells)) await this.areaSaveDamage(c, o, 'dex', c.spellcasting.dc, [{ type: 'fire', r: fr }], true, { magical: true });
    } else if (roll === 2) {
      this.addCond(c, 'invisible', { src: c.uid, tag: 'invis', expire: { who: c.uid, at: 'start', n: 10 } });
      this.log(this.name(c) + ' становится невидимым.', 'spell');
    } else if (roll === 3) {
      this.heal(c, Dice.roll('2d10').total);
    } else if (roll === 4) {
      this.addEff(c, { id: 'shimmerShield', src: c.uid, value: 2, expire: { who: c.uid, at: 'start', n: 10 } });
      this.log(this.name(c) + ' окружён мерцающим щитом (+2 КД).', 'spell');
    } else if (roll === 5) {
      this.log(this.name(c) + ' теряет 1d6 хитов от отдачи.', 'bad');
      await this.applyDamage(c, [{ amount: Dice.die(6), type: 'force' }], null, { fromAttack: false, magical: true });
    } else {
      if (c.res.sorcery) c.res.sorcery.used = Math.max(0, c.res.sorcery.used - 2);
      this.log(this.name(c) + ' восстанавливает 2 очка чародейства.', 'spell');
    }
  };

  P.spellOnHit = async function (c, spell, tgt, conc, res) {
    const oh = spell.onHit;
    if (oh.drain && res && res.dealt > 0) this.heal(c, Math.floor(res.dealt * oh.drain));
    if (tgt.dead) return;
    if (oh.effect) {
      let expire;
      if (oh.duration === 'casterNextStart') expire = { who: c.uid, at: 'start', n: 1 };
      else if (oh.duration === 'casterNextEnd') expire = { who: c.uid, at: 'end', n: 2 };
      else if (oh.duration === 'targetNextStart') expire = { who: tgt.uid, at: 'start', n: 1 };
      else expire = { who: tgt.uid, at: 'end', n: 1 };
      this.addEff(tgt, { id: oh.effect, src: c.uid, expire });
    }
    if (oh.dot) {
      this.addEff(tgt, { id: 'acidArrow', src: c.uid, dot: oh.dot, dotOnce: true, unique: false, expire: { who: tgt.uid, at: 'end', n: 2 }, silent: true });
    }
    if (oh.save && oh.condition) {
      const sv = await this.save(tgt, oh.save, c.spellcasting.dc, { magic: true, cond: oh.condition, poison: oh.condition === 'poisoned' });
      if (!sv.ok && this.addCond(tgt, oh.condition, { src: c.uid, expire: { who: c.uid, at: 'end', n: 2 } })) this.log(this.name(tgt) + ': ' + R.CONDITIONS[oh.condition].name.toLowerCase() + '!', 'bad');
    }
    if (oh.pull && R.SIZES[tgt.size].order <= R.SIZES.large.order) this.pull(c, tgt, oh.pull);
  };

  P.spellOnFail = async function (c, spell, tgt, conc) {
    const of = spell.onFail;
    if (of.push) this.push(c, tgt, of.push);
    if (of.prone && this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног!', 'bad');
    if (of.effectCond) {
      const n = of.rounds || 2;
      if (this.addCond(tgt, of.effectCond, { src: c.uid, conc, expire: { who: of.rounds ? tgt.uid : c.uid, at: 'end', n } })) this.log(this.name(tgt) + ': ' + R.CONDITIONS[of.effectCond].name.toLowerCase() + '!', 'bad');
    }
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
    const cf = c.flags || {};
    for (let i = 1; i < path.length; i++) {
      if (c.dead || c.hp <= 0 || B.phase !== 'combat') break;
      const step = path[i];
      const costCells = G.stepCost(B, c, step.x, step.y, { fly, crawl });
      if (!opts.free && t.move < costCells * 5) break;
      // Атаки по возможности
      if (!t.disengaged && !opts.noOA && !(cf.flyby && fly)) {
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
              const ctx = { opportunity: true };
              if (cf.escapeTheHorde || (cf.totem === 'eagle' && this.hasEff(c, 'rage'))) this.addEff(h, { id: 'oaDis', src: c.uid, expire: { who: h.uid, at: 'end', n: 1 }, silent: true });
              await this.attack(h, atk, c, ctx);
              this.removeEff(h, 'oaDis');
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
    const left = (r, n) => r && r.max - r.used >= (n || 1);
    const add = (id, name, cost, enabled, extra) => out.push(Object.assign({ id, name, cost, enabled: !!enabled }, extra || {}));
    const hasAction = t.actions > 0;
    const hasBonus = t.bonus;
    const raging = this.hasEff(c, 'rage');
    const lv = c.level || 1;
    // Монстры: особые действия
    if (c.kind !== 'pc' || c.beast) {
      for (const s of c.specials || []) {
        const inMulti = c.multiattack && c.multiattack.some((o) => o.includes(s.id));
        const ready = hasAction && this.specialReady(c, s);
        const usesTxt = c.uses && c.uses[s.id] ? ' (' + (c.uses[s.id].max - c.uses[s.id].used) + '/' + c.uses[s.id].max + ')' : s.recharge ? ' (перезарядка ' + s.recharge + '–6)' : '';
        if (s.type === 'teleport' && (s.range || 0) <= 500) add('sp:' + s.id, s.name + usesTxt, 'action', ready, { target: 'point', range: s.range || 30 });
        else if (s.type === 'healTouch') add('sp:' + s.id, s.name + usesTxt, 'action', ready, { target: 'ally', range: 5 });
        else if (s.type === 'targets') add('sp:' + s.id, s.name + usesTxt, 'action', ready, { target: 'self' });
        else if (s.type === 'gaze' && !inMulti) add('sp:' + s.id, s.name + usesTxt, 'action', ready, { target: 'enemy', range: s.range });
        else if (s.type === 'aoeCondition' && !inMulti) add('sp:' + s.id, s.name + usesTxt, 'action', ready, { target: 'self' });
      }
    }
    if (c.beast) {
      add('revertShape', 'Вернуть облик', 'bonus', hasBonus, { target: 'self' });
      if (f.combatWildShape && c.spellcasting && this.anySlot(c)) add('moonHeal', 'Лечение в облике (ячейка)', 'bonus', hasBonus, { target: 'self' });
    }
    if (f.secondWind) add('secondWind', 'Второе дыхание (1d10+' + lv + ')', 'bonus', hasBonus && left(res.secondWind), { target: 'self' });
    if (f.actionSurge) add('actionSurge', 'Всплеск действий', 'free', left(res.actionSurge), { target: 'self' });
    if (f.rage) {
      if (raging) add('endRage', 'Прекратить ярость', 'free', true, { target: 'self' });
      else add('rage', 'Ярость' + (res.rage && res.rage.max < 99 ? ' (' + (res.rage.max - res.rage.used) + ')' : ''), 'bonus', hasBonus && left(res.rage) && c.armorCat !== 'heavy', { target: 'self' });
    }
    if (f.recklessAttack && !t.attacked && !this.hasEff(c, 'recklessAtk')) add('reckless', 'Безрассудная атака', 'free', true, { target: 'self' });
    if (f.frenzy && raging) add('frenzy', 'Бешенство: атака', 'bonus', hasBonus, { target: 'self' });
    if (f.intimidatingPresence) add('intimidate', 'Пугающее присутствие', 'action', hasAction, { target: 'enemy', range: 30 });
    if (f.totem === 'eagle' && raging) add('eagleDash', 'Дух орла: Рывок', 'bonus', hasBonus, { target: 'self' });
    // Атака второй рукой
    if (t.attackActionUsed && t.lastLight && hasBonus) {
      const other = c.attacks.some((a) => a.light && a.kind !== 'ranged' && a.slot !== t.lastSlot && a.slot != null);
      if (other) add('offhand', 'Атака второй рукой', 'bonus', true, { target: 'self' });
    }
    if (f.martialArts && !c.beast) add('martialArts', 'Боевые искусства: удар', 'bonus', hasBonus && t.attackActionUsed && t.lastUnarmed, { target: 'self' });
    if (f.ki && !c.beast) {
      add('flurry', 'Шквал ударов (1 ци)', 'bonus', hasBonus && t.attackActionUsed && left(res.ki), { target: 'self' });
      add('patientDefense', 'Терпеливая оборона (1 ци)', 'bonus', hasBonus && left(res.ki), { target: 'self' });
      add('stepDash', 'Поступь ветра: Рывок (1 ци)', 'bonus', hasBonus && left(res.ki), { target: 'self' });
    }
    if (f.stillnessOfMind && (this.hasCond(c, 'charmed') || this.hasCond(c, 'frightened'))) add('stillness', 'Спокойствие разума', 'action', hasAction, { target: 'self' });
    if (f.wholenessOfBody) add('wholeness', 'Целостность тела (' + 3 * lv + ')', 'action', hasAction && left(res.wholeness), { target: 'self' });
    if (f.quiveringPalm && this.B.combatants.some((o) => o.quivering === c.uid && !o.dead)) add('quiver', 'Дрожащая ладонь: остановить сердце', 'action', hasAction, { target: 'enemy', range: 9999, filter: 'quivering' });
    if (f.shadowStep) add('shadowStep', 'Шаг тени (60 фт.)', 'bonus', hasBonus, { target: 'point', range: 60 });
    if (f.cloakOfShadows) add('cloak', 'Плащ теней', 'action', hasAction && !this.hasCond(c, 'invisible'), { target: 'self' });
    if (f.elementalDisciplines) {
      add('fistAir', 'Кулак воздуха (2 ци)', 'action', hasAction && left(res.ki, 2), { target: 'enemy', range: 30 });
      add('waterWhip', 'Водяной кнут (2 ци)', 'action', hasAction && left(res.ki, 2), { target: 'enemy', range: 30 });
      add('cinder', 'Взмах пепла (2 ци)', 'action', hasAction && left(res.ki, 2), { target: 'area', area: { shape: 'cone', size: 15 }, color: R.DAMAGE_COLORS.fire });
      if (lv >= 11) add('phoenix', 'Пламя феникса (4 ци)', 'action', hasAction && left(res.ki, 4), { target: 'area', area: { shape: 'sphere', size: 20, origin: 'point' }, range: 150, color: R.DAMAGE_COLORS.fire });
      if (lv >= 17) add('winter', 'Дыхание зимы (6 ци)', 'action', hasAction && left(res.ki, 6), { target: 'area', area: { shape: 'cone', size: 60 }, color: R.DAMAGE_COLORS.cold });
    }
    if (f.cunningAction) {
      add('cunningDash', 'Хитрое действие: Рывок', 'bonus', hasBonus, { target: 'self' });
      add('cunningDisengage', 'Хитрое действие: Отход', 'bonus', hasBonus, { target: 'self' });
    }
    if (f.fastHands && c.potions > 0) add('fastPotion', 'Быстрые руки: зелье', 'bonus', hasBonus, { target: 'self' });
    if (f.nimbleEscape) add('cunningDisengage', 'Шустрый побег: Отход', 'bonus', hasBonus, { target: 'self' });
    if (f.aggressive) add('aggressive', 'Агрессивный: перемещение', 'bonus', hasBonus, { target: 'self' });
    if (f.rampage && t.rampage) add('rampage', 'Неистовство: укус', 'bonus', hasBonus, { target: 'self' });
    if (f.layOnHands) add('layOnHands', 'Наложение рук (' + (res.layOnHands.max - res.layOnHands.used) + ')', 'action', hasAction && left(res.layOnHands), { target: 'ally', range: 5 });
    if (f.bardicInspiration) add('inspiration', 'Вдохновение барда (d' + f.inspirationDie + ')', 'bonus', hasBonus && left(res.inspiration), { target: 'allyOther', range: 60 });
    if (f.channelDivinity && c.clsId === 'cleric') {
      add('turnUndead', 'Изгнание нежити', 'action', hasAction && left(res.channel), { target: 'self' });
      if (f.preserveLife) add('preserveLife', 'Сохранение жизни (' + 5 * lv + ')', 'action', hasAction && left(res.channel), { target: 'self' });
      if (f.radianceOfDawn) add('radiance', 'Сияние рассвета', 'action', hasAction && left(res.channel), { target: 'self' });
    }
    if (f.warPriest && t.attackActionUsed) add('warPriest', 'Военный жрец: атака (' + (res.warPriest.max - res.warPriest.used) + ')', 'bonus', hasBonus && left(res.warPriest), { target: 'self' });
    if (f.battleMagic && t.flags.castAction) add('bonusWeapon', 'Боевая магия: атака', 'bonus', hasBonus, { target: 'self' });
    if (f.warMagic && (t.flags.castCantrip || (f.improvedWarMagic && t.flags.castAction))) add('bonusWeapon', 'Боевая магия: атака', 'bonus', hasBonus, { target: 'self' });
    if (f.sacredWeapon) add('sacredWeapon', 'Священное оружие', 'action', hasAction && left(res.channel) && !this.hasEff(c, 'sacredWeapon'), { target: 'self' });
    if (f.naturesWrath) add('naturesWrath', 'Гнев природы', 'action', hasAction && left(res.channel), { target: 'enemy', range: 10 });
    if (f.vowOfEnmity) add('vow', 'Клятва вражды', 'bonus', hasBonus && left(res.channel), { target: 'enemy', range: 10 });
    if (f.holyNimbus) add('holyNimbus', 'Святой нимб', 'action', hasAction && left(res.holyNimbus) && !this.hasEff(c, 'holyNimbus'), { target: 'self' });
    if (f.wildShape && !c.beast) {
      const cost = f.combatWildShape ? 'bonus' : 'action';
      add('wildShape', 'Дикий облик' + (res.wildShape && res.wildShape.max < 99 ? ' (' + (res.wildShape.max - res.wildShape.used) + ')' : ''), cost, (cost === 'bonus' ? hasBonus : hasAction) && left(res.wildShape), { target: 'self' });
      if (f.elementalWildShape) add('elementalShape', 'Облик элементаля (2 использования)', cost, (cost === 'bonus' ? hasBonus : hasAction) && left(res.wildShape, 2), { target: 'self' });
    }
    if (f.whirlwindAttack) add('whirlwind', 'Вихревая атака', 'action', hasAction, { target: 'self' });
    if (f.feyPresence) add('feyPresence', 'Присутствие феи', 'action', hasAction && left(res.feyPresence), { target: 'self' });
    if (f.tidesOfChaos) add('tides', 'Поток хаоса (преимущество)', 'free', left(res.tides) && !this.hasEff(c, 'tides'), { target: 'self' });
    if (f.breathWeapon && c.ancestry && !c.beast) add('dragonBreath', 'Оружие дыхания (' + R.DAMAGE_SHORT[c.ancestry.type] + ')', 'action', hasAction && left(res.breath), { target: 'area', area: c.ancestry.shape === 'line' ? { shape: 'line', size: 30 } : { shape: 'cone', size: 15 }, color: R.DAMAGE_COLORS[c.ancestry.type] });
    if (t.flags.hasteAction && t.actions <= 0) {
      add('hasteDash', 'Ускорение: Рывок', 'free', true, { target: 'self' });
      add('hasteDisengage', 'Ускорение: Отход', 'free', true, { target: 'self' });
    }
    const sw = this.getEff(c, 'spiritualWeapon');
    if (sw) add('spiritualWeapon', 'Божественное оружие: атака', 'bonus', hasBonus && !t.bonusSpell, { target: 'self' });
    return out;
  };

  /* ---------- Дикий облик друида ---------- */
  P.wildShapeForms = function (c, elemental) {
    if (elemental) return ['air-elemental', 'earth-elemental', 'fire-elemental', 'water-elemental'].map((id) => D.monster(id)).filter(Boolean);
    const lv = c.level || 1;
    const moon = !!(c.flags && c.flags.circleForms);
    const maxCR = moon ? (lv >= 6 ? Math.floor(lv / 3) : 1) : lv >= 8 ? 1 : lv >= 4 ? 0.5 : 0.25;
    const list = (D.MONSTERS || []).filter((m) => m.type === 'beast' && !m.swarm && R.crValue(m.cr) <= maxCR && (lv >= 8 || !m.speed.fly) && (lv >= 4 || !m.speed.swim || m.speed.walk >= 20));
    list.sort((a, b) => R.crValue(b.cr) - R.crValue(a.cr) || b.hp - a.hp);
    return list.slice(0, 14);
  };

  P.wildShape = function (c, m) {
    const beast = C.fromMonster(m, c.side, { controller: c.controller });
    const cellsOk = beast.cells <= c.cells || G.canEndAt(this.B, Object.assign({}, c, { cells: beast.cells }), c.x, c.y);
    if (!cellsOk) return 'недостаточно места для облика';
    const keys = ['name', 'icon', 'abil', 'mods', 'saves', 'skills', 'ac', 'acNote', 'armorCat', 'hasShield', 'maxHp', 'hp', 'speed', 'attacks', 'multiattack', 'extraAttacks', 'specials', 'size', 'cells', 'recharge', 'uses', 'flags', 'vuln'];
    const orig = {};
    for (const k of keys) orig[k] = U.deepClone(c[k]);
    c.beast = { orig, id: m.id, name: m.name };
    const abil = Object.assign({}, c.abil, { str: beast.abil.str, dex: beast.abil.dex, con: beast.abil.con });
    const mods = Object.assign({}, c.mods, { str: beast.mods.str, dex: beast.mods.dex, con: beast.mods.con });
    const saves = Object.assign({}, c.saves);
    for (const ab of ['str', 'dex', 'con']) saves[ab] = Math.max(beast.saves[ab], mods[ab] + (c.saves[ab] - c.mods[ab]));
    c.abil = abil;
    c.mods = mods;
    c.saves = saves;
    c.name = orig.name + ' (' + m.name.toLowerCase() + ')';
    c.icon = beast.icon;
    c.ac = beast.ac;
    c.acNote = 'природный доспех';
    c.armorCat = 'natural';
    c.hasShield = false;
    c.maxHp = beast.maxHp;
    c.hp = beast.maxHp;
    c.speed = beast.speed;
    const magical = !!c.flags.primalStrike;
    c.attacks = beast.attacks.map((a) => Object.assign(a, { magical: a.magical || magical }));
    c.multiattack = beast.multiattack;
    c.extraAttacks = 0;
    c.specials = beast.specials;
    c.size = beast.size;
    c.cells = beast.cells;
    c.recharge = beast.recharge;
    c.uses = beast.uses;
    c.vuln = beast.vuln;
    c.flags = Object.assign({}, orig.flags, beast.flags);
    return null;
  };

  P.revertWildShape = function (c, quiet) {
    if (!c.beast) return;
    const o = c.beast.orig;
    for (const k in o) if (k !== 'hp') c[k] = o[k];
    c.hp = Math.min(o.hp, c.maxHp);
    c.beast = null;
    if (!quiet) this.log(this.name(c) + ' возвращает свой облик.', 'muted');
    this.h.changed();
  };

  P.useFeature = async function (c, id, args) {
    args = args || {};
    const t = this.B.turn;
    const res = c.res || {};
    const f = c.flags || {};
    const fail = (reason) => ({ ok: false, reason });
    const lv = c.level || 1;
    const B = this.B;
    if (id.startsWith('sp:')) {
      const s = c.specials.find((x) => x.id === id.slice(3));
      if (!s) return fail('нет способности');
      if (!this.specialReady(c, s)) return fail('способность недоступна');
      if (s.type === 'teleport') {
        if (!args.point && !args.aim) return fail('выберите точку');
        const p = args.point || args.aim;
        const r0 = await this.monsterTeleport(c, s, p);
        if (!r0.ok) return r0;
        this.spend(c, 'action');
        this.spendSpecial(c, s);
        return { ok: true };
      }
      if ((s.type === 'healTouch' || s.type === 'gaze') && !args.target) return fail('выберите цель');
      const err = this.spend(c, 'action');
      if (err) return fail(err);
      this.spendSpecial(c, s);
      return (await this.doSpecialTarget(c, s, args.target || null)) || { ok: true };
    }
    switch (id) {
      case 'secondWind': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        res.secondWind.used++;
        const r = Dice.roll('1d10+' + lv);
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
        if (f.mindlessRage) {
          this.removeCond(c, 'charmed');
          this.removeCond(c, 'frightened');
        }
        this.log('😡 ' + this.name(c) + ' впадает в ЯРОСТЬ!' + (f.totem ? ' (дух ' + ({ bear: 'медведя', eagle: 'орла', wolf: 'волка' }[f.totem] || '') + ')' : ''), 'action');
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
      case 'intimidate': {
        const tgt = args.target;
        if (!tgt || G.distFt(c, tgt) > 30 || !this.hostile(c, tgt)) return fail('нужен враг в пределах 30 фт.');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        this.log(this.name(c) + ' грозно смотрит на ' + this.name(tgt) + '.', 'action');
        const sv = await this.save(tgt, 'wis', 8 + c.prof + c.mods.cha, { cond: 'frightened' });
        if (!sv.ok && this.addCond(tgt, 'frightened', { src: c.uid, expire: { who: c.uid, at: 'end', n: 2 } })) this.log(this.name(tgt) + ' испуган!', 'bad');
        return { ok: true };
      }
      case 'eagleDash':
      case 'cunningDash':
        return this.dash(c, 'bonus');
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
        const r = this.dodge(c, 'bonus');
        if (r.ok) res.ki.used++;
        return r;
      }
      case 'stepDash': {
        const r = this.dash(c, 'bonus');
        if (r.ok) res.ki.used++;
        return r;
      }
      case 'stillness': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        this.removeCond(c, 'charmed');
        this.removeCond(c, 'frightened');
        this.log(this.name(c) + ' успокаивает разум.', 'good');
        return { ok: true };
      }
      case 'wholeness': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.wholeness.used++;
        this.heal(c, 3 * lv);
        return { ok: true };
      }
      case 'quiver': {
        const tgt = args.target;
        if (!tgt || tgt.quivering !== c.uid) return fail('цель не поражена дрожащей ладонью');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        tgt.quivering = null;
        this.log('✋ ' + this.name(c) + ' останавливает вибрации в теле ' + this.name(tgt) + '!', 'warn');
        const sv = await this.save(tgt, 'con', 8 + c.prof + c.mods.wis, {});
        if (!sv.ok) await this.applyDamage(tgt, [{ amount: tgt.hp + (tgt.tempHp || 0), type: 'necrotic' }], c, { fromAttack: false, magical: true });
        else await this.applyDamage(tgt, [{ amount: Dice.roll('10d10').total, type: 'necrotic' }], c, { fromAttack: false, magical: true });
        return { ok: true };
      }
      case 'shadowStep': {
        const p = args.point || args.aim;
        if (!p) return fail('выберите точку');
        const px = Math.floor(p.x);
        const py = Math.floor(p.y);
        if (G.distToCellFt(c, px, py) > 60) return fail('слишком далеко (60 фт.)');
        if (!G.canStand(B, c, px, py, {}) || !G.canEndAt(B, c, px, py)) return fail('место занято');
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        c.x = px;
        c.y = py;
        this.addEff(c, { id: 'shadowStep', src: c.uid, expire: { who: c.uid, at: 'end', n: 1 } });
        this.log(this.name(c) + ' шагает сквозь тени.', 'spell');
        return { ok: true };
      }
      case 'cloak': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        this.addCond(c, 'invisible', { src: c.uid, tag: 'invis', expire: { who: c.uid, at: 'start', n: 10 } });
        this.log(this.name(c) + ' растворяется в тенях.', 'spell');
        return { ok: true };
      }
      case 'fistAir':
      case 'waterWhip': {
        const tgt = args.target;
        if (!tgt || G.distFt(c, tgt) > 30) return fail('нужна цель в пределах 30 фт.');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.ki.used += 2;
        const dc = 8 + c.prof + c.mods.wis;
        const air = id === 'fistAir';
        this.log('🌬️ ' + this.name(c) + (air ? ' бьёт воздушным кулаком!' : ' хлещет водяным кнутом!'), 'spell');
        const sv = await this.areaSaveDamage(c, tgt, air ? 'str' : 'dex', dc, [{ type: 'bludgeoning', r: Dice.roll('3d10') }], true, { magical: true });
        if (sv && !sv.ok && !tgt.dead) {
          if (air) this.push(c, tgt, 20);
          if (air || !this.hasCond(tgt, 'prone')) {
            if (this.addCond(tgt, 'prone', {})) this.log(this.name(tgt) + ' сбит с ног!', 'bad');
          }
          if (!air) this.pull(c, tgt, 25);
        }
        return { ok: true };
      }
      case 'cinder':
      case 'phoenix':
      case 'winter': {
        const aim = args.aim;
        if (!aim) return fail('выберите направление');
        const spell = { cinder: 'burninghands', phoenix: 'fireball', winter: 'coneofcold' }[id];
        const cost = { cinder: 2, phoenix: 4, winter: 6 }[id];
        const r0 = await this.castSpell(c, spell, D.spell(spell).level, { point: aim }, { free: true, dc: 8 + c.prof + c.mods.wis });
        if (r0.ok) res.ki.used += cost;
        return r0;
      }
      case 'cunningDisengage':
        return this.disengage(c, 'bonus');
      case 'fastPotion':
        return this.potion(c, c, 'bonus');
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
        this.addEff(tgt, { id: 'inspiration', src: c.uid, value: f.inspirationDie, valor: !!f.combatInspiration, expire: { who: tgt.uid, at: 'start', n: 100 } });
        this.log(this.name(c) + ' вдохновляет ' + this.name(tgt) + ' (d' + f.inspirationDie + ').', 'action');
        return { ok: true };
      }
      case 'turnUndead': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.channel.used++;
        const dc = 8 + c.prof + c.mods.wis;
        this.log('✝️ ' + this.name(c) + ' изгоняет нежить!', 'spell');
        const destroyCR = lv >= 17 ? 4 : lv >= 14 ? 3 : lv >= 11 ? 2 : lv >= 8 ? 1 : lv >= 5 ? 0.5 : -1;
        for (const o of B.combatants) {
          if (o.dead || o.x < 0 || o.type !== 'undead' || !this.hostile(c, o) || G.distFt(c, o) > 30) continue;
          const sv = await this.save(o, 'wis', dc, { magic: true });
          if (!sv.ok) {
            if (R.crValue(o.cr == null ? 99 : o.cr) <= destroyCR) this.kill(o, 'уничтожена божественной силой');
            else if (this.addCond(o, 'frightened', { src: c.uid, tag: 'turned', expire: { who: o.uid, at: 'end', n: 10 } })) this.log(this.name(o) + ' изгнан и в страхе бежит!', 'good');
          }
        }
        this.h.changed();
        await this.checkEnd();
        return { ok: true };
      }
      case 'preserveLife': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.channel.used++;
        let pool = 5 * lv;
        this.log('✝️ ' + this.name(c) + ' использует Сохранение жизни.', 'spell');
        const allies = B.combatants
          .filter((o) => !o.dead && o.x >= 0 && !this.hostile(c, o) && G.distFt(c, o) <= 30 && o.hp < Math.floor(o.maxHp / 2) && !['undead', 'construct'].includes(o.type))
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
      case 'radiance': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.channel.used++;
        const cells = G.areaCells(B.map, { shape: 'aura', size: 30 }, c, null);
        await this.h.flashCells(cells, R.DAMAGE_COLORS.radiant);
        this.log('🌅 ' + this.name(c) + ' — Сияние рассвета!', 'spell');
        const r = Dice.roll('2d10+' + lv);
        for (const o of G.creaturesInCells(B, cells)) if (o !== c && this.hostile(c, o)) await this.areaSaveDamage(c, o, 'con', c.spellcasting.dc, [{ type: 'radiant', r }], true, { magical: true });
        return { ok: true };
      }
      case 'warPriest':
      case 'bonusWeapon': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        if (id === 'warPriest') res.warPriest.used++;
        t.bonusAttack = { count: 1, weaponOnly: true };
        this.log(this.name(c) + ' готовит дополнительную атаку оружием.', 'action');
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
      case 'naturesWrath': {
        const tgt = args.target;
        if (!tgt || G.distFt(c, tgt) > 10) return fail('нужна цель в пределах 10 фт.');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.channel.used++;
        this.log('🌿 ' + this.name(c) + ' призывает Гнев природы на ' + this.name(tgt) + '.', 'spell');
        const ab = tgt.saves.str >= tgt.saves.dex ? 'str' : 'dex';
        const dc = c.spellcasting ? c.spellcasting.dc : 8 + c.prof + c.mods.cha;
        const sv = await this.save(tgt, ab, dc, { magic: true });
        if (!sv.ok && this.addCond(tgt, 'restrained', { src: c.uid, save: { ab, dc, at: 'end' }, expire: { who: tgt.uid, at: 'end', n: 10 } })) this.log(this.name(tgt) + ' опутан лозами!', 'bad');
        return { ok: true };
      }
      case 'vow': {
        const tgt = args.target;
        if (!tgt || G.distFt(c, tgt) > 10 || !this.hostile(c, tgt)) return fail('нужен враг в пределах 10 фт.');
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        res.channel.used++;
        this.addEff(tgt, { id: 'vowOfEnmity', src: c.uid, expire: { who: c.uid, at: 'start', n: 10 } });
        this.log('⚔️ ' + this.name(c) + ' приносит Клятву вражды против ' + this.name(tgt) + '.', 'spell');
        return { ok: true };
      }
      case 'holyNimbus': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.holyNimbus.used++;
        this.addEff(c, { id: 'holyNimbus', src: c.uid, expire: { who: c.uid, at: 'start', n: 10 } });
        this.log('☀️ ' + this.name(c) + ' сияет Святым нимбом!', 'spell');
        return { ok: true };
      }
      case 'wildShape':
      case 'elementalShape': {
        const elemental = id === 'elementalShape';
        const forms = this.wildShapeForms(c, elemental);
        if (!forms.length) return fail('нет доступных обликов');
        let mid = args.form;
        if (!mid) {
          mid = await this.h.ask(c.name + ': в кого превратиться?', forms.map((m) => ({ label: m.name + ' (ПО ' + m.cr + ', ' + m.hp + ' хит., КД ' + m.ac + ')', value: m.id })).concat([{ label: 'Отмена', value: null }]), c);
          if (!mid) return fail('отменено');
        }
        const m = D.monster(mid);
        if (!m) return fail('нет облика');
        const err = this.spend(c, f.combatWildShape ? 'bonus' : 'action');
        if (err) return fail(err);
        const e2 = this.wildShape(c, m);
        if (e2) {
          if (f.combatWildShape) t.bonus = true;
          else t.actions++;
          return fail(e2);
        }
        res.wildShape.used += elemental ? 2 : 1;
        this.log('🐾 ' + this.name(c) + ' принимает облик: ' + U.escapeHtml(m.name) + '!', 'spell');
        t.move = Math.max(0, this.speedOf(c) - t.moved);
        this.h.changed();
        return { ok: true };
      }
      case 'revertShape': {
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        this.revertWildShape(c);
        return { ok: true };
      }
      case 'moonHeal': {
        const lvl = args.slot || this.lowestSlot(c, 1);
        if (!lvl) return fail('нет ячеек');
        const err = this.spend(c, 'bonus');
        if (err) return fail(err);
        this.useSlot(c, lvl);
        this.log(this.name(c) + ' тратит ячейку ' + lvl + ' ур. на исцеление в облике зверя.', 'spell');
        this.heal(c, Dice.roll(lvl + 'd8').total);
        return { ok: true };
      }
      case 'whirlwind': {
        const atk = c.attacks.find((a) => a.weapon && a.kind !== 'ranged');
        if (!atk) return fail('нужно рукопашное оружие');
        const tg = B.combatants.filter((o) => !o.dead && o.x >= 0 && o.hp > 0 && this.hostile(c, o) && G.distFt(c, o) <= (atk.reach || 5));
        if (!tg.length) return fail('рядом нет врагов');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        this.log('🌪️ ' + this.name(c) + ' — Вихревая атака!', 'action');
        for (const o of tg) if (!o.dead && !c.dead) await this.attack(c, atk, o, {});
        return { ok: true };
      }
      case 'feyPresence': {
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.feyPresence.used++;
        const cond = await this.askReactor(c, c.name + ': Присутствие феи — какой эффект?', [{ label: 'Очарование', value: 'charmed' }, { label: 'Испуг', value: 'frightened' }], 'frightened');
        const cells = G.areaCells(B.map, { shape: 'aura', size: 10 }, c, null);
        await this.h.flashCells(cells, '#e0a0ff');
        for (const o of G.creaturesInCells(B, cells)) {
          if (o === c || !this.hostile(c, o) || o.dead) continue;
          const sv = await this.save(o, 'wis', c.spellcasting.dc, { magic: true, cond });
          if (!sv.ok && this.addCond(o, cond, { src: c.uid, expire: { who: c.uid, at: 'end', n: 2 } })) this.log(this.name(o) + ': ' + R.CONDITIONS[cond].name.toLowerCase() + '!', 'bad');
        }
        return { ok: true };
      }
      case 'tides':
        res.tides.used++;
        this.addEff(c, { id: 'tides', src: c.uid, expire: { who: c.uid, at: 'end', n: 10 } });
        this.addEff(c, { id: 'tidesUsed', src: c.uid, silent: true });
        this.log(this.name(c) + ' призывает Поток хаоса: преимущество на следующую атаку.', 'spell');
        return { ok: true };
      case 'hasteDash':
        t.flags.hasteAction = false;
        t.move += this.speedOf(c);
        this.log(this.name(c) + ' совершает Рывок (ускорение).', 'action');
        this.h.changed();
        return { ok: true };
      case 'hasteDisengage':
        t.flags.hasteAction = false;
        t.disengaged = true;
        this.log(this.name(c) + ' совершает Отход (ускорение).', 'action');
        this.h.changed();
        return { ok: true };
      case 'dragonBreath': {
        if (!args.aim) return fail('выберите направление');
        const err = this.spend(c, 'action');
        if (err) return fail(err);
        res.breath.used++;
        const anc = c.ancestry;
        const area = anc.shape === 'line' ? { shape: 'line', size: 30, origin: 'self' } : { shape: 'cone', size: 15, origin: 'self' };
        const cells = G.areaCells(B.map, area, c, args.aim);
        await this.h.flashCells(cells, R.DAMAGE_COLORS[anc.type]);
        const dice = (lv >= 16 ? 5 : lv >= 11 ? 4 : lv >= 6 ? 3 : 2) + 'd6';
        const r = Dice.roll(dice);
        this.log('🐲 ' + this.name(c) + ' использует оружие дыхания: ' + r.total + ' ' + R.DAMAGE_SHORT[anc.type] + ' ' + Dice.fmtRolls(r), 'spell');
        const dc = 8 + c.mods.con + c.prof;
        for (const o of G.creaturesInCells(B, cells)) if (o.uid !== c.uid) await this.areaSaveDamage(c, o, anc.save, dc, [{ type: anc.type, r }], true, { magical: true });
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
