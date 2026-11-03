/* Анимация броска к20 поверх поля */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});
  const U = D.U;
  const el = U.el;

  const D20_SVG = (color) =>
    '<svg viewBox="0 0 100 100"><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="' + color + '" stroke="#000" stroke-width="3"/>' +
    '<polygon points="50,22 78,68 22,68" fill="rgba(255,255,255,0.12)" stroke="rgba(0,0,0,0.55)" stroke-width="2"/>' +
    '<line x1="50" y1="3" x2="50" y2="22" stroke="rgba(0,0,0,0.5)" stroke-width="2"/><line x1="93" y1="27" x2="78" y2="68" stroke="rgba(0,0,0,0.5)" stroke-width="2"/>' +
    '<line x1="7" y1="27" x2="22" y2="68" stroke="rgba(0,0,0,0.5)" stroke-width="2"/><line x1="50" y1="97" x2="22" y2="68" stroke="rgba(0,0,0,0.5)" stroke-width="2"/>' +
    '<line x1="50" y1="97" x2="78" y2="68" stroke="rgba(0,0,0,0.5)" stroke-width="2"/></svg>';

  function DiceBox(container) {
    this.container = container;
    this.queue = Promise.resolve();
    this.speed = 'normal';
  }

  DiceBox.prototype.show = function (info, speedOverride) {
    const speed = speedOverride || this.speed;
    if (speed === 'off') return Promise.resolve();
    const run = () => this._show(info, speed);
    this.queue = this.queue.then(run, run);
    return this.queue;
  };

  DiceBox.prototype._show = function (info, speed) {
    const spin = speed === 'fast' ? 220 : 600;
    const hold = speed === 'fast' ? 350 : 900;
    const box = el('div', { class: 'dice-overlay' });
    const rolls = info.d20.rolls;
    const kept = info.d20.value;
    const color = info.kind === 'save' || info.kind === 'death' ? '#4a6fb5' : info.kind === 'check' ? '#4a8a5a' : info.kind === 'init' ? '#8a6a2a' : '#a32a20';
    const dice = rolls.map(() => {
      const d = el('div', { class: 'die rolling', html: D20_SVG(color) });
      d.appendChild(el('div', { class: 'v' }, '?'));
      return d;
    });
    const actorName = info.actor ? info.actor.name : '';
    const info1 = el('div', { class: 'l' }, actorName + (info.target ? ' → ' + info.target.name : '') + ' · ' + (info.label || ''));
    const info2 = el('div', { class: 't' }, '…');
    const info3 = el('div', { class: 'l' }, '');
    box.appendChild(el('div', { class: 'row' }, dice));
    box.appendChild(el('div', { class: 'info' }, info1, info2, info3));
    this.container.appendChild(box);
    const vals = dice.map((d) => d.querySelector('.v'));
    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - t0;
        if (t < spin) {
          vals.forEach((v) => (v.textContent = 1 + Math.floor(Math.random() * 20)));
          setTimeout(tick, 50);
          return;
        }
        dice.forEach((d, i) => {
          d.classList.remove('rolling');
          vals[i].textContent = rolls[i];
          if (rolls.length > 1 && rolls[i] !== kept) d.classList.add('drop');
          if (rolls.length > 1 && rolls[0] === rolls[1] && i === 1) d.classList.add('drop');
        });
        const nat20 = kept === 20;
        const nat1 = kept === 1;
        let res = '';
        let cls = '';
        if (info.kind === 'attack') {
          res = info.crit ? 'КРИТ!' : info.ok ? 'Попадание' : 'Промах';
          cls = info.ok ? 'good' : 'bad';
        } else if (info.kind === 'save' || info.kind === 'death') {
          res = info.ok ? 'Успех' : 'Провал';
          cls = info.ok ? 'good' : 'bad';
        } else if (info.vs != null) {
          res = info.total >= info.vs ? 'Успех' : 'Провал';
          cls = info.total >= info.vs ? 'good' : 'bad';
        }
        info2.innerHTML = '<span class="' + (nat20 ? 'warn' : nat1 ? 'bad' : '') + '">' + kept + '</span>' + (info.bonus ? ' ' + U.fmtMod(info.bonus) : '') + ' = ' + info.total + (res ? ' <span class="' + cls + '">' + res + '</span>' : '');
        info3.textContent = (info.vs != null ? (info.kind === 'attack' ? 'против КД ' : 'против Сл ') + info.vs : '') + (info.d20.mode > 0 ? ' · преимущество' : info.d20.mode < 0 ? ' · помеха' : '');
        setTimeout(() => {
          box.style.transition = 'opacity 0.2s';
          box.style.opacity = '0';
          setTimeout(() => box.remove(), 200);
          resolve();
        }, hold);
      };
      tick();
    });
  };

  D.DiceBox = DiceBox;
})(typeof window !== 'undefined' ? window : globalThis);
