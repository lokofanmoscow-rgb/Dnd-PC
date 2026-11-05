/* Искусственный интеллект для монстров и NPC */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const G = D.Grid;
  const Dice = D.Dice;

  const AI = {};

  function hitChance(toHit, ac, mode) {
    let p = (21 - (ac - toHit)) / 20;
    p = Math.max(0.05, Math.min(0.95, p));
    if (mode > 0) p = 1 - (1 - p) * (1 - p);
    if (mode < 0) p = p * p;
    return p;
  }
  function failChance(bonus, dc) {
    const p = (dc - bonus - 1) / 20;
    return Math.max(0.05, Math.min(0.95, p));
  }
  function avgList(list) {
    return (list || []).reduce((s, d) => s + Dice.average(d.dice), 0);
  }

  AI.enemies = (E, c) => E.B.combatants.filter((o) => !o.dead && o.x >= 0 && o.hp > 0 && E.hostile(c, o));
  AI.allies = (E, c) => E.B.combatants.filter((o) => !o.dead && o.x >= 0 && !E.hostile(c, o));

  AI.attackEV = function (E, c, atk, tgt, isRanged) {
    if (!atk) return 0;
    const dist = G.distFt(c, tgt);
    const mode = E.attackMode(c, tgt, atk, isRanged, dist).mode;
    const dmg = isRanged && atk.rangedDmg ? atk.rangedDmg : atk.dmg;
    let avg = avgList(dmg);
    for (const oh of atk.onHit || []) {
      if (oh.damage) avg += avgList(oh.damage) * 0.75;
      if (oh.condition === 'paralyzed' || oh.condition === 'stunned') avg += 6;
      if (oh.condition === 'restrained' || oh.condition === 'grappled') avg += 3;
      if (oh.condition === 'poisoned' || oh.condition === 'prone') avg += 2;
    }
    return hitChance(atk.toHit, E.acOf(tgt), mode) * avg;
  };

  /* Наборы атак для действия «Атака»: варианты мультиатаки или одиночные атаки */
  AI.attackSets = function (c, E) {
    E = E || AI._E;
    const sets = [];
    const usable = (id) => {
      const a = c.attacks.find((x) => x.id === id);
      if (a) return !(a.recharge && c.recharge && !c.recharge[a.id]);
      const s = c.specials.find((x) => x.id === id);
      return !!s && E.specialReady(c, s);
    };
    if (c.multiattack) for (const opt of c.multiattack) if (opt.every(usable)) sets.push(opt.slice());
    for (const a of c.attacks) {
      if (a.recharge && c.recharge && !c.recharge[a.id]) continue;
      const n = 1 + (c.extraAttacks || 0);
      sets.push(new Array(n).fill(a.id));
    }
    return sets;
  };

  AI.setEV = function (E, c, set, tgt, ranged) {
    let ev = 0;
    for (const id of set) {
      const a = c.attacks.find((x) => x.id === id);
      if (!a) {
        ev += 2; // взгляд/ужасающая внешность
        continue;
      }
      if (ranged && a.kind === 'melee') return -1;
      if (!ranged && a.kind === 'ranged') return -1;
      ev += AI.attackEV(E, c, a, tgt, ranged);
    }
    return ev;
  };

  AI.realPath = function (E, c, M, x, y, budgetFt) {
    const path = G.pathTo(M, x, y);
    if (!path) return null;
    const fly = E.canFly(c);
    const out = [path[0]];
    let spent = 0;
    for (let i = 1; i < path.length; i++) {
      const cost = G.stepCost(E.B, c, path[i].x, path[i].y, { fly }) * 5;
      if (spent + cost > budgetFt) break;
      spent += cost;
      out.push(path[i]);
    }
    // Нельзя закончить в занятой клетке — откатываемся
    while (out.length > 1 && !G.canEndAt(E.B, c, out[out.length - 1].x, out[out.length - 1].y)) out.pop();
    return out;
  };

  /* Лучшая клетка, из которой цель в досягаемости reachFt */
  AI.bestCellFor = function (E, c, M, tgt, reachFt, needLOS, keepAway) {
    let best = null;
    for (const rec of M.values()) {
      if (best && rec.cost >= best.score) continue;
      const d = G.distFtAt(c, rec.x, rec.y, tgt);
      if (d > reachFt) continue;
      if (!G.canEndAt(E.B, c, rec.x, rec.y) && !(rec.x === c.x && rec.y === c.y)) continue;
      if (d > reachFt) continue;
      if (needLOS && !G.hasLOS(E.B.map, { x: rec.x, y: rec.y, cells: c.cells }, tgt)) continue;
      let score = rec.cost;
      if (keepAway) {
        const near = AI.enemies(E, c).some((o) => G.distFtAt(c, rec.x, rec.y, o) <= 5);
        if (near) score += 30;
      }
      if (!best || score < best.score) best = { x: rec.x, y: rec.y, score, cost: rec.cost };
    }
    return best;
  };

  AI.moveTo = async function (E, c, M, x, y) {
    const t = E.B.turn;
    if (x === c.x && y === c.y) return;
    const path = AI.realPath(E, c, M, x, y, t.move);
    if (path && path.length > 1) await E.moveAlong(c, path);
  };

  AI.wait = (opts) => U.sleep((opts && opts.delay) || 0);

  /* ---------- Площадные атаки ---------- */
  AI.bestAim = function (E, c, area, from, dmgAvg, saveAb, dc, dmgType) {
    const B = E.B;
    const fake = { x: from.x, y: from.y, cells: c.cells, uid: c.uid };
    const ctr = G.center(fake);
    let best = { score: 0, aim: null, hits: 0 };
    const aims = [];
    if (area.origin === 'self' && area.shape !== 'aura') {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        aims.push({ x: ctr.x + Math.cos(a) * 3, y: ctr.y + Math.sin(a) * 3 });
      }
    } else if (area.shape === 'aura') aims.push(ctr);
    else for (const e of AI.enemies(E, c)) aims.push({ x: e.x + 0.5, y: e.y + 0.5 });
    for (const aim of aims) {
      const cells = G.areaCells(B.map, area, fake, aim);
      const hit = G.creaturesInCells(B, cells).filter((o) => (o.uid !== c.uid || area.origin === 'point') && o.hp > 0);
      let score = 0;
      let hits = 0;
      for (const o of hit) {
        const fc = failChance(o.saves[saveAb] || 0, dc);
        const ev = dmgAvg * (fc + (1 - fc) * 0.5);
        const immune = (o.immune || []).length && dmgType && o.immune.includes(dmgType);
        if (E.hostile(c, o)) {
          if (!immune) score += ev;
          hits++;
        } else if (!immune) score -= ev * (o.uid === c.uid ? 4 : 1.5);
      }
      if (score > best.score) best = { score, aim, hits };
    }
    return best;
  };

  /* ---------- Заклинания ---------- */
  AI.spellOptions = function (E, c) {
    const out = [];
    if (!c.spellcasting || !c.spells || !c.spells.length) return out;
    const t = E.B.turn;
    for (const id of c.spells) {
      const s = D.spell(id);
      if (!s || s.cast === 'reaction') continue;
      let slot = 0;
      if (s.level > 0) {
        slot = E.lowestSlot(c, s.level);
        if (!slot && E.usesInnate(c, s, 0)) slot = 'innate';
        if (!slot) continue;
      }
      if (E.castCheck(c, s, slot)) continue;
      out.push({ spell: s, slot, lvl: slot === 'innate' ? s.level : slot });
    }
    return out;
  };

  AI.evalSpell = function (E, c, s, slot) {
    const sc = c.spellcasting;
    if (slot === 'innate') slot = s.level;
    const enemies = AI.enemies(E, c).filter((o) => G.distFt(c, o) <= Math.max(s.range, 5) && (s.range <= 5 || G.hasLOS(E.B.map, c, o)));
    if (s.kind === 'attack') {
      let n = 1;
      if (s.scale === 'beams') n = E.spellScale(c, s);
      if (s.rays) n = s.rays + Math.max(0, slot - s.level);
      let best = null;
      for (const o of enemies) {
        const dice = s.damage.map((d) => ({ dice: E.spellDice(c, s, slot, d.dice) }));
        const atk = { toHit: sc.toHit, kind: s.attack === 'ranged' ? 'ranged' : 'melee', range: [s.range, s.range], ability: 'int', isSpell: true };
        const mode = E.attackMode(c, o, atk, s.attack === 'ranged', G.distFt(c, o)).mode;
        const ev = hitChance(sc.toHit, E.acOf(o), mode) * avgList(dice) * n + (s.summon ? 8 : 0);
        if (!best || ev > best.ev) best = { ev, targets: [o.uid] };
      }
      return best;
    }
    if (s.kind === 'auto') {
      if (!enemies.length) return null;
      const darts = (s.darts || 1) + Math.max(0, slot - s.level);
      const o = enemies.slice().sort((a, b) => a.hp - b.hp)[0];
      return { ev: darts * Dice.average(s.damage[0].dice), targets: [o.uid] };
    }
    if (s.kind === 'save' && s.target !== 'area') {
      const count = (s.count || 1) + (s.upcast && s.upcast.targets ? Math.max(0, slot - s.level) : 0);
      const scored = enemies.map((o) => {
        const avg = s.damage.reduce((sum, d) => sum + Dice.average(E.spellDice(c, s, slot, d.dice)), 0);
        const fc = failChance(o.saves[s.save] || 0, sc.dc);
        let ev = avg * (fc + (s.half ? (1 - fc) * 0.5 : 0));
        if (s.noKill) ev = Math.min(ev, Math.max(0, o.hp - 1));
        return { o, ev };
      }).sort((a, b) => b.ev - a.ev).slice(0, count);
      if (!scored.length) return null;
      return { ev: scored.reduce((a, x) => a + x.ev, 0), targets: scored.map((x) => x.o.uid) };
    }
    if (s.kind === 'kill' || s.kind === 'pwstun') {
      const cand = enemies.filter((o) => o.hp <= (s.threshold || 100) && !(s.kind === 'pwstun' && E.hasCond(o, 'stunned'))).sort((a, b) => b.hp - a.hp);
      if (!cand.length) return null;
      return { ev: s.kind === 'kill' ? cand[0].hp * 1.2 : 12 + cand[0].hp * 0.2, targets: [cand[0].uid] };
    }
    if (s.kind === 'banish') {
      if (c.concentration || !enemies.length) return null;
      const o = enemies.slice().sort((a, b) => b.hp - a.hp)[0];
      if (enemies.length < 2) return null;
      return { ev: 6 + o.hp * 0.15 * failChance(o.saves.cha || 0, sc.dc), targets: [o.uid] };
    }
    if (s.kind === 'control' && s.target === 'area' && s.area) {
      if (c.concentration) return null;
      const aim = AI.bestAim(E, c, s.area, c, 12, s.save, sc.dc, null);
      if (!aim.aim || aim.hits < 2) return null;
      if (s.area.origin === 'point' && G.distToCellFt(c, Math.floor(aim.aim.x), Math.floor(aim.aim.y)) > s.range) return null;
      return { ev: aim.score * 0.8, point: aim.aim };
    }
    if (s.kind === 'save' && s.target === 'area') {
      const avg = s.damage.reduce((sum, d) => sum + Dice.average(E.spellDice(c, s, slot, d.dice)), 0);
      const aim = AI.bestAim(E, c, s.area, c, avg, s.save, sc.dc, s.damage[0].type);
      if (!aim.aim) return null;
      if (s.area.origin === 'point' && G.distToCellFt(c, Math.floor(aim.aim.x), Math.floor(aim.aim.y)) > s.range) return null;
      return { ev: aim.score, point: aim.aim };
    }
    if (s.kind === 'control' && s.target !== 'area') {
      const cand = enemies.filter((o) => !E.hasCond(o, s.condition) && (s.filter !== 'humanoid' || o.type === 'humanoid') && (s.filter !== 'notUndead' || o.type !== 'undead'));
      if (!cand.length || c.concentration) return null;
      const o = cand.sort((a, b) => b.maxHp - a.maxHp)[0];
      return { ev: 14 * failChance(o.saves[s.save] || 0, sc.dc), targets: [o.uid] };
    }
    if (s.kind === 'aura') {
      if (c.concentration || E.hasEff(c, 'spiritGuardians')) return null;
      const near = AI.enemies(E, c).filter((o) => G.distFt(c, o) <= 15).length;
      return near ? { ev: 9 * near + 4, targets: [] } : null;
    }
    if (s.kind === 'heal') {
      const hurt = AI.allies(E, c).filter((o) => o.hp <= o.maxHp * 0.4 && !['undead', 'construct'].includes(o.type) && G.distFt(c, o) <= Math.max(5, s.range));
      if (!hurt.length) return null;
      hurt.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      return { ev: 12 + (hurt[0].hp <= 0 ? 15 : 0), targets: hurt.slice(0, s.count || 1).map((o) => o.uid), heal: true };
    }
    if (s.kind === 'buff' && s.target === 'self' && s.effect && !E.hasEff(c, s.effect)) {
      if (s.concentration && c.concentration) return null;
      if (s.effect === 'falseLife') return c.tempHp ? null : { ev: 5, targets: [] };
      if (['divineFavor', 'thunderousSmite'].includes(s.effect) && AI.enemies(E, c).some((o) => G.distFt(c, o) <= 10)) return { ev: 6, targets: [] };
      return null;
    }
    if (s.kind === 'buff' && ['haste', 'stoneskin', 'barkskin', 'greaterInvisibility', 'heroism'].includes(s.effect)) {
      if (c.concentration) return null;
      if (!AI.enemies(E, c).some((o) => G.distFt(c, o) <= 60)) return null;
      const al = AI.allies(E, c).filter((o) => o.hp > 0 && G.distFt(c, o) <= Math.max(5, s.range) && !E.hasEff(o, s.effect)).sort((a, b) => b.maxHp - a.maxHp);
      if (!al.length) return null;
      return { ev: 8, targets: [al[0].uid] };
    }
    if (s.kind === 'buff' && s.id === 'bless') {
      if (c.concentration) return null;
      const al = AI.allies(E, c).filter((o) => o.hp > 0 && G.distFt(c, o) <= 30).slice(0, 3);
      return { ev: 3 * al.length, targets: al.map((o) => o.uid) };
    }
    return null;
  };

  /* Особые действия: лечение касанием, цели по выбору, ужасающий вид, телепортация */
  AI.monsterSpecials = async function (E, c, opts) {
    const t = E.B.turn;
    const enemies = AI.enemies(E, c);
    const weaponBest = AI.bestWeaponEV(E, c);
    for (const s of c.specials) {
      if (!E.specialReady(c, s) || t.actions <= 0) continue;
      const inMulti = c.multiattack && c.multiattack.some((o) => o.includes(s.id));
      if (s.type === 'healTouch') {
        const hurt = AI.allies(E, c).filter((o) => o.hp > 0 && o.hp <= o.maxHp * 0.4 && G.distFt(c, o) <= 5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (hurt) {
          const r = await E.useFeature(c, 'sp:' + s.id, { target: hurt });
          if (r && r.ok !== false) {
            await AI.wait(opts);
            return true;
          }
        }
      } else if (s.type === 'targets') {
        const n = enemies.filter((o) => G.distFt(c, o) <= (s.range || 60) && G.hasLOS(E.B.map, c, o)).length;
        const ev = Math.min(n, s.count || 1) * avgList(s.dmg) * 0.7;
        if (n && ev > weaponBest) {
          await E.useFeature(c, 'sp:' + s.id, {});
          await AI.wait(opts);
          return true;
        }
      } else if (s.type === 'aoeCondition' && !inMulti) {
        const imm = E.B.fpImmune[c.uid] || {};
        const n = enemies.filter((o) => G.distFt(c, o) <= s.range && !imm[o.uid] && !E.hasCond(o, s.condition) && !(s.notTypes && s.notTypes.includes(o.type))).length;
        if (n >= 2 || (n >= 1 && weaponBest < 4)) {
          await E.useFeature(c, 'sp:' + s.id, {});
          await AI.wait(opts);
          return true;
        }
      } else if (s.type === 'gaze' && !inMulti) {
        const cand = enemies.filter((o) => G.distFt(c, o) <= s.range && G.hasLOS(E.B.map, c, o) && (s.dropTo0 ? E.hasCond(o, 'frightened') : s.condition && !E.hasCond(o, s.condition)));
        if (cand.length && (s.dropTo0 || weaponBest < 8)) {
          await E.useFeature(c, 'sp:' + s.id, { target: cand.sort((a, b) => b.hp - a.hp)[0] });
          await AI.wait(opts);
          return true;
        }
      }
    }
    return false;
  };

  /* ---------- Главная функция хода ---------- */
  AI.takeTurn = async function (E, c, opts) {
    opts = opts || {};
    const B = E.B;
    const t = B.turn;
    if (!t || t.uid !== c.uid) return;
    try {
      if (E.incap(c) || c.hp <= 0) {
        await AI.wait(opts);
        return await E.endTurn();
      }
      if (E.hasCond(c, 'prone') && E.speedOf(c) > 0) E.standUp(c);
      if (c.conditions.some((x) => x.id === 'grappled' || (x.id === 'restrained' && (x.escape || x.grappleLink)))) {
        await E.escape(c);
        await AI.wait(opts);
      }
      if (!AI.enemies(E, c).length) return await E.endTurn();
      // Телепортация к врагу, если до него не дойти
      const tp = c.specials && c.specials.find((s) => s.type === 'teleport' && (s.range || 0) <= 500 && E.specialReady(c, s));
      if (tp && t.bonus !== undefined) {
        const far = !AI.enemies(E, c).some((o) => G.distFt(c, o) <= E.speedOf(c) + E.reachOf(c));
        const dest = far && E.teleportDest(c, tp.range || 30);
        if (dest && c.multiattack == null) {
          await E.useFeature(c, 'sp:' + tp.id, { point: dest });
          await AI.wait(opts);
        }
      }

      await AI.actionPhase(E, c, opts);
      if (B.phase !== 'combat') return;
      await AI.bonusPhase(E, c, opts);
      if (B.phase !== 'combat') return;
      await AI.wait(opts);
      if (B.turn && B.turn.uid === c.uid) await E.endTurn();
    } catch (err) {
      console.error('Ошибка ИИ', err);
      if (B.turn && B.turn.uid === c.uid && B.phase === 'combat') await E.endTurn();
    }
  };

  AI.actionPhase = async function (E, c, opts) {
    const B = E.B;
    const t = B.turn;
    const enemies = AI.enemies(E, c);
    if (!enemies.length) return;
    const fly = E.canFly(c);

    // Агрессивный орк: сначала бонусное перемещение, если враг далеко
    if (c.flags.aggressive && t.bonus && !enemies.some((o) => G.distFt(c, o) <= E.reachOf(c))) {
      await E.useFeature(c, 'aggressive');
    }

    // Лечение союзников
    const spellOpts = AI.spellOptions(E, c);
    for (const so of spellOpts.filter((x) => x.spell.kind === 'heal')) {
      const ev = AI.evalSpell(E, c, so.spell, so.slot);
      if (ev && ev.heal) {
        const r = await E.castSpell(c, so.spell.id, so.slot, { targets: ev.targets });
        if (r.ok) {
          await AI.wait(opts);
          if (so.spell.cast === 'action') return;
          break;
        }
      }
    }

    // Площадные способности (дыхание)
    for (const s of c.specials) {
      if (s.type !== 'area' || !E.specialReady(c, s) || t.actions <= 0) continue;
      const avg = avgList(s.dmg);
      const dt = s.dmg && s.dmg[0] ? s.dmg[0].type : null;
      let best = AI.bestAim(E, c, s.area, c, avg, s.save, s.dc, dt);
      let moveTo = null;
      if (best.hits < 2) {
        const M = G.reach(B, c, Math.floor(t.move / 5), { fly, avoidHazards: true });
        const cand = [];
        for (const rec of M.values()) {
          if (!G.canEndAt(B, c, rec.x, rec.y)) continue;
          const dn = Math.min(...enemies.map((o) => G.distFtAt(c, rec.x, rec.y, o)));
          cand.push({ rec, dn });
        }
        cand.sort((a, b) => a.dn - b.dn);
        for (const { rec } of cand.slice(0, 25)) {
          const b2 = AI.bestAim(E, c, s.area, rec, avg, s.save, s.dc, dt);
          if (b2.score > best.score * 1.15) {
            best = b2;
            moveTo = { rec, M };
          }
        }
      }
      const weaponBest = AI.bestWeaponEV(E, c);
      if (best.aim && (best.hits >= 2 || best.score > weaponBest * 1.2)) {
        if (moveTo) {
          await AI.moveTo(E, c, moveTo.M, moveTo.rec.x, moveTo.rec.y);
          await AI.wait(opts);
          best = AI.bestAim(E, c, s.area, c, avg, s.save, s.dc, dt);
        }
        if (best.aim && s.area.origin === 'point' && s.range && G.distToCellFt(c, Math.floor(best.aim.x), Math.floor(best.aim.y)) > s.range) best.aim = null;
        if (best.aim && !c.dead && c.hp > 0) {
          await E.doAreaSpecial(c, s.id, best.aim);
          await AI.wait(opts);
          return;
        }
      }
    }

    // Прочие особые действия монстров
    if (t.actions > 0 && c.kind !== 'pc') {
      const used = await AI.monsterSpecials(E, c, opts);
      if (used) return;
    }

    // Заклинания
    if (spellOpts.length && t.actions > 0) {
      let best = null;
      for (const so of spellOpts) {
        if (so.spell.kind === 'heal') continue;
        const ev = AI.evalSpell(E, c, so.spell, so.slot);
        if (!ev) continue;
        // Бережём ячейки: небольшой штраф за уровень
        const score = ev.ev - so.slot * 1.5;
        if (!best || score > best.score) best = { score, so, ev };
      }
      const weaponBest = AI.bestWeaponEV(E, c);
      if (best && best.score > weaponBest) {
        const r = await E.castSpell(c, best.so.spell.id, best.so.slot, { targets: best.ev.targets, point: best.ev.point });
        if (r.ok) {
          await AI.wait(opts);
          if (best.so.spell.cast === 'action') return;
        }
      }
    }
    if (t.actions <= 0) return;

    // Атаки оружием: выбор цели и позиции
    await AI.weaponPhase(E, c, opts);
  };

  AI.bestWeaponEV = function (E, c) {
    let best = 0;
    for (const o of AI.enemies(E, c)) {
      for (const set of AI.attackSets(c, E)) {
        best = Math.max(best, AI.setEV(E, c, set, o, false) * 0.9, AI.setEV(E, c, set, o, true));
      }
    }
    return best;
  };

  AI.weaponPhase = async function (E, c, opts) {
    const B = E.B;
    const t = B.turn;
    const enemies = AI.enemies(E, c);
    const fly = E.canFly(c);
    const M = G.reach(B, c, 200, { fly, avoidHazards: true });
    const sets = AI.attackSets(c, E);
    if (!sets.length) return;

    let plan = null;
    for (const o of enemies) {
      for (const set of sets) {
        const ids = set.map((id) => c.attacks.find((a) => a.id === id)).filter(Boolean);
        const hasMelee = ids.some((a) => a.kind !== 'ranged');
        const allRangedCapable = ids.every((a) => a.kind !== 'melee');
        // Рукопашная
        if (hasMelee && ids.every((a) => a.kind !== 'ranged')) {
          const reach = Math.min(...ids.map((a) => a.reach || 5));
          const cell = AI.bestCellFor(E, c, M, o, reach, false, false);
          if (cell) {
            const ev = AI.setEV(E, c, set, o, false);
            const turns = Math.max(0, Math.ceil((cell.cost * 5 - t.move) / Math.max(5, E.speedOf(c))));
            const score = ev / (1 + turns * 1.5) - (o.hp > 0 ? 0 : 5) + (o.hp <= ev ? 3 : 0);
            if (!plan || score > plan.score) plan = { score, tgt: o, set, cell, ranged: false, reachable: cell.cost * 5 <= t.move, cost: cell.cost };
          }
        }
        // Дальнобойная
        if (allRangedCapable) {
          const rng = Math.min(...ids.map((a) => (a.range ? a.range[0] : 0)));
          if (rng > 0) {
            const cell = AI.bestCellFor(E, c, M, o, rng, true, true);
            if (cell) {
              const ev = AI.setEV(E, c, set, o, true);
              const reachable = cell.cost * 5 <= t.move;
              const score = (reachable ? ev : ev * 0.3) + (o.hp <= ev ? 3 : 0) + 0.5;
              if (!plan || score > plan.score) plan = { score, tgt: o, set, cell, ranged: true, reachable, cost: cell.cost };
            }
          }
        }
      }
    }
    if (!plan) {
      // Нет пути — просто приближаемся
      const o = enemies.sort((a, b) => G.distFt(c, a) - G.distFt(c, b))[0];
      if (o) await AI.approach(E, c, o, opts);
      return;
    }
    // Шустрый побег: отойти перед стрельбой
    if (plan.ranged && c.flags.nimbleEscape && t.bonus && enemies.some((o) => G.distFt(c, o) <= 5)) {
      E.disengage(c, 'bonus');
    }
    if (!plan.reachable) {
      if (!plan.ranged) {
        // Рывок к цели
        const path = AI.realPath(E, c, M, plan.cell.x, plan.cell.y, t.move);
        if (path && path.length > 1) await E.moveAlong(c, path);
        if (c.dead || c.hp <= 0) return;
        if (t.actions > 0 && G.distFt(c, plan.tgt) > (Math.min(...plan.set.map((id) => (c.attacks.find((a) => a.id === id) || {}).reach || 5)))) {
          E.dash(c);
          const M2 = G.reach(B, c, 200, { fly, avoidHazards: true });
          const cell2 = AI.bestCellFor(E, c, M2, plan.tgt, 5, false, false);
          if (cell2) await AI.moveTo(E, c, M2, cell2.x, cell2.y);
        }
        await AI.wait(opts);
        return;
      }
      // Дальнобойник далеко — подходим максимально
      const path = AI.realPath(E, c, M, plan.cell.x, plan.cell.y, t.move);
      if (path && path.length > 1) await E.moveAlong(c, path);
    } else {
      await AI.moveTo(E, c, M, plan.cell.x, plan.cell.y);
    }
    if (c.dead || c.hp <= 0 || B.phase !== 'combat') return;
    await AI.wait(opts);
    await AI.executeSet(E, c, plan.set, plan.tgt, opts);
  };

  AI.approach = async function (E, c, o, opts) {
    const B = E.B;
    const t = B.turn;
    const fly = E.canFly(c);
    const M = G.reach(B, c, 400, { fly, avoidHazards: true, ignoreCreatures: true });
    const cell = AI.bestCellFor(E, c, M, o, 5, false, false);
    if (!cell) return;
    const M2 = G.reach(B, c, Math.floor(t.move / 5), { fly, avoidHazards: true });
    // Ближайшая к цели достижимая клетка
    let best = null;
    for (const rec of M2.values()) {
      if (!G.canEndAt(B, c, rec.x, rec.y)) continue;
      const d = G.distFtAt(c, rec.x, rec.y, o);
      if (!best || d < best.d) best = { x: rec.x, y: rec.y, d };
    }
    if (best) await AI.moveTo(E, c, M2, best.x, best.y);
    if (t.actions > 0 && !c.dead) {
      E.dash(c);
      const M3 = G.reach(B, c, Math.floor(t.move / 5), { fly, avoidHazards: true });
      let b2 = null;
      for (const rec of M3.values()) {
        if (!G.canEndAt(B, c, rec.x, rec.y)) continue;
        const d = G.distFtAt(c, rec.x, rec.y, o);
        if (!b2 || d < b2.d) b2 = { x: rec.x, y: rec.y, d };
      }
      if (b2) await AI.moveTo(E, c, M3, b2.x, b2.y);
    }
    await AI.wait(opts);
  };

  AI.executeSet = async function (E, c, set, mainTgt, opts) {
    const B = E.B;
    const queue = set.slice();
    const usedTargets = {};
    while (queue.length && B.phase === 'combat' && !c.dead && c.hp > 0 && !E.incap(c)) {
      const id = queue.shift();
      const atk = c.attacks.find((a) => a.id === id);
      const special = !atk && c.specials.find((s) => s.id === id);
      let tgt = mainTgt && !mainTgt.dead && mainTgt.hp > 0 ? mainTgt : null;
      if (atk) {
        if (!tgt || !E.attackInfo(c, atk, tgt).ok) {
          const cands = AI.enemies(E, c).filter((o) => E.attackInfo(c, atk, o).ok);
          cands.sort((a, b) => a.hp - b.hp);
          tgt = cands[0] || null;
        }
        // Тираннозавр: хвост по другой цели
        if ((c.refId === 'trex' || c.refId === 'tyrannosaurus-rex') && id === 'tail' && usedTargets.bite && tgt && tgt.uid === usedTargets.bite) {
          const alt = AI.enemies(E, c).filter((o) => o.uid !== tgt.uid && E.attackInfo(c, atk, o).ok)[0];
          tgt = alt || null;
        }
      } else if (special && special.type === 'gaze') {
        if (!tgt || G.distFt(c, tgt) > special.range) tgt = AI.enemies(E, c).find((o) => G.distFt(c, o) <= special.range) || null;
      }
      if (!tgt && !(special && special.type === 'aoeCondition')) {
        // Цель недоступна — пропускаем эту атаку
        const t = B.turn;
        if (t.pool) {
          const i = t.pool.indexOf(id);
          if (i >= 0) {
            t.pool.splice(i, 1);
            t.attacksLeft = t.pool.length;
          }
        } else if (t.attacksLeft > 0) t.attacksLeft--;
        continue;
      }
      const r = await E.doAttack(c, id, tgt);
      if (r && r.ok === false) continue;
      usedTargets[id] = tgt && tgt.uid;
      await AI.wait(opts);
    }
    // Атака по возможности/реакции и прочее — нет
    const t = B.turn;
    if (t && t.uid === c.uid) {
      t.attacksLeft = 0;
      t.pool = null;
    }
  };

  AI.bonusPhase = async function (E, c, opts) {
    const B = E.B;
    const t = B.turn;
    if (!t || !t.bonus || c.dead || c.hp <= 0) return;
    // Неистовство гнолла
    if (c.flags.rampage && t.rampage) {
      await E.useFeature(c, 'rampage');
      const bite = c.attacks.find((a) => a.id === 'bite');
      const o = AI.enemies(E, c).find((x) => G.distFt(c, x) <= 5);
      if (bite && o) await E.doAttack(c, 'bite', o, { bonus: true });
      return;
    }
    // Божественное оружие
    if (E.hasEff(c, 'spiritualWeapon') && !t.bonusSpell) {
      const o = AI.enemies(E, c).filter((x) => G.distFt(c, x) <= 60).sort((a, b) => a.hp - b.hp)[0];
      if (o) {
        const r = await E.useFeature(c, 'spiritualWeapon');
        if (r.ok) await E.doAttack(c, 'spiritualWeaponAtk', o, { bonus: true });
        return;
      }
    }
    // Бонусные заклинания (божественное оружие, лечащее слово)
    for (const so of AI.spellOptions(E, c)) {
      if (so.spell.cast !== 'bonus') continue;
      const ev = AI.evalSpell(E, c, so.spell, so.slot);
      if (ev && ev.ev > 4) {
        const r = await E.castSpell(c, so.spell.id, so.slot, { targets: ev.targets, point: ev.point });
        if (r.ok) return;
      }
    }
    // Гоблин: отойти после атаки
    if (c.flags.nimbleEscape && AI.enemies(E, c).some((o) => G.distFt(c, o) <= 5) && c.attacks.some((a) => a.kind === 'ranged')) {
      E.disengage(c, 'bonus');
      const fly = E.canFly(c);
      const M = G.reach(B, c, Math.floor(t.move / 5), { fly, avoidHazards: true });
      let best = null;
      for (const rec of M.values()) {
        if (!G.canEndAt(B, c, rec.x, rec.y)) continue;
        const dn = Math.min(...AI.enemies(E, c).map((o) => G.distFtAt(c, rec.x, rec.y, o)));
        if (!best || dn > best.dn) best = { x: rec.x, y: rec.y, dn };
      }
      if (best) await AI.moveTo(E, c, M, best.x, best.y);
    }
  };

  D.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
