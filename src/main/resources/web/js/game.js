// Çizim, efekt, ses ve arayüz. Oyun kuralları js/core.js içindedir, haritalar js/maps.js içinde.
'use strict';

// tuval boyutu haritadan gelir (varsayılan 1350x900 = 3:2)
let W = 1350;
let H = 900;
// kule, düşman ve mermi çizimleri tüm haritalarda ortaktır; haritaya özel olan arka plan ve kule listesidir
const SPRITE_FILES = {
    towers: {
        octopus: 'assets/tower_octopus.png', eel: 'assets/tower_eel.png', jellyfish: 'assets/jellyfish.png',
        swordfish: 'assets/tower_swordfish.png', swordfish_base: 'assets/tower_swordfish_base.png', swordfish_fish: 'assets/tower_swordfish_fish.png', angler: 'assets/tower_angler.png',
        puffer: 'assets/tower_puffer_icon.png', puffer_body: 'assets/tower_puffer.png', puffer_barrel: 'assets/tower_puffer_barrel.png',
    },
    enemies: {
        standard: 'assets/enemy_shark.png', armored: 'assets/enemy_lobster.png', flying: 'assets/enemy_ray.png',
        swarm: 'assets/enemy_pup.png', boss_shark: 'assets/enemy_king.png', boss_crab: 'assets/enemy_king_crab.png',
        boss_manta: 'assets/enemy_king_manta.png', boss_brood: 'assets/enemy_king_brood.png',
    },
    projectiles: {
        octopus: 'assets/projectile_octopus.png', eel: 'assets/projectile_eel.png', jellyfish: 'assets/projectile_jellyfish.png',
        swordfish: 'assets/projectile_swordfish.png', puffer: 'assets/projectile_puffer.png', angler: 'assets/projectile_angler.png',
    },
};
const towerOrder = () => currentMap.towers;
const MODE_LABEL = { first: 'İlk', last: 'Son', strong: 'En Güçlü', close: 'En Yakın' };

// ------------------------------------------------------------------ kayıtlar (js/settings.js)

let difficulty = Settings.difficulty();
if (!Core.DIFFICULTY[difficulty]) difficulty = 'normal';

function starsFor(health, maxHealth) {
    const f = health / maxHealth;
    return f >= 0.8 ? 3 : f >= 0.4 ? 2 : 1;
}
function recordKey(map) { return map.id + ':' + difficulty; }

// Java kayıtlı verileri yükleyince çağrılır
function refreshAfterLoad() {
    difficulty = Settings.difficulty();
    if (!Core.DIFFICULTY[difficulty]) difficulty = 'normal';
    if (!document.getElementById('mapSelectScreen').classList.contains('hidden')) renderMapSelectScreen();
}

// ------------------------------------------------------------------ görseller

const imageCache = {};
function loadImage(src) {
    if (!src) return null;
    if (!imageCache[src]) {
        const img = new Image();
        img.src = src;
        imageCache[src] = img;
    }
    return imageCache[src];
}
const ready = img => img && img.complete && img.naturalWidth > 0;

// JavaFX WebView'da 500 pikselik bir resmi her karede 80 piksele küçültmek çok pahalı (kare başına ~0,6 ms).
// Bu yüzden her sprite, çizileceği boyuta bir kez küçültülüp küçük bir tuvale kaydedilir ve oradan çizilir.
const spriteCache = new Map();
function fit(img, nominal) {
    if (!ready(img)) return img;
    const px = Math.max(8, Math.round(nominal * res));
    const key = img.src + '|' + px;
    let c = spriteCache.get(key);
    if (!c) {
        c = document.createElement('canvas');
        c.width = c.height = px;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(img, 0, 0, px, px);
        spriteCache.set(key, c);
    }
    return c;
}
// yumuşak ışık lekesi: her karede gradyan üretmemek için bir kez çizilip saklanır (alfa ile kullanılır)
const glowCache = new Map();
function glowSprite(rgb, r) {
    const key = `${rgb}|${r}|${res}`;
    let c = glowCache.get(key);
    if (!c) {
        const px = Math.ceil(2 * r * res);
        c = document.createElement('canvas');
        c.width = c.height = px;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
        grad.addColorStop(0, `rgba(${rgb},1)`);
        grad.addColorStop(0.45, `rgba(${rgb},0.35)`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, px, px);
        glowCache.set(key, c);
    }
    return c;
}

function clearSpriteCache() {
    glowCache.clear();
    spriteCache.clear();
    if (typeof darkSpriteCache !== 'undefined') darkSpriteCache.clear();
    if (typeof spotCache !== 'undefined') spotCache.clear();
}

let sprites = null;
function loadSprites(map) {
    sprites = { bg: loadImage(map.bg), towers: {}, enemies: {}, projectiles: {} };
    Object.keys(SPRITE_FILES.towers).forEach(k => { sprites.towers[k] = loadImage(SPRITE_FILES.towers[k]); });
    Object.keys(SPRITE_FILES.enemies).forEach(k => { sprites.enemies[k] = loadImage(SPRITE_FILES.enemies[k]); });
    Object.keys(SPRITE_FILES.projectiles).forEach(k => { sprites.projectiles[k] = loadImage(SPRITE_FILES.projectiles[k]); });
    sprites.caustics = map.ambient && map.ambient.caustics ? loadImage('assets/fx/caustics.png') : null;
}
function enemyKey(type, kind) { return type === 'boss' ? 'boss_' + (kind || 'shark') : type; }
function enemySprite(e) { return sprites.enemies[enemyKey(e.type, e.kind)] || sprites.enemies.standard; }
// dalga özeti ve önizleme için tür adı
function typeName(type) {
    if (type === 'boss') return Core.BOSS_KINDS[currentMap.boss || 'shark'].name;
    return (currentMap.enemyNames && currentMap.enemyNames[type]) || Core.ENEMY_NAMES[type] || type;
}

// ------------------------------------------------------------------ durum

let currentMapIndex = 0;
let currentMap = MAPS[0];
let world = null;
let logQueue = [];
let lastLogFlush = 0;
let paused = false;
let speedMultiplier = 1;
let selectedTower = null;
let hoverSpot = null;
let armedType = null;
let draggedType = null;
let animTime = 0;
let lastFrame = 0;
let rafId = 0;
let frameDue = 0;
const perf = { frames: 0, since: 0, fps: 0, drawMs: 0, drawAcc: 0 };
let endDelay = 0;
let endShown = false;
let fx = { floaters: [], rings: [], bubbles: [], flash: 0, warns: [], sparks: [], guardGlow: [], toasts: [], furies: [], meteors: [], chomps: [], arcs: [] };
let ambient = null;
let res = 1;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// ------------------------------------------------------------------ Java köprüsü

// Sesler Java tarafında (SoundBank) üretilir; burada yalnızca adı ve sıklığı belirlenir.
const lastSfx = {};
function sfx(name, minGapMs = 0, gain = 1) {
    const st = Settings.get();
    if (st.mute || st.sfx <= 0) return;
    const now = performance.now();
    if (minGapMs && lastSfx[name] && now - lastSfx[name] < minGapMs) return;
    lastSfx[name] = now;
    try {
        if (window.javaBridge && window.javaBridge.playSfx) window.javaBridge.playSfx(name, st.sfx * gain);
    } catch (e) { /* ses köprüsü hazır değilse sessizce yok say */ }
}

// patron ayaktayken yükselen gerilim: kalp atışı
let heartTimer = 0;
function tensionTick(dt) {
    let boss = null;
    for (const e of world.enemies) {
        if (e.type === 'boss' && e.health > 0 && (!boss || e.progress > boss.progress)) boss = e;
    }
    if (!boss) { heartTimer = 0.6; return; }
    heartTimer -= dt;
    if (heartTimer <= 0) {
        sfx('heartbeat', 0, boss.mini ? 0.7 : 1);
        heartTimer = 1.3 - 0.65 * Math.min(1, boss.progress);
    }
    fx.tension = Math.max(fx.tension || 0, 0.25 + 0.5 * boss.progress);
}

// ------------------------------------------------------------------ günlük

const pad3 = id => String(id).padStart(3, '0');
const label = o => `'${o.name}-ID${pad3(o.id)}'`;

// Günlük arayüzde gösterilmez; Java tarafı her oyun için loglar/<harita>_<tarih>.txt dosyasına yazar.
// Satırlar biriktirilir ve saniyede bir toplu gönderilir (her satır için köprü çağrısı yapılmaz).
function logBridge(name, arg) {
    try {
        if (window.javaBridge && window.javaBridge[name]) window.javaBridge[name](arg);
    } catch (e) { /* köprü yoksa (tarayıcıda test) yok say */ }
}

function logStart() {
    logQueue = [];
    logBridge('startLog', `${currentMap.name} (${Core.DIFFICULTY[difficulty].label})`);
    addLog(`Oyun başladı: ${currentMap.name}, zorluk: ${Core.DIFFICULTY[difficulty].label}, başlangıç canı: ${world.maxHealth}, enerji: ${world.money}.`);
}

function addLog(msg) {
    logQueue.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function flushLog() {
    lastLogFlush = performance.now();
    if (!logQueue.length) return;
    const text = logQueue.join('\n');
    logQueue = [];
    logBridge('appendLog', text);
}

function logEnd() {
    flushLog();
    logBridge('endLog');
}

function buildReport() {
    if (!world) return '';
    let txt = '\n================================================\nSON DURUM RAPORU\n================================================\n';
    txt += `Harita: ${currentMap.name} (${Core.DIFFICULTY[difficulty].label})\n`;
    txt += `Kalan Can: ${Math.max(0, Math.ceil(world.health))}\nKalan Enerji: ${world.money}\n`;
    txt += `Ulaşılan Dalga: ${world.wave}/${world.totalWaves}${world.endless ? ' (sonsuz mod)' : ''}\n`;
    txt += `Kalan Kule: ${world.towers.length}\nYok Edilen Düşman: ${world.stats.kills}\nKaybedilen Kule: ${world.stats.lost || 0}\n`;
    txt += `Tarih: ${new Date().toLocaleString()}\n`;
    txt += world.result === 'win' ? '\nSON: Tüm dalgalar temizlendi. OYUN KAZANILDI!\n' : '\nSON: Üs düştü. OYUN KAYBEDİLDİ!\n';
    return txt;
}

// oyuncuya kısa bilgi (üstte kaybolan bildirim); ayrıca günlüğe de yazılır
function notify(text, color) {
    fx.toasts.push({ text, color: color || '#ffffff', life: 3.2, max: 3.2 });
    if (fx.toasts.length > 3) fx.toasts.shift();
    addLog(text);
}

// ------------------------------------------------------------------ dünya olayları

function onWorldEvent(type, d) {
    switch (type) {
        case 'hazardWarn':
            if (d.type === 'eruption') {
                sfx('rumble');
                d.points.forEach(p => fx.warns.push({ x: p.x, y: p.y, r: p.r, life: d.time, max: d.time }));
                addLog('Yanardağ homurdanıyor! Lav patlaması geliyor.');
                fx.alert = { text: 'LAV PATLAMASI', life: 1.8, max: 1.8 };
            } else if (d.type === 'blizzard') {
                sfx('wind');
                addLog('Kar fırtınası yaklaşıyor!');
            }
            break;
        case 'hazardStart':
            addLog(`Kar fırtınası başladı: kule menzilleri kısaldı (${d.time} sn).`);
            break;
        case 'hazardEnd':
            addLog('Kar fırtınası dindi, menziller geri geldi.');
            break;
        case 'eruption': {
            sfx('eruption');
            fx.shake = Math.max(fx.shake || 0, 0.9);
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.r * 1.25, life: 0.7, maxLife: 0.7, color: '255,120,30', fill: true });
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.r * 0.8, life: 0.45, maxLife: 0.45, color: '255,220,120', fill: true });
            for (let i = 0; i < 40; i++) {
                const a = Math.random() * 6.2832;
                const sp = 80 + Math.random() * 260;
                fx.sparks.push({ x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.7 + Math.random() * 0.8, max: 1.5, r: 2 + Math.random() * 3.5, c: Math.random() < 0.5 ? '255,160,40' : '255,90,30' });
            }
            break;
        }
        case 'towerStun':
            d.tower.stunMax = d.time;
            addLog(`${label(d.tower)} aşırı ısındı, ${d.time} sn ateş edemez.`);
            break;
        case 'meteor':
            sfx('meteor');
            fx.meteors.push({ x: d.x, y: d.y, life: d.time, max: d.time });
            break;
        case 'towerDestroyed': {
            const tw = d.tower;
            if (selectedTower === tw) closeTowerModal();
            renderTowerList();
            if (d.cause === 'patron') {
                // yeme animasyonu çizimde (drawChomps); çene kapandığında ses ve parçalar çıkar
                fx.chomps.push({ x: tw.x, y: tw.y, type: tw.type, life: 1.15, max: 1.15, snapped: false });
                const by = d.by;
                notify(`${by ? by.name : 'Patron'} ${by && by.fury ? by.fury.verb : 'yuttu'}: ${tw.name} yok oldu!`, '#ff8a9a');
            } else {
                sfx('eruption');
                fx.shake = Math.max(fx.shake || 0, 0.8);
                fx.rings.push({ x: tw.x, y: tw.y, r: 10, max: 120, life: 0.7, maxLife: 0.7, color: '255,110,30', fill: true });
                for (let i = 0; i < 34; i++) {
                    const a = Math.random() * 6.2832;
                    const sp = 80 + Math.random() * 240;
                    fx.sparks.push({ x: tw.x, y: tw.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70, life: 0.6 + Math.random() * 0.8, max: 1.4, r: 2 + Math.random() * 4, c: Math.random() < 0.5 ? '255,150,40' : '70,40,30' });
                }
                notify(`${tw.name} lav kayasıyla yok oldu!`, '#ff9a6a');
            }
            break;
        }
        case 'bossFury':
            sfx('roar');
            fx.shake = Math.max(fx.shake || 0, 0.45);
            fx.furies.push({ boss: d.enemy, towers: d.towers, life: d.time, max: d.time });
            fx.alert = { text: 'PATRON SALDIRIYOR', life: d.time + 0.3, max: d.time + 0.3 };
            addLog(`${d.enemy.name} öfkelendi ve ${d.towers.map(t => t.name).join(', ')} kulesini hedef aldı.`);
            break;
        case 'guardianWarn': {
            const gi = nearestGuardian(d.x, d.y);
            if (gi >= 0) fx.guardGlow[gi] = 1.2;
            break;
        }
        case 'guardianPulse':
            sfx('gong');
            fx.shake = Math.max(fx.shake || 0, d.hits ? 0.35 : 0.15);
            fx.rings.push({ x: d.x, y: d.y, r: 20, max: d.r, life: 0.9, maxLife: 0.9, color: '120,255,230', fill: true });
            if (d.hits) addLog(`Koruyucu küre vurdu: ${d.hits} düşman hasar aldı ve sersemledi.`);
            break;
        case 'treasureOpen':
            sfx('upgrade', 0, 0.6);
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: 70, life: 0.6, maxLife: 0.6, color: '255,215,80' });
            addLog('Batık sandık parlıyor! Tıklayıp altını topla.');
            break;
        case 'treasureTaken':
            sfx('sell');
            addFloater({ x: d.x, y: d.y - 30, text: '+' + d.reward, color: '#ffd84a', life: 1.4, maxLife: 1.4, big: true, important: true });
            addLog(`Hazine toplandı: +${d.reward} Enerji.`);
            break;
        case 'build':
            sfx('build');
            addLog(`Kullanıcı, (${Math.floor(d.tower.x)}, ${Math.floor(d.tower.y)}) konumuna '${d.tower.name}-ID${pad3(d.tower.id)}' inşa etti. Kalan Enerji: ${world.money}.`);
            fx.rings.push({ x: d.tower.x, y: d.tower.y, r: 20, max: 70, life: 0.5, maxLife: 0.5, color: '120,255,200' });
            break;
        case 'upgrade':
            sfx('upgrade');
            if (d.perk) {
                notify(`${d.tower.name}: ${d.perk.name} yeteneği açıldı`, '#ffd45a');
                for (let i = 0; i < 14; i++) {
                    const a = Math.random() * 6.2832;
                    fx.sparks.push({ x: d.tower.x, y: d.tower.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150 - 40, life: 0.7, max: 0.7, r: 3, c: '255,212,90' });
                }
            }
            addLog(`'${d.tower.name}-ID${pad3(d.tower.id)}' Seviye ${d.tower.level}'e yükseltildi. Kalan Enerji: ${world.money}.`);
            fx.rings.push({ x: d.tower.x, y: d.tower.y, r: 25, max: 90, life: 0.6, maxLife: 0.6, color: '255,220,90' });
            break;
        case 'sell':
            sfx('sell');
            addLog(`'${d.tower.name}-ID${pad3(d.tower.id)}' satıldı. +${d.refund} Enerji. Kalan Enerji: ${world.money}.`);
            break;
        case 'waveStart': {
            const info = Object.entries(d.counts).map(([t, c]) => `${typeName(t)}: ${c}`).join(', ');
            addLog(`=== DALGA ${d.wave} BAŞLADI === (${info}, Toplam: ${d.total})`);
            sfx('wave_start');
            saveProgress();
            break;
        }
        case 'spawn':
            addLog(`${d.enemy.name} haritaya girdi.`);
            if (d.enemy.type === 'boss') {
                sfx(d.enemy.mini ? 'boss_warn_mini' : 'boss_warn');
                fx.alert = { text: d.enemy.mini ? 'ARA PATRON GELİYOR' : 'PATRON GELİYOR', life: d.enemy.mini ? 2.6 : 4.2, max: d.enemy.mini ? 2.6 : 4.2 };
                fx.tension = 1;
            }
            break;
        case 'fire':
            sfx('fire_' + d.tower.type, d.tower.type === 'octopus' ? 40 : 55);
            if (d.tower.type === 'puffer') {
                // namlu ucundan duman
                const a = d.tower.aim !== undefined ? d.tower.aim : -1;
                const mx = d.tower.x + Math.cos(a) * 46;
                const my = d.tower.y - 17 + Math.sin(a) * 46;
                for (let i = 0; i < 9; i++) {
                    fx.sparks.push({ x: mx, y: my, vx: Math.cos(a) * 60 + (Math.random() - 0.5) * 70, vy: Math.sin(a) * 60 + (Math.random() - 0.5) * 70 - 20, life: 0.5 + Math.random() * 0.4, max: 0.9, r: 3 + Math.random() * 4, c: '205,210,215' });
                }
            }
            break;
        case 'aoe':
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.radius * 1.15, life: 0.45, maxLife: 0.45, color: '255,230,80', aoeImg: true });
            break;
        case 'chain':
            sfx('zap_small', 60);
            fx.arcs.push({ pts: d.points, life: 0.32, max: 0.32, color: '170,235,255', seed: Math.random() * 100 });
            break;
        case 'overload':
            sfx('fire_eel');
            fx.shake = Math.max(fx.shake || 0, 0.3);
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.radius * 1.5, life: 0.6, maxLife: 0.6, color: '255,255,150', fill: true });
            addFloater({ x: d.x, y: d.y - 24, text: 'AŞIRI YÜK', color: '#fff27a', life: 1.0, maxLife: 1.0, important: true });
            break;
        case 'pulse':
            sfx('rumble', 300, 0.5);
            fx.rings.push({ x: d.x, y: d.y, r: 20, max: d.radius, life: 0.8, maxLife: 0.8, color: '90,190,255', fill: true });
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.radius * 0.7, life: 0.6, maxLife: 0.6, color: '170,225,255' });
            break;
        case 'crit':
            sfx('hit', 30);
            addFloater({ x: d.x, y: d.y - 20, text: 'KRİTİK ' + Math.round(d.dmg), color: '#ffd45a', life: 0.9, maxLife: 0.9, important: true });
            for (let i = 0; i < 10; i++) {
                const a = Math.random() * 6.2832;
                fx.sparks.push({ x: d.x, y: d.y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: 0.4, max: 0.4, r: 2.5, c: '255,226,110' });
            }
            break;
        case 'salvo':
            sfx('fire_swordfish');
            fx.rings.push({ x: d.tower.x, y: d.tower.y, r: 30, max: 90, life: 0.4, maxLife: 0.4, color: '255,255,255' });
            break;
        case 'gas':
            sfx('splash', 80, 0.5);
            fx.rings.push({ x: d.x, y: d.y, r: 10, max: d.radius, life: 0.6, maxLife: 0.6, color: '120,230,80', fill: true });
            break;
        case 'splash':
            sfx('splash', 50);
            fx.rings.push({ x: d.x, y: d.y, r: 8, max: d.radius, life: 0.5, maxLife: 0.5, color: '255,150,60', fill: true });
            spawnBubbles(d.x, d.y, 6);
            break;
        case 'brood':
            sfx('roar');
            fx.shake = Math.max(fx.shake || 0, 0.5);
            addLog(`${label(d.enemy)} yavrularını saçtı! (+${d.count} yavru köpek balığı)`);
            fx.rings.push({ x: d.enemy.x, y: d.enemy.y, r: 20, max: 110, life: 0.7, maxLife: 0.7, color: '255,120,120' });
            break;
        case 'hit': {
            sfx('hit', 38);
            const slowText = d.slowed ? `, Yavaşlatma %${Math.round(d.tower.slow * 100)} (${d.tower.slowTime} sn) uygulandı` : '';
            addLog(`${d.tower.type === 'eel' ? 'Şok alanı' : d.tower.type === 'puffer' ? 'Patlama' : 'Mermi'} isabet: ${label(d.enemy)} Net Hasar: ${d.dmg.toFixed(1)}${slowText}. Kalan Can: ${d.enemy.health.toFixed(0)}/${d.enemy.maxHealth}`);
            break;
        }
        case 'kill':
            addLog(`${label(d.enemy)} öldü. Ödül +${d.reward}. Toplam Enerji: ${world.money}.`);
            if (d.enemy.type === 'boss' && !d.enemy.mini) {
                sfx('boss_kill');
                fx.shake = 1;
                fx.tension = 0;
            } else {
                sfx('kill', 40);
            }
            spawnBubbles(d.enemy.x, d.enemy.y, d.enemy.type === 'boss' ? 26 : 8);
            addFloater({ x: d.enemy.x, y: d.enemy.y - 30, text: '+' + d.reward, color: '#ffd84a', life: 1.0, maxLife: 1.0 });
            break;
        case 'leak':
            addLog(`${label(d.enemy)} üsse ulaştı. Oyuncu Canı: ${Math.max(0, Math.round(world.health))} (-${d.enemy.damage}).`);
            sfx('leak', 140);
            fx.flash = 1;
            addFloater({ x: d.enemy.x, y: d.enemy.y - 20, text: '-' + d.enemy.damage, color: '#ff5a64', life: 1.2, maxLife: 1.2 });
            break;
        case 'adapt': {
            const names = Object.entries(d.adapt).map(([t, r]) => `${towerTypeName(t)} %${Math.round(r * 100)}`);
            uiCache.preview = null;
            if (names.length) {
                notify(`Düşmanlar alışıyor: ${names.join(', ')} daha az hasar veriyor. Farklı kule türleri kullan!`, '#ffd27a');
                sfx('click');
            } else {
                addLog('Düşmanlar alışmayı bıraktı.');
            }
            break;
        }
        case 'waveClear':
            addLog(`Dalga temizlendi! Dalga bonusu: +${d.bonus} Enerji. Toplam Enerji: ${world.money}.`);
            sfx('wave_clear');
            saveProgress();
            addFloater({ x: W / 2, y: 120, text: `Dalga temizlendi  +${d.bonus}`, color: '#7dffb0', life: 2.0, maxLife: 2.0, big: true });
            break;
        case 'end':
            sfx(d.won ? 'win' : 'lose');
            endDelay = 0.9;
            break;
    }
}

function addFloater(f) {
    if (Settings.get().floaters || f.important) fx.floaters.push(f);
}

function nearestGuardian(x, y) {
    const list = currentMap.guardians || [];
    let best = -1;
    let bd = 1e9;
    list.forEach((g, i) => {
        const dd = Math.hypot(g.x - x, g.y - y);
        if (dd < bd) { bd = dd; best = i; }
    });
    return best;
}

function spawnBubbles(x, y, n) {
    for (let i = 0; i < n; i++) {
        fx.bubbles.push({
            x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 50,
            r: 2 + Math.random() * 4, life: 0.7 + Math.random() * 0.5, maxLife: 1.2,
        });
    }
}

// ------------------------------------------------------------------ harita ve oyun başlatma

function buildAmbient(map) {
    const a = map.ambient || {};
    const out = { motes: [], rays: [], bubbles: [] };
    for (let i = 0; i < (a.motes || 0); i++) {
        out.motes.push({ x: Math.random() * W, y: Math.random() * H, r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6.28, sp: 6 + Math.random() * 14 });
    }
    for (let i = 0; i < (a.bubbles || 0); i++) {
        out.bubbles.push({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 5, sp: 18 + Math.random() * 30, ph: Math.random() * 6.28 });
    }
    for (let i = 0; i < ((a.rays && a.rays.count) || 0); i++) {
        out.rays.push({ x: (i + 0.5) / a.rays.count * W * 1.3 - 120, w: 70 + Math.random() * 110, ph: Math.random() * 6.28, sp: 0.15 + Math.random() * 0.2 });
    }
    return out;
}

// ------------------------------------------------------------------ kaydet / devam et

let lastSaveAt = 0;

// Yarım kalan oyunu haritaya bağlı olarak kaydeder. Oyun bittiyse ya da hiç başlanmadıysa kayıt tutulmaz.
function saveProgress() {
    if (!world || !currentMap) return;
    lastSaveAt = performance.now();
    if (world.result) { Settings.clearSave(currentMap.id); return; }
    if (world.wave === 0 && world.towers.length === 0) return;
    Settings.setSave(currentMap.id, {
        snap: world.serialize(),
        savedAt: Date.now(),
        wave: world.wave,
        total: world.totalWaves,
        health: Math.ceil(world.health),
        money: world.money,
        diff: world.diffKey,
    });
}

// Java pencere kapanırken çağırır
window.saveBeforeExit = function () { try { saveProgress(); } catch (e) { /* yoksay */ } };

let pendingResume = null;

function openMap(i) {
    const m = MAPS[i];
    const sv = Settings.getSave(m.id);
    if (!sv || !sv.snap || sv.snap.v !== 1 || !Core.DIFFICULTY[sv.snap.diff]) { selectMap(i); return; }
    pendingResume = { index: i, save: sv };
    const d = Core.DIFFICULTY[sv.snap.diff];
    document.getElementById('resumeTitle').innerText = m.name;
    document.getElementById('resumeInfo').innerText =
        `Yarım kalan oyun: ${d.label} · Dalga ${sv.wave}/${sv.total} · Can ${sv.health} · Enerji ${sv.money}`;
    document.getElementById('resumeModal').classList.remove('hidden');
}

function closeResume() {
    pendingResume = null;
    document.getElementById('resumeModal').classList.add('hidden');
}

document.getElementById('resumeContinue').onclick = () => {
    const r = pendingResume;
    closeResume();
    if (r) selectMap(r.index, r.save.snap);
};
document.getElementById('resumeRestart').onclick = () => {
    const r = pendingResume;
    closeResume();
    if (r) { Settings.clearSave(MAPS[r.index].id); selectMap(r.index); }
};
document.getElementById('resumeCancel').onclick = closeResume;

function selectMap(mapIndex, resumeSnap) {
    currentMapIndex = mapIndex;
    currentMap = MAPS[mapIndex];
    W = (currentMap.size && currentMap.size.w) || 1350;
    H = (currentMap.size && currentMap.size.h) || 900;
    loadSprites(currentMap);
    // tuvalin arkasında resim yok: WebView her karede altındaki resmi de yeniden çiziyor ve FPS'i 60'a düşürüyordu
    document.getElementById('canvasContainer').style.background = currentMap.tint || '#02101c';

    ['menuScreen', 'mapSelectScreen', 'winScreen', 'loseScreen', 'towerModal'].forEach(id =>
        document.getElementById(id).classList.add('hidden'));
    document.getElementById('gameScreen').classList.remove('hidden');

    if (world) logEnd();
    if (resumeSnap) {
        difficulty = resumeSnap.diff;
        world = Core.World.restore(currentMap, resumeSnap, { onEvent: onWorldEvent });
    } else {
        world = new Core.World(currentMap, { difficulty, seed: Date.now() & 0x7fffffff, onEvent: onWorldEvent });
    }
    lastSaveAt = performance.now();
    ambient = buildAmbient(currentMap);
    fx = { floaters: [], rings: [], bubbles: [], flash: 0, tension: 0, shake: 0, alert: null, warns: [], sparks: [], guardGlow: [], toasts: [], furies: [], meteors: [], chomps: [], arcs: [] };
    paused = false;
    speedMultiplier = 1;
    selectedTower = null;
    hoverSpot = null;
    armedType = null;
    draggedType = null;
    endShown = false;
    endDelay = 0;

    document.getElementById('pauseButton').innerText = 'DURAKLAT';
    document.getElementById('speedButton').innerText = 'HIZ: 1x';

    renderTowerMarket();
    fitCanvas();
    canvas.style.transform = '';
    showBanner();
    logStart();
    if (resumeSnap) addLog(`Kayıtlı oyun yüklendi: dalga ${world.wave}/${world.totalWaves}, can ${Math.ceil(world.health)}, enerji ${world.money}, ${world.towers.length} kule.`);
    uiCache = {};
    updateUI();
    renderTowerList();

    cancelAnimationFrame(rafId);
    lastFrame = 0;
    frameDue = 0;
    startLoop();
}

function showBanner() {
    const b = document.getElementById('mapBanner');
    const rule = currentMap.rule ? `<div class="banner-rule">${currentMap.rule}</div>` : '';
    b.innerHTML = `<div class="banner-name">${currentMap.name}</div><div class="banner-sub">${world.totalWaves} dalga · ${Core.DIFFICULTY[difficulty].label}</div>${rule}`;
    document.getElementById('ruleLine').innerText = currentMap.rule || '';
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
}

let MAX_CANVAS_PX = 2700;

function fitCanvas() {
    const box = document.getElementById('canvasContainer');
    const cw = box.clientWidth || W;
    const ch = box.clientHeight || H;
    const scale = Math.min(cw / W, ch / H);
    // tuvalin uzun kenarı en fazla MAX_CANVAS_PX piksel olur; arka plan resimleri 2700 piksel genişliğinde
    const maxRes = Math.min(MAX_CANVAS_PX / W, MAX_CANVAS_PX / H);
    const q = { high: 1, medium: 0.75, low: 0.5 }[Settings.get().quality] || 1;
    res = Math.max(0.5, Math.min(maxRes, scale * (window.devicePixelRatio || 1) * q));
    canvas.width = Math.round(W * res);
    canvas.height = Math.round(H * res);
    ctx.setTransform(res, 0, 0, res, 0, 0);
    clearSpriteCache();
}
window.addEventListener('resize', () => { if (world) fitCanvas(); });

// ------------------------------------------------------------------ ana döngü

// Oyun döngüsü. JavaFX WebView'ın kendi requestAnimationFrame'i 60'ta kilitli olduğu için, Java varsa kareleri
// Java'nın zamanlayıcısı sürer (window.javaFrame); Java yoksa (tarayıcıda test) requestAnimationFrame kullanılır.
// Hedef FPS ayarı her iki durumda da uygulanır.
function startLoop() {
    if (window.javaDriven) bridgeLoop(true);
    else rafId = requestAnimationFrame(gameLoop);
}

function stopLoop() {
    cancelAnimationFrame(rafId);
    if (window.javaDriven) bridgeLoop(false);
}

function bridgeLoop(on) {
    try { if (window.javaBridge && window.javaBridge.setLoop) window.javaBridge.setLoop(on); } catch (e) { /* yoksay */ }
}

window.javaFrame = function (ms) { gameLoop(ms, true); };

function gameLoop(ts, fromJava) {
    if (!world) return;
    if (!fromJava) {
        // Java bayrağı sayfa yüklendikten sonra gelebilir: o durumda döngüyü Java'ya devret
        if (window.javaDriven) { bridgeLoop(true); return; }
        rafId = requestAnimationFrame(gameLoop);
    }

    // sabit hızlı FPS sınırlayıcı
    const target = Settings.get().fps;
    if (target > 0) {
        const interval = 1000 / target;
        if (ts < frameDue - 0.6) return;
        frameDue = (ts - frameDue > interval * 2) ? ts + interval : frameDue + interval;
    }

    if (!lastFrame) lastFrame = ts;
    let dt = (ts - lastFrame) / 1000;
    lastFrame = ts;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    animTime += dt;

    if (!paused) {
        world.update(dt * speedMultiplier);
        tensionTick(dt);
        if (performance.now() - lastLogFlush > 1000) flushLog();
        if (performance.now() - lastSaveAt > 12000) saveProgress();
        updateFx(dt * speedMultiplier);
    }
    if (world.result && !endShown) {
        endDelay -= dt;
        if (endDelay <= 0) { endShown = true; showEnd(); }
    }
    const t0 = performance.now();
    draw();
    perf.drawAcc += performance.now() - t0;
    updateUI();

    perf.frames++;
    const now = performance.now();
    if (now - perf.since >= 500) {
        perf.fps = Math.round(perf.frames * 1000 / (now - perf.since));
        perf.drawMs = perf.drawAcc / perf.frames;
        perf.frames = 0;
        perf.drawAcc = 0;
        perf.since = now;
    }
}

function updateFx(dt) {
    fx.floaters.forEach(f => { f.life -= dt; f.y -= 28 * dt; });
    fx.floaters = fx.floaters.filter(f => f.life > 0);
    fx.rings.forEach(r => { r.life -= dt; });
    fx.rings = fx.rings.filter(r => r.life > 0);
    fx.bubbles.forEach(b => { b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt; });
    fx.bubbles = fx.bubbles.filter(b => b.life > 0);
    fx.toasts.forEach(t => { t.life -= dt; });
    fx.toasts = fx.toasts.filter(t => t.life > 0);
    fx.furies.forEach(f => { f.life -= dt; });
    fx.furies = fx.furies.filter(f => f.life > 0 && f.boss.health > 0);
    fx.warns.forEach(w => { w.life -= dt; });
    fx.warns = fx.warns.filter(w => w.life > 0);
    fx.meteors.forEach(m => { m.life -= dt; });
    fx.meteors = fx.meteors.filter(m => m.life > 0);
    fx.chomps.forEach(c => { c.life -= dt; });
    fx.chomps = fx.chomps.filter(c => c.life > 0);
    fx.arcs.forEach(a => { a.life -= dt; });
    fx.arcs = fx.arcs.filter(a => a.life > 0);
    fx.sparks.forEach(p => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt; p.vx *= 0.985; });
    fx.sparks = fx.sparks.filter(p => p.life > 0);
    for (let i = 0; i < fx.guardGlow.length; i++) fx.guardGlow[i] = Math.max(0, (fx.guardGlow[i] || 0) - dt * 1.1);
    fx.flash = Math.max(0, fx.flash - dt * 2.5);
    fx.tension = Math.max(0, (fx.tension || 0) - dt * 0.35);
    if (fx.alert) { fx.alert.life -= dt; if (fx.alert.life <= 0) fx.alert = null; }
    // ekran sarsıntısı: filtre değil, basit bir kaydırma
    fx.shake = Math.max(0, (fx.shake || 0) - dt * 1.6);
    const amp = fx.shake > 0 ? fx.shake * 9 : 0;
    canvas.style.transform = amp > 0.2 ? `translate(${((Math.random() - 0.5) * amp).toFixed(1)}px, ${((Math.random() - 0.5) * amp).toFixed(1)}px)` : '';
}

// ------------------------------------------------------------------ çizim

function draw() {
    ctx.setTransform(res, 0, 0, res, 0, 0);
    if (ready(sprites.bg)) {
        drawBackground();
    } else {
        ctx.fillStyle = '#001d3d';
        ctx.fillRect(0, 0, W, H);
    }

    const fancy = Settings.get().effects;
    if (fancy) drawAmbientBack();
    drawPath();
    drawSpots();
    drawGas();
    drawEntities();
    drawMechanics();
    drawChomps();
    drawMeteors();
    if (fancy) drawAmbientFront();
    drawFx();
    drawHud();

    if (paused) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 60px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('DURAKLANDI', W / 2, H / 2);
        ctx.textAlign = 'left';
    }
}

// Büyük arka plan her karede küçültülmesin: tuval boyutunda bir kez çizilir, sonra birebir kopyalanır.
// Karanlık haritada (Derin Çukur) ışıksız bölgelerin kararması da bu önbelleğe pişirilir. Böylece her karede
// pahalı bir `clip` işlemi yapılmaz ve üst üste binen fenerlerin ışığı doğru birleşir (union).
let bgCache = null;
let bgCacheKey = '';

function darknessMech() { return (currentMap.mechanics || []).find(m => m.type === 'darkness'); }
function activeLights() { return darknessMech() ? world.towers.filter(t => t.type === 'angler') : []; }

function lightSignature() {
    return activeLights().map(t => `${Math.round(t.x)},${Math.round(t.y)},${Math.round(world.lightRadius(t))}`).join(';');
}

function bakeDarkness(target) {
    const lights = activeLights().map(t => ({ x: t.x, y: t.y, r: world.lightRadius(t) }));
    const dm = darknessMech();
    const strength = (dm && dm.strength) || 0.64;
    const cw = Math.ceil(W / 2);
    const ch = Math.ceil(H / 2);
    const small = document.createElement('canvas');
    small.width = cw;
    small.height = ch;
    const g = small.getContext('2d');
    const data = g.createImageData(cw, ch);
    const px = data.data;
    for (let j = 0; j < ch; j++) {
        const y = (j + 0.5) * 2;
        for (let i = 0; i < cw; i++) {
            const x = (i + 0.5) * 2;
            let best = -1e9;                                      // en yakın ışığın kenarına olan işaretli mesafe
            for (let k = 0; k < lights.length; k++) {
                const L = lights[k];
                const v = L.r - Math.hypot(x - L.x, y - L.y);
                if (v > best) best = v;
            }
            const lit = lights.length ? Math.max(0, Math.min(1, best / 3 + 0.5)) : 0;
            const o = (j * cw + i) * 4;
            px[o] = 0;
            px[o + 1] = 2;
            px[o + 2] = 10;
            px[o + 3] = Math.round(255 * strength * (1 - lit));
        }
    }
    g.putImageData(data, 0, 0);
    const tg = target.getContext('2d');
    tg.imageSmoothingEnabled = true;
    tg.drawImage(small, 0, 0, target.width, target.height);
}

function drawBackground() {
    const key = `${sprites.bg.src}|${canvas.width}x${canvas.height}|${lightSignature()}`;
    if (!bgCache || bgCacheKey !== key) {
        if (!bgCache) bgCache = document.createElement('canvas');
        bgCache.width = canvas.width;
        bgCache.height = canvas.height;
        bgCache.getContext('2d').drawImage(sprites.bg, 0, 0, bgCache.width, bgCache.height);
        bakeRays(bgCache.getContext('2d'));
        bakeRail(bgCache.getContext('2d'));
        if (darknessMech()) bakeDarkness(bgCache);
        bgCacheKey = key;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bgCache, 0, 0);
    ctx.restore();
}

// ışığın dışındaki varlıklar için karartma: sprite'ın karanlık siluetini yarı saydam üstüne bindirir
const darkSpriteCache = new Map();
function darkOf(c) {
    let d = darkSpriteCache.get(c);
    if (!d) {
        d = document.createElement('canvas');
        d.width = c.width;
        d.height = c.height;
        const g = d.getContext('2d');
        g.drawImage(c, 0, 0);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgb(0,2,10)';
        g.fillRect(0, 0, d.width, d.height);
        darkSpriteCache.set(c, d);
    }
    return d;
}

function inLight(x, y) {
    if (!darknessMech()) return true;
    for (const t of world.towers) {
        if (t.type === 'angler' && Math.hypot(t.x - x, t.y - y) <= world.lightRadius(t)) return true;
    }
    return false;
}

// 0 (aydınlık) .. 1 (karanlık), yumuşak geçişli
function darkAmount(obj, lit) {
    const target = lit ? 0 : 1;
    const dt = Math.min(0.05, animTime - (obj.darkT === undefined ? animTime : obj.darkT));
    obj.darkT = animTime;
    obj.darkAmt = (obj.darkAmt === undefined ? target : obj.darkAmt) + (target - (obj.darkAmt === undefined ? target : obj.darkAmt)) * Math.min(1, dt * 10);
    return obj.darkAmt;
}

// çizilen sprite'ın aynı yerine karanlık siluetini bindir
function dimmed(src, amt, x, y, w, h) {
    if (amt < 0.03) return;
    ctx.globalAlpha = 0.62 * amt;
    ctx.drawImage(darkOf(src), x, y, w, h);
    ctx.globalAlpha = 1;
}

// Işık huzmeleri hareketsizdir ve arka plana bir kez pişirilir (her karede çizmek FPS'i yarıya düşürüyordu)
function bakeRays(g) {
    const a = currentMap.ambient;
    if (!a || !a.rays || !ambient || !ambient.rays.length) return;
    g.save();
    g.scale(res, res);
    ambient.rays.forEach(r => {
        const x0 = r.x;
        const gr = g.createLinearGradient(x0, 0, x0 + 260, H);
        gr.addColorStop(0, `rgba(${a.rays.color},${a.rays.alpha * 0.85})`);
        gr.addColorStop(1, `rgba(${a.rays.color},0)`);
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x0, 0);
        g.lineTo(x0 + r.w, 0);
        g.lineTo(x0 + r.w + 300, H);
        g.lineTo(x0 + 220, H);
        g.closePath();
        g.fill();
    });
    g.restore();
}

// Sudaki ışık ağı: tek katman, yavaşça kayar
function drawAmbientBack() {
    const a = currentMap.ambient;
    if (!a || !a.caustics || !ready(sprites.caustics)) return;
    if (!sprites.causticsPattern) sprites.causticsPattern = ctx.createPattern(sprites.caustics, 'repeat');
    ctx.save();
    ctx.globalAlpha = Math.min(1, a.caustics * 1.5);
    ctx.scale(1.3, 1.3);
    ctx.translate((animTime * 12) % 512, (animTime * 9) % 512);
    ctx.fillStyle = sprites.causticsPattern;
    ctx.fillRect(-512, -512, W / 1.3 + 1024, H / 1.3 + 1024);
    ctx.restore();
}

function drawAmbientFront() {
    const a = currentMap.ambient;
    if (!a) return;

    const down = a.moteDir === 'down';   // kar taneleri aşağı, kıvılcımlar yukarı
    ambient.motes.forEach(m => {
        m.y += (down ? 1 : -1) * m.sp * 0.016;
        m.x += Math.sin(animTime * 0.6 + m.ph) * (down ? 0.3 : 0.12);
        if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; }
        if (m.y > H + 4) { m.y = -4; m.x = Math.random() * W; }
        const tw = down ? 0.7 : 0.35 + 0.35 * Math.sin(animTime * 1.7 + m.ph);
        ctx.fillStyle = `rgba(${a.moteColor || '220,255,255'},${tw})`;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r * (a.moteSize || 1), 0, 6.2832);
        ctx.fill();
    });

    ctx.lineWidth = 1.2;
    ambient.bubbles.forEach(b => {
        b.y -= b.sp * 0.016;
        const x = b.x + Math.sin(animTime * 1.2 + b.ph) * 8;
        if (b.y < -10) { b.y = H + 10; b.x = Math.random() * W; }
        ctx.strokeStyle = 'rgba(220,250,255,0.45)';
        ctx.fillStyle = 'rgba(200,240,255,0.10)';
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.22, 0, 6.2832);
        ctx.fill();
    });

    if (a.vignette) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(${a.vignetteColor || '0,10,25'},${a.vignette})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
}

// Yalnızca 'rail' stili yol çizer; diğer haritalarda yol arka plana işlidir. Yol hareket etmediği için
// arka plan önbelleğine bir kez çizilir (uzun yolu her karede kesikli çizmek Mercan Kanalı'nı yavaşlatıyordu).
function bakeRail(g) {
    if (currentMap.pathStyle !== 'rail') return;
    g.save();
    g.scale(res, res);
    world.paths.forEach(p => {
        g.beginPath();
        g.moveTo(p.points[0].x, p.points[0].y);
        for (let i = 1; i < p.points.length; i++) g.lineTo(p.points[i].x, p.points[i].y);
        g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
        g.lineWidth = 11;
        g.stroke();
        g.strokeStyle = 'rgba(255, 210, 100, 0.95)';
        g.lineWidth = 5;
        g.setLineDash([12, 6]);
        g.stroke();
        g.setLineDash([]);
    });
    g.restore();
}

function drawPath() { /* yol arka plana pişirilmiştir (bakeRail) */ }

// ------------------------------------------------------------------ haritaya özel kurallar
// (yavaşlatma bölgeleri artık yolun üzerinde çizilmez; kural metni ve düşmanların yavaşlaması yeterli)

// patronun çenesi: iki yarım elips ve birbirine geçen dişler; gap, çenelerin merkezden uzaklığı
function drawJaws(x, y, gap, alpha) {
    const R = 54;
    const n = 7;
    const sp = (2 * R) / n;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(x, y + dir * gap);
        if (dir < 0) ctx.scale(1, -1);                 // üst çene alt çenenin aynasıdır
        ctx.fillStyle = '#7a1630';
        ctx.strokeStyle = '#2e0610';
        ctx.lineWidth = 3;
        // yarım elips yerine bezier: WebView'ın yol çizicisi başlangıç noktasız yay yollarında hata veriyor
        ctx.beginPath();
        ctx.moveTo(-R, 0);
        ctx.bezierCurveTo(-R, R * 0.8, R, R * 0.8, R, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#f6f1e4';
        ctx.strokeStyle = '#8a7f6a';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < n; i++) {
            const tx = (i - (n - 1) / 2) * sp + (dir < 0 ? sp / 2 : 0);
            if (Math.abs(tx) > R * 0.86) continue;
            ctx.beginPath();
            ctx.moveTo(tx - sp * 0.38, 1);
            ctx.lineTo(tx + sp * 0.38, 1);
            ctx.lineTo(tx, -17);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.restore();
}

// kule yeniliyor: çene hızla kapanır, kule yutulur, parçalar saçılır
function drawChomps() {
    fx.chomps.forEach(c => {
        const k = 1 - c.life / c.max;
        const closeAt = 0.26;
        if (k < closeAt + 0.1) {
            // yutulan kule: çene kapanırken küçülür
            const img = sprites.towers[c.type];
            const shrink = k < closeAt ? 1 : Math.max(0, 1 - (k - closeAt) / 0.1);
            if (ready(img) && shrink > 0.02) {
                const sz = 100 * (0.35 + 0.65 * shrink);
                ctx.globalAlpha = shrink;
                ctx.drawImage(fit(img, 100), c.x - sz / 2, c.y - sz / 2, sz, sz);
                ctx.globalAlpha = 1;
            }
        }
        if (k >= closeAt && !c.snapped) {
            c.snapped = true;
            sfx('chomp');
            fx.shake = Math.max(fx.shake || 0, 0.85);
            fx.rings.push({ x: c.x, y: c.y, r: 10, max: 100, life: 0.5, maxLife: 0.5, color: '230,50,80', fill: true });
            for (let i = 0; i < 26; i++) {
                const a = Math.random() * 6.2832;
                const sp = 70 + Math.random() * 230;
                fx.sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, life: 0.5 + Math.random() * 0.7, max: 1.2, r: 2 + Math.random() * 3.5, c: i % 3 ? '210,40,70' : '240,236,220' });
            }
        }
        let gap;
        if (k < closeAt) {
            const e = k / closeAt;
            gap = 52 * (1 - e * e);                           // hızlanarak kapanır
        } else {
            gap = 3 * Math.abs(Math.sin((k - closeAt) * 26)) * Math.max(0, 1 - (k - closeAt) / 0.5);   // çiğneme
        }
        const alpha = k < 0.7 ? 0.95 : Math.max(0, 0.95 * (1 - (k - 0.7) / 0.3));
        drawJaws(c.x, c.y + 6, gap, alpha);
    });
}

// lav kayası: sağ üstten düşer, hedefte büyüyen bir gölge vardır
function drawMeteors() {
    fx.meteors.forEach(m => {
        const k = 1 - m.life / m.max;
        ctx.fillStyle = `rgba(30,0,0,${0.12 + 0.28 * k})`;
        ctx.beginPath();
        ctx.ellipse(m.x, m.y + 30, 18 + 34 * k, 8 + 12 * k, 0, 0, 6.2832);
        ctx.fill();
        const dist = (1 - k * k) * 560;
        const dx = 0.447;
        const dy = -0.894;
        const px = m.x + dx * dist;
        const py = m.y + dy * dist;
        for (let i = 9; i >= 1; i--) {
            ctx.fillStyle = `rgba(255,${Math.round(80 + i * 12)},40,${0.5 - i * 0.045})`;
            ctx.beginPath();
            ctx.arc(px + dx * i * 17, py + dy * i * 17, 19 - i * 1.6, 0, 6.2832);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,120,30,0.28)';
        ctx.beginPath();
        ctx.arc(px, py, 34, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = '#5a2412';
        ctx.strokeStyle = '#ff9a3a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(px, py, 23, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffe3a0';
        ctx.beginPath();
        ctx.arc(px - 5, py - 4, 9, 0, 6.2832);
        ctx.fill();
    });
}

function drawMechanics() {
    const mech = currentMap.mechanics || [];

    // patron saldırısı: hedeflenen kulenin üstünde çene açılır ve yaklaşır (sonra drawChomps kapatır)
    fx.furies.forEach(f => {
        const k = 1 - f.life / f.max;
        f.towers.forEach(t => {
            if (!world.towers.includes(t)) return;
            ctx.strokeStyle = `rgba(255,50,80,${0.25 + 0.3 * Math.sin(animTime * 18) ** 2})`;
            ctx.lineWidth = 2;
            ctx.setLineDash([12, 9]);
            ctx.lineDashOffset = -animTime * 120;
            ctx.beginPath();
            ctx.moveTo(f.boss.x, f.boss.y);
            ctx.lineTo(t.x, t.y);
            ctx.stroke();
            ctx.setLineDash([]);
            drawJaws(t.x, t.y + 6, 78 - 26 * k + Math.sin(animTime * 20) * 1.5 * k, Math.min(1, k * 3) * 0.92);
        });
    });

    // Atlantis koruyucu küreleri: dolum arttıkça halka hızlanır ve çekirdek parlar, darbede patlar
    const gm = world.mech.find(m => m.cfg.type === 'guardians');
    (currentMap.guardians || []).forEach((g, i) => {
        const st = gm && gm.guards[i];
        const charge = st ? Math.max(0, Math.min(1, 1 - st.timer / gm.cfg.interval)) : 0;
        const glow = Math.min(1, fx.guardGlow[i] || 0);
        const pulse = 0.5 + 0.5 * Math.sin(animTime * 2 + i);
        const k = Math.min(1, 0.22 + 0.1 * pulse + 0.55 * charge * charge + 0.5 * glow);
        ctx.globalAlpha = k;
        ctx.drawImage(glowSprite('120,255,235', 70), g.x - 70, g.y - 70, 140, 140);
        ctx.globalAlpha = 1;
        const rot = animTime * (0.5 + 4 * charge);
        ctx.strokeStyle = `rgba(160,255,242,${0.3 + 0.55 * charge})`;
        ctx.lineWidth = 2.5;
        for (let j = 0; j < 4; j++) {
            ctx.beginPath();
            ctx.arc(g.x, g.y, 46 + 7 * charge, rot + j * 1.5708, rot + j * 1.5708 + 0.9);
            ctx.stroke();
        }
        ctx.fillStyle = `rgba(200,255,250,${Math.min(1, 0.3 + 0.55 * charge + 0.4 * glow)})`;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 7 + 7 * charge + 5 * glow, 0, 6.2832);
        ctx.fill();
    });

    // lav patlaması uyarıları
    fx.warns.forEach(w => {
        const k = 1 - w.life / w.max;
        const pulse = 0.5 + 0.5 * Math.sin(animTime * 14);
        ctx.fillStyle = `rgba(255,80,20,${0.14 + 0.16 * k + 0.08 * pulse})`;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, 6.2832);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,${Math.round(120 + 100 * pulse)},60,0.95)`;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -animTime * 40;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255,230,160,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r * (1 - k), 0, 6.2832);
        ctx.stroke();
    });

    // batık hazine
    const tr = world.treasure;
    if (tr) {
        const pulse = 1 + 0.12 * Math.sin(animTime * 7);
        const grad = ctx.createRadialGradient(tr.x, tr.y, 6, tr.x, tr.y, 80 * pulse);
        grad.addColorStop(0, 'rgba(255,225,110,0.75)');
        grad.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 80 * pulse, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,214,70,0.92)';
        ctx.strokeStyle = 'rgba(120,70,0,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 30 * pulse, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,250,200,0.95)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, 42, -Math.PI / 2, -Math.PI / 2 + 6.2832 * (tr.life / tr.max));
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
            const a = animTime * 2 + i * 1.2566;
            const rr = 52 + 6 * Math.sin(animTime * 5 + i);
            ctx.fillStyle = 'rgba(255,250,210,0.9)';
            ctx.beginPath();
            ctx.arc(tr.x + Math.cos(a) * rr, tr.y + Math.sin(a) * rr, 2.5, 0, 6.2832);
            ctx.fill();
        }
        ctx.textAlign = 'center';
        ctx.font = 'bold 20px sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(`TIKLA  +${tr.reward}`, tr.x, tr.y - 62);
        ctx.fillStyle = '#ffe58a';
        ctx.fillText(`TIKLA  +${tr.reward}`, tr.x, tr.y - 62);
        ctx.textAlign = 'left';
    }

    // kar fırtınası
    if (world.stormActive) {
        ctx.fillStyle = 'rgba(205,228,248,0.20)';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 90; i++) {
            const x = W + 60 - ((i * 97 + animTime * 520) % (W + 160));
            const y = ((i * 53 + animTime * 300 + i * i * 7) % (H + 80)) - 40;
            ctx.moveTo(x, y);
            ctx.lineTo(x + 30, y - 9);
        }
        ctx.stroke();
    }
}

// ekranın üstünde kısa durum şeridi (kar fırtınası)
function drawFpsCounter() {
    if (!Settings.get().showFps) return;
    ctx.save();
    ctx.font = 'bold 15px monospace';
    const txt = `${perf.fps} FPS · çizim ${perf.drawMs.toFixed(1)} ms`;
    const w = ctx.measureText(txt).width + 16;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(W - w - 8, 8, w, 26);
    ctx.fillStyle = perf.fps >= 110 ? '#7dffa8' : perf.fps >= 55 ? '#ffe27a' : '#ff8a8a';
    ctx.fillText(txt, W - w, 27);
    ctx.restore();
}

function drawHud() {
    drawFpsCounter();
    drawBossBar();
    drawToasts();
    drawBlizzardStrip();
}

function drawBossBar() {
    let boss = null;
    for (const e of world.enemies) if (e.type === 'boss' && e.health > 0 && (!boss || e.maxHealth > boss.maxHealth)) boss = e;
    if (!boss) return;
    const bw = 560;
    const x = W / 2 - bw / 2;
    const y = 70;
    const pct = Math.max(0, boss.health / boss.maxHealth);
    ctx.save();
    ctx.fillStyle = 'rgba(14,0,6,0.78)';
    ctx.fillRect(x - 8, y - 30, bw + 16, 56);
    ctx.strokeStyle = 'rgba(220,40,70,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 8, y - 30, bw + 16, 56);
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = '#ffd0d8';
    ctx.fillText(boss.name.toUpperCase(), W / 2, y - 8);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, bw, 14);
    const g = ctx.createLinearGradient(x, 0, x + bw, 0);
    g.addColorStop(0, '#a01030');
    g.addColorStop(1, '#ff4a60');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, bw * pct, 14);
    ctx.restore();
}

function drawToasts() {
    let y = 122;
    fx.toasts.forEach(t => {
        const a = Math.min(1, t.life / 0.5, (t.max - t.life) / 0.15 + 0.2);
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, a));
        ctx.font = 'bold 20px sans-serif';
        const w = ctx.measureText(t.text).width + 36;
        ctx.fillStyle = 'rgba(8,16,30,0.82)';
        ctx.fillRect(W / 2 - w / 2, y, w, 36);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.strokeRect(W / 2 - w / 2, y, w, 36);
        ctx.textAlign = 'center';
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, W / 2, y + 25);
        ctx.restore();
        y += 44;
    });
}

function drawBlizzardStrip() {
    const b = world.mech && world.mech.find(m => m.cfg.type === 'blizzard');
    if (!b || (b.phase !== 'warn' && b.phase !== 'storm')) return;
    const txt = b.phase === 'warn'
        ? `Kar fırtınası yaklaşıyor... ${Math.ceil(b.t)}`
        : `KAR FIRTINASI · kule menzili -%${Math.round((1 - b.cfg.rangeMul) * 100)} · ${Math.ceil(b.t)} sn`;
    ctx.save();
    ctx.font = 'bold 24px sans-serif';
    const w = ctx.measureText(txt).width + 44;
    ctx.fillStyle = b.phase === 'warn' ? 'rgba(20,50,90,0.78)' : 'rgba(40,90,150,0.85)';
    ctx.fillRect(W / 2 - w / 2, 14, w, 42);
    ctx.strokeStyle = 'rgba(190,225,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - w / 2, 14, w, 42);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eaf6ff';
    ctx.fillText(txt, W / 2, 44);
    ctx.restore();
}

// Boş kule yerleri her karede yeniden çizilmez: her tür bir kez küçük bir tuvale çizilir (haritada 20+ yer var, doğrudan çizim
// WebView'da kare süresini ikiye katlıyordu). Yalnızca üzerine gelinen yer canlı çizilir.
const spotCache = new Map();

function drawSpotShape(g, high, calm, full) {
    const R = Core.BUILD_SPOT_RADIUS;
    const rgb = high ? '255,205,70' : '90,255,180';
    // koyu zemin + koyu dış çizgi + parlak halka: açık renkli (kum, kar) ve koyu haritaların hepsinde seçilir
    g.fillStyle = full ? 'rgba(0,40,55,0.45)' : `rgba(0,30,42,${0.30 * calm})`;
    g.beginPath();
    g.arc(0, 0, R, 0, 6.2832);
    g.fill();
    g.fillStyle = `rgba(${rgb},${full ? 0.28 : 0.12 * calm})`;
    g.fill();
    g.strokeStyle = `rgba(0,12,22,${0.75 * calm})`;
    g.lineWidth = 6;
    g.stroke();
    g.strokeStyle = full ? `rgb(${rgb})` : `rgba(${rgb},${Math.min(1, 1.1 * calm)})`;
    g.lineWidth = full ? 4 : 2.6;
    g.stroke();
    if (!full && calm >= 1) {
        g.strokeStyle = `rgba(${rgb},0.7)`;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-14, 0);
        g.lineTo(14, 0);
        g.moveTo(0, -14);
        g.lineTo(0, 14);
        g.stroke();
    }
    if (high) {
        g.setLineDash([6, 8]);
        g.strokeStyle = `rgba(0,12,22,${0.55 * calm})`;
        g.lineWidth = 5;
        g.beginPath();
        g.arc(0, 0, R + 7, 0, 6.2832);
        g.stroke();
        g.strokeStyle = `rgba(255,215,90,${0.95 * calm})`;
        g.lineWidth = 2.5;
        g.stroke();
        g.setLineDash([]);
    }
}

function spotSprite(high, building) {
    const key = `${high ? 1 : 0}${building ? 1 : 0}|${res}`;
    let c = spotCache.get(key);
    if (!c) {
        const R = Core.BUILD_SPOT_RADIUS + 10;
        c = document.createElement('canvas');
        c.width = c.height = Math.ceil(R * 2 * res);
        const g = c.getContext('2d');
        g.scale(res, res);
        g.translate(R, R);
        drawSpotShape(g, high, building ? 1 : 0.62, false);
        spotCache.set(key, c);
    }
    return c;
}

function drawSpots() {
    const pulse = 0.5 + 0.5 * Math.sin(animTime * 2.2);
    // kule seçili ya da sürükleniyorsa yerler belirgin, değilse sönük (haritada çok yer var, göz yormasın)
    const building = !!(draggedType || armedType);
    const R = Core.BUILD_SPOT_RADIUS + 10;
    ctx.globalAlpha = 0.88 + pulse * 0.12;
    for (const spot of world.spots) {
        if (spot.tower || hoverSpot === spot) continue;
        ctx.drawImage(spotSprite(spot.kind === 'high', building), spot.x - R, spot.y - R, R * 2, R * 2);
    }
    ctx.globalAlpha = 1;

    const spot = hoverSpot;
    if (spot && !spot.tower) {
        ctx.save();
        ctx.translate(spot.x, spot.y);
        drawSpotShape(ctx, spot.kind === 'high', 1, true);
        ctx.restore();
        if (draggedType || armedType) {
            const type = draggedType || armedType;
            const range = Core.TOWER_TYPES[type].range * (spot.kind === 'high' ? Core.HIGH_GROUND_RANGE : 1);
            ctx.strokeStyle = 'rgba(255,255,255,0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, range, 0, 6.2832);
            ctx.stroke();
        }
    }
}

function drawEntities() {
    // üstteki nesneler altakileri örtsün diye y'ye göre sırala
    const items = [];
    world.towers.forEach(t => items.push({ y: t.y, draw: () => drawTower(t) }));
    world.enemies.forEach(e => items.push({ y: e.y, draw: () => drawEnemy(e) }));
    items.sort((a, b) => a.y - b.y);
    items.forEach(i => i.draw());
    world.projectiles.forEach(drawProjectile);
}

function drawShadow(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(0,15,30,${alpha})`;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, 6.2832);
    ctx.fill();
}

function drawEnemy(e) {
    const bob = Math.sin(animTime * 4.2 + e.id * 1.7) * (e.type === 'boss' ? 2 : 3);
    const sinceHit = animTime - (e.hitAnim || -10);
    if (e.lastHit !== e.hitSeen) { e.hitSeen = e.lastHit; e.hitAnim = animTime; }
    const pulse = sinceHit < 0.12 ? 1 + (0.12 - sinceHit) * 0.7 : 1;
    const size = e.size * pulse;

    if (e.type === 'boss' || e.mini) {
        const g = ctx.createRadialGradient(e.x, e.y, size * 0.2, e.x, e.y, size * 0.85);
        g.addColorStop(0, 'rgba(255,60,60,0.35)');
        g.addColorStop(1, 'rgba(255,60,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(e.x, e.y, size * 0.85, 0, 6.2832);
        ctx.fill();
    }
    drawShadow(e.x, e.y + size * 0.36, size * 0.34, size * 0.1, 0.22);

    const img = enemySprite(e);
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    if (currentMap.flipSprites && e.dirX > 0) ctx.scale(-1, 1);
    if (ready(img)) {
        const spr = fit(img, e.size);
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
        if (darknessMech()) dimmed(spr, darkAmount(e, inLight(e.x, e.y)), -size / 2, -size / 2, size, size);
    } else {
        ctx.fillStyle = '#c33';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.35, 0, 6.2832);
        ctx.fill();
    }
    ctx.restore();

    if (e.health < e.maxHealth || e.type === 'boss') {
        const bw = e.type === 'boss' ? 90 : e.size * 0.75;
        const by = e.y - e.size * 0.58;
        const pct = Math.max(0, e.health / e.maxHealth);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(e.x - bw / 2 - 1, by - 1, bw + 2, 8);
        ctx.fillStyle = pct > 0.5 ? '#3ddc6b' : pct > 0.25 ? '#f2c230' : '#ef4b4b';
        ctx.fillRect(e.x - bw / 2, by, bw * pct, 6);
    }
    // yetenek göstergeleri: işaretli düşmanda hedef halkası, zehir/yanıkta dönen noktalar
    if (e.markT > 0) {
        ctx.strokeStyle = 'rgba(255,130,70,0.95)';
        ctx.lineWidth = 2.2;
        const my = e.y - size * 0.72;
        ctx.beginPath();
        ctx.arc(e.x, my, 8, 0, 6.2832);
        ctx.moveTo(e.x - 13, my); ctx.lineTo(e.x - 4, my);
        ctx.moveTo(e.x + 4, my); ctx.lineTo(e.x + 13, my);
        ctx.stroke();
    }
    if (e.dotT > 0) {
        ctx.fillStyle = e.dotType === 'eel' ? 'rgba(255,170,60,0.95)' : 'rgba(130,255,110,0.95)';
        for (let i = 0; i < 3; i++) {
            const a = animTime * 4 + i * 2.094 + e.id;
            ctx.beginPath();
            ctx.arc(e.x + Math.cos(a) * size * 0.34, e.y + bob + Math.sin(a) * size * 0.2 - size * 0.1, 3, 0, 6.2832);
            ctx.fill();
        }
    }
    if (e.stunTime > 0) {
        ctx.strokeStyle = 'rgba(120,255,235,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y - size * 0.62, 12, animTime * 6, animTime * 6 + 4.2);
        ctx.stroke();
    }
    if (e.isSlowed) {
        ctx.strokeStyle = 'rgba(80,170,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y + bob, size * 0.46, 0, 6.2832);
        ctx.stroke();
        ctx.fillStyle = 'rgba(80,170,255,0.18)';
        ctx.fill();
    }
}

function drawTower(t) {
    const idle = Math.sin(animTime * 2 + t.id) * 1.6;
    const since = world.time - t.firedAt;
    const recoil = since < 0.16 ? 1 + (0.16 - since) * 0.9 : 1;
    const selected = selectedTower === t;

    if (t.spot.kind === 'high') {
        ctx.strokeStyle = 'rgba(255,215,90,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y + 34, 46, 15, 0, 0, 6.2832);
        ctx.stroke();
    }
    drawShadow(t.x, t.y + 38, 36, 11, 0.28);

    if (selected || hoverTowerId === t.id) {
        ctx.beginPath();
        ctx.strokeStyle = selected ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)';
        ctx.fillStyle = selected ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 2;
        ctx.arc(t.x, t.y, t.range, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
    }

    if (t.type === 'swordfish') {
        drawSwordfish(t, idle, since);
    } else if (t.type === 'puffer') {
        drawPuffer(t, idle, since);
    } else {
        const img = sprites.towers[t.type];
        const s = 100 * recoil;
        if (ready(img)) {
            const spr = fit(img, 100);
            ctx.drawImage(spr, t.x - s / 2, t.y - s / 2 + idle, s, s);
            if (t.dark || t.darkAmt > 0.03) dimmed(spr, darkAmount(t, !t.dark), t.x - s / 2, t.y - s / 2 + idle, s, s);
        } else {
            ctx.fillStyle = 'blue';
            ctx.fillRect(t.x - 25, t.y - 25, 50, 50);
        }
    }

    // lav ile susturulmuş kule: kilit simgesi
    if (t.stun > 0) {
        ctx.fillStyle = 'rgba(30,6,0,0.40)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 46, 0, 6.2832);
        ctx.fill();
        drawLock(t.x, t.y - 66, '#ff9a3a', Math.max(0, t.stun / (t.stunMax || 5)), Math.ceil(t.stun));
    }

    if (t.level > 1) drawLevelBar(t.x, t.y + 52, t);

    if (selected) {
        ctx.beginPath();
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 3;
        ctx.arc(t.x, t.y, 55, 0, 6.2832);
        ctx.stroke();
    }
}

// Kılıç balığı: kaide sabit, balık hedefe doğru yumuşakça döner ve ateş edince geri tepme yapar
// kulenin seviyesi: ilk dilim temel renk, yükseltilen her dilim ek renk
const LEVEL_BASE = '#35c8ff';
const LEVEL_UP = '#ffc83d';

// 3. ve 5. dilim, seçilen yeteneğe göre turuncu (A) ya da mor (B) boyanır
const PERK_COLORS = ['#ff9a3a', '#b58cff'];
function perkIndex(t, lv) {
    const o = Core.perkOptions(t.type, lv);
    return o && t.level >= lv ? o.findIndex(x => x.id === t.perks[lv]) : -1;
}

function drawLevelBar(x, y, t) {
    const level = t.level;
    const w = 9;
    const gap = 2;
    const total = Core.MAX_LEVEL * w + (Core.MAX_LEVEL - 1) * gap;
    const x0 = x - total / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(4,10,18,0.7)';
    ctx.fillRect(x0 - 2, y - 2, total + 4, 8);
    for (let i = 0; i < Core.MAX_LEVEL; i++) {
        const pi = (i === 2 || i === 4) && i < level ? perkIndex(t, i + 1) : -1;
        ctx.fillStyle = i >= level ? 'rgba(255,255,255,0.14)' : (i === 0 ? LEVEL_BASE : (pi >= 0 ? PERK_COLORS[pi] : LEVEL_UP));
        ctx.fillRect(x0 + i * (w + gap), y, w, 4);
    }
    ctx.restore();
}

// kilit simgesi: arkada kalan süreyi gösteren halka ve altında saniye
function drawLock(x, y, color, frac, secs) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(8,8,16,0.82)';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, 6.2832);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 20, -Math.PI / 2, -Math.PI / 2 + 6.2832 * frac);
    ctx.stroke();
    ctx.strokeStyle = '#f2f2f2';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, -3, 6.5, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.strokeStyle = '#1a1a22';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.rect(-8.5, -3, 17, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath();
    ctx.arc(0, 3, 2, 0, 6.2832);
    ctx.fill();
    if (secs) {
        ctx.font = 'bold 15px sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(secs, 0, 36);
        ctx.fillStyle = '#ffd9a8';
        ctx.fillText(secs, 0, 36);
        ctx.textAlign = 'left';
    }
    ctx.restore();
}

// hedefe doğru yumuşakça dönen açı (kılıç balığı ve balon balığı namlusu)
function aimTower(t, rate) {
    const dt = Math.min(0.05, animTime - (t.aimT === undefined ? animTime : t.aimT));
    t.aimT = animTime;
    if (t.aim === undefined) t.aim = -0.8;
    let goal = t.aim;
    if (t.target && t.target.health > 0) goal = Math.atan2(t.target.y - t.y, t.target.x - t.x);
    const diff = Math.atan2(Math.sin(goal - t.aim), Math.cos(goal - t.aim));
    t.aim += diff * Math.min(1, dt * rate);
}

// Balon balığı: gövde sabit, başındaki havan namlusu düşmana doğru döner
function drawPuffer(t, idle, since) {
    const body = sprites.towers.puffer_body;
    const barrel = sprites.towers.puffer_barrel;
    if (!ready(body) || !ready(barrel)) {
        const icon = sprites.towers.puffer;
        if (ready(icon)) ctx.drawImage(fit(icon, 100), t.x - 50, t.y - 50 + idle, 100, 100);
        return;
    }
    const s = since < 0.16 ? 1 + (0.16 - since) * 0.5 : 1;
    const bodyFit = fit(body, 100);
    ctx.drawImage(bodyFit, t.x - 50 * s, t.y - 50 * s + idle, 100 * s, 100 * s);
    if (t.dark || t.darkAmt > 0.03) dimmed(bodyFit, darkAmount(t, !t.dark), t.x - 50 * s, t.y - 50 * s + idle, 100 * s, 100 * s);

    aimTower(t, 9);
    const recoil = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) * 6 : 0;
    const px = t.x - Math.cos(t.aim) * recoil;
    const py = t.y - 17 + idle - Math.sin(t.aim) * recoil;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(t.aim);
    if (Math.cos(t.aim) < 0) ctx.scale(1, -1);
    ctx.drawImage(fit(barrel, 140), -70, -70, 140, 140);
    ctx.restore();
}

function drawSwordfish(t, idle, since) {
    const base = sprites.towers.swordfish_base;
    const fish = sprites.towers.swordfish_fish;
    if (!ready(base) || !ready(fish)) {
        const icon = sprites.towers.swordfish;
        if (ready(icon)) ctx.drawImage(fit(icon, 100), t.x - 50, t.y - 50 + idle, 100, 100);
        return;
    }
    const baseFit = fit(base, 100);
    ctx.drawImage(baseFit, t.x - 50, t.y - 50, 100, 100);
    if (t.dark || t.darkAmt > 0.03) dimmed(baseFit, darkAmount(t, !t.dark), t.x - 50, t.y - 50, 100, 100);

    aimTower(t, 12);

    const recoil = since < 0.2 ? Math.sin((since / 0.2) * Math.PI) * 7 : 0;      // geriye doğru çekilir
    const px = t.x + 4 - Math.cos(t.aim) * recoil;
    const py = t.y + 10 + idle * 0.6 - Math.sin(t.aim) * recoil;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(t.aim);
    if (Math.cos(t.aim) < 0) ctx.scale(1, -1);     // sola bakarken baş aşağı dönmesin
    ctx.drawImage(fit(fish, 120), -60, -60, 120, 120);
    ctx.restore();

    // ateş anında kılıç ucunda parlama
    if (since < 0.12) {
        const tx = px + Math.cos(t.aim) * 52;
        const ty = py + Math.sin(t.aim) * 52;
        const a = 1 - since / 0.12;
        const g = ctx.createRadialGradient(tx, ty, 2, tx, ty, 26);
        g.addColorStop(0, `rgba(235,252,255,${0.95 * a})`);
        g.addColorStop(1, 'rgba(180,235,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(tx, ty, 26, 0, 6.2832);
        ctx.fill();
    }
}

function drawProjectile(p) {
    const img = sprites.projectiles[p.type];
    if (p.lob) {
        // havan: yay çizerek uçar, yere yaklaştıkça küçülür
        const f = p.flight;
        const lift = Math.sin(Math.PI * f) * 70;
        drawShadow(p.x, p.y + 4, 9, 4, 0.3);
        ctx.save();
        ctx.translate(p.x, p.y - lift);
        ctx.rotate(animTime * 6);
        const sz = 30 + Math.sin(Math.PI * f) * 8;
        if (ready(img)) ctx.drawImage(fit(img, 40), -sz / 2, -sz / 2, sz, sz);
        else {
            ctx.fillStyle = '#f5a742';
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, 6.2832);
            ctx.fill();
        }
        ctx.restore();
        return;
    }
    if (p.type === 'swordfish') {
        // keskin nişancı: hızlı, uzun bir ışık oku
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        const g = ctx.createLinearGradient(-46, 0, 10, 0);
        g.addColorStop(0, 'rgba(180,240,255,0)');
        g.addColorStop(1, 'rgba(230,252,255,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(-46, -2.5, 56, 5);
        if (ready(img)) ctx.drawImage(fit(img, 56), -22, -22, 56, 56);
        ctx.restore();
        return;
    }
    if (ready(img)) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(animTime * 9);
        ctx.globalAlpha = 0.28;
        const small = fit(img, 30);
        ctx.drawImage(small, -12 - Math.cos(p.angle) * 12, -12 - Math.sin(p.angle) * 12, 24, 24);
        ctx.globalAlpha = 1;
        ctx.drawImage(small, -15, -15, 30, 30);
        ctx.restore();
    } else {
        ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, 6.2832);
        ctx.fill();
    }
}

// Zincir Şoku: iki nokta arasında titreyen yıldırım
function drawArcs() {
    fx.arcs.forEach(a => {
        const k = a.life / a.max;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass === 0 ? `rgba(${a.color},0.45)` : 'rgba(255,255,255,0.95)';
            ctx.lineWidth = pass === 0 ? 7 : 2.5;
            ctx.beginPath();
            ctx.moveTo(a.pts[0].x, a.pts[0].y);
            for (let i = 1; i < a.pts.length; i++) {
                const p0 = a.pts[i - 1];
                const p1 = a.pts[i];
                const n = 6;
                for (let j = 1; j <= n; j++) {
                    const t = j / n;
                    const jit = j === n ? 0 : (Math.sin(a.seed + i * 7.3 + j * 12.9 + Math.floor(animTime * 30) * 3.1) * 11);
                    const dx = p1.x - p0.x;
                    const dy = p1.y - p0.y;
                    const len = Math.hypot(dx, dy) || 1;
                    ctx.lineTo(p0.x + dx * t - (dy / len) * jit, p0.y + dy * t + (dx / len) * jit);
                }
            }
            ctx.stroke();
        }
    });
    ctx.globalAlpha = 1;
}

// Balon Balığı'nın zehirli gaz bulutları
function drawGas() {
    if (!world.gas.length) return;
    world.gas.forEach((g, gi) => {
        const k = Math.min(1, g.t / 0.6) * Math.min(1, (g.max - g.t) / 0.25 + 0.2);
        for (let i = 0; i < 6; i++) {
            const a = animTime * 0.5 + i * 1.047 + gi;
            const rr = g.r * (0.35 + 0.25 * Math.sin(animTime * 0.9 + i * 2));
            const px = g.x + Math.cos(a) * rr;
            const py = g.y + Math.sin(a) * rr * 0.8;
            ctx.globalAlpha = 0.5 * k;
            const sz = g.r * 0.95;
            ctx.drawImage(glowSprite('110,225,70', 60), px - sz / 2, py - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 0.25 * k;
        ctx.strokeStyle = 'rgb(140,240,90)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
    });
    ctx.globalAlpha = 1;
}

function drawFx() {
    drawArcs();
    fx.sparks.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = `rgb(${p.c})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
    fx.rings.forEach(r => {
        const k = 1 - r.life / r.maxLife;
        const radius = r.r + (r.max - r.r) * k;
        ctx.globalAlpha = 1 - k;
        if (r.aoeImg && ready(sprites.projectiles.eel)) {
            ctx.drawImage(fit(sprites.projectiles.eel, 130), r.x - radius, r.y - radius, radius * 2, radius * 2);
        }
        if (r.fill) {
            ctx.fillStyle = `rgba(${r.color},0.22)`;
            ctx.beginPath();
            ctx.arc(r.x, r.y, radius, 0, 6.2832);
            ctx.fill();
        }
        ctx.strokeStyle = `rgba(${r.color},0.9)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, 6.2832);
        ctx.stroke();
        ctx.globalAlpha = 1;
    });

    fx.bubbles.forEach(b => {
        ctx.globalAlpha = Math.max(0, b.life / b.maxLife);
        ctx.strokeStyle = 'rgba(230,250,255,0.9)';
        ctx.fillStyle = 'rgba(200,240,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, 6.2832);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
    });

    ctx.textAlign = 'center';
    fx.floaters.forEach(f => {
        ctx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.5));
        ctx.font = f.big ? 'bold 34px sans-serif' : 'bold 20px sans-serif';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';

    if (fx.flash > 0) {
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.9);
        g.addColorStop(0, 'rgba(255,40,50,0)');
        g.addColorStop(1, `rgba(255,40,50,${0.5 * fx.flash})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }

    // patron gerilimi: kenarlar kalp atışıyla birlikte kararıp kızarır
    if (fx.tension > 0.02) {
        const beat = 0.65 + 0.35 * Math.max(0, Math.sin(animTime * (4.2 + 4 * fx.tension)));
        const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 0.95);
        g.addColorStop(0, 'rgba(40,0,8,0)');
        g.addColorStop(1, `rgba(60,0,10,${Math.min(0.55, fx.tension * 0.55) * beat})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
    if (fx.alert) {
        const k = fx.alert.life / fx.alert.max;
        const fade = Math.min(1, k * 4, (1 - k) * 8);
        const pulse = 0.75 + 0.25 * Math.sin(animTime * 12);
        ctx.save();
        ctx.globalAlpha = Math.max(0, fade);
        ctx.fillStyle = 'rgba(30,0,6,0.55)';
        ctx.fillRect(0, H * 0.36, W, 96);
        ctx.textAlign = 'center';
        ctx.font = 'bold 54px sans-serif';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText('⚠ ' + fx.alert.text + ' ⚠', W / 2, H * 0.36 + 66);
        ctx.fillStyle = `rgba(255,${Math.round(70 + 40 * pulse)},60,1)`;
        ctx.fillText('⚠ ' + fx.alert.text + ' ⚠', W / 2, H * 0.36 + 66);
        ctx.restore();
    }
}

// ------------------------------------------------------------------ kule market ve giriş

function renderTowerMarket() {
    const container = document.getElementById('towerMarketContainer');
    container.innerHTML = '';
    towerOrder().forEach((type, idx) => {
        const btn = document.createElement('div');
        btn.className = 'tower-button';
        btn.setAttribute('draggable', 'true');
        btn.setAttribute('data-tower', type);
        const def = Core.TOWER_TYPES[type];
        const name = (currentMap.towerNames && currentMap.towerNames[type]) || def.name;
        btn.innerHTML = `
            <div class="tower-icon-box"><img src="${SPRITE_FILES.towers[type]}" alt="${name}"></div>
            <div class="tower-info"><strong>${name}</strong>
                <div class="tower-cost"><span class="cost-val"></span> Enerji</div>
            </div>`;
        btn.addEventListener('dragstart', () => {
            draggedType = type;
            armedType = null;
            btn.classList.add('dragging');
        });
        btn.addEventListener('dragend', () => {
            btn.classList.remove('dragging');
            hoverSpot = null;
            draggedType = null;
        });
        btn.addEventListener('click', () => armTower(type));
        btn.addEventListener('mouseenter', () => { document.getElementById('towerHint').innerText = `${name}: ${def.role}`; });
        btn.addEventListener('mouseleave', () => { document.getElementById('towerHint').innerText = 'Bir kulenin üzerine gel'; });
        container.appendChild(btn);
    });
}

function armTower(type) {
    armedType = armedType === type ? null : type;
    document.querySelectorAll('.tower-button').forEach(b =>
        b.classList.toggle('armed', b.getAttribute('data-tower') === armedType));
}

function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const ox = (rect.width - W * scale) / 2;
    const oy = (rect.height - H * scale) / 2;
    return { x: (e.clientX - rect.left - ox) / scale, y: (e.clientY - rect.top - oy) / scale };
}

// kule yerinin üzerine gelince ne işe yaradığı yazılır (altın halkalı yerler: yüksek zemin)
let spotHintKind = null;
function showSpotHint(spot) {
    const kind = spot ? spot.kind : null;
    if (kind === spotHintKind) return;
    spotHintKind = kind;
    const box = document.getElementById('towerHint');
    if (kind === 'high') box.innerText = 'Yüksek zemin (altın halka): burada kulenin menzili %20 artar.';
    else if (kind === 'normal') box.innerText = 'Normal zemin. Altın halkalı yüksek zeminlerde menzil %20 artar.';
    else box.innerText = 'Bir kulenin üzerine gel';
}

function spotAt(p) {
    for (const spot of world.spots) {
        if (!spot.tower && Math.hypot(p.x - spot.x, p.y - spot.y) < Core.BUILD_SPOT_RADIUS) return spot;
    }
    return null;
}

function towerAt(p) {
    let best = null;
    let bestDist = 60;
    for (const t of world.towers) {
        const d = Math.hypot(t.x - p.x, t.y - p.y);
        if (d < bestDist) { bestDist = d; best = t; }
    }
    return best;
}

function tryBuild(type, spot) {
    const cost = world.towerCost(type);
    if (!spot) {
        notify('Kule sadece yeşil alanlara yerleştirilebilir.', '#ffd0d0');
        return false;
    }
    if (world.money < cost) {
        notify('Yetersiz enerji.', '#ffd0d0');
        addFloater({ x: spot.x, y: spot.y - 40, text: `${cost} Enerji gerek`, color: '#ff8a8a', life: 1.2, maxLife: 1.2, important: true });
        return false;
    }
    world.placeTower(type, spot);
    updateUI();
    renderTowerList();
    return true;
}

let hoverTowerId = null;

canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    hoverSpot = world ? spotAt(toLogical(e)) : null;
});
canvas.addEventListener('dragleave', () => { hoverSpot = null; });
canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!world || !draggedType) return;
    tryBuild(draggedType, spotAt(toLogical(e)));
    hoverSpot = null;
    draggedType = null;
});
canvas.addEventListener('mousemove', (e) => {
    if (!world) return;
    const p = toLogical(e);
    hoverSpot = armedType ? spotAt(p) : null;
    showSpotHint(spotAt(p));
    const t = towerAt(p);
    hoverTowerId = t ? t.id : null;
    const overTreasure = world.treasure && Math.hypot(p.x - world.treasure.x, p.y - world.treasure.y) < 56;
    canvas.style.cursor = overTreasure ? 'pointer' : armedType ? (hoverSpot ? 'copy' : 'not-allowed') : (t ? 'pointer' : 'default');
});
canvas.addEventListener('mouseleave', () => { hoverSpot = null; hoverTowerId = null; showSpotHint(null); });
canvas.addEventListener('click', (e) => {
    if (!world || world.result) return;
    const p = toLogical(e);
    if (world.treasure && Math.hypot(p.x - world.treasure.x, p.y - world.treasure.y) < 56) {
        world.collectTreasure();
        return;
    }
    if (armedType) {
        const spot = spotAt(p);
        if (spot) { tryBuild(armedType, spot); return; }
    }
    const t = towerAt(p);
    if (t) {
        armedType = null;
        document.querySelectorAll('.tower-button').forEach(b => b.classList.remove('armed'));
        openTowerModal(t);
    } else if (!armedType) {
        closeTowerModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (!world || document.getElementById('gameScreen').classList.contains('hidden')) return;
    if (!document.getElementById('settingsScreen').classList.contains('hidden')) {
        if (e.key === 'Escape') closeSettings();
        return;
    }
    const k = e.key.toLowerCase();
    if (k === 'escape') {
        if (armedType) { armTower(armedType); }
        else if (selectedTower) closeTowerModal();
        else quitToMapSelect();
    } else if (k === ' ') {
        e.preventDefault();
        startNextWave();
    } else if (k === 'p') togglePause();
    else if (k === 'f') toggleSpeed();
    else if (k >= '1' && k <= '9' && towerOrder()[+k - 1]) armTower(towerOrder()[+k - 1]);
});

// ------------------------------------------------------------------ kule penceresi

// Çubukların uzunluğu, tüm kule türlerinin 5. seviyedeki en yüksek değerine göre ölçeklenir:
// böylece farklı kuleler birbiriyle karşılaştırılabilir.
let statMaxCache = null;
function statMax() {
    if (statMaxCache) return statMaxCache;
    const fake = { map: {}, rangeMul: 1, darkMul: 1 };
    const m = { dmg: 1, range: 1, speed: 1, aoe: 1 };
    Object.keys(Core.TOWER_TYPES).forEach(type => {
        const t = new Core.Tower(fake, type, { x: 0, y: 0, kind: 'high' }, 0);
        t.level = Core.MAX_LEVEL;
        t.derive();
        m.dmg = Math.max(m.dmg, t.dmg * t.shots);
        m.range = Math.max(m.range, t.range);
        m.speed = Math.max(m.speed, 1 / t.rate);
        m.aoe = Math.max(m.aoe, t.aoe);
    });
    statMaxCache = m;
    return m;
}

function statBarHtml(label, cur, next, max, tip) {
    const base = Math.min(100, (cur / max) * 100);
    const gain = next != null ? Math.max(0, Math.min(100 - base, ((next - cur) / max) * 100)) : 0;
    return `<div class="stat-row" title="${tip}"><span class="stat-name">${label}</span>` +
        `<div class="stat-bar"><i class="base" style="width:${base.toFixed(1)}%"></i><i class="gain" style="width:${gain.toFixed(1)}%"></i></div></div>`;
}

function levelBarHtml(t, withNext) {
    const level = t.level;
    let h = '<div class="stat-row"><span class="stat-name">Seviye</span><div class="lv-bar">';
    for (let i = 1; i <= Core.MAX_LEVEL; i++) {
        const pi = (i === 3 || i === 5) && i <= level ? perkIndex(t, i) : -1;
        const cls = i > level ? (withNext && i === level + 1 ? 'next' : 'off') : (i === 1 ? 'base' : (pi >= 0 ? (pi === 0 ? 'pa' : 'pb') : 'up'));
        h += `<i class="${cls}"></i>`;
    }
    return h + '</div></div>';
}

function towerBarsHtml(t) {
    const mx = statMax();
    let n = null;
    if (t.level < Core.MAX_LEVEL) {
        n = Object.assign(Object.create(Core.Tower.prototype), t, { level: t.level + 1 });
        n.derive();
    }
    const val = (a, b, f) => (b != null && b !== a ? `${f(a)} → ${f(b)}` : f(a));
    const dps = x => x.dmg * x.shots;
    let h = levelBarHtml(t, !!n);
    h += statBarHtml('Hasar', dps(t), n ? dps(n) : null, mx.dmg, `Hasar: ${val(dps(t), n && dps(n), v => v)}`);
    h += statBarHtml('Menzil', t.range, n ? n.range : null, mx.range, `Menzil: ${val(t.range, n && n.range, v => v)}`);
    h += statBarHtml('Atış hızı', 1 / t.rate, n ? 1 / n.rate : null, mx.speed, `Atış aralığı: ${val(t.rate, n && n.rate, v => v.toFixed(2) + ' sn')}`);
    if (t.aoe) h += statBarHtml('Alan', t.aoe, n ? n.aoe : null, mx.aoe, `Alan yarıçapı: ${val(t.aoe, n && n.aoe, v => v)}`);
    if (t.dark) h += '<p class="stat-warn">Karanlıkta: menzil kısaldı. Fener Balığı\'nın ışığına al.</p>';
    return h;
}

function openTowerModal(tower) {
    selectedTower = tower;
    document.getElementById('towerModalName').innerText = tower.name;

    document.getElementById('towerModalStats').innerHTML = towerBarsHtml(tower);
    document.getElementById('towerModalPerk').innerHTML = perkHtml(tower);
    document.getElementById('modeBtn').innerText = 'Hedef: ' + MODE_LABEL[tower.mode];

    const cost = tower.upgradeCost();
    const upgradeBtn = document.getElementById('upgradeBtn');
    if (cost === null) {
        upgradeBtn.innerText = 'MAKSİMUM SEVİYE';
        upgradeBtn.disabled = true;
    } else {
        upgradeBtn.innerText = tower.nextPerkOptions() ? `YÜKSELT (${cost} Enerji)\nyetenek seç` : `YÜKSELT (${cost} Enerji)`;
        upgradeBtn.disabled = world.money < cost;
    }
    document.getElementById('sellBtn').innerText = `SAT (+${tower.sellValue()} Enerji)`;
    document.getElementById('perkChoice').classList.add('hidden');
    document.getElementById('towerMain').classList.remove('hidden');
    document.getElementById('towerModal').classList.remove('hidden');
    renderTowerList();
}

// seçilmiş yetenekler; yoksa bir sonraki yetenek seçiminin ne zaman geleceği
function perkHtml(t) {
    const lines = t.perkLines();
    let h = lines.map(l => {
        const pi = perkIndex(t, l.level);
        return `<div class="perk-line ${pi === 0 ? 'a' : 'b'}"><b>Sv ${l.level} · ${l.name}</b>${l.desc}</div>`;
    }).join('');
    const next = t.level < Core.MAX_LEVEL ? [3, 5].find(lv => lv > t.level) : null;
    if (next) {
        const o = Core.perkOptions(t.type, next);
        h += `<div class="perk-hint">${next}. seviyede yetenek seçersin: <span style="color:#ff9a3a">${o[0].name}</span> ya da <span style="color:#b58cff">${o[1].name}</span></div>`;
    }
    if (!lines.length && t.type === 'angler') h = '<div class="perk-hint">Karanlık haritada çevresini aydınlatır: ışığındaki kuleler menzil cezası almaz.</div>' + h;
    return h;
}

function closeTowerModal() {
    selectedTower = null;
    document.getElementById('towerModal').classList.add('hidden');
    if (world) renderTowerList();
}

function cycleTargetMode() {
    if (!selectedTower) return;
    const modes = Core.TARGET_MODES;
    selectedTower.mode = modes[(modes.indexOf(selectedTower.mode) + 1) % modes.length];
    document.getElementById('modeBtn').innerText = 'Hedef: ' + MODE_LABEL[selectedTower.mode];
}

function upgradeSelectedTower() {
    if (!selectedTower) return;
    const opts = selectedTower.nextPerkOptions();
    if (opts) { openPerkChoice(selectedTower, opts); return; }
    if (world.upgradeTower(selectedTower)) {
        updateUI();
        openTowerModal(selectedTower);
    }
}

// 3. ve 5. seviyeye çıkarken iki yetenekten birini seçtiren panel
function openPerkChoice(t, opts) {
    const cost = t.upgradeCost();
    document.getElementById('perkChoiceTitle').innerText = `Seviye ${t.level + 1} yeteneği`;
    document.getElementById('perkChoiceSub').innerText = `${t.name} için birini seç (${cost} Enerji). Seçim sonradan değişmez.`;
    opts.forEach((o, i) => {
        const card = document.getElementById('perkCard' + i);
        card.innerHTML = `<span class="perk-tag ${i === 0 ? 'a' : 'b'}">SEÇENEK ${i === 0 ? 'A' : 'B'}</span><b>${o.name}</b><span class="perk-desc">${o.desc}</span>`;
        card.disabled = world.money < cost;
        card.onclick = () => confirmPerk(i);
    });
    document.getElementById('towerMain').classList.add('hidden');
    document.getElementById('perkChoice').classList.remove('hidden');
}

function closePerkChoice() {
    document.getElementById('perkChoice').classList.add('hidden');
    document.getElementById('towerMain').classList.remove('hidden');
}

function confirmPerk(i) {
    if (!selectedTower) return;
    if (world.upgradeTower(selectedTower, i)) {
        updateUI();
        openTowerModal(selectedTower);
    }
}

function sellSelectedTower() {
    if (!selectedTower) return;
    world.sellTower(selectedTower);
    closeTowerModal();
    updateUI();
}

function renderTowerList() {
    const container = document.getElementById('towerList');
    if (world.towers.length === 0) {
        container.innerHTML = '<p style="color:#888; font-size:0.95em;">Henüz kule yerleştirilmedi.</p>';
        return;
    }
    container.innerHTML = '';
    world.towers.forEach(t => {
        const row = document.createElement('div');
        row.className = 'tower-list-row' + (selectedTower === t ? ' selected' : '');
        const name = document.createElement('span');
        name.className = 'row-name';
        name.innerText = t.name;
        const bar = document.createElement('span');
        bar.className = 'lv-bar mini';
        for (let i = 1; i <= Core.MAX_LEVEL; i++) {
            const seg = document.createElement('i');
            const pi = (i === 3 || i === 5) && i <= t.level ? perkIndex(t, i) : -1;
            seg.className = i > t.level ? 'off' : (i === 1 ? 'base' : (pi >= 0 ? (pi === 0 ? 'pa' : 'pb') : 'up'));
            bar.appendChild(seg);
        }
        row.appendChild(name);
        row.appendChild(bar);
        row.onclick = () => openTowerModal(t);
        container.appendChild(row);
    });
}

// ------------------------------------------------------------------ yan panel

let uiCache = {};

function setText(id, value) {
    if (uiCache[id] === value) return;
    uiCache[id] = value;
    document.getElementById(id).innerText = value;
}

function updateUI() {
    if (!world) return;
    const hp = Math.max(0, Math.ceil(world.health));
    setText('healthValue', hp);
    setText('moneyValue', world.money);
    setText('waveValue', world.endless ? `${world.wave} (sonsuz)` : `${world.wave}/${world.totalWaves}`);
    const bar = document.getElementById('healthBar');
    const pct = Math.round(100 * hp / world.maxHealth);
    if (uiCache.hpPct !== pct) {
        uiCache.hpPct = pct;
        bar.style.width = pct + '%';
        bar.style.background = pct > 50 ? '#3ddc6b' : pct > 25 ? '#f2c230' : '#ef4b4b';
    }

    const btn = document.getElementById('waveButton');
    const can = world.canStartWave();
    const text = world.wave >= world.totalWaves && !world.endless ? 'SON DALGA GELDİ' : `DALGA ${world.wave + 1} BAŞLAT`;
    if (uiCache.waveBtn !== text + can) {
        uiCache.waveBtn = text + can;
        btn.innerText = text;
        btn.disabled = !can;
    }

    const key = world.wave + ':' + world.towers.length + ':' + JSON.stringify(world.adapt);
    if (uiCache.preview !== key) {
        uiCache.preview = key;
        renderWavePreview();
    }

    document.querySelectorAll('.tower-button').forEach(b => {
        const type = b.getAttribute('data-tower');
        const cost = world.towerCost(type);
        const cv = b.querySelector('.cost-val');
        if (cv.innerText !== String(cost)) cv.innerText = cost;
        const afford = world.money >= cost;
        b.classList.toggle('unaffordable', !afford);
    });

    if (selectedTower && world.towers.includes(selectedTower)) {
        const cost = selectedTower.upgradeCost();
        if (cost !== null) document.getElementById('upgradeBtn').disabled = world.money < cost;
    }
}

function towerTypeName(type) {
    return (currentMap.towerNames && currentMap.towerNames[type]) || Core.TOWER_TYPES[type].name;
}

function renderWavePreview() {
    const box = document.getElementById('wavePreview');
    const next = world.previewNext();
    if (!next) {
        box.innerHTML = '<div class="preview-title">Tüm dalgalar başladı</div>';
        return;
    }
    const chips = Object.entries(next.counts).map(([type, count]) => {
        const img = SPRITE_FILES.enemies[enemyKey(type, currentMap.boss)];
        const name = typeName(type);
        return `<span class="chip" title="${name}"><img src="${img}" alt="">×${count}</span>`;
    }).join('');
    const advice = world.waveAdvice(next.wave).map(l => `<div class="advice">${l}</div>`).join('');
    const adapt = Object.entries(world.adapt).map(([t, r]) => `${towerTypeName(t)} %${Math.round(r * 100)}`);
    const adaptHtml = adapt.length ? `<div class="adapt-line" title="Hasarın yarısından fazlasını tek türe yaptırırsan düşmanlar ona alışır; türleri karıştırınca kalkar">Düşmanlar alıştı: ${adapt.join(', ')} daha az hasar veriyor</div>` : '';
    box.innerHTML = `<div class="preview-title">Sıradaki: Dalga ${next.wave}</div><div class="chips">${chips}</div>${advice}${adaptHtml}`;
}

function togglePause() {
    if (!world) return;
    paused = !paused;
    document.getElementById('pauseButton').innerText = paused ? 'DEVAM ET' : 'DURAKLAT';
}

function toggleSpeed() {
    if (!world) return;
    const order = [1, 2, 0.5];
    speedMultiplier = order[(order.indexOf(speedMultiplier) + 1) % order.length];
    document.getElementById('speedButton').innerText = `HIZ: ${speedMultiplier}x`;
}

function startNextWave() {
    if (!world) return;
    if (world.result) return;
    if (world.wave >= world.totalWaves) {
        notify('Tüm dalgalar başladı.');
        return;
    }
    if (!world.startWave()) notify('Önceki dalganın düşmanları hâlâ doğuyor, biraz bekleyin.', '#ffd0d0');
    updateUI();
}

// ------------------------------------------------------------------ ekranlar

function showMapSelect() {
    document.getElementById('menuScreen').classList.add('hidden');
    document.getElementById('mapSelectScreen').classList.remove('hidden');
    renderMapSelectScreen();
}

function backToMenuFromMapSelect() {
    document.getElementById('mapSelectScreen').classList.add('hidden');
    document.getElementById('menuScreen').classList.remove('hidden');
}

function stopGame() {
    if (world) { saveProgress(); logEnd(); }
    stopLoop();
    world = null;
    document.getElementById('towerModal').classList.add('hidden');
    document.getElementById('gameScreen').classList.add('hidden');
}

function quitToMapSelect() {
    if (world) addLog('Oyundan çıkıldı, harita seçimine dönüldü.');
    stopGame();
    showMapSelect();
}

function toMapSelect() {
    document.getElementById('winScreen').classList.add('hidden');
    document.getElementById('loseScreen').classList.add('hidden');
    stopGame();
    showMapSelect();
}

function renderMapSelectScreen() {
    const records = Settings.records();
    const pills = document.getElementById('difficultyPills');
    pills.innerHTML = '';
    Object.entries(Core.DIFFICULTY).forEach(([key, d]) => {
        const b = document.createElement('button');
        b.className = 'pill' + (key === difficulty ? ' active' : '');
        b.innerText = d.label;
        b.onclick = () => {
            difficulty = key;
            Settings.setDifficulty(key);
            renderMapSelectScreen();
        };
        pills.appendChild(b);
    });
    document.getElementById('difficultyInfo').innerText = Core.describeDifficulty(Core.DIFFICULTY[difficulty]);

    const grid = document.getElementById('mapGrid');
    grid.innerHTML = '';
    MAPS.forEach((m, i) => {
        const rec = records[recordKey(m)];
        const earned = rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : '☆☆☆';
        const card = document.createElement('button');
        card.className = 'map-card';
        card.style.backgroundImage = `url('${m.thumb || m.bg}')`;
        card.innerHTML = `
            <div class="map-card-shade"></div>
            <div class="map-card-earned ${rec ? 'done' : ''}">${earned}</div>
            <div class="map-card-text">
                <div class="map-card-name">${m.name}</div>
                <div class="map-card-desc">${m.desc}</div>
                <div class="map-card-meta">${(records[m.id + ':endless'] || {}).wave ? 'Sonsuz rekor: ' + records[m.id + ':endless'].wave + ' · ' : ''}Zorluk ${'●'.repeat(m.stars)}${'○'.repeat(5 - m.stars)} · ${Core.totalWavesOf(m)} dalga</div>
            </div>`;
        card.onclick = () => openMap(i);
        const sv = Settings.getSave(m.id);
        if (sv && sv.snap) {
            const badge = document.createElement('div');
            badge.className = 'map-card-save';
            badge.innerText = `▶ Devam: dalga ${sv.wave}`;
            card.appendChild(badge);
        }
        grid.appendChild(card);
    });
}

function startEndless() {
    if (!world || !world.goEndless()) return;
    document.getElementById('winScreen').classList.add('hidden');
    endShown = false;
    endDelay = 0;
    addLog('Sonsuz mod başladı! Düşmanlar güçlenmeye devam edecek, her turda bir patron gelir.');
    uiCache = {};
    updateUI();
}

function showEnd() {
    Settings.clearSave(currentMap.id);
    document.getElementById('towerModal').classList.add('hidden');
    const s = world.stats;
    const statsText = `${s.kills} düşman yok edildi · ${world.towers.length} kule · ${Core.DIFFICULTY[difficulty].label}`;
    if (world.result === 'win') {
        const hp = Math.max(0, Math.ceil(world.health));
        const stars = starsFor(hp, world.maxHealth);
        const key = recordKey(currentMap);
        const old = Settings.records()[key];
        if (!old || old.stars < stars) Settings.setRecord(key, { stars, health: hp });
        document.getElementById('finalHealthWin').innerText = hp;
        document.getElementById('finalMoneyWin').innerText = world.money;
        document.getElementById('winStars').innerText = '★'.repeat(stars) + '☆'.repeat(3 - stars);
        document.getElementById('winStats').innerText = statsText;
        document.getElementById('winScreen').classList.remove('hidden');
        addLog(`TEBRİKLER! Oyunu kazandınız! Kalan Can: ${hp}`);
        addLog(buildReport());
        flushLog();
    } else {
        document.getElementById('finalWaveLose').innerText = world.endless ? `${world.wave} (sonsuz mod)` : `${world.wave}/${world.totalWaves}`;
        if (world.endless) {
            const key = currentMap.id + ':endless';
            const best = Settings.records()[key];
            if (!best || best.wave < world.wave) Settings.setRecord(key, { wave: world.wave });
        }
        document.getElementById('finalMoneyLose').innerText = world.money;
        document.getElementById('loseStats').innerText = statsText;
        document.getElementById('loseScreen').classList.remove('hidden');
        addLog('Oyunu kaybettiniz!');
        addLog(buildReport());
        flushLog();
    }
}

function toggleInfo() {
    document.getElementById('infoModal').classList.toggle('hidden');
}

function exitGame() {
    window.saveBeforeExit();
    alert('JAVA_EXIT_APP');
}

function restartGame() {
    selectMap(currentMapIndex);
}

window.onload = function () {
    document.getElementById('menuScreen').classList.remove('hidden');
    renderMapSelectScreen();
    // geliştirme kısayolu: index.html#map=2&diff=hard haritayı doğrudan açar
    const m = /map=(\d+)/.exec(location.hash);
    const d = /diff=(\w+)/.exec(location.hash);
    if (d && Core.DIFFICULTY[d[1]]) difficulty = d[1];
    if (m && MAPS[+m[1]]) selectMap(+m[1]);
};
