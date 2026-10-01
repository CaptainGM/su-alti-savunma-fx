"""Tüm yeni harita arka planlarını ve ışık dokusunu üretir.

    python tools/mapgen/build.py            hepsi
    python tools/mapgen/build.py kelp       tek harita
"""
import os
import sys

import abyss
import common as C
import fx
import kelp
import vortex
import wreck

OUT = os.path.join(C.ASSETS, 'maps')
JOBS = {
    'kelp': lambda: kelp.build(os.path.join(OUT, 'yosun.jpg')),
    'wreck': lambda: wreck.build(os.path.join(OUT, 'batik.jpg')),
    'vortex': lambda: vortex.build(os.path.join(OUT, 'girdap.jpg')),
    'abyss': lambda: abyss.build(os.path.join(OUT, 'cukur.jpg')),
}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(C.ASSETS, 'fx'), exist_ok=True)
    fx.make_caustics(os.path.join(C.ASSETS, 'fx', 'caustics.png'))
    names = sys.argv[1:] or list(JOBS)
    for n in names:
        JOBS[n]()
        print('tamam:', n)
