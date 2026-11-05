# -*- coding: utf-8 -*-
"""Конвертер заклинаний SRD 5.1 (5e-database) → src/js/data/spells-srd.js

Запуск: python3 tools/srd/spells.py путь/к/5e-SRD-Spells.json
Заклинания, уже описанные вручную в spells.js (по полю en), не дублируются —
для них добавляется только справочная информация (время, дистанция, длительность).
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from ru_spells import SP, SUBCLASS_SPELLS, INFO_EXTRA  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CLASSES = {'bard', 'cleric', 'druid', 'paladin', 'ranger', 'sorcerer', 'warlock', 'wizard'}


def norm(s):
    return re.sub(r'[^a-z]', '', s.lower())


def ft(rng):
    r = rng.lower()
    if r == 'self':
        return 0
    if r == 'touch':
        return 5
    m = re.match(r'(\d+) feet', r)
    if m:
        return int(m.group(1))
    m = re.match(r'(\d+) miles?', r)
    if m:
        return int(m.group(1)) * 5280
    return 9999


def ru_range(rng):
    r = rng.lower()
    if r == 'self':
        return 'на себя'
    if r == 'touch':
        return 'касание'
    m = re.match(r'(\d+) feet', r)
    if m:
        return m.group(1) + ' фт.'
    m = re.match(r'(\d+) miles?', r)
    if m:
        n = int(m.group(1))
        return '%d %s' % (n, 'миля' if n == 1 else 'миль')
    return {'sight': 'в пределах видимости', 'unlimited': 'не ограничена', 'special': 'особая'}.get(r, rng)


def unit_ru(n, unit):
    unit = unit.rstrip('s')
    return {'minute': '%d мин.', 'hour': '%d ч.', 'day': '%d дн.', 'round': '%d раунд', 'action': '%d действие'}.get(unit, '%d ' + unit) % n


def ru_time(t):
    t = t.lower()
    if t == '1 action':
        return '1 действие'
    if t == '1 bonus action':
        return '1 бонусное действие'
    if t == '1 reaction':
        return '1 реакция'
    m = re.match(r'(\d+) (\w+)', t)
    return unit_ru(int(m.group(1)), m.group(2)) if m else t


def ru_dur(d, conc):
    dl = d.lower()
    if dl == 'instantaneous':
        out = 'мгновенная'
    elif dl == 'until dispelled':
        out = 'пока не рассеется'
    elif dl == 'special':
        out = 'особая'
    else:
        m = re.match(r'(up to )?(\d+) (\w+)', dl)
        out = (('до ' if m.group(1) else '') + unit_ru(int(m.group(2)), m.group(3))) if m else d
    return ('концентрация, ' + out) if conc else out


def rounds(d):
    dl = d.lower()
    m = re.match(r'(up to )?(\d+) (\w+)', dl)
    if not m:
        return None if dl == 'instantaneous' else 6000
    n, u = int(m.group(2)), m.group(3).rstrip('s')
    return {'round': n, 'minute': n * 10, 'hour': n * 600, 'day': n * 14400}.get(u)


def dice(s):
    s = str(s).replace(' ', '').replace('+MOD', '')
    return s


def dice_diff(a, b):
    ma = re.match(r'^(\d+)d(\d+)', a)
    mb = re.match(r'^(\d+)d(\d+)', b)
    if ma and mb and ma.group(2) == mb.group(2) and int(mb.group(1)) > int(ma.group(1)):
        return '%dd%s' % (int(mb.group(1)) - int(ma.group(1)), ma.group(2))
    return None


def area_of(aoe, rng):
    t, size = aoe['type'], aoe['size']
    shape = {'sphere': 'sphere', 'cylinder': 'sphere', 'cube': 'square', 'cone': 'cone', 'line': 'line'}[t]
    origin = 'self' if rng.lower() == 'self' and shape in ('cone', 'line') else ('self' if rng.lower() == 'self' else 'point')
    if origin == 'self' and shape == 'sphere':
        shape = 'aura'
    return {'shape': shape, 'size': size, 'origin': origin}


def main(path):
    src = json.load(open(path, encoding='utf8'))
    js = open(os.path.join(ROOT, 'src', 'js', 'data', 'spells.js'), encoding='utf8').read()
    have_en = set(a or b for a, b in re.findall(r'en: "([^"]+)"|en: \'([^\']+)\'', js))
    have_ids = set(re.findall(r"\{ id: '([a-z]+)'", js))
    sp_ci = {k.lower(): v for k, v in SP.items()}
    extra = []
    info = {}
    missing_tr = []
    for s in src:
        en = s['name']
        conc = bool(s.get('concentration'))
        info[en] = {
            'time': ru_time(s['casting_time']), 'range': ru_range(s['range']), 'dur': ru_dur(s['duration'], conc),
            'comp': ', '.join({'V': 'В', 'S': 'С', 'M': 'М'}[c] for c in s.get('components', [])) + (' (' + s['material'].rstrip('.') + ')' if False else ''),
            'ritual': bool(s.get('ritual')),
        }
        if en in have_en:
            continue
        tr = sp_ci.get(en.lower())
        if not tr:
            missing_tr.append(en)
            continue
        name, desc, mech = tr
        mech = dict(mech)
        sid = norm(en)
        if sid in have_ids:
            sid += 'srd'
        ct = s['casting_time'].lower()
        cast = {'1 action': 'action', '1 bonus action': 'bonus', '1 reaction': 'reaction'}.get(ct, 'long')
        e = {
            'id': sid, 'en': en, 'name': name, 'level': s['level'], 'school': s['school']['index'], 'cast': cast,
            'range': ft(s['range']), 'classes': sorted(c['index'] for c in s['classes'] if c['index'] in CLASSES),
        }
        if cast == 'long':
            e['castTime'] = ru_time(s['casting_time'])
        if s.get('ritual'):
            e['ritual'] = True
        if conc:
            e['concentration'] = True
        r = rounds(s['duration'])
        if r:
            e['rounds'] = r
        # Урон
        dmg = s.get('damage')
        if dmg and 'damage' not in mech:
            tp = dmg.get('damage_type', {}).get('index', 'force')
            if dmg.get('damage_at_slot_level'):
                d = dmg['damage_at_slot_level']
                base = dice(d.get(str(s['level'])) or list(d.values())[0])
                e['damage'] = [{'dice': base, 'type': tp}]
                nxt = d.get(str(s['level'] + 1))
                if nxt:
                    up = dice_diff(base, dice(nxt))
                    if up:
                        e['upcast'] = {'dice': up}
                    else:
                        nx2 = d.get(str(s['level'] + 2))
                        if nx2 and dice_diff(base, dice(nx2)):
                            e['upcast'] = {'dice': dice_diff(base, dice(nx2)), 'every': 2}
            elif dmg.get('damage_at_character_level'):
                d = dmg['damage_at_character_level']
                e['damage'] = [{'dice': dice(d.get('1') or list(d.values())[0]), 'type': tp}]
                e['scale'] = 'dice'
        elif mech.get('damage') is None and 'damage' in mech:
            mech.pop('damage')
        heal = s.get('heal_at_slot_level')
        if heal:
            base = dice(heal.get(str(s['level'])) or list(heal.values())[0])
            e['heal'] = base
            nxt = heal.get(str(s['level'] + 1))
            if nxt and dice_diff(base, dice(nxt)):
                e['upcast'] = {'dice': dice_diff(base, dice(nxt))}
        if s.get('dc'):
            e['save'] = s['dc']['dc_type']['index']
            e['half'] = s['dc'].get('dc_success') == 'half'
        if s.get('attack_type'):
            e['attack'] = s['attack_type']
        if s.get('area_of_effect'):
            e['area'] = area_of(s['area_of_effect'], s['range'])
        # Вид
        kind = mech.get('kind')
        if not kind:
            if e.get('attack') and e.get('damage'):
                kind = 'attack'
            elif e.get('damage') and e.get('save'):
                kind = 'save'
            elif e.get('heal'):
                kind = 'heal'
            else:
                kind = 'utility'
        e['kind'] = kind
        if kind == 'heal' and 'count' not in mech and 'heal' in e and 'mass' in en.lower():
            e['count'] = 6
        # Переопределения из таблицы
        for k, v in mech.items():
            if k == 'upcast' and 'upcast' in e:
                e['upcast'] = dict(e['upcast'], **v)
            else:
                e[k] = v
        if 'target' not in e:
            if (kind in ('save', 'control', 'sleep') or e.get('zone')) and e.get('area'):
                e['target'] = 'area'
            elif e['range'] == 0:
                e['target'] = 'self'
            else:
                e['target'] = 'creature' if kind != 'utility' else 'self'
        if e.get('target') == 'area' and not e.get('area'):
            e['area'] = {'shape': 'sphere', 'size': 10, 'origin': 'point'}
        if kind == 'utility':
            for k in ('damage', 'save', 'half', 'attack', 'heal', 'upcast', 'scale'):
                e.pop(k, None)
        e['desc'] = desc
        extra.append(e)
    for en, inf in INFO_EXTRA.items():
        info.setdefault(en, inf)
    if missing_tr:
        print('Нет перевода:', missing_tr)
    out = os.path.join(ROOT, 'src', 'js', 'data', 'spells-srd.js')
    with open(out, 'w', encoding='utf8') as f:
        f.write('/* Остальные заклинания SRD 5.1 (CC-BY-4.0) — сгенерировано tools/srd/spells.py. Не редактировать вручную. */\n')
        f.write('(function (root) {\n  \'use strict\';\n  const D = (root.DND = root.DND || {});\n')
        f.write('  const EXTRA = ' + json.dumps(extra, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('  const INFO = ' + json.dumps(info, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('  D.SUBCLASS_SPELLS = ' + json.dumps(SUBCLASS_SPELLS, ensure_ascii=False, separators=(',', ':')) + ';\n')
        f.write('  for (const s of EXTRA) if (!D.spell(s.id)) D.SPELLS.push(s);\n')
        f.write('  for (const s of D.SPELLS) if (INFO[s.en]) s.info = INFO[s.en];\n')
        f.write('  for (const cls of D.CLASSES || []) for (const sc of cls.subclasses || []) if (D.SUBCLASS_SPELLS[sc.id]) sc.spells = D.SUBCLASS_SPELLS[sc.id];\n')
        f.write('})(typeof window !== \'undefined\' ? window : globalThis);\n')
    print('заклинаний добавлено:', len(extra), 'справка:', len(info), '->', out)
    kinds = {}
    for e in extra:
        kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
    print(kinds)


if __name__ == '__main__':
    main(sys.argv[1])
