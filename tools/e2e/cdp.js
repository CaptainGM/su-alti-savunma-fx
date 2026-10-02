// Minimal Chrome DevTools protokolü istemcisi (yalnızca WebSocket): Android WebView'ına her sürümde bağlanır.
// Playwright'ın connectOverCDP'si eski WebView'larda (ör. CI emülatörü) desteklenmeyen Browser.* komutlarını çağırdığı için
// Android testi bunu kullanır. Yalnızca testin ihtiyaç duyduğu küçük bir yüzey sağlar: evaluate, waitForFunction, on, close.
const WebSocket = require('ws');

async function baglan(port = 9222) {
    const liste = await (await fetch(`http://localhost:${port}/json/list`)).json();
    const hedef = liste.find(t => t.type === 'page' && /appassets\.androidplatform\.net/.test(t.url)) || liste.find(t => t.type === 'page');
    if (!hedef) throw new Error('sayfa hedefi yok');
    const ws = new WebSocket(hedef.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 1 << 28 });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    let id = 0;
    const bekleyen = new Map();
    const dinleyiciler = { pageerror: [], console: [] };
    ws.on('message', veri => {
        const m = JSON.parse(veri.toString());
        if (m.id && bekleyen.has(m.id)) {
            const { res, rej } = bekleyen.get(m.id);
            bekleyen.delete(m.id);
            if (m.error) rej(new Error(m.error.message)); else res(m.result);
        } else if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            dinleyiciler.pageerror.forEach(f => f({ message: (d.exception && d.exception.description) || d.text }));
        } else if (m.method === 'Runtime.consoleAPICalled') {
            const metin = (m.params.args || []).map(a => a.value !== undefined ? a.value : a.description).join(' ');
            dinleyiciler.console.forEach(f => f({ type: () => m.params.type, text: () => metin }));
        }
    });
    const gonder = (method, params = {}) => new Promise((res, rej) => { const i = ++id; bekleyen.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
    await gonder('Runtime.enable');

    const page = {
        on(olay, f) { if (dinleyiciler[olay]) dinleyiciler[olay].push(f); },
        async evaluate(fn, arg) {
            const ifade = typeof fn === 'function' ? `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})` : String(fn);
            const r = await gonder('Runtime.evaluate', { expression: ifade, awaitPromise: true, returnByValue: true, userGesture: true });
            if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
            return r.result.value;
        },
        async waitForFunction(fn, arg, { timeout = 30000 } = {}) {
            const bit = Date.now() + timeout;
            while (Date.now() < bit) {
                try { if (await page.evaluate(fn, arg || undefined)) return true; } catch (e) { /* sayfa henüz hazır değil */ }
                await new Promise(r => setTimeout(r, 300));
            }
            throw new Error('zaman aşımı: ' + fn.toString().slice(0, 80));
        },
        url: () => hedef.url,
    };
    return { page, browser: { close: async () => { try { ws.close(); } catch (e) { /* yoksay */ } } } };
}

module.exports = { baglan };
