//@@ P.featureActions
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

//@@ P.useFeature
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
