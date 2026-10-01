// Oyun çekirdeği için hızlı denetimler (tarayıcı gerekmez):  node tools/test_core.js
const path = require('path');
const web = path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js');
const Core = require(path.join(web, 'core.js'));
const MAPS = require(path.join(web, 'maps.js'));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const runUntilSafe = (w, cond, maxSec) => { for (let i = 0; i < maxSec * 30 && !cond(); i++) w.update(1 / 30); return cond(); };
const mapOf = id => MAPS.find(m => m.id === id);
const mk = (id, opts) => new Core.World(mapOf(id), Object.assign({ seed: 1 }, opts));

// harita verisi
MAPS.forEach(m => {
    ok(m.buildSpots.length >= 10 && m.paths.length >= 1, `${m.id}: yol ve kule yerleri var`);
    ok(m.towers.every(t => Core.TOWER_TYPES[t]), `${m.id}: kule türleri geçerli`);
    ok(Core.BOSS_KINDS[m.boss], `${m.id}: patron türü geçerli`);
    ok(m.towers.filter(t => !Core.TOWER_TYPES[t].groundOnly).length >= 2, `${m.id}: en az iki kule havayı vurabiliyor`);
});

// kule fiyatı kolay ve normalde sabittir, yalnızca zorda aynı türden her kule pahalanır; harita dışı kule alınamaz
let w = mk('mercan');
w.money = 9999;
const c1 = w.towerCost('octopus');
w.placeTower('octopus', w.spots[0]);
ok(w.towerCost('octopus') === c1, 'normalde aynı türden kule pahalanmaz');
ok(mk('mercan', { difficulty: 'easy' }).towerCost('octopus') === c1, 'kolayda da pahalanmaz');
const hw = mk('mercan', { difficulty: 'hard' });
hw.money = 9999;
const hc1 = hw.towerCost('octopus');
hw.placeTower('octopus', hw.spots[0]);
ok(hw.towerCost('octopus') > hc1, 'zorda aynı türden kule pahalanır');
ok(w.placeTower('angler', w.spots[1]).reason === 'unavailable', 'haritada olmayan kule alınamaz');
const costs = Object.values(Core.TOWER_TYPES).map(t => t.cost).sort((a, b) => a - b);
ok(costs[0] === 50 && costs[costs.length - 1] <= 100, 'kule fiyatları 50-100 arasında, birbirine yakın');
ok(MAPS.every(m => m.startMoney >= 250), 'her harita en az 250 enerjiyle başlar');

// fener balığı normal haritalarda düz bir kule gibi ateş eder (yardımcı bonus vermez)
w = mk('yosun');
w.money = 9999;
const o = w.placeTower('octopus', w.spots[3]).tower;
const base = o.dmg;
const a = w.placeTower('angler', w.spots[4]).tower;
ok(a.dmg > 0 && a.rate < 10, 'fener balığı kendi hasarıyla ateş eder');
ok(o.dmg === base && !o.dark, 'fener balığı yanındaki kulenin değerlerini değiştirmez');
w.startWave();
let anglerShot = false;
w.onEvent = (t, d) => { if (t === 'fire' && d.tower === a) anglerShot = true; };
runUntilSafe(w, () => anglerShot, 40);
ok(anglerShot, 'fener balığı düşmana ateş etti');

// zorluk gerçekten bir şeyleri değiştiriyor
const easy = mk('mercan', { difficulty: 'easy' });
const hard = mk('mercan', { difficulty: 'hard' });
ok(easy.money > hard.money && easy.health > hard.health, 'başlangıç enerjisi ve üs canı zorluğa göre değişir');
ok(mk('mercan').money === 250 && easy.money === 300 && hard.money === 200, 'başlangıç enerjisi yuvarlak sayılar: 300 / 250 / 200');
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
const lit = Math.hypot(spotNear.x - ct.x, spotNear.y - ct.y) <= w.lightRadius(w.towers.find(t => t.type === 'angler'));
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


// volkan: patlamayla birlikte bir kuleye lav kayası düşer; uyarı geri sayımı yoktur, kule doğrudan yok olur
w = mk('volkan');
w.money = 9999;
const bombTower = w.placeTower('octopus', w.spots[0]).tower;
const decoy = new Core.Enemy(w, 'armored', 0, 1, 1, {});
decoy.speed = decoy.originalSpeed = 0.01; decoy.traveled = decoy.path.length * 0.4; decoy.update(0);
w.enemies.push(decoy);
w.mech[0].cfg = Object.assign({}, w.mech[0].cfg, { bombChance: 1 });
w.mech[0].timer = 0.1;
let warnHasBomb = false, meteor = null, destroyed = null, destroyCause = null;
w.onEvent = (t, d) => {
    if (t === 'hazardWarn' && d.bomb) warnHasBomb = true;
    if (t === 'meteor') meteor = d;
    if (t === 'towerDestroyed') { destroyed = d.tower; destroyCause = d.cause; }
};
runUntilSafe(w, () => destroyed, 30);
ok(!warnHasBomb, 'lav uyarısında kuleye ait "sat" uyarısı yok');
ok(meteor && meteor.towerId === bombTower.id && meteor.time < 1.2, 'lav kayası kısa süre önce görünür şekilde düşmeye başladı');
ok(destroyed === bombTower && destroyCause === 'lav' && !w.towers.includes(bombTower) && !w.spots[0].tower, 'lav kayası kuleyi yok etti, yer boşaldı');

// patron saldırısı: hırlar, sonra kuleyi yer (kule yok olur, geri gelmez)
w = mk('mercan');
w.money = 9999;
const t1 = w.placeTower('octopus', w.spots[0]).tower;
const nearSpot = w.spots.filter(sp => sp !== w.spots[0]).sort((a, b) => Math.hypot(a.x - w.spots[0].x, a.y - w.spots[0].y) - Math.hypot(b.x - w.spots[0].x, b.y - w.spots[0].y))[0];
const t2 = w.placeTower('octopus', nearSpot).tower;
t2.level = 3; t2.derive();                         // en yüksek seviyeli kule hedef olur
const boss = new Core.Enemy(w, 'boss', 0, 1, 5, { kind: 'shark', hpMul: 1 });
boss.speed = boss.originalSpeed = 0.01;
boss.furyTimer = 0.1;
w.enemies.push(boss);
boss.update = function () { this.x = t1.x + 60; this.y = t1.y + 60; return false; };   // kulelerin yakınında dursun
let cast = false, eatenTower = null, eatenBy = null;
w.onEvent = (t, d) => {
    if (t === 'bossFury') cast = true;
    if (t === 'towerDestroyed' && d.cause === 'patron') { eatenTower = d.tower; eatenBy = d.by; }
};
runUntilSafe(w, () => eatenTower, 20);
ok(cast, 'patron önce hırladı (uyarı süresi)');
ok(eatenTower === t2 && eatenBy === boss, 'patron en yüksek seviyeli kuleyi yedi');
ok(!w.towers.includes(t2) && !nearSpot.tower && w.towers.includes(t1), 'yenilen kule yok oldu, yeri boşaldı, diğeri yerinde');
boss.health = 0;
w.update(0.1);
ok(!w.towers.includes(t2), 'patron ölse de yenilen kule geri gelmez');
ok(Core.ENEMY_TYPES.boss.hp >= 750, 'patron yüksek canlı');

// patron saldırı sırasında ölürse kule yenmez
w = mk('mercan');
w.money = 9999;
const s1 = w.placeTower('octopus', w.spots[0]).tower;
const b2 = new Core.Enemy(w, 'boss', 0, 1, 5, { kind: 'shark', hpMul: 1 });
b2.speed = b2.originalSpeed = 0.01; b2.furyTimer = 0.1;
b2.update = function () { this.x = s1.x + 60; this.y = s1.y + 60; return false; };
w.enemies.push(b2);
let casting = false;
w.onEvent = (t) => { if (t === 'bossFury') casting = true; };
runUntilSafe(w, () => casting, 10);
b2.health = 0;
w.update(2);
ok(casting && w.towers.includes(s1), 'saldırı sırasında öldürülen patron kuleyi yiyemez');

// strateji: yavaşlamış düşman %20 fazla hasar alır
const slowT = new Core.Enemy(mk('mercan'), 'standard', 0, 1, 1, {});
const fastT = new Core.Enemy(mk('mercan'), 'standard', 0, 2, 1, {});
slowT.slowDown(0.5, 3);
const hSlow = slowT.takeDamage(10, 'eel', 0).dmg;
const hFast = fastT.takeDamage(10, 'eel', 0).dmg;
ok(Math.abs(hSlow / hFast - Core.SLOW_VULNERABILITY) < 0.001, 'yavaşlamış düşman fazla hasar alıyor (Deniz Anası eşleşmesi)');

// strateji: aynı türe yığılırsan düşmanlar alışır, karışık oynarsan alışmaz
w = mk('mercan');
w.money = 9999;
w.dealt = { octopus: 1000, eel: 30 };
w.wave = 4; w.updateAdaptation();
ok(w.adapt.octopus >= 0.2 && w.adapt.octopus <= Core.ADAPT_MAX + 1e-9 && !w.adapt.eel, 'tek türe dayanan hasar alışmaya yol açtı');
const octo = new Core.Enemy(w, 'standard', 0, 1, 1, {});
const octo2 = new Core.Enemy(w, 'standard', 0, 2, 1, {});
const normal = octo.takeDamage(10, 'octopus', 0).dmg;
w.strike(octo2, 'octopus', 10, 0);
ok(Math.abs((octo2.maxHealth - octo2.health) / normal - (1 - w.adapt.octopus)) < 0.01, 'alışılan türün hasarı gerçekten azalıyor');
w.dealt = { octopus: 400, eel: 350, jellyfish: 300 };
w.wave = 5; w.updateAdaptation();
ok(Object.keys(w.adapt).length === 0, 'dengeli karışımda alışma yok');
w.dealt = { octopus: 1000 };
w.wave = 2; w.updateAdaptation();
ok(Object.keys(w.adapt).length === 0, 'ilk dalgalarda alışma yok');

// strateji: ipuçları dalga içeriğine göre geliyor ve yalnızca haritadaki kuleleri öneriyor
w = mk('buz');
let adviceAll = [];
for (let n = 1; n <= w.totalWaves; n++) adviceAll = adviceAll.concat(w.waveAdvice(n));
ok(adviceAll.some(l => /Zırhlı/.test(l)) && adviceAll.some(l => /Patron/.test(l)), 'dalga ipuçları zırhlı ve patron için çıkıyor');
ok(!adviceAll.some(l => /Fener Balığı/.test(l)), 'haritada olmayan kule önerilmiyor');

// zırh: Istakoz, Ahtapot'a belirgin biçimde dayanıklı
{
    const lob = new Core.Enemy(mk('mercan'), 'armored', 0, 1, 1, {});
    const std = new Core.Enemy(mk('mercan'), 'standard', 0, 2, 1, {});
    const rO = lob.takeDamage(10, 'octopus', 0).dmg / std.takeDamage(10, 'octopus', 0).dmg;
    const lob2 = new Core.Enemy(mk('mercan'), 'armored', 0, 3, 1, {});
    const std2 = new Core.Enemy(mk('mercan'), 'standard', 0, 4, 1, {});
    const rE = lob2.takeDamage(10, 'eel', 0.5).dmg / std2.takeDamage(10, 'eel', 0.5).dmg;
    ok(rO < 0.3 && rE > rO * 2, 'zırhlıya Ahtapot çok az, Yılan Balığı (zırh deler) belirgin fazla hasar veriyor');
}

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
// kaydet / devam et: oyun durumu JSON'dan geri kurulur ve aynı şekilde sürer
w = mk('mercan', { seed: 7, difficulty: 'hard' });
w.money = 9999;
w.placeTower('octopus', w.spots[2]);
const tw = w.placeTower('eel', w.spots[3]).tower;
w.upgradeTower(tw); w.upgradeTower(tw);
tw.mode = 'strong';
w.startWave();
for (let i = 0; i < 300; i++) w.update(1 / 30);
const snap = JSON.parse(JSON.stringify(w.serialize()));
const r = Core.World.restore(mapOf('mercan'), snap, {});
ok(r.wave === w.wave && r.money === w.money && Math.abs(r.health - w.health) < 0.01 && r.diffKey === 'hard', 'kayıttan dalga, enerji, can ve zorluk geri geldi');
ok(r.towers.length === 2 && r.towers.find(t => t.type === 'eel').level === 3 && r.towers.find(t => t.type === 'eel').mode === 'strong', 'kuleler seviye ve hedef moduyla geri geldi');
ok(r.enemies.length === w.enemies.length && r.queue.length === w.queue.length, 'ekrandaki ve sırada bekleyen düşmanlar geri geldi');
const sample = w.enemies[0], rs = r.enemies.find(e => e.id === sample.id);
ok(rs && Math.abs(rs.x - sample.x) < 0.5 && Math.abs(rs.health - sample.health) < 0.01 && rs.maxHealth === sample.maxHealth, 'düşmanın yeri ve canı aynı');
for (let i = 0; i < 900; i++) { w.update(1 / 30); r.update(1 / 30); }
ok(Math.abs(r.money - w.money) < 60 && Math.abs(r.stats.kills - w.stats.kills) <= 3, 'devam edilen oyun orijinaline yakın ilerliyor');
ok(r.serialize().towers.length === 2, 'geri kurulan oyun yeniden kaydedilebiliyor');

console.log(fails ? `${fails} BASARISIZ` : 'HEPSI GECTI');
process.exit(fails ? 1 : 0);
