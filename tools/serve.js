// Web sürümünü yerelde sunan küçük statik sunucu (bağımlılık yok).
//   node tools/serve.js [port] [klasör]      varsayılan: 8080, src/main/resources/web
// Testler (tools/e2e) ve telefonda denemek için kullanılır: telefondan http://<bilgisayar-ip>:8080 açılır.
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function createServer(root) {
    return http.createServer((req, res) => {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const file = path.normalize(path.join(root, p));
        if (!file.startsWith(path.normalize(root))) { res.writeHead(403); res.end(); return; }
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('bulunamadı: ' + p); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
            res.end(data);
        });
    });
}

module.exports = { createServer };

if (require.main === module) {
    const port = +process.argv[2] || 8080;
    const root = path.resolve(process.argv[3] || path.join(__dirname, '..', 'src', 'main', 'resources', 'web'));
    createServer(root).listen(port, '0.0.0.0', () => console.log(`http://localhost:${port}  (${root})`));
}
