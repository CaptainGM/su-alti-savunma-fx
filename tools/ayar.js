// Harita dengesi ayar aracı: bir haritanın hpScale ve bossScale değerlerini ızgara olarak dener.
//
//   node tools/ayar.js <harita> <hpScale listesi> <bossScale listesi> [tohum sayısı]
//   node tools/ayar.js batik 0.7,0.8,0.9 0.6,0.8 5
//   OVR='{"countScale":0.9}' node tools/ayar.js buz 0.55 0.5      (başka harita alanlarını da değiştirerek)
//
// Her kombinasyon için 5 tohumla: düzenli oyuncu (karisik) normalde, rastgele oyuncu normalde, düzenli ve akıllı oyuncu zorda.
// Çıktı: kazanma sayıları, son patronun ortalama öldüğü yol yüzdesi ve üsse sızma oranı, ara patronun yol yüzdesi.
process.env.PERKSEL = process.env.PERKSEL || 'R';
const { play } = require('./balans.js');
const path = require('path');
const MAPS = require(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js', 'maps.js'));

const [mapId, hpArg, bossArg, nArg] = process.argv.slice(2);
const base = MAPS.find(m => m.id === mapId);
if (!base) { console.log('harita bulunamadı'); process.exit(1); }
const hps = (hpArg || String(base.hpScale)).split(',').map(Number);
const bosses = (bossArg || String(base.bossScale)).split(',').map(Number);
// OVR='{"countScale":0.9,"startMoney":300}' ile haritanın başka alanları da denenir
const OVR = process.env.OVR ? JSON.parse(process.env.OVR) : {};
const SEEDS = [11, 23, 37, 41, 53, 67, 71, 83].slice(0, +nArg || 5);

const runs = (map, bot, diff) => SEEDS.map(s => play(map, bot, diff, s));
const wins = rs => rs.filter(r => r.result === 'win').length;
const avg = v => (v.length ? Math.round(100 * v.reduce((a, b) => a + b, 0) / v.length) : null);
const fin = rs => rs.flatMap(r => r.bosses.filter(b => !b.mini));
const mini = rs => rs.flatMap(r => r.bosses.filter(b => b.mini));

console.log(`${mapId}: hp boss | normal düzenli rastgele | zor düzenli akıllı | son patron: yol% sızma | ara patron yol%`);
for (const hp of hps) {
    for (const bs of bosses) {
        const map = Object.assign({}, base, { hpScale: hp, bossScale: bs }, OVR);
        const kn = runs(map, 'karisik', 'normal');
        const rn = runs(map, 'rastgele', 'normal');
        const kh = runs(map, 'karisik', 'hard');
        const ah = runs(map, 'akilli', 'hard');
        const f = fin(kn);
        const leak = f.length ? Math.round(100 * f.filter(b => b.leaked).length / f.length) : 0;
        console.log(`${mapId} ${String(hp).padEnd(5)} ${String(bs).padEnd(4)} | ${wins(kn)}/${SEEDS.length} ${wins(rn)}/${SEEDS.length} | ${wins(kh)}/${SEEDS.length} ${wins(ah)}/${SEEDS.length} | ${avg(f.map(b => b.at))}% ${leak}% | ${avg(mini(kn).map(b => b.at))}%`);
    }
}
