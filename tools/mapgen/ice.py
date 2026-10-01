"""Buz Koyu: koyu su kanalı, beyaz buz plakaları, buzdağları ve penguenler. İki kanal ortada çapraz geçer (X)."""
import numpy as np

import common as C
import ice_props as IP
import pipeline as PL
import props as P
import specs as S
from common import H, K, W, rgb, smoothstep

SPOTS = [
    (675, 350, 'normal'), (495, 446, 'normal'), (855, 446, 'normal'), (675, 556, 'normal'),
    (560, 625, 'normal'), (790, 625, 'normal'), (242, 290, 'normal'), (1108, 290, 'normal'),
    (170, 62, 'high'), (1180, 62, 'high'), (340, 800, 'normal'), (1010, 800, 'normal'),
    (182, 746, 'high'), (1168, 746, 'high'),
]
ICE_EDGE = rgb('#16456a')


def build(out_path):
    rng = np.random.default_rng(5505)
    dc, smooth = C.centerline_dist([S.ICE_L, S.ICE_R])
    dc1 = C.logic(dc)
    hw = 42
    yy, xx = C.grid()

    # --- koyu su (yolun olduğu yer) ve zemin
    base = C.gradient_bg(rgb('#0b4468'), rgb('#06263f'))
    sc = C.Scene(base)
    var = C.fbm(H, W, 120, rng, 3)
    sc.blend(rgb('#127aa0'), np.clip((var - 0.5) * 2.4, 0, 1) * 0.5)
    sc.blend(rgb('#031a30'), np.clip((0.46 - var) * 2.6, 0, 1) * 0.6)
    sc.add(rgb('#a8e8ff'), PL.caustics_layer(rng, 0.20, 22))

    # --- buz maskesi
    keep = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(keep, x, y, 76)
    keep_hi = np.kron(keep, np.ones((K, K), bool))[:C.PH, :C.PW]
    wob = (C.fbm(H, W, 24, rng, 3) - 0.5) * 2
    d = dc - (hw + wob * 7)
    chan = smoothstep(0.7, -0.7, d)
    crack_line = smoothstep(0.68, 0.82, C.ridged(H, W, 20, rng, 3))
    pools = np.zeros_like(dc)   # dağınık gölcükler yol gibi okunuyordu, kaldırıldı
    crack_line = crack_line * (~keep_hi)
    pools = pools * (~keep_hi)
    ice = np.clip((1 - chan) * (1 - crack_line * 0.95) * (1 - pools), 0, 1)

    # buz plakasının yan duvarı (kalınlık): aşağı-sağa kaymış kopya
    shifted = np.roll(np.roll(ice, 9 * K, axis=0), 5 * K, axis=1)
    wall = np.clip(shifted - ice, 0, 1)
    t = np.clip((yy - 0) / H, 0, 1)[..., None]
    wall_col = rgb('#58cfe4')[None, None, :] * (1 - 0.0 * t)
    wall_col = wall_col * (0.75 + 0.25 * C.fbm(H, W, 6, rng, 2)[..., None])
    sc.blend(wall_col, wall)
    # suya yayılan açık mavi ışıma
    glow = np.clip(C.blur(ice, 10) - ice, 0, 1)
    sc.add(rgb('#4fd0f0'), glow * 0.30)

    # --- buz yüzeyi
    v1 = C.fbm(H, W, 40, rng, 3)
    snow = C.fbm(H, W, 6, rng, 3)
    top = rgb('#eaf6fc')[None, None, :] * (1 - v1[..., None] * 0.35) + rgb('#b4daf0')[None, None, :] * (v1[..., None] * 0.35)
    top = top * (0.94 + 0.10 * snow[..., None]) * (1 + 0.025 * C.noise(H, W, 0.6, rng)[..., None])
    sparkle = (C.noise(H, W, 0.7, rng) > 2.3).astype(np.float32)
    top = top + sparkle[..., None] * 0.25
    # ince çatlak çizgileri
    micro = smoothstep(0.7, 0.9, C.ridged(H, W, 7, rng, 3)) * 0.22
    top = top * (1 - micro[..., None]) + rgb('#6fa8cc')[None, None, :] * micro[..., None]
    # ışık: kenarlarda yükseklik eğimi
    height = C.blur(ice, 4)
    gy, gx = np.gradient(height)
    mag = np.sqrt(gx * gx + gy * gy) + 1e-9
    lam = (-(gx * -0.6 + gy * -0.8) / mag) * np.clip(mag * 18 * K, 0, 1)
    top = top * (1 - 0.18 * np.clip(-lam, 0, 1)[..., None]) + (1 - top) * 0.55 * np.clip(lam, 0, 1)[..., None]
    sc.blend(top, ice)
    # buz kenar çizgisi
    outline = np.clip(np.abs(ice - C.blur(ice, 1.1)) * 3.4, 0, 1)
    sc.blend(ICE_EDGE, outline * 0.85)
    # su içinde köpük/çamur: kanalın kenarında
    foam = np.clip(C.blur(ice, 3) - ice * 0.9, 0, 1) * chan
    sc.add(rgb('#dff6ff'), foam * 0.35)

    # --- kule zeminleri
    PL.spot_pads(sc, rng, SPOTS, '#8fb8d2', '#f4fbff', high_base='#d9c98a')

    # --- nesneler (buz üstü)
    ice1 = C.logic(ice) > 0.6
    avoid = (~ice1) | (dc1 < hw + 22)
    for x, y, _ in SPOTS:
        PL.disk(avoid, x, y, 70)
    wide = np.zeros((H, W), bool)
    for x, y, _ in SPOTS:
        PL.disk(wide, x, y, 120)
    ew = PL.edge_weights(1.1, 0.25)
    sh = (5, 8, 6, 0.28, (0.05, 0.15, 0.3))

    PL.sprinkle(sc, rng, lambda r: IP.iceberg(r, r.uniform(36, 66)), 11, avoid, 120, weights=ew, block=60, keepout=wide, shadow=sh)
    PL.sprinkle(sc, rng, lambda r: IP.snow_mound(r, r.uniform(14, 30)), 30, avoid, 60, weights=ew, block=26, shadow=(3, 5, 4, 0.22, (0.1, 0.25, 0.4)))
    PL.sprinkle(sc, rng, lambda r: IP.ice_crystals(r, r.uniform(26, 44), count=int(r.integers(3, 6))), 12, avoid, 80, weights=ew, block=40, keepout=wide, shadow=sh)
    PL.sprinkle(sc, rng, lambda r: P.rock(r, r.uniform(14, 32), rgb('#5d7186') * r.uniform(0.85, 1.1), moss=None), 12, avoid, 70, weights=ew, block=36, shadow=sh)
    # penguen grupları
    groups = C.scatter_points(rng, 6, avoid | wide, 130, weights=ew)
    for gx0, gy0 in groups:
        for _ in range(int(rng.integers(2, 5))):
            px, py = gx0 + rng.uniform(-34, 34), gy0 + rng.uniform(-22, 22)
            sc.stamp(IP.penguin(rng, rng.uniform(26, 34)), px, py, shadow=(3, 5, 3, 0.3, (0.05, 0.15, 0.3)))
        PL.disk(avoid, gx0, gy0, 60)
    # kanal kenarında yüzen buz parçaları
    PL.sprinkle(sc, rng, lambda r: P.pebble(r, r.uniform(4, 9), rgb('#dff2fb')), 40,
                (dc1 > hw + 4) | (dc1 < hw - 26), 24, shadow=(2, 3, 2, 0.35, (0.0, 0.08, 0.18)), block=10)

    PL.finish(sc, rng, vig=0.32, sat=1.08, tint=(0.98, 1.0, 1.03))
    sc.save(out_path)


if __name__ == '__main__':
    import os
    build(os.path.join(C.ASSETS, 'maps', 'buz.jpg'))
