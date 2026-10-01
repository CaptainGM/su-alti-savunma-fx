// Denge simülasyonu: oyunu tarayıcısız oynatan basit botlar.
//   node tools/balans.js              -> tüm haritalar, normal zorluk
//   node tools/balans.js mercan hard  -> tek harita, tek zorluk
//   node tools/balans.js "" all       -> tüm haritalar, üç zorluk
//   HPSCALE=1.4 node tools/balans.js yosun  -> haritanın hpScale değerini denemek için
//   NOMECH=1 node tools/balans.js buz       -> haritanın özel kuralı olmadan (kuralın etkisini ölçmek için)
//
// "spam" her yere tek tür kule dikip yükselten oyuncuyu, "karisik" ise türleri dengeli kullanan oyuncuyu temsil eder.
// Amaç: spam stratejisi karışık stratejiden belirgin şekilde kötü sonuç versin.
const path = require('path');
const web = path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js');
const Core = require(path.join(web, 'core.js'));
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

// destek kulesi için: yakınında en çok kule olan boş yer
function bestSupportSpot(world, free) {
    let best = null;
    let bestN = -1;
    for (const s of free) {
        const n = world.towers.filter(t => !t.support && Math.hypot(t.x - s.x, t.y - s.y) <= 190).length;
        if (n > bestN) { bestN = n; best = s; }
    }
    return best;
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

    // haritadaki türleri tercih sırasıyla döngüyle kullanır, 7 kuleden sonra yükseltmeye ağırlık verir.
    // Karanlık haritada gerçek oyuncu gibi önce Fener Balığı koyar ve diğer kuleleri ışığın içine dizer.
    karisik(world) {
        const spots = rankedSpots(world);
        const dark = world.darkMul < 1;
        const order = PREFERENCE.filter(t => world.available.includes(t));
        for (;;) {
            let frees = spots.filter(s => !s.tower);
            const n = world.towers.length;
            let type = order[n % order.length];
            let spot;
            if (dark) {
                const lantern = world.towers.find(t => t.support);
                if (!lantern) {
                    type = 'angler';
                    // en çok boş yeri ışığına alan konum
                    spot = frees.slice().sort((a, b) => lit(world, b, frees) - lit(world, a, frees))[0];
                } else {
                    if (type === 'angler') type = order.find(t => t !== 'angler');
                    const inLight = frees.filter(s => Math.hypot(s.x - lantern.x, s.y - lantern.y) <= world.lightRadius(lantern));
                    spot = (inLight.length ? inLight : frees)[0];
                }
            } else {
                spot = type === 'angler' ? bestSupportSpot(world, frees) : frees[0];
            }
            const ups = world.towers.filter(t => t.upgradeCost() !== null && world.money >= t.upgradeCost())
                .sort((a, b) => (a.support - b.support) || a.level - b.level || b.id - a.id);
            if (spot && n < 7 && world.money >= world.towerCost(type)) { world.placeTower(type, spot); continue; }
            if (n >= 6 && ups.length) { world.upgradeTower(ups[0]); continue; }
            if (spot && world.money >= world.towerCost(type)) { world.placeTower(type, spot); continue; }
            break;
        }
    },
};

function lit(world, spot, frees) {
    const r = Core.TOWER_TYPES.angler.range * 1.4;
    return frees.filter(s => Math.hypot(s.x - spot.x, s.y - spot.y) <= r).length;
}

function play(map, botName, diff, seed) {
    const world = new Core.World(map, { difficulty: diff, seed });
    const bot = BOTS[botName];
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
    }
    return {
        result: world.result || 'timeout',
        wave: world.wave,
        health: Math.max(0, Math.round(world.health)),
        towers: world.towers.length,
        money: world.money,
        sec: Math.round(t),
    };
}

const [mapArg, diffArg] = process.argv.slice(2);
const maps = MAPS.filter(m => !mapArg || m.id === mapArg)
    .map(m => (process.env.HPSCALE ? Object.assign({}, m, { hpScale: +process.env.HPSCALE }) : m))
    .map(m => (process.env.NOMECH ? Object.assign({}, m, { mechanics: [] }) : m));
const diffs = diffArg === 'all' ? ['easy', 'normal', 'hard'] : [diffArg || 'normal'];
const SEEDS = [11, 23, 37];

console.log('harita'.padEnd(10), 'zorluk'.padEnd(7), 'bot'.padEnd(8), 'kazanma', 'ort.can', 'ort.dalga', 'kule', 'enerji', 'sure');
for (const map of maps) {
    for (const diff of diffs) {
        for (const bot of Object.keys(BOTS)) {
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
