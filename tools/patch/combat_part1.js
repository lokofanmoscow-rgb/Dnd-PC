//@@ P.addCond
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

//@@ P.auraOfCourage
  P.auraNear = function (c, flag) {
    return this.B.combatants.some((p) => p.flags && p.flags[flag] && !p.dead && p.x >= 0 && !this.hostile(p, c) && this.conscious(p) && G.distFt(p, c) <= ((p.flags.auraRange) || 10));
  };
  P.auraOfCourage = function (c) {
    return this.auraNear(c, 'auraOfCourage');
  };

//@@ P.speedOf
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

//@@ P.acOf
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

//@@ P.endConcentration
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

//@@ P.save
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

//@@ P.startTurn
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
    B.turn.move = this.speedOf(c);
    this.h.changed();
  };

//@@ P.endTurn
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
      } else if (la.kind === 'useSpecial') {
        const sp = L.specials.find((s) => s.id === la.special);
        if (sp) out.push({ la, special: sp });
      }
    }
    return out;
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
      else if (pick.heal) this.heal(L, Dice.roll(pick.la.dice).total);
      else if (pick.special) await this.useMonsterSpecialAuto(L, pick.special);
      this.h.changed();
    }
  };

//@@ P.kill
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
    while (this._bursts && this._bursts.length) {
      const c = this._bursts.shift();
      const db = c.flags.deathBurst;
      const cells = G.areaCells(this.B.map, { shape: 'aura', size: db.radius }, c, null);
      await this.h.flashCells(cells, db.dmg ? R.DAMAGE_COLORS[db.dmg[0].type] : '#ddd');
      this.log('💥 ' + this.name(c) + ' взрывается после смерти!', 'warn');
      const rolled = db.dmg ? db.dmg.map((d) => ({ type: d.type, r: Dice.roll(d.dice) })) : [];
      for (const o of G.creaturesInCells(this.B, cells)) {
        if (o === c || o.dead) continue;
        if (rolled.length) await this.areaSaveDamage(c, o, db.save, db.dc, rolled, db.half !== false, { magical: true });
        else if (db.condition) {
          const sv = await this.save(o, db.save, db.dc, {});
          if (!sv.ok) this.addCond(o, db.condition, { src: c.uid, save: { ab: db.save, dc: db.dc, at: 'end' }, expire: { who: o.uid, at: 'end', n: 10 } });
        }
      }
    }
  };
