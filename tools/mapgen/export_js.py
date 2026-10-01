"""Yol ve kule yerlerini js/maps.js içine yazar (// geo:begin <id> ... // geo:end <id> arası).

    python tools/mapgen/export_js.py          sadece yazdırır
    python tools/mapgen/export_js.py --write  maps.js'i günceller
"""
import os
import re
import sys

import abyss
import specs as S
import vortex
import wreck

MAPS_JS = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'main', 'resources', 'web', 'js', 'maps.js')


def pts(path, per_line=4):
    items = [f'{{ x: {round(x)}, y: {round(y)} }}' for x, y in path]
    lines = [', '.join(items[i:i + per_line]) + ',' for i in range(0, len(items), per_line)]
    return '\n'.join('                    ' + ln for ln in lines)


def spots(sp, per_line=3):
    items = []
    for x, y, k in sp:
        extra = ", kind: 'high'" if k == 'high' else ''
        items.append(f'{{ x: {x}, y: {y}{extra} }}')
    lines = [', '.join(items[i:i + per_line]) + ',' for i in range(0, len(items), per_line)]
    return '\n'.join('                ' + ln for ln in lines)


def geo(paths, sp, extra=None):
    out = ['            paths: [']
    for p in paths:
        out.append('                [')
        out.append(pts(p))
        out.append('                ],')
    out.append('            ],')
    out.append('            buildSpots: [')
    out.append(spots(sp))
    out.append('            ],')
    extra = extra or {}
    if 'guardians' in extra:
        out.append('            guardians: [' + ', '.join(f'{{ x: {x}, y: {y} }}' for x, y in extra['guardians']) + '],')
    if 'treasure' in extra:
        out.append(f"            treasure: {{ x: {extra['treasure'][0]}, y: {extra['treasure'][1]} }},")
    return '\n'.join(out)


def registry():
    reg = {
        'yosun': ([S.KELP_PATH], S.KELP_SPOTS),
        'batik': ([S.WRECK_LANE_L, S.WRECK_LANE_R], wreck.SPOTS, {'treasure': S.BATIK_TREASURE}),
        'girdap': ([S.VORTEX_PATH], vortex.SPOTS),
        'cukur': ([S.ABYSS_LEFT, S.ABYSS_RIGHT], abyss.SPOTS),
    }
    # yeni haritalar buraya eklenir
    try:
        import extra_maps
        reg.update(extra_maps.registry())
    except ImportError:
        pass
    return reg


def main():
    reg = registry()
    text = open(MAPS_JS, encoding='utf-8').read()
    for name, entry in reg.items():
        paths, sp = entry[0], entry[1]
        block = geo(paths, sp, entry[2] if len(entry) > 2 else None)
        pat = re.compile(r'(            // geo:begin %s\n).*?(\n            // geo:end %s)' % (name, name), re.S)
        if '--write' in sys.argv:
            if not pat.search(text):
                print('isaret yok:', name)
                continue
            text = pat.sub(lambda m: m.group(1) + block + m.group(2), text)
            print('guncellendi:', name)
        else:
            print('// ----', name)
            print(block)
    if '--write' in sys.argv:
        open(MAPS_JS, 'w', encoding='utf-8', newline='\n').write(text)


if __name__ == '__main__':
    main()
