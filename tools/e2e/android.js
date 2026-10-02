// Android uygulaması testi: gerçek APK'yı bir emülatörde ya da cihazda (adb) çalıştırır, içindeki WebView'a Chrome DevTools
// protokolüyle bağlanıp oyunu GERÇEK dokunuşlarla (adb input) sürer.
//
//   node tools/e2e/android.js [apk-yolu]
//
// Gereken: çalışan bir emülatör/cihaz (adb devices), debug APK (cd android && ./gradlew assembleDebug). Debug sürümünde
// WebView uzaktan hata ayıklamaya açıktır; test buradan bağlanır. Dokunmalar `adb shell input` ile verilir, yani web
// testlerinden farklı olarak Android'in kendi dokunma hattından, geri tuşundan ve yaşam döngüsünden geçer.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const PAKET = 'com.kule.savunma.mobil';
const CIKTI = path.join(__dirname, 'ciktilar');
fs.mkdirSync(CIKTI, { recursive: true });

function adbYolu() {
    const kokler = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')].filter(Boolean);
    for (const k of kokler) {
        const p = path.join(k, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
        if (fs.existsSync(p)) return p;
    }
    return 'adb';
}
const ADB = adbYolu();
const adb = (...a) => execFileSync(ADB, a, { maxBuffer: 1 << 27, encoding: 'utf8' });
const adbBin = (...a) => execFileSync(ADB, a, { maxBuffer: 1 << 27 });
const bekle = ms => new Promise(r => setTimeout(r, ms));
const ok = (k, m) => { if (!k) throw new Error(m); };

function goruntu(ad) { fs.writeFileSync(path.join(CIKTI, 'android_' + ad + '.png'), adbBin('exec-out', 'screencap', '-p')); }
function pid() { try { return adb('shell', 'pidof', PAKET).trim().split(/\s+/)[0]; } catch (e) { return ''; } }
function onPlandaMi() { return adb('shell', 'dumpsys', 'activity', 'activities').split('\n').some(s => /topResumedActivity/.test(s) && s.includes(PAKET)); }

async function baglan() {
    for (let i = 0; i < 120 && !pid(); i++) await bekle(500);
    ok(pid(), 'uygulama başlamadı');
    let browser;
    let sonHata = '';
    // soğuk açılışta (özellikle CI emülatöründe) WebView ve sayfa geç hazır olabilir: 2 dakikaya kadar dener
    for (let i = 0; i < 80; i++) {
        try {
            adb('forward', '--remove-all');
            adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid());
            browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 5000 });
            if (browser.contexts()[0] && browser.contexts()[0].pages().length) break;
            await browser.close();
            browser = null;
        } catch (e) { sonHata = String(e.message).split(String.fromCharCode(10))[0]; browser = null; }
        await bekle(1500);
    }
    if (!browser) {
        // tanı bilgisi: neden bağlanılamadı
        try {
            const satirlar = adb('logcat', '-d', '-t', '300').split(String.fromCharCode(10)).filter(l => /chromium|AndroidRuntime|FATAL|kule\.savunma|WebView|died/i.test(l)).slice(-25);
            console.log('--- logcat (son satırlar) ---');
            satirlar.forEach(l => console.log(l));
        } catch (e) { /* yoksay */ }
        try { goruntu('baglanti_hatasi'); } catch (e) { /* yoksay */ }
    }
    ok(browser, 'WebView hata ayıklama bağlantısı kurulamadı: ' + sonHata);
    const page = browser.contexts()[0].pages().find(p => /appassets\.androidplatform\.net/.test(p.url())) || browser.contexts()[0].pages()[0];
    const hatalar = [];
    page.on('pageerror', e => hatalar.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') hatalar.push('console: ' + m.text()); });
    return { browser, page, hatalar };
}

async function uygulamayiBaslat() {
    adb('shell', 'settings', 'put', 'secure', 'immersive_mode_confirmations', 'confirmed');      // "tam ekran" sistem ipucu penceresi çıkmasın
    adb('shell', 'am', 'force-stop', PAKET);
    for (let i = 0; i < 20 && pid(); i++) await bekle(250);          // eski işlem tamamen bitsin
    adb('shell', 'am', 'start', '-n', PAKET + '/.MainActivity');
    await bekle(4000);                                                  // WebView işlemi ve sayfa açılsın
}

(async () => {
    const apk = process.argv[2];
    const cihazlar = adb('devices').split('\n').slice(1).filter(s => /\tdevice$/.test(s.trim()) || /\sdevice$/.test(s.trim()));
    ok(cihazlar.length >= 1, 'bağlı emülatör/cihaz yok (adb devices)');
    if (apk) { console.log('APK kuruluyor...'); adb('install', '-r', apk); }

    adb('shell', 'pm', 'clear', PAKET);                                  // temiz başlangıç: eski kayıt ve ayarlar yok
    await uygulamayiBaslat();
    let { browser, page, hatalar } = await baglan();
    const dpr = () => page.evaluate(() => devicePixelRatio);
    const nokta = async sel => page.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: (r.x + r.width / 2) * devicePixelRatio, y: (r.y + r.height / 2) * devicePixelRatio }; }, sel);
    const dokun = (x, y) => adb('shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y)));
    const sureklen = (a, b, ms = 700) => adb('shell', 'input', 'swipe', String(Math.round(a.x)), String(Math.round(a.y)), String(Math.round(b.x)), String(Math.round(b.y)), String(ms));

    const testler = [];
    const test = (ad, fn) => testler.push({ ad, fn });

    test('açılış: Android kabuğu, yatay tam ekran, ses motoru hazır', async () => {
        const b = await page.evaluate(() => ({ ua: navigator.userAgent, w: innerWidth, h: innerHeight, cls: document.documentElement.className, sw: screen.width, sh: screen.height, plat: { m: Platform.mobile, a: Platform.androidApp, j: Platform.java } }));
        ok(/SASApp/.test(b.ua) && b.plat.a && b.plat.m && !b.plat.j, 'Android uygulaması olarak tanınmalı: ' + JSON.stringify(b.plat));
        ok(b.w > b.h, `ekran yatay olmalı (${b.w}x${b.h})`);
        ok(/compact/.test(b.cls) && /can-exit/.test(b.cls) && /is-android-app/.test(b.cls), 'sınıflar: ' + b.cls);
        ok(Math.abs(b.h * (await dpr()) - Math.min(b.sw, b.sh) * (await dpr())) < 60 || b.h >= Math.min(b.sw, b.sh) * 0.95, `sistem çubukları gizli, ekran tam kullanılmalı (${b.h} / ${Math.min(b.sw, b.sh)})`);
        await page.waitForFunction(() => GameAudio.status().musicDone, null, { timeout: 90000 });
        const s = await page.evaluate(() => GameAudio.status());
        ok(s.sfx === 34 && s.layers === 9 && s.state === 'running' && !s.error, 'ses motoru: ' + JSON.stringify(s));
        goruntu('1menu');
    });

    test('dokunma: menü -> harita seç -> oyun (gerçek dokunuş)', async () => {
        let p = await nokta('.menu-buttons .menu-button'); dokun(p.x, p.y);
        await bekle(900);
        ok(await page.evaluate(() => !document.getElementById('mapSelectScreen').classList.contains('hidden')), 'harita ekranı açılmalı');
        goruntu('2harita');
        p = await nokta('.map-card'); dokun(p.x, p.y);
        await bekle(1500);
        ok(await page.evaluate(() => !!world && !!currentMap), 'oyun başlamalı');
        await bekle(3600);
        goruntu('3oyun');
    });

    test('dokunma: kule düğmesinden spota sürükleyerek kule kurma, kuleye dokununca pencere', async () => {
        const k = await page.evaluate(() => {
            const b = document.querySelector('.tower-button[data-tower="octopus"]').getBoundingClientRect();
            const r = canvas.getBoundingClientRect(); const sp = world.spots[0]; const d = devicePixelRatio;
            return { btn: { x: (b.x + b.width / 2) * d, y: (b.y + b.height / 2) * d }, spot: { x: (r.left + sp.x / W * r.width) * d, y: (r.top + sp.y / H * r.height) * d }, d };
        });
        sureklen(k.btn, { x: k.spot.x, y: k.spot.y + 52 * k.d }, 900);
        await bekle(500);
        ok(await page.evaluate(() => world.towers.length === 1 && world.towers[0].spot === world.spots[0]), 'sürükleyip bırakınca kule kurulmalı');
        dokun(k.spot.x, k.spot.y); await bekle(500);
        ok(await page.evaluate(() => !document.getElementById('towerModal').classList.contains('hidden')), 'kuleye dokununca pencere açılmalı');
        goruntu('4kulemodal');
        const m = await nokta('#towerModal .close-btn'); dokun(m.x, m.y); await bekle(300);
        ok(await page.evaluate(() => document.getElementById('towerModal').classList.contains('hidden')), 'KAPAT ile pencere kapanmalı');
    });

    test('dalga: dalga başlat, savaş müziği, ipucu ve rehber açılıp kapanıyor', async () => {
        let p = await nokta('#waveButton'); dokun(p.x, p.y); await bekle(2200);
        ok(await page.evaluate(() => world.wave === 1 && world.enemies.length > 0), 'dalga başlamalı');
        ok((await page.evaluate(() => GameAudio.status().musicState)) === 'battle', 'savaş müziği');
        p = await nokta('#hintBtnC'); dokun(p.x, p.y); await bekle(500);
        ok(await page.evaluate(() => hintOpen() && paused), 'İpucu açılınca oyun duraklamalı');
        goruntu('5ipucu');
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await bekle(500);
        ok(await page.evaluate(() => !hintOpen() && !paused), 'geri tuşu ipucuyu kapatıp oyunu sürdürmeli');
        p = await nokta('#guideBtn'); dokun(p.x, p.y); await bekle(1200);
        ok(await page.evaluate(() => Guide.running()), 'Rehber açılmalı');
        const fps = await page.evaluate(() => Guide.perf().fps);
        console.log('     rehber FPS (emülatör):', fps);
        goruntu('6rehber');
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await bekle(500);
        ok(await page.evaluate(() => !Guide.running()), 'geri tuşu rehberi kapatmalı');
    });

    test('geri tuşu: oyundan haritalara, haritalardan menüye, menüde uygulama arka plana gider', async () => {
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await bekle(600);
        ok(await page.evaluate(() => !document.getElementById('mapSelectScreen').classList.contains('hidden')), 'oyundan harita ekranına dönmeli');
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await bekle(600);
        ok(await page.evaluate(() => !document.getElementById('menuScreen').classList.contains('hidden')), 'haritadan menüye dönmeli');
        ok(onPlandaMi(), 'menüye dönünce hâlâ ön planda olmalı');
        adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); await bekle(1200);
        ok(!onPlandaMi(), 'menüde geri tuşu uygulamayı arka plana atmalı');
        adb('shell', 'am', 'start', '-n', PAKET + '/.MainActivity'); await bekle(1500);
        ok(onPlandaMi(), 'uygulama geri gelebilmeli');
    });

    test('yaşam döngüsü: ana ekrana çıkınca ses kesilir ve oyun duraklar, dönünce ses açılır', async () => {
        await page.evaluate(() => { showMapSelect(); selectMap(0); });
        await bekle(800);
        ok(await page.evaluate(() => !paused), 'oyun çalışıyor olmalı');
        adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await bekle(1800);
        const arka = await page.evaluate(() => ({ paused, a: GameAudio.status().active, st: GameAudio.status().state })).catch(() => null);
        if (arka) ok(arka.paused && !arka.a, 'arka planda oyun duraklamalı ve ses kapanmalı: ' + JSON.stringify(arka));
        adb('shell', 'am', 'start', '-n', PAKET + '/.MainActivity'); await bekle(1800);
        const on = await page.evaluate(() => ({ paused, a: GameAudio.status().active, st: GameAudio.status().state }));
        ok(on.a && on.st === 'running', 'öne gelince ses açılmalı: ' + JSON.stringify(on));
        ok(on.paused, 'oyun DEVAM ET ile sürmeli (kendiliğinden başlamamalı)');
    });

    test('kalıcılık: ayarlar ve kayıtlı oyun uygulama kapanıp açılınca duruyor', async () => {
        await page.evaluate(() => { Settings.set('sfx', 0.45); Settings.set('quality', 'low'); world.money = 3000; tryBuild('octopus', world.spots[0]); saveProgress(); });
        // gerçek kullanıcı gibi: önce ana ekrana çıkar (WebView depoyu yazar), sonra uygulamayı kapatır
        adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); await bekle(2500);
        await browser.close();
        await uygulamayiBaslat();
        ({ browser, page, hatalar } = await baglan());
        await page.waitForFunction(() => typeof Settings !== 'undefined', null, { timeout: 30000 });
        await bekle(1200);
        const a = await page.evaluate(() => ({ sfx: Settings.get().sfx, q: Settings.get().quality, kayit: !!Settings.getSave('mercan') }));
        ok(a.sfx === 0.45 && a.q === 'low' && a.kayit, 'ayarlar ve kayıt kalıcı olmalı: ' + JSON.stringify(a));
    });

    test('kararlılık: dokuz harita tek tek açılıp oynanıyor, WebView hatasız', async () => {
        const r = await page.evaluate(async () => {
            const rapor = [];
            for (let i = 0; i < MAPS.length; i++) {
                selectMap(i); await new Promise(s => setTimeout(s, 400));
                world.money = 5000;
                world.spots.slice(0, 8).forEach((sp, k) => tryBuild(currentMap.towers[k % currentMap.towers.length], sp));
                startNextWave();
                for (let a = 0; a < 700 && !world.result; a++) { world.update(1 / 30); updateFx(1 / 30); if (a % 70 === 0) { animTime += 1.1; draw(); } }
                rapor.push(currentMap.id + ':' + world.towers.length + ':' + world.stats.kills);
            }
            return { rapor, hatalar: window.__errs };
        });
        ok(r.rapor.length === 9, 'dokuz harita: ' + r.rapor.join(' '));
        ok(!r.hatalar || r.hatalar.length === 0, 'oyun hataları: ' + JSON.stringify(r.hatalar));
        goruntu('7son');
    });

    let basarisiz = 0;
    for (const { ad, fn } of testler) {
        const t0 = Date.now();
        try { await fn(); console.log(`OK   ${ad} (${((Date.now() - t0) / 1000).toFixed(1)} sn)`); } catch (e) { basarisiz++; console.log(`FAIL ${ad}\n     ${String(e.message).split('\n')[0]}`); try { goruntu('hata_' + basarisiz); } catch (x) { /* yoksay */ } }
    }
    const kritik = hatalar.filter(h => !/favicon/.test(h));
    if (kritik.length) { basarisiz++; console.log('FAIL sayfa hataları:', kritik.join(' | ')); }
    try { await browser.close(); } catch (e) { /* yoksay */ }
    console.log(basarisiz ? `\n${basarisiz} test başarısız` : `\nHEPSI GECTI (${testler.length} test)`);
    process.exit(basarisiz ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
