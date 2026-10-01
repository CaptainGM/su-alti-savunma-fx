"""Batık Gemi Mezarlığı'na özel nesneler: gemi gövdesi, çapa, fıçı, sandık, altın, balık iskeleti."""
import math

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import common as C
from common import K, SSCanvas, rgb
from props import OUT, col8


def hull(rng, length=380, beam=130, wood='#80562f', plank='#a77a4a', dark='#3b2412', weed='#3f8f4a', broken=True):
    """Yukarıdan görünen, yarısı çökmüş gemi gövdesi."""
    w = int(length + 60)
    h = int(beam + 90)
    cx, cy = w / 2, h / 2

    def half_width(u):
        t = max(-1.0, min(1.0, u / (length / 2)))
        if t > 0:   # pruva sivri
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
    m_hull = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in hull_pts], fill=255))
    m_deck = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in deck_pts], fill=255))
    yy, xx = C.patch_grid(m_hull)

    hole = np.zeros_like(m_hull)
    hole_c = (cx + rng.uniform(-length * 0.12, length * 0.05), cy + rng.uniform(-8, 8))
    if broken:
        pts = C.blob_points(rng, hole_c[0], hole_c[1], length * 0.2, beam * 0.3, n=9, jitter=0.25)
        hole = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
        hole = ndi.gaussian_filter(hole, 1.0 * K)

    grain = np.sin(yy * 0.9 + C.fbm(h, w, 14, rng, 2) * 6) * 0.5 + 0.5
    var = C.fbm(h, w, 10, rng, 3)
    fine = C.fbm(h, w, 2.5, rng, 2)
    wood_c = rgb(wood)[None, None, :] * (0.78 + 0.34 * var[..., None]) * (0.92 + 0.12 * grain[..., None])
    deck_c = rgb(plank)[None, None, :] * (0.8 + 0.3 * var[..., None]) * (0.9 + 0.14 * grain[..., None]) * (0.94 + 0.12 * fine[..., None])
    seam = (np.abs(((yy - cy) / 11.0) - np.round((yy - cy) / 11.0)) < 0.07).astype(np.float32)
    deck_c = deck_c * (1 - 0.35 * seam[..., None])
    cross = np.zeros_like(seam)
    x = 10
    while x < w:
        cross[:, int(x * K):int(x * K) + max(1, K)] = 1
        x += rng.uniform(34, 60)
    deck_c = deck_c * (1 - 0.25 * cross[..., None])

    col = wood_c * (1 - m_deck[..., None]) + deck_c * m_deck[..., None]
    weed_gate = np.clip((C.fbm(h, w, 9, rng, 3) - 0.52) * 4, 0, 1) * 0.8
    col = col * (1 - weed_gate[..., None]) + rgb(weed)[None, None, :] * (0.7 + 0.5 * C.fbm(h, w, 3, rng, 2))[..., None] * weed_gate[..., None]

    alpha_m = np.clip(m_hull * (1 - hole), 0, 1)
    patch = C.shade_patch(alpha_m, col, light=(-0.5, -0.85), sigma=5.5, outline=OUT, outline_px=2.2, rng=rng, grain=0.03, rim=0.25)

    ex = SSCanvas(w, h)
    s = ex.s
    op = outline_pts(0.9)
    ex.d.line([(x * s, y * s) for x, y in op] + [(op[0][0] * s, op[0][1] * s)], fill=col8(rgb(dark), 170), width=int(2 * s))
    for k in (-0.28, 0.12, 0.38):
        px = cx + length * k
        r = 6
        ex.d.ellipse([(px - r) * s, (cy - r) * s, (px + r) * s, (cy + r) * s], fill=col8(rgb(dark)), outline=col8(OUT), width=int(s))
    patch = Image.alpha_composite(patch, ex.finish())

    if broken:
        ribs = SSCanvas(w, h)
        s = ribs.s
        hx, hy = hole_c
        for k in range(-5, 6):
            ux = hx + k * 17
            hwid = half_width(ux - cx) * 0.95
            box = [(ux - 26) * s, (cy - hwid) * s, (ux + 26) * s, (cy + hwid) * s]
            ribs.d.arc(box, 270, 90, fill=col8(OUT), width=int(8 * s))
            ribs.d.arc(box, 270, 90, fill=col8(np.clip(rgb(wood) * 0.9, 0, 1)), width=int(5 * s))
        r_img = ribs.finish()
        ra = np.asarray(r_img).astype(np.float32) / 255.0
        ra[..., 3] *= np.clip(hole, 0, 1)
        patch = Image.alpha_composite(patch, Image.fromarray((ra * 255).astype(np.uint8), 'RGBA'))
        edge = np.clip(ndi.gaussian_filter(hole, 1.5 * K) - hole * 0.9, 0, 1) * m_hull
        e = np.zeros(m_hull.shape + (4,), np.uint8)
        e[..., :3] = (OUT * 255).astype(np.uint8)
        e[..., 3] = (edge * 255).astype(np.uint8)
        patch = Image.alpha_composite(patch, Image.fromarray(e, 'RGBA'))
    return patch


def mast(rng, length=260, thick=9):
    w = int(length + 40)
    h = 80
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    y = h / 2
    pts = [(20 + i * length / 12, y + math.sin(i * 0.5) * 2.0) for i in range(13)]
    d.line([(x * s, yy * s) for x, yy in pts], fill=col8(OUT), width=int((thick + 3) * s))
    d.line([(x * s, yy * s) for x, yy in pts], fill=col8(rgb('#7a5233')), width=int(thick * s))
    d.line([(x * s, (yy - 2) * s) for x, yy in pts], fill=col8(rgb('#b88a58'), 190), width=int(2.4 * s))
    bx = 20 + length * 0.7
    d.line([(bx * s, (y - 34) * s), (bx * s, (y + 34) * s)], fill=col8(OUT), width=int((thick * 0.8 + 3) * s))
    d.line([(bx * s, (y - 34) * s), (bx * s, (y + 34) * s)], fill=col8(rgb('#7a5233')), width=int(thick * 0.8 * s))
    sail = [(bx + 4, y - 30), (bx + 70, y - 24), (bx + 56, y - 4), (bx + 78, y + 14), (bx + 40, y + 28), (bx + 4, y + 30)]
    d.polygon([(x * s, yy * s) for x, yy in sail], fill=col8(rgb('#e8dcc0'), 235), outline=col8(OUT))
    d.line([(bx + 20) * s, (y - 26) * s, (bx + 24) * s, (y + 28) * s], fill=col8(rgb('#c4b898')), width=int(s))
    d.line([(bx + 40) * s, (y - 25) * s, (bx + 44) * s, (y + 24) * s], fill=col8(rgb('#c4b898')), width=int(s))
    return c.finish()


def anchor(rng, size=70):
    w = int(size * 2.2)
    c = SSCanvas(w, w)
    d, s = c.d, c.s
    cc = w / 2
    iron = rgb('#6c7a86')
    hi = rgb('#a9bac6')

    def line(p, q, wd):
        d.line([(p[0] * s, p[1] * s), (q[0] * s, q[1] * s)], fill=col8(OUT), width=int((wd + 3.5) * s))
        d.line([(p[0] * s, p[1] * s), (q[0] * s, q[1] * s)], fill=col8(iron), width=int(wd * s))
        d.line([(p[0] * s - s, p[1] * s - s), (q[0] * s - s, q[1] * s - s)], fill=col8(hi, 160), width=int(wd * 0.3 * s))
    line((cc, cc - size * 0.9), (cc, cc + size * 0.75), 8)
    line((cc - size * 0.36, cc - size * 0.52), (cc + size * 0.36, cc - size * 0.52), 6)
    pts = []
    for i in range(0, 21):
        a = math.pi * (0.1 + 0.8 * i / 20)
        pts.append((cc + math.cos(a + math.pi) * size * 0.72, cc + size * 0.28 + math.sin(a) * size * 0.56))
    d.line([(x * s, y * s) for x, y in pts], fill=col8(OUT), width=int(11.5 * s))
    d.line([(x * s, y * s) for x, y in pts], fill=col8(iron), width=int(8 * s))
    for sgn in (-1, 1):
        tip = (cc + sgn * size * 0.74, cc + size * 0.06)
        d.polygon([(tip[0] * s, tip[1] * s), ((tip[0] - sgn * 14) * s, (tip[1] - 16) * s), ((tip[0] - sgn * 4) * s, (tip[1] + 6) * s)],
                  fill=col8(iron), outline=col8(OUT))
    rc = (cc, cc - size * 1.0)
    d.ellipse([(rc[0] - 9) * s, (rc[1] - 9) * s, (rc[0] + 9) * s, (rc[1] + 9) * s], outline=col8(OUT), width=int(7 * s))
    d.ellipse([(rc[0] - 9) * s, (rc[1] - 9) * s, (rc[0] + 9) * s, (rc[1] + 9) * s], outline=col8(iron), width=int(4 * s))
    return c.finish().rotate(rng.uniform(-40, 40), resample=Image.BICUBIC)


def barrel(rng, r=22, wood='#8a5a30'):
    w = int(r * 2.6)
    m = C.mask_patch(w, w, lambda d, s: d.ellipse([(w / 2 - r) * s, (w / 2 - r) * s, (w / 2 + r) * s, (w / 2 + r) * s], fill=255))
    yy, xx = C.patch_grid(m)
    stripes = np.abs(np.sin((xx - w / 2) / r * 5.2)) > 0.1
    var = C.fbm(w, w, 5, rng, 2)
    col = rgb(wood)[None, None, :] * (0.8 + 0.3 * var[..., None]) * np.where(stripes, 1.0, 0.72)[..., None]
    patch = C.shade_patch(m, col, sigma=r * 0.5, outline=OUT, outline_px=1.8, rng=rng, grain=0.04)
    rings = SSCanvas(w, w)
    s = rings.s
    for rr, ww in ((r * 0.98, 3), (r * 0.62, 3)):
        rings.d.ellipse([(w / 2 - rr) * s, (w / 2 - rr) * s, (w / 2 + rr) * s, (w / 2 + rr) * s], outline=col8(rgb('#52606c')), width=int(ww * s))
    return Image.alpha_composite(patch, rings.finish())


def crate(rng, size=40, wood='#9a6c3c'):
    w = int(size * 1.7)
    rot = rng.uniform(-0.5, 0.5)
    pts = [(-size / 2, -size / 2), (size / 2, -size / 2), (size / 2, size / 2), (-size / 2, size / 2)]
    pts = [(w / 2 + x * math.cos(rot) - y * math.sin(rot), w / 2 + x * math.sin(rot) + y * math.cos(rot)) for x, y in pts]
    m = C.mask_patch(w, w, lambda d, s2: d.polygon([(x * s2, y * s2) for x, y in pts], fill=255))
    var = C.fbm(w, w, 4, rng, 2)
    col = rgb(wood)[None, None, :] * (0.8 + 0.3 * var[..., None])
    patch = C.shade_patch(m, col, sigma=size * 0.18, outline=OUT, outline_px=1.8, rng=rng, grain=0.05)
    boards = SSCanvas(w, w)
    s = boards.s
    for a, b in ((0, 2), (1, 3)):
        boards.d.line([(pts[a][0] * s, pts[a][1] * s), (pts[b][0] * s, pts[b][1] * s)], fill=col8(rgb('#4a2f18'), 220), width=int(3 * s))
    boards.d.polygon([(x * s, y * s) for x, y in pts], outline=col8(rgb('#4a2f18')), width=int(2 * s))
    return Image.alpha_composite(patch, boards.finish())


def chest(rng, w0=62):
    w = int(w0 * 1.7)
    h = int(w0 * 1.3)
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    x0, y0 = (w - w0) / 2, (h - w0 * 0.62) / 2
    x1, y1 = x0 + w0, y0 + w0 * 0.62
    d.rounded_rectangle([x0 * s, y0 * s, x1 * s, y1 * s], 5 * s, fill=col8(OUT))
    d.rounded_rectangle([(x0 + 2) * s, (y0 + 2) * s, (x1 - 2) * s, (y1 - 2) * s], 4 * s, fill=col8(rgb('#8c5a2e')))
    d.rounded_rectangle([(x0 + 5) * s, (y0 + 5) * s, (x1 - 5) * s, (y0 + w0 * 0.3) * s], 3 * s, fill=col8(rgb('#f4c430')), outline=col8(OUT))
    for _ in range(26):
        px = rng.uniform(x0 + 8, x1 - 8)
        py = rng.uniform(y0 + 7, y0 + w0 * 0.28)
        r = rng.uniform(2.4, 3.8)
        d.ellipse([(px - r) * s, (py - r) * s, (px + r) * s, (py + r) * s], fill=col8(rgb('#ffd84a')), outline=col8(rgb('#a6760a')), width=int(s))
    d.line([(x0 + 8) * s, (y0 + w0 * 0.4) * s, (x1 - 8) * s, (y0 + w0 * 0.4) * s], fill=col8(rgb('#d9a626')), width=int(4 * s))
    d.rectangle([(w / 2 - 5) * s, (y0 + w0 * 0.33) * s, (w / 2 + 5) * s, (y0 + w0 * 0.5) * s], fill=col8(rgb('#f1c232')), outline=col8(OUT))
    return c.finish().rotate(rng.uniform(-18, 18), resample=Image.BICUBIC)


def coin(rng, r=5):
    w = int(r * 3)
    m = C.mask_patch(w, w, lambda d, s: d.ellipse([(w / 2 - r) * s, (w / 2 - r * 0.8) * s, (w / 2 + r) * s, (w / 2 + r * 0.8) * s], fill=255))
    return C.shade_patch(m, rgb('#f2c230'), sigma=r * 0.4, outline=rgb('#7a5408'), outline_px=1.0, rng=rng, grain=0.0)


def skull_fish(rng, size=40):
    """Balık iskeleti."""
    w = int(size * 2.2)
    c = SSCanvas(w, w)
    d, s = c.d, c.s
    cc = w / 2
    bone = col8(rgb('#ebe6d2'))
    ol = col8(OUT)
    d.line([((cc - size * 0.7) * s, cc * s), ((cc + size * 0.5) * s, cc * s)], fill=ol, width=int(5 * s))
    d.line([((cc - size * 0.7) * s, cc * s), ((cc + size * 0.5) * s, cc * s)], fill=bone, width=int(2.4 * s))
    for i in range(7):
        x = cc - size * 0.55 + i * size * 0.16
        L = size * 0.32 * (1 - abs(i - 3) / 6)
        for sgn in (-1, 1):
            d.line([(x * s, cc * s), ((x + 4) * s, (cc + sgn * L) * s)], fill=ol, width=int(3.4 * s))
            d.line([(x * s, cc * s), ((x + 4) * s, (cc + sgn * L) * s)], fill=bone, width=int(1.4 * s))
    d.ellipse([(cc + size * 0.5) * s, (cc - size * 0.2) * s, (cc + size * 0.95) * s, (cc + size * 0.2) * s], fill=bone, outline=ol, width=int(2 * s))
    d.ellipse([(cc + size * 0.72) * s, (cc - size * 0.08) * s, (cc + size * 0.82) * s, (cc + size * 0.02) * s], fill=ol)
    d.polygon([((cc - size * 0.7) * s, cc * s), ((cc - size * 0.98) * s, (cc - size * 0.22) * s), ((cc - size * 0.98) * s, (cc + size * 0.22) * s)], fill=bone, outline=ol)
    return c.finish().rotate(rng.uniform(0, 360), resample=Image.BICUBIC)
