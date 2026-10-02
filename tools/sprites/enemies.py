"""Yeni düşman sprite'ları: Kalkanlı Kaplumbağa, Şifacı Denizatı, Hayalet Kalamar, Elektrikli Müren.

Aynı üslup: kalın koyu ana hat, yumuşak ışıklandırma, parlak vurgu, büyük gözler. Hepsi kameraya bakar.
"""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import toolkit as T
from toolkit import S, rgb


def _tex(rng, sigma=7):
    t = ndi.gaussian_filter(rng.standard_normal((S, S)).astype(np.float32), sigma)
    return (t - t.min()) / (t.max() - t.min())


def _lines(img, segs, color, width, clip=None, alpha=0.8):
    """Maske içinde kalan çizgiler (kabuk deseni, benekler)."""
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    for pts in segs:
        dd.line(pts, fill=tuple(int(c * 255) for c in color) + (int(alpha * 255),), width=int(width), joint='curve')
    a = np.asarray(d).astype(np.float32) / 255.0
    if clip is not None:
        a[..., 3] *= (clip > 0.5)
    return T.over(img, a)


def _hex(cx, cy, r, rot=0.0):
    return [(cx + math.cos(rot + i * math.pi / 3) * r, cy + math.sin(rot + i * math.pi / 3) * r) for i in range(7)]


# ---------------------------------------------------------------- Kalkanlı Kaplumbağa
def turtle(path):
    rng = np.random.default_rng(31)
    img = T.blank()
    cx, cy = 500, 480
    skin0, skin1 = rgb('#d9ec7a'), rgb('#7fae3c')

    # arka ayaklar (üstte) ve kuyruk
    for sx in (-1, 1):
        foot = [(cx + sx * 190, cy - 150), (cx + sx * 300, cy - 250), (cx + sx * 395, cy - 190), (cx + sx * 350, cy - 100), (cx + sx * 240, cy - 80)]
        img = T.over(img, T.layer(T.mask_poly(T.smooth_closed(foot, 10)), skin0, skin1, angle=70, sigma=14, outline_px=10))
    # ön yüzgeçler (kürek)
    for sx in (-1, 1):
        fl = [(cx + sx * 200, cy + 80), (cx + sx * 390, cy + 130), (cx + sx * 470, cy + 250), (cx + sx * 400, cy + 300), (cx + sx * 260, cy + 220)]
        img = T.over(img, T.layer(T.mask_poly(T.smooth_closed(fl, 10)), skin0, skin1, angle=60, sigma=16, outline_px=10))
        for k in range(3):    # pençe çizgileri
            a = cx + sx * (370 + k * 28), cy + 235 + k * 18
            img = _lines(img, [[(a[0] - sx * 38, a[1] - 26), (a[0] + sx * 4, a[1] + 6)]], T.OUTLINE, 6, alpha=0.8)
    # kafa (kabuğun altından çıkar)
    head = T.mask_ellipse(cx, cy + 310, 128, 118)
    img = T.over(img, T.layer(head, skin0, skin1, angle=90, sigma=36, outline_px=11, gloss=0.5, rim=0.3))
    # kabuk
    shell = T.mask_ellipse(cx, cy - 10, 305, 262)
    tex = _tex(rng, 9)
    img = T.over(img, T.layer(shell, rgb('#5ec2a8'), rgb('#1c6f78'), angle=95, sigma=70, outline_px=13, texture=tex, gloss=0.55, rim=0.4))
    # kabuk kenarı (halka) ve plakalar
    ring_in = T.mask_ellipse(cx, cy - 10, 255, 212)
    img = _lines(img, [[(cx + math.cos(a / 40 * 2 * math.pi) * 255, cy - 10 + math.sin(a / 40 * 2 * math.pi) * 212) for a in range(41)]], rgb('#0d3b45'), 9, clip=shell, alpha=0.9)
    segs = [_hex(cx, cy - 10, 92, math.pi / 6)]
    for i in range(6):
        a = math.pi / 6 + i * math.pi / 3 + math.pi / 6
        x, y = cx + math.cos(a) * 160, cy - 10 + math.sin(a) * 140
        segs.append(_hex(x, y, 74, math.pi / 6))
        segs.append([(cx + math.cos(a) * 92 * 0.87, cy - 10 + math.sin(a) * 92 * 0.87), (cx + math.cos(a) * 255, cy - 10 + math.sin(a) * 212)])
    img = _lines(img, segs, rgb('#0d3b45'), 8, clip=shell, alpha=0.85)
    for i in range(10):    # kenar çentikleri
        a = i / 10 * 2 * math.pi
        img = _lines(img, [[(cx + math.cos(a) * 262, cy - 10 + math.sin(a) * 222), (cx + math.cos(a) * 296, cy - 10 + math.sin(a) * 254)]], rgb('#0d3b45'), 7, clip=shell, alpha=0.8)
    # kalkan parıltısı: oyun kalkanı ayrıca çizer, burada kabuk parlak
    img = T.add_highlight(img, 400, 270, 150, 46, rot=-0.5, alpha=0.5)
    img = T.add_highlight(img, 650, 330, 40, 16, rot=-0.6, alpha=0.4)
    # yüz
    img = T.eye(img, 440, 770, 44, look=(0.1, 0.2), angry=0.55, inner=1)
    img = T.eye(img, 560, 770, 44, look=(-0.1, 0.2), angry=0.55, inner=-1)
    nostrils = [(485, 840), (515, 840)]
    for nx, ny in nostrils:
        img = T.over(img, T.layer(T.mask_ellipse(nx, ny, 7, 5), rgb('#2c4a1e'), rgb('#2c4a1e'), outline=False, gloss=0, rim=0))
    smile = [(430, 880), (470, 905), (530, 905), (570, 880)]
    img = _lines(img, [smile], T.OUTLINE, 9, alpha=0.95)
    T.finish(img, path)


# ---------------------------------------------------------------- Şifacı Denizatı
def seahorse(path):
    rng = np.random.default_rng(32)
    img = T.blank()
    pink0, pink1 = rgb('#ff9bc4'), rgb('#d9407f')
    # kuyruk (kıvrık) + gövde (S eğrisi)
    spine = [(560, 250), (520, 380), (470, 520), (520, 640), (590, 740), (560, 850), (470, 880), (420, 830), (450, 780)]
    body = T.mask_profile(spine, [150, 210, 250, 230, 170, 110, 70, 46, 34])
    # sırt yüzgeci
    fin = [(610, 420), (730, 380), (775, 470), (740, 580), (640, 600)]
    img = T.over(img, T.layer(T.mask_poly(T.smooth_closed(fin, 10)), rgb('#fff0a0'), rgb('#f2b43a'), angle=0, sigma=12, outline_px=9))
    for k in range(5):
        a = (640 + k * 20, 430 + k * 36)
        img = _lines(img, [[a, (a[0] + 90 - k * 6, a[1] - 12 + k * 4)]], rgb('#c27a1a'), 5, alpha=0.7)
    # gövde halkaları
    tex = _tex(rng, 6)
    img = T.over(img, T.layer(body, pink0, pink1, angle=60, sigma=46, outline_px=12, texture=tex, gloss=0.5, rim=0.35))
    # karın bantları
    belly = T.mask_profile([(540, 420), (500, 540), (545, 640), (595, 735)], [90, 120, 100, 60]) * body
    bl = T.layer(belly, rgb('#fff1dd'), rgb('#ffd3b5'), angle=90, sigma=24, outline=False, gloss=0.0, rim=0.0)
    bl[..., 3] *= 0.9
    img = T.over(img, bl)
    ring_y = [(430, 560), (470, 590), (510, 620), (540, 665), (560, 710), (575, 760)]
    for i, (rx_, ry_) in enumerate(ring_y):
        img = _lines(img, [[(rx_ - 70 + i * 4, ry_ - 8), (rx_ + 70 - i * 4, ry_ + 8)]], rgb('#9d2a5c'), 6, clip=body, alpha=0.55)
    # şifa işareti (yeşil artı) göğüste
    plus = T.mask_stroke([(520, 450), (520, 530)], 26) + T.mask_stroke([(480, 490), (560, 490)], 26)
    plus = np.clip(plus, 0, 1) * body
    img = T.over(img, T.layer(plus, rgb('#caffd0'), rgb('#4cd983'), angle=90, sigma=8, outline_px=6, gloss=0.4, rim=0.0))
    # baş: burun uzantısı sola doğru
    head = T.mask_ellipse(560, 270, 150, 140)
    img = T.over(img, T.layer(head, pink0, pink1, angle=70, sigma=42, outline_px=12, gloss=0.55, rim=0.3))
    snout = T.mask_taper([(480, 300), (390, 330), (300, 360)], 120, 56)
    img = T.over(img, T.layer(snout, pink0, pink1, angle=75, sigma=22, outline_px=11, gloss=0.4, rim=0.2))
    img = T.over(img, T.layer(T.mask_ellipse(298, 362, 32, 24), rgb('#ffb2cf'), rgb('#d9407f'), sigma=8, outline_px=8, gloss=0.4, rim=0.0))
    # taç (diken) sırtı
    for i in range(5):
        a = math.radians(-150 + i * 26)
        bx, by = 575 + math.cos(a) * 130, 255 + math.sin(a) * 125
        tip = (575 + math.cos(a) * 190, 255 + math.sin(a) * 185)
        pts = [(bx - 22 * math.sin(a), by + 22 * math.cos(a)), tip, (bx + 22 * math.sin(a), by - 22 * math.cos(a))]
        img = T.over(img, T.layer(T.mask_poly(pts), rgb('#ffe08a'), rgb('#e88a2a'), angle=-90, sigma=5, outline_px=8, gloss=0.2, rim=0.0))
    # göz
    img = T.eye(img, 520, 250, 56, look=(-0.15, 0.1), pupil=0.58, color_iris=(0.1, 0.35, 0.3))
    for sx in (470,):
        c = ndi.gaussian_filter(T.mask_ellipse(sx, 330, 34, 20), 10) * head
        img = T.over(img, np.dstack([np.broadcast_to(rgb('#ff5f78'), (S, S, 3)), c * 0.6]))
    # pembe kıvrık kuyruk ucu parlaması
    img = T.add_highlight(img, 500, 150, 70, 22, rot=-0.5, alpha=0.5)
    img = T.add_highlight(img, 430, 560, 24, 70, rot=0.15, alpha=0.4)
    T.finish(img, path)


# ---------------------------------------------------------------- Hayalet Kalamar
def squid(path):
    rng = np.random.default_rng(33)
    img = T.blank()
    c0, c1 = rgb('#9c7bff'), rgb('#34227a')
    # dokunaçlar (arkada)
    tentacles = [
        [(430, 560), (380, 700), (340, 820), (350, 930)],
        [(470, 570), (450, 720), (430, 840), (460, 950)],
        [(510, 570), (520, 720), (545, 850), (520, 960)],
        [(550, 560), (600, 700), (640, 830), (620, 930)],
        [(400, 540), (310, 640), (250, 760), (300, 860)],
        [(600, 540), (690, 640), (750, 760), (700, 860)],
    ]
    for pts in tentacles:
        m = T.mask_taper(T.smooth_open(pts, 10), 62, 18)
        img = T.over(img, T.layer(m, rgb('#8d6cf0'), rgb('#432c93'), angle=90, sigma=12, outline_px=9, gloss=0.3, rim=0.2))
        # vantuz noktaları
        for t in (0.3, 0.5, 0.7):
            idx = int(t * (len(pts) - 1))
            px, py = pts[idx]
            img = T.over(img, T.layer(T.mask_ellipse(px, py, 8, 8), rgb('#d9ccff'), rgb('#a08bf0'), outline=False, gloss=0, rim=0, sigma=3))
    # yüzgeçler
    for sx in (-1, 1):
        fin = [(500 + sx * 120, 190), (500 + sx * 300, 120), (500 + sx * 330, 260), (500 + sx * 150, 330)]
        img = T.over(img, T.layer(T.mask_poly(T.smooth_closed(fin, 10)), rgb('#b59cff'), rgb('#5b3bc4'), angle=0 if sx > 0 else 180, sigma=16, outline_px=10, gloss=0.3, rim=0.2))
    # manto (üçgenimsi gövde)
    mantle_pts = [(500, 70), (610, 200), (640, 380), (600, 540), (500, 590), (400, 540), (360, 380), (390, 200)]
    mantle = T.mask_poly(T.smooth_closed(mantle_pts, 12))
    tex = _tex(rng, 8)
    img = T.over(img, T.layer(mantle, c0, c1, angle=90, sigma=60, outline_px=13, texture=tex, gloss=0.55, rim=0.4))
    # parlayan benekler
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    for _ in range(26):
        x = 500 + rng.uniform(-110, 110)
        y = rng.uniform(140, 470)
        r = rng.uniform(5, 12)
        dd.ellipse([x - r, y - r, x + r, y + r], fill=(160, 255, 244, 190))
    dm = np.asarray(d).astype(np.float32) / 255.0
    dm[..., 3] *= (mantle > 0.5)
    img = T.over(img, dm)
    # yüz bölgesi: iri parlak gözler
    img = T.eye(img, 430, 470, 64, look=(0.1, 0.1), pupil=0.5, color_iris=(0.05, 0.75, 0.8), angry=0.35, inner=1)
    img = T.eye(img, 570, 470, 64, look=(-0.1, 0.1), pupil=0.5, color_iris=(0.05, 0.75, 0.8), angry=0.35, inner=-1)
    # gagası
    beak = T.mask_poly([(472, 560), (528, 560), (500, 612)])
    img = T.over(img, T.layer(beak, rgb('#e8e0ff'), rgb('#9a8cd0'), angle=90, sigma=6, outline_px=8, gloss=0.3, rim=0.0))
    img = T.add_highlight(img, 460, 210, 62, 24, rot=-0.9, alpha=0.5)
    T.finish(img, path)


# ---------------------------------------------------------------- Elektrikli Müren
def moray(path):
    rng = np.random.default_rng(34)
    img = T.blank()
    g0, g1 = rgb('#d6d84a'), rgb('#6f8a1f')
    # gövde: aşağıdan kıvrılarak yukarı çıkar; kafa ortada, açık ağızla kameraya bakar
    spine = [(180, 940), (260, 820), (430, 770), (640, 790), (780, 700), (760, 560), (640, 470), (520, 450)]
    body = T.mask_profile(spine, [70, 120, 170, 200, 210, 220, 240, 270])
    tex = _tex(rng, 7)
    img = T.over(img, T.layer(body, g0, g1, angle=70, sigma=50, outline_px=13, texture=tex, gloss=0.5, rim=0.35))
    # sırt yüzgeci (şerit)
    fin_line = [(300, 830), (470, 765), (650, 770), (760, 690), (740, 560)]
    img = _lines(img, [fin_line], rgb('#3a4a10'), 10, clip=body, alpha=0.55)
    # karın açık rengi
    belly = T.mask_profile([(210, 930), (300, 850), (460, 820), (640, 840), (790, 760)], [30, 50, 70, 80, 70]) * body
    bl = T.layer(belly, rgb('#fff6b0'), rgb('#f0e07a'), angle=90, sigma=16, outline=False, gloss=0.0, rim=0.0)
    bl[..., 3] *= 0.75
    img = T.over(img, bl)
    # kahverengi benekler
    d = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dd = ImageDraw.Draw(d)
    for _ in range(70):
        x, y = rng.uniform(150, 850), rng.uniform(380, 960)
        r = rng.uniform(8, 20)
        dd.ellipse([x - r, y - r * 0.8, x + r, y + r * 0.8], fill=(86, 62, 18, 200))
    dm = np.asarray(d).astype(np.float32) / 255.0
    dm[..., 3] *= (body > 0.5)
    img = T.over(img, dm)
    # baş: büyük, açık ağız
    cx, cy = 520, 400
    head = T.mask_ellipse(cx, cy, 250, 210)
    img = T.over(img, T.layer(head, g0, g1, angle=80, sigma=56, outline_px=13, texture=tex, gloss=0.55, rim=0.35))
    # ağız içi
    mouth = T.mask_ellipse(cx, cy + 90, 175, 100)
    img = T.over(img, T.layer(mouth, rgb('#d63a50'), rgb('#6a0f22'), angle=90, sigma=30, outline_px=11, gloss=0.0, rim=0.4))
    tongue = T.mask_ellipse(cx, cy + 140, 90, 38)
    img = T.over(img, T.layer(tongue, rgb('#ff8da0'), rgb('#c9364f'), angle=90, sigma=10, outline=False, gloss=0.2, rim=0.0))
    # dişler: üst ve alt sıra
    for i in range(9):
        t = (i - 4) / 4
        x = cx + t * 150
        yu = cy + 30 + abs(t) * 38
        img = T.over(img, T.layer(T.mask_poly([(x - 17, yu - 4), (x + 17, yu - 4), (x + 2 * t, yu + 54)]), rgb('#ffffff'), rgb('#d8dee6'), angle=90, sigma=4, outline_px=6, gloss=0.2, rim=0.0))
        yl = cy + 162 - abs(t) * 18
        img = T.over(img, T.layer(T.mask_poly([(x - 15, yl + 6), (x + 15, yl + 6), (x - 2 * t, yl - 44)]), rgb('#ffffff'), rgb('#d8dee6'), angle=90, sigma=4, outline_px=6, gloss=0.2, rim=0.0))
    # gözler (kaşlı, öfkeli)
    img = T.eye(img, cx - 108, cy - 70, 52, look=(0.15, 0.2), pupil=0.5, color_iris=(0.9, 0.7, 0.05), angry=0.7, inner=1)
    img = T.eye(img, cx + 108, cy - 70, 52, look=(-0.15, 0.2), pupil=0.5, color_iris=(0.9, 0.7, 0.05), angry=0.7, inner=-1)
    for nx in (-34, 34):
        img = T.over(img, T.layer(T.mask_ellipse(cx + nx, cy - 10, 9, 7), rgb('#2c3a10'), rgb('#2c3a10'), outline=False, gloss=0, rim=0, sigma=3))
    # elektrik kıvılcımları (mavi-beyaz zikzaklar)
    sp = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sp)
    bolts = [
        [(150, 230), (210, 270), (180, 320), (250, 350), (215, 410)],
        [(850, 210), (790, 260), (830, 310), (760, 340), (800, 400)],
        [(300, 90), (340, 140), (310, 190), (370, 215)],
        [(700, 70), (660, 130), (700, 170), (650, 220)],
    ]
    for b in bolts:
        sd.line(b, fill=(120, 215, 255, 150), width=22, joint='curve')
        sd.line(b, fill=(235, 250, 255, 255), width=8, joint='curve')
    sa = np.asarray(sp).astype(np.float32) / 255.0
    sa[..., 3] = ndi.gaussian_filter(sa[..., 3], 1.0)
    img = T.over(img, sa)
    img = T.add_highlight(img, 440, 270, 120, 30, rot=-0.4, alpha=0.5)
    T.finish(img, path)


def build_all(out):
    turtle(out('enemy_turtle.png'))
    seahorse(out('enemy_seahorse.png'))
    squid(out('enemy_squid.png'))
    moray(out('enemy_moray.png'))
