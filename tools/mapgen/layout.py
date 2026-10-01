"""Yol + kule yeri yerleşimini düz zeminde çizip önerir (sanat üretmeden önce kontrol için).

    python tools/mapgen/layout.py kelp 12
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

import common as C
import specs as S

MAPS = {
    'kelp': [S.KELP_PATH],
    'wreck': [S.WRECK_LANE_L, S.WRECK_LANE_R],
    'vortex': [S.VORTEX_PATH],
    'abyss': [S.ABYSS_LEFT, S.ABYSS_RIGHT],
}


def main():
    name = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    paths = MAPS[name]
    dc, smooth = C.centerline_dist(paths)
    spots = C.suggest_spots(dc, smooth, n)
    img = Image.new('RGB', (C.W, C.H), (20, 60, 90))
    d = ImageDraw.Draw(img)
    for pts in smooth:
        d.line(pts, fill=(230, 200, 120), width=70)
    for pts in smooth:
        d.line(pts, fill=(120, 90, 40), width=2)
    for i, (x, y) in enumerate(spots):
        d.ellipse([x - 55, y - 55, x + 55, y + 55], outline=(0, 255, 136), width=3)
        d.text((x - 6, y - 6), str(i), fill=(255, 255, 255))
    for p in paths:
        for x, y in p:
            d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 80, 80))
    out = f'layout_{name}.png'
    img.save(out)
    print(out, spots)


if __name__ == '__main__':
    main()
