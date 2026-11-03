/* Кости: разбор формул вида "2d6+3", броски d20 с преимуществом/помехой */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const Dice = {};
  let rng = Math.random;

  Dice.setRng = function (fn) {
    rng = fn || Math.random;
  };

  Dice.die = function (sides) {
    return 1 + Math.floor(rng() * sides);
  };

  /* Разбор формулы: возвращает {terms:[{count,sides,sign}], bonus} */
  Dice.parse = function (formula) {
    const f = String(formula || '0').replace(/\s+/g, '').toLowerCase().replace(/к/g, 'd');
    const out = { terms: [], bonus: 0 };
    const re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g;
    let m;
    while ((m = re.exec(f))) {
      if (m[3]) {
        const sign = m[1] === '-' ? -1 : 1;
        out.terms.push({ count: m[2] === '' ? 1 : parseInt(m[2], 10), sides: parseInt(m[3], 10), sign });
      } else if (m[5]) {
        out.bonus += (m[4] === '-' ? -1 : 1) * parseInt(m[5], 10);
      }
    }
    return out;
  };

  /* Бросок по формуле. opts: {crit: удвоить кубы, rerollBelow: N (Боевой стиль "Сражение большим оружием")} */
  Dice.roll = function (formula, opts) {
    opts = opts || {};
    const p = Dice.parse(formula);
    const rolls = [];
    let total = p.bonus;
    for (const t of p.terms) {
      const count = t.count * (opts.crit ? 2 : 1);
      for (let i = 0; i < count; i++) {
        let r = Dice.die(t.sides);
        if (opts.rerollBelow && r <= opts.rerollBelow) {
          r = Dice.die(t.sides);
        }
        rolls.push({ sides: t.sides, value: r, sign: t.sign });
        total += t.sign * r;
      }
    }
    return { total, rolls, bonus: p.bonus, formula: String(formula) };
  };

  Dice.average = function (formula) {
    const p = Dice.parse(formula);
    let avg = p.bonus;
    for (const t of p.terms) avg += t.sign * t.count * (t.sides + 1) / 2;
    return avg;
  };

  Dice.max = function (formula) {
    const p = Dice.parse(formula);
    let mx = p.bonus;
    for (const t of p.terms) mx += t.sign * t.count * t.sides;
    return mx;
  };

  /* Бросок d20. mode: 1 = преимущество, -1 = помеха, 0 = обычный. lucky — везение полурослика */
  Dice.d20 = function (mode, lucky) {
    const rollOne = () => {
      let r = Dice.die(20);
      let rerolled = false;
      if (lucky && r === 1) {
        r = Dice.die(20);
        rerolled = true;
      }
      return { r, rerolled };
    };
    const a = rollOne();
    if (!mode) return { value: a.r, rolls: [a.r], mode: 0, lucky: a.rerolled };
    const b = rollOne();
    const value = mode > 0 ? Math.max(a.r, b.r) : Math.min(a.r, b.r);
    return { value, rolls: [a.r, b.r], mode, lucky: a.rerolled || b.rerolled };
  };

  /* 4d6, отбросить наименьший — для генерации характеристик */
  Dice.abilityRoll = function () {
    const r = [Dice.die(6), Dice.die(6), Dice.die(6), Dice.die(6)].sort((a, b) => b - a);
    return { total: r[0] + r[1] + r[2], rolls: r };
  };

  Dice.fmtRolls = function (res) {
    if (!res || !res.rolls) return '';
    const parts = res.rolls.map((r) => (r.sign < 0 ? '-' : '') + r.value);
    let s = '[' + parts.join(', ') + ']';
    if (res.bonus) s += (res.bonus > 0 ? ' + ' : ' − ') + Math.abs(res.bonus);
    return s;
  };

  D.Dice = Dice;
})(typeof window !== 'undefined' ? window : globalThis);
