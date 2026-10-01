"""Yeni haritaların yol ve kule yeri tanımları.

Buradaki koordinatlar js/maps.js içindeki ile aynıdır (1100x900 tuval). Sanat bu yola göre çizilir.
Yol değiştirilirse `python tools/mapgen/build.py` ile arka plan yeniden üretilir.
"""
import math

# ---------------------------------------------------------------- Yosun Ormanı
# Üç sıra halinde ilerleyen uzun, kıvrımlı bir yol.
KELP_PATH = [
    (-30, 150), (200, 175), (430, 130), (690, 150), (880, 190), (975, 300), (900, 410),
    (700, 440), (460, 430), (270, 455), (165, 560), (215, 670), (400, 705), (640, 690),
    (860, 715), (975, 790), (950, 905),
]
KELP_SPOTS = [
    (170, 302, 'high'), (350, 302, 'normal'), (470, 266, 'normal'), (650, 290, 'normal'), (770, 302, 'normal'),
    (890, 314, 'high'), (242, 578, 'normal'), (362, 566, 'normal'), (494, 578, 'normal'), (650, 542, 'normal'),
    (770, 566, 'normal'), (782, 782, 'high'),
]

# ---------------------------------------------------------------- Batık Gemi Mezarlığı
# İki giriş, ortada birleşip tek yoldan üsse akar.
WRECK_TAIL = [(550, 525), (480, 620), (520, 710), (680, 770), (780, 830), (758, 905)]
WRECK_LANE_L = [(-30, 55), (190, 150), (300, 285), (420, 400)] + WRECK_TAIL
WRECK_LANE_R = [(1130, 80), (900, 160), (810, 300), (690, 405)] + WRECK_TAIL

# ---------------------------------------------------------------- Girdap
def _spiral():
    cx, cy = 550, 450
    pts = []
    turns = 1.9
    steps = int(turns * 12)
    for i in range(steps + 1):
        t = i / steps
        ang = -math.pi * 0.15 + t * turns * 2 * math.pi
        r = 410 - 330 * t ** 0.92
        pts.append((cx + math.cos(ang) * r * 1.0, cy + math.sin(ang) * r * 0.97))
    return [(round(x), round(y)) for x, y in pts]


VORTEX_PATH = [(760, -30), (850, 100)] + _spiral()[:-1] + [(552, 440)]

# ---------------------------------------------------------------- Derin Çukur
# Yol ikiye ayrılıp ortadaki kaya adasını iki yandan dolanır, sonra tekrar birleşir.
ABYSS_HEAD = [(-30, 80), (260, 70), (520, 110), (560, 215)]
ABYSS_TAIL = [(560, 760), (565, 815), (590, 905)]
ABYSS_LEFT = ABYSS_HEAD + [(400, 290), (260, 420), (250, 570), (380, 700)] + ABYSS_TAIL
ABYSS_RIGHT = ABYSS_HEAD + [(720, 290), (860, 420), (870, 570), (740, 700)] + ABYSS_TAIL
