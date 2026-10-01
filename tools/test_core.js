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
console.log(fails ? `${fails} BASARISIZ` : 'HEPSI GECTI');
process.exit(fails ? 1 : 0);
