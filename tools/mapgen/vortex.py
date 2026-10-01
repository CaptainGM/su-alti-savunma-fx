"""Girdap: dev bir burgaç, spiral akıntı yolu, mercan adacıklar."""
import math

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

import common as C
import pipeline as PL
import props as P
import specs as S
import wreck_props as WP
from common import H, W, rgb, smoothstep

CX, CY = 550, 450
SPOTS = [
    (374, 350, 'normal'), (830, 518, 'normal'), (458, 674, 'normal'), (758, 182, 'normal'), (626, 698, 'normal'),
    (338, 518, 'normal'), (626, 350, 'normal'), (842, 362, 'normal'), (758, 638, 'normal'), (674, 470, 'normal'),
    (650, 110, 'normal'), (974, 182, 'high'), (1022, 422, 'high'), (926, 698, 'high'),
]


def streak_noise(rng, nu=900, nv=560, su=34, sv=1.6):
    n = rng.standard_normal((nv, nu)).astype(np.float32)
    n = ndi.gaussian_filter(n, sigma=(sv, su), mode=('reflect', 'wrap'))
    return n / (n.std() + 1e-6)


def islet(rng, kind):
    """Kule yeri için mercan adacığı (yamayı döndürür)."""
    r = 50 if kind == 'normal' else 54
    w = int(r * 2.8)
    h = int(r * 2.5)
    pts = C.blob_points(rng, w / 2, h / 2 + 2, r * 0.96, r * 0.82, n=10, jitter=0.07, rot=rng.uniform(0, 3))
    m = C.draw_mask_patch(w, h, lambda d, s: d.polygon([(x * s, y * s) for x, y in pts], fill=255))
    var = C.fbm(h, w, 7, rng, 3)
    base = rgb('#a9aa9c') if kind == 'normal' else rgb('#d6b765')
    col = base[None, None, :] * (0.82 + 0.3 * var[..., None])
    yy = np.linspace(0, 1, h)[:, None]
    gate = np.clip((var - 0.52) * 3.2, 0, 1) * 0.7
    col = col * (1 - gate[..., None]) + rgb('#5b9a4c')[None, None, :] * gate[..., None]
    patch = C.shade_patch(m, col, sigma=10, outline=P.OUT, outline_px=1.8, rng=rng, grain=0.05, rim=0.2)
    d = ImageDraw.Draw(patch)
    for _ in range(26):
        a = rng.uniform(0, 6.28)
        rr = rng.uniform(0.2, 0.85)
        x, y = w / 2 + math.cos(a) * r * 0.9 * rr, h / 2 + 2 + math.sin(a) * r * 0.75 * rr
        d.ellipse([x - 1.2, y - 1.2, x + 1.2, y + 1.2], fill=(40, 50, 55, 130))
    return patch


def build(out_path):
    rng = np.random.default_rng(3303)
    dc, smooth = C.centerline_dist([S.VORTEX_PATH])
    hw = 33

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = xx - CX, yy - CY
    r = np.sqrt(dx * dx + dy * dy)
    th = np.arctan2(dy, dx)

    # --- burgaç zemini
    t = np.clip((r - 70) / 400, 0, 1)
    deep, mid, outer = rgb('#06194a'), rgb('#0e4a9a'), rgb('#1f86d8')
    col = np.where(t[..., None] < 0.5, deep + (mid - deep) * (t[..., None] / 0.5), mid + (outer - mid) * ((t[..., None] - 0.5) / 0.5))
    sc = C.Scene(col.astype(np.float32))
    var = C.fbm(H, W, 90, rng, 3)
    sc.blend(rgb('#3db0f0'), np.clip((var - 0.5) * 2.4, 0, 1) * 0.35)
    sc.blend(rgb('#04163f'), np.clip((0.46 - var) * 2.4, 0, 1) * 0.40)

    # spiral akış çizgileri
    phi = th + 2.25 * np.log(r + 40)
    u = ((phi % (2 * math.pi)) / (2 * math.pi)) * 900
    v = np.clip(r / 640 * 560, 0, 559)
    N1 = ndi.map_coordinates(streak_noise(rng), [v, u], order=1, mode='wrap')
    N2 = ndi.map_coordinates(streak_noise(rng, su=16, sv=1.2), [v, u], order=1, mode='wrap')
    streak = np.clip((N1 - 0.55) * 1.0, 0, 1) ** 1.4
    fine = np.clip((N2 - 0.9) * 1.3, 0, 1)
    sc.add(rgb('#cdeeff'), streak * 0.50)
    sc.add(rgb('#7fd4ff'), fine * 0.32)
    dark = np.clip((-N1 - 0.5) * 0.9, 0, 1) ** 1.3
    sc.multiply(1 - dark * 0.30)

    # gözün çevresi: köpüklü halka ve karanlık merkez
    ring = np.exp(-((r - 74) / 15.0) ** 2)
    ring_tex = np.clip((N2 + 0.6) * 0.7, 0, 1)
    sc.add(rgb('#eafaff'), ring * (0.30 + 0.45 * ring_tex))
    eye = smoothstep(78, 22, r)
    sc.blend(rgb('#02081f'), eye * 0.92)
    swirl_in = np.clip((N1 - 0.2) * 0.8, 0, 1) * smoothstep(74, 30, r) * smoothstep(18, 40, r)
    sc.add(rgb('#4f9ae0'), swirl_in * 0.35)

    sc.add(rgb('#d6f1ff'), PL.caustics_layer(rng, 0.20, 26) * smoothstep(60, 220, r))

    # --- yol: parlak akıntı şeridi
    PL.paint_path(sc, dc, rng, hw=hw, wobble=2.6, sand=('#f0feff', '#9fe3f2'), edge_shadow=0.38,
                  fringe={'colors': ('#e6fbff', '#a9e6f5'), 'width': 6, 'alpha': 0.85}, rim_light=0.16,
                  glow={'color': rgb('#ffffff'), 'strength': 0.38}, center_light=0.05)

    # --- adacıklar
    avoid = dc < hw + 30
    avoid |= r < 95
    for x, y, _ in SPOTS:
        PL.disk(avoid, x, y, 70)
    wide = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(wide, x, y, 130)
    wide |= dc < hw + 50
    wide |= r < 150

    for x, y, kind in SPOTS:
        # köpük halkası
        d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
        foam = np.exp(-((d - 58) / 7.0) ** 2) * (0.5 + 0.6 * C.fbm(H, W, 4, rng, 2))
        sc.add(rgb('#ffffff'), np.clip(foam, 0, 1) * 0.42)
        sc.stamp(islet(rng, kind), x, y + 2, shadow=(4, 9, 6, 0.45, (0.01, 0.04, 0.12)))
        # adacık üstü: mercan ve taşlar
        for _ in range(3 if kind == 'normal' else 5):
            a = rng.uniform(0, 6.28)
            px, py = x + math.cos(a) * 30, y + 2 + math.sin(a) * 24
            if rng.random() < 0.5:
                sc.stamp(P.tube_cluster(rng, 3, 8, rgb('#ee6a3a') if kind == 'normal' else rgb('#f2c14a'), rgb('#6e2410'), rgb('#ffd9a8')), px, py, shadow=(2, 4, 2, 0.35, (0.02, 0.05, 0.1)))
            else:
                sc.stamp(P.rock(rng, rng.uniform(5, 9), rgb('#8d8e84')), px, py, shadow=(2, 3, 2, 0.35, (0.02, 0.05, 0.1)))

    # --- sürüklenen enkaz parçaları (akıntıyla hizalı)
    def drift(x, y, patch):
        phi_p = math.atan2(y - CY, x - CX) + 2.25 * math.log(math.hypot(x - CX, y - CY) + 40)
        # spiral çizgisinin teğeti
        rr = math.hypot(x - CX, y - CY)
        a = math.atan2(y - CY, x - CX)
        slope = 1.0 / (1 + 2.25 / (rr + 40) * rr)  # yaklaşık
        ang = math.degrees(-(a + math.pi / 2 - 0.55))
        patch = patch.rotate(ang, expand=True, resample=Image.BICUBIC)
        sc.stamp(patch, x, y, shadow=(4, 7, 5, 0.40, (0.01, 0.04, 0.12)))
        PL.disk(avoid, x, y, 40)

    cand = C.scatter_points(rng, 40, avoid | wide, 130)
    for (x, y) in cand[:7]:
        if rng.random() < 0.55:
            drift(x, y, WP.barrel(rng, 17))
        else:
            drift(x, y, WP.crate(rng, 30))

    # --- köşelerdeki kaya kümeleri ve mercanlar
    ew = PL.edge_weights(2.4, 0.0)
    PL.sprinkle(sc, rng, lambda q: P.rock(q, q.uniform(30, 58), rgb('#7e8a8a') * q.uniform(0.85, 1.1), moss=rgb('#4d9446')),
                9, avoid | (r < 440), 80, weights=ew, block=50, keepout=wide, shadow=(5, 9, 7, 0.45, (0.01, 0.04, 0.12)))
    PL.sprinkle(sc, rng, lambda q: P.tube_cluster(q, 4, 15, rgb('#e86a30'), rgb('#6e2410'), rgb('#ffd9a8')),
                5, avoid | (r < 430), 100, weights=ew, block=60, keepout=wide)
    PL.sprinkle(sc, rng, lambda q: P.sea_fan(q, q.uniform(55, 80), rgb('#e0527a'), rgb('#ffc0d8')),
                4, avoid | (r < 430), 120, weights=ew, block=50, keepout=wide)
    PL.sprinkle(sc, rng, lambda q: P.tuft(q, int(q.integers(7, 11)), q.uniform(70, 105), q.uniform(9, 13),
                                          rgb('#0f4a2c'), rgb('#5aa83a'), rgb('#d9ff8f'), spread=1.1),
                6, avoid | (r < 440), 110, weights=ew, block=60, keepout=wide)
    PL.sprinkle(sc, rng, lambda q: P.tuft(q, int(q.integers(10, 15)), q.uniform(32, 50), q.uniform(4, 6),
                                          rgb('#2a7d3a'), rgb('#9fe05c'), rgb('#e8ffb0'), spread=0.85),
                16, avoid | (r < 430), 60, weights=np.clip(ew * 1.4, 0, 1), shadow=(3, 5, 3, 0.3, (0, 0.05, 0.1)), block=26, keepout=wide)
    PL.sprinkle(sc, rng, lambda q: P.starfish(q, q.uniform(15, 22), rgb('#f08a2e'), rgb('#ffe2a0')), 4, avoid | (r < 430), 90,
                shadow=(3, 5, 3, 0.35, (0, 0.05, 0.1)), block=28, weights=ew, keepout=wide)

    PL.finish(sc, rng, vig=0.40, sat=1.10)
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'girdap.jpg'))
