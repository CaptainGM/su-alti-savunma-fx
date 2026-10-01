"""Batık Gemi Mezarlığı'na özel nesneler: gemi gövdesi, çapa, fıçı, sandık, küp, altın."""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import common as C
from common import SS, rgb
from props import OUT


def _c(col, a=255):
    return tuple(int(v * 255) for v in col) + (a,)


def hull(rng, length=380, beam=130, wood='#80562f', plank='#a77a4a', dark='#3b2412', weed='#3f8f4a', broken=True):
    """Yukarıdan görünen, yarısı çökmüş gemi gövdesi."""
    w = int(length + 60)
    h = int(beam + 90)
    cx, cy = w / 2, h / 2

    def half_width(u):
        t = u / (length / 2)
        t = max(-1.0, min(1.0, t))
        # pruva sivri (sağ), kıç yuvarlak (sol)
        if t > 0:
            return beam / 2 * max(0.0, 1 - t ** 2.2) ** 0.65
        return beam / 2 * max(0.0, 1 - (-t) ** 2.8) ** 0.55

    def outline_pts(scale=1.0):
        top, bot = [], []
        for i in range(0, 121):
            u = -length / 2 + length * i / 120
            hw = half_width(u) * scale
            top.append((cx + u, cy - hw))
            bot.append((cx + u, cy + hw))
        return top + bot[::-1]

    hull_pts = outline_pts(1.0)
    deck_pts = outline_pts(0.84)
    m_hull = C.draw_mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in hull_pts], fill=255))
    m_deck = C.draw_mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in deck_pts], fill=255))

    # kırık bölüm: gövdenin ortasında rastgele bir oyuk
    hole = np.zeros((h, w), np.float32)
    hole_c = (cx + rng.uniform(-length * 0.12, length * 0.05), cy + rng.uniform(-8, 8))
    if broken:
        pts = C.blob_points(rng, hole_c[0], hole_c[1], length * 0.2, beam * 0.3, n=9, jitter=0.25)
        hole = C.draw_mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
        hole = ndi.gaussian_filter(hole, 1.0)

    # tahta dokusu: uzunlamasına damar
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    grain = np.sin(yy * 0.9 + C.fbm(h, w, 14, rng, 2) * 6) * 0.5 + 0.5
    var = C.fbm(h, w, 10, rng, 3)
    wood_c = rgb(wood)[None, None, :] * (0.78 + 0.34 * var[..., None]) * (0.92 + 0.12 * grain[..., None])
    deck_c = rgb(plank)[None, None, :] * (0.8 + 0.3 * var[..., None]) * (0.9 + 0.14 * grain[..., None])
    # güverte tahta çizgileri
    seam = (np.abs(((yy - cy) / 11.0) - np.round((yy - cy) / 11.0)) < 0.07).astype(np.float32)
    deck_c = deck_c * (1 - 0.35 * seam[..., None])
    # çapraz derzler (rastgele aralıkla)
    cross = np.zeros_like(seam)
    x = 10
    while x < w:
        cross[:, int(x):int(x) + 1] = 1
        x += rng.uniform(34, 60)
    deck_c = deck_c * (1 - 0.25 * cross[..., None])

    col = wood_c * (1 - m_deck[..., None]) + deck_c * m_deck[..., None]
    # yosun / midye kaplaması
    weed_gate = np.clip((C.fbm(h, w, 9, rng, 3) - 0.52) * 4, 0, 1) * 0.8
    col = col * (1 - weed_gate[..., None]) + rgb(weed)[None, None, :] * (0.7 + 0.5 * C.fbm(h, w, 3, rng, 2))[..., None] * weed_gate[..., None]

    alpha_m = np.clip(m_hull * (1 - hole), 0, 1)
    patch = C.shade_patch(alpha_m, col, light=(-0.5, -0.85), sigma=5.5, outline=OUT, outline_px=2.2, rng=rng, grain=0.03, rim=0.25)

    d = ImageDraw.Draw(patch)
    # güverte kenar çizgisi (küpeşte)
    d.line([(x, y) for x, y in outline_pts(0.9)] + [outline_pts(0.9)[0]], fill=_c(rgb(dark), 170), width=2)
    # iç kısım (oyuk): kaburgalar
    if broken:
        ribs = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
        rd = ImageDraw.Draw(ribs)
        hx, hy = hole_c
        for k in range(-5, 6):
            ux = hx + k * 17
            hwid = half_width(ux - cx) * 0.95
            rd.arc([(ux - 26) * SS, (cy - hwid) * SS, (ux + 26) * SS, (cy + hwid) * SS], 270, 90,
                   fill=_c(OUT), width=int(8 * SS))
            rd.arc([(ux - 26) * SS, (cy - hwid) * SS, (ux + 26) * SS, (cy + hwid) * SS], 270, 90,
                   fill=_c(np.clip(rgb(wood) * 0.9, 0, 1)), width=int(5 * SS))
        ribs = ribs.resize((w, h), Image.LANCZOS)
        rm = Image.fromarray((np.clip(hole, 0, 1) * 255).astype(np.uint8), 'L')
        ribs.putalpha(Image.fromarray((np.asarray(ribs.split()[3]).astype(np.float32) * np.asarray(rm).astype(np.float32) / 255).astype(np.uint8), 'L'))
        patch = Image.alpha_composite(patch, ribs)
        # oyuk kenarında karanlık kırık hattı
        edge = np.clip(ndi.gaussian_filter(hole, 1.5) - hole * 0.9, 0, 1) * m_hull
        e = np.zeros((h, w, 4), np.uint8)
        e[..., :3] = (OUT * 255).astype(np.uint8)
        e[..., 3] = (edge * 255).astype(np.uint8)
        patch = Image.alpha_composite(patch, Image.fromarray(e, 'RGBA'))
    # direk dibi ve halat bağları
    d = ImageDraw.Draw(patch)
    for k in (-0.28, 0.12, 0.38):
        px = cx + length * k
        r = 6
        d.ellipse([px - r, cy - r, px + r, cy + r], fill=_c(rgb(dark)), outline=_c(OUT), width=1)
    return patch


def mast(rng, length=260, thick=9):
    w = int(length + 40)
    h = 80
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = h / 2
    pts = [(20 + i * length / 12, y + math.sin(i * 0.5) * 2.0) for i in range(13)]
    d.line([(x * SS, yy * SS) for x, yy in pts], fill=_c(OUT), width=int((thick + 3) * SS))
    d.line([(x * SS, yy * SS) for x, yy in pts], fill=_c(rgb('#7a5233')), width=int(thick * SS))
    d.line([(x * SS, (yy - 2) * SS) for x, yy in pts], fill=_c(rgb('#b88a58'), 190), width=int(2.4 * SS))
    # çarmıh (yatay direk)
    bx = 20 + length * 0.7
    d.line([(bx * SS, (y - 34) * SS), (bx * SS, (y + 34) * SS)], fill=_c(OUT), width=int((thick * 0.8 + 3) * SS))
    d.line([(bx * SS, (y - 34) * SS), (bx * SS, (y + 34) * SS)], fill=_c(rgb('#7a5233')), width=int(thick * 0.8 * SS))
    # yırtık yelken parçası
    sail = [(bx + 4, y - 30), (bx + 70, y - 24), (bx + 56, y - 4), (bx + 78, y + 14), (bx + 40, y + 28), (bx + 4, y + 30)]
    d.polygon([(x * SS, yy * SS) for x, yy in sail], fill=_c(rgb('#e8dcc0'), 235), outline=_c(OUT))
    d.line([(bx + 20, y - 26), (bx + 24, y + 28)], fill=_c(rgb('#c4b898')), width=SS)
    d.line([(bx + 40, y - 25), (bx + 44, y + 24)], fill=_c(rgb('#c4b898')), width=SS)
    return img.resize((w, h), Image.LANCZOS)


def anchor(rng, size=70):
    w = int(size * 2.2)
    img = Image.new('RGBA', (w * SS, w * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = w / 2
    iron = rgb('#6c7a86')
    hi = rgb('#a9bac6')

    def line(p, q, wd):
        d.line([(p[0] * SS, p[1] * SS), (q[0] * SS, q[1] * SS)], fill=_c(OUT), width=int((wd + 3.5) * SS))
        d.line([(p[0] * SS, p[1] * SS), (q[0] * SS, q[1] * SS)], fill=_c(iron), width=int(wd * SS))
        d.line([(p[0] * SS - SS, p[1] * SS - SS), (q[0] * SS - SS, q[1] * SS - SS)], fill=_c(hi, 160), width=int(wd * 0.3 * SS))
    top, bottom = (c, c - size * 0.9), (c, c + size * 0.75)
    line(top, bottom, 8)
    line((c - size * 0.36, c - size * 0.52), (c + size * 0.36, c - size * 0.52), 6)
    # kollar
    pts = []
    for i in range(0, 21):
        a = math.pi * (0.1 + 0.8 * i / 20)
        pts.append((c + math.cos(a + math.pi) * size * 0.72, c + size * 0.28 + math.sin(a) * size * 0.56))
    d.line([(x * SS, y * SS) for x, y in pts], fill=_c(OUT), width=int(11.5 * SS))
    d.line([(x * SS, y * SS) for x, y in pts], fill=_c(iron), width=int(8 * SS))
    for sgn in (-1, 1):
        tip = (c + sgn * size * 0.74, c + size * 0.06)
        d.polygon([(tip[0] * SS, tip[1] * SS), ((tip[0] - sgn * 14) * SS, (tip[1] - 16) * SS), ((tip[0] - sgn * 4) * SS, (tip[1] + 6) * SS)],
                  fill=_c(iron), outline=_c(OUT))
    ring_c = (c, c - size * 1.0)
    d.ellipse([(ring_c[0] - 9) * SS, (ring_c[1] - 9) * SS, (ring_c[0] + 9) * SS, (ring_c[1] + 9) * SS], outline=_c(OUT), width=int(7 * SS))
    d.ellipse([(ring_c[0] - 9) * SS, (ring_c[1] - 9) * SS, (ring_c[0] + 9) * SS, (ring_c[1] + 9) * SS], outline=_c(iron), width=int(4 * SS))
    img = img.resize((w, w), Image.LANCZOS).rotate(rng.uniform(-40, 40), resample=Image.BICUBIC)
    return img


def barrel(rng, r=22, wood='#8a5a30'):
    w = int(r * 2.6)
    m = C.draw_mask_patch(w, w, lambda d, s: d.ellipse([(w / 2 - r) * s, (w / 2 - r) * s, (w / 2 + r) * s, (w / 2 + r) * s], fill=255))
    yy, xx = np.mgrid[0:w, 0:w].astype(np.float32)
    ang = np.arctan2(yy - w / 2, xx - w / 2)
    stripes = np.abs(np.sin((xx - w / 2) / r * 5.2)) > 0.1
    var = C.fbm(w, w, 5, rng, 2)
    col = rgb(wood)[None, None, :] * (0.8 + 0.3 * var[..., None]) * np.where(stripes, 1.0, 0.72)[..., None]
    patch = C.shade_patch(m, col, sigma=r * 0.5, outline=OUT, outline_px=1.8, rng=rng, grain=0.04)
    d = ImageDraw.Draw(patch)
    for rr, ww in ((r * 0.98, 3), (r * 0.62, 3)):
        d.ellipse([w / 2 - rr, w / 2 - rr, w / 2 + rr, w / 2 + rr], outline=_c(rgb('#52606c')), width=ww)
    return patch


def crate(rng, s=40, wood='#9a6c3c'):
    w = int(s * 1.7)
    rot = rng.uniform(-0.5, 0.5)
    pts = [(-s / 2, -s / 2), (s / 2, -s / 2), (s / 2, s / 2), (-s / 2, s / 2)]
    pts = [(w / 2 + x * math.cos(rot) - y * math.sin(rot), w / 2 + x * math.sin(rot) + y * math.cos(rot)) for x, y in pts]
    m = C.draw_mask_patch(w, w, lambda d, s2: d.polygon([(x * s2, y * s2) for x, y in pts], fill=255))
    var = C.fbm(w, w, 4, rng, 2)
    col = rgb(wood)[None, None, :] * (0.8 + 0.3 * var[..., None])
    patch = C.shade_patch(m, col, sigma=s * 0.18, outline=OUT, outline_px=1.8, rng=rng, grain=0.05)
    d = ImageDraw.Draw(patch)
    for a, b in ((0, 2), (1, 3)):
        d.line([pts[a], pts[b]], fill=_c(rgb('#4a2f18'), 220), width=3)
    d.polygon(pts, outline=_c(rgb('#4a2f18')), width=2)
    return patch


def amphora(rng, h=64):
    w = int(h * 1.6)
    img = Image.new('RGBA', (w * SS, w * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = w / 2
    body = [(c - h * 0.5, c), (c - h * 0.28, c - h * 0.26), (c + h * 0.1, c - h * 0.28), (c + h * 0.34, c - h * 0.1), (c + h * 0.5, c - h * 0.06),
            (c + h * 0.5, c + h * 0.06), (c + h * 0.34, c + h * 0.1), (c + h * 0.1, c + h * 0.28), (c - h * 0.28, c + h * 0.26)]
    d.polygon([(x * SS, y * SS) for x, y in body], fill=_c(OUT))
    shrunk = [(c + (x - c) * 0.92, c + (y - c) * 0.88) for x, y in body]
    d.polygon([(x * SS, y * SS) for x, y in shrunk], fill=_c(rgb('#b8643c')))
    d.polygon([(x * SS, y * SS) for x, y in [(c - h * 0.4, c - 4), (c - h * 0.2, c - h * 0.2), (c + h * 0.05, c - h * 0.21), (c - h * 0.1, c - 6)]], fill=_c(rgb('#e29868'), 200))
    d.arc([(c + h * 0.05) * SS, (c - h * 0.42) * SS, (c + h * 0.3) * SS, (c - h * 0.04) * SS], 180, 360, fill=_c(OUT), width=int(4 * SS))
    img = img.resize((w, w), Image.LANCZOS).rotate(rng.uniform(0, 360), resample=Image.BICUBIC)
    return img


def chest(rng, w0=62):
    w = int(w0 * 1.7)
    h = int(w0 * 1.3)
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    x0, y0 = (w - w0) / 2, (h - w0 * 0.62) / 2
    x1, y1 = x0 + w0, y0 + w0 * 0.62
    d.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], 5 * SS, fill=_c(OUT))
    d.rounded_rectangle([(x0 + 2) * SS, (y0 + 2) * SS, (x1 - 2) * SS, (y1 - 2) * SS], 4 * SS, fill=_c(rgb('#8c5a2e')))
    # açık kapak: altın dolu
    d.rounded_rectangle([(x0 + 5) * SS, (y0 + 5) * SS, (x1 - 5) * SS, (y0 + w0 * 0.3) * SS], 3 * SS, fill=_c(rgb('#f4c430')), outline=_c(OUT))
    for _ in range(26):
        px = rng.uniform(x0 + 8, x1 - 8)
        py = rng.uniform(y0 + 7, y0 + w0 * 0.28)
        r = rng.uniform(2.4, 3.8)
        d.ellipse([(px - r) * SS, (py - r) * SS, (px + r) * SS, (py + r) * SS], fill=_c(rgb('#ffd84a')), outline=_c(rgb('#a6760a')), width=SS)
    d.line([(x0 + 8) * SS, (y0 + w0 * 0.4) * SS, (x1 - 8) * SS, (y0 + w0 * 0.4) * SS], fill=_c(rgb('#d9a626')), width=int(4 * SS))
    d.rectangle([(w / 2 - 5) * SS, (y0 + w0 * 0.33) * SS, (w / 2 + 5) * SS, (y0 + w0 * 0.5) * SS], fill=_c(rgb('#f1c232')), outline=_c(OUT))
    return img.resize((w, h), Image.LANCZOS).rotate(rng.uniform(-18, 18), resample=Image.BICUBIC)


def coin(rng, r=5):
    w = int(r * 3)
    m = C.draw_mask_patch(w, w, lambda d, s: d.ellipse([(w / 2 - r) * s, (w / 2 - r * 0.8) * s, (w / 2 + r) * s, (w / 2 + r * 0.8) * s], fill=255))
    return C.shade_patch(m, rgb('#f2c230'), sigma=r * 0.4, outline=rgb('#7a5408'), outline_px=1.0, rng=rng, grain=0.0)


def skull_fish(rng, size=40):
    """Balık iskeleti."""
    w = int(size * 2.2)
    img = Image.new('RGBA', (w * SS, w * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = w / 2
    bone = _c(rgb('#ebe6d2'))
    ol = _c(OUT)
    d.line([((c - size * 0.7) * SS, c * SS), ((c + size * 0.5) * SS, c * SS)], fill=ol, width=int(5 * SS))
    d.line([((c - size * 0.7) * SS, c * SS), ((c + size * 0.5) * SS, c * SS)], fill=bone, width=int(2.4 * SS))
    for i in range(7):
        x = c - size * 0.55 + i * size * 0.16
        L = size * 0.32 * (1 - abs(i - 3) / 6)
        for sgn in (-1, 1):
            d.line([(x * SS, c * SS), ((x + 4) * SS, (c + sgn * L) * SS)], fill=ol, width=int(3.4 * SS))
            d.line([(x * SS, c * SS), ((x + 4) * SS, (c + sgn * L) * SS)], fill=bone, width=int(1.4 * SS))
    d.ellipse([(c + size * 0.5) * SS, (c - size * 0.2) * SS, (c + size * 0.95) * SS, (c + size * 0.2) * SS], fill=bone, outline=ol, width=int(2 * SS))
    d.ellipse([(c + size * 0.72) * SS, (c - size * 0.08) * SS, (c + size * 0.82) * SS, (c + size * 0.02) * SS], fill=ol)
    d.polygon([((c - size * 0.7) * SS, c * SS), ((c - size * 0.98) * SS, (c - size * 0.22) * SS), ((c - size * 0.98) * SS, (c + size * 0.22) * SS)], fill=bone, outline=ol)
    return img.resize((w, w), Image.LANCZOS).rotate(rng.uniform(0, 360), resample=Image.BICUBIC)
