// Ortak test yardımcıları: yerel sunucu, tarayıcı profilleri, hata toplama.
const path = require('path');
const { chromium } = require('playwright');
const { createServer } = require('../serve.js');

const WEB = path.join(__dirname, '..', '..', 'src', 'main', 'resources', 'web');

// Cihaz profilleri (CSS piksel). Telefonlar yatay ekranda test edilir.
const PROFILLER = {
    masaustu: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
    telefon: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2.6, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36' },
    kucukTelefon: { viewport: { width: 640, height: 360 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' },
    genisTelefon: { viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
    tablet: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
};

async function baslat() {
    const server = createServer(WEB);
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;
    const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--disable-dev-shm-usage'] });
    return { server, browser, url: `http://127.0.0.1:${port}/index.html`, base: `http://127.0.0.1:${port}/`, kapat: async () => { await browser.close(); server.close(); } };
}

// Sayfayı açar; konsol hatalarını ve yakalanmamış istisnaları biriktirir
async function sayfaAc(browser, profil, url) {
    const ctx = await browser.newContext(PROFILLER[profil]);
    const page = await ctx.newPage();
    const hatalar = [];
    page.on('pageerror', e => hatalar.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') hatalar.push('console: ' + m.text()); });
    page.on('requestfailed', r => { if (!/favicon/.test(r.url())) hatalar.push('istek başarısız: ' + r.url()); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    return { ctx, page, hatalar };
}

module.exports = { WEB, PROFILLER, baslat, sayfaAc };
