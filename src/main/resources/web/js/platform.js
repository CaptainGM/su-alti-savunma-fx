// Çalışma ortamı katmanı: aynı oyun üç yerde çalışır.
//   - masaüstü: Java uygulamasının içindeki JavaFX WebView (ses, kayıt dosyası ve pencere Java'dan gelir)
//   - tarayıcı / PWA: ses Web Audio ile (js/audio.js), kayıt localStorage'a
//   - Android uygulaması: aynı web sayfası, yatay ekran, WebView içinde (kullanıcı ajanında "SASApp" yazar)
// Oyun kodu ortamı bilmez; `window.javaBridge` hep vardır. Java ortamında Java kendi köprüsünü sayfa yüklenince kurar,
// diğer ortamlarda bu dosya aynı yüzeye sahip bir köprü kurar. Böylece game.js ve settings.js tek bir yolla çalışır.
'use strict';

const Platform = (function () {
    const params = new URLSearchParams(location.search);
    const ua = navigator.userAgent || '';
    const java = /JavaFX/i.test(ua);
    const androidApp = /SASApp/i.test(ua);
    const android = /Android/i.test(ua);
    const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    let mobile = !java && (coarse || android || ios);
    if (params.get('mobil') === '1') mobile = true;
    if (params.get('mobil') === '0') mobile = false;
    const touch = mobile || coarse || params.get('dokunmatik') === '1';
    const standalone = !!((window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) || navigator.standalone);

    // küçük ekran düzeni (telefon yatay, küçük pencere): yan panel yerine oyun alanının üstüne binen arayüz
    const compactQuery = () => window.innerWidth < 1100 || window.innerHeight < 640;

    function applyClasses() {
        const c = document.documentElement.classList;
        c.toggle('compact', compactQuery());
        c.toggle('is-touch', touch);
        c.toggle('is-mobile', mobile);
        c.toggle('is-java', java);
        c.toggle('is-android-app', androidApp);
        c.toggle('can-exit', java || androidApp);
        c.toggle('is-standalone', standalone);
    }

    // Android'in geri tuşu: açık bir pencere/panel varsa onu kapatır (Esc ile aynı), yoksa oyun ekranından haritalara döner.
    // true dönerse geri tuşu kullanıldı demektir; false ise uygulama arka plana atılabilir.
    function back() {
        const visible = id => { const e = document.getElementById(id); return !!e && !e.classList.contains('hidden'); };
        if (visible('guideScreen') || visible('settingsScreen') || visible('hintModal') || visible('towerModal') || visible('resumeModal')) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return true;
        }
        if (visible('gameScreen')) { if (typeof quitToMapSelect === 'function') quitToMapSelect(); return true; }
        if (visible('mapSelectScreen')) { if (typeof backToMenuFromMapSelect === 'function') backToMenuFromMapSelect(); return true; }
        if (visible('winScreen') || visible('loseScreen')) { if (typeof toMapSelect === 'function') toMapSelect(); return true; }
        return false;
    }

    // Oyun sürerken uygulama/sekme arka plana giderse oyun duraklar (geri gelince DEVAM ET ile sürer)
    function autoPause() {
        try {
            const gs = document.getElementById('gameScreen');
            if (typeof world !== 'undefined' && world && !world.result && typeof paused !== 'undefined' && !paused &&
                gs && !gs.classList.contains('hidden') && typeof togglePause === 'function') togglePause();
        } catch (e) { /* yoksay */ }
    }

    // Android kabuğu ve tarayıcı: pencere odağı değişince ses açılıp kapanır, kaybolunca oyun duraklar
    function windowFocus(on) {
        if (java) return;
        if (typeof GameAudio !== 'undefined') GameAudio.setActive(!!on && !document.hidden);
        if (!on) autoPause();
    }

    function setFullscreen(on) {
        try {
            const el = document.documentElement;
            if (on && !document.fullscreenElement && el.requestFullscreen) {
                const p = el.requestFullscreen();
                if (p && p.catch) p.catch(() => { /* kullanıcı etkileşimi gerekir */ });
                if (screen.orientation && screen.orientation.lock && mobile) screen.orientation.lock('landscape').catch(() => { /* desteklenmiyor */ });
            } else if (!on && document.fullscreenElement && document.exitFullscreen) {
                document.exitFullscreen();
            }
        } catch (e) { /* yoksay */ }
    }

    // Java dışındaki ortamlar için köprü
    function installBridge() {
        if (java || window.javaBridge) return;
        const noop = () => { };
        window.javaBridge = {
            startLog: noop, appendLog: noop, endLog: noop, playTone: noop, setLoop: noop, setWindowSize: noop,
            exitApp() { try { if (window.SASApp && window.SASApp.exit) window.SASApp.exit(); else window.close(); } catch (e) { /* yoksay */ } },
            playSfx(name, volume) { if (typeof GameAudio !== 'undefined') GameAudio.playSfx(name, volume); },
            setMusic(state, intensity) { if (typeof GameAudio !== 'undefined') GameAudio.setMusic(state, intensity); },
            setMusicVolume(v) { if (typeof GameAudio !== 'undefined') GameAudio.setMusicVolume(v); },
            setFullscreen,
            saveData(json) { try { window.localStorage.setItem('sas.data', json); } catch (e) { /* özel gezinti ya da dolu depo */ } },
        };
    }

    function loadStored() {
        if (java) return;
        let raw = null;
        try { raw = window.localStorage.getItem('sas.data'); } catch (e) { /* yoksay */ }
        if (raw && typeof window.loadSavedData === 'function') window.loadSavedData(raw);
    }

    installBridge();
    document.addEventListener('DOMContentLoaded', () => {
        applyClasses();
        loadStored();
        if (typeof GameAudio !== 'undefined') GameAudio.init();
        if (!java && typeof window.menuMusic === 'function') window.menuMusic();      // menü müziği (Java ortamında Java başlatır)
    });
    window.addEventListener('resize', applyClasses);
    document.addEventListener('visibilitychange', () => { if (!java && document.hidden) autoPause(); });
    window.addEventListener('orientationchange', () => setTimeout(applyClasses, 200));

    // sayfa kaydırma, çift dokunma yakınlaştırması ve bağlam menüsü oyunda istenmez
    if (touch) {
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('gesturestart', e => e.preventDefault());       // çift dokunuş ve çimdik yakınlaşması (viewport + touch-action de engeller)
    }

    return {
        java, mobile, touch, android, ios, androidApp, standalone, coarse,
        compact: compactQuery, back, applyClasses, setFullscreen, windowFocus, autoPause,
        defaults: mobile ? { quality: 'medium', fps: 60 } : {},
        maxCanvasPx: mobile ? 1700 : 2700,
    };
})();
