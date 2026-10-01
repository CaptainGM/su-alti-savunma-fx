"""Yol ve kule yerlerini js/maps.js'e yapıştırılacak biçimde yazdırır.

    python tools/mapgen/export_js.py
"""
import abyss
import specs as S
import vortex
import wreck


def pts(path, per_line=4):
    items = [f'{{ x: {round(x)}, y: {round(y)} }}' for x, y in path]
    lines = [', '.join(items[i:i + per_line]) + ',' for i in range(0, len(items), per_line)]
    return '\n'.join('                ' + ln for ln in lines)


def spots(sp, per_line=3):
    items = []
    for x, y, k in sp:
        extra = ", kind: 'high'" if k == 'high' else ''
        items.append(f'{{ x: {x}, y: {y}{extra} }}')
    lines = [', '.join(items[i:i + per_line]) + ',' for i in range(0, len(items), per_line)]
    return '\n'.join('                ' + ln for ln in lines)


MAPS = [
    ('yosun', [S.KELP_PATH], S.KELP_SPOTS),
    ('batik', [S.WRECK_LANE_L, S.WRECK_LANE_R], wreck.SPOTS),
    ('girdap', [S.VORTEX_PATH], vortex.SPOTS),
    ('cukur', [S.ABYSS_LEFT, S.ABYSS_RIGHT], abyss.SPOTS),
]

for name, paths, sp in MAPS:
    print(f'// ---- {name}')
    print('            paths: [')
    for p in paths:
        print('            [')
        print(pts(p))
        print('            ],')
    print('            ],')
    print('            buildSpots: [')
    print(spots(sp))
    print('            ],')
    print()
