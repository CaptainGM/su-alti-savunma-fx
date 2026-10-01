"""Batık Gemi Mezarlığı: berrak sığ su, kum tepecikleri, tahta iskele yolu, gemi enkazları."""
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

import common as C
import pipeline as PL
import props as P
import specs as S
import wreck_props as WP
from common import H, K, PH, PW, W, X, rgb, smoothstep

SPOTS = [(X(x), y, k) for x, y, k in [
    (674, 602, 'normal'), (938, 254, 'high'), (158, 230, 'high'), (554, 374, 'normal'), (590, 830, 'normal'),
    (422, 506, 'normal'), (398, 626, 'normal'), (734, 710, 'normal'), (482, 782, 'normal'), (722, 482, 'normal'),
    (842, 758, 'high'), (674, 314, 'normal'),
]]


def _dense(pts, step=1.5):
    pts = np.array(pts, np.float64)
    seg = np.hypot(*np.diff(pts, axis=0).T)
    s = np.r_[0, np.cumsum(seg)]
    ss = np.arange(0, s[-1], step)
    return np.c_[np.interp(ss, s, pts[:, 0]), np.interp(ss, s, pts[:, 1])], ss


def paint_planks(sc, dc, rng, lanes_smooth, n_tail, hw=36):
    wob = (C.fbm(H, W, 18, rng, 3) - 0.5) * 2
    d = dc - (hw + wob * 2.2)
    inside = smoothstep(0.7, -0.7, d)

    # iskelenin kumdaki gölgesi (aşağı kaydırılmış)
    sh = np.roll(inside, 8 * K, axis=0)
    sh = C.blur(sh, 5)
    sc.multiply(1 - sh * 0.42)

    all_pts, all_s = [], []
    for k, smooth in enumerate(lanes_smooth):
        use = smooth if k == 0 else smooth[:max(2, len(smooth) - n_tail * 20)]
        pts, ss = _dense(use)
        all_pts.append(pts)
        all_s.append(ss + k * 977)
    pts = np.vstack(all_pts)
    ss = np.concatenate(all_s)
    tang = np.zeros_like(pts)
    tang[1:-1] = pts[2:] - pts[:-2]
    tang[0], tang[-1] = tang[1], tang[-2]
    tang /= (np.linalg.norm(tang, axis=1, keepdims=True) + 1e-9)

    ys, xs = np.nonzero(dc < hw + 14)
    tree = cKDTree(pts)
    qx, qy = (xs + 0.5) / K, (ys + 0.5) / K
    _, idx = tree.query(np.c_[qx, qy])
    q = pts[idx]
    tn = tang[idx]
    u = (qx - q[:, 0]) * (-tn[:, 1]) + (qy - q[:, 1]) * tn[:, 0]
    s = ss[idx]

    L = 34.0
    pid = np.floor(s / L).astype(np.int64)
    f = (s % L) / L
    hsh = ((pid * 2654435761) % 4294967296) / 4294967296.0
    hsh2 = ((pid * 40503 + 17) * 2246822519 % 4294967296) / 4294967296.0

    wood_a, wood_b = rgb('#c18a4e'), rgb('#7e5230')
    tone = (0.5 * hsh + 0.5 * hsh2)[:, None]
    col = wood_b * (1 - tone) + wood_a * tone
    grain = (np.sin(u * 0.75 + pid * 3.3) * 0.5 + 0.5)[:, None]
    # ahşap damarı: yol boyunca uzayan ince çizgiler
    fiber = (np.sin(u * 2.6 + pid * 1.7 + np.sin(s * 0.07) * 1.5) * 0.5 + 0.5)[:, None]
    col = col * (0.86 + 0.18 * grain) * (0.94 + 0.10 * fiber)
    fine = C.fbm(H, W, 2.5, rng, 2)[ys, xs][:, None]
    micro = C.noise(H, W, 0.6, rng)[ys, xs][:, None]
    col = col * (0.9 + 0.2 * fine) * (1 + 0.03 * micro)
    seam = np.maximum(smoothstep(0.075, 0.0, f), smoothstep(0.925, 1.0, f))
    col = col * (1 - 0.55 * seam[:, None])
    rail = smoothstep(2.6, 0.8, np.abs(np.abs(u) - hw * 0.8))
    col = col * (1 - 0.38 * rail[:, None])
    nail = ((np.abs(f - 0.1) < 0.025) & (np.abs(np.abs(u) - hw * 0.8) < 3.4)).astype(np.float32)
    col = col * (1 - 0.7 * nail[:, None])
    edge = smoothstep(6, 0, hw - np.abs(u))
    col = col * (1 - 0.25 * edge[:, None])

    layer = np.zeros((PH, PW, 3), np.float32)
    layer[ys, xs] = col
    sc.blend(layer, inside)


def build(out_path):
    rng = np.random.default_rng(2202)
    paths = [S.WRECK_LANE_L, S.WRECK_LANE_R]
    dc, smooth = C.centerline_dist(paths)
    dc1 = C.logic(dc)
    hw = 36
    yy, xx = C.grid()

    # --- kum zemin
    base = C.gradient_bg(rgb('#e4d6a2'), rgb('#cdbd86'))
    sc = C.Scene(base)
    var = C.fbm(H, W, 90, rng, 3)
    sc.blend(rgb('#f3e7b8'), np.clip((var - 0.5) * 2.5, 0, 1) * 0.5)
    sc.blend(rgb('#a99a68'), np.clip((0.46 - var) * 2.6, 0, 1) * 0.5)
    warp = C.fbm(H, W, 60, rng, 3)
    wave = np.sin((xx * 0.55 + yy * 0.83) * 0.045 + warp * 11)
    sc.add(rgb('#fff6d0'), smoothstep(0.55, 0.95, wave) * 0.16)
    sc.multiply(1 - smoothstep(-0.55, -0.95, wave) * 0.16)
    fine = np.sin((xx * 0.4 + yy * 0.9) * 0.2 + C.fbm(H, W, 12, rng, 2) * 14)
    sc.multiply(1 + fine * 0.018)
    sc.multiply(1 + C.noise(H, W, 0.7, rng) * 0.03)   # kum taneleri
    deep = C.fbm(H, W, 170, rng, 3)
    sc.blend(rgb('#2aa7b6'), 0.24 + np.clip((deep - 0.4) * 0.9, 0, 0.3))
    sc.add(rgb('#e9ffff'), PL.caustics_layer(rng, 0.30, 22))

    # --- iskele yolu
    paint_planks(sc, dc, rng, smooth, len(S.WRECK_TAIL), hw)

    # --- kule zeminleri
    PL.spot_pads(sc, rng, SPOTS, '#8a9b95', '#a6b4ae', high_base='#8d8272')

    # --- nesneler
    avoid = dc1 < hw + 28
    for x, y, _ in SPOTS:
        PL.disk(avoid, x, y, 68)
    wide = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(wide, x, y, 135)
    wide |= dc1 < hw + 55

    def place(patch, x, y, rot=0, shadow=(6, 9, 6, 0.40, (0.03, 0.06, 0.08))):
        if rot:
            patch = patch.rotate(rot, expand=True, resample=Image.BICUBIC)
        sc.stamp(patch, x, y, shadow=shadow)
        PL.disk(avoid, x, y, max(patch.size) / K * 0.42)

    small = (3, 6, 3, 0.4, (0.03, 0.06, 0.08))
    place(WP.hull(rng, 400, 138), X(175), 790, rot=-12)
    place(WP.hull(rng, 270, 104, wood='#745030', plank='#9a7044', broken=False), X(985), 620, rot=84)
    place(WP.mast(rng, 250, 9), X(925), 468, rot=-28)
    place(WP.mast(rng, 200, 8), X(330), 120, rot=18)

    place(WP.anchor(rng, 64), X(76), 500, shadow=small)
    for (x, y) in [(335, 700), (372, 735), (310, 735)]:
        place(WP.barrel(rng, 20), X(x), y, shadow=small)
    for (x, y) in [(1040, 790), (1000, 830)]:
        place(WP.crate(rng, 38), X(x), y, shadow=small)
    place(WP.chest(rng, 64), X(905), 862, shadow=small)
    for _ in range(14):
        sc.stamp(WP.coin(rng, rng.uniform(3.6, 5.6)), X(905) + rng.uniform(-70, 40), 880 + rng.uniform(-22, 18), shadow=(1, 2, 1, 0.3, (0.1, 0.07, 0.03)))
    place(WP.skull_fish(rng, 40), X(560), 90, shadow=(2, 4, 2, 0.3, (0.03, 0.06, 0.08)))

    ew = PL.edge_weights(1.2, 0.10)
    PL.sprinkle(sc, rng, lambda r: P.rock(r, r.uniform(16, 40), rgb('#8d8a7e') * r.uniform(0.85, 1.1), moss=rgb('#5b8f4a')),
                19, avoid, 70, weights=ew, block=40, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.tuft(r, int(r.integers(7, 10)), r.uniform(70, 100), r.uniform(9, 13),
                                          rgb('#0f4a2c'), rgb('#5aa83a'), rgb('#d9ff8f'), spread=1.1),
                10, avoid, 110, weights=ew, block=60, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.tuft(r, int(r.integers(10, 15)), r.uniform(32, 50), r.uniform(4, 6),
                                          rgb('#2a7d3a'), rgb('#9fe05c'), rgb('#e8ffb0'), spread=0.85),
                40, avoid, 60, weights=np.clip(ew * 1.3, 0, 1), shadow=(3, 5, 3, 0.3, (0, 0.05, 0.08)), block=26)
    PL.sprinkle(sc, rng, lambda r: P.tube_cluster(r, 4, 14, rgb('#d9602a'), rgb('#6e2410'), rgb('#ffd9a8')),
                4, avoid, 120, weights=ew, block=60, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.sea_fan(r, r.uniform(55, 78), rgb('#d0527a'), rgb('#ffc0d8')),
                4, avoid, 140, weights=ew, block=50, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.starfish(r, r.uniform(15, 24), rgb('#f08a2e'), rgb('#ffe2a0')), 11, avoid, 90,
                shadow=(3, 5, 3, 0.35, (0, 0.05, 0.08)), block=28)
    PL.sprinkle(sc, rng, lambda r: P.shell(r, r.uniform(11, 17), rgb('#fbe8d4'), rgb('#c09478')), 10, avoid, 80,
                shadow=(3, 5, 3, 0.35, (0, 0.05, 0.08)), block=26)
    PL.sprinkle(sc, rng, lambda r: P.urchin(r, r.uniform(9, 13)), 7, avoid, 90, shadow=(3, 5, 3, 0.35, (0, 0.05, 0.08)), block=28)
    PL.sprinkle(sc, rng, lambda r: P.pebble(r, r.uniform(3, 7), rgb('#a9a595') * r.uniform(0.8, 1.1)), 90,
                (dc1 < hw + 8) | (dc1 > hw + 90), 20, shadow=(2, 3, 2, 0.35, (0, 0.05, 0.08)), block=8)

    PL.finish(sc, rng, vig=0.36, sat=1.12)
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'batik.jpg'))
