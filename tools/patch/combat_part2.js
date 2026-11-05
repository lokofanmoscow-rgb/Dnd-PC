//@@ P.auraOfProtection
  P.auraOfProtection = function (c) {
    let best = 0;
    for (const p of this.B.combatants) {
      if (!p.flags || !p.flags.auraOfProtection || p.x < 0 || this.hostile(p, c) || !this.conscious(p)) continue;
      if (G.distFt(p, c) <= (p.flags.auraRange || 10)) best = Math.max(best, Math.max(1, p.mods.cha));
    }
    return best;
  };

//@@ P.beginCombat
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

//@@ P.applyDamage
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

//@@ P.processBursts
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

//@@ P.heal
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

//@@ P.attackMode
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

//@@ P.attack
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

//@@ P.rollAttackDamage
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

//@@ P.onHitEffects
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

//@@ P.attackOptions
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

//@@ P.doAttack
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

//@@ P.doSpecialTarget
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

//@@ P.doAreaSpecial
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

//@@ P.areaSaveDamage
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

//@@ P.castCheck
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

//@@ P.castSpell
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
        return { total: v, rolls: [v], dice, max: true };
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

//@@ P.spellOnHit
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

//@@ P.spellOnFail
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

//@@ P.moveAlong
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
