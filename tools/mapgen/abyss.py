"""Derin Çukur: karanlık su, bazalt yol, biyolüminesan canlılar, ortada kaya adası."""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import abyss_props as AP
import common as C
import pipeline as PL
import props as P
import specs as S
from common import H, K, PH, PW, W, X, rgb, smoothstep

SPOTS = [(X(x), y, k) for x, y, k in [
    (390, 450, 'normal'), (390, 590, 'normal'), (730, 450, 'normal'), (730, 590, 'normal'), (560, 330, 'normal'),
    (560, 640, 'normal'), (254, 215, 'normal'), (770, 215, 'normal'), (125, 500, 'high'), (1000, 500, 'high'),
    (400, 820, 'normal'), (730, 820, 'normal'),
]]
ISLAND = (X(560), 490, X(175), 195)  # cx, cy, rx, ry

CYAN = rgb('#35f0ff')
MAGENTA = rgb('#ff4fd8')
LIME = rgb('#a8ff6a')


def glow_stamp(sc, patch, glow, x, y, color, strength=0.9, radius=14):
    """Parlayan nesne: önce ışıma, sonra nesne. radius mantıksal birim."""
    pad = 80 * K
    g = np.pad(glow, pad)
    h, w = g.shape
    gl = ndi.gaussian_filter(g, radius * K) * 1.8 + ndi.gaussian_filter(g, radius * K * 0.4) * 0.8
    x0, y0 = int(round(x * K - w / 2)), int(round(y * K - h / 2))
    sx0, sy0 = max(0, -x0), max(0, -y0)
    ex, ey = min(w, PW - x0), min(h, PH - y0)
    if ex <= sx0 or ey <= sy0:
        return
    region = sc.img[y0 + sy0:y0 + ey, x0 + sx0:x0 + ex]
    region += np.asarray(color, np.float32) * (gl[sy0:ey, sx0:ex, None] * strength)
    sc.stamp(patch, x, y, shadow=(3, 5, 4, 0.3, (0, 0.02, 0.05)))


def build(out_path):
    rng = np.random.default_rng(4404)
    dc, smooth = C.centerline_dist([S.ABYSS_LEFT, S.ABYSS_RIGHT])
    dc1 = C.logic(dc)
    hw = 36
    yy, xx = C.grid()

    # --- karanlık su ve zemin
    base = C.gradient_bg(rgb('#05233a'), rgb('#021320'))
    sc = C.Scene(base)
    var = C.fbm(H, W, 130, rng, 3)
    sc.blend(rgb('#0b4a63'), np.clip((var - 0.5) * 2.4, 0, 1) * 0.55)
    sc.blend(rgb('#010a14'), np.clip((0.46 - var) * 2.6, 0, 1) * 0.65)
    rock_tex = C.fbm(H, W, 6, rng, 4)
    sc.multiply(0.85 + 0.3 * rock_tex)
    sc.multiply(1 + C.noise(H, W, 0.7, rng) * 0.04)
    sc.add(rgb('#4fd8ff'), PL.caustics_layer(rng, 0.075, 28))

    # --- ada
    ix, iy, irx, iry = ISLAND
    ipts = C.blob_points(rng, 0, 0, irx, iry, n=13, jitter=0.1, rot=0.2)
    iw, ih = int(irx * 2.5), int(iry * 2.5)
    ipts = [(x + iw / 2, y + ih / 2) for x, y in ipts]
    imask = C.mask_patch(iw, ih, lambda d, s: d.polygon([(x * s, y * s) for x, y in ipts], fill=255))
    ivar = C.fbm(ih, iw, 12, rng, 4)
    icol = rgb('#1b2a38')[None, None, :] * (0.7 + 0.7 * ivar[..., None])
    crack = C.ridged(ih, iw, 14, rng, 3)
    icol = icol + (crack ** 3.2)[..., None] * rgb('#1fb6d0')[None, None, :] * 0.85 * imask[..., None]
    ipatch = C.shade_patch(imask, icol, sigma=26, outline=np.array([0.01, 0.04, 0.07]), outline_px=2.2, rng=rng, grain=0.04,
                           hi=np.array([0.5, 0.9, 1.0]), lo=np.array([0, 0, 0.02]), rim=0.3)
    cg = (crack ** 3.2) * imask
    gl = np.zeros((PH, PW), np.float32)
    y0, x0 = int((iy - ih / 2) * K), int((ix - iw / 2) * K)
    gl[y0:y0 + cg.shape[0], x0:x0 + cg.shape[1]] = cg
    sc.add(CYAN, C.blur(gl, 9) * 0.55)
    sc.stamp(ipatch, ix, iy, shadow=(0, 10, 18, 0.75, (0, 0, 0.02)))
    isl = np.zeros((PH, PW), bool)
    isl[y0:y0 + imask.shape[0], x0:x0 + imask.shape[1]] = imask > 0.4
    isl1 = C.logic(isl)

    # --- yol: bazalt + parlayan çatlaklar
    PL.paint_path(sc, dc, rng, hw=hw, wobble=3.0, sand=('#3b5468', '#1d3040'), edge_shadow=0.6,
                  fringe={'colors': ('#08323f', '#13687a'), 'width': 9, 'alpha': 0.9}, rim_light=0.07,
                  glow={'color': CYAN, 'strength': 0.80, 'core': 0.0}, center_light=0.02)
    path_mask = smoothstep(hw + 2, hw - 2, dc)
    sc.add(CYAN, C.blur(path_mask, 16) * 0.10)
    sc.add(CYAN, np.exp(-((dc - hw) / 2.2) ** 2) * 0.30)

    PL.path_pebbles(sc, rng, dc, hw, rgb('#5c7078'), count=90, size=(1.4, 3.4))

    # --- kule zeminleri (ışıklı kenarlı)
    # kule yerlerinin altına zemin çizilmiyor: oyunda yeşil/altın halkalar zaten yerleri gösteriyor, sade görünüm için

    # --- nesneler
    avoid = (dc1 < hw + 30) | isl1
    for x, y, _ in SPOTS:
        PL.disk(avoid, x, y, 70)
    wide = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(wide, x, y, 130)
    wide |= dc1 < hw + 50
    wide |= isl1

    for (px, py, col, hi) in [(X(470), 365, CYAN, rgb('#b8fbff')), (X(650), 540, MAGENTA, rgb('#ffc8f2')), (X(500), 660, CYAN, rgb('#b8fbff')),
                              (X(670), 350, MAGENTA, rgb('#ffc8f2')), (X(445), 520, LIME, rgb('#e5ffc8'))]:
        patch, g = AP.crystal_cluster(rng, rng.uniform(34, 48), col * 0.75, hi, count=int(rng.integers(3, 5)))
        glow_stamp(sc, patch, g, px, py, col, 0.8, 12)
    for (px, py) in [(X(560), 420), (X(610), 460), (X(520), 480)]:
        patch, g = AP.anemone(rng, rng.uniform(16, 22), LIME)
        glow_stamp(sc, patch, g, px, py, LIME, 0.9, 7)

    bones = AP.whale_bones(rng, 270).rotate(-8, expand=True, resample=Image.BICUBIC)
    sc.stamp(bones, X(150), 790, shadow=(5, 9, 7, 0.55, (0, 0, 0.02)))
    PL.disk(avoid, X(150), 790, 160)

    ew = PL.edge_weights(1.6, 0.0)
    rock_keep = avoid | wide
    PL.sprinkle(sc, rng, lambda q: P.rock(q, q.uniform(18, 44), rgb('#2c3d4a') * q.uniform(0.8, 1.15), moss=rgb('#1c5a58')),
                20, rock_keep, 66, weights=np.clip(ew + 0.1, 0, 1), block=36, shadow=(5, 8, 6, 0.55, (0, 0.01, 0.03)))

    def scatter_one(minr):
        pts = C.scatter_points(rng, 1, rock_keep | (ew < 0.2), minr)
        return pts[0] if pts else None

    for _ in range(11):
        p = scatter_one(60)
        if not p:
            continue
        col = [CYAN, MAGENTA, LIME][int(rng.integers(0, 3))]
        patch, g = AP.anemone(rng, rng.uniform(14, 22), col)
        glow_stamp(sc, patch, g, p[0], p[1], col, 0.9, 8)
        PL.disk(rock_keep, p[0], p[1], 50)
    for _ in range(10):
        p = scatter_one(70)
        if not p:
            continue
        col, hi = [(CYAN, rgb('#b8fbff')), (MAGENTA, rgb('#ffc8f2'))][int(rng.integers(0, 2))]
        patch, g = AP.crystal_cluster(rng, rng.uniform(28, 46), col * 0.75, hi, count=int(rng.integers(3, 6)))
        glow_stamp(sc, patch, g, p[0], p[1], col, 0.8, 12)
        PL.disk(rock_keep, p[0], p[1], 56)
    for _ in range(7):
        p = scatter_one(60)
        if not p:
            continue
        patch, g = AP.tube_worms(rng, int(rng.integers(3, 6)), rng.uniform(40, 62), rgb('#ff4a4a'))
        glow_stamp(sc, patch, g, p[0], p[1], rgb('#ff4a4a'), 0.6, 6)
        PL.disk(rock_keep, p[0], p[1], 46)
    for (x, y, c1, c2, r) in [(X(60), 120, CYAN, MAGENTA, 52), (X(1040), 770, MAGENTA, CYAN, 58), (X(1030), 130, LIME, CYAN, 42)]:
        patch, g = AP.jelly(rng, r, c1 * 0.9, c2 * 0.9)
        glow_stamp(sc, patch, g, x, y, c1, 0.55, 18)

    # durağan plankton noktaları
    for _ in range(210):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        if dc1[int(y), int(x)] < hw + 5 or isl1[int(y), int(x)]:
            continue
        col = [CYAN, CYAN, MAGENTA, LIME][int(rng.integers(0, 4))]
        r = rng.uniform(1.0, 2.4)
        y0_, y1_, x0_, x1_ = max(0, int((y - 24) * K)), min(PH, int((y + 24) * K)), max(0, int((x - 24) * K)), min(PW, int((x + 24) * K))
        sub = np.sqrt((xx[y0_:y1_, x0_:x1_] - x) ** 2 + (yy[y0_:y1_, x0_:x1_] - y) ** 2)
        sc.img[y0_:y1_, x0_:x1_] += col[None, None, :] * (np.exp(-(sub / (r * 1.6)) ** 2) * 0.9 + np.exp(-(sub / (r * 6)) ** 2) * 0.12)[..., None]

    PL.finish(sc, rng, vig=0.55, sat=1.10, contrast=1.08)
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'cukur.jpg'))
