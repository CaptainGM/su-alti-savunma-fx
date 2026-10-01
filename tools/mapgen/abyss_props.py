"""Derin Çukur nesneleri: kristal, anemon, denizanası, tüp solucan, balina iskeleti."""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import common as C
from common import SS, rgb
from props import OUT


def _c(col, a=255):
    return tuple(int(min(1, max(0, v)) * 255) for v in col) + (a,)


def crystal_cluster(rng, size, main, hi, count=4):
    """Parlayan kristal kümesi; (yama, parlama_maskesi) döner."""
    w = int(size * 2.6)
    h = int(size * 2.4)
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    glow = Image.new('L', (w * SS, h * SS), 0)
    d = ImageDraw.Draw(img)
    g = ImageDraw.Draw(glow)
    items = []
    for i in range(count):
        ang = (i - (count - 1) / 2) * 0.32 + rng.uniform(-0.1, 0.1)
        items.append((ang, size * rng.uniform(0.7, 1.15), size * rng.uniform(0.17, 0.26)))
    items.sort(key=lambda it: -abs(it[0]))
    for ang, L, wd in items:
        bx, by = w / 2 + math.sin(ang) * size * 0.3, h * 0.88
        ca, sa = math.cos(ang), math.sin(ang)

        def P_(px, py):
            return (bx + px * ca - py * sa, by + px * sa + py * ca)
        base_l, base_r = P_(-wd, 0), P_(wd, 0)
        sh_l, sh_r = P_(-wd, -L * 0.72), P_(wd, -L * 0.72)
        tip = P_(0, -L)
        mid = P_(0, -L * 0.72)
        mid_b = P_(0, 0)
        left = [base_l, sh_l, tip, mid, mid_b]
        right = [mid_b, mid, tip, sh_r, base_r]
        for poly, col in ((left, np.asarray(main) * 0.55), (right, np.asarray(main) * 1.0)):
            d.polygon([(x * SS, y * SS) for x, y in poly], fill=_c(col), outline=_c(OUT))
        d.polygon([(x * SS, y * SS) for x, y in [sh_l, tip, mid]], fill=_c(np.asarray(hi) * 0.9), outline=_c(OUT))
        d.polygon([(x * SS, y * SS) for x, y in [mid, tip, sh_r]], fill=_c(np.asarray(hi)), outline=_c(OUT))
        d.line([(x * SS, y * SS) for x, y in [mid_b, mid]], fill=_c(hi, 120), width=SS)
        g.polygon([(x * SS, y * SS) for x, y in [base_l, sh_l, tip, sh_r, base_r]], fill=255)
    return img.resize((w, h), Image.LANCZOS), glow.resize((w, h), Image.LANCZOS)


def anemone(rng, r, tip, body='#243a52'):
    w = int(r * 2.8)
    img = Image.new('RGBA', (w * SS, w * SS), (0, 0, 0, 0))
    glow = Image.new('L', (w * SS, w * SS), 0)
    d = ImageDraw.Draw(img)
    g = ImageDraw.Draw(glow)
    c = w / 2
    n = 34
    for i in range(n):
        a = i * 2 * math.pi / n + rng.uniform(-0.08, 0.08)
        L = r * rng.uniform(0.85, 1.15)
        curl = rng.uniform(-0.25, 0.25)
        pts = [(c + math.cos(a + curl * t) * (r * 0.3 + (L - r * 0.3) * t), c + math.sin(a + curl * t) * (r * 0.3 + (L - r * 0.3) * t)) for t in np.linspace(0, 1, 8)]
        d.line([(x * SS, y * SS) for x, y in pts], fill=_c(OUT), width=int(5.0 * SS))
        d.line([(x * SS, y * SS) for x, y in pts], fill=_c(np.asarray(rgb(body)) * 1.4), width=int(2.6 * SS))
        ex, ey = pts[-1]
        d.ellipse([(ex - 3.6) * SS, (ey - 3.6) * SS, (ex + 3.6) * SS, (ey + 3.6) * SS], fill=_c(tip), outline=_c(OUT))
        g.ellipse([(ex - 4) * SS, (ey - 4) * SS, (ex + 4) * SS, (ey + 4) * SS], fill=255)
    d.ellipse([(c - r * 0.34) * SS, (c - r * 0.34) * SS, (c + r * 0.34) * SS, (c + r * 0.34) * SS], fill=_c(rgb('#162234')), outline=_c(OUT), width=int(2 * SS))
    d.ellipse([(c - r * 0.16) * SS, (c - r * 0.16) * SS, (c + r * 0.16) * SS, (c + r * 0.16) * SS], fill=_c(np.asarray(tip) * 0.9))
    g.ellipse([(c - r * 0.16) * SS, (c - r * 0.16) * SS, (c + r * 0.16) * SS, (c + r * 0.16) * SS], fill=255)
    return img.resize((w, w), Image.LANCZOS), glow.resize((w, w), Image.LANCZOS)


def jelly(rng, r, c1, c2):
    """Büyük, yarı saydam derin deniz denizanası."""
    w = int(r * 3.0)
    h = int(r * 4.6)
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    glow = Image.new('L', (w * SS, h * SS), 0)
    d = ImageDraw.Draw(img)
    g = ImageDraw.Draw(glow)
    cx, top = w / 2, r * 0.45
    for i in range(9):
        x0 = cx + (i - 4) * r * 0.2
        pts = [(x0 + math.sin(t * 6 + i) * r * 0.1 * t * 3, top + r * 0.6 + t * r * 3.3) for t in np.linspace(0, 1, 22)]
        d.line([(x * SS, y * SS) for x, y in pts], fill=_c(c2, 120), width=int(2.4 * SS))
        g.line([(x * SS, y * SS) for x, y in pts], fill=120, width=int(2.4 * SS))
    # çan
    bell = Image.new('L', (w * SS, h * SS), 0)
    bd = ImageDraw.Draw(bell)
    bd.pieslice([(cx - r) * SS, top * SS, (cx + r) * SS, (top + r * 1.45) * SS], 180, 360, fill=255)
    bd.ellipse([(cx - r) * SS, (top + r * 0.52) * SS, (cx + r) * SS, (top + r * 0.9) * SS], fill=255)
    bell = bell.resize((w, h), Image.LANCZOS)
    bm = np.asarray(bell).astype(np.float32) / 255.0
    yy = np.linspace(0, 1, h)[:, None]
    col = np.asarray(c1)[None, None, :] * (1 - yy[..., None]) + np.asarray(c2)[None, None, :] * yy[..., None]
    col = np.broadcast_to(col, (h, w, 3))
    ring = (np.sin(np.arange(w)[None, :] * 0.0 + np.arange(h)[:, None] * 0.35) * 0.5 + 0.5) * 0.25
    alpha = bm * (0.42 + ring)
    edge = np.clip(bm - ndi.gaussian_filter(bm, 3), 0, 1)
    rgba = np.dstack([np.clip(col + edge[..., None] * 0.5, 0, 1), np.clip(alpha + edge * 0.6, 0, 1)])
    bell_img = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')
    out = Image.alpha_composite(img.resize((w, h), Image.LANCZOS), bell_img)
    gl = np.maximum(np.asarray(glow.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0, bm * 0.8)
    return out, gl


def tube_worms(rng, count, h, col_tip):
    w = int(count * 14 + 30)
    H_ = int(h * 1.5)
    img = Image.new('RGBA', (w * SS, H_ * SS), (0, 0, 0, 0))
    glow = Image.new('L', (w * SS, H_ * SS), 0)
    d = ImageDraw.Draw(img)
    g = ImageDraw.Draw(glow)
    for i in range(count):
        x = 15 + i * 14 + rng.uniform(-3, 3)
        L = h * rng.uniform(0.55, 1.0)
        ytop = H_ - 10 - L
        bend = rng.uniform(-6, 6)
        pts = [(x + bend * math.sin(t * 2.2), H_ - 10 - L * t) for t in np.linspace(0, 1, 12)]
        d.line([(px * SS, py * SS) for px, py in pts], fill=_c(OUT), width=int(8 * SS))
        d.line([(px * SS, py * SS) for px, py in pts], fill=_c(rgb('#d8d2c4')), width=int(5 * SS))
        tx, ty = pts[-1]
        d.ellipse([(tx - 5) * SS, (ty - 7) * SS, (tx + 5) * SS, (ty + 5) * SS], fill=_c(col_tip), outline=_c(OUT), width=SS)
        g.ellipse([(tx - 6) * SS, (ty - 8) * SS, (tx + 6) * SS, (ty + 6) * SS], fill=255)
    return img.resize((w, H_), Image.LANCZOS), glow.resize((w, H_), Image.LANCZOS)


def whale_bones(rng, length=420):
    """Dev iskelet: omurga ve kaburga kemikleri (yukarıdan)."""
    w = int(length + 140)
    h = int(length * 0.62)
    img = Image.new('RGBA', (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bone = rgb('#a9b6b8')
    c = h / 2
    x0 = 30
    pts = [(x0 + i * length / 40, c + math.sin(i * 0.22) * 6) for i in range(41)]
    d.line([(x * SS, y * SS) for x, y in pts], fill=_c(OUT), width=int(15 * SS))
    for i, (x, y) in enumerate(pts):
        r = 9 - i * 0.12
        d.ellipse([(x - r) * SS, (y - r) * SS, (x + r) * SS, (y + r) * SS], fill=_c(bone), outline=_c(OUT), width=int(2 * SS))
    for i in range(6, 28, 2):
        x, y = pts[i]
        L = (h * 0.46) * math.sin(math.pi * (i - 4) / 26) ** 0.7
        for sgn in (-1, 1):
            arc = [(x + 0.3 * k * 10 + math.sin(k / 6 * 1.4) * 14, y + sgn * (k / 6) * L) for k in range(7)]
            d.line([(px * SS, py * SS) for px, py in arc], fill=_c(OUT), width=int(11 * SS))
            d.line([(px * SS, py * SS) for px, py in arc], fill=_c(bone), width=int(6.5 * SS))
            d.line([(px * SS - SS, py * SS - SS) for px, py in arc], fill=_c(np.asarray(bone) * 1.2, 160), width=int(2 * SS))
    # kafatası: yuvarlak, çene çizgili
    sx, sy = pts[40]
    d.ellipse([(sx - 6) * SS, (sy - 36) * SS, (sx + 92) * SS, (sy + 36) * SS], fill=_c(bone), outline=_c(OUT), width=int(2.4 * SS))
    d.polygon([((sx + 60) * SS, (sy - 4) * SS), ((sx + 110) * SS, sy * SS), ((sx + 60) * SS, (sy + 22) * SS)], fill=_c(bone), outline=_c(OUT))
    d.ellipse([(sx + 34) * SS, (sy - 20) * SS, (sx + 50) * SS, (sy - 6) * SS], fill=_c(OUT))
    d.line([((sx + 40) * SS, (sy + 14) * SS), ((sx + 105) * SS, (sy + 6) * SS)], fill=_c(OUT), width=int(2 * SS))
    return img.resize((w, h), Image.LANCZOS)
