"""Yosun Ormanı: yeşil-turkuaz su, kalın yosun demetleri, ışık huzmeleri."""
import numpy as np

import common as C
import pipeline as PL
import props as P
import specs as S
from common import H, W, rgb


def build(out_path):
    rng = np.random.default_rng(1101)
    dc, _ = C.centerline_dist([S.KELP_PATH])
    dc1 = C.logic(dc)
    spots = S.KELP_SPOTS
    yy, xx = C.grid()

    # --- su ve zemin
    base = C.gradient_bg(rgb('#2aa5a0'), rgb('#0f6d7c'))
    sc = C.Scene(base)
    var = C.fbm(H, W, 150, rng, 3)
    sc.blend(rgb('#2bbfa8'), np.clip((var - 0.50) * 2.6, 0, 1) * 0.50)
    sc.blend(rgb('#083f55'), np.clip((0.47 - var) * 2.8, 0, 1) * 0.70)
    patch = C.fbm(H, W, 55, rng, 4)
    sc.blend(rgb('#7fc9a0'), C.smoothstep(0.56, 0.72, patch) * 0.30)
    ripples = np.sin(xx * 0.045 + C.fbm(H, W, 40, rng, 2) * 9) * 0.5 + 0.5
    sc.multiply(1 + (ripples - 0.5) * 0.05)
    # zemin dokusu: ince kum benekleri
    sc.multiply(1 + C.noise(H, W, 0.8, rng) * 0.025)
    sc.add(rgb('#d8ffe8'), PL.caustics_layer(rng, 0.36, 24))

    # --- yol
    hw = 36
    PL.paint_path(sc, dc, rng, hw=hw, sand=('#ecd596', '#c9a460'), edge_shadow=0.34,
                  fringe={'colors': ('#1f6e3a', '#6dae45'), 'width': 14, 'alpha': 0.95}, rim_light=0.09)
    PL.path_pebbles(sc, rng, dc, hw, rgb('#c9b484'), count=150)

    # --- kule zeminleri
    PL.spot_pads(sc, rng, spots, '#a9b79a', '#8b9a86', high_base='#c8b27a')

    # --- nesneler
    avoid = dc1 < hw + 34
    for x, y, _ in spots:
        PL.disk(avoid, x, y, 70)
    ew = PL.edge_weights(1.3, 0.10)
    wide = dc1 < hw + 60
    for x, y, _ in spots:
        PL.disk(wide, x, y, 150)

    def big_kelp(r):
        if r.random() < 0.35:   # altın-kahverengi dev yosun
            return P.tuft(r, int(r.integers(6, 10)), r.uniform(85, 125), r.uniform(10, 14),
                          rgb('#5a4a14'), rgb('#c9a93a'), rgb('#fff0a0'), spread=1.15)
        return P.tuft(r, int(r.integers(7, 11)), r.uniform(80, 118), r.uniform(10, 14),
                      rgb('#0f4a2c'), rgb('#6fb83a'), rgb('#d9ff8f'), spread=1.15)
    PL.sprinkle(sc, rng, big_kelp, 22, avoid, 100, weights=ew, block=62, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.rock(r, r.uniform(16, 40), rgb('#76847f') * r.uniform(0.85, 1.1), moss=rgb('#4d9446')),
                20, avoid, 70, weights=ew, block=40)
    PL.sprinkle(sc, rng, lambda r: P.tube_cluster(r, 4, 14, rgb('#e07a2e'), rgb('#6e2410'), rgb('#ffd9a8')),
                4, avoid, 120, weights=ew, block=60)
    PL.sprinkle(sc, rng, lambda r: P.tube_cluster(r, 4, 14, rgb('#a65fbe'), rgb('#4a1d66'), rgb('#f0c8ff')),
                3, avoid, 120, weights=ew, block=60)
    PL.sprinkle(sc, rng, lambda r: P.tuft(r, int(r.integers(9, 15)), r.uniform(34, 52), r.uniform(4, 6),
                                          rgb('#2a7d3a'), rgb('#9fe05c'), rgb('#e8ffb0'), spread=0.85),
                58, avoid, 54, weights=np.clip(ew * 1.4, 0, 1), shadow=(3, 5, 3, 0.3, (0, 0.05, 0.08)), block=26)
    PL.sprinkle(sc, rng, lambda r: P.urchin(r, r.uniform(9, 14)), 11, avoid, 80, shadow=(3, 5, 3, 0.35, (0, 0.05, 0.08)), block=28)
    PL.sprinkle(sc, rng, lambda r: P.starfish(r, r.uniform(15, 24), rgb('#f08a2e'), rgb('#ffe2a0')), 10, avoid, 90,
                shadow=(3, 5, 3, 0.35, (0, 0.05, 0.08)), block=28)
    PL.sprinkle(sc, rng, lambda r: P.shell(r, r.uniform(11, 17), rgb('#f2d4b8'), rgb('#b88a70')), 8, avoid, 90,
                shadow=(3, 5, 3, 0.35, (0, 0.05, 0.08)), block=26)
    PL.sprinkle(sc, rng, lambda r: P.sea_fan(r, r.uniform(55, 80), rgb('#b05ac8'), rgb('#e0b0ff')), 4, avoid, 140, weights=ew, block=50, keepout=wide)

    # yol kenarındaki çakıllar
    PL.sprinkle(sc, rng, lambda r: P.pebble(r, r.uniform(3, 7), rgb('#9aa5a0') * r.uniform(0.8, 1.1)), 90,
                (dc1 < hw + 8) | (dc1 > hw + 95), 20, shadow=(2, 3, 2, 0.35, (0, 0.05, 0.08)), block=8)

    PL.finish(sc, rng, vig=0.44, sat=1.16)
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'yosun.jpg'))
