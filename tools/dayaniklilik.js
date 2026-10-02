// Dayanıklılık (soak) ve rastgele deneme testi: oyun çekirdeğini uzun süre ve her türlü girdiyle çalıştırıp çökme, NaN,
// sızıntı ve kayıt/devam tutarsızlığı arar.
//
//   node tools/dayaniklilik.js            tüm haritalar, tüm zorluklar
//   node tools/dayaniklilik.js hizli      üç harita (CI)
//
// Bölüm 1 - sonsuz mod: düzenli bot haritayı bitirir, sonsuz moda geçer ve en çok 35 dalga ya da yenilgiye kadar oynar.
//           Her saniye sayılar sonlu mu (NaN/Infinity yok), düşman/mermi/gaz listeleri sınırlı mı denetlenir.
// Bölüm 2 - rastgele girdi: tohumlu rastgele oyuncu kule kurar, yükseltir (her iki yetenekle), satar, hedef kipini değiştirir,
//           dalga başlatır; ara sıra oyun serialize edilip restore ile geri yüklenir ve iki kopya aynı kalmalıdır.
const path = require('path');
const { makeMixBot, makeRandomBot } = require('./balans.js');
const Core = require(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js', 'core.js'));
const MAPS = require(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js', 'maps.js'));

const hizli = process.argv[2] === 'hizli';
const maps = hizli ? MAPS.filter(m => ['mercan', 'volkan', 'cukur'].includes(m.id)) : MAPS;
const zorluklar = hizli ? ['normal'] : ['easy', 'normal', 'hard'];
let sorun = 0;
const bildir = (m) => { sorun++; console.log('   ✗ ' + m); };

function sonluMu(w) {
    const sayilar = [w.health, w.money, w.time, w.wave, ...w.enemies.flatMap(e => [e.x, e.y, e.health, e.traveled, e.speed, e.shield]), ...w.towers.flatMap(t => [t.x, t.y, t.dmg, t.range, t.rate]), ...w.projectiles.flatMap(p => [p.x, p.y])];
    return sayilar.every(Number.isFinite);
}

// ---------------------------------------------------------------- 1. sonsuz mod
for (const map of maps) {
    for (const diff of zorluklar) {
        const w = new Core.World(map, { difficulty: diff, seed: 77 });
        const bot = makeMixBot(true);
        let t = 0;
        let sonrakiKontrol = 0;
        let enCokDusman = 0;
        let enCokMermi = 0;
        let hata = null;
        try {
            while (t < 5400 && !(w.endless && w.wave >= 35)) {
                if (t >= sonrakiKontrol) {
                    bot(w);
                    if (w.enemies.length === 0 && w.canStartWave()) w.startWave();
                    sonrakiKontrol = t + 0.5;
                    if (!sonluMu(w)) { hata = `sayılar sonlu değil (t=${t.toFixed(0)}, dalga ${w.wave})`; break; }
                    enCokDusman = Math.max(enCokDusman, w.enemies.length);
                    enCokMermi = Math.max(enCokMermi, w.projectiles.length);
                }
                w.update(1 / 30);
                t += 1 / 30;
                if (w.result === 'win' && !w.endless) w.goEndless();
                if (w.result === 'lose') break;
            }
        } catch (e) {
            hata = 'istisna: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' / ');
        }
        const ozet = `${map.id.padEnd(9)} ${diff.padEnd(6)} dalga ${String(w.wave).padStart(2)} ${w.result || 'sürüyor'}  en çok düşman ${String(enCokDusman).padStart(3)} mermi ${String(enCokMermi).padStart(3)}  gaz ${w.gas.length}`;
        console.log(ozet);
        if (hata) bildir(`${map.id}/${diff}: ${hata}`);
        if (enCokDusman > 400) bildir(`${map.id}/${diff}: düşman sayısı kontrolsüz büyüyor (${enCokDusman})`);
        if (enCokMermi > 400) bildir(`${map.id}/${diff}: mermi sayısı kontrolsüz büyüyor (${enCokMermi})`);
        if (w.gas.length > 14) bildir(`${map.id}/${diff}: gaz bulutu sınırı aşıldı (${w.gas.length})`);
        if (!w.endless && w.result !== 'lose' && w.wave < w.totalWaves) bildir(`${map.id}/${diff}: oyun beklenenden erken durdu`);
    }
}

// ---------------------------------------------------------------- 2. rastgele girdi ve kayıt/devam
function ozetle(w) {
    return JSON.stringify({ h: Math.round(w.health * 100), m: w.money, wv: w.wave, tw: w.towers.map(t => [t.id, t.type, t.level, Math.round(t.x), t.mode, JSON.stringify(t.perks)]), en: w.enemies.length });
}

for (const map of maps) {
    for (const seed of hizli ? [3] : [3, 9]) {
        const w = new Core.World(map, { difficulty: 'normal', seed });
        const rng = Core.mulberry32(seed * 977 + 5);
        const pick = a => a[Math.floor(rng() * a.length)];
        let t = 0;
        let hata = null;
        let kontrol = 0;
        try {
            while (t < 900 && !w.result) {
                if (rng() < 0.08) {
                    const eylem = rng();
                    if (eylem < 0.45) {
                        const bos = w.spots.filter(s => !s.tower);
                        if (bos.length) w.placeTower(pick(w.available), pick(bos));
                    } else if (eylem < 0.75 && w.towers.length) {
                        w.upgradeTower(pick(w.towers), rng() < 0.5 ? 0 : 1);
                    } else if (eylem < 0.82 && w.towers.length > 3) {
                        w.sellTower(pick(w.towers));
                    } else if (eylem < 0.92 && w.towers.length) {
                        const tw = pick(w.towers);
                        tw.mode = pick(Core.TARGET_MODES);
                    } else if (w.canStartWave()) {
                        w.startWave();
                    }
                }
                if (w.enemies.length === 0 && rng() < 0.05 && w.canStartWave()) w.startWave();
                w.money = Math.max(w.money, 0) + (rng() < 0.01 ? 60 : 0);
                w.update(1 / 30);
                t += 1 / 30;
                if (t >= kontrol) {
                    kontrol = t + 20;
                    if (!sonluMu(w)) { hata = `sayılar sonlu değil (t=${t.toFixed(0)})`; break; }
                    // kaydet -> geri yükle -> iki kopya aynı kalmalı
                    const snap = JSON.parse(JSON.stringify(w.serialize()));
                    const kopya = Core.World.restore(map, snap, {});
                    if (ozetle(kopya) !== ozetle(w).replace(/"en":\d+/, `"en":${kopya.enemies.length}`)) { hata = `kayıt/devam tutarsız (t=${t.toFixed(0)})\n   ${ozetle(w)}\n   ${ozetle(kopya)}`; break; }
                    for (let i = 0; i < 90; i++) kopya.update(1 / 30);          // geri yüklenen oyun da çalışmaya devam eder
                    if (!sonluMu(kopya)) { hata = 'geri yüklenen oyunda sayılar sonlu değil'; break; }
                }
            }
        } catch (e) {
            hata = 'istisna: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' / ');
        }
        console.log(`rastgele ${map.id.padEnd(9)} tohum ${seed}  dalga ${w.wave} ${w.result || 'sürüyor'}  kule ${w.towers.length}`);
        if (hata) bildir(`${map.id}/rastgele ${seed}: ${hata}`);
    }
}

console.log(sorun ? `\n${sorun} sorun bulundu` : '\nDAYANIKLILIK TESTİ TEMİZ');
process.exit(sorun ? 1 : 0);
