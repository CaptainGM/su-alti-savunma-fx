"""Mangrov Deltası: bataklık çamuru ve yosun, bulanık su kolları, mangrov ağaçları. Nehir üç kola ayrılır."""
import numpy as np

import abyss_props as AP
import common as C
import mangrove_props as MP
import pipeline as PL
import props as P
import specs as S
from abyss import glow_stamp
from common import H, K, PH, PW, W, rgb, smoothstep

SPOTS = [
    (410, 278, 'normal'), (974, 710, 'normal'), (590, 602, 'normal'), (806, 386, 'normal'), (1094, 746, 'normal'),
    (530, 434, 'normal'), (878, 566, 'normal'), (842, 830, 'normal'), (278, 290, 'normal'), (158, 242, 'high'),
    (482, 122, 'normal'), (1160, 560, 'high'),
]
MUD_EDGE = rgb('#2a1e12')


def build(out_path):
    rng = np.random.default_rng(8808)
    dc, smooth = C.centerline_dist([S.MANGROVE_LEFT, S.MANGROVE_MID, S.MANGROVE_RIGHT])
    dc1 = C.logic(dc)
    hw = 40
    yy, xx = C.grid()

    # --- bulanık su (kanallar) tabanı
    base = C.gradient_bg(rgb('#3d6e5a'), rgb('#254c40'))
    sc = C.Scene(base)
    wv = C.fbm(H, W, 80, rng, 3)
    sc.blend(rgb('#5a8a62'), np.clip((wv - 0.5) * 2.4, 0, 1) * 0.45)
    sc.blend(rgb('#1a3a30'), np.clip((0.47 - wv) * 2.6, 0, 1) * 0.55)
    ripple = np.sin((xx * 0.9 + yy * 0.4) * 0.12 + C.fbm(H, W, 30, rng, 2) * 8) * 0.5 + 0.5
    sc.multiply(1 + (ripple - 0.5) * 0.06)
    sc.add(rgb('#c8f0d0'), PL.caustics_layer(rng, 0.12, 20))

    # --- kara: yosunlu çamur
    keep = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(keep, x, y, 76)
    keep_hi = np.kron(keep, np.ones((K, K), bool))[:PH, :PW]
    wob = (C.fbm(H, W, 26, rng, 3) - 0.5) * 2
    d = dc - (hw + wob * 8)
    chan = smoothstep(0.8, -0.8, d)
    ponds = smoothstep(0.72, 0.74, C.fbm(H, W, 55, rng, 3)) * smoothstep(70, 120, dc) * (~keep_hi)
    land = np.clip((1 - chan) * (1 - ponds), 0, 1)

    m1 = C.fbm(H, W, 45, rng, 3)
    moss = C.fbm(H, W, 6, rng, 4)
    mud = rgb('#6a4f30')[None, None, :]
    grass = rgb('#4d8a3e')[None, None, :]
    mixv = np.clip((m1 - 0.4) * 2.2, 0, 1)[..., None]
    land_col = mud * (1 - mixv) + grass * mixv
    land_col = land_col * (0.8 + 0.4 * moss[..., None]) * (1 + 0.05 * C.noise(H, W, 0.6, rng)[..., None])
    # çim kıllarına benzeyen ince çizgiler
    blades = np.clip(C.noise(H, W, 0.9, rng) - 1.4, 0, 1) * mixv[..., 0]
    land_col = land_col + blades[..., None] * 0.25
    # yağmur birikintileri
    puddle = smoothstep(0.63, 0.66, C.fbm(H, W, 14, rng, 3)) * (~keep_hi)
    land_col = land_col * (1 - puddle[..., None] * 0.5) + rgb('#3a5a50')[None, None, :] * puddle[..., None] * 0.5

    # bank: koyu çamur şeridi + ıslak parlama
    bank = np.clip(C.blur(land, 4) - land * 0.5, 0, 1)
    wet = smoothstep(7, 0, dc - hw - wob * 8) * land
    land_col = land_col * (1 - wet[..., None] * 0.3)
    shd = np.roll(np.roll(land, 3 * K, axis=0), 3 * K, axis=1)
    sc.multiply(1 - np.clip(shd - land, 0, 1) * 0.35)
    sc.blend(land_col, land)
    outline = np.clip(np.abs(land - C.blur(land, 1.2)) * 3.2, 0, 1)
    sc.blend(MUD_EDGE, outline * 0.8)

    # --- kule zeminleri: ahşap platform / kütük tabanı
    PL.spot_pads(sc, rng, SPOTS, '#7a5a34', '#4d3820', high_base='#a8803a')

    # --- nesneler
    land1 = C.logic(land) > 0.6
    avoid = (~land1) | (dc1 < hw + 22)
    for x, y, _ in SPOTS:
        PL.disk(avoid, x, y, 70)
    wide = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(wide, x, y, 125)
    ew = PL.edge_weights(1.0, 0.3)
    sh = (5, 8, 6, 0.40, (0.02, 0.06, 0.03))

    PL.sprinkle(sc, rng, lambda r: MP.mangrove_tree(r, r.uniform(34, 62)), 13, avoid, 125, weights=ew, block=62, keepout=wide, shadow=(6, 10, 7, 0.40, (0.02, 0.08, 0.03)))
    PL.sprinkle(sc, rng, lambda r: P.tuft(r, int(r.integers(9, 14)), r.uniform(38, 60), r.uniform(4, 6),
                                          rgb('#3a6a2a'), rgb('#9fcf4a'), rgb('#e8ffb0'), spread=0.8), 38, avoid, 60, weights=np.clip(ew * 1.3, 0, 1), shadow=(3, 5, 3, 0.3, (0, 0.08, 0.04)), block=26)
    PL.sprinkle(sc, rng, lambda r: MP.log(r, r.uniform(70, 120), r.uniform(9, 13)), 7, avoid, 110, weights=ew, block=50, shadow=sh, keepout=wide)
    PL.sprinkle(sc, rng, lambda r: MP.mushroom(r, r.uniform(8, 13)), 14, avoid, 80, weights=ew, block=24, shadow=(2, 3, 2, 0.3, (0, 0.05, 0.02)))
    PL.sprinkle(sc, rng, lambda r: MP.frog(r, r.uniform(16, 22)), 5, avoid, 120, weights=ew, block=40, shadow=(3, 4, 3, 0.3, (0, 0.05, 0.02)))
    PL.sprinkle(sc, rng, lambda r: P.rock(r, r.uniform(12, 28), rgb('#6e6a58') * r.uniform(0.85, 1.1), moss=rgb('#3f8f4a')), 14, avoid, 70, weights=ew, block=34, shadow=sh)
    # suya taşan nilüferler: kanal kenarında
    lily_avoid = (dc1 < hw - 2) | (dc1 > hw + 36) | (C.logic(land) > 0.0) * (dc1 > hw + 6)
    water_edge = (dc1 > hw - 12) & (dc1 < hw + 3)
    pts = C.scatter_points(rng, 34, ~water_edge, 24)
    for lx, ly in pts:
        sc.stamp(MP.lily(rng, rng.uniform(10, 17), flower=rng.random() < 0.3), lx, ly, shadow=(2, 3, 2, 0.28, (0, 0.06, 0.03)))
    PL.sprinkle(sc, rng, lambda r: P.pebble(r, r.uniform(3, 6), rgb('#8a8a70') * r.uniform(0.8, 1.1)), 60,
                (dc1 < hw + 8) | (dc1 > hw + 90), 20, shadow=(2, 3, 2, 0.35, (0, 0.04, 0.02)), block=8)

    # ateşböcekleri (parıltılı noktalar)
    for _ in range(90):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(1.2, 2.6)
        wnd = 30
        y0_, y1_, x0_, x1_ = max(0, int((y - wnd) * K)), min(PH, int((y + wnd) * K)), max(0, int((x - wnd) * K)), min(PW, int((x + wnd) * K))
        sub = np.sqrt((xx[y0_:y1_, x0_:x1_] - x) ** 2 + (yy[y0_:y1_, x0_:x1_] - y) ** 2)
        sc.img[y0_:y1_, x0_:x1_] += rgb('#e8ff7a')[None, None, :] * (np.exp(-(sub / (r * 1.5)) ** 2) * 0.9 + np.exp(-(sub / (r * 5)) ** 2) * 0.14)[..., None]

    PL.finish(sc, rng, vig=0.42, sat=1.12, tint=(1.0, 1.02, 0.96))
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'mangrov.jpg'))
