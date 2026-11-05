# -*- coding: utf-8 -*-
"""Извлекает нужные иконки game-icons.net (CC BY 3.0, Lorc, Delapouite и др.) в src/js/data/icons.js.

Использование:
    python3 tools/srd/make_icons.py путь/к/@iconify-json/game-icons/icons.json
"""
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icons_map import EXPLICIT, TYPE_FALLBACK  # noqa

EXTRA = [
    # расы
    'person', 'dwarf-face', 'elf-helmet', 'barefoot', 'dragon-head', 'bad-gnome', 'elf-ear', 'orc-head', 'devil-mask',
    # классы
    'barbarian', 'lyre', 'holy-symbol', 'oak-leaf', 'crossed-swords', 'monk-face', 'templar-shield', 'bow-arrow', 'rogue',
    'fire-spell-cast', 'warlock-eye', 'wizard-staff',
    # предметы и интерфейс
    'breastplate', 'round-shield', 'broadsword', 'ring', 'gem-pendant', 'cloak', 'boots', 'gauntlet', 'belt', 'health-potion',
    'crystal-wand', 'unstable-orb', 'rune-stone', 'bracers', 'headband-knot', 'helmet', 'spell-book', 'feather', 'dice-twenty-faces-twenty',
    'skull-crossed-bones', 'spiked-dragon-head', 'dragon-breath', 'cowled', 'magic-potion', 'gems', 'crown', 'eye-shield', 'winged-sword',
    'lightning-bow', 'battle-axe', 'warhammer', 'flanged-mace', 'spears', 'crossbow', 'plain-dagger', 'magic-shield', 'heart-necklace',
]


def paths(body):
    ds = re.findall(r'\sd="([^"]+)"', body)
    other = re.sub(r'<path[^>]*/>', '', body).strip()
    return ' '.join(ds), other


def main():
    data = json.load(open(sys.argv[1], encoding='utf-8'))['icons']
    need = set(EXPLICIT.values()) | set(TYPE_FALLBACK.values()) | set(EXTRA)
    out = {}
    for n in sorted(need):
        if n not in data:
            print('нет иконки', n)
            continue
        d, other = paths(data[n]['body'])
        if other:
            print('сложная иконка', n, other[:80])
        out[n] = d
    js = ('/* Иконки game-icons.net — авторы Lorc, Delapouite и др., лицензия CC BY 3.0 (https://game-icons.net). Холст 512×512. */\n'
          '(function (root) {\n  var D = (root.DND = root.DND || {});\n  D.ICONS = ' + json.dumps(out, separators=(',', ':')) + ';\n'
          "})(typeof window !== 'undefined' ? window : globalThis);\n")
    p = os.path.join(ROOT, 'src', 'js', 'data', 'icons.js')
    open(p, 'w').write(js)
    print('иконок:', len(out), 'размер:', len(js))


if __name__ == '__main__':
    main()
