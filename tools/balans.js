// Denge simülasyonu: oyunu tarayıcısız oynatan basit botlar.
//   node tools/balans.js              -> tüm haritalar, normal zorluk
//   node tools/balans.js mercan hard  -> tek harita, tek zorluk
//   node tools/balans.js "" all       -> tüm haritalar, üç zorluk
//   HPSCALE=1.4 node tools/balans.js yosun  -> haritanın hpScale değerini denemek için
//   NOMECH=1 node tools/balans.js buz       -> haritanın özel kuralı olmadan (kuralın etkisini ölçmek için)
//
// Botlar:
//   spam     her yere tek tür kule dikip yükselten oyuncu
//   rastgele düşünmeden rastgele tür / rastgele yer / rastgele yükseltme ile enerjiyi bitiren oyuncu
//   karisik  türleri sırayla kullanan, en iyi yerlere dizen oyuncu
//   akilli   sıradaki dalgayı inceleyip ona göre tür seçen, uzun menzilliyi uzak yere, kısa menzilliyi yola yakın dizen oyuncu
// Amaç: spam ve rastgele kaybetsin, karisik ve özellikle akilli kazansın (strateji karşılığını versin).
const path = require('path');
const web = path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js');
const Core = require(process.env.CORE || path.join(web, 'core.js'));
const MAPS = require(path.join(web, 'maps.js'));

// bir yerin yola ne kadar uzunluk boyunca menzil verdiği
function coverage(world, spot, range) {
    let covered = 0;
    for (const p of world.paths) {
        for (let i = 1; i < p.points.length; i++) {
            const a = p.points[i];
            if (Math.hypot(a.x - spot.x, a.y - spot.y) <= range) covered += p.dist[i] - p.dist[i - 1];
        }
    }
    return covered * (spot.kind === 'high' ? 1.35 : 1);
}

function rankedSpots(world) {
    return world.spots.slice().sort((a, b) => coverage(world, b, 200) - coverage(world, a, 200));
}

const PREFERENCE = ['jellyfish', 'octopus', 'swordfish', 'eel', 'puffer', 'octopus', 'angler'];

const BOTS = {
    // her yere tek tür (ahtapot varsa o), yer bitince yükselt
    spam(world) {
        const type = world.available.includes('octopus') ? 'octopus' : world.available[0];
        const spots = rankedSpots(world);
        for (;;) {
            const free = spots.find(s => !s.tower);
            if (free && world.money >= world.towerCost(type)) { world.placeTower(type, free); continue; }
            if (!free) {
                const up = world.towers.filter(t => t.upgradeCost() !== null && world.money >= t.upgradeCost())
                    .sort((a, b) => a.level - b.level)[0];
                if (up) { world.upgradeTower(up); continue; }
            }
            break;
        }
    },

    karisik: makeMixBot(false),
    akilli: makeMixBot(true),
};

// rastgele oynayan bot: sabit tohumlu, enerji bitene kadar harcar
function makeRandomBot(seed) {
    const rng = Core.mulberry32(seed);
    const pick = arr => arr[Math.floor(rng() * arr.length)];
    return function rastgele(world) {
        for (let guard = 0; guard < 200; guard++) {
            const frees = world.spots.filter(s => !s.tower);
            const ups = world.towers.filter(t => t.upgradeCost() !== null && world.money >= t.upgradeCost());
            const type = pick(world.available);
            if (ups.length && (!frees.length || rng() < 0.3)) { world.upgradeTower(pick(ups)); continue; }
            if (frees.length && world.money >= world.towerCost(type)) { world.placeTower(type, pick(frees)); continue; }
            break;
        }
    };
}

// Türleri tercih sırasıyla döngüyle kullanır, 7 kuleden sonra yükseltmeye ağırlık verir.
// Karanlık haritada gerçek oyuncu gibi önce Fener Balığı koyar ve diğer kuleleri ışığın içine dizer.
// smart=true ise 7. kuleden sonra sıradaki dalganın içeriğine bakıp (zırhlı, uçan, sürü) o dalgaya uygun türü öne çıkarır.
function makeMixBot(smart) {
    return function (world) {
        const spots = rankedSpots(world);
        const dark = world.darkMul < 1;
        const order = PREFERENCE.filter(t => world.available.includes(t));
        const has = t => world.available.includes(t);
        for (;;) {
            const frees = spots.filter(s => !s.tower);
            const n = world.towers.length;
            let type = order[n % order.length];
            if (smart && n >= 7) type = counterPick(world, type, n);
            let spot;
            if (dark) {
                const lantern = world.towers.find(t => t.type === 'angler');
                if (!lantern) {
                    type = 'angler';
                    spot = frees.slice().sort((a, b) => lit(world, b, frees) - lit(world, a, frees))[0];
                } else {
                    const inLight = frees.filter(s => Math.hypot(s.x - lantern.x, s.y - lantern.y) <= world.lightRadius(lantern));
                    spot = (inLight.length ? inLight : frees)[0];
                }
            } else {
                spot = frees[0];
            }
            const ups = world.towers.filter(t => t.upgradeCost() !== null && world.money >= t.upgradeCost())
                .sort((a, b) => a.level - b.level || b.id - a.id);
            if (spot && n < 7 && world.money >= world.towerCost(type)) { world.placeTower(type, spot); continue; }
            if (n >= 6 && ups.length) { world.upgradeTower(ups[0]); continue; }
            if (spot && world.money >= world.towerCost(type)) { world.placeTower(type, spot); continue; }
            break;
        }
    };
}

// sıradaki dalgaya karşı en uygun tür: zırhlıya zırh delen, uçana havaya vuran, sürüye alan hasarı
function counterPick(world, dflt, n) {
    const has = t => world.available.includes(t);
    const mix = Core.summarizePlan(world.planFor(Math.max(1, Math.min(world.totalWaves, world.wave + 1))));
    const total = Object.values(mix).reduce((a, b) => a + b, 0) || 1;
    const share = k => (mix[k] || 0) / total;
    const count = list => world.towers.filter(x => list.includes(x.type)).length;
    const antiArmor = ['eel', 'swordfish', 'angler'].filter(has);
    const antiAir = ['octopus', 'angler', 'jellyfish'].filter(has);
    if (share('armored') >= 0.22 && antiArmor.length && count(antiArmor) < n * 0.4) return antiArmor[n % antiArmor.length];
    if (share('flying') >= 0.22 && antiAir.length && count(antiAir) < n * 0.6 && (dflt === 'eel' || dflt === 'puffer')) return antiAir[n % antiAir.length];
    if (share('swarm') >= 0.3 && has('puffer') && count(['puffer']) < n * 0.25) return 'puffer';
    return dflt;
}

function lit(world, spot, frees) {
    const r = Core.TOWER_TYPES.angler.range * 1.4;
    return frees.filter(s => Math.hypot(s.x - spot.x, s.y - spot.y) <= r).length;
}

function play(map, botName, diff, seed) {
    const world = new Core.World(map, { difficulty: diff, seed });
    const bot = botName === 'rastgele' ? makeRandomBot(seed * 31 + 7) : BOTS[botName];
    const leaks = {};
    world.onEvent = (type, d) => {
        if (type === 'leak') { const k = d.enemy.type + '@w' + world.wave; leaks[k] = (leaks[k] || 0) + 1; }
    };
    let t = 0;
    let nextAct = 0;
    const dt = 1 / 30;
    while (!world.result && t < 3600) {
        if (t >= nextAct) {
            bot(world);
            if (world.enemies.length === 0 && world.canStartWave()) world.startWave();
            nextAct = t + 0.5;
        }
        world.update(dt);
        t += dt;
        if (process.env.TIMELINE && Math.abs(t - Math.round(t / 40) * 40) < dt / 2 && t > 1) console.log(`  ${botName} ${Math.round(t)}s w${world.wave} $${world.money} kule${world.towers.length} lv[${world.towers.map(x => x.level).join('')}] oldurme${world.stats.kills} sizan${world.stats.leaks} can${Math.round(world.health)}`);
    }
    return {
        result: world.result || 'timeout',
        wave: world.wave,
        health: Math.max(0, Math.round(world.health)),
        towers: world.towers.length,
        money: world.money,
        sec: Math.round(t),
        leaks,
    };
}

if (process.env.BOSSHP) Core.ENEMY_TYPES.boss.hp = +process.env.BOSSHP;   // patron canını denemek için
const [mapArg, diffArg] = process.argv.slice(2);
const maps = MAPS.filter(m => !mapArg || m.id === mapArg)
    .map(m => (process.env.HPSCALE ? Object.assign({}, m, { hpScale: +process.env.HPSCALE }) : m))
    .map(m => (process.env.NOMECH ? Object.assign({}, m, { mechanics: [] }) : m));
const diffs = diffArg === 'all' ? ['easy', 'normal', 'hard'] : [diffArg || 'normal'];
const SEEDS = (process.env.SEEDS ? process.env.SEEDS.split(',').map(Number) : [11, 23, 37]);

console.log('harita'.padEnd(10), 'zorluk'.padEnd(7), 'bot'.padEnd(8), 'kazanma', 'ort.can', 'ort.dalga', 'kule', 'enerji', 'sure');
for (const map of maps) {
    for (const diff of diffs) {
        for (const bot of (process.env.BOTS ? process.env.BOTS.split(',') : ['spam', 'rastgele', 'karisik', 'akilli'])) {
            const runs = SEEDS.map(s => play(map, bot, diff, s));
            if (process.env.DEBUG) console.log(JSON.stringify(runs));
            const wins = runs.filter(r => r.result === 'win').length;
            const avg = k => (runs.reduce((a, r) => a + r[k], 0) / runs.length).toFixed(0);
            console.log(
                map.id.padEnd(10), diff.padEnd(7), bot.padEnd(8),
                `${wins}/${runs.length}`.padEnd(7), avg('health').padStart(7), `${avg('wave')}/${Core.totalWavesOf(map)}`.padStart(9),
                avg('towers').padStart(4), avg('money').padStart(6), avg('sec').padStart(5) + 's');
        }
    }
}
