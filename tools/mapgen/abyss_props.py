"""Derin Çukur nesneleri: kristal, anemon, denizanası, tüp solucan, balina iskeleti.
Parlayan nesneler (yama, parlama_maskesi) çifti döndürür; parlama maskesi PIL 'L' değil float dizidir."""
import math

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import common as C
from common import K, SSCanvas, rgb
from props import OUT, col8


def _glow_arr(img_l):
    return np.asarray(img_l).astype(np.float32) / 255.0


def crystal_cluster(rng, size, main, hi, count=4):
    """Parlayan kristal kümesi; (yama, parlama) döner."""
    w = int(size * 2.6)
    h = int(size * 2.4)
    c = SSCanvas(w, h)
    gl = SSCanvas(w, h)
    d, g, s = c.d, gl.d, c.s
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
        tip, mid, mid_b = P_(0, -L), P_(0, -L * 0.72), P_(0, 0)
        left = [base_l, sh_l, tip, mid, mid_b]
        right = [mid_b, mid, tip, sh_r, base_r]
        for poly, col in ((left, np.asarray(main) * 0.55), (right, np.asarray(main) * 1.0)):
            d.polygon([(x * s, y * s) for x, y in poly], fill=col8(col), outline=col8(OUT))
        d.polygon([(x * s, y * s) for x, y in [sh_l, tip, mid]], fill=col8(np.asarray(hi) * 0.9), outline=col8(OUT))
        d.polygon([(x * s, y * s) for x, y in [mid, tip, sh_r]], fill=col8(np.asarray(hi)), outline=col8(OUT))
        d.line([(x * s, y * s) for x, y in [mid_b, mid]], fill=col8(hi, 120), width=int(s))
        g.polygon([(x * s, y * s) for x, y in [base_l, sh_l, tip, sh_r, base_r]], fill=(255, 255, 255, 255))
    glow = np.asarray(gl.finish()).astype(np.float32)[..., 3] / 255.0
    return c.finish(), glow


def anemone(rng, r, tip, body='#243a52'):
    w = int(r * 2.8)
    c = SSCanvas(w, w)
    gl = SSCanvas(w, w)
    d, g, s = c.d, gl.d, c.s
    cc = w / 2
    n = 34
    for i in range(n):
        a = i * 2 * math.pi / n + rng.uniform(-0.08, 0.08)
        L = r * rng.uniform(0.85, 1.15)
        curl = rng.uniform(-0.25, 0.25)
        pts = [(cc + math.cos(a + curl * t) * (r * 0.3 + (L - r * 0.3) * t), cc + math.sin(a + curl * t) * (r * 0.3 + (L - r * 0.3) * t)) for t in np.linspace(0, 1, 8)]
        d.line([(x * s, y * s) for x, y in pts], fill=col8(OUT), width=int(5.0 * s))
        d.line([(x * s, y * s) for x, y in pts], fill=col8(np.asarray(rgb(body)) * 1.4), width=int(2.6 * s))
        ex, ey = pts[-1]
        d.ellipse([(ex - 3.6) * s, (ey - 3.6) * s, (ex + 3.6) * s, (ey + 3.6) * s], fill=col8(tip), outline=col8(OUT))
        g.ellipse([(ex - 4) * s, (ey - 4) * s, (ex + 4) * s, (ey + 4) * s], fill=(255, 255, 255, 255))
    d.ellipse([(cc - r * 0.34) * s, (cc - r * 0.34) * s, (cc + r * 0.34) * s, (cc + r * 0.34) * s], fill=col8(rgb('#162234')), outline=col8(OUT), width=int(2 * s))
    d.ellipse([(cc - r * 0.16) * s, (cc - r * 0.16) * s, (cc + r * 0.16) * s, (cc + r * 0.16) * s], fill=col8(np.asarray(tip) * 0.9))
    g.ellipse([(cc - r * 0.16) * s, (cc - r * 0.16) * s, (cc + r * 0.16) * s, (cc + r * 0.16) * s], fill=(255, 255, 255, 255))
    glow = np.asarray(gl.finish()).astype(np.float32)[..., 3] / 255.0
    return c.finish(), glow


def jelly(rng, r, c1, c2):
    """Büyük, yarı saydam derin deniz denizanası."""
    w = int(r * 3.0)
    h = int(r * 4.6)
    c = SSCanvas(w, h)
    gl = SSCanvas(w, h)
    d, g, s = c.d, gl.d, c.s
    cx, top = w / 2, r * 0.45
    for i in range(9):
        x0 = cx + (i - 4) * r * 0.2
        pts = [(x0 + math.sin(t * 6 + i) * r * 0.1 * t * 3, top + r * 0.6 + t * r * 3.3) for t in np.linspace(0, 1, 22)]
        d.line([(x * s, y * s) for x, y in pts], fill=col8(c2, 120), width=int(2.4 * s))
        g.line([(x * s, y * s) for x, y in pts], fill=(255, 255, 255, 120), width=int(2.4 * s))
    tent = c.finish()
    bm = C.mask_patch(w, h, lambda dd, ss: (dd.pieslice([(cx - r) * ss, top * ss, (cx + r) * ss, (top + r * 1.45) * ss], 180, 360, fill=255),
                                              dd.ellipse([(cx - r) * ss, (top + r * 0.52) * ss, (cx + r) * ss, (top + r * 0.9) * ss], fill=255)))
    ph, pw = bm.shape
    yy = np.linspace(0, 1, ph)[:, None]
    col = np.asarray(c1)[None, None, :] * (1 - yy[..., None]) + np.asarray(c2)[None, None, :] * yy[..., None]
    col = np.broadcast_to(col, (ph, pw, 3))
    ring = (np.sin(np.arange(ph)[:, None] * (0.35 / K)) * 0.5 + 0.5) * 0.25
    alpha = bm * (0.42 + ring)
    edge = np.clip(bm - ndi.gaussian_filter(bm, 3 * K), 0, 1)
    rgba = np.dstack([np.clip(col + edge[..., None] * 0.5, 0, 1), np.clip(alpha + edge * 0.6, 0, 1)])
    bell_img = Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA')
    out = Image.alpha_composite(tent, bell_img)
    glow = np.maximum(np.asarray(gl.finish()).astype(np.float32)[..., 3] / 255.0, bm * 0.8)
    return out, glow


def tube_worms(rng, count, h, col_tip):
    w = int(count * 14 + 30)
    H_ = int(h * 1.5)
    c = SSCanvas(w, H_)
    gl = SSCanvas(w, H_)
    d, g, s = c.d, gl.d, c.s
    for i in range(count):
        x = 15 + i * 14 + rng.uniform(-3, 3)
        L = h * rng.uniform(0.55, 1.0)
        bend = rng.uniform(-6, 6)
        pts = [(x + bend * math.sin(t * 2.2), H_ - 10 - L * t) for t in np.linspace(0, 1, 12)]
        d.line([(px * s, py * s) for px, py in pts], fill=col8(OUT), width=int(8 * s))
        d.line([(px * s, py * s) for px, py in pts], fill=col8(rgb('#d8d2c4')), width=int(5 * s))
        tx, ty = pts[-1]
        d.ellipse([(tx - 5) * s, (ty - 7) * s, (tx + 5) * s, (ty + 5) * s], fill=col8(col_tip), outline=col8(OUT), width=int(s))
        g.ellipse([(tx - 6) * s, (ty - 8) * s, (tx + 6) * s, (ty + 6) * s], fill=(255, 255, 255, 255))
    glow = np.asarray(gl.finish()).astype(np.float32)[..., 3] / 255.0
    return c.finish(), glow


def whale_bones(rng, length=420):
    """Dev iskelet: omurga ve kaburga kemikleri (yukarıdan)."""
    w = int(length + 140)
    h = int(length * 0.62)
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    bone = rgb('#a9b6b8')
    cc = h / 2
    x0 = 30
    pts = [(x0 + i * length / 40, cc + math.sin(i * 0.22) * 6) for i in range(41)]
    d.line([(x * s, y * s) for x, y in pts], fill=col8(OUT), width=int(15 * s))
    for i, (x, y) in enumerate(pts):
        r = 9 - i * 0.12
        d.ellipse([(x - r) * s, (y - r) * s, (x + r) * s, (y + r) * s], fill=col8(bone), outline=col8(OUT), width=int(2 * s))
    for i in range(6, 28, 2):
        x, y = pts[i]
        L = (h * 0.46) * math.sin(math.pi * (i - 4) / 26) ** 0.7
        for sgn in (-1, 1):
            arc = [(x + 0.3 * k * 10 + math.sin(k / 6 * 1.4) * 14, y + sgn * (k / 6) * L) for k in range(7)]
            d.line([(px * s, py * s) for px, py in arc], fill=col8(OUT), width=int(11 * s))
            d.line([(px * s, py * s) for px, py in arc], fill=col8(bone), width=int(6.5 * s))
            d.line([(px * s - s, py * s - s) for px, py in arc], fill=col8(np.asarray(bone) * 1.2, 160), width=int(2 * s))
    sx, sy = pts[40]
    d.ellipse([(sx - 6) * s, (sy - 36) * s, (sx + 92) * s, (sy + 36) * s], fill=col8(bone), outline=col8(OUT), width=int(2.4 * s))
    d.polygon([((sx + 60) * s, (sy - 4) * s), ((sx + 110) * s, sy * s), ((sx + 60) * s, (sy + 22) * s)], fill=col8(bone), outline=col8(OUT))
    d.ellipse([(sx + 34) * s, (sy - 20) * s, (sx + 50) * s, (sy - 6) * s], fill=col8(OUT))
    d.line([((sx + 40) * s, (sy + 14) * s), ((sx + 105) * s, (sy + 6) * s)], fill=col8(OUT), width=int(2 * s))
    return c.finish()
