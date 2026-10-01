"""Atlantis Harabeleri: turkuaz su, kırık mermer zemin, altın şeritli basamak yolu, sütunlar ve taş başlar."""
import numpy as np

import atlantis_props as AT
import common as C
import pipeline as PL
import props as P
import specs as S
from common import H, K, PH, PW, W, rgb, smoothstep

SPOTS = [
    (482, 422, 'normal'), (1106, 650, 'high'), (146, 218, 'high'), (746, 446, 'normal'), (1250, 686, 'high'),
    (410, 230, 'normal'), (818, 650, 'normal'), (566, 518, 'normal'), (902, 746, 'normal'), (242, 302, 'normal'),
    (878, 470, 'normal'), (542, 254, 'normal'),
]
GOLD = rgb('#e2b13c')


def tile_pattern(xx, yy, size, a, b, grout, rng, wobble=0.0):
    tx, ty = np.floor(xx / size), np.floor(yy / size)
    chk = ((tx + ty) % 2)[..., None]
    col = a[None, None, :] * (1 - chk) + b[None, None, :] * chk
    # karo başına küçük renk farkı
    h = ((tx * 73856093 + ty * 19349663) % 1000) / 1000.0
    col = col * (0.95 + 0.1 * h[..., None])
    fx, fy = (xx / size) % 1.0, (yy / size) % 1.0
    line = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
    g = smoothstep(0.075, 0.02, line)[..., None]
    return col * (1 - g) + grout[None, None, :] * g


def build(out_path):
    rng = np.random.default_rng(7707)
    dc, smooth = C.centerline_dist([S.ATLANTIS_PATH])
    dc1 = C.logic(dc)
    hw = 38
    yy, xx = C.grid()

    # --- turkuaz su altı zemin
    base = C.gradient_bg(rgb('#26b8b2'), rgb('#0e6f88'))
    sc = C.Scene(base)
    var = C.fbm(H, W, 120, rng, 3)
    sc.blend(rgb('#5fd8c0'), np.clip((var - 0.5) * 2.4, 0, 1) * 0.45)
    sc.blend(rgb('#08506a'), np.clip((0.46 - var) * 2.6, 0, 1) * 0.55)
    sand = C.fbm(H, W, 50, rng, 4)
    sc.blend(rgb('#d9d09a'), smoothstep(0.56, 0.7, sand) * 0.28)
    sc.multiply(1 + C.noise(H, W, 0.7, rng) * 0.03)
    sc.add(rgb('#e8fff4'), PL.caustics_layer(rng, 0.30, 22))

    # --- kırık mermer meydan (karolu zemin)
    pf = C.fbm(H, W, 95, rng, 3)
    plaza = smoothstep(0.50, 0.545, pf)
    broken = smoothstep(0.80, 0.9, C.ridged(H, W, 9, rng, 2))
    plaza = plaza * (1 - broken * 0.9)
    plaza_col = tile_pattern(xx, yy, 26, rgb('#d6e6dc'), rgb('#bcd6ca'), rgb('#8fb0a2'), rng)
    plaza_col = plaza_col * (0.92 + 0.14 * C.fbm(H, W, 5, rng, 3)[..., None])
    sh = np.roll(np.roll(plaza, 4 * K, axis=0), 3 * K, axis=1)
    sc.multiply(1 - np.clip(sh - plaza, 0, 1) * 0.5)
    sc.blend(plaza_col, plaza)
    outline = np.clip(np.abs(plaza - C.blur(plaza, 1.1)) * 3.0, 0, 1)
    sc.blend(rgb('#3d5f5a'), outline * 0.7)
    sc.blend(rgb('#2c8a5a'), np.clip(C.fbm(H, W, 7, rng, 3) - 0.62, 0, 1) * 3 * plaza * 0.5)   # yosun lekeleri

    # --- mermer basamak yolu
    wob = (C.fbm(H, W, 20, rng, 3) - 0.5) * 2
    d = dc - (hw + wob * 1.5)
    inside = smoothstep(0.7, -0.7, d)
    shd = np.roll(inside, 7 * K, axis=0)
    sc.multiply(1 - C.blur(shd, 4) * 0.42)
    path_col = tile_pattern(xx, yy, 24, rgb('#f4ecd8'), rgb('#e4d8bd'), rgb('#b7a67c'), rng)
    path_col = path_col * (0.94 + 0.10 * C.fbm(H, W, 4, rng, 2)[..., None]) * (1 + 0.03 * C.noise(H, W, 0.6, rng)[..., None])
    # altın kenar şeridi
    band = smoothstep(-1.0, -2.2, d) * smoothstep(-7.5, -5.0, d)
    path_col = path_col * (1 - band[..., None]) + (GOLD[None, None, :] * (0.85 + 0.2 * C.fbm(H, W, 3, rng, 2)[..., None])) * band[..., None]
    inner_edge = smoothstep(-5.0, -7.5, d) * smoothstep(-9.0, -7.5, d)
    path_col = path_col * (1 - 0.25 * inner_edge[..., None])
    sc.blend(path_col, inside)
    edge = np.exp(-((d + 0.2) / 0.9) ** 2) * 0.55
    sc.blend(rgb('#2a2418'), edge * inside)

    # --- kule zeminleri
    # kule yerlerinin altına zemin çizilmiyor: oyunda yeşil/altın halkalar zaten yerleri gösteriyor, sade görünüm için

    # --- nesneler
    plaza1 = C.logic(plaza) > 0.5
    avoid = dc1 < hw + 26
    for x, y, _ in SPOTS:
        PL.disk(avoid, x, y, 70)
    wide = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(wide, x, y, 125)
    wide |= dc1 < hw + 50
    for gx, gy in S.ATLANTIS_GUARDIANS:
        PL.disk(avoid, gx, gy, 80)
    ew = PL.edge_weights(1.0, 0.25)
    sh_ = (5, 8, 6, 0.38, (0.0, 0.1, 0.12))

    for _ in range(2):
        p = C.scatter_points(rng, 1, avoid | wide, 150, weights=ew)
        if p:
            sc.stamp(AT.temple_base(rng, rng.uniform(130, 160)), p[0][0], p[0][1], shadow=(8, 12, 8, 0.4, (0, 0.1, 0.12)))
            PL.disk(avoid, p[0][0], p[0][1], 100)
    # koruyucu başlar: oyunda periyodik olarak düşmanlara vurur, altlarında soluk bir rün çemberi var
    for gx, gy in S.ATLANTIS_GUARDIANS:
        d = np.sqrt((xx - gx) ** 2 + (yy - gy) ** 2)
        sc.add(rgb('#7ffff0'), np.exp(-((d - 46) / 2.6) ** 2) * 0.42 + np.exp(-((d - 62) / 1.6) ** 2) * 0.22)
        sc.stamp(AT.stone_head(rng, 38), gx, gy, shadow=(5, 8, 6, 0.4, (0.0, 0.1, 0.12)))
        PL.disk(avoid, gx, gy, 70)
    PL.sprinkle(sc, rng, lambda r: AT.column(r, r.uniform(13, 18), broken=r.random() < 0.4), 16, avoid, 70, weights=ew, block=30, shadow=sh_, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: AT.fallen_column(r, r.uniform(70, 130), r.uniform(11, 16)), 9, avoid, 100, weights=ew, block=50, shadow=sh_, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: AT.trident(r, r.uniform(50, 66)), 3, avoid, 120, weights=ew, block=40, shadow=sh_, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.rock(r, r.uniform(14, 34), rgb('#8aa092') * r.uniform(0.85, 1.1), moss=rgb('#3f8f68')), 14, avoid, 70, weights=ew, block=36, shadow=sh_)
    PL.sprinkle(sc, rng, lambda r: P.tuft(r, int(r.integers(7, 10)), r.uniform(70, 100), r.uniform(9, 13),
                                          rgb('#0f4a4a'), rgb('#3fb88a'), rgb('#c8ffe0'), spread=1.1), 8, avoid, 110, weights=ew, block=60, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.tuft(r, int(r.integers(10, 15)), r.uniform(32, 50), r.uniform(4, 6),
                                          rgb('#1f7a6a'), rgb('#7fe0a8'), rgb('#e8ffe8'), spread=0.85), 30, avoid, 60, weights=np.clip(ew * 1.3, 0, 1), shadow=(3, 5, 3, 0.3, (0, 0.08, 0.1)), block=26)
    PL.sprinkle(sc, rng, lambda r: P.sea_fan(r, r.uniform(55, 78), rgb('#e0a838'), rgb('#fff0b8')), 5, avoid, 140, weights=ew, block=50, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.tube_cluster(r, 4, 14, rgb('#e0703a'), rgb('#6e2410'), rgb('#ffd9a8')), 4, avoid, 120, weights=ew, block=60, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: P.starfish(r, r.uniform(15, 24), rgb('#f08a2e'), rgb('#ffe2a0')), 8, avoid, 90, shadow=(3, 5, 3, 0.35, (0, 0.08, 0.1)), block=28)
    PL.sprinkle(sc, rng, lambda r: P.shell(r, r.uniform(11, 17), rgb('#fbe8d4'), rgb('#c09478')), 8, avoid, 80, shadow=(3, 5, 3, 0.35, (0, 0.08, 0.1)), block=26)
    PL.sprinkle(sc, rng, lambda r: P.pebble(r, r.uniform(3, 7), rgb('#b8c4b8') * r.uniform(0.8, 1.1)), 80,
                (dc1 < hw + 8) | (dc1 > hw + 100), 20, shadow=(2, 3, 2, 0.35, (0, 0.08, 0.1)), block=8)

    PL.finish(sc, rng, vig=0.34, sat=1.12)
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'atlantis.jpg'))
