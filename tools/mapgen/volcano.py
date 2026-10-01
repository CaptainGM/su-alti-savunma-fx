"""Volkanik Bacalar: bazalt zemin, lav çatlakları, küllü yol, bacalar. Yol üç sütunlu dikey zigzag."""
import numpy as np
from PIL import Image

import abyss_props as AP
import common as C
import pipeline as PL
import props as P
import specs as S
import volcano_props as VP
from abyss import glow_stamp
from common import H, K, PH, PW, W, rgb, smoothstep

SPOTS = [
    (974, 650, 'normal'), (722, 254, 'normal'), (446, 650, 'high'), (1250, 170, 'high'), (410, 350, 'normal'),
    (986, 470, 'high'), (410, 506, 'normal'), (962, 338, 'normal'), (698, 386, 'normal'), (698, 530, 'normal'),
    (698, 662, 'normal'), (962, 206, 'normal'),
]
LAVA = VP.LAVA
LAVA_HI = VP.LAVA_HI


def build(out_path):
    rng = np.random.default_rng(6606)
    dc, smooth = C.centerline_dist([S.VOLCANO_PATH])
    dc1 = C.logic(dc)
    hw = 38
    yy, xx = C.grid()

    # --- bazalt zemin
    base = C.gradient_bg(rgb('#241a1d'), rgb('#150d10'))
    sc = C.Scene(base)
    var = C.fbm(H, W, 110, rng, 3)
    sc.blend(rgb('#4a2420'), np.clip((var - 0.5) * 2.4, 0, 1) * 0.55)
    sc.blend(rgb('#0a0507'), np.clip((0.46 - var) * 2.6, 0, 1) * 0.6)
    tex = C.fbm(H, W, 5, rng, 4)
    sc.multiply(0.8 + 0.4 * tex[..., None][..., 0])
    sc.multiply(1 + C.noise(H, W, 0.6, rng) * 0.05)
    # çokgen soğuma çatlakları (soluk)
    poly = smoothstep(0.72, 0.9, C.ridged(H, W, 13, rng, 2))
    sc.multiply(1 - poly * 0.35)

    keep = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(keep, x, y, 72)
    keep_hi = np.kron(keep, np.ones((K, K), bool))[:PH, :PW]
    away = smoothstep(hw + 6, hw + 26, dc) * (~keep_hi)

    # --- lav ağı ve gölcükler
    cr = C.ridged(H, W, 17, rng, 3)
    lv = smoothstep(0.52, 0.82, cr) * away
    core = smoothstep(0.76, 0.95, cr) * away
    sc.add(rgb('#8a1a06'), lv * 0.65)
    sc.add(LAVA, lv * core * 1.1 + lv * 0.35)
    sc.add(LAVA_HI, core * core * 0.55)
    pool_f = C.fbm(H, W, 55, rng, 3)
    pool = smoothstep(0.700, 0.715, pool_f) * smoothstep(hw + 50, hw + 90, dc) * (~keep_hi)
    crust = np.clip(np.abs(pool - C.blur(pool, 1.6)) * 4.0, 0, 1)
    pcol = LAVA[None, None, :] * (0.8 + 0.4 * C.fbm(H, W, 6, rng, 3)[..., None]) + LAVA_HI[None, None, :] * (C.fbm(H, W, 14, rng, 3)[..., None] - 0.45).clip(0, 1) * 0.9
    sc.blend(pcol, pool)
    sc.blend(rgb('#2a1210'), crust * 0.9)
    bloom = C.blur(np.maximum(lv * 0.8, pool), 12)
    sc.add(rgb('#ff5a14'), bloom * 0.42)

    # --- küllü yol
    PL.paint_path(sc, dc, rng, hw=hw, wobble=3.2, sand=('#9d928a', '#5f5551'), edge_shadow=0.5,
                  fringe={'colors': ('#2a2024', '#4a3a3c'), 'width': 9, 'alpha': 0.9}, rim_light=0.08, center_light=0.05)
    sc.add(LAVA, np.exp(-((dc - hw) / 1.8) ** 2) * 0.35)
    sc.add(rgb('#ff4a10'), C.blur(np.exp(-((dc - hw) / 4.0) ** 2), 5) * 0.18)
    PL.path_pebbles(sc, rng, dc, hw, rgb('#6e625d'), count=80, size=(1.4, 3.4))

    # --- kule zeminleri (turuncu ışıklı)
    PL.spot_pads(sc, rng, SPOTS, '#52464b', '#8a7a80', high_base='#7a4a34')
    for x, y, kind in SPOTS:
        d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
        sc.add(LAVA if kind != 'high' else LAVA_HI, np.exp(-((d - 52) / 5.0) ** 2) * 0.28)

    # --- nesneler
    avoid = (dc1 < hw + 30) | (C.logic(pool) > 0.3)
    for x, y, _ in SPOTS:
        PL.disk(avoid, x, y, 70)
    wide = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(wide, x, y, 120)
    wide |= dc1 < hw + 50
    ew = PL.edge_weights(1.0, 0.4)

    cone, cglow = VP.crater_cone(rng, 105)
    glow_stamp(sc, cone, cglow, 108, 770, LAVA, 0.8, 16)
    PL.disk(avoid, 108, 770, 130)
    PL.disk(wide, 108, 770, 150)

    # bacalar + duman
    vents = C.scatter_points(rng, 10, avoid | wide, 100, weights=ew)
    for vx, vy in vents:
        patch, g = VP.vent(rng, rng.uniform(13, 19))
        glow_stamp(sc, patch, g, vx, vy, LAVA, 0.9, 10)
        sc.stamp(VP.smoke(rng, rng.uniform(45, 70)), vx, vy - 44, shadow=None)
        PL.disk(avoid, vx, vy, 50)

    for _ in range(9):
        p = C.scatter_points(rng, 1, avoid | wide, 70, weights=ew)
        if not p:
            continue
        patch, g = VP.hex_cluster(rng, int(rng.integers(4, 9)), rng.uniform(13, 18))
        glow_stamp(sc, patch, g, p[0][0], p[0][1], LAVA, 0.5, 8)
        PL.disk(avoid, p[0][0], p[0][1], 56)
    PL.sprinkle(sc, rng, lambda q: VP.basalt_rock(q, q.uniform(14, 34)), 22, avoid, 60, weights=ew, block=34,
                shadow=(5, 8, 6, 0.55, (0.02, 0, 0)))
    for _ in range(7):
        p = C.scatter_points(rng, 1, avoid | wide, 70, weights=ew)
        if not p:
            continue
        patch, g = AP.crystal_cluster(rng, rng.uniform(26, 40), np.array([0.32, 0.12, 0.42]), np.array([1.0, 0.55, 0.35]), count=int(rng.integers(3, 5)))
        glow_stamp(sc, patch, g, p[0][0], p[0][1], rgb('#ff5a2a'), 0.6, 10)
        PL.disk(avoid, p[0][0], p[0][1], 52)
    for _ in range(6):
        p = C.scatter_points(rng, 1, avoid | wide, 70, weights=ew)
        if not p:
            continue
        patch, g = AP.tube_worms(rng, int(rng.integers(3, 6)), rng.uniform(40, 60), rgb('#ff8a2a'))
        glow_stamp(sc, patch, g, p[0][0], p[0][1], rgb('#ff6a1f'), 0.6, 6)
        PL.disk(avoid, p[0][0], p[0][1], 46)
    PL.sprinkle(sc, rng, lambda q: P.pebble(q, q.uniform(2.5, 6), rgb('#554a4e') * q.uniform(0.8, 1.1)), 80,
                (dc1 < hw + 6) | (dc1 > hw + 100), 20, shadow=(2, 3, 2, 0.4, (0, 0, 0)), block=8)

    # sıcaklık: kenarlarda kızıl karartma
    yy_, xx_ = yy, xx
    edge = np.clip((np.sqrt(((xx_ - W / 2) / (W / 2)) ** 2 + ((yy_ - H / 2) / (H / 2)) ** 2) - 0.6), 0, 1)
    sc.add(rgb('#ff3a10'), edge * 0.05)
    PL.finish(sc, rng, vig=0.5, sat=1.12, contrast=1.08)
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'volkan.jpg'))
