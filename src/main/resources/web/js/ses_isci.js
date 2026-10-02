// Ses üretim işçisi (Web Worker): efektleri ve müziği ana iş parçacığını kasmadan üretir.
// Sonuçlar Float32Array olarak (kopyalamadan) geri gönderilir. Asıl hesap js/ses_dsp.js içindedir.
'use strict';
importScripts('ses_dsp.js');

self.onmessage = function (e) {
    const m = e.data;
    if (m.cmd === 'sfx') {
        for (const name of m.names) {
            const b = self.SesDSP.buildSfx(name);
            self.postMessage({ type: 'sfx', name, data: b }, [b.buffer]);
        }
        self.postMessage({ type: 'sfxDone' });
    } else if (m.cmd === 'music') {
        self.SesDSP.buildMusic((layer, a) => self.postMessage({ type: 'layer', layer, data: a }, [a.buffer]));
        self.postMessage({ type: 'musicDone' });
    }
};
