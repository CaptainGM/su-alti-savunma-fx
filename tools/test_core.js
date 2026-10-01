// Oyun çekirdeği için hızlı denetimler (tarayıcı gerekmez):  node tools/test_core.js
const path = require('path');
const web = path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js');
const Core = require(path.join(web, 'core.js'));
const MAPS = require(path.join(web, 'maps.js'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const mapOf = id => MAPS.find(m => m.id === id);
const mk = (id, opts) => new Core.World(mapOf(id), Object.assign({ seed: 1 }, opts));

// harita verisi
MAPS.forEach(m => {
    ok(m.buildSpots.length >= 10 && m.paths.length >= 1, `${m.id}: yol ve kule yerleri var`);
    ok(m.towers.every(t => Core.TOWER_TYPES[t]), `${m.id}: kule türleri geçerli`);
    ok(Core.BOSS_KINDS[m.boss], `${m.id}: patron türü geçerli`);
    ok(m.towers.filter(t => !Core.TOWER_TYPES[t].groundOnly && !Core.TOWER_TYPES[t].support).length >= 2, `${m.id}: en az iki kule havayı vurabiliyor`);
});

// kule fiyatı her alımda artar, harita dışı kule alınamaz
let w = mk('mercan');
w.money = 9999;
const c1 = w.towerCost('octopus');
w.placeTower('octopus', w.spots[0]);
ok(w.towerCost('octopus') > c1, 'aynı türden kule pahalanır');
ok(w.placeTower('angler', w.spots[1]).reason === 'unavailable', 'haritada olmayan kule alınamaz');

// destek kulesi: menzildeki kuleye bonus verir
w = mk('yosun');
w.money = 9999;
const o = w.placeTower('octopus', w.spots[3]).tower;
const base = o.dmg;
const a = w.placeTower('angler', w.spots[4]).tower;
const near = Math.hypot(a.x - o.x, a.y - o.y) <= a.range;
ok(near ? o.dmg > base : o.dmg === base, `fener balığı etkisi (mesafe ${Math.round(Math.hypot(a.x - o.x, a.y - o.y))}, alan ${a.range})`);
w.sellTower(a);
ok(o.dmg === base, 'destek kulesi satılınca bonus kalkar');

// zorluk gerçekten bir şeyleri değiştiriyor
const easy = mk('mercan', { difficulty: 'easy' });
const hard = mk('mercan', { difficulty: 'hard' });
ok(easy.money > hard.money && easy.health > hard.health, 'başlangıç enerjisi ve üs canı zorluğa göre değişir');
const e1 = new Core.Enemy(easy, 'standard', 0, 1, 3, {});
const e2 = new Core.Enemy(hard, 'standard', 0, 1, 3, {});
ok(e2.maxHealth > e1.maxHealth && e2.speed > e1.speed, 'düşman canı ve hızı zorluğa göre değişir');
ok(easy.waveBonus(3) > hard.waveBonus(3), 'dalga bonusu zorluğa göre değişir');

// Balon Balığı havan: yere düşünce alan hasarı verir
w = mk('yosun');
w.money = 9999;
const pf = w.placeTower('puffer', w.spots[3]).tower;
w.startWave();
let splashed = false;
w.onEvent = (t) => { if (t === 'splash') splashed = true; };
for (let i = 0; i < 900 && !splashed; i++) w.update(1 / 30);
ok(splashed, 'balon balığı patlaması gerçekleşti');

// Yavru Anası yarı canda yavru saçar
w = mk('yosun');
const mother = new Core.Enemy(w, 'boss', 0, 99, 10, { kind: 'brood', hpMul: 1 });
w.enemies.push(mother);
let brood = 0;
w.onEvent = (t, d) => { if (t === 'brood') brood = d.count; };
mother.health = mother.maxHealth * 0.4;
w.afterHit(mother, w.spots[0] && { type: 'octopus' }, { dmg: 1, dead: false }, false);
ok(brood === 8 && w.enemies.length === 9, 'yavru anası yavru saçtı');

// patron çeşitleri
const manta = new Core.Enemy(mk('girdap'), 'boss', 0, 1, 10, { kind: 'manta' });
const crab = new Core.Enemy(mk('batik'), 'boss', 0, 1, 10, { kind: 'crab' });
ok(manta.flying && !crab.flying && crab.armor > manta.armor && crab.heavy, 'patron türleri farklı davranır');

// dalga planı belirleyici ve sürekli
const p1 = JSON.stringify(Core.buildWavePlan(mapOf('cukur'), 5, 7));
const p2 = JSON.stringify(Core.buildWavePlan(mapOf('cukur'), 5, 7));
ok(p1 === p2, 'dalga planı aynı tohumla aynı çıkar');

// ---- haritaya özel mekanikler
const runUntil = (w, cond, maxSec) => { for (let i = 0; i < maxSec * 30 && !cond(); i++) w.update(1 / 30); return cond(); };

// yosun: yavaşlatma bölgesinde düşman daha az yol alır
w = mk('yosun');
const zoned = new Core.Enemy(w, 'standard', 0, 1, 1, {});
const plain = new Core.Enemy(mk('mercan'), 'standard', 0, 1, 1, {});
zoned.traveled = zoned.path.length * 0.25; plain.traveled = plain.path.length * 0.25;
const z0 = zoned.traveled, p0 = plain.traveled;
zoned.update(1); plain.update(1);
ok((zoned.traveled - z0) < (plain.traveled - p0) * 0.75, 'yosun yatağında düşman yavaşlıyor');

// girdap: yolun sonunda düşman hızlanır
w = mk('girdap');
const early = new Core.Enemy(w, 'standard', 0, 1, 1, {});
const late = new Core.Enemy(w, 'standard', 0, 2, 1, {});
early.traveled = early.path.length * 0.2; late.traveled = late.path.length * 0.9;
const e0 = early.traveled, l0 = late.traveled;
early.update(1); late.update(1);
ok((late.traveled - l0) > (early.traveled - e0) * 1.25, 'girdabın çekimi yolun sonunda hızlandırıyor');

// volkan: patlama düşmana hasar verir, yakındaki kuleyi susturur
w = mk('volkan');
w.money = 9999;
const vt = w.placeTower('octopus', w.spots[0]).tower;
const ve = new Core.Enemy(w, 'standard', 0, 1, 3, {});
ve.traveled = ve.path.length * 0.5; ve.update(0.001);
vt.x = ve.x + 20; vt.y = ve.y + 20;
w.enemies.push(ve);
w.mech[0].timer = 0.1;   // ilk patlamayı beklemeden başlat
let warned = false, erupted = false;
w.onEvent = (t) => { if (t === 'hazardWarn') warned = true; if (t === 'eruption') erupted = true; };
const hp0 = ve.health;
runUntil(w, () => erupted, 40);
ok(warned && erupted, 'lav patlaması önce uyarı verir, sonra patlar');
ok(ve.health < hp0 || ve.health <= 0, 'lav patlaması düşmanı yaktı');
ok(vt.stun > 0, 'lav patlaması yakındaki kuleyi susturdu');

// buz: fırtınada menzil kısalır, sonra eski hâline döner
w = mk('buz');
w.money = 9999;
const bt = w.placeTower('octopus', w.spots[0]).tower;
const bigRange = bt.range;
const be = new Core.Enemy(w, 'armored', 0, 1, 10, {});
be.speed = be.originalSpeed = 0.01;
w.enemies.push(be);
let storm = false;
w.onEvent = (t) => { if (t === 'hazardStart') storm = true; };
runUntil(w, () => storm, 60);
ok(storm && bt.range < bigRange * 0.8, `kar fırtınasında menzil kısaldı (${bigRange} -> ${bt.range})`);
runUntil(w, () => !w.stormActive, 30);
ok(bt.range === bigRange, 'fırtına bitince menzil geri geldi');

// çukur: ışıksız kule kısa görür, fener balığı yanındaysa değil
w = mk('cukur');
w.money = 9999;
const ct = w.placeTower('octopus', w.spots[0]).tower;
const darkRange = ct.range;
const full = Core.TOWER_TYPES.octopus.range;
ok(darkRange < full, `karanlıkta menzil kısa (${darkRange} < ${full})`);
const spotNear = w.spots.filter(s => !s.tower).sort((a, b) => Math.hypot(a.x - ct.x, a.y - ct.y) - Math.hypot(b.x - ct.x, b.y - ct.y))[0];
w.placeTower('angler', spotNear);
const lit = Math.hypot(spotNear.x - ct.x, spotNear.y - ct.y) <= w.lightRadius(w.towers.find(t => t.support));
ok(lit ? ct.range > darkRange : true, 'fener balığının ışığındaki kule menzilini geri alır');

// atlantis: koruyucu darbe hasar verir ve sersemletir
w = mk('atlantis');
const g0 = w.map.guardians[1];
const ae = new Core.Enemy(w, 'armored', 0, 1, 1, {});
let bestD = 0, bestDist = 1e9;
for (let d = 0; d < ae.path.length; d += 10) {
    const q = Core.pointAt(ae.path, d);
    const dd = Math.hypot(q.x - g0.x, q.y - g0.y);
    if (dd < bestDist) { bestDist = dd; bestD = d; }
}
ae.traveled = bestD; ae.speed = ae.originalSpeed = 0; ae.update(0);
w.enemies.push(ae);
let pulsed = false;
w.onEvent = (t, d) => { if (t === 'guardianPulse' && d.hits > 0) pulsed = true; };
const ah = ae.health;
runUntil(w, () => pulsed, 30);
ok(pulsed && ae.health < ah && ae.stunTime > 0, 'koruyucu baş vurdu ve sersemletti');

// batık: hazine belirir, tıklanınca altın verir
w = mk('batik');
const bm0 = w.money;
const he = new Core.Enemy(w, 'armored', 0, 1, 1, {});
he.speed = he.originalSpeed = 0.01;
w.enemies.push(he);
runUntil(w, () => w.treasure, 40);
ok(!!w.treasure, 'hazine sandığı ortaya çıktı');
const before = w.money;
ok(w.collectTreasure() && w.money > before && !w.treasure, 'hazine toplandı');

// JavaFX WebView uyumluluğu: bunlar Chrome'da çalışır ama burada tuvali siler ya da sayfayı beyaz bırakır
const fs = require('fs');
const css = fs.readFileSync(path.join(web, '..', 'css', 'style.css'), 'utf8');
const gameJs = ['game.js', 'settings.js'].map(f => fs.readFileSync(path.join(web, f), 'utf8')).join('\n')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');   // yorum satırları sayılmaz
ok(!/blur\(/.test(css), "css'de blur() filtresi yok (WebView büyük filtre dokusu ayıramıyor, sayfa beyaz kalıyor)");
ok(!/backdrop-filter/.test(css), "css'de backdrop-filter yok");
ok(!/globalCompositeOperation\s*=\s*['"]lighter/.test(gameJs), "'lighter' karıştırma modu kullanılmıyor (tuvali siliyor)");
ok(!/getContext\(['"](webgl|experimental-webgl)/.test(gameJs) && !/AudioContext/.test(gameJs), 'WebGL ve Web Audio kullanılmıyor (WebView desteklemiyor)');

// sonsuz mod: kazandıktan sonra devam eder ve patronlar döngüyle gelir
w = mk('mercan');
w.money = 9999;
w.wave = w.totalWaves; w.result = 'win';
ok(w.goEndless() && w.canStartWave(), 'sonsuz moda geçilebilir');
w.startWave();
ok(w.wave === 11, 'sonsuz modda 11. dalga başladı');
const plan20 = Core.buildWavePlan(mapOf('mercan'), 20, 3);
ok(plan20.some(it => it.type === 'boss' && !it.mini), '20. dalgada yine patron var');
console.log(fails ? `${fails} BASARISIZ` : 'HEPSI GECTI');
process.exit(fails ? 1 : 0);
