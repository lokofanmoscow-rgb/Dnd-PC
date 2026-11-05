# -*- coding: utf-8 -*-
"""Конвертер бестиария SRD 5.1 (формат 5e-database) в src/js/data/srd-monsters.js.

Использование:
    python3 tools/srd/convert.py путь/к/5e-SRD-Monsters.json

Исходные данные: https://github.com/5e-bits/5e-database (src/2014/5e-SRD-Monsters.json),
содержимое SRD 5.1 © Wizards of the Coast, CC-BY-4.0. Перевод — терминология dnd.su.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ru_tables import NAMES, ATTACKS, ACTIONS, TYPES, SUBTYPES, ALIGN, LANG_WORDS, LANG_PHRASES, SENSES, SKILLS, ARMOR, SPELLS_RU, PARENS  # noqa
from ru_traits import T as TRAITS, DT, AB  # noqa
from ru_actions import ACT, LEG, REACT, breath_text, area_phrase  # noqa
from icons_map import icon_for  # noqa

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'js', 'data', 'srd-monsters.js')

NUMRE = re.compile(r'\d+d\d+(?:\s*[+-]\s*\d+)?|\d+')
ABI = {'str': 'Strength', 'dex': 'Dexterity', 'con': 'Constitution', 'int': 'Intelligence', 'wis': 'Wisdom', 'cha': 'Charisma'}
ABI_REV = {v: k for k, v in ABI.items()}
DMG_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder']
CONDS = ['blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious']
WARN = []


def ru_dice(s):
    s = re.sub(r'\s+', '', s)
    s = s.replace('d', 'к')
    return re.sub(r'([+-])', lambda mm: ' + ' if mm.group(1) == '+' else ' − ', s)


def nums(desc):
    out = []
    for x in NUMRE.findall(desc):
        out.append(ru_dice(x) if 'd' in x else x)
    return out


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def avg(dice):
    dice = re.sub(r'\s+', '', dice)
    tot = 0.0
    for sign, cnt, sides, flat in re.findall(r'([+-]?)(?:(\d*)d(\d+)|(\d+))', dice):
        k = -1 if sign == '-' else 1
        if sides:
            tot += k * int(cnt or 1) * (int(sides) + 1) / 2
        elif flat:
            tot += k * int(flat)
    return int(tot)


def cr_str(cr):
    return {0: '0', 0.125: '1/8', 0.25: '1/4', 0.5: '1/2'}.get(cr, str(int(cr)))


def tr_paren(name):
    base = re.sub(r'\s*\(.*?\)', '', name).strip()
    parens = re.findall(r'\((.*?)\)', name)
    out = []
    for p in parens:
        q = p
        for rx, rep in PARENS:
            q = re.sub(rx, rep, q)
        if re.search('[A-Za-z]', q):
            WARN.append('скобки: ' + p)
        out.append(q)
    return base, out


def ru_name(name, table):
    base, par = tr_paren(name)
    r = table.get(base)
    if r is None:
        WARN.append('нет перевода названия: ' + base)
        r = base
    return r + (' (' + '; '.join(par) + ')' if par else '')


def dmg_phrase(n, dice, typ):
    if dice.strip() == str(n) or not re.search(r'd', dice):
        return '%s %s' % (n, DT.get(typ, 'урона'))
    return '%s (%s) %s' % (n, ru_dice(dice), DT.get(typ, 'урона'))


# ---------------------------------------------------------------- атаки
RIDER_RULES = [
    (r"^,? ?(?:and )?[Tt]he target must (?:make (?:on )?a|succeed on a) DC (\d+) (\w+) saving throw, taking (\d+) \(([^)]+)\) (\w+) damage on a failed save, or half as much damage on a successful one\.?",
     lambda g: 'Цель совершает спасбросок %s со Сл %s, получая %s (%s) %s при провале или половину при успехе.' % (AB[g[1]], g[0], g[2], ru_dice(g[3]), DT[g[4]])),
    (r"^,? ?(?:and )?[Tt]he target must succeed on a DC (\d+) Constitution saving throw or take (\d+) \(([^)]+)\) (\w+) damage and become poisoned for (\d+) minute\.?",
     lambda g: 'Цель должна преуспеть в спасброске Телосложения со Сл %s, иначе получает %s (%s) %s и становится отравленной на %s мин.' % (g[0], g[1], ru_dice(g[2]), DT[g[3]], g[4])),
    (r"^,? ?(?:and )?[Tt]he target must succeed on a DC (\d+) Constitution saving throw or take (\d+) \(([^)]+)\) (\w+) damage\.?",
     lambda g: 'Цель должна преуспеть в спасброске Телосложения со Сл %s, иначе получает %s (%s) %s.' % (g[0], g[1], ru_dice(g[2]), DT[g[3]])),
    (r"^,? ?(?:and )?(?:[Tt]he target|it) must succeed on a DC (\d+) Constitution saving throw or (?:be|become) poisoned for (\d+) (minute|hour)s?\.?",
     lambda g: 'Цель должна преуспеть в спасброске Телосложения со Сл %s, иначе становится отравленной на %s %s.' % (g[0], g[1], 'мин.' if g[2] == 'minute' else 'ч.')),
    (r"^ ?The target must succeed on a DC (\d+) Constitution saving throw or become poisoned\.",
     lambda g: 'Цель должна преуспеть в спасброске Телосложения со Сл %s, иначе становится отравленной.' % g[0]),
    (r"^,? ?(?:and )?the target must succeed on a DC (\d+) Constitution saving throw or be poisoned\. The poison lasts until it is removed by the lesser restoration spell or similar magic\.?",
     lambda g: 'Цель должна преуспеть в спасброске Телосложения со Сл %s, иначе отравлена, пока яд не снимет малое восстановление или подобная магия.' % g[0]),
    (r"^ ?(?:The|A) (?:poisoned )?(?:target|creature) can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success\.?",
     lambda g: 'Цель может повторять спасбросок в конце каждого своего хода, оканчивая эффект при успехе.'),
    (r"^ ?While poisoned in this way, the target can't regain hit points(?:, and it takes (\d+) \(([^)]+)\) poison damage at the start of each of its turns)?\.?",
     lambda g: 'Пока отравлена так, цель не может восстанавливать хиты' + (', а в начале каждого своего хода получает %s (%s) урона ядом.' % (g[0], ru_dice(g[1])) if g[0] else '.')),
    (r"^ ?If the target is (?:a creature|a (Medium|Large|Huge) or smaller creature|(Medium|Large) or smaller), it must succeed on a DC (\d+) Strength saving throw or be knocked prone\.?",
     lambda g: 'Если цель — %sсущество, она должна преуспеть в спасброске Силы со Сл %s, иначе будет сбита с ног.' % (size_prefix(g[0] or g[1]), g[2])),
    (r"^ ?If the target is a creature, it must succeed on a DC (\d+) Strength saving throw or be pushed up to (\d+) feet away from the [\w ]+ and knocked prone\.?",
     lambda g: 'Если цель — существо, она должна преуспеть в спасброске Силы со Сл %s, иначе будет отброшена на %s фт. и сбита с ног.' % (g[0], g[1])),
    (r"^,? ?(?:and )?(?:[Ii]f the target is (?:a creature|a (Medium|Large|Huge) or smaller creature|(Medium|Large) or smaller), it is|[Tt]he (?:target|creature) is) grappled \(escape DC (\d+)\)\.?",
     lambda g: ('Если цель — %sсущество, она схвачена' % size_prefix(g[0] or g[1]) if (g[0] or g[1]) else 'Цель схвачена') + ' (Сл высвобождения %s).' % g[2]),
    (r"^ ?Until (?:this|the) grapple ends, the (?:target|creature) is restrained(?:,? and the [\w ]+? can't (?:bite|constrict|use its [\w ]+ on|smother|use the same tendril on) another target)?\.?",
     lambda g: 'Пока захват не окончен, цель опутана.'),
    (r"^ ?Until this grapple ends, the [\w ]+? can't (?:bite|use its tentacles on) another target\.?", lambda g: 'Пока захват не окончен, существо не может так атаковать другую цель.'),
    (r"^ ?The [\w ]+ has (two|ten) (claws|pincers|tentacles), each of which can grapple (?:only )?one target\.?",
     lambda g: 'У существа %s %s, каждая может держать только одну цель.' % ('две' if g[0] == 'two' else 'десять', {'claws': 'клешни', 'pincers': 'клешни', 'tentacles': 'щупалец'}[g[1]])),
    (r"^ ?If the target is a creature other than (an elf or undead|an undead), it must succeed on a DC (\d+) Constitution saving throw or be paralyzed for (\d+) minute\.?",
     lambda g: 'Если цель — существо, не являющееся %s, она должна преуспеть в спасброске Телосложения со Сл %s, иначе будет парализована на %s мин.' % ('эльфом или нежитью' if 'elf' in g[0] else 'нежитью', g[1], g[2])),
    (r"^ ?The target must succeed on a DC (\d+) Constitution saving throw or be paralyzed for (\d+) minute\.?",
     lambda g: 'Цель должна преуспеть в спасброске Телосложения со Сл %s, иначе будет парализована на %s мин.' % (g[0], g[1])),
    (r"^ ?(?:The target|If the target is a creature, it) must succeed on a DC (\d+) Constitution saving throw or (?:its hit point maximum is reduced|have its hit point maximum reduced) by an amount equal to the damage taken\.?",
     lambda g: 'Цель должна преуспеть в спасброске Телосложения со Сл %s, иначе её максимум хитов уменьшается на величину полученного урона.' % g[0]),
    (r"^ ?(?:This|The) reduction lasts until the (?:target|creature) finishes a long rest\.?", lambda g: 'Уменьшение длится до окончания продолжительного отдыха.'),
    (r"^ ?The reduction lasts until removed by the greater restoration spell or other magic\.?", lambda g: 'Уменьшение длится, пока его не снимет высшее восстановление или другая магия.'),
    (r"^ ?The target dies if this (?:effect|attack) reduces its hit point maximum to 0\.?", lambda g: 'Если максимум хитов падает до 0, цель умирает.'),
    (r"^ ?If the target is a humanoid, it must succeed on a DC (\d+) Constitution saving throw or be cursed with (\w+) lycanthropy\.?",
     lambda g: 'Если цель — гуманоид, она должна преуспеть в спасброске Телосложения со Сл %s, иначе будет проклята ликантропией.' % g[0]),
    (r"^ ?If the target is a creature or a flammable object, it ignites\. Until a (?:creature|target) takes an action to douse the fire, the target takes (\d+) \(([^)]+)\) fire damage at the (start|end) of each of its turns\.?",
     lambda g: 'Если цель — существо или горючий предмет, она воспламеняется: пока кто-нибудь не потушит огонь действием, цель получает %s (%s) урона огнём в %s каждого своего хода.' % (g[0], ru_dice(g[1]), 'начале' if g[2] == 'start' else 'конце')),
    (r"^ ?If the target is a flammable object that isn't being worn or carried, it also catches fire\.?", lambda g: 'Горючий предмет, который никто не носит, загорается.'),
    (r"^ ?If the poison damage reduces the target to 0 hit points, the target is stable but poisoned for 1 hour, even after regaining hit points, and is paralyzed while poisoned in this way\.?",
     lambda g: 'Если урон ядом опускает хиты цели до 0, она стабилизирована, но отравлена на 1 час (даже восстановив хиты) и парализована, пока отравлена так.'),
    (r"^ ?A creature reduced to 0 hit points by a swarm of centipedes is stable but poisoned for 1 hour, even after regaining hit points, and paralyzed while poisoned in this way\.?",
     lambda g: 'Существо, чьи хиты рой опустил до 0, стабилизировано, но отравлено на 1 час и парализовано, пока отравлено так.'),
    (r"^ ?The (?:target|creature) is restrained by webbing\. As an action, the restrained (?:target|creature) can make a DC (\d+) Strength check, (?:bursting|escaping from) the webbing on a success\.?",
     lambda g: 'Цель опутана паутиной. Действием она может совершить проверку Силы со Сл %s и при успехе освободиться.' % g[0]),
    (r"^ ?The webbing can also be attacked and destroyed \(AC (\d+); hp (\d+); vulnerability to fire damage; immunity to bludgeoning, poison, and psychic damage\)\.?",
     lambda g: 'Паутину можно атаковать и уничтожить (КД %s; %s хитов; уязвимость к огню; иммунитет к дробящему урону, яду и психической энергии).' % (g[0], g[1])),
    (r"^ ?The effect ends if the webbing is destroyed\. The webbing has AC (\d+), (\d+) hit points, is vulnerable to fire damage and immune to bludgeoning damage\.?",
     lambda g: 'Эффект оканчивается, если паутину уничтожить (КД %s, %s хитов, уязвимость к огню, иммунитет к дробящему урону).' % (g[0], g[1])),
    (r"^ ?Instead of dealing damage, the vampire can grapple the target \(escape DC (\d+)\)\.?", lambda g: 'Вместо урона вампир может схватить цель (Сл высвобождения %s).' % g[0]),
    (r"^ ?The target's hit point maximum is reduced by an amount equal to the necrotic damage taken, and the vampire regains hit points equal to that amount\.?",
     lambda g: 'Максимум хитов цели уменьшается на величину полученного урона некротической энергией, а вампир восстанавливает столько же хитов.'),
    (r"^ ?A humanoid slain in this way and then buried in the ground rises the following night as a vampire spawn under the vampire's control\.?",
     lambda g: 'Убитый так и погребённый гуманоид следующей ночью восстаёт отродьем вампира под его контролем.'),
    (r"^ ?If the target is a creature, it must succeed on a DC (\d+) Constitution saving throw or be cursed with mummy rot\.?",
     lambda g: 'Если цель — существо, она должна преуспеть в спасброске Телосложения со Сл %s, иначе будет проклята мумийной гнилью.' % g[0]),
    (r"^ ?The cursed target can't regain hit points, and its hit point maximum decreases by (\d+) \(([^)]+)\) for every (\d+) hours that elapse\. If the curse reduces the target's hit point maximum to 0, the target dies, and its body turns to dust\. The curse lasts until removed by the remove curse spell or other magic\.?",
     lambda g: 'Проклятая цель не может восстанавливать хиты, а её максимум хитов уменьшается на %s (%s) каждые %s ч. Если максимум падает до 0, цель умирает и рассыпается в прах. Проклятие снимается снятием проклятия или другой магией.' % (g[0], ru_dice(g[1]), g[2])),
]

RIDER_OVERRIDES = {
    'aboleth|Tentacle': 'Если цель — существо, она должна преуспеть в спасброске Телосложения со Сл 14, иначе заболевает. Болезнь проявляется через 1 минуту: кожа цели становится прозрачной и слизистой, цель не может восстанавливать хиты вне воды и получает 6 (1к12) урона кислотой каждые 10 минут без увлажнения. Болезнь снимает заклинание лечения болезней 6 уровня или выше.',
    'ankheg|Bite': 'Если цель — Большое или меньшее существо, она схвачена (Сл высвобождения 13). Пока захват не окончен, анхег может кусать только схваченную цель и совершает такие атаки с преимуществом.',
    'balor|Longsword': 'При критическом попадании балор бросает кости урона трижды, а не дважды.',
    'balor|Whip': 'Цель должна преуспеть в спасброске Силы со Сл 20, иначе притягивается к балору на 25 фт.',
    'bearded-devil|Glaive': 'Если цель — не нежить и не конструкт, она должна преуспеть в спасброске Телосложения со Сл 12, иначе получает адскую рану: теряет 5 (1к10) хитов в начале каждого своего хода. Каждое новое попадание этой атакой увеличивает урон раны на 5 (1к10). Рану можно закрыть действием успешной проверкой Мудрости (Медицина) со Сл 12 или магическим лечением.',
    'horned-devil|Tail': 'Если цель — не нежить и не конструкт, она должна преуспеть в спасброске Телосложения со Сл 17, иначе получает адскую рану: теряет 10 (3к6) хитов в начале каждого своего хода. Каждое новое попадание этой атакой увеличивает урон раны на 10 (3к6). Рану можно закрыть действием успешной проверкой Мудрости (Медицина) со Сл 12 или магическим лечением.',
    'behir|Constrict': 'Цель схвачена (Сл высвобождения 16), если бехир не сжимает другое существо, и опутана, пока захват не окончен.',
    'black-pudding|Pseudopod': 'Кроме того, немагический доспех цели частично растворяется и получает накопительный штраф −1 к КД; доспех разрушается, если его КД падает до 10.',
    'gray-ooze|Pseudopod': 'Если цель носит немагический металлический доспех, он частично разъедается и получает накопительный штраф −1 к КД; доспех разрушается, если его КД падает до 10.',
    'chain-devil|Chain': 'Цель схвачена (Сл высвобождения 14), если дьявол никого не держит. Пока захват не окончен, цель опутана и получает 7 (2к6) колющего урона в начале каждого своего хода.',
    'chuul|Pincer': 'Если цель — Большое или меньшее существо, а чуул не держит двух других существ, она схвачена (Сл высвобождения 14).',
    'cloaker|Bite': 'Если цель Большая или меньше, плащевик прикрепляется к ней. Если у атаки было преимущество, он обхватывает голову: цель ослеплена и не может дышать, пока он прикреплён. Прикреплённый плащевик атакует только эту цель и с преимуществом. Он может отцепиться, потратив 5 фт. перемещения; существо может действием оторвать его проверкой Силы со Сл 16.',
    'cockatrice|Bite': 'Цель должна преуспеть в спасброске Телосложения со Сл 11 против магического окаменения. При провале начинает каменеть и опутана; в конце своего следующего хода повторяет спасбросок: при успехе эффект оканчивается, при провале цель окаменевает на 24 часа.',
    'couatl|Bite': 'Цель должна преуспеть в спасброске Телосложения со Сл 13, иначе отравлена на 24 часа и, пока отравлена, без сознания. Другое существо может действием разбудить её.',
    'darkmantle|Crush': 'Мантия прикрепляется к цели. Если цель Средняя или меньше и у атаки было преимущество, мантия обволакивает её голову: цель ослеплена и не может дышать. Прикреплённая мантия атакует только эту цель с преимуществом, её скорость 0, и она перемещается вместе с целью. Отцепить её можно действием успешной проверкой Силы со Сл 13; сама она отцепляется, потратив 5 фт. перемещения.',
    'death-dog|Bite': 'Если цель — существо, она должна преуспеть в спасброске Телосложения со Сл 12 против болезни, иначе отравлена до излечения. Каждые 24 часа она повторяет спасбросок; при провале её максимум хитов уменьшается на 5 (1к10). Если максимум падает до 0, цель умирает.',
    'drow|Hand Crossbow': 'Цель должна преуспеть в спасброске Телосложения со Сл 13, иначе отравлена на 1 час. При провале на 5 и более она, пока отравлена так, без сознания; просыпается от урона или если её разбудят действием.',
    'giant-rat-diseased|Bite': 'Если цель — существо, она должна преуспеть в спасброске Телосложения со Сл 10, иначе заболевает: до излечения не восстанавливает хиты немагическим путём, а её максимум хитов уменьшается на 3 (1к6) каждые 24 часа. Если максимум падает до 0, цель умирает.',
    'gibbering-mouther|Bites': 'Если цель Средняя или меньше, она должна преуспеть в спасброске Силы со Сл 10, иначе будет сбита с ног. Убитая этим уроном цель поглощается ртом.',
    'homunculus|Bite': 'Цель должна преуспеть в спасброске Телосложения со Сл 10, иначе отравлена на 1 минуту. При провале на 5 и более она вместо этого отравлена на 5 (1к10) минут и, пока отравлена, без сознания.',
    'kraken|Bite': 'Если цель — схваченное кракеном Большое или меньшее существо, она проглочена, а захват оканчивается. Проглоченная цель ослеплена и опутана, имеет полное укрытие и в начале каждого хода кракена получает 42 (12к6) урона кислотой. Если кракен получает изнутри 50 или больше урона за ход, он должен преуспеть в спасброске Телосложения со Сл 25, иначе отрыгивает всех проглоченных.',
    'kraken|Tentacle': 'Цель схвачена (Сл высвобождения 18) и опутана, пока захват не окончен. У кракена десять щупалец, каждое может держать одну цель.',
    'lamia|Intoxicating Touch': 'Цель магически проклята на 1 час: пока проклятие действует, она совершает с помехой спасброски Мудрости и все проверки характеристик.',
    'marilith|Tail': 'Если цель Средняя или меньше, она схвачена (Сл высвобождения 19) и опутана, пока захват не окончен; марилит автоматически попадает по ней хвостом и не может атаковать хвостом другие цели.',
    'salamander|Tail': 'Цель схвачена (Сл высвобождения 14) и опутана, пока захват не окончен; саламандра автоматически попадает по ней хвостом и не может атаковать хвостом другие цели.',
    'merrow|Harpoon': 'Если цель Огромная или меньше, она должна выиграть состязание Силы с мерроу, иначе притягивается к нему на 20 фт.',
    'mimic|Pseudopod': 'Если мимик в облике предмета, цель подвергается его особенности Липкость.',
    'octopus|Tentacles': 'Цель схвачена (Сл высвобождения 10). Пока захват не окончен, осьминог не может использовать щупальца против другой цели.',
    'otyugh|Bite': 'Если цель — существо, она должна преуспеть в спасброске Телосложения со Сл 15 против болезни, иначе отравлена до излечения. Каждые 24 часа она повторяет спасбросок; при провале её максимум хитов уменьшается на 5 (1к10), при успехе болезнь проходит. Если максимум падает до 0, цель умирает.',
    'otyugh|Tentacle': 'Если цель Средняя или меньше, она схвачена (Сл высвобождения 13) и опутана, пока захват не окончен. У отиджа два щупальца, каждое может держать одну цель.',
    'pseudodragon|Sting': 'Цель должна преуспеть в спасброске Телосложения со Сл 11, иначе отравлена на 1 час. При провале на 5 и более она на то же время теряет сознание или пока не получит урон либо её не разбудят действием.',
    'purple-worm|Bite': 'Если цель — Большое или меньшее существо, она должна преуспеть в спасброске Ловкости со Сл 19, иначе её проглатывает червь. Проглоченная цель ослеплена и опутана, имеет полное укрытие и в начале каждого хода червя получает 21 (6к6) урона кислотой. Если червь получает изнутри 30 или больше урона за ход, он должен преуспеть в спасброске Телосложения со Сл 21, иначе отрыгивает всех проглоченных.',
    'rakshasa|Claw': 'Если цель — существо, она проклята: при каждом коротком или продолжительном отдыхе её мучают кошмары, и отдых не приносит пользы. Проклятие снимает снятие проклятия или подобная магия.',
    'roper|Tendril': 'Цель схвачена (Сл высвобождения 15). Пока захват не окончен, цель опутана и совершает с помехой проверки и спасброски Силы, а роупер не может использовать этот отросток против другой цели.',
    'rug-of-smothering|Smother': 'Цель схвачена (Сл высвобождения 13). Пока захват не окончен, цель опутана, ослеплена и может задохнуться, а ковёр не может душить другую цель. В начале каждого хода цели она получает 10 (2к6 + 3) дробящего урона.',
    'shadow|Strength Drain': 'Сила цели уменьшается на 1к4. Если Сила падает до 0, цель умирает; иначе уменьшение длится до окончания короткого или продолжительного отдыха. Если от этой атаки умирает не злой гуманоид, через 1к4 часа из трупа восстаёт новая тень.',
    'solar|Slaying Longbow': 'Если у цели 100 хитов или меньше, она должна преуспеть в спасброске Телосложения со Сл 15, иначе умирает.',
    'sprite|Shortbow': 'Цель должна преуспеть в спасброске Телосложения со Сл 10, иначе отравлена на 1 минуту. Если результат спасброска 5 или ниже, отравленная цель на это время теряет сознание или пока не получит урон либо её не разбудят действием.',
    'stirge|Blood Drain': 'Стирдж прикрепляется к цели. Прикреплённый, он не атакует, а в начале каждого своего хода цель теряет 5 (1к4 + 3) хитов от потери крови. Стирдж отцепляется, потратив 5 фт. перемещения, — после того как высосет 10 хитов или цель умрёт. Любое существо может действием отцепить его.',
    'wight|Life Drain': 'Цель должна преуспеть в спасброске Телосложения со Сл 13, иначе её максимум хитов уменьшается на величину полученного урона до окончания продолжительного отдыха. Если максимум падает до 0, цель умирает. Убитый так гуманоид через 24 часа восстаёт зомби под контролем умертвия (не более двенадцати).',
    'vampire-vampire|Bite': 'Максимум хитов цели уменьшается на величину полученного урона некротической энергией, а вампир восстанавливает столько же хитов. Уменьшение длится до окончания продолжительного отдыха; если максимум падает до 0, цель умирает. Убитый так и погребённый гуманоид следующей ночью восстаёт отродьем вампира.',
    'vampire-bat|Bite': 'Максимум хитов цели уменьшается на величину полученного урона некротической энергией, а вампир восстанавливает столько же хитов. Уменьшение длится до окончания продолжительного отдыха; если максимум падает до 0, цель умирает. Убитый так и погребённый гуманоид следующей ночью восстаёт отродьем вампира.',
}

SIZE_GEN = {'Medium': 'Среднее или меньшее ', 'Large': 'Большое или меньшее ', 'Huge': 'Огромное или меньшее '}


def size_prefix(sz):
    return SIZE_GEN.get(sz, '') if sz else ''


ALT_RULES = [
    (r"^,? ?or (\d+) \(([^)]+)\) (\w+) damage if used with two hands(?: to make a melee attack)?", 'versatile', 'при хвате двумя руками'),
    (r"^,? ?(\d+) \(([^)]+)\) (\w+) damage if wielded with two hands", 'versatile', 'при хвате двумя руками'),
    (r"^ in melee or (\d+) \(([^)]+)\) (\w+) damage at range", 'ranged', 'при дальнобойной атаке'),
    (r"^,? ?or (\d+) \(([^)]+)\) (\w+) damage if the swarm has half of its hit points or fewer", 'swarm', 'если у роя половина хитов или меньше'),
    (r"^,? ?or (\d+) \(([^)]+)\) (\w+) damage while enlarged", 'enlarged', 'в увеличенном виде'),
    (r"^,? ?or (\d+) \(([^)]+)\) (\w+) damage in Small or Medium form", 'small', 'в Маленьком или Среднем облике'),
    (r"^,? ?or (\d+) \(([^)]+)\) (\w+) damage with shillelagh", 'shillelagh', 'с заклинанием дубинка'),
]


def parse_damage(a):
    out = []
    for e in a.get('damage', []) or []:
        if 'choose' in e:
            opts = e['from']['options']
            o = opts[0]
            if 'damage_type' in o:
                out.append({'dice': re.sub(r'\s+', '', o['damage_dice']), 'type': o['damage_type']['index'],
                            'alt': [x['damage_type']['index'] for x in opts[1:] if 'damage_type' in x and x['damage_type']['index'] != o['damage_type']['index']]})
        elif 'damage_type' in e:
            out.append({'dice': re.sub(r'\s+', '', e['damage_dice']), 'type': e['damage_type']['index']})
    return out


def main_damage_text(dmg, rest):
    """Удаляет из английского текста основной урон и возвращает (русский текст урона, остаток, доп. поля)."""
    extra = {}
    r = rest
    # основная часть: «N (XdY + Z) type damage» или «N type damage», затем «plus …»
    m0 = re.match(r"^(\d+) (?:\(([^)]+)\) )?(\w+) damage", r)
    if not m0:
        m0 = re.match(r"^(\d+) \((\d+) ?(d\d+)(?: ?\+ ?(\d+))?\) (\w+) damage", r)
    parts = []
    if dmg:
        for i, d in enumerate(dmg):
            t = d['type']
            txt = dmg_phrase(avg(d['dice']), d['dice'], t)
            if d.get('alt'):
                txt = txt.replace(DT[t], 'урона ' + ' или '.join([{'lightning': 'электричеством', 'thunder': 'звуком', 'cold': 'холодом', 'fire': 'огнём'}.get(x, x) for x in [t] + d['alt']]) + ' (на выбор)')
            parts.append(txt)
    main = ' плюс '.join(parts)
    # срезаем английский основной урон
    r = re.sub(r"^\d+ (?:\([^)]*\) )?\w+ damage", '', r)
    while True:
        mp = re.match(r"^,? ?plus (\d+) \(([^)]+)\) (?:\w+ or )?(\w+) damage(?: \([^)]*\))?", r)
        if not mp:
            break
        r = r[mp.end():]
    for rx, key, ru in ALT_RULES:
        mm = re.match(rx, r)
        if mm:
            extra[key] = {'dice': re.sub(r'\s+', '', mm.group(2)), 'type': mm.group(3)}
            main += ' или ' + dmg_phrase(mm.group(1), mm.group(2), mm.group(3)) + ' ' + ru
            r = r[mm.end():]
            mm2 = re.match(r"^,? ?or (\d+) \(([^)]+)\) (\w+) damage with shillelagh", r)
            if mm2:
                main += ' или ' + dmg_phrase(mm2.group(1), mm2.group(2), mm2.group(3)) + ' с заклинанием дубинка'
                r = r[mm2.end():]
            while True:
                mp = re.match(r"^,? ?plus (\d+) \(([^)]+)\) (?:\w+ or )?(\w+) damage(?: \([^)]*\))?", r)
                if not mp:
                    break
                r = r[mp.end():]
    r = re.sub(r"^\s*\.\s*", '', r).strip()
    return main, r, extra


def translate_rider(rest, m, aname):
    key = m['index'] + '|' + re.sub(r'\s*\(.*?\)', '', aname)
    if key in RIDER_OVERRIDES:
        return RIDER_OVERRIDES[key]
    out = []
    r = rest.strip()
    guard = 0
    while r and guard < 30:
        guard += 1
        r = r.lstrip(' .')
        if not r:
            break
        for rx, fn in RIDER_RULES:
            mm = re.match(rx, r)
            if mm:
                out.append(fn(mm.groups()))
                r = r[mm.end():]
                break
        else:
            WARN.append('rider %s: %s' % (key, r[:160]))
            break
    return ' '.join(out)


def parse_effects(rest, m):
    """Механика эффектов при попадании для движка."""
    eff = []
    t = rest
    sv_dmg = re.search(r"DC (\d+) (\w+) saving throw, taking (\d+) \(([^)]+)\) (\w+) damage on a failed save, or half", t)
    if sv_dmg:
        eff.append({'save': ABI_REV[sv_dmg.group(2)][:3].lower() if False else {v: k for k, v in ABI.items()}[sv_dmg.group(2)], 'dc': int(sv_dmg.group(1)),
                    'damage': [{'dice': re.sub(r'\s+', '', sv_dmg.group(4)), 'type': sv_dmg.group(5)}], 'half': True})
    else:
        sv2 = re.search(r"DC (\d+) Constitution saving throw or take (\d+) \(([^)]+)\) (\w+) damage", t)
        if sv2:
            eff.append({'save': 'con', 'dc': int(sv2.group(1)), 'damage': [{'dice': re.sub(r'\s+', '', sv2.group(3)), 'type': sv2.group(4)}], 'half': False})
    pr = re.search(r"DC (\d+) Strength saving throw or be (?:pushed up to (\d+) feet away from the [\w ]+ and )?knocked prone", t)
    if pr:
        e = {'save': 'str', 'dc': int(pr.group(1)), 'condition': 'prone'}
        if pr.group(2):
            e['push'] = int(pr.group(2))
        mx = re.search(r'If the target is (?:a )?(Medium|Large|Huge) or smaller', t)
        if mx:
            e['sizeMax'] = mx.group(1).lower()
        eff.append(e)
    po = re.search(r"DC (\d+) Constitution saving throw or (?:be|become) poisoned(?: for (\d+) (minute|hour))?", t)
    if po and 'disease' not in t:
        e = {'save': 'con', 'dc': int(po.group(1)), 'condition': 'poisoned'}
        if po.group(3) == 'minute':
            e['rounds'] = 10 * int(po.group(2))
        elif po.group(3) == 'hour':
            e['rounds'] = 600
        if 'repeat the saving throw' in t:
            e['repeat'] = True
        eff.append(e)
    pa = re.search(r"DC (\d+) Constitution saving throw or be paralyzed for (\d+) minute", t)
    if pa:
        e = {'save': 'con', 'dc': int(pa.group(1)), 'condition': 'paralyzed', 'rounds': 10, 'repeat': True}
        if 'other than an elf or undead' in t:
            e['notTypes'] = ['undead']
            e['notRace'] = 'elf'
        elif 'other than an undead' in t:
            e['notTypes'] = ['undead']
        eff.append(e)
    gr = re.search(r"grappled \(escape DC (\d+)\)", t)
    if gr and 'Instead of dealing damage' not in t:
        e = {'condition': 'grappled', 'escapeDC': int(gr.group(1))}
        if re.search(r'(?:target|creature) is (?:also )?restrained|and restrained until', t):
            e['alsoRestrained'] = True
        mx = re.search(r'(Medium|Large|Huge) or smaller', t)
        if mx:
            e['sizeMax'] = mx.group(1).lower()
        eff.append(e)
    wb = re.search(r"restrained by webbing\. As an action, the restrained (?:target|creature) can make a DC (\d+) Strength check", t)
    if wb:
        eff.append({'condition': 'restrained', 'escapeDC': int(wb.group(1))})
    hm = re.search(r"DC (\d+) Constitution saving throw or (?:its hit point maximum is reduced|have its hit point maximum reduced) by an amount equal to the damage taken", t)
    if hm:
        eff.append({'save': 'con', 'dc': int(hm.group(1)), 'drainMax': True})
    if 'hit point maximum is reduced by an amount equal to the necrotic damage taken, and the vampire regains' in t:
        eff.append({'drainMax': True, 'heal': True})
    kl = re.search(r"has (\d+) hit points or fewer, it must succeed on a DC (\d+) Constitution saving throw or die", t)
    if kl:
        eff.append({'save': 'con', 'dc': int(kl.group(2)), 'killBelow': int(kl.group(1))})
    return eff


def attack_from(a, m):
    desc = a['desc']
    if desc.startswith('Melee or Ranged'):
        typ = 'mrw'
    elif desc.startswith('Melee'):
        typ = 'mw'
    elif desc.startswith('Ranged'):
        typ = 'rw'
    else:
        typ = 'mw'
    spell = 'Spell Attack' in desc
    reach = re.search(r'reach (\d+) ft', desc)
    rng = re.search(r'range (\d+)(?:/(\d+))? ft', desc)
    out = {'id': slug(re.sub(r'\s*\(.*?\)', '', a['name'])), 'en': a['name'], 'name': ru_name(a['name'], ATTACKS), 'type': typ, 'toHit': a['attack_bonus']}
    out['reach'] = int(reach.group(1)) if reach else 5
    if rng:
        out['range'] = [int(rng.group(1)), int(rng.group(2) or rng.group(1))]
    elif typ != 'mw':
        out['range'] = [30, 120]
    if spell:
        out['spellAttack'] = True
    dmg = parse_damage(a)
    out['dmg'] = [{'dice': d['dice'], 'type': d['type']} for d in dmg]
    if a.get('usage') and a['usage'].get('type') == 'recharge on roll':
        out['recharge'] = a['usage']['min_value']
    hit = desc.split('Hit:', 1)
    rest = hit[1].strip() if len(hit) > 1 else ''
    main, rider, extra = main_damage_text(dmg, rest)
    if 'ranged' in extra:
        out['rangedDmg'] = [extra['ranged']]
    if 'swarm' in extra:
        out['dmgHalfHp'] = [extra['swarm']]
    target = 'одна цель' if 'one target' in desc else 'одно существо' if 'one creature' in desc else 'одна цель'
    kindtxt = {'mw': 'Рукопашная атака', 'rw': 'Дальнобойная атака', 'mrw': 'Рукопашная или дальнобойная атака'}[typ] + (' заклинанием' if spell else ' оружием')
    sgn = '+' if a['attack_bonus'] >= 0 else '−'
    s = '%s: %s%d к попаданию, ' % (kindtxt, sgn, abs(a['attack_bonus']))
    if typ == 'mw':
        s += 'досягаемость %d фт., %s.' % (out['reach'], target)
    elif typ == 'rw':
        s += 'дистанция %d/%d фт., %s.' % (out['range'][0], out['range'][1], target)
    else:
        s += 'досягаемость %d фт. или дистанция %d/%d фт., %s.' % (out['reach'], out['range'][0], out['range'][1], target)
    rr = translate_rider(rider, m, a['name']) if rider else ''
    if main:
        s += ' Попадание: ' + main + '.'
        if rr:
            s += ' ' + rr
    elif rr:
        s += ' Попадание: ' + rr
    out['desc'] = s
    eff = parse_effects(rest, m)
    if eff:
        out['onHit'] = eff
    return out


# ---------------------------------------------------------------- прочие действия
def tpl(t, desc, m):
    n = nums(desc)
    if callable(t):
        return t(desc, n, m)
    r = re.sub(r'\{(\d+)\}', lambda mm: str(n[int(mm.group(1))]) if int(mm.group(1)) < len(n) else '?', t)
    if '?' in r:
        WARN.append('мало чисел для шаблона (%s): %s' % (m['index'], t[:60]))
    return r


def cond_from(desc):
    for c, ru in [('paralyzed', 'paralyzed'), ('stunned', 'stunned'), ('frightened', 'frightened'), ('charmed', 'charmed'), ('blinded', 'blinded'),
                  ('poisoned', 'poisoned'), ('restrained', 'restrained'), ('unconscious', 'unconscious')]:
        if re.search(r'\b(?:be|become|is|are) (?:magically )?' + c, desc) or ('or ' + c) in desc:
            return ru
    return None


def special_from(a, m, legendary=False):
    """Особое действие: дыхание, ауры, взгляды — или информационное."""
    name = a['name']
    base = re.sub(r'\s*\(.*?\)', '', name).strip()
    desc = a['desc']
    sid = slug(base)
    rech = a.get('usage', {}) or {}
    out = {'id': sid, 'en': name, 'name': ru_name(name, ACTIONS)}
    if rech.get('type') == 'recharge on roll':
        out['recharge'] = rech['min_value']
    elif rech.get('type') == 'per day':
        out['perDay'] = rech['times']
    elif rech.get('type') == 'recharge after rest':
        out['perDay'] = 1
    cm = re.search(r'Costs (\d) Actions', name)
    if legendary:
        out['cost'] = int(cm.group(1)) if cm else 1
    dc = a.get('dc')
    dmg = parse_damage(a)
    sv = re.search(r'DC (\d+) (\w+) saving throw', desc)
    if 'Breath' in base and base != 'Breath Weapons':
        ar = area_phrase(desc)
        out['desc'] = breath_text(desc)
        if ar and sv:
            out.update({'type': 'area', 'area': {'shape': ar[0], 'size': ar[1], 'origin': 'self'}, 'save': {v: k for k, v in ABI.items()}[sv.group(2)], 'dc': int(sv.group(1)),
                        'dmg': [{'dice': d['dice'], 'type': d['type']} for d in dmg], 'half': 'half' in desc})
            c = cond_from(desc)
            if not dmg:
                if 'sleep' in desc:
                    out['condition'] = 'unconscious'
                    out['tag'] = 'sleep'
                    out['rounds'] = 10
                elif 'pushed' in desc:
                    out['push'] = int(re.search(r'pushed (\d+)', desc).group(1))
                elif c:
                    out['condition'] = 'restrained' if 'petrif' in desc else c
                    out['rounds'] = 10
                    if 'repeat the saving throw' in desc:
                        out['repeat'] = True
        else:
            out['type'] = 'info'
        return [out]
    if base == 'Breath Weapons':
        res = []
        for line in desc.split('\n')[1:]:
            mm = re.match(r'([\w ]+ Breath)\. (.*)', line.strip())
            if not mm:
                continue
            sub = {'en': mm.group(1), 'name': ru_name(mm.group(1), ACTIONS), 'id': slug(mm.group(1)), 'recharge': out.get('recharge', 5), 'rechargeKey': 'breath'}
            sub_d = mm.group(2)
            sub.update(special_from({'name': mm.group(1), 'desc': sub_d, 'dc': dc, 'damage': [x for x in a.get('damage', []) if x] if 'damage' in sub_d else []}, m)[0])
            sub['recharge'] = out.get('recharge', 5)
            sub['rechargeKey'] = 'breath'
            sub['name'] = ru_name(mm.group(1), ACTIONS) + ' (перезарядка %d–6)' % out.get('recharge', 5)
            res.append(sub)
        return res
    tbl = LEG if legendary and base in LEG else ACT
    t = tbl.get(base)
    if t is None:
        WARN.append('нет перевода действия: ' + base + ' (' + m['index'] + ')')
        out['desc'] = desc
    else:
        out['desc'] = tpl(t, desc, m)
    out['type'] = 'info'
    # механика
    within = re.search(r'within (\d+) (?:feet|ft\.) of (?:it|the [\w ]+?|her|him)\b', desc)
    if base in ('Frightful Presence', 'Horrifying Visage', 'Horror Nimbus', 'Moan', 'Stunning Screech', 'Luring Song') and sv:
        c = cond_from(desc) or 'frightened'
        rng = int(re.search(r'within (\d+)', desc).group(1))
        out.update({'type': 'aoeCondition', 'range': rng, 'save': {v: k for k, v in ABI.items()}[sv.group(2)], 'dc': int(sv.group(1)), 'condition': c,
                    'repeat': 'repeat the saving throw' in desc, 'rounds': 10 if '1 minute' in desc else 1, 'once': 'immune' in desc})
        if base == 'Horrifying Visage':
            out['notTypes'] = ['undead']
    elif base in ('Dreadful Glare', 'Scare', 'Fey Charm', 'Charm', 'Enslave', 'Death Glare', 'Frightening Gaze', 'Blinding Gaze') and sv:
        rng = int(re.search(r'within (\d+)', desc).group(1))
        c = cond_from(desc) or ('frightened' if 'frighten' in desc else 'charmed')
        out.update({'type': 'gaze', 'range': rng, 'save': {v: k for k, v in ABI.items()}[sv.group(2)], 'dc': int(sv.group(1)), 'condition': c,
                    'repeat': 'repeat the saving throw' in desc, 'rounds': 10 if '1 minute' in desc else 1})
        if base == 'Death Glare':
            out['dropTo0'] = True
            out['condition'] = None
        if base == 'Blinding Gaze':
            out['condition'] = 'blinded'
            out['rounds'] = 100
    elif base in ('Wing Attack', 'Disrupt Life', 'Searing Burst', 'Blinding Dust', 'Blasphemous Word', 'Spores', 'Fetid Cloud', 'Ink Cloud') and sv and within or (base == 'Searing Burst' and sv):
        rad = re.search(r'(\d+) ?-foot radius', desc)
        size = int(rad.group(1)) if rad else int(within.group(1))
        out.update({'type': 'area', 'area': {'shape': 'aura', 'size': size, 'origin': 'self'}, 'save': {v: k for k, v in ABI.items()}[sv.group(2)], 'dc': int(sv.group(1)),
                    'dmg': [{'dice': d['dice'], 'type': d['type']} for d in dmg], 'half': 'half' in desc})
        c = cond_from(desc)
        if 'knocked prone' in desc:
            out['condition'] = 'prone'
        elif c:
            out['condition'] = c
            out['rounds'] = 10 if '1 minute' in desc else 1
            if 'repeat the saving throw' in desc:
                out['repeat'] = True
        if base in ('Disrupt Life', 'Blasphemous Word'):
            out['notTypes'] = ['undead', 'construct'] if base == 'Disrupt Life' else ['undead']
    elif base in ('Lightning Strike', 'Blinding Spittle') and sv:
        r1 = re.search(r'within (\d+) feet of (?:it|him|her)', desc)
        r2 = re.search(r'within (\d+) feet of (?:that point|the flash)', desc)
        out.update({'type': 'area', 'area': {'shape': 'sphere', 'size': int(r2.group(1)) if r2 else 10, 'origin': 'point'}, 'range': int(r1.group(1)) if r1 else 60,
                    'save': {v: k for k, v in ABI.items()}[sv.group(2)], 'dc': int(sv.group(1)), 'dmg': [{'dice': d['dice'], 'type': d['type']} for d in dmg], 'half': 'half' in desc})
        if 'blinded' in desc:
            out['condition'] = 'blinded'
            out['rounds'] = 1
    elif base == 'Acid Spray' and sv:
        ln = re.search(r'line that is (\d+) ft\. long and (\d+) ft\. wide', desc)
        out.update({'type': 'area', 'area': {'shape': 'line', 'size': int(ln.group(1)), 'origin': 'self'}, 'save': 'dex', 'dc': int(sv.group(1)),
                    'dmg': [{'dice': d['dice'], 'type': d['type']} for d in dmg], 'half': True})
    elif base == 'Lightning Storm' and sv:
        out.update({'type': 'targets', 'count': 3, 'range': int(re.search(r'within (\d+)', desc).group(1)), 'save': 'dex', 'dc': int(sv.group(1)),
                    'dmg': [{'dice': d['dice'], 'type': d['type']} for d in dmg], 'half': True})
    elif base == 'Heal Self':
        out.update({'type': 'healSelf', 'dice': re.sub(r'\s+', '', re.search(r'\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)', desc).group(1))})
    elif base == 'Healing Touch':
        out.update({'type': 'healTouch', 'dice': re.sub(r'\s+', '', re.search(r'\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)', desc).group(1))})
    elif base == 'Teleport':
        out.update({'type': 'teleport', 'range': int(nums(desc)[0])})
    return [out]


def legendary_from(a, m, attack_ids):
    base = re.sub(r'\s*\(.*?\)', '', a['name']).strip()
    desc = a['desc']
    cm = re.search(r'Costs (\d) Actions', a['name'])
    cost = int(cm.group(1)) if cm else 1
    low = desc.lower()
    ids = []
    for aid, en in attack_ids:
        w = re.sub(r'\s*\(.*?\)', '', en).lower()
        cands = {w, w.rstrip('s'), w + 's'}
        if any(re.search(r'\b' + re.escape(c) + r'\b', low) for c in cands):
            ids.append(aid)
    if base in ('Tail Attack', 'Tail Swipe', 'Claw Attack', 'Hooves', 'Bite', 'Unarmed Strike', 'Attack', 'Chomp', 'Paralyzing Touch', 'Tentacle Attack or Fling') and ids:
        t = LEG.get(base)
        return {'id': slug(base), 'name': ru_name(a['name'], ACTIONS), 'desc': tpl(t, desc, m) if t else desc, 'cost': cost, 'kind': 'attack', 'attacks': ids}
    sp = special_from(a, m, legendary=True)[0]
    sp['cost'] = cost
    sp['kind'] = 'special' if sp.get('type') not in (None, 'info') else 'info'
    if base == 'Lightning Storm':
        sp['kind'] = 'useSpecial'
        sp['special'] = 'lightning-storm'
    return sp


# ---------------------------------------------------------------- прочее
def parse_speed(sp):
    out = {}
    for k, v in sp.items():
        if k == 'hover':
            out['hover'] = True
            continue
        mm = re.match(r'(\d+)', str(v))
        if mm:
            out[k] = int(mm.group(1))
    out.setdefault('walk', 0)
    return out


def ru_lang(s):
    if not s:
        return '—'
    r = s
    for en, ru in LANG_PHRASES:
        r = r.replace(en, ru)
    for en, ru in LANG_WORDS:
        r = re.sub(r'\b' + re.escape(en) + r'\b', ru, r)
    if re.search('[A-Za-z]', r):
        WARN.append('язык: ' + r)
    return r


def ru_damage_list(lst):
    types = []
    notes = []
    nonmag = False
    for s in lst:
        if s in DMG_TYPES:
            types.append(s)
        elif 'nonmagical' in s:
            nonmag = True
            note = 'дробящий, колющий и рубящий урон от немагических атак'
            if s.startswith('piercing and slashing'):
                note = 'колющий и рубящий урон от немагических атак'
            if 'silvered' in s:
                note += ', кроме посеребрённого оружия'
            if 'adamantine' in s:
                note += ', кроме адамантинового оружия'
            if 'stoneskin' in s:
                note += ' (каменная кожа)'
            notes.append(note)
        elif s == 'damage from spells':
            notes.append('урон от заклинаний')
        elif 'magic weapons wielded by good' in s:
            notes.append('колющий урон от магического оружия в руках добрых существ')
        else:
            WARN.append('урон: ' + s)
    return types, nonmag, notes


DT_SHORT = {'acid': 'кислота', 'bludgeoning': 'дробящий', 'cold': 'холод', 'fire': 'огонь', 'force': 'силовое поле', 'lightning': 'электричество', 'necrotic': 'некротическая энергия',
            'piercing': 'колющий', 'poison': 'яд', 'psychic': 'психическая энергия', 'radiant': 'излучение', 'slashing': 'рубящий', 'thunder': 'звук'}


def spellcasting_from(s, m):
    sc = s['spellcasting']
    ab = sc['ability']['index']
    abn = {'int': 'Интеллект', 'wis': 'Мудрость', 'cha': 'Харизма'}.get(ab, ab)
    innate = s['name'].startswith('Innate')
    out = {'ability': ab, 'dc': sc.get('dc'), 'toHit': sc.get('modifier'), 'slots': {k: v for k, v in (sc.get('slots') or {}).items()}, 'spellsEn': [], 'innate': {}}
    if sc.get('level'):
        out['casterLevel'] = sc['level']
    lines = []
    if innate:
        groups = {}
        for sp in sc['spells']:
            u = sp.get('usage', {})
            key = 'Неограниченно' if u.get('type') == 'at will' else '%d/день каждое' % u.get('times', 1)
            groups.setdefault(key, []).append(SPELLS_RU.get(sp['name'], sp['name']).lower())
            out['spellsEn'].append(sp['name'])
            out['innate'][sp['name']] = 0 if u.get('type') == 'at will' else u.get('times', 1)
            if sp['name'] not in SPELLS_RU:
                WARN.append('заклинание: ' + sp['name'])
        head = 'Врождённая заклинательная характеристика — %s (Сл спасброска %s%s). Может накладывать следующие заклинания без материальных компонентов:' % (
            abn, sc.get('dc'), (', +%s к попаданию атаками заклинаниями' % sc['modifier']) if sc.get('modifier') else '')
        for k in sorted(groups, key=lambda x: (x != 'Неограниченно', x)):
            lines.append(k + ': ' + ', '.join(groups[k]))
    else:
        by = {}
        for sp in sc['spells']:
            by.setdefault(sp['level'], []).append(SPELLS_RU.get(sp['name'], sp['name']).lower())
            out['spellsEn'].append(sp['name'])
            if sp['name'] not in SPELLS_RU:
                WARN.append('заклинание: ' + sp['name'])
        head = 'Заклинатель %s уровня. Заклинательная характеристика — %s (Сл спасброска %s, +%s к попаданию атаками заклинаниями). Подготовлены заклинания:' % (
            sc.get('level', '?'), abn, sc.get('dc'), sc.get('modifier'))
        for lv in sorted(by):
            if lv == 0:
                lines.append('Заговоры (неограниченно): ' + ', '.join(by[lv]))
            else:
                n = (sc.get('slots') or {}).get(str(lv), 0)
                lines.append('%d уровень (%d %s): %s' % (lv, n, 'ячейка' if n == 1 else 'ячейки' if n < 5 else 'ячеек', ', '.join(by[lv])))
    return out, head + '\n' + '\n'.join(lines)


def ac_from(m):
    best = None
    for a in m['armor_class']:
        v = a['value']
        note = ''
        if a['type'] == 'natural':
            note = 'природный доспех'
        elif a['type'] == 'armor':
            if a.get('armor'):
                note = ', '.join(ARMOR.get(x['name'], x['name']) for x in a['armor'])
            elif a.get('desc'):
                note = ARMOR.get(a['desc'], a['desc'])
        elif a['type'] == 'spell':
            note = ARMOR.get(a['spell']['name'], a['spell']['name'])
        if best is None or v > best[0]:
            best = (v, note)
    if len(m['armor_class']) > 1:
        lo = min(x['value'] for x in m['armor_class'])
        if lo != best[0]:
            best = (best[0], (best[1] + '; ' if best[1] else '') + '%d без заклинания' % lo)
    return best


def convert(m):
    i = m['index']
    out = {'id': i, 'name': NAMES.get(i, m['name']), 'en': m['name'], 'size': m['size'].lower(), 'type': TYPES.get(m['type'], 'monstrosity')}
    if i not in NAMES:
        WARN.append('нет имени: ' + i)
    if m['type'].startswith('swarm'):
        out['swarm'] = True
    sub = m.get('subtype')
    tags = [out['type']]
    if sub:
        out['subtype'] = SUBTYPES.get(sub, sub)
        if sub not in SUBTYPES:
            WARN.append('подтип: ' + sub)
        tags += [x.strip() for x in sub.split(',')]
    out['tags'] = tags
    out['align'] = ALIGN.get(m['alignment'], m['alignment'])
    ac, note = ac_from(m)
    out['ac'] = ac
    if note:
        out['acNote'] = note
    out['hp'] = m['hit_points']
    out['hd'] = re.sub(r'\s+', '', m.get('hit_points_roll') or m['hit_dice'])
    out['speed'] = parse_speed(m['speed'])
    out['abil'] = {k: m[ABI[k].lower()] for k in ABI}
    saves, skills = {}, {}
    for p in m.get('proficiencies', []):
        idx = p['proficiency']['index']
        if idx.startswith('saving-throw-'):
            saves[idx.split('-')[-1]] = p['value']
        elif idx.startswith('skill-'):
            sk = SKILLS.get(idx[6:])
            if sk:
                skills[sk] = p['value']
    if saves:
        out['saves'] = saves
    if skills:
        out['skills'] = skills
    flags = {}
    res, nm1, n1 = ru_damage_list(m['damage_resistances'])
    imm, nm2, n2 = ru_damage_list(m['damage_immunities'])
    vul, _, n3 = ru_damage_list(m['damage_vulnerabilities'])
    out['resist'], out['immune'], out['vuln'] = res, imm, vul
    if nm1:
        out['resistNonmagical'] = True
    if nm2:
        out['immuneNonmagical'] = True
    if 'damage from spells' in m['damage_resistances']:
        flags['resistSpells'] = True
    out['resistText'] = ', '.join([DT_SHORT[x] for x in res] + n1)
    out['immuneText'] = ', '.join([DT_SHORT[x] for x in imm] + n2)
    out['vulnText'] = ', '.join([DT_SHORT[x] for x in vul] + n3)
    out['condImmune'] = [c['index'] for c in m['condition_immunities'] if c['index'] in CONDS]
    sens = []
    for k, ru in SENSES.items():
        if k in m['senses']:
            sens.append(ru + ' ' + re.sub(r' ft\.', ' фт.', m['senses'][k]).replace('(blind beyond this radius)', '(слеп за пределами)'))
    sens.append('пассивное Восприятие %s' % m['senses'].get('passive_perception', 10))
    out['senses'] = ', '.join(sens)
    out['lang'] = ru_lang(m['languages'])
    out['cr'] = cr_str(m['challenge_rating'])
    out['xp'] = m['xp']
    out['prof'] = m.get('proficiency_bonus', 2)
    out['icon'] = icon_for(m)

    traits = []
    spellcasting = None
    for s in m.get('special_abilities', []):
        nm = s['name']
        base = re.sub(r'\s*\(.*?\)', '', nm).strip()
        if s.get('spellcasting'):
            sc, text = spellcasting_from(s, m)
            if spellcasting is None:
                spellcasting = sc
            else:
                spellcasting['spellsEn'] += sc['spellsEn']
                spellcasting['innate'].update(sc['innate'])
                for k, v in sc['slots'].items():
                    spellcasting['slots'][k] = v
            traits.append({'name': 'Врождённое колдовство' if nm.startswith('Innate') else 'Использование заклинаний', 'desc': text})
            continue
        t = TRAITS.get(base)
        if not t:
            WARN.append('нет перевода особенности: ' + base)
            traits.append({'name': nm, 'desc': s['desc']})
            continue
        par = tr_paren(nm)[1]
        u = s.get('usage') or {}
        if u.get('type') == 'per day' and not par:
            par = ['%d/день' % u.get('times', 1)]
        traits.append({'name': t[0] + (' (' + '; '.join(par) + ')' if par else ''), 'desc': tpl(t[1], s['desc'], m)})
        n = NUMRE.findall(s['desc'])
        d = s['desc']
        if base == 'Pack Tactics':
            flags['packTactics'] = True
        elif base == 'Undead Fortitude':
            flags['undeadFortitude'] = True
        elif base == 'Regeneration':
            bl = ['acid', 'fire'] if 'acid or fire' in d else ['radiant'] if 'radiant' in d else []
            flags['regeneration'] = {'amount': int(n[0]), 'blockedBy': bl, 'needsHp': 'at least' in d}
        elif base == 'Legendary Resistance':
            mm = re.search(r'(\d)/Day', nm)
            flags['legendaryResistance'] = int(mm.group(1)) if mm else 3
        elif base in ('Magic Resistance', 'Limited Magic Immunity'):
            flags['magicResistance'] = True
        elif base == 'Nimble Escape':
            flags['nimbleEscape'] = True
        elif base == 'Cunning Action':
            flags['cunningAction'] = True
        elif base == 'Aggressive':
            flags['aggressive'] = True
        elif base == 'Brave':
            flags['brave'] = True
        elif base == 'Dark Devotion':
            flags['darkDevotion'] = True
        elif base == 'Fey Ancestry':
            flags['feyAncestry'] = True
        elif base == 'Gnome Cunning':
            flags['gnomeCunning'] = True
        elif base == 'Martial Advantage':
            flags['martialAdvantage'] = re.sub(r'\s+', '', n[1])
        elif base == 'Rampage':
            flags['rampage'] = True
        elif base == 'Reckless':
            flags['reckless'] = True
        elif base in ('Charge', 'Trampling Charge', 'Pounce'):
            am = re.search(r'with (?:a |its )?(\w+)(?: attack)?', d.split('straight toward')[1])
            word = am.group(1).lower() if am else ''
            aid = {'tusk': 'tusk', 'tusks': 'tusks', 'pike': 'pike', 'ram': 'ram', 'gore': 'gore', 'horn': 'horn', 'claw': 'claw', 'hooves': 'hooves'}.get(word, word)
            ch = {'dist': int(n[0]), 'attack': aid, 'dmg': [], 'save': 'str'}
            dm = re.search(r'extra (\d+) \((\d+d\d+(?: ?[+-] ?\d+)?)\) ?(\w+)? damage', d)
            if dm:
                ch['dmg'] = [{'dice': re.sub(r'\s+', '', dm.group(2)), 'type': dm.group(3) or 'bludgeoning'}]
            sv = re.search(r'DC (\d+) Strength', d)
            if sv:
                ch['dc'] = int(sv.group(1))
                ch['prone'] = True
                pu = re.search(r'pushed up to (\d+)', d)
                if pu:
                    ch['push'] = int(pu.group(1))
            flags['charge'] = ch
        elif base == 'Relentless':
            flags['relentless'] = int(n[0])
        elif base == 'Stench':
            flags['stench'] = {'dc': int(n[1]), 'range': int(n[0])}
        elif base == 'Web Walker':
            flags['webWalker'] = True
        elif base == 'Sneak Attack':
            flags['sneakDice'] = int(re.match(r'(\d+)d', n[1]).group(1))
        elif base == 'Evasion':
            flags['evasion'] = True
        elif base in ('Magic Weapons', 'Angelic Weapons', 'Hellish Weapons'):
            flags['magicalAttacks'] = True
        elif base == 'Blood Frenzy':
            flags['bloodFrenzy'] = True
        elif base in ('Acid Absorption', 'Fire Absorption', 'Lightning Absorption'):
            flags.setdefault('absorb', []).append(base.split()[0].lower())
        elif base == 'Flyby':
            flags['flyby'] = True
        elif base == 'Grappler':
            flags['grappler'] = True
        elif base == 'Fear Aura':
            flags['fearAura'] = {'range': int(n[0]), 'dc': int(n[1])}
        elif base == 'Fire Aura':
            flags['fireAura'] = {'range': int(n[0]), 'dice': re.sub(r'\s+', '', n[2]), 'type': 'fire'}
            flags['heatedBody'] = {'dice': re.sub(r'\s+', '', n[5]), 'type': 'fire'}
        elif base == 'Heated Body':
            flags['heatedBody'] = {'dice': re.sub(r'\s+', '', n[2]), 'type': 'fire'}
        elif base == 'Fire Form':
            flags['heatedBody'] = {'dice': re.sub(r'\s+', '', n[3]), 'type': 'fire'}
        elif base == 'Corrosive Form':
            flags['heatedBody'] = {'dice': re.sub(r'\s+', '', n[2]), 'type': 'acid'}
        elif base in ('Death Burst', 'Death Throes'):
            sv = re.search(r'DC (\d+) (\w+) saving throw', d)
            db = {'radius': int(n[0]), 'save': {v: k for k, v in ABI.items()}[sv.group(2)], 'dc': int(sv.group(1))}
            dm = re.search(r'(\d+) \((\d+d\d+(?: ?[+-] ?\d+)?)\) (\w+) damage', d)
            if dm:
                db['dmg'] = [{'dice': re.sub(r'\s+', '', dm.group(2)), 'type': dm.group(3)}]
                db['half'] = 'half' in d
            if 'blinded' in d:
                db['condition'] = 'blinded'
            flags['deathBurst'] = db
        elif base == 'Swarm':
            flags['swarm'] = True
        elif base == 'Assassinate':
            flags['assassinate'] = True
        elif base in ('Two-Headed', 'Two Heads', 'Multiple Heads'):
            flags['twoHeads'] = True
    out['traits'] = traits

    actions = []
    attack_ids = []
    multi = None
    for a in m.get('actions', []):
        if a['name'] == 'Multiattack':
            multi = a
            continue
        if a.get('attack_bonus') is not None:
            at = attack_from(a, m)
            if flags.get('magicalAttacks'):
                at['magical'] = True
            # одинаковые id (два «Bite») — делаем уникальными
            ids = [x['id'] for x in actions]
            while at['id'] in ids:
                at['id'] += '2'
            actions.append(at)
            attack_ids.append((at['id'], a['name']))
        else:
            for sp in special_from(a, m):
                actions.append(sp)
    if multi:
        opts = []

        def item_ids(items):
            res = []
            for it in items:
                nm = it['action_name']
                aid = slug(re.sub(r'\s*\(.*?\)', '', nm))
                cnt = int(it.get('count', 1)) if str(it.get('count', 1)).isdigit() else 1
                if not any(x['id'] == aid for x in actions):
                    cand = [x['id'] for x in actions if x.get('en', '').lower().startswith(nm.lower()) or x.get('en', '').lower().startswith(nm.lower().rstrip('s'))]
                    if cand:
                        aid = cand[0]
                    else:
                        WARN.append('мультиатака %s: %s' % (i, nm))
                        continue
                res += [aid] * cnt
            return res
        if multi.get('multiattack_type') == 'actions':
            opts.append(item_ids(multi.get('actions', [])))
        else:
            for o in multi['action_options']['from']['options']:
                if o.get('option_type') == 'multiple':
                    opts.append(item_ids(o['items']))
                else:
                    opts.append(item_ids([o]))
        opts = [o for o in opts if o]
        name_of = {x['id']: x['name'] for x in actions}
        parts = []
        for o in opts:
            cnt = {}
            for aid in o:
                cnt[aid] = cnt.get(aid, 0) + 1
            parts.append(', '.join('«%s»%s' % (name_of.get(k, k), ' ×%d' % v if v > 1 else '') for k, v in cnt.items()))
        desc = 'Совершает за одно действие: ' + ' или '.join(parts) + '.'
        if 'veteran' == i:
            desc += ' Атака коротким мечом — только если он обнажён.'
        actions.insert(0, {'id': 'multiattack', 'name': 'Мультиатака', 'type': 'multi', 'options': opts, 'desc': desc})
    out['actions'] = actions
    leg = [legendary_from(a, m, attack_ids) for a in m.get('legendary_actions', [])]
    if leg:
        out['legendary'] = leg
        out['legendaryCount'] = 3
    rea = []
    for a in m.get('reactions', []):
        t = REACT.get(a['name'])
        rea.append({'name': ACTIONS.get(a['name'], a['name']), 'desc': tpl(t, a['desc'], m) if t else a['desc']})
        if a['name'] == 'Parry':
            flags['parry'] = int(nums(a['desc'])[0])
    if rea:
        out['reactions'] = rea
    if spellcasting:
        out['spellcasting'] = spellcasting
    out['flags'] = flags
    fix_descs(out)
    return out


def fix_text(t):
    t = re.sub(r'(\d+)d(\d+)\s*\+\s*(\d+)', r'\1к\2 + \3', t)
    t = re.sub(r'(\d+)d(\d+)\s*-\s*(\d+)', r'\1к\2 − \3', t)
    return re.sub(r'(\d+)d(\d+)', r'\1к\2', t)


def fix_descs(o):
    for key in ('traits', 'actions', 'legendary', 'reactions'):
        for x in o.get(key, []) or []:
            if isinstance(x.get('desc'), str):
                x['desc'] = fix_text(x['desc'])


def main():
    src = sys.argv[1]
    data = json.load(open(src, encoding='utf-8'))
    mons = [convert(m) for m in data]
    js = ('/* Автоматически создано tools/srd/convert.py — бестиарий SRD 5.1 (CC-BY-4.0, Wizards of the Coast), перевод по терминологии dnd.su */\n'
          '(function (root) {\n  var D = (root.DND = root.DND || {});\n  D.SRD_MONSTERS = ' + json.dumps(mons, ensure_ascii=False, separators=(',', ':')) + ';\n'
          "})(typeof window !== 'undefined' ? window : globalThis);\n")
    open(OUT, 'w', encoding='utf-8').write(js)
    print('монстров:', len(mons), 'файл:', OUT, 'размер:', len(js.encode('utf-8')))
    seen = set()
    for w in WARN:
        if w not in seen:
            print('WARN', w)
            seen.add(w)


if __name__ == '__main__':
    main()
