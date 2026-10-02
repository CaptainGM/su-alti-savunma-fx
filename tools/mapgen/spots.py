"""Kule yerlerini yolun etrafına, gerçekten işe yarayacak biçimde ve dengeli dağıtır.

    python tools/mapgen/spots.py             rapor yazar ve tools/mapgen/spots_preview/ altına önizleme çizer
    python tools/mapgen/spots.py --write     maps.js içindeki buildSpots listelerini günceller

Kurallar:
  - Yer, yolun kenarından en az SPOT_R + CLEAR uzakta olmalı: halka yola değmez (ROAD_HALF haritaya göre).
  - Normal yer yola en çok NORMAL_MAX, yüksek zemin (menzil %20 artar) en çok HIGH_MAX uzakta olabilir.
  - Her yer, en kısa menzilli kuleyle (200 piksel) yolun en az MIN_COVER pikselini kapsamalı: yani oraya konan kule
    gerçekten geçen düşmanlara ulaşır. Yola yetişmeyen "boşluk doldurma" yerleri yoktur.
  - Mevcut (elle yerleştirilmiş) yerlerden bu kurallara uyanlar korunur, uymayanlar silinir.
  - Yola yakın bölgelerde HOLE'den büyük boşluk kalmayana kadar en uygun noktalara yeni yer eklenir; viraj içleri gibi
    yolu çok kapsayan noktalar tercih edilir ve arka planın en karmaşık bölgelerinden kaçınılır.
"""
import json
import os
import re
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', '..', 'src', 'main', 'resources', 'web')
MAPS_JS = os.path.join(WEB, 'js', 'maps.js')

W, H = 1350, 900
# Yolun (kum şeridi, nehir, buz kanalı) merkez çizgisinden kenarına uzaklığı maps.js içinde `roadHalf` olarak durur;
# arka planların üstüne merkez çizgisinden 40/55/70/85/100/120 piksellik konturlar çizilip gözle okunmuştur.
# Kule halkası (yarıçap 55) yola değmesin diye yerler en az roadHalf + SPOT_R + CLEAR uzakta olmalı.
# `padSpots` olan haritada (Girdap) yerler resimdeki taş kaidelerdir ve olduğu gibi korunur.
SPOT_R = 55
CLEAR = 8
NORMAL_MAX = 190       # normal yer için yola en çok uzaklık
HIGH_MAX = 240         # yüksek zemin için (menzil x1.2)
SHORTEST_RANGE = 200   # en kısa menzilli kule (Ahtapot 210, Deniz Anası 200, Fener 200)
HIGH_RANGE = 1.2
MIN_COVER = 150        # yer, en kısa menzille yolun en az bu kadar pikselini kapsamalı
MIN_GAP = 124          # iki kule arası (kule yarıçapı 55)
HOLE = 168             # yola yakın bir noktanın en yakın yere uzaklığı bundan büyükse boşluk sayılır
MARGIN_X, MARGIN_TOP, MARGIN_BOTTOM = 70, 78, 70
KEEP_OUT = 96          # koruyucu baş / hazine sandığı çevresi


def load_maps():
    js = ("const M=require(%s);console.log(JSON.stringify(M.map(m=>({id:m.id,paths:m.paths||[m.pathPoints],"
          "spots:m.buildSpots,roadHalf:m.roadHalf,padSpots:!!m.padSpots,bg:m.bg,guardians:m.guardians||[],treasure:m.treasure||null}))))" % json.dumps(os.path.abspath(MAPS_JS)))
    out = subprocess.check_output(['node', '-e', js])
    return json.loads(out.decode('utf-8'))


def catmull(points, per=20):
    pts = [np.array([p['x'], p['y']], float) for p in points]
    out = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(len(pts) - 1, i + 2)]
        for j in range(per):
            t = j / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return np.array(out)


def segments(paths):
    """Yolların küçük parçalarının orta noktaları ve uzunlukları."""
    mids, lens = [], []
    for p in paths:
        pts = catmull(p)
        d = np.diff(pts, axis=0)
        mids.append((pts[:-1] + pts[1:]) / 2)
        lens.append(np.hypot(d[:, 0], d[:, 1]))
    return np.vstack(mids), np.concatenate(lens)


def path_dist(mids, xs, ys):
    out = np.full(xs.shape, 1e9)
    for mx, my in mids:
        out = np.minimum(out, np.hypot(xs - mx, ys - my))
    return out


def cover(mids, lens, xs, ys, r):
    """(xs, ys) noktasından r menzille yolun kaç pikselinin görüldüğü."""
    out = np.zeros(xs.shape)
    for (mx, my), ln in zip(mids, lens):
        out += ln * (np.hypot(xs - mx, ys - my) <= r)
    return out


def busyness(m):
    """Arka planın karmaşıklığı (yerel standart sapma): iskelet, büyük kristal öbekleri gibi yerlerden kaçınmak için."""
    from PIL import Image
    from scipy.ndimage import uniform_filter
    g = np.asarray(Image.open(os.path.join(WEB, m['bg'])).convert('L').resize((W, H)), float)
    mean = uniform_filter(g, 57)
    var = np.maximum(0, uniform_filter(g * g, 57) - mean * mean)
    return np.sqrt(var)


def classify(mids, lens, x, y, min_path):
    """Bir noktanın uygun olup olmadığı ve türü: (geçerli mi, 'normal' ya da 'high')."""
    xs, ys = np.array([float(x)]), np.array([float(y)])
    d = path_dist(mids, xs, ys)[0]
    if d < min_path or d > HIGH_MAX:
        return False, None
    kind = 'normal' if d <= NORMAL_MAX else 'high'
    r = SHORTEST_RANGE * (HIGH_RANGE if kind == 'high' else 1)
    if cover(mids, lens, xs, ys, r)[0] < MIN_COVER:
        return False, None
    return True, kind


def solve(m):
    min_path = m['roadHalf'] + SPOT_R + CLEAR
    mids, lens = segments(m['paths'])
    busy = busyness(m)
    gx, gy = np.meshgrid(np.arange(MARGIN_X, W - MARGIN_X + 1, 9.0), np.arange(MARGIN_TOP, H - MARGIN_BOTTOM + 1, 9.0))
    d_path = path_dist(mids, gx, gy)
    cov_n = cover(mids, lens, gx, gy, SHORTEST_RANGE)
    cov_h = cover(mids, lens, gx, gy, SHORTEST_RANGE * HIGH_RANGE)
    busy_at = busy[gy.astype(int), gx.astype(int)]

    near_ok = (d_path >= min_path) & (d_path <= NORMAL_MAX) & (cov_n >= MIN_COVER)
    far_ok = (d_path > NORMAL_MAX) & (d_path <= HIGH_MAX) & (cov_h >= MIN_COVER)
    ok = near_ok | far_ok
    for g in m['guardians']:
        ok &= np.hypot(gx - g['x'], gy - g['y']) >= KEEP_OUT
    if m['treasure']:
        ok &= np.hypot(gx - m['treasure']['x'], gy - m['treasure']['y']) >= KEEP_OUT
    ok &= ~((gx < 190) & (gy < 80)) & ~((gx > 1130) & (gy < 80))    # arayüz düğmelerinin altı
    calm_limit = np.percentile(busy_at[ok], 92)
    ok &= busy_at <= calm_limit

    # mevcut yerlerden uygun olanları koru; yola uzak olanın türünü yüksek zemin yap
    spots, dropped = [], []
    for s in m['spots']:
        valid, kind = classify(mids, lens, s['x'], s['y'], 70 if m['padSpots'] else min_path)
        if not valid:
            dropped.append(s)
            continue
        ns = {'x': s['x'], 'y': s['y']}
        if kind == 'high' or s.get('kind') == 'high':
            ns['kind'] = 'high'
        spots.append(ns)

    # yola yakın bölgelerde boşluk kalmayana kadar yeni yer ekle
    band = (d_path >= min_path - 20) & (d_path <= HIGH_MAX) & (np.maximum(cov_n, cov_h) >= MIN_COVER)
    for _ in range(80):
        near = np.full(gx.shape, 1e9)
        for s in spots:
            near = np.minimum(near, np.hypot(gx - s['x'], gy - s['y']))
        hole = band & (near > HOLE)
        cand = ok & (near >= HOLE)
        if not (cand & hole).any() and not (ok & hole & (near >= MIN_GAP + 20)).any():
            break
        use = cand | (ok & hole & (near >= MIN_GAP + 20))
        score = near + 0.10 * np.where(d_path <= NORMAL_MAX, cov_n, cov_h) - 1.6 * busy_at - 0.25 * np.abs(d_path - 130)
        score = np.where(use & hole, score, -1e9)
        j = np.unravel_index(np.argmax(score), score.shape)
        if score[j] <= -1e8:
            break
        s = {'x': int(round(gx[j])), 'y': int(round(gy[j]))}
        if d_path[j] > NORMAL_MAX:
            s['kind'] = 'high'
        spots.append(s)
    return spots, dropped, mids


def spot_text(spots, per_line=3):
    items = [('{ x: %d, y: %d%s }' % (s['x'], s['y'], ", kind: 'high'" if s.get('kind') == 'high' else '')) for s in spots]
    lines = [', '.join(items[i:i + per_line]) + ',' for i in range(0, len(items), per_line)]
    return '\n'.join('                ' + ln for ln in lines)


def preview(m, spots, dropped, folder):
    from PIL import Image, ImageDraw
    bg = Image.open(os.path.join(WEB, m['bg'])).convert('RGB').resize((W, H))
    d = ImageDraw.Draw(bg, 'RGBA')
    for p in m['paths']:
        for x, y in catmull(p)[::6]:
            d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255, 160))
    old = {(s['x'], s['y']) for s in m['spots']}
    for s in dropped:
        d.ellipse([s['x'] - 28, s['y'] - 28, s['x'] + 28, s['y'] + 28], outline=(255, 40, 40, 255), width=4)
        d.line([s['x'] - 24, s['y'] - 24, s['x'] + 24, s['y'] + 24], fill=(255, 40, 40, 255), width=4)
    for s in spots:
        new = (s['x'], s['y']) not in old
        col = (255, 215, 60, 200) if s.get('kind') == 'high' else (80, 255, 170, 200)
        r = SPOT_R   # gerçek halka yarıçapı
        d.ellipse([s['x'] - r, s['y'] - r, s['x'] + r, s['y'] + r], outline=(255, 255, 255, 255) if new else col, width=3, fill=col[:3] + (60,))
    os.makedirs(folder, exist_ok=True)
    bg.convert('RGB').resize((900, 600)).save(os.path.join(folder, m['id'] + '.jpg'), quality=82)


def main():
    write = '--write' in sys.argv
    maps = load_maps()
    text = open(MAPS_JS, encoding='utf-8').read()
    folder = os.path.join(HERE, 'spots_preview')
    for m in maps:
        spots, dropped, _ = solve(m)
        print('%-9s yer %2d -> %2d  (silinen %d, eklenen %d)' % (m['id'], len(m['spots']), len(spots), len(dropped), len(spots) - (len(m['spots']) - len(dropped))))
        if not write:
            preview(m, spots, dropped, folder)
            continue
        pat = re.compile(r"(id: '%s',.*?buildSpots: \[\n).*?(\n            \],)" % m['id'], re.S)
        if not pat.search(text):
            print('  buildSpots bulunamadi')
            continue
        text = pat.sub(lambda mm: mm.group(1) + spot_text(spots) + mm.group(2), text, count=1)
    if write:
        open(MAPS_JS, 'w', encoding='utf-8', newline='\n').write(text)


if __name__ == '__main__':
    main()
