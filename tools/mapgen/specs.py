"""Yeni haritaların yol ve kule yeri tanımları.

Buradaki koordinatlar js/maps.js içindeki ile aynıdır (1100x900 tuval). Sanat bu yola göre çizilir.
Yol değiştirilirse `python tools/mapgen/build.py` ile arka plan yeniden üretilir.
"""
import math

from common import X


def sx(points):
    """Eski 1100 genişlikli yerleşimi yeni 1350'lik tuvale yayar."""
    return [(X(x), y) for x, y in points]

# ---------------------------------------------------------------- Yosun Ormanı
# Üç sıra halinde ilerleyen uzun, kıvrımlı bir yol.
KELP_PATH = sx([
    (-30, 150), (200, 175), (430, 130), (690, 150), (880, 190), (975, 300), (900, 410),
    (700, 440), (460, 430), (270, 455), (165, 560), (215, 670), (400, 705), (640, 690),
    (860, 715), (975, 790), (950, 905),
])
KELP_SPOTS = [(X(x), y, k) for x, y, k in [
    (170, 302, 'high'), (350, 302, 'normal'), (470, 266, 'normal'), (650, 290, 'normal'), (770, 302, 'normal'),
    (890, 314, 'high'), (242, 578, 'normal'), (362, 566, 'normal'), (494, 578, 'normal'), (650, 542, 'normal'),
    (770, 566, 'normal'), (782, 782, 'high'),
]]

# ---------------------------------------------------------------- Batık Gemi Mezarlığı
# İki giriş, ortada birleşip tek yoldan üsse akar.
WRECK_TAIL = sx([(550, 525), (480, 620), (520, 710), (680, 770), (780, 830), (758, 905)])
WRECK_LANE_L = sx([(-30, 55), (190, 150), (300, 285), (420, 400)]) + WRECK_TAIL
WRECK_LANE_R = sx([(1130, 80), (900, 160), (810, 300), (690, 405)]) + WRECK_TAIL

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


VORTEX_PATH = sx([(760, -30), (850, 100)] + _spiral()[:-1] + [(552, 440)])

# ---------------------------------------------------------------- Derin Çukur
# Yol ikiye ayrılıp ortadaki kaya adasını iki yandan dolanır, sonra tekrar birleşir.
ABYSS_HEAD = sx([(-30, 80), (260, 70), (520, 110), (560, 215)])
ABYSS_TAIL = sx([(560, 760), (565, 815), (590, 905)])
ABYSS_LEFT = ABYSS_HEAD + sx([(400, 290), (260, 420), (250, 570), (380, 700)]) + ABYSS_TAIL
ABYSS_RIGHT = ABYSS_HEAD + sx([(720, 290), (860, 420), (870, 570), (740, 700)]) + ABYSS_TAIL

# ---------------------------------------------------------------- Buz Koyu
# Birbirine simetrik iki kanal ortada çapraz geçer, her biri dönmeden düz devam edip ekranın altından çıkar.
ICE_L = [(-40, 70), (230, 190), (480, 330), (675, 450), (870, 570), (1030, 700), (1120, 830), (1160, 945)]
ICE_R = [(1390, 70), (1120, 190), (870, 330), (675, 450), (480, 570), (320, 700), (230, 830), (190, 945)]

# ---------------------------------------------------------------- Volkanik Bacalar
# Üç sütunlu dikey zigzag: yukarıdan aşağı, aşağıdan yukarı, tekrar aşağı.
VOLCANO_PATH = [
    (290, -40), (290, 200), (290, 520), (300, 740), (390, 840), (520, 800), (560, 600), (560, 300), (580, 120),
    (690, 60), (820, 110), (840, 300), (840, 600), (850, 780), (940, 850), (1060, 800), (1090, 600),
    (1090, 380), (1110, 200), (1150, 120), (1230, 90), (1300, 40), (1390, 20),
]

# ---------------------------------------------------------------- Atlantis Harabeleri
# Mermer basamaklar: sağ açılı dönüşlerle çaprazlama inen yol.
ATLANTIS_PATH = [
    (-40, 120), (260, 120), (300, 130), (320, 170), (330, 320), (360, 340), (600, 340), (640, 360), (650, 400),
    (650, 530), (690, 560), (940, 560), (980, 580), (990, 620), (990, 740), (1030, 770), (1300, 770),
    (1340, 800), (1390, 830),
]

# ---------------------------------------------------------------- Mangrov Deltası
# Tek nehir üçe ayrılır (sol, orta, sağ kol), sonra tek yolda birleşir.
MANGROVE_HEAD = [(-40, 130), (230, 160), (420, 190), (560, 260)]
MANGROVE_TAIL = [(800, 710), (900, 770), (1020, 830), (1100, 945)]
MANGROVE_LEFT = MANGROVE_HEAD + [(430, 400), (370, 520), (430, 640), (560, 730), (690, 745)] + MANGROVE_TAIL
MANGROVE_MID = MANGROVE_HEAD + [(610, 380), (640, 500), (690, 610), (750, 680)] + MANGROVE_TAIL
MANGROVE_RIGHT = MANGROVE_HEAD + [(800, 300), (980, 370), (1030, 520), (930, 640), (860, 690)] + MANGROVE_TAIL

# Atlantis koruyucu başları (oyundaki periyodik darbe merkezleri) ve Batık Gemi hazine sandığı
ATLANTIS_GUARDIANS = [(246, 198), (582, 414), (918, 642)]
BATIK_TREASURE = (X(905), 852)
