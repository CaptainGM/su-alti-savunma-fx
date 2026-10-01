"""Atlantis Harabeleri nesneleri: sütun, devrik sütun, taş baş, tapınak tabanı, üç dişli mızrak."""
import math

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import common as C
from common import K, SSCanvas, rgb
from props import OUT, col8

MARBLE = rgb('#e9e3d2')
MARBLE_D = rgb('#a9a08a')
GOLD = rgb('#e2b13c')
GOLD_D = rgb('#9a6f16')
MOSS = rgb('#4f9a6a')


def _marble(m, rng, base=MARBLE, dark=MARBLE_D, moss=0.0, sigma=8):
    ph, pw = m.shape
    h, w = ph / K, pw / K
    var = C.fbm(h, w, 6, rng, 3)
    vein = np.clip((C.ridged(h, w, 12, rng, 2) - 0.55) * 2.5, 0, 1) * 0.25
    col = base[None, None, :] * (0.9 + 0.2 * var[..., None]) * (1 - vein[..., None]) + dark[None, None, :] * vein[..., None]
    if moss:
        gate = np.clip((var - 0.55) * 3.5, 0, 1) * moss
        col = col * (1 - gate[..., None]) + MOSS[None, None, :] * gate[..., None]
    return col


def column(rng, r=17, broken=False):
    """Dikili sütun (yukarıdan): kare üst plaka ve yuvarlak gövde."""
    w = h = int(r * 3.4)
    cx = w / 2
    if not broken:
        sq = r * 1.35
        pts = [(cx - sq, cx - sq), (cx + sq, cx - sq), (cx + sq, cx + sq), (cx - sq, cx + sq)]
        m = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
        base = C.shade_patch(m, _marble(m, rng, moss=0.25), light=(-0.5, -0.8), sigma=4, outline=OUT, outline_px=1.6, rng=rng, grain=0.03, rim=0.25)
        rm = C.mask_patch(w, h, lambda d, s: d.ellipse([(cx - r) * s, (cx - r) * s, (cx + r) * s, (cx + r) * s], fill=255))
        ring = C.shade_patch(rm, _marble(rm, rng, base=MARBLE * 1.04, moss=0.0), sigma=r * 0.55, outline=OUT, outline_px=1.4, rng=rng, grain=0.02, rim=0.2)
        return Image.alpha_composite(base, ring)
    # kırık: düzensiz kesit
    pts = C.blob_points(rng, cx, cx, r * 1.05, r * 0.95, n=9, jitter=0.2)
    m = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    patch = C.shade_patch(m, _marble(m, rng, moss=0.3), sigma=r * 0.5, outline=OUT, outline_px=1.6, rng=rng, grain=0.04, rim=0.3)
    inner = C.mask_patch(w, h, lambda d, s: d.ellipse([(cx - r * 0.55) * s, (cx - r * 0.55) * s, (cx + r * 0.55) * s, (cx + r * 0.55) * s], fill=255))
    ring = C.shade_patch(inner, _marble(inner, rng, base=MARBLE_D), sigma=r * 0.3, outline=OUT, outline_px=1.0, rng=rng)
    return Image.alpha_composite(patch, ring)


def fallen_column(rng, length=120, r=15):
    """Yatan kırık sütun gövdesi (yatay çizilir, sonra döndürülür)."""
    w = int(length + 40)
    h = int(r * 3.2)
    cy = h / 2
    pts = [(20, cy - r), (20 + length, cy - r * 0.95), (20 + length + rng.uniform(-6, 6), cy), (20 + length, cy + r * 0.95), (20, cy + r)]
    m = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    ph, pw = m.shape
    yy, xx = C.patch_grid(m)
    flute = np.abs(np.sin((yy - cy) / r * 7.5)) * 0.18
    col = _marble(m, rng, moss=0.3) * (1 - flute[..., None])
    patch = C.shade_patch(m, col, light=(-0.2, -1.0), sigma=r * 0.7, outline=OUT, outline_px=1.6, rng=rng, grain=0.03, rim=0.25)
    cap = C.mask_patch(w, h, lambda d, s: d.ellipse([(20 - r * 0.35) * s, (cy - r) * s, (20 + r * 0.35) * s, (cy + r) * s], fill=255))
    cp = C.shade_patch(cap, _marble(cap, rng, base=MARBLE_D), sigma=3, outline=OUT, outline_px=1.2, rng=rng)
    return Image.alpha_composite(patch, cp).rotate(rng.uniform(0, 360), resample=Image.BICUBIC, expand=True)


def stone_head(rng, r=38):
    """Yosunlu dev taş baş (yukarıdan, yüzü yukarı)."""
    w = h = int(r * 2.8)
    cx = w / 2
    m = C.mask_patch(w, h, lambda d, s: d.ellipse([(cx - r) * s, (cx - r * 1.12) * s, (cx + r) * s, (cx + r * 1.12) * s], fill=255))
    col = _marble(m, rng, base=rgb('#bfc9bd'), dark=rgb('#6f7e70'), moss=0.55)
    patch = C.shade_patch(m, col, sigma=r * 0.55, outline=OUT, outline_px=2.0, rng=rng, grain=0.04, rim=0.3)
    f = SSCanvas(w, h)
    d, s = f.d, f.s
    dk = col8(rgb('#2c3a35'))
    for sx in (-1, 1):
        ex = cx + sx * r * 0.38
        d.polygon([((ex - r * 0.24) * s, (cx - r * 0.2) * s), ((ex + r * 0.24) * s, (cx - r * 0.2) * s), ((ex + r * 0.12) * s, (cx - r * 0.02) * s), ((ex - r * 0.12) * s, (cx - r * 0.02) * s)], fill=dk)
        d.line([((ex - r * 0.3) * s, (cx - r * 0.34) * s), ((ex + r * 0.26) * s, (cx - r * 0.3 + sx * 0.0) * s)], fill=dk, width=int(2.6 * s))
    d.polygon([((cx - r * 0.1) * s, (cx - r * 0.1) * s), ((cx + r * 0.1) * s, (cx - r * 0.1) * s), ((cx + r * 0.16) * s, (cx + r * 0.3) * s), ((cx - r * 0.16) * s, (cx + r * 0.3) * s)],
              fill=col8(rgb('#9fae9f'), 200), outline=dk)
    d.line([((cx - r * 0.3) * s, (cx + r * 0.58) * s), ((cx + r * 0.3) * s, (cx + r * 0.58) * s)], fill=dk, width=int(3 * s))
    # sakal çizgileri
    for i in range(-3, 4):
        d.line([((cx + i * r * 0.12) * s, (cx + r * 0.7) * s), ((cx + i * r * 0.16) * s, (cx + r * 1.08) * s)], fill=col8(rgb('#4a5a4f'), 180), width=int(1.6 * s))
    return Image.alpha_composite(patch, f.finish())


def temple_base(rng, size=150):
    """Basamaklı tapınak tabanı; köşelerinde sütunlar."""
    w = h = int(size * 1.5)
    cx = w / 2
    out = Image.new('RGBA', (int(w * K), int(h * K)), (0, 0, 0, 0))
    for i, k in enumerate((1.0, 0.82, 0.64)):
        half = size * 0.5 * k
        pts = [(cx - half, cx - half), (cx + half, cx - half), (cx + half, cx + half), (cx - half, cx + half)]
        m = C.mask_patch(w, h, lambda d, s, pts=pts: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
        # kırık köşeler
        m = np.clip(m - ndi.gaussian_filter((C.fbm(h, w, 10, rng, 2) > 0.7).astype(np.float32), 1.2 * K) * 0.9, 0, 1)
        base = _marble(m, rng, base=MARBLE * (1.0 - 0.06 * i), moss=0.35)
        patch = C.shade_patch(m, base, sigma=5, outline=OUT, outline_px=1.8, rng=rng, grain=0.03, rim=0.3)
        out = Image.alpha_composite(out, patch)
    half = size * 0.5 * 0.82
    for sx in (-1, 1):
        for sy in (-1, 1):
            if rng.random() < 0.75:
                col = column(rng, 11, broken=rng.random() < 0.45)
                px = int((cx + sx * half * 0.78) * K - col.size[0] / 2)
                py = int((cx + sy * half * 0.78) * K - col.size[1] / 2)
                out.alpha_composite(col, (px, py))
    return out


def trident(rng, size=60):
    w = int(size * 1.4)
    c = SSCanvas(w, w)
    d, s = c.d, c.s
    cc = w / 2
    gold = col8(GOLD)
    ol = col8(OUT)
    d.line([(cc * s, (cc - size * 0.45) * s), (cc * s, (cc + size * 0.55) * s)], fill=ol, width=int(7 * s))
    d.line([(cc * s, (cc - size * 0.45) * s), (cc * s, (cc + size * 0.55) * s)], fill=gold, width=int(4 * s))
    arc = [(cc + math.cos(a) * size * 0.34, cc - size * 0.18 + math.sin(a) * size * 0.24) for a in np.linspace(math.pi * 0.05, math.pi * 0.95, 14)]
    d.line([(x * s, y * s) for x, y in arc], fill=ol, width=int(7 * s))
    d.line([(x * s, y * s) for x, y in arc], fill=gold, width=int(4 * s))
    for dx in (-size * 0.34, 0, size * 0.34):
        d.polygon([((cc + dx - 5) * s, (cc - size * 0.18) * s), ((cc + dx + 5) * s, (cc - size * 0.18) * s), ((cc + dx) * s, (cc - size * 0.62) * s)], fill=gold, outline=ol)
    return c.finish().rotate(rng.uniform(0, 360), resample=Image.BICUBIC)
