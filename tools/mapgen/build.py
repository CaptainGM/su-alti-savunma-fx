"""Tüm yeni harita arka planlarını ve ışık dokusunu üretir.

    python tools/mapgen/build.py            hepsi
    python tools/mapgen/build.py kelp       tek harita
"""
import os
import sys

import abyss
import atlantis
import common as C
import fx
import ice
import kelp
import mangrove
import volcano
import vortex
import wreck

OUT = os.path.join(C.ASSETS, 'maps')
JOBS = {
    'kelp': lambda: kelp.build(os.path.join(OUT, 'yosun.jpg')),
    'wreck': lambda: wreck.build(os.path.join(OUT, 'batik.jpg')),
    'vortex': lambda: vortex.build(os.path.join(OUT, 'girdap.jpg')),
    'abyss': lambda: abyss.build(os.path.join(OUT, 'cukur.jpg')),
    'ice': lambda: ice.build(os.path.join(OUT, 'buz.jpg')),
    'volcano': lambda: volcano.build(os.path.join(OUT, 'volkan.jpg')),
    'atlantis': lambda: atlantis.build(os.path.join(OUT, 'atlantis.jpg')),
    'mangrove': lambda: mangrove.build(os.path.join(OUT, 'mangrov.jpg')),
}

def make_thumbs():
    """Harita kartları için küçük önizlemeler (büyük arka planları kartlarda yüklememek için)."""
    from PIL import Image
    tdir = os.path.join(OUT, 'thumbs')
    os.makedirs(tdir, exist_ok=True)
    sources = {n: os.path.join(OUT, n) for n in os.listdir(OUT) if n.endswith('.jpg')}
    sources['mercan.jpg'] = os.path.join(C.ASSETS, 'game_bg.jpg')
    for name, path in sources.items():
        im = Image.open(path).convert('RGB')
        im.thumbnail((640, 427), Image.LANCZOS)
        im.save(os.path.join(tdir, name), quality=84, optimize=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(C.ASSETS, 'fx'), exist_ok=True)
    fx.make_caustics(os.path.join(C.ASSETS, 'fx', 'caustics.png'))
    names = sys.argv[1:] or list(JOBS)
    for n in names:
        JOBS[n]()
        print('tamam:', n)
    make_thumbs()
