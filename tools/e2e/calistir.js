// Web ve mobil uçtan uca testleri (Playwright + Chromium).
//
//   cd tools/e2e && npm install && npx playwright install chromium     (bir kez)
//   node tools/e2e/calistir.js              tüm testler
//   node tools/e2e/calistir.js dokunmatik   adında "dokunmatik" geçen testler
//
// Oyunu yerel sunucudan açar ve masaüstü, telefon (yatay), küçük telefon, geniş telefon ve tablet profillerinde sürer:
// ekranların düzeni, dokunma ile kule kurma, ses motoru, kayıt/devam, çevrimdışı çalışma, geri tuşu ve dokuz haritanın
// baştan sona oynanması. Android uygulaması için ayrı: tools/e2e/android.js (emülatör ya da cihaz gerekir).
const fs = require('fs');
const path = require('path');
const { baslat, sayfaAc, PROFILLER } = require('./yardimci.js');

const CIKTI = path.join(__dirname, 'ciktilar');
fs.mkdirSync(CIKTI, { recursive: true });

const testler = [];
const test = (ad, fn) => testler.push({ ad, fn });
const ok = (kosul, mesaj) => { if (!kosul) throw new Error(mesaj); };
const bekle = ms => new Promise(r => setTimeout(r, ms));

// Ekrandaki etkileşimli öğelerin sığıp sığmadığını ölçer
async function duzenOlc(page) {
    return page.evaluate(() => {
        const gorunur = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1 && +s.opacity > 0.05; };
        const cikti = { tasma: document.documentElement.scrollWidth - innerWidth, dikeyTasma: document.documentElement.scrollHeight - innerHeight, ogeler: [], vw: innerWidth, vh: innerHeight };
        document.querySelectorAll('button, .tower-button, .pill, .map-card, .g-tab, .g-nav, .hint-go').forEach(e => {
            if (!gorunur(e)) return;
            const r = e.getBoundingClientRect();
            cikti.ogeler.push({ ad: (e.id || (e.className && e.className.toString().split(' ')[0]) || e.tagName) + ':' + (e.innerText || '').trim().slice(0, 14).replace(/\n/g, ' '), x: r.x, y: r.y, w: r.width, h: r.height, kaydirilir: !!e.closest('#mapGrid, #guideList, .guide-tabs, #guideText, .guide-stage, .hint-card, .settings-card, #towerModal') });
        });
        return cikti;
    });
}

function duzenDenetle(o, profil, ekran, dokunmatik) {
    ok(o.tasma <= 1, `${profil}/${ekran}: sayfa yatayda taşıyor (${o.tasma} px)`);
    const min = dokunmatik ? 30 : 0;
    for (const e of o.ogeler) {
        if (e.kaydirilir) continue;                       // kaydırılabilir kutuların içindekiler görünür alanın dışında olabilir
        ok(e.x >= -1 && e.y >= -1 && e.x + e.w <= o.vw + 1 && e.y + e.h <= o.vh + 1, `${profil}/${ekran}: "${e.ad}" ekranın dışına taşıyor (${Math.round(e.x)},${Math.round(e.y)} ${Math.round(e.w)}x${Math.round(e.h)} / ${o.vw}x${o.vh})`);
        if (min) ok(Math.min(e.w, e.h) >= min, `${profil}/${ekran}: "${e.ad}" dokunmak için çok küçük (${Math.round(e.w)}x${Math.round(e.h)})`);
    }
}

async function goruntu(page, profil, ad) {
    await page.screenshot({ path: path.join(CIKTI, `${profil}_${ad}.png`) });
}

const TELEFONLAR = ['telefon', 'kucukTelefon', 'genisTelefon', 'tablet'];

// ----------------------------------------------------------------------------------------------- açılış ve düzen
for (const profil of ['masaustu', ...TELEFONLAR]) {
    test(`düzen: ${profil}: tüm ekranlar sığıyor, dokunma hedefleri yeterli`, async ({ t }) => {
        const mobil = profil !== 'masaustu';
        const { page, hatalar } = await sayfaAc(t.browser, profil, t.url);
        const kontrol = async ekran => { duzenDenetle(await duzenOlc(page), profil, ekran, mobil); await goruntu(page, profil, ekran); };
        await kontrol('1menu');
        await page.evaluate(() => showMapSelect()); await page.waitForTimeout(250); await kontrol('2harita');
        await page.evaluate(() => selectMap(0)); await page.waitForTimeout(500); await kontrol('3oyun');
        await page.waitForTimeout(3300);
        await page.evaluate(() => { world.money = 4000; tryBuild('octopus', world.spots[0]); tryBuild('eel', world.spots[8]); });
        await page.evaluate(() => openTowerModal(world.towers[0])); await page.waitForTimeout(250); await kontrol('4kulemodal');
        await page.evaluate(() => { closeTowerModal(); openHint(); }); await page.waitForTimeout(250); await kontrol('5ipucu');
        await page.evaluate(() => { closeHint(); openGuide('towers', 'octopus'); }); await page.waitForTimeout(500); await kontrol('6rehber');
        await page.evaluate(() => { openGuide('maps', 'volkan'); }); await page.waitForTimeout(500); await kontrol('7rehber_harita');
        await page.evaluate(() => { closeGuide(); openSettings(); }); await page.waitForTimeout(250); await kontrol('8ayarlar');
        await page.evaluate(() => { closeSettings(); world.result = 'win'; endDelay = 0; endShown = false; showEnd(); }); await page.waitForTimeout(250); await kontrol('9kazandin');
        ok(hatalar.length === 0, 'sayfa hataları: ' + hatalar.join(' | '));
        if (mobil) {
            // oyun alanı ekranın büyük bölümünü kullanıyor ve çubuklar onu kapatmıyor
            await page.evaluate(() => { document.getElementById('winScreen').classList.add('hidden'); });
            const g = await page.evaluate(() => { const c = document.getElementById('gameCanvas').getBoundingClientRect(); return { w: c.width, h: c.height, vw: innerWidth, vh: innerHeight }; });
            ok(g.w >= g.vw * 0.55, `${profil}: oyun alanı çok dar (${Math.round(g.w)} / ${g.vw})`);
            ok(g.h >= g.vh * 0.6, `${profil}: oyun alanı çok kısa (${Math.round(g.h)} / ${g.vh})`);
        }
        await page.context().close();
    });
}

test('düzen: masaüstünde eski yan panel düzeni bozulmadı', async ({ t }) => {
    const { page } = await sayfaAc(t.browser, 'masaustu', t.url);
    ok(!(await page.evaluate(() => document.documentElement.classList.contains('compact'))), 'masaüstünde compact sınıfı olmamalı');
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(400);
    const d = await page.evaluate(() => {
        const sb = document.querySelector('.sidebar').getBoundingClientRect();
        const items = [...document.querySelectorAll('.menu-buttons .menu-button')].map(b => b.getBoundingClientRect());
        return { sidebarW: sb.width, placed: getComputedStyle(document.getElementById('placedPanel')).display, hint: getComputedStyle(document.getElementById('towerHint')).display };
    });
    ok(d.sidebarW >= 300, 'yan panel genişliği korunmalı: ' + d.sidebarW);
    ok(d.placed !== 'none' && d.hint !== 'none', 'yerleştirilen kule listesi ve ipucu satırı görünmeli');
    await page.evaluate(() => { toMapSelect && toMapSelect(); backToMenuFromMapSelect && backToMenuFromMapSelect(); });
    const dikey = await page.evaluate(() => { const b = [...document.querySelectorAll('.menu-buttons .menu-button')].filter(x => x.offsetParent !== null).map(x => x.getBoundingClientRect().y); return b.length > 1 && b.every((y, i) => i === 0 || y > b[i - 1]); });
    ok(dikey, 'masaüstü menüsü düğmeleri alt alta durmalı');
    await page.context().close();
});

test('düzen: dikey tutulunca yatay çevirme uyarısı çıkar, yatayda çıkmaz', async ({ t }) => {
    const { ctx, page } = await sayfaAc(t.browser, 'telefon', t.url);
    const gorunuyor = () => page.evaluate(() => getComputedStyle(document.getElementById('rotateHint')).display !== 'none');
    ok(!(await gorunuyor()), 'yatayda uyarı olmamalı');
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
    ok(await gorunuyor(), 'dikeyde uyarı görünmeli');
    await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(200);
    ok(!(await gorunuyor()), 'tekrar yatayda uyarı kalkmalı');
    await ctx.close();
});

// ----------------------------------------------------------------------------------------------- ses
test('ses: efektler ve müzik üretiliyor, Java ile aynı sayıda efekt var', async ({ t }) => {
    const { page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.touchscreen.tap(100, 100);                 // ilk dokunuş ses bağlamını açar
    await page.waitForFunction(() => GameAudio.status().musicDone, null, { timeout: 60000 });
    const s = await page.evaluate(() => GameAudio.status());
    ok(s.supported && s.state === 'running', 'ses bağlamı çalışmalı: ' + JSON.stringify(s));
    ok(s.sfx === 34 && s.sfxTotal === 34, 'efekt sayısı 34 olmalı: ' + s.sfx);
    ok(s.layers === 9 && s.musicPlaying, 'müzik katmanları: ' + s.layers);
    ok(s.error === '', 'ses hatası: ' + s.error);
    ok(s.genMs < 20000, 'ses üretimi çok yavaş: ' + s.genMs + ' ms');
    ok(s.musicState === 'menu', 'menüde müzik durumu "menu" olmalı: ' + s.musicState);
    ok(hatalar.length === 0, hatalar.join(' | '));
    await page.context().close();
});

test('ses: müzik durumları katman düzeylerini Java ile aynı değerlere götürüyor', async ({ t }) => {
    const { page } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.touchscreen.tap(100, 100);
    await page.waitForFunction(() => GameAudio.status().musicDone, null, { timeout: 60000 });
    const beklenen = {
        menu: [0.90, 0.70, 0, 0, 0, 0, 0, 0, 0],
        calm: [1.00, 0.60, 0.15, 0, 0, 0, 0, 0, 0],
        battle: [0.30, 0.06, 0.85, 0.55 + 0.21, 0.55 + 0.245, 0.55 * (0.7 - 0.55) / 0.45, 0, 0.60 + 0.21, 0.40 + 0.385],
        boss: [0.35, 0, 1, 1, 1, 0.60 + 0.35 * 0.7, 0.30 + 0.60 * 0.7, 0.85, 0.85 + 0.15 * 0.7],
    };
    for (const [durum, hedef] of Object.entries(beklenen)) {
        await page.evaluate(d => GameAudio.setMusic(d, 0.7), durum);
        await page.waitForTimeout(5200);                  // 0,7 sn zaman sabiti: ~7 sabit sonra hedefe oturur
        const g = (await page.evaluate(() => GameAudio.status())).targets;
        hedef.forEach((v, i) => ok(Math.abs(g[i] - v) < 0.02, `${durum}: katman ${i} = ${g[i]}, beklenen ${v.toFixed(3)}`));
    }
    await page.context().close();
});

test('ses: pencere arka plana geçince ses ve efektler kesilir, dönünce açılır', async ({ t }) => {
    const { page } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.touchscreen.tap(100, 100);
    await page.waitForFunction(() => GameAudio.status().sfxDone && GameAudio.status().state === 'running', null, { timeout: 60000 });
    await page.evaluate(() => GameAudio.playSfx('click', 1));
    ok((await page.evaluate(() => GameAudio.status().voices)) >= 0, 'efekt çalınabilmeli');
    await page.evaluate(() => Platform.windowFocus(false));
    await page.waitForTimeout(700);
    let s = await page.evaluate(() => GameAudio.status());
    ok(!s.active && s.state === 'suspended', 'arka planda ses bağlamı askıya alınmalı: ' + JSON.stringify({ a: s.active, st: s.state }));
    await page.evaluate(() => GameAudio.playSfx('click', 1));
    ok((await page.evaluate(() => GameAudio.status().voices)) === 0, 'arka planda yeni efekt çalmamalı');
    await page.evaluate(() => Platform.windowFocus(true));
    await page.waitForTimeout(500);
    s = await page.evaluate(() => GameAudio.status());
    ok(s.active && s.state === 'running', 'öne gelince ses geri açılmalı: ' + JSON.stringify({ a: s.active, st: s.state }));
    await page.context().close();
});

test('ses: oyun içi olaylar efekt çalıyor ve müzik durumu savaşa geçiyor', async ({ t }) => {
    const { page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.touchscreen.tap(100, 100);
    await page.waitForFunction(() => GameAudio.status().musicDone, null, { timeout: 60000 });
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(600);
    let calan = 0;
    await page.evaluate(() => { window.__sfx = 0; const o = GameAudio.playSfx; GameAudio.playSfx = (n, v) => { window.__sfx++; return o(n, v); }; });
    await page.evaluate(() => { world.money = 5000; tryBuild('octopus', world.spots[0]); startNextWave(); });
    await page.waitForTimeout(1500);
    const durum = await page.evaluate(() => GameAudio.status().musicState);
    ok(durum === 'battle', 'dalga sürerken müzik "battle" olmalı: ' + durum);
    await page.evaluate(() => { for (let i = 0; i < 600; i++) { world.update(1 / 30); updateFx(1 / 30); } });      // 20 sn: ateş sesleri
    calan = await page.evaluate(() => window.__sfx);
    ok(calan >= 3, 'inşa, dalga başlangıcı ve atış sesleri çalmalı: ' + calan);
    ok(hatalar.length === 0, hatalar.join(' | '));
    await page.context().close();
});

// ----------------------------------------------------------------------------------------------- dokunmatik
async function cdpDokun(ctx, page) {
    const cdp = await ctx.newCDPSession(page);
    const dokun = (tip, x, y) => cdp.send('Input.dispatchTouchEvent', { type: tip, touchPoints: tip === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const surukle = async (a, b, adim = 10) => {
        await dokun('touchStart', a.x, a.y);
        for (let i = 1; i <= adim; i++) { await dokun('touchMove', a.x + (b.x - a.x) * i / adim, a.y + (b.y - a.y) * i / adim); await bekle(18); }
        await bekle(80);
        return { birak: () => dokun('touchEnd') };
    };
    return { dokun, surukle };
}

for (const profil of ['telefon', 'kucukTelefon']) {
    test(`dokunmatik: ${profil}: kule düğmesinden spota sürükleyip kule kurma`, async ({ t }) => {
        const { ctx, page, hatalar } = await sayfaAc(t.browser, profil, t.url);
        const { surukle } = await cdpDokun(ctx, page);
        await page.evaluate(() => selectMap(0)); await page.waitForTimeout(3800);
        const k = await page.evaluate(() => {
            const b = document.querySelector('.tower-button[data-tower="octopus"]').getBoundingClientRect();
            const r = canvas.getBoundingClientRect(); const sp = world.spots[0];
            return { btn: { x: b.x + b.width / 2, y: b.y + b.height / 2 }, spot: { x: r.left + sp.x / W * r.width, y: r.top + sp.y / H * r.height }, para: world.money, maliyet: world.towerCost('octopus') };
        });
        // simge parmağın 52 px üstünde durur: parmağı hedefin 52 px altına bırak
        const s = await surukle(k.btn, { x: k.spot.x, y: k.spot.y + 52 });
        ok(await page.evaluate(() => !!document.querySelector('.touch-ghost')), 'sürüklerken kule simgesi görünmeli');
        ok(await page.evaluate(() => hoverSpot === world.spots[0]), 'altındaki kule yeri vurgulanmalı');
        await s.birak(); await page.waitForTimeout(250);
        const son = await page.evaluate(() => ({ n: world.towers.length, para: world.money, ghost: !!document.querySelector('.touch-ghost'), armed: armedType }));
        ok(son.n === 1 && son.para === k.para - k.maliyet, `kule kurulmalı ve para düşmeli: ${JSON.stringify(son)}`);
        ok(!son.ghost && son.armed === null, 'sürükleme bitince simge kalkmalı ve kule seçili kalmamalı');
        // boş yere bırakınca kurulmaz
        const bos = await surukle(k.btn, { x: k.spot.x + 5, y: k.spot.y + 400 }); await bos.birak(); await page.waitForTimeout(150);
        ok((await page.evaluate(() => world.towers.length)) === 1, 'kule yeri olmayan yere bırakınca kule kurulmamalı');
        ok(hatalar.length === 0, hatalar.join(' | '));
        await ctx.close();
    });
}

test('dokunmatik: dokun-seç-dokun-kur, kuleye dokununca pencere kulenin karşı tarafında açılır', async ({ t }) => {
    const { ctx, page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(3800);
    const nokta = await page.evaluate(() => {
        const b = document.querySelector('.tower-button[data-tower="eel"]').getBoundingClientRect();
        const r = canvas.getBoundingClientRect(); const sp = world.spots[8];
        return { btn: { x: b.x + b.width / 2, y: b.y + b.height / 2 }, spot: { x: r.left + sp.x / W * r.width, y: r.top + sp.y / H * r.height } };
    });
    await page.touchscreen.tap(nokta.btn.x, nokta.btn.y); await page.waitForTimeout(150);
    ok(await page.evaluate(() => armedType === 'eel'), 'düğmeye dokununca kule seçilmeli');
    ok(await page.evaluate(() => fx.toasts.some(x => /Yılan Balığı/.test(x.text))), 'seçilince kısa tanıtım çıkmalı');
    await page.touchscreen.tap(nokta.spot.x, nokta.spot.y); await page.waitForTimeout(250);
    ok((await page.evaluate(() => world.towers.length)) === 1, 'seçili kule yerine dokununca kurulmalı');
    await page.touchscreen.tap(nokta.spot.x, nokta.spot.y); await page.waitForTimeout(250);
    const m = await page.evaluate(() => { const e = document.getElementById('towerModal'); const r = e.getBoundingClientRect(); const c = canvas.getBoundingClientRect(); const sp = world.spots[8]; return { acik: !e.classList.contains('hidden'), solda: e.classList.contains('dock-left'), mx: r.x + r.width / 2, kx: c.left + sp.x / W * c.width, vw: innerWidth }; });
    ok(m.acik, 'kuleye dokununca pencere açılmalı');
    ok((m.kx < m.vw / 2) === (m.mx > m.vw / 2), `pencere kulenin üstüne binmemeli (kule x=${Math.round(m.kx)}, pencere x=${Math.round(m.mx)})`);
    // pencerenin dışına dokununca kapanır
    await page.touchscreen.tap(m.kx, nokta.spot.y + 120); await page.waitForTimeout(200);
    ok(await page.evaluate(() => document.getElementById('towerModal').classList.contains('hidden')), 'boşa dokununca pencere kapanmalı');
    ok(hatalar.length === 0, hatalar.join(' | '));
    await ctx.close();
});

test('dokunmatik: yüksek zemine dokununca +%20 etiketi çıkar, kule seçiliyken tüm yüksek zeminlerde ipucu etiketi olur', async ({ t }) => {
    const { ctx, page } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(3800);
    const p = await page.evaluate(() => { const r = canvas.getBoundingClientRect(); const sp = world.spots[1]; return { x: r.left + sp.x / W * r.width, y: r.top + sp.y / H * r.height, yuksek: sp.kind === 'high' }; });
    ok(p.yuksek, 'Mercan 1 numaralı yer yüksek zemin olmalı');
    await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(200);
    ok(await page.evaluate(() => labelSpot === world.spots[1] && labelUntil > performance.now()), 'dokununca etiket belirmeli');
    await page.waitForTimeout(3600);
    ok(await page.evaluate(() => labelSpot === null), 'etiket birkaç saniye sonra kalkmalı');
    await ctx.close();
});

// ----------------------------------------------------------------------------------------------- oynanış
test('oynanış: dokuz harita telefon profilinde baştan sona oynanıyor, hata yok', async ({ t }) => {
    const { page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    const sonuc = await page.evaluate(async () => {
        const rapor = [];
        for (let i = 0; i < MAPS.length; i++) {
            selectMap(i);
            await new Promise(r => setTimeout(r, 300));
            world.money = 6000;
            const sira = world.spots.slice().sort((a, b) => (a.kind === 'high') - (b.kind === 'high'));
            const turler = currentMap.towers;
            sira.slice(0, 10).forEach((sp, k) => { tryBuild(turler[k % turler.length], sp); });
            world.towers.forEach(tw => { for (let u = 0; u < 3; u++) if (tw.upgradeCost() !== null) world.upgradeTower(tw, u % 2); });
            for (let dalga = 0; dalga < 3 && !world.result; dalga++) {
                startNextWave();
                for (let adim = 0; adim < 2400 && (world.enemies.length || world.queue.length) && !world.result; adim++) {
                    world.update(1 / 30);
                    updateFx(1 / 30);
                    if (adim % 40 === 0) { animTime += 1.3; draw(); }
                }
            }
            rapor.push({ id: currentMap.id, kule: world.towers.length, olum: world.stats.kills, dalga: world.wave, sonuc: world.result });
        }
        return { rapor, hatalar: window.__errs };
    });
    for (const r of sonuc.rapor) ok(r.kule >= 6 && r.olum >= 10, `harita ${r.id}: kule ${r.kule}, öldürme ${r.olum}`);
    ok(sonuc.rapor.length === 9, '9 harita oynanmalı');
    ok(!sonuc.hatalar || sonuc.hatalar.length === 0, 'oyun döngüsü hataları: ' + JSON.stringify(sonuc.hatalar));
    ok(hatalar.length === 0, hatalar.join(' | '));
    await page.context().close();
});

test('oynanış: patron saldırısı (zıplama) ve kule yeme mobil tarayıcıda hatasız çalışıyor', async ({ t }) => {
    const { page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    const r = await page.evaluate(async () => {
        selectMap(0); await new Promise(s => setTimeout(s, 300));
        world.money = 9999; tryBuild('octopus', world.spots[0]);
        const tw = world.towers[0];
        const e = new Core.Enemy(world, 'boss', 0, 99, 5, { kind: 'shark', hpMul: 200 });
        e.fury.range = 99999; e.furyTimer = 0.1; world.enemies.push(e);
        let sirasi = [], zipladi = false;
        for (let i = 0; i < 400; i++) {
            world.update(1 / 60); updateFx(1 / 60); animTime += 1 / 60; draw();
            if (sirasi[sirasi.length - 1] !== e.furyPhase) sirasi.push(e.furyPhase);
            if (bossLeap(e)) zipladi = true;
        }
        return { sirasi: sirasi.join('>'), yendi: !world.towers.includes(tw), zipladi, hatalar: window.__errs };
    });
    ok(r.sirasi.startsWith('idle>cast>idle') && r.yendi && r.zipladi, 'patron kuleyi zıplayıp yemeli: ' + JSON.stringify(r));
    ok(hatalar.length === 0 && (!r.hatalar || r.hatalar.length === 0), hatalar.join(' | '));
    await page.context().close();
});

test('oynanış: rehber sekmeleri ve sahneler mobil tarayıcıda hatasız', async ({ t }) => {
    const { page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    const r = await page.evaluate(async () => {
        const bekle = ms => new Promise(s => setTimeout(s, ms));
        openGuide('start'); await bekle(300);
        const sayfalar = [];
        for (const tab of ['towers', 'enemies', 'maps', 'rules']) {
            const ogeler = [...document.querySelectorAll('#guideList .g-nav')].length;
            Guide.go(tab); await bekle(200);
            const n = document.querySelectorAll('#guideList .g-nav').length;
            for (let i = 0; i < Math.min(n, 4); i++) { document.querySelectorAll('#guideList .g-nav')[i].click(); await bekle(250); }
            sayfalar.push(tab + ':' + n);
        }
        const fps = Guide.perf().frames;
        closeGuide();
        return { sayfalar, hatalar: window.__errs };
    });
    ok(r.sayfalar.length === 4, JSON.stringify(r));
    ok(!r.hatalar || r.hatalar.length === 0, 'rehber hataları: ' + JSON.stringify(r.hatalar));
    ok(hatalar.length === 0, hatalar.join(' | '));
    await page.context().close();
});

test('oynanış: üsse düşman geçince İpucu düğmesi göz kırpar, ipucu penceresi duraklatır ve kapanınca sürer', async ({ t }) => {
    const { page } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(500);
    await page.evaluate(() => { world.emit('leak', { enemy: new Core.Enemy(world, 'standard', 0, 5, 1, {}) }); updateUI(); });
    ok(await page.evaluate(() => hintAlert === true), 'üsse düşman geçince hintAlert açılmalı');
    await page.evaluate(() => openHint());
    ok(await page.evaluate(() => paused && hintOpen()), 'ipucu açılınca oyun duraklamalı');
    await page.evaluate(() => closeHint());
    ok(await page.evaluate(() => !paused && !hintOpen()), 'ipucu kapanınca oyun sürmeli');
    await page.context().close();
});

// ----------------------------------------------------------------------------------------------- kayıt, geri tuşu, çevrimdışı
test('kayıt: ayarlar ve yarım kalan oyun sayfa yenilenince geri geliyor', async ({ t }) => {
    const { ctx, page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    ok(await page.evaluate(() => Settings.get().quality === 'medium' && Settings.get().fps === 60), 'mobilde varsayılan kalite orta, FPS 60 olmalı');
    await page.evaluate(() => { Settings.set('sfx', 0.35); Settings.set('music', 0.2); Settings.set('quality', 'low'); });
    await page.evaluate(() => { selectMap(1); world.money = 3000; tryBuild('octopus', world.spots[0]); tryBuild('jellyfish', world.spots[3]); startNextWave(); });
    await page.waitForTimeout(1500);
    await page.evaluate(() => saveProgress());
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(800);
    const a = await page.evaluate(() => ({ sfx: Settings.get().sfx, music: Settings.get().music, kalite: Settings.get().quality, kayit: !!Settings.getSave('yosun') }));
    ok(a.sfx === 0.35 && a.music === 0.2 && a.kalite === 'low', 'ayarlar kalıcı olmalı: ' + JSON.stringify(a));
    ok(a.kayit, 'yarım kalan oyun kaydı kalıcı olmalı');
    await page.evaluate(() => { showMapSelect(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.querySelectorAll('.map-card')[1].click());
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !document.getElementById('resumeModal').classList.contains('hidden')), 'kayıtlı haritaya girilince "devam et" penceresi çıkmalı');
    await page.evaluate(() => document.getElementById('resumeContinue').click()); await page.waitForTimeout(600);
    const d = await page.evaluate(() => ({ kule: world.towers.length, dalga: world.wave, harita: currentMap.id }));
    ok(d.kule === 2 && d.harita === 'yosun' && d.dalga >= 1, 'devam edilen oyun aynı durumda olmalı: ' + JSON.stringify(d));
    ok(hatalar.length === 0, hatalar.join(' | '));
    await ctx.close();
});

test('geri tuşu: Platform.back sırasıyla pencereyi, oyunu ve harita ekranını kapatır; menüde false döner', async ({ t }) => {
    const { page } = await sayfaAc(t.browser, 'telefon', t.url);
    ok((await page.evaluate(() => Platform.back())) === false, 'menüde geri tuşu uygulamayı arka plana atmalı (false)');
    await page.evaluate(() => showMapSelect());
    ok((await page.evaluate(() => Platform.back())) === true && await page.evaluate(() => !document.getElementById('menuScreen').classList.contains('hidden')), 'harita ekranından menüye dönmeli');
    await page.evaluate(() => { showMapSelect(); selectMap(0); }); await page.waitForTimeout(400);
    await page.evaluate(() => openHint());
    ok((await page.evaluate(() => Platform.back())) === true && await page.evaluate(() => !hintOpen()), 'ipucu penceresi geri tuşuyla kapanmalı');
    await page.evaluate(() => openGuide());
    ok((await page.evaluate(() => Platform.back())) === true && await page.evaluate(() => !Guide.running()), 'rehber geri tuşuyla kapanmalı');
    await page.evaluate(() => openSettings());
    ok((await page.evaluate(() => Platform.back())) === true && await page.evaluate(() => document.getElementById('settingsScreen').classList.contains('hidden')), 'ayarlar geri tuşuyla kapanmalı');
    ok((await page.evaluate(() => Platform.back())) === true && await page.evaluate(() => !document.getElementById('mapSelectScreen').classList.contains('hidden')), 'oyundan geri tuşuyla harita ekranına dönmeli');
    await page.context().close();
});

test('oyun: uygulama arka plana gidince oyun otomatik duraklar', async ({ t }) => {
    const { page } = await sayfaAc(t.browser, 'telefon', t.url);
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(500);
    ok(await page.evaluate(() => !paused), 'oyun çalışıyor olmalı');
    await page.evaluate(() => Platform.windowFocus(false));
    ok(await page.evaluate(() => paused), 'odak gidince oyun duraklamalı');
    await page.evaluate(() => Platform.windowFocus(true));
    ok(await page.evaluate(() => paused), 'geri gelince oyun kendiliğinden başlamamalı (DEVAM ET ile sürer)');
    await page.context().close();
});

test('PWA: manifest geçerli, simgeler var, servis işçisi kuruluyor ve çevrimdışı açılıyor', async ({ t }) => {
    const { ctx, page, hatalar } = await sayfaAc(t.browser, 'telefon', t.url);
    const m = await (await fetch(t.base + 'manifest.webmanifest')).json();
    ok(m.display === 'fullscreen' && m.orientation === 'landscape' && m.name, 'manifest yatay tam ekran olmalı: ' + JSON.stringify(m).slice(0, 120));
    for (const ic of m.icons) {
        const r = await fetch(t.base + ic.src);
        ok(r.ok && (await r.arrayBuffer()).byteLength > 1000, 'simge yok: ' + ic.src);
    }
    ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512') && m.icons.some(i => i.purpose === 'maskable'), '192, 512 ve maskable simge gerekir');
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(600);
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'sayfa servis işçisi tarafından yönetilmeli');
    // yeterince ön belleğe girsin diye bir harita açıp çevrimdışı dene
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(1200);
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1000);
    const acik = await page.evaluate(() => typeof Core !== 'undefined' && typeof startNextWave === 'function' && !!document.getElementById('menuScreen'));
    ok(acik, 'çevrimdışı iken oyun açılmalı');
    await page.evaluate(() => selectMap(0)); await page.waitForTimeout(800);
    ok(await page.evaluate(() => !!world && ready(sprites.bg)), 'çevrimdışı iken harita ve resimleri yüklenmeli');
    await ctx.setOffline(false);
    ok(hatalar.filter(h => !/ERR_INTERNET_DISCONNECTED|istek başarısız|Failed to load resource/.test(h)).length === 0, hatalar.join(' | '));
    await ctx.close();
});

// ----------------------------------------------------------------------------------------------- çalıştır
(async () => {
    const filtre = process.argv[2];
    const t = await baslat();
    let gecen = 0;
    const basarisiz = [];
    for (const { ad, fn } of testler) {
        if (filtre && !ad.includes(filtre)) continue;
        const t0 = Date.now();
        try {
            await fn({ t });
            gecen++;
            console.log(`OK   ${ad} (${((Date.now() - t0) / 1000).toFixed(1)} sn)`);
        } catch (e) {
            basarisiz.push(ad);
            console.log(`FAIL ${ad}\n     ${String(e.message).split('\n')[0]}`);
        }
    }
    await t.kapat();
    console.log(basarisiz.length ? `\n${basarisiz.length} test başarısız, ${gecen} geçti` : `\nHEPSI GECTI (${gecen} test)`);
    process.exit(basarisiz.length ? 1 : 0);
})();
