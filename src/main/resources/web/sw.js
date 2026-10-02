// Servis işçisi: oyunu çevrimdışı çalıştırır.
//   - kabuk (sayfa, stil, betikler, küçük resimler) kurulumda önbelleğe alınır
//   - diğer dosyalar (harita resimleri, müzik arka planı) ilk kullanımda önbelleğe girer
//   - betik/stil/sayfa: önce ağ, olmazsa önbellek (yeni sürüm hemen gelir); resimler: önce önbellek
// SURUM değişince eski önbellek silinir.
const SURUM = 'sas-v1';
const KABUK = [
    './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'css/mobil.css',
    'js/platform.js', 'js/core.js', 'js/settings.js', 'js/maps.js', 'js/audio.js', 'js/game.js', 'js/rehber.js', 'js/ses_isci.js', 'js/ses_dsp.js',
    'assets/logo.png', 'assets/icon_192.png', 'assets/icon_512.png',
    'assets/tower_octopus.png', 'assets/tower_eel.png', 'assets/jellyfish.png', 'assets/tower_swordfish.png', 'assets/tower_angler.png', 'assets/tower_puffer.png',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(SURUM).then(c => c.addAll(KABUK)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== SURUM).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    const kod = /\.(html|js|css|webmanifest)$/.test(new URL(req.url).pathname) || req.mode === 'navigate';
    e.respondWith(kod ? agOnce(req) : onbellekOnce(req));
});

function agOnce(req) {
    return fetch(req).then(res => {
        const kopya = res.clone();
        caches.open(SURUM).then(c => c.put(req, kopya));
        return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')));
}

function onbellekOnce(req) {
    return caches.match(req).then(r => r || fetch(req).then(res => {
        if (res.ok) { const kopya = res.clone(); caches.open(SURUM).then(c => c.put(req, kopya)); }
        return res;
    }));
}
