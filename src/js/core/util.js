/* Общие утилиты и пространство имён DND */
(function (root) {
  'use strict';
  const D = (root.DND = root.DND || {});

  const U = {};

  U.uid = function (prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  };

  U.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  U.mod = (score) => Math.floor((score - 10) / 2);
  U.fmtMod = (m) => (m >= 0 ? '+' + m : String(m));
  U.profBonus = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
  U.deepClone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  U.sum = (arr) => arr.reduce((a, b) => a + b, 0);
  U.byId = (list, id) => list.find((x) => x.id === id);
  U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  U.escapeHtml = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  /* Детерминированный хэш для процедурной отрисовки */
  U.hash2 = function (x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + (seed || 0) * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295;
  };

  /* Склонение: 1 хит, 2 хита, 5 хитов */
  U.plural = function (n, one, few, many) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };

  /* ---------- Хранилище ---------- */
  const mem = {};
  U.store = {
    get(key, def) {
      try {
        const raw = root.localStorage ? root.localStorage.getItem('dnd.' + key) : mem[key];
        if (raw == null) return def;
        return JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },
    set(key, value) {
      const raw = JSON.stringify(value);
      try {
        if (root.localStorage) root.localStorage.setItem('dnd.' + key, raw);
        else mem[key] = raw;
      } catch (e) {
        mem[key] = raw;
        console.warn('Не удалось сохранить', key, e);
      }
    },
    remove(key) {
      try {
        if (root.localStorage) root.localStorage.removeItem('dnd.' + key);
        delete mem[key];
      } catch (e) {
        delete mem[key];
      }
    },
  };

  /* ---------- Файлы (экспорт/импорт JSON) ---------- */
  U.downloadJSON = function (filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  };

  U.pickFile = function (accept) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept || '.json,application/json';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        const reader = new FileReader();
        if ((accept || '').includes('image')) {
          reader.onload = () => resolve({ name: f.name, data: reader.result });
          reader.readAsDataURL(f);
        } else {
          reader.onload = () => resolve({ name: f.name, data: reader.result });
          reader.readAsText(f, 'utf-8');
        }
      };
      inp.click();
    });
  };

  /* ---------- DOM-помощник ---------- */
  U.el = function (tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'value') e.value = v;
        else if (k === 'checked') e.checked = !!v;
        else if (k === 'disabled') e.disabled = !!v;
        else if (k === 'selected') e.selected = !!v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  };

  U.clear = function (node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  };

  U.select = function (options, value, onChange, attrs) {
    const s = U.el('select', attrs || {});
    for (const o of options) {
      const opt = U.el('option', { value: o.value }, o.label);
      if (String(o.value) === String(value)) opt.selected = true;
      if (o.disabled) opt.disabled = true;
      s.appendChild(opt);
    }
    if (onChange) s.addEventListener('change', () => onChange(s.value));
    return s;
  };

  D.U = U;
})(typeof window !== 'undefined' ? window : globalThis);
