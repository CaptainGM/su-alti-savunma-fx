"""Volkanik Bacalar nesneleri: bazalt sütunlar, bacalar, duman, krater."""
import math

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import common as C
from common import K, SSCanvas, rgb
from props import OUT, col8

LAVA = rgb('#ff6a1f')
LAVA_HI = rgb('#ffd24a')
BASALT_OUT = np.array([0.04, 0.02, 0.03], np.float32)


def hex_cluster(rng, n, r):
    """Yukarıdan görünen altıgen bazalt sütun kümesi; (yama, parlama) döner."""
    w = int(r * 2 * 4.2)
    h = int(r * 2 * 3.8)
    c = SSCanvas(w, h)
    d, s = c.d, c.s
    gl = SSCanvas(w, h)
    cx, cy = w / 2, h / 2
    cells = []
    # altıgen ızgara üzerinden komşu seç
    coords = [(0, 0)]
    dirs = [(1, 0), (0.5, 0.866), (-0.5, 0.866), (-1, 0), (-0.5, -0.866), (0.5, -0.866)]
    while len(coords) < n:
        base = coords[int(rng.integers(0, len(coords)))]
        dx, dy = dirs[int(rng.integers(0, 6))]
        cand = (round(base[0] + dx, 3), round(base[1] + dy, 3))
        if cand not in coords:
            coords.append(cand)
    coords.sort(key=lambda p: p[1])
    for gx, gy in coords:
        x, y = cx + gx * r * 1.78, cy + gy * r * 1.78
        hh = r * rng.uniform(0.9, 1.0)
        pts = [(x + math.cos(math.radians(60 * i + 30)) * hh, y + math.sin(math.radians(60 * i + 30)) * hh) for i in range(6)]
        lit = rng.uniform(0.85, 1.15)
        side_pts = [(px, py + r * 0.28) for px, py in pts]
        d.polygon([(px * s, py * s) for px, py in side_pts], fill=col8(rgb('#1b1517') * lit), outline=col8(BASALT_OUT))
        d.polygon([(px * s, py * s) for px, py in pts], fill=col8(rgb('#4a3f44') * lit), outline=col8(BASALT_OUT))
        # üst yüzey parlaması
        inner = [(x + (px - x) * 0.55 - r * 0.1, y + (py - y) * 0.55 - r * 0.1) for px, py in pts]
        d.polygon([(px * s, py * s) for px, py in inner], fill=col8(rgb('#645860') * lit, 160))
        if rng.random() < 0.35:
            gl.d.polygon([(px * s, py * s) for px, py in pts], fill=(255, 255, 255, 90))
            d.line([(pts[0][0] * s, pts[0][1] * s), (pts[3][0] * s, pts[3][1] * s)], fill=col8(LAVA, 200), width=max(1, int(1.6 * s)))
    glow = np.asarray(gl.finish()).astype(np.float32)[..., 3] / 255.0
    return c.finish(), glow


def vent(rng, r=16):
    """Isıtıcı baca: koyu halka ve parlak merkez; (yama, parlama)."""
    w = int(r * 4)
    m = C.mask_patch(w, w, lambda d, s: d.ellipse([(w / 2 - r) * s, (w / 2 - r) * s, (w / 2 + r) * s, (w / 2 + r) * s], fill=255))
    col = rgb('#3d3237')[None, None, :] * (0.8 + 0.4 * C.fbm(w, w, 4, rng, 2)[..., None])
    patch = C.shade_patch(m, col, sigma=r * 0.5, outline=BASALT_OUT, outline_px=1.6, rng=rng, grain=0.05, rim=0.3)
    yy, xx = C.patch_grid(m)
    dist = np.sqrt((xx - w / 2) ** 2 + (yy - w / 2) ** 2)
    core = np.clip(1 - dist / (r * 0.62), 0, 1)
    arr = np.asarray(patch).astype(np.float32) / 255.0
    hot = LAVA_HI[None, None, :] * core[..., None] + LAVA[None, None, :] * np.clip(1 - dist / (r * 0.85), 0, 1)[..., None] * (1 - core[..., None])
    mix = np.clip(core * 1.5, 0, 1)[..., None] * (m[..., None] > 0.5)
    arr[..., :3] = arr[..., :3] * (1 - mix) + hot * mix
    glow = np.clip(1 - dist / (r * 0.9), 0, 1) * m
    return Image.fromarray((arr * 255).astype(np.uint8), 'RGBA'), glow


def smoke(rng, size=60):
    """Yumuşak gri duman bulutu (yarı saydam RGBA)."""
    w = int(size * 2.2)
    h = int(size * 3.0)
    ph, pw = int(h * K), int(w * K)
    yy, xx = C.patch_grid(np.zeros((ph, pw)))
    a = np.zeros((ph, pw), np.float32)
    for i in range(9):
        t = i / 8
        cx = w / 2 + math.sin(t * 3 + rng.uniform(0, 2)) * size * 0.25
        cy = h * (0.85 - 0.75 * t)
        rr = size * (0.28 + 0.34 * t)
        a += np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (rr * rr))) * (0.55 - 0.3 * t)
    a = np.clip(ndi.gaussian_filter(a, 2 * K) * 0.7, 0, 0.62)
    # kenarlarda yumuşakça sön: yama sınırında kare iz kalmasın
    fx = np.minimum(xx, w - xx) / (w * 0.22)
    fy = np.minimum(yy, h - yy) / (h * 0.22)
    a = a * np.clip(np.minimum(fx, fy), 0, 1) ** 1.5
    n = C.fbm(h, w, 8, rng, 3)
    a = a * (0.75 + 0.5 * n)
    col = rgb('#6c6468')[None, None, :] * (0.85 + 0.3 * n[..., None])
    rgba = np.dstack([np.broadcast_to(col, (ph, pw, 3)), np.clip(a, 0, 0.7)])
    return Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA')


def crater_cone(rng, r):
    """Büyük volkan konisi (üstten): halkalı yamaç ve parlayan krater; (yama, parlama)."""
    w = h = int(r * 2.6)
    m = C.mask_patch(w, h, lambda d, s: d.ellipse([(w / 2 - r) * s, (h / 2 - r) * s, (w / 2 + r) * s, (h / 2 + r) * s], fill=255))
    yy, xx = C.patch_grid(m)
    dist = np.sqrt((xx - w / 2) ** 2 + (yy - h / 2) ** 2)
    ridge = np.sin(dist / r * 14 + C.fbm(h, w, 20, rng, 3) * 4) * 0.5 + 0.5
    var = C.fbm(h, w, 9, rng, 4)
    slope = np.clip(dist / r, 0, 1)
    col = rgb('#4a3430')[None, None, :] * (0.65 + 0.5 * var[..., None]) * (0.8 + 0.4 * ridge[..., None]) * (1.15 - 0.55 * (1 - slope)[..., None])
    # çatlaklardan akan lav
    cr = C.ridged(h, w, 10, rng, 3)
    lava_lines = (cr ** 2.4) * np.clip((dist / r - 0.28) * 2, 0, 1) * (dist < r)
    col = col + LAVA[None, None, :] * lava_lines[..., None] * 1.1
    patch = C.shade_patch(m, col, sigma=r * 0.5, outline=BASALT_OUT, outline_px=2.2, rng=rng, grain=0.04, rim=0.3)
    arr = np.asarray(patch).astype(np.float32) / 255.0
    crater_r = r * 0.34
    pit = np.clip(1 - dist / crater_r, 0, 1)
    ring = np.exp(-((dist - crater_r) / (r * 0.05)) ** 2)
    hot = LAVA_HI[None, None, :] * np.clip(pit * 1.4, 0, 1)[..., None] + LAVA[None, None, :] * np.clip(pit * 3, 0, 1)[..., None] * (1 - np.clip(pit * 1.4, 0, 1)[..., None])
    mix = np.clip(pit * 3, 0, 1)[..., None]
    arr[..., :3] = arr[..., :3] * (1 - mix) + hot * mix
    arr[..., :3] = np.clip(arr[..., :3] + (ring[..., None] * np.array([0.5, 0.2, 0.05], np.float32)), 0, 1)
    glow = np.clip(1 - dist / (r * 0.55), 0, 1) * m + lava_lines * 0.6
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), 'RGBA'), np.clip(glow, 0, 1)


def basalt_rock(rng, r):
    w = int(r * 2.5) + 10
    h = int(r * 2.0) + 10
    pts = C.blob_points(rng, w / 2, h / 2, r, r * 0.78, n=8, jitter=0.2, rot=rng.uniform(-0.4, 0.4))
    m = C.mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    var = C.fbm(h, w, r * 0.35, rng, 3)
    col = rgb('#3a2f33')[None, None, :] * (0.7 + 0.6 * var[..., None])
    glow = np.clip(var - 0.62, 0, 1) * 3.0
    col = col + LAVA[None, None, :] * (np.clip(glow, 0, 1) * 0.5)[..., None] * (m[..., None] > 0.5)
    return C.shade_patch(m, col, sigma=r * 0.5, outline=BASALT_OUT, outline_px=1.8, rng=rng, grain=0.05,
                         hi=np.array([1.0, 0.8, 0.7]), lo=np.array([0.0, 0, 0.02]), rim=0.3)
