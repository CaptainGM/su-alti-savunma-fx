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

// kule yerleri yola değmez ve yolu gerçekten vurur (kule halkası yarıçapı 55)
MAPS.forEach(m => {
    const w0 = new Core.World(m, { seed: 1 });
    const pts = w0.paths.flatMap(p => p.points);
    const dist = sp => Math.min(...pts.map(q => Math.hypot(q.x - sp.x, q.y - sp.y)));
    const cover = (sp, r) => {
        let c = 0;
        for (const p of w0.paths) for (let i = 1; i < p.points.length; i++) if (Math.hypot(p.points[i].x - sp.x, p.points[i].y - sp.y) <= r) c += p.dist[i] - p.dist[i - 1];
        return c;
    };
    const tooClose = m.padSpots ? [] : m.buildSpots.filter(sp => dist(sp) < m.roadHalf + Core.BUILD_SPOT_RADIUS - 2);
    ok(tooClose.length === 0, `${m.id}: hiçbir kule yeri yola değmiyor (en az ${m.roadHalf + Core.BUILD_SPOT_RADIUS} piksel uzak)`);
    const useless = m.buildSpots.filter(sp => cover(sp, 200 * (sp.kind === 'high' ? 1.2 : 1)) < 120);
    ok(useless.length === 0, `${m.id}: her kule yeri yolun en az 120 pikselini kapsıyor`);
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
ok(mk('mercan').money === 250 && easy.money === 300 && hard.money === 230, 'başlangıç enerjisi yuvarlak sayılar: 300 / 250 / 230');
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

// ---------------------------------------------------------------- yetenek seçimi (3. ve 5. seviye)
{
    const types = Object.keys(Core.TOWER_TYPES);
    ok(types.every(t => [3, 5].every(lv => { const o = Core.perkOptions(t, lv); return o && o.length === 2 && o[0].id !== o[1].id; })),
        'her kulenin 3. ve 5. seviyede iki yeteneği var (6 kule x 4 = 24 yetenek)');
    const ids = types.flatMap(t => [3, 5].flatMap(lv => Core.perkOptions(t, lv).map(o => o.id)));
    ok(new Set(ids).size === 24, 'yetenek kimlikleri benzersiz');

    // yardımcı: haritada kule kur, istenen seçimlerle 5. seviyeye çıkar
    const build = (w, type, spotIdx, picks, lvl) => {
        const t = w.placeTower(type, w.spots[spotIdx]).tower;
        const choices = { 3: picks[0], 5: picks[1] };
        while (t.level < lvl) w.upgradeTower(t, choices[t.level + 1]);
        return t;
    };
    const foe = (w, type, traveled) => {
        const e = new Core.Enemy(w, type || 'standard', 0, w.nextEnemyId++, 3, {});
        e.traveled = traveled == null ? 300 : traveled; e.speed = e.originalSpeed = 0.001; e.update(0);
        w.enemies.push(e);
        return e;
    };
    const rich = (id, diff) => { const w = mk(id || 'cukur', { difficulty: diff || 'easy' }); w.money = 99999; return w; };

    // seçim kaydediliyor, B seçeneği farklı etki veriyor
    let w1 = rich('mercan');
    let tw = build(w1, 'octopus', 0, [0, 0], 5);
    ok(tw.perks[3] === 'oct-twin' && tw.perks[5] === 'oct-rain' && tw.shots === 3, 'Ahtapot: Çift Mürekkep + Mürekkep Yağmuru = 3 hedef');
    w1 = rich('mercan');
    tw = build(w1, 'octopus', 0, [1, 1], 5);
    ok(tw.perks[3] === 'oct-pierce' && tw.shots === 1 && tw.pierce >= 0.4 && tw.strikeOpts.noHeavy, 'Ahtapot: Delici Mürekkep zırh deler, tek hedef');
    const lob0 = new Core.Enemy(w1, 'armored', 0, 90, 1, {}), lob1 = new Core.Enemy(w1, 'armored', 0, 91, 1, {});
    const dA = lob0.takeDamage(10, 'octopus', 0, {}).dmg, dB = lob1.takeDamage(10, 'octopus', tw.pierce, tw.strikeOpts).dmg;
    ok(dB > dA * 2.4, 'Delici Mürekkep zırhlıya çok daha fazla hasar veriyor');
    w1 = rich('mercan');
    tw = build(w1, 'octopus', 0, [0, 1], 5);
    const tgt = foe(w1, 'standard', 300);
    tgt.maxHealth = tgt.health = 99999;
    tw.target = tgt; w1.fire(tw);
    for (let i = 0; i < 60; i++) w1.update(1 / 30);
    ok(tgt.markT > 0, 'Karartma Bulutu hedefi işaretliyor');
    const m0 = foe(w1, 'standard', 320), m1 = foe(w1, 'standard', 330);
    m1.markT = 3; m1.markPct = 0.2;
    ok(Math.abs(m1.takeDamage(10, 'eel', 0).dmg / m0.takeDamage(10, 'eel', 0).dmg - 1.2) < 0.001, 'işaretli düşman %20 fazla hasar alıyor');

    // Yılan Balığı: zincir, aşırı yük, yanık
    let w2 = rich('buz');
    let eel = build(w2, 'eel', 0, [0, 0], 5);
    const near = foe(w2, 'standard', 250);
    near.x = eel.x + 40; near.y = eel.y;                  // hedef
    const far1 = foe(w2, 'standard', 260), far2 = foe(w2, 'standard', 270), far3 = foe(w2, 'standard', 280);
    far1.x = eel.x + 40 + eel.aoe + 60; far1.y = eel.y;   // alanın dışında ama zincir menzilinde
    far2.x = eel.x + 40 + eel.aoe + 100; far2.y = eel.y;
    far3.x = eel.x + 40 + eel.aoe + 140; far3.y = eel.y;
    let chain = null;
    w2.onEvent = (t, d) => { if (t === 'chain') chain = d; };
    eel.target = near; w2.fire(eel);
    ok(chain && chain.points.length === 3 && far1.health < far1.maxHealth && far2.health < far2.maxHealth && far3.health === far3.maxHealth, 'Zincir Şoku alan dışındaki en yakın 2 düşmana sıçrıyor');
    w2 = rich('buz');
    eel = build(w2, 'eel', 0, [1, 0], 5);
    ok(eel.aoe > Core.TOWER_TYPES.eel.aoe * 1.45 && eel.dmg < Core.TOWER_TYPES.eel.dmg * 2.4, 'Geniş Şok alanı büyütüyor');
    const o1 = foe(w2, 'standard', 250); o1.x = eel.x + 30; o1.y = eel.y; o1.maxHealth = o1.health = 99999;
    let overloads = 0;
    w2.onEvent = (t) => { if (t === 'overload') overloads++; };
    for (let i = 0; i < 8; i++) { eel.target = o1; w2.fire(eel); }
    ok(overloads === 2 && o1.stunTime > 0, 'Aşırı Yük her 4. şokta sersemletiyor');
    w2 = rich('buz');
    eel = build(w2, 'eel', 0, [0, 1], 5);
    const bn = foe(w2, 'armored', 250); bn.x = eel.x + 30; bn.y = eel.y;
    eel.target = bn; w2.fire(eel);
    const h1 = bn.health;
    for (let i = 0; i < 30; i++) w2.update(1 / 30);
    ok(bn.dotT > 0 && bn.health < h1 - 2, 'Elektrik Yanığı zırhlıda da zamanla hasar veriyor');

    // Deniz Anası
    let w3 = rich('yosun');
    let jf = build(w3, 'jellyfish', 0, [0, 0], 5);
    ok(jf.slow === 0.35 && jf.slowTime === 4.5, 'Buz Dokunuşu yavaşlatmayı güçlendiriyor');
    jf = build(rich('yosun'), 'jellyfish', 0, [0, 0], 5);
    w3 = jf.world;
    jf.fx.slowArea = { radius: 85 };                      // Elektrikli Su (5. seviye A) ile aynı etki
    const s1 = foe(w3, 'standard', 200), s2 = foe(w3, 'standard', 200), s3 = foe(w3, 'standard', 200);
    s2.x = s1.x + 40; s2.y = s1.y; s3.x = s1.x + 400; s3.y = s1.y;
    const res1 = w3.strike(s1, jf, jf.dmg, jf.pierce);
    s1.slowDown(jf.slow, jf.slowTime); w3.afterHit(s1, jf, res1, true);
    ok(s2.isSlowed && !s3.isSlowed, 'Elektrikli Su yakındaki düşmanı da yavaşlatıyor');
    const jfField = build(rich('yosun'), 'jellyfish', 0, [1, 0], 5);
    ok(jfField.fx.slowArea && jfField.fx.slowArea.radius === 85, 'Elektrikli Su 5. seviyede seçilebiliyor');
    w3 = rich('yosun');
    jf = build(w3, 'jellyfish', 0, [1, 1], 5);
    const ps = foe(w3, 'armored', 200);
    const r2 = w3.strike(ps, jf, jf.dmg, jf.pierce); w3.afterHit(ps, jf, r2, true);
    ok(ps.dotT > 0 && ps.dotDps > 0, 'Zehirli Dokunuş zehirliyor');
    const pulseTargets = [foe(w3, 'standard', 150), foe(w3, 'flying', 160)];
    pulseTargets.forEach(e => { e.x = jf.x + 50; e.y = jf.y + 10; });
    let pulsed = false;
    w3.onEvent = (t) => { if (t === 'pulse') pulsed = true; };
    ok(jf.fx.pulse && jf.fx.pulse.every === 6, 'Derin Nabız ayarlı');
    for (let i = 0; i < 6; i++) { jf.target = pulseTargets[0]; w3.fire(jf); }
    ok(pulsed && pulseTargets.every(e => e.isSlowed), 'Derin Nabız 6. atışta havadakiler dahil herkesi yavaşlatıyor');

    // Kılıç Balığı
    let w4 = rich('batik');
    let sw = build(w4, 'swordfish', 0, [0, 0], 5);
    ok(sw.pierce >= 0.64 && sw.strikeOpts.bossHit === 1.8, 'Zırh Kesen delme ve patron hasarını artırıyor');
    const bs = new Core.Enemy(w4, 'boss', 0, 77, 3, { kind: 'shark', hpMul: 1 });
    const hitBoss = bs.takeDamage(10, 'swordfish', 0, sw.strikeOpts).dmg, hitBoss0 = new Core.Enemy(w4, 'boss', 0, 78, 3, { kind: 'shark', hpMul: 1 }).takeDamage(10, 'swordfish', 0, {}).dmg;
    ok(Math.abs(hitBoss / hitBoss0 - 1.8 / 1.5) < 0.001, 'patrona %80 fazla hasar (normalde %50)');
    const ex1 = foe(w4, 'standard', 200), ex2 = foe(w4, 'standard', 200);
    ex2.health = ex2.maxHealth * 0.2;
    const swHunt = build(rich('batik'), 'swordfish', 1, [0, 0], 5);
    swHunt.fx.execute = { below: 0.3, mul: 2 }; swHunt.derive(); swHunt.strikeOpts.executeBelow = 0.3; swHunt.strikeOpts.executeMul = 2;
    const full = ex1.takeDamage(10, 'swordfish', 0, swHunt.strikeOpts).dmg, low = ex2.takeDamage(10, 'swordfish', 0, swHunt.strikeOpts).dmg;
    ok(Math.abs(low / full - 2) < 0.001, 'Av Başı canı az düşmana iki kat hasar veriyor');
    const swHunt2 = build(rich('batik'), 'swordfish', 1, [0, 0], 5);
    ok(swHunt2.perks[5] === 'swo-hunt' && swHunt2.strikeOpts.executeBelow === 0.3, 'Av Başı 5. seviye A seçeneği');
    w4 = rich('batik');
    sw = build(w4, 'swordfish', 0, [1, 1], 5);
    ok(sw.fx.crit && sw.range > Core.TOWER_TYPES.swordfish.range * 1.1, 'Keskin Nişan menzili ve kritik şansı veriyor');
    const cc = foe(w4, 'standard', 220); cc.maxHealth = cc.health = 99999;
    w4.rng = () => 0; let crits = 0; w4.onEvent = (t) => { if (t === 'crit') crits++; };
    sw.target = cc; w4.fire(sw);
    for (let i = 0; i < 60; i++) w4.update(1 / 30);
    ok(crits >= 1, 'kritik vuruş gerçekleşti');
    const sv = [foe(w4, 'standard', 200), foe(w4, 'standard', 210), foe(w4, 'standard', 220), foe(w4, 'standard', 230)];
    sv.forEach((e, i) => { e.x = sw.x + 80 + i * 10; e.y = sw.y; e.maxHealth = e.health = 100 + i * 100; });
    w4.projectiles = [];
    sw.fx.salvo = { every: 5, count: 3 };
    sw.shotCount = 4; sw.target = sv[0]; w4.fire(sw);
    ok(w4.projectiles.length === 3 && w4.projectiles.every(p => p.target !== sv[0]), 'Kılıç Yağmuru 5. atışta en güçlü 3 düşmanı seçiyor');
    ok(build(rich('batik'), 'swordfish', 1, [0, 1], 5).fx.salvo.count === 3, 'Kılıç Yağmuru 5. seviye B seçeneği');

    // Fener Balığı
    let w5 = rich('cukur');
    const lamp = build(w5, 'angler', 0, [0, 0], 5);
    const nb = w5.placeTower('octopus', w5.spots[1]).tower;
    nb.x = lamp.x + 60; nb.y = lamp.y;
    w5.refreshLight();
    ok(nb.auraBonus > 0 && nb.dmg > Core.TOWER_TYPES.octopus.dmg, 'Aydınlık Çevre yakın kulelere hasar bonusu veriyor');
    ok(w5.lightRadius(lamp) > lamp.range * 1.4 * 1.3, 'Işık alanı büyüyor');
    const lampB = build(rich('cukur'), 'angler', 0, [1, 1], 5);
    ok(lampB.shots === 2 && lampB.range > Core.TOWER_TYPES.angler.range * 1.2 && lampB.dmg >= Core.TOWER_TYPES.angler.dmg * 1.25 * 2, 'Odak Işığı + Çifte Işık: menzil, hasar, iki hedef');
    const lampDawn = build(rich('cukur'), 'angler', 0, [0, 0], 5);
    lampDawn.fx.auraSlow = 0.88;
    const w5b = lampDawn.world;
    const lit = foe(w5b, 'standard', 300); lit.x = lampDawn.x + 40; lit.y = lampDawn.y;
    const dark = foe(w5b, 'standard', 310); dark.x = lampDawn.x + 3000; dark.y = lampDawn.y;
    w5b.update(1 / 30);
    ok(lit.auraMul === 0.88 && dark.auraMul === 1, 'Şafak Ağı ışıktaki düşmanı yavaşlatıyor');
    ok(!!build(rich('cukur'), 'angler', 0, [0, 0], 5).world && Core.perkOptions('angler', 5)[0].fx.auraSlow === 0.88, 'Şafak Ağı 5. seviye A seçeneği');

    // Balon Balığı
    let w6 = rich('yosun');
    let pf2 = build(w6, 'puffer', 0, [0, 0], 5);
    pf2.fx.gas = { dpsMul: 0.45, time: 3.5, radiusMul: 0.85 };   // Zehirli Gaz (5. seviye A)
    ok(pf2.aoe >= Core.TOWER_TYPES.puffer.aoe * 1.35, 'Büyük Patlama alanı büyütüyor');
    const gx = foe(w6, 'armored', 200); gx.x = pf2.x + 120; gx.y = pf2.y;
    const pr = new Core.Projectile(pf2, gx, { x: gx.x, y: gx.y });
    pr.x = gx.x; pr.y = gx.y;
    w6.projectiles.push(pr);
    for (let i = 0; i < 10; i++) w6.update(1 / 30);
    const gh = gx.health;
    ok(w6.gas.length === 1, 'zehirli gaz bulutu oluştu');
    for (let i = 0; i < 60; i++) w6.update(1 / 30);
    ok(gx.health < gh - 3, 'gaz bulutu zırhlıya da zamanla hasar veriyor');
    w6 = rich('yosun');
    pf2 = build(w6, 'puffer', 0, [1, 1], 5);
    ok(pf2.rate < Core.TOWER_TYPES.puffer.rate * 0.65 * 0.8 && pf2.slow === 0.5 && pf2.slowTime === 3, 'Hızlı Namlu + Yapışkan Sıvı');

    // kayıt: seçilen yetenekler geri geliyor, eski kayıtlarda boşluk doldurulur
    const w7 = rich('mercan');
    build(w7, 'swordfish', 0, [1, 0], 5);
    const sn = JSON.parse(JSON.stringify(w7.serialize()));
    const r7 = Core.World.restore(mapOf('mercan'), sn, {});
    const rt = r7.towers[0];
    ok(rt.perks[3] === 'swo-aim' && rt.perks[5] === 'swo-hunt' && rt.fx.crit && rt.fx.execute, 'kaydedilen yetenekler geri yüklendi');
    delete sn.towers[0].perks;
    const r8 = Core.World.restore(mapOf('mercan'), sn, {});
    ok(r8.towers[0].perks[3] === 'swo-cut' && r8.towers[0].perks[5] === 'swo-hunt', 'eski kayıtlarda eksik yetenek ilk seçenekle doldurulur');
}

// ---------------------------------------------------------------- özel düşmanlar
{
    const spawn = (w, type, traveled) => {
        const e = new Core.Enemy(w, type, 0, w.nextEnemyId++, 4, {});
        e.traveled = traveled == null ? 300 : traveled; e.speed = e.originalSpeed = 0.001; e.update(0);
        w.enemies.push(e);
        return e;
    };
    const count = (plan, t) => plan.filter(it => it.type === t).length;

    // dalga planı: yalnızca haritanın havuzundaki türler, belirli dalgadan sonra
    const mercan = mapOf('mercan'), cukur = mapOf('cukur');
    ok(count(Core.buildWavePlan(mercan, 2, 5), 'shield') === 0 && count(Core.buildWavePlan(mercan, 4, 5), 'shield') >= 2, 'kalkanlılar 3. dalgadan sonra çıkıyor');
    ok(MAPS.every(m => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(n => Core.buildWavePlan(m, n, 7).every(it => (m.enemyPool || []).includes(it.type)))), 'hiçbir haritada havuz dışı düşman çıkmıyor');
    const late = Core.buildWavePlan(cukur, 10, 5);
    ok(count(late, 'stealth') >= 3 && count(late, 'healer') >= 1 && count(late, 'shocker') >= 1, 'Derin Çukur 10. dalgada gizlenen, şifacı ve müren var');
    const lineIdx = late.map((it, i) => it.type === 'stealth' ? i : -1).filter(i => i >= 0);
    ok(lineIdx[lineIdx.length - 1] - lineIdx[0] === lineIdx.length - 1, 'gizlenenler yan yana tek sıra halinde geliyor');
    const plain = Object.assign({}, cukur, { enemyPool: ['standard', 'armored', 'flying', 'swarm', 'boss'] });
    ok(Core.buildWavePlan(cukur, 8, 7).length - Core.buildWavePlan(plain, 8, 7).length <= 4, 'özel düşmanlar toplam sayıyı şişirmiyor');
    ok(MAPS.every(m => Core.buildWavePlan(m, 10, 3).some(it => Core.SPECIAL_ENEMIES.includes(it.type))), 'her haritada son dalgalarda en az bir özel düşman türü var');

    // kalkan
    let w = mk('mercan');
    const sh = spawn(w, 'shield');
    ok(sh.shield > 0 && Math.abs(sh.shield - sh.maxHealth * 0.7) < 2, 'kalkanlı düşmanın canının %70\'i kadar kalkanı var');
    const h0 = sh.health;
    const r1 = sh.takeDamage(10, 'eel', 0, {});
    ok(sh.health === h0 && sh.shield < sh.shieldMax && !r1.shieldBroke, 'hasar önce kalkana gidiyor');
    const sh2 = spawn(w, 'shield');
    sh2.originalSpeed = sh2.speed = 40;
    sh2.slowDown(0.5, 3);
    const sh3 = spawn(w, 'standard');
    sh3.originalSpeed = sh3.speed = 40;
    sh3.slowDown(0.5, 3);
    ok(sh2.speed > sh3.speed + 1, 'kalkan varken yavaşlatma zayıf');
    const r2 = sh.takeDamage(99999, 'eel', 0, {});
    ok(r2.shieldBroke && sh.shield === 0, 'kalkan kırılınca bayrak çıkıyor');
    const sh4 = spawn(w, 'shield');
    const hp4 = sh4.health;
    w.dotDamage(sh4, 5, 'puffer');
    ok(sh4.health === hp4 - 5 && sh4.shield === sh4.shieldMax, 'zehir/gaz kalkanı deler');
    let broke = 0;
    w.onEvent = (t) => { if (t === 'shieldBreak') broke++; };
    const sh5 = spawn(w, 'shield'); sh5.shield = 1;
    w.afterHit(sh5, { fx: {}, type: 'eel' }, { dmg: 5, dead: false, shieldBroke: true }, false);
    ok(broke === 1, 'kalkan kırılma olayı yayınlanıyor');

    // şifacı
    w = mk('yosun');
    const hl = spawn(w, 'healer', 300);
    const hurt = spawn(w, 'standard', 305); hurt.health = hurt.maxHealth * 0.5;
    const far = spawn(w, 'standard', 1400); far.health = far.maxHealth * 0.5;
    let healed = 0;
    w.onEvent = (t) => { if (t === 'heal') healed++; };
    for (let i = 0; i < 90; i++) w.update(1 / 30);
    ok(hurt.health > hurt.maxHealth * 0.5 && far.health === far.maxHealth * 0.5 && healed >= 1, 'şifacı yakındaki yaralıyı iyileştiriyor, uzaktakini değil');

    // gizlenen
    w = mk('mangrov');
    w.money = 9999;
    const sq = spawn(w, 'stealth', 300);
    const tw = w.placeTower('octopus', w.spots[0]).tower;
    sq.x = tw.x + 50; sq.y = tw.y;
    sq.hidden = true; sq.hideT = 99;
    ok(!tw.canTarget(sq) && tw.pick(w.enemies) === null, 'gizlenen düşman kuleler tarafından hedeflenemiyor');
    const ang = new Core.Tower(w, 'angler', w.spots[1], 99);
    ang.x = tw.x + 20; ang.y = tw.y + 20; ang.derive();
    w.towers.push(ang);
    w.update(1 / 30);
    ok(sq.revealT > 0 && tw.canTarget(sq), 'Fener Balığı ışığı gizleneni ortaya çıkarıyor');
    w.towers = w.towers.filter(t => t !== ang);
    sq.revealT = 0;
    ok(!tw.canTarget(sq), 'ışık gidince yine gizli');
    const eelT = w.placeTower('eel', w.spots[2]).tower;
    eelT.x = sq.x; eelT.y = sq.y + 30;
    const decoy = spawn(w, 'standard', 301); decoy.x = sq.x + 10; decoy.y = sq.y; decoy.maxHealth = decoy.health = 99999;
    const sqh = sq.health;
    eelT.target = decoy; w.fire(eelT);
    ok(sq.health < sqh && sq.revealT > 0, 'alan hasarı gizleneni de vuruyor ve açığa çıkarıyor');
    let vanished = 0;
    w.onEvent = (t) => { if (t === 'vanish') vanished++; };
    const sq2 = spawn(w, 'stealth', 330); sq2.hideT = 0.05;
    w.update(0.2);
    ok(sq2.hidden && vanished === 1, 'kalamar belli aralıkla kayboluyor');

    // müren
    w = mk('batik');
    w.money = 9999;
    const pathMin = sp => Math.min(...w.paths[0].points.map(q => Math.hypot(q.x - sp.x, q.y - sp.y)));
    const bySpot = w.spots.slice().sort((a, b) => pathMin(a) - pathMin(b));
    const mt = w.placeTower('octopus', bySpot[0]).tower;
    const far2 = w.placeTower('octopus', bySpot[bySpot.length - 1]).tower;
    const nearestTravel = tw_ => { const P = w.paths[0]; let bi = 0, bd = 1e9; P.points.forEach((q, i) => { const d = Math.hypot(q.x - tw_.x, q.y - tw_.y); if (d < bd) { bd = d; bi = i; } }); return P.dist[bi]; };
    const mo = spawn(w, 'shocker', nearestTravel(mt));
    mo.shockT = 0.1;
    let warned = null, shocked = null;
    w.onEvent = (t, d) => { if (t === 'shockWarn') warned = d; if (t === 'towerShock') shocked = d; };
    for (let i = 0; i < 12; i++) w.update(1 / 30);
    ok(warned && warned.tower === mt && mt.stun <= 0, 'müren önce uyarı veriyor (kule henüz sersemlemedi)');
    for (let i = 0; i < 20; i++) w.update(1 / 30);
    ok(shocked && mt.stun > 2.5, 'müren kuleyi 3,5 sn sersemletiyor');
    ok(far2.stun === 0, 'uzaktaki kule etkilenmiyor');
    const mo2 = spawn(w, 'shocker', nearestTravel(mt) + 10); mo2.shockT = 0.05;
    mt.stun = 0;
    let died = false;
    w.onEvent = (t) => { if (t === 'towerShock') died = true; };
    w.update(1 / 30);
    mo2.health = 0;
    for (let i = 0; i < 40; i++) w.update(1 / 30);
    ok(!died && mt.stun <= 0, 'müren uyarı sırasında ölürse şok olmaz');

    // öncelikli hedef modu
    w = mk('yosun');
    w.money = 9999;
    const pt = w.placeTower('octopus', w.spots[0]).tower;
    pt.mode = 'priority';
    const e1 = spawn(w, 'standard', 400), e2 = spawn(w, 'healer', 300);
    e1.x = pt.x + 40; e1.y = pt.y; e2.x = pt.x + 60; e2.y = pt.y;
    ok(pt.pick(w.enemies) === e2 && Core.TARGET_MODES.includes('priority'), 'Öncelikli mod şifacıyı önce seçiyor');

    // kayıt: kalkan ve gizlenme durumu
    w = mk('buz');
    const ss = spawn(w, 'shield', 200); ss.shield = Math.round(ss.shieldMax / 2);
    const sn2 = JSON.parse(JSON.stringify(w.serialize()));
    const rr = Core.World.restore(mapOf('buz'), sn2, {});
    ok(rr.enemies[0].special === 'shield' && Math.abs(rr.enemies[0].shield - ss.shield) < 1, 'kalkan durumu kayıttan geri geliyor');
}

// ---------------------------------------------------------------- patron evreleri
{
    const w = mk('mercan');
    w.money = 9999;
    const boss = new Core.Enemy(w, 'boss', 0, 500, 5, { kind: 'shark', hpMul: 1 });
    boss.speed = boss.originalSpeed = 0.001; boss.update(0);
    w.enemies.push(boss);
    let phases = 0, lastShield = 0;
    w.onEvent = (t, d) => { if (t === 'bossPhase') { phases++; lastShield = d.shield; } };
    ok(boss.phases.length === 3 && Core.BOSS_PHASES.join() === '0.7,0.4,0.15', 'patronun üç evresi var (%70, %40, %15)');
    const mini = new Core.Enemy(w, 'boss', 0, 501, 5, { kind: 'shark', hpMul: 0.5, mini: true });
    ok(mini.phases.length === 1, 'ara patronun tek evresi var');

    // can %70'in altına inince kalkan + öfke
    w.strike(boss, 'swordfish', boss.maxHealth * 0.4, 0);       // zırh ve çarpanlardan sonra ~%30'dan fazlası düşer
    w.afterHit(boss, { fx: {}, type: 'swordfish' }, { dmg: 1, dead: false }, false);
    ok(phases >= 1 && boss.shield > 0 && boss.rageT > 0, 'eşik aşılınca patron kalkan kazandı ve öfkelendi');
    ok(lastShield === Math.round(boss.maxHealth * Core.BOSS_SHIELD), 'kalkan maksimum canın %12\'si');
    boss.stunTime = 3; boss.update(0.1);
    ok(boss.stunTime === 0, 'öfkeliyken sersemletilemez');
    const x0 = boss.traveled;
    const normalBoss = new Core.Enemy(w, 'boss', 0, 502, 5, { kind: 'shark', hpMul: 1 });
    boss.speed = boss.originalSpeed = 20; normalBoss.speed = normalBoss.originalSpeed = 20;
    boss.update(1); normalBoss.update(1);
    ok(boss.traveled - x0 > normalBoss.traveled * 1.3, 'öfkeli patron daha hızlı ilerliyor');

    // tek büyük vuruş birden fazla eşiği aşsa bile her biri sayılır, ama kalkan bir kez yenilenir
    const b2 = new Core.Enemy(w, 'boss', 0, 503, 5, { kind: 'shark', hpMul: 1 });
    b2.health = b2.maxHealth * 0.1; b2.crossPhases();
    ok(b2.phases.length === 0 && b2.phasePending === 3, 'çok eşik aynı anda geçilebilir');

    // kalkan emilimi: kalkan varken hasar önce kalkana gider
    const b3 = new Core.Enemy(w, 'boss', 0, 504, 5, { kind: 'shark', hpMul: 1 });
    b3.health = b3.maxHealth * 0.69; b3.crossPhases();
    const hp3 = b3.health;
    b3.takeDamage(b3.shield * 0.5, 'eel', 0, {});
    ok(b3.health === hp3, 'kalkan varken can düşmüyor');
    w.dotDamage(b3, b3.shield * 2, 'jellyfish');
    ok(b3.shield === 0 && b3.health < hp3, 'zehir de önce evre kalkanını yiyor');

    // yeni patron canı ayarı: harita çarpanı uygulanıyor
    const m1 = Object.assign({}, mapOf('mercan'), { bossScale: 1 });
    const m2 = Object.assign({}, mapOf('mercan'), { bossScale: 2 });
    const e1 = new Core.Enemy(new Core.World(m1, { seed: 1 }), 'boss', 0, 1, 5, { kind: 'shark', hpMul: 1 });
    const e2 = new Core.Enemy(new Core.World(m2, { seed: 1 }), 'boss', 0, 1, 5, { kind: 'shark', hpMul: 1 });
    ok(Math.abs(e2.maxHealth / e1.maxHealth - 2) < 0.01, 'bossScale yalnızca patron canını çarpıyor');
    ok(MAPS.every(m => m.bossScale > 0 && m.miniHp > 0), 'her haritada patron çarpanı tanımlı');

    // kaydet/yükle: evre ve kalkan korunuyor
    const w2 = mk('mercan');
    const b4 = new Core.Enemy(w2, 'boss', 0, 600, 5, { kind: 'shark', hpMul: 1 });
    b4.speed = b4.originalSpeed = 0.001; b4.update(0);
    w2.enemies.push(b4);
    b4.health = b4.maxHealth * 0.65; b4.crossPhases(); b4.phasePending = 0;
    const r4 = Core.World.restore(mapOf('mercan'), JSON.parse(JSON.stringify(w2.serialize())), {});
    const rb = r4.enemies[0];
    ok(rb.phases.length === 2 && rb.shield > 0 && rb.rageT > 0, 'patron evresi kayıttan geri geliyor');
}

// ---------------------------------------------------------------- patron düellosu ve Rehber içeriği
{
    // Tek bir güçlü kule ara patronu yolun başında eritemez (kullanıcı şikâyeti: 3. seviye Kılıç Balığı patronu çeyrek yolu bile gitmeden öldürüyordu)
    const cover = (w, sp, r) => {
        let c = 0;
        for (const p of w.paths) for (let i = 1; i < p.points.length; i++) if (Math.hypot(p.points[i].x - sp.x, p.points[i].y - sp.y) <= r) c += p.dist[i] - p.dist[i - 1];
        return c;
    };
    const duel = (map, diff, lvl) => {
        const w = new Core.World(map, { difficulty: diff, seed: 5, onEvent: () => { } });
        w.money = 1e7;
        const spot = w.spots.slice().sort((a, b) => cover(w, b, 380) - cover(w, a, 380))[0];
        const t = w.placeTower('swordfish', spot).tower;
        while (t.level < lvl) w.upgradeTower(t, 0);
        const total = Core.totalWavesOf(map);
        const e = new Core.Enemy(w, 'boss', 0, 1, Math.floor(total / 2), { kind: map.boss, hpMul: map.miniHp || Core.MINI_HP_MUL, mini: true });
        w.enemies.push(e);
        for (let i = 0; i < 30 * 400 && e.health > 0 && !e.reached; i++) w.update(1 / 30);
        return e.health <= 0 ? Math.min(1, e.progress) : 1;
    };
    const withSword = MAPS.filter(m => m.towers.includes('swordfish'));
    const early = withSword.map(m => [m.id, duel(m, 'easy', 3)]).filter(([, p]) => p < 0.40);
    ok(early.length === 0, `tek 3. seviye Kılıç Balığı ara patronu kolayda bile yolun %40'ından önce öldüremez ${early.map(([id, p]) => id + ' %' + Math.round(p * 100)).join(', ')}`);

    // Rehber içeriği: her kule, düşman, patron ve kural için sayfa var; her yetenek ve harita kuralı anlatılıyor
    const guideSrc = require('fs').readFileSync(path.join(web, 'rehber.js'), 'utf8');
    const has = id => new RegExp(`(^|\\s|'|")${id}['"]?\\s*:`).test(guideSrc);
    ok(Object.keys(Core.TOWER_TYPES).every(has), 'Rehber: her kule türünün bilgi sayfası var');
    const enemyKeys = Object.keys(Core.ENEMY_TYPES).filter(k => k !== 'boss').concat(Object.keys(Core.BOSS_KINDS).map(k => 'boss_' + k));
    ok(enemyKeys.every(has), 'Rehber: her düşman ve patron türünün bilgi sayfası var');
    ok(Object.keys(Core.BOSS_KINDS).every(k => guideSrc.includes(`boss: '${k}'`)), 'Rehber: her patronun gösterim sahnesi var');
    const mechTypes = [...new Set(MAPS.flatMap(m => (m.mechanics || []).map(x => x.type)))];
    ok(mechTypes.every(t => guideSrc.includes(`case '${t}'`)), `Rehber: her harita kuralı için açıklama ve gösterim sahnesi var (${mechTypes.join(', ')})`);
    ok(['start', 'high', 'armor', 'slow', 'adapt', 'bossrule', 'difficulty'].every(id => guideSrc.includes(`id: '${id}'`)), 'Rehber: kural sayfaları tam (başlarken, yüksek zemin, zırh, yavaşlatma, alışma, patronlar, zorluk)');
    const indexHtml = require('fs').readFileSync(path.join(web, '..', 'index.html'), 'utf8');
    ok(indexHtml.includes('id="guideScreen"') && indexHtml.includes('js/rehber.js') && indexHtml.includes('id="guideBtn"'), 'Rehber ekranı, oyun içi düğmesi ve betiği sayfada');
    ok(!indexHtml.includes('id="infoModal"'), 'eski uzun yardım penceresi kaldırıldı (yerini Rehber aldı)');

    // dalga ipuçları yapısal ve yalnızca haritadaki kuleleri öneriyor
    const wa = new Core.World(mapOf('cukur'), { seed: 3 });
    const items = wa.waveAdviceItems(10);
    ok(items.length >= 3 && items.every(it => it.good.concat(it.bad).every(t => wa.available.includes(t))), 'sidebar ipuçları haritada olmayan kule önermiyor');
    ok(items.some(it => it.enemy === 'stealth' && it.good.includes('angler')), 'gizlenen düşman için Fener Balığı öneriliyor');
}

console.log(fails ? `${fails} BASARISIZ` : 'HEPSI GECTI');
process.exit(fails ? 1 : 0);
