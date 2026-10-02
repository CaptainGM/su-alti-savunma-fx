// Rehber: kuleler, düşmanlar, haritalar ve kurallar için canlı gösterimli yardım ekranı.
//
// Gösterimler ayrı bir "sahne"dir: küçük bir Core.World (gerçek kurallar, gerçek yetenekler) kurulur ve oyunun
// kendi çizim fonksiyonlarıyla (drawEntities, drawMechanics, drawFx...) ayrı bir tuvale çizilir. Bunun için çizim
// sırasında game.js'in global değişkenleri (world, fx, ctx, canvas, W, H, res, currentMap, sprites) geçici olarak
// sahneye ait olanlarla değiştirilir (withDemo); `inDemo` iken günlük, kayıt ve liste güncellemeleri kapalıdır.
'use strict';

const Guide = (function () {
    const DW = 640;
    const DH = 400;
    const RES = 1.5;

    // ------------------------------------------------------------------ gösterim haritası
    // Düz bir "V" biçimli kısa yol ve altı kule yeri. Gerçek haritalardan bağımsızdır.
    const DEMO_MAP = {
        id: 'demo', name: 'Gösterim', desc: '', stars: 1, hpScale: 1, speedScale: 1, startMoney: 1e7, waves: 10, countScale: 1,
        boss: 'shark', towers: ['octopus', 'eel', 'jellyfish', 'swordfish', 'angler', 'puffer'], bossScale: 1, miniHp: 0.5,
        enemyPool: ['standard', 'armored', 'flying', 'swarm', 'boss', 'shield', 'healer', 'stealth', 'shocker'],
        flipSprites: false, bg: null, tint: '#0a3c58', ambient: null, mechanics: [],
        paths: [[{ x: -40, y: 310 }, { x: 120, y: 310 }, { x: 230, y: 175 }, { x: 420, y: 175 }, { x: 520, y: 310 }, { x: 690, y: 310 }]],
        buildSpots: [{ x: 330, y: 262 }, { x: 330, y: 80, kind: 'high' }, { x: 150, y: 235 }, { x: 520, y: 245 }, { x: 330, y: 352, kind: 'high' }, { x: 80, y: 120 }],
    };
    const SPOT = { main: 0, high: 1, left: 2, right: 3, low: 4, corner: 5 };

    // ------------------------------------------------------------------ içerik
    const TOWER_INFO = {
        octopus: {
            lead: 'Ucuz ve hızlı. Havadaki düşmanı da vurabilen ilk savunma hattın.',
            good: ['Uçan Vatozlar', 'Sürü ve sıradan köpek balıkları', 'Erken dalgalar, ucuz ve hızlı yerleşim'],
            bad: ['Zırhlı Istakoz: hasarı yarıya iner, zırh da hasarı düşürür', 'Gizlenen kalamar: ışık ya da alan hasarı olmadan göremez'],
            tips: ['Tek türe yaslanma: 4. dalgadan sonra düşmanlar hasarın yarısından fazlasını yapan türe alışır', 'Delici Mürekkep, Ahtapot\'un zırhlıya karşı cezasını tamamen kaldırır'],
        },
        eel: {
            lead: 'Hedefin çevresindeki bütün yer düşmanlarına anında şok verir ve zırhın yarısını deler.',
            good: ['Kalabalıklar ve sürüler', 'Zırhlı Istakoz', 'Hayalet Kalamar: alan hasarı onu açığa çıkarır'],
            bad: ['Uçan düşmanları vuramaz', 'Yavaş atar (2,6 sn), tek hedefte sönük kalır'],
            tips: ['Yolun virajlarına koy: düşmanlar alanın içinde birikir', 'Aşırı Yük her 4. şokta sersemletir: sürekli sersemletme için sık atış gerekir'],
        },
        jellyfish: {
            lead: 'Hasarı düşük ama vurduğunu yavaşlatır. Yavaşlayan düşman her kuleden %20 fazla hasar alır.',
            good: ['Her türlü kule ile birlikte (hasar bonusu)', 'Hızlı sürüler, patronlar (etkisi yarıya iner ama yine işe yarar)', 'Elektrikli Müren: yaklaşmadan yavaşlat'],
            bad: ['Kendi hasarı çok düşük', 'Kalkanlı Kaplumbağa kalkanı varken yavaşlatmayı büyük ölçüde yutar'],
            tips: ['Yavaşlatıcıyı hasar kulelerinin menzilinde tut', 'Zehirli Dokunuş, kalkanı delip zırhlılara da hasar verir'],
        },
        swordfish: {
            lead: 'Çok uzun menzilli keskin nişancı. Hedefe dönerek nişan alır, patronlara %50 fazla vurur.',
            good: ['Patronlar ve ara patronlar', 'Elektrikli Müren ve şifacı: uzaktan öldürür', 'Zırhlılar (zırhın bir kısmını deler)'],
            bad: ['Pahalı (100) ve yavaş atar', 'Sürülere karşı verimsiz, tek hedef vurur'],
            tips: ['Yüksek zemine koy: 380 olan menzil 456\'ya çıkar', 'Tek başına patronu yolun başında eritemez: patron her %30 can kaybında kalkan kazanıp öfkelenir'],
        },
        angler: {
            lead: 'Dengeli ve ucuz bir kule. Karanlık haritada çevresini aydınlatır, ışığındaki kuleler menzil kaybetmez.',
            good: ['Derin Çukur gibi karanlık haritalar', 'Gizlenen kalamarları ışığıyla ortaya çıkarır', 'Yetenekleriyle hem destek hem hasar kulesi olabilir'],
            bad: ['Karanlık olmayan haritalarda ışığının bir faydası yok', 'Tek başına özel bir güçlü yönü yok'],
            tips: ['Işığı birleşir: iki fener birbirini tamamlar', 'Aydınlık Çevre, ışığındaki diğer kulelere hasar bonusu verir'],
        },
        puffer: {
            lead: 'Sırtındaki havan düşmanın gideceği yere atar ve çevresine alan hasarı verir. Namlu düşmana döner.',
            good: ['Yavaş ve kalabalık yer düşmanları', 'Kalkanlı Kaplumbağa (gaz kalkanı deler)', 'Hayalet Kalamar: alan hasarı onu açığa çıkarır'],
            bad: ['Uçan düşmanları vuramaz', 'Mermi uçarken hızlı düşmanı ıskalayabilir'],
            tips: ['Uzak menzilli: yola uzak, yüksek bir yerde de işe yarar', 'Zehirli Gaz zırhı saymaz: zırhlılara karşı çok etkili'],
        },
    };

    const ENEMY_INFO = {
        standard: { lead: 'En sıradan düşman. Hızı ve canı ortalama, her dalgada çıkar.', points: ['Her kule türü onu vurabilir', 'Dalga ilerledikçe canı ve hızı artar'], counter: ['Ahtapot ve Fener Balığı ucuz bir çözümdür'], scene: { towers: [['octopus', 1, 0]], feed: [['standard', 3]] } },
        armored: { lead: 'Ağır zırhlı Istakoz. Yavaş ama çok dayanıklı.', points: ['Zırh 100: normal hasarın yarısını yer', 'Ahtapot ona ayrıca yarı hasar verir'], counter: ['Yılan Balığı, Kılıç Balığı ve Fener Balığı zırhı deler', 'Zehir ve gaz zırh saymaz'], scene: { towers: [['octopus', 2, 0, 0, 2], ['eel', 2, 0, 0, 3]], feed: [['armored', 2]] } },
        flying: { lead: 'Uçan Vatoz: hızlı, havadan gelir.', points: ['Yılan ve Balon Balığı onu vuramaz', 'Yola göre değil kuş uçuşu geldiği için engellerden etkilenmez'], counter: ['Ahtapot, Fener Balığı, Deniz Anası ve Kılıç Balığı vurabilir'], scene: { towers: [['octopus', 2, 0, 0, 2], ['eel', 2, 0, 0, 3]], feed: [['flying', 2]] } },
        swarm: { lead: 'Yavru köpek balıkları: çok sayıda, çok hızlı, canı az.', points: ['Her ikinci dalgada küme halinde gelir', 'Hızlı olduğu için tek hedefli kuleler yetişemez'], counter: ['Yılan Balığı ve Balon Balığı alan hasarıyla eritir', 'Deniz Anası yavaşlatarak yardım eder'], scene: { towers: [['puffer', 2, 0, 0, 2], ['octopus', 1, 0, 0, 3]], feed: [['swarm', 9]] } },
        shield: { lead: 'Kalkanlı Kaplumbağa: canının %70\'i kadar kalkanla gelir.', points: ['3. dalgadan sonra çıkar, çiftler halinde yürür', 'Hasar önce kalkana gider, sonra cana', 'Kalkan varken yavaşlatma çok zayıf kalır'], counter: ['Zehir ve gaz kalkanı deler (Zehirli Dokunuş, Zehirli Gaz)', 'Kılıç Balığı gibi yüksek vuruşlar kalkanı çabuk kırar'], scene: { towers: [['octopus', 2, 0, 0, 2], ['jellyfish', 3, 1, 0, 3]], feed: [['shield', 2]] } },
        healer: { lead: 'Şifacı Denizatı: yakınındaki düşmanları iyileştirir.', points: ['5. dalgadan sonra bir konvoyun ortasında yürür', 'Her 2,5 sn\'de yakındakilerin canını %6 yeniler (patronlarda %1,5)'], counter: ['Önce onu vur: kulenin hedef modunu "Öncelikli" yap', 'Uzun menzilli Kılıç Balığı konvoy yaklaşmadan onu alır'], scene: { towers: [['octopus', 3, 0, 0, 2, 'priority']], feed: [['standard', 1], ['standard', 1], ['healer', 1], ['standard', 1], ['standard', 1]] } },
        stealth: { lead: 'Hayalet Kalamar: belli aralıkla gizlenir ve kuleler onu göremez.', points: ['4. dalgadan sonra tek sıra halinde, hızlı gelir', 'Gizliyken biraz daha hızlıdır', 'Vurulunca ya da ışıkta kısa süre görünür'], counter: ['Fener Balığı\'nın ışığı onu ortaya çıkarır', 'Yılan ve Balon Balığı alan hasarıyla gizliyken bile vurur'], scene: { towers: [['octopus', 2, 0, 0, 2], ['angler', 2, 0, 0, 3], ['eel', 2, 0, 0, 0]], feed: [['stealth', 4]] } },
        shocker: { lead: 'Elektrikli Müren: yakınındaki bir kuleyi sersemletir.', points: ['6. dalgadan sonra, dalganın son üçte birinde gelir', 'Önce yıldırımla uyarır (~1 sn), sonra kuleyi 3,5 sn susturur', 'Menzili ~175 pikseldir'], counter: ['Menzili kısa olduğu için uzaktan vur (Kılıç Balığı)', 'Yavaşlatıp ona yaklaşmadan öldür'], scene: { towers: [['octopus', 2, 0, 0, 0], ['swordfish', 2, 0, 0, 3]], feed: [['shocker', 1]] } },
        boss_shark: { lead: 'Kral Köpek Balığı: dengeli patron.', boss: 'shark' },
        boss_crab: { lead: 'Dev Kral Yengeç: çok zırhlı ve yavaş.', boss: 'crab' },
        boss_manta: { lead: 'Manta İmparatoru: havadan gelir, hızlıdır.', boss: 'manta' },
        boss_brood: { lead: 'Yavru Anası: yarı canda yavru köpek balığı saçar.', boss: 'brood' },
    };

    // Düşmana karşı iyi / kötü kuleler (yan panelde ve Rehber'de gösterilir)
    const COUNTERS = {
        standard: { good: ['octopus', 'angler'], bad: [] },
        armored: { good: ['eel', 'swordfish', 'angler'], bad: ['octopus'] },
        flying: { good: ['octopus', 'angler', 'jellyfish', 'swordfish'], bad: ['eel', 'puffer'] },
        swarm: { good: ['puffer', 'eel', 'jellyfish'], bad: [] },
        shield: { good: ['swordfish', 'puffer', 'jellyfish'], bad: [] },
        healer: { good: ['swordfish', 'octopus'], bad: [] },
        stealth: { good: ['angler', 'eel', 'puffer'], bad: ['octopus', 'swordfish'] },
        shocker: { good: ['swordfish', 'jellyfish'], bad: [] },
        boss: { good: ['swordfish', 'jellyfish'], bad: [] },
    };

    // Kural sayfaları. scene: gösterim, text: açıklama paragrafları
    const RULES = [
        { id: 'start', title: 'Başlarken', icon: '▶', lead: 'Düşmanlar yolun başından girer; sonuna ulaşırsa üssün canı azalır. Tüm dalgaları can bitmeden bitir.',
            sections: [
                ['Kule kurmak', 'Sağ paneldeki kuleyi haritadaki bir yeşil halkaya sürükle ya da kuleye tıklayıp sonra halkaya tıkla. Her kule enerji (para) harcar; düşman öldürdükçe ve dalga bitince enerji kazanırsın.'],
                ['Yükseltmek', 'Kuleye tıkla: Yükselt\'e basınca güç artar. 3. ve 5. seviyede iki yetenekten birini seçersin (seçim kalıcıdır). Çubuklar mevcut gücü (mavi) ve yükseltmeyle gelecek kazancı (sarı) gösterir.'],
                ['Dalgalar', 'Boşluk tuşu ya da düğme sıradaki dalgayı başlatır. Sağ üstteki kutu dalganın içeriğini ve hangi kulelerin iyi (✓) ya da kötü (✗) olduğunu gösterir.'],
                ['Kısayollar', 'Boşluk: dalga başlat · P: duraklat · F: hız (1x, 2x, 0,5x) · 1-6: kule seç · F11: tam ekran · Esc: geri.'],
                ['Kayıt', 'Haritalara dönünce ya da oyunu kapatınca yarım kalan oyun kaydedilir. Haritaya tekrar tıklayınca Devam et ya da Yeniden başla seçersin.'],
            ], scene: { towers: [['octopus', 1, 0, 0, 0], ['jellyfish', 1, 0, 0, 3]], feed: [['standard', 3], ['flying', 1]] } },
        { id: 'high', title: 'Yüksek zemin', icon: '▲', lead: 'Altın halkalı yerlerde kulenin menzili %20 artar.',
            sections: [
                ['Nasıl çalışır', 'Yüksek zemindeki kule aynı olsa da daha uzağa ulaşır (Ahtapot 210 → 252, Kılıç Balığı 380 → 456). Bunun karşılığında bu yerler genelde yola biraz daha uzaktır.'],
                ['Ne zaman seç', 'Kılıç Balığı ve Balon Balığı gibi uzun menzilli kuleler için idealdir. Kısa menzilli kuleyi çok uzağa koyarsan yolu kaçırabilir; yerin üzerine gelince ipucu çıkar.'],
            ], scene: { towers: [['octopus', 1, 0, 0, SPOT.main], ['octopus', 1, 0, 0, SPOT.high]], feed: [['standard', 3]], rings: true, caption: 'Alttaki normal zeminde, üstteki yüksek zeminde: halkalar menzili gösterir' } },
        { id: 'armor', title: 'Zırh ve delme', icon: '◆', lead: 'Zırh hasarı kırar; zırh delen kuleler zırhlıya karşı çok daha etkilidir.',
            sections: [
                ['Formül', 'Hasar çarpanı = 1 − zırh / (zırh + 100). Istakozun zırhı 100 olduğu için hasarın yarısını yer; Ahtapot ona ayrıca yarı hasar verir (toplam %25).'],
                ['Zırh delme', 'Yılan Balığı zırhın %50\'sini, Kılıç Balığı %30\'unu, Fener Balığı %20\'sini yok sayar. Delici Mürekkep, Zırh Kesen gibi yetenekler bunu artırır. Zehir, yanık ve gaz zırhı hiç saymaz.'],
            ], scene: { towers: [['octopus', 2, 0, 0, SPOT.left], ['eel', 2, 0, 0, SPOT.main]], feed: [['armored', 2]], caption: 'Aynı Istakoza: Ahtapot çok az, Yılan Balığı belirgin hasar verir' } },
        { id: 'slow', title: 'Yavaşlatma eşleşmesi', icon: '❄', lead: 'Yavaşlayan düşman her kuleden %20 fazla hasar alır.',
            sections: [
                ['Neden değerli', 'Deniz Anası kendi başına az hasar verir ama yavaşlattığı düşman herkesten %20 fazla hasar alır; üstelik yavaş düşman daha uzun süre menzilde kalır. Yavaşlatıcıyı hasar kulelerinin yanına koy.'],
                ['Sınırlar', 'Patronlarda yavaşlatma yarı etkilidir. Kalkan varken yavaşlatma %60 azalır. Buz Dokunuşu yeteneği yavaşlatmayı güçlendirir.'],
            ], scene: { towers: [['jellyfish', 2, 0, 0, SPOT.main], ['octopus', 2, 0, 0, SPOT.left]], feed: [['standard', 3]], caption: 'Mavi halkalı düşmanlar yavaşlamış: diğer kuleler onlara daha çok vurur' } },
        { id: 'adapt', title: 'Alışma', icon: '↻', lead: 'Hasarın yarısından fazlasını tek türe yaptırırsan düşmanlar ona alışır.',
            sections: [
                ['Nasıl çalışır', '4. dalgadan sonra, son iki dalgada bir kule türü toplam hasarın %55\'inden fazlasını yapıyorsa düşmanlar o türden en fazla %25 az hasar alır (%55 → 0, %100 → %25). Sağ üstteki kutuda "Düşmanlar alıştı" uyarısı çıkar.'],
                ['Çözüm', 'Türleri karıştır: iki ya da üç türe yay. Alışma tür karışınca kendiliğinden kalkar. Bu yüzden tek tür kuleyle yığılmak uzun vadede çalışmaz.'],
            ], scene: { custom: 'adapt', caption: 'Ahtapotun hasar payı %55\'i geçince düşmanlar alışır' } },
        { id: 'bossrule', title: 'Patronlar', icon: '♛', lead: 'Patron kule yer, canı düştükçe kalkan kazanıp öfkelenir.',
            sections: [
                ['Evreler', 'Büyük patron canı %70, %40 ve %15\'e inince, ara patron %60\'a inince: maksimum canın %12\'si kadar kalkan kazanır, 4 sn hızlanır ve sersemletilemez. Sağ üstteki patron çubuğunda bu eşikler çizgi olarak görünür.'],
                ['Kuleyi yer', 'Patron zaman zaman yakınındaki en yüksek seviyeli kuleyi hedef alır: önce çenesini açar (kırmızı çene ve çizgi), sonra kuleyi yutar. Yenen kule yok olur, para iadesi yoktur. Saldırı sırasında patron ölürse kule kurtulur.'],
                ['Hazırlık', 'Tek bir güçlü kuleyle patronu erken eritemezsin; çok kuleli, yavaşlatıcılı savunma kur ve patronun yolundaki en pahalı kuleyi ona yakın bırakma.'],
            ], scene: { boss: 'shark', caption: 'Patron kulelere çenesini açar; canı eşiklerden inince kalkan kazanıp öfkelenir' } },
        { id: 'difficulty', title: 'Zorluk', icon: '⚙', lead: 'Kolay, Normal ve Zor; harita ekranında seçilir.', table: 'difficulty',
            sections: [
                ['Fiyatlar', 'Kule fiyatları 50-100 arasındadır ve kolay ile normalde sabittir; zorda aynı türden her yeni kule %5 pahalanır.'],
                ['Başlangıç', 'Başlangıç enerjisi kolayda 300, normalde 250, zorda 230 (Derin Çukur\'da +50).'],
                ['Test', 'Haritaların dengesi botlarla ölçülür: düzenli oynayan kazanır, rastgele dizen ya da tek türe yığılan kaybeder, patronlar yolun büyük bölümünde ölmez (tools/zorluk_testi.js).'],
            ] },
    ];

    // Haritaya özel kuralların ayrıntılı anlatımı
    function mechText(m) {
        const mech = (m.mechanics || [])[0];
        if (!mech) return ['Bu haritada özel kural yok: yol ve kule yerleri öğrenmek için ideal başlangıç haritası.'];
        switch (mech.type) {
            case 'tangle': return [`Yolun işaretli bölümlerinde düşmanlar %${Math.round((1 - mech.zones[0].factor) * 100)} yavaşlar (düşmanın ayağına sarmaşık sarılır). Menzili bu bölümleri kapsayacak şekilde kule dizersen düşmanlar uzun süre ateş altında kalır.`, 'Yavaşlama, yavaşlatma eşleşmesiyle birleşir: bölgedeki düşman %20 fazla hasar da alır.'];
            case 'pull': return [`Yolun ikinci yarısında girdap düşmanı çeker ve giderek hızlandırır (en çok %${Math.round((mech.factor - 1) * 100)}). Hızlanan düşman daha az ateş altında kalır, bu yüzden son bölümü kapsayan kuleler ve yavaşlatıcılar değerlidir.`];
            case 'treasure': return ['Batık sandık ara sıra parlar: tıklayıp altın toplarsın. Sandık birkaç saniye sonra kapanır; dalga ilerledikçe ödül artar. Savaşırken sandığı kaçırma.'];
            case 'guardians': return [`Üç mermer koruyucu küre her ${mech.interval} sn düşmanlara vurup sersemletir (hasar ${mech.flat} + canın %${Math.round(mech.pct * 100)}\'i). Dolum arttıkça parlarlar; patronları yalnızca kısa süre sersemletir.`];
            case 'blizzard': return [`Kar fırtınası önceden uyarır ve ${mech.duration} sn sürer: kule menzilleri %${Math.round((1 - mech.rangeMul) * 100)} kısalır, ekran kenarları buzlanır. Fırtınaya hazırlıklı ol, kulelerin menzil payını bırak.`];
            case 'eruption': return [`Yanardağ ${mech.interval} sn\'de bir iki yeri lav patlamasıyla vurur: düşmanları yakar, yakındaki kuleleri ${mech.stun} sn susturur. Zaman zaman gökten bir lav kayası düşüp uyarısız bir kuleyi yok eder; lav yeri önceden kızıl çatlaklarla gösterilir.`];
            case 'darkness': return [`Harita karanlıktır: Fener Balığı\'nın ışığı dışındaki kulelerin menzili %${Math.round((1 - mech.rangeMul) * 100)} kısalır ve ışığın dışı görünür biçimde kararır. Işıklar birleşir; önce fener kur, diğer kuleleri ışığa diz.`];
            default: return [m.rule || ''];
        }
    }

    const TABS = [
        { id: 'start', label: 'Başlarken' },
        { id: 'towers', label: 'Kuleler' },
        { id: 'enemies', label: 'Düşmanlar' },
        { id: 'maps', label: 'Haritalar' },
        { id: 'rules', label: 'Kurallar' },
    ];

    // ------------------------------------------------------------------ durum
    let st = null;            // çalışan sahne
    let raf = 0;
    let lastTs = 0;
    let isOpen = false;
    let pausedBefore = false;
    let tab = 'start';
    let selected = {};        // sekme -> seçili öğe
    const ui = { level: 1, c3: 0, c5: 0 };
    let el = null;

    const $ = id => document.getElementById(id);
    const towerName = t => (typeof currentMap !== 'undefined' && currentMap.towerNames && currentMap.towerNames[t]) || Core.TOWER_TYPES[t].name;
    const enemyName = key => {
        if (key.startsWith('boss_')) return Core.BOSS_KINDS[key.slice(5)].name;
        return Core.ENEMY_NAMES[key] || key;
    };
    const fmt = n => String(n).replace('.', ',');

    // ------------------------------------------------------------------ sahne kurma
    function makeBackground() {
        const c = document.createElement('canvas');
        c.width = DW * RES;
        c.height = DH * RES;
        const g = c.getContext('2d');
        g.scale(RES, RES);
        const grad = g.createLinearGradient(0, 0, 0, DH);
        grad.addColorStop(0, '#12809c');
        grad.addColorStop(1, '#0a3f60');
        g.fillStyle = grad;
        g.fillRect(0, 0, DW, DH);
        // yumuşak ışık huzmeleri
        for (let i = 0; i < 6; i++) {
            const x = 40 + i * 110;
            const lg = g.createLinearGradient(x, 0, x + 80, DH);
            lg.addColorStop(0, 'rgba(210,255,255,0.10)');
            lg.addColorStop(1, 'rgba(210,255,255,0)');
            g.fillStyle = lg;
            g.beginPath();
            g.moveTo(x, 0); g.lineTo(x + 50, 0); g.lineTo(x + 130, DH); g.lineTo(x + 40, DH);
            g.closePath();
            g.fill();
        }
        // yol: kum şeridi
        const pts = Core.generateSmoothPath(DEMO_MAP.paths[0]);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.beginPath();
        pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
        g.strokeStyle = 'rgba(30,20,10,0.55)';
        g.lineWidth = 64;
        g.stroke();
        g.strokeStyle = '#d9bd7e';
        g.lineWidth = 54;
        g.stroke();
        g.strokeStyle = 'rgba(255,240,200,0.35)';
        g.lineWidth = 30;
        g.stroke();
        // çakıllar
        let seed = 9;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < 70; i++) {
            g.fillStyle = `rgba(${150 + rnd() * 60},${130 + rnd() * 40},${90 + rnd() * 40},0.55)`;
            g.beginPath();
            g.arc(rnd() * DW, rnd() * DH, 1.5 + rnd() * 3, 0, 6.2832);
            g.fill();
        }
        return c;
    }
    let bgCanvas = null;

    function spawnEnemy(w, type, opts) {
        const e = new Core.Enemy(w, type, 0, w.nextEnemyId++, (opts && opts.wave) || 5, opts || {});
        w.enemies.push(e);
        return e;
    }

    function makeScene(spec) {
        const map = Object.assign({}, DEMO_MAP, { mechanics: spec.mech || [], guardians: spec.guardians || [], treasure: spec.treasure || null });
        if (spec.mapExtra) Object.assign(map, spec.mapExtra);
        const w = new Core.World(map, { difficulty: 'easy', seed: 7, onEvent: () => { } });
        w.money = 1e8;
        w.health = w.maxHealth = 1e9;
        const towers = [];
        (spec.towers || []).forEach(([type, level, c3, c5, spot, mode]) => {
            const r = w.placeTower(type, w.spots[spot]);
            if (!r.ok) return;
            const tw = r.tower;
            while (tw.level < (level || 1)) w.upgradeTower(tw, tw.level + 1 === 3 ? c3 : tw.level + 1 === 5 ? c5 : 0);
            if (mode) tw.mode = mode;
            towers.push({ spec: [type, level, c3, c5, spot, mode], tower: tw });
        });
        const cv = $('guideCanvas');
        const sc = {
            spec, world: w, towers, t: 0, loop: 0, nextAt: 0, queue: [], respawn: [],
            fx: { floaters: [], rings: [], bubbles: [], flash: 0, tension: 0, shake: 0, alert: null, warns: [], sparks: [], guardGlow: [], toasts: [], furies: [], meteors: [], chomps: [], arcs: [], smoke: [], scorch: [], storm: 0 },
            ctx: cv.getContext('2d'), canvas: cv, map,
            sprites: demoSprites(map),
            pullFrom: ((map.mechanics || []).find(m => m.type === 'pull') || {}).from,
            lastTreasure: 0,
        };
        if (sc.pullFrom === undefined) sc.pullFrom = null;
        w.onEvent = (type, d) => withDemo(sc, () => onWorldEvent(type, d));
        return sc;
    }

    let spriteSet = null;
    function demoSprites(map) {
        if (!spriteSet) {
            const saved = sprites;
            loadSprites(map);
            spriteSet = sprites;
            sprites = saved;
        }
        return spriteSet;
    }

    // Gösterim süresince oyunun genel değişkenlerini sahneye bağlar
    function withDemo(sc, fn) {
        const saved = { world, fx, ctx, canvas, W, H, res, currentMap, sprites, hoverTowerId, pullFrom, selectedTower, inDemo };
        world = sc.world; fx = sc.fx; ctx = sc.ctx; canvas = sc.canvas; W = DW; H = DH; res = RES;
        currentMap = sc.map; sprites = sc.sprites; hoverTowerId = null; pullFrom = sc.pullFrom; selectedTower = null; inDemo = true;
        try {
            fn();
        } catch (e) {
            if (window.__errs && window.__errs.length < 20) window.__errs.push('rehber: ' + String((e && e.stack) || e));
        } finally {
            world = saved.world; fx = saved.fx; ctx = saved.ctx; canvas = saved.canvas; W = saved.W; H = saved.H; res = saved.res;
            currentMap = saved.currentMap; sprites = saved.sprites; hoverTowerId = saved.hoverTowerId; pullFrom = saved.pullFrom;
            selectedTower = saved.selectedTower; inDemo = saved.inDemo;
        }
    }

    // ------------------------------------------------------------------ düşman akışı
    // feed: [[tür, adet], ...] sırayla tekrar eder. Dalga numarası kule seviyesine göre ayarlanır (düşman canı).
    function feedStep(sc, dt) {
        const spec = sc.spec;
        const w = sc.world;
        sc.t += dt;
        if (spec.boss) return bossStep(sc, dt);
        if (spec.custom) return;
        if (!spec.feed) return;
        if (sc.t >= sc.nextAt) {
            if (!sc.queue.length) {
                sc.queue = [];
                spec.feed.forEach(([type, n], gi) => {
                    for (let i = 0; i < n; i++) sc.queue.push([type, i === 0 ? (gi === 0 ? 0.5 : 2.2) : (type === 'swarm' ? 0.32 : 0.9)]);
                });
            }
            const [type, gap] = sc.queue.shift();
            const lvl = Math.max(...sc.towers.map(t => t.tower.level), 1);
            spawnEnemy(w, type, { wave: 3 + lvl * 2 });
            sc.nextAt = sc.t + (sc.queue.length ? sc.queue[0][1] : 3.5);
        }
        // yok edilen kuleleri geri koy (lav, patron)
        sc.towers.forEach(rec => {
            if (!w.towers.includes(rec.tower)) {
                rec.gone = (rec.gone || 0) + dt;
                if (rec.gone > 2.5) restoreTower(sc, rec);
            }
        });
        treasureStep(sc, dt);
    }

    function restoreTower(sc, rec) {
        const w = sc.world;
        const [type, level, c3, c5, spot, mode] = rec.spec;
        if (w.spots[spot].tower) return;
        const r = w.placeTower(type, w.spots[spot]);
        if (!r.ok) return;
        while (r.tower.level < (level || 1)) w.upgradeTower(r.tower, r.tower.level + 1 === 3 ? c3 : r.tower.level + 1 === 5 ? c5 : 0);
        if (mode) r.tower.mode = mode;
        rec.tower = r.tower;
        rec.gone = 0;
    }

    function treasureStep(sc, dt) {
        const w = sc.world;
        if (w.treasure) {
            sc.lastTreasure += dt;
            if (sc.lastTreasure > 2.6) { w.collectTreasure(); sc.lastTreasure = 0; }
        }
    }

    function bossStep(sc, dt) {
        const w = sc.world;
        const boss = w.enemies.find(e => e.type === 'boss' && e.health > 0);
        if (!boss) {
            sc.respawn[0] = (sc.respawn[0] || 0) + dt;
            if (sc.respawn[0] > 2.2 || sc.t < 0.2) {
                sc.respawn[0] = 0;
                const kind = sc.spec.boss;
                const e = spawnEnemy(w, 'boss', { kind, hpMul: sc.spec.mini ? 0.18 : 0.3, mini: !!sc.spec.mini, wave: 6 });
                e.furyTimer = 1.5;
                e.speed = e.originalSpeed = e.originalSpeed * 1.9;     // gösterim için yolu daha çabuk bitirir
                sc.towers.forEach(rec => { if (!w.towers.includes(rec.tower)) restoreTower(sc, rec); });
            }
        }
        sc.towers.forEach(rec => {
            if (!w.towers.includes(rec.tower)) {
                rec.gone = (rec.gone || 0) + dt;
                if (rec.gone > 3.5) restoreTower(sc, rec);
            }
        });
    }

    // ------------------------------------------------------------------ çizim
    function drawRanges(sc) {
        sc.world.towers.forEach(t => {
            ctx.strokeStyle = t.spot.kind === 'high' ? 'rgba(255,215,90,0.8)' : 'rgba(255,255,255,0.65)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([8, 7]);
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.range, 0, 6.2832);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            const label = `${t.spot.kind === 'high' ? 'Yüksek zemin' : 'Normal zemin'} · menzil ${t.range}`;
            const ly = t.spot.kind === 'high' ? t.y - 58 : t.y + 72;
            ctx.strokeText(label, t.x, ly);
            ctx.fillStyle = t.spot.kind === 'high' ? '#ffe08a' : '#ffffff';
            ctx.fillText(label, t.x, ly);
            ctx.textAlign = 'left';
        });
    }

    function drawAdapt(sc) {
        // üç tür arasında değişen hasar payları ve %55 eşiği
        const k = (Math.sin(sc.t * 0.55 - 1.2) + 1) / 2;          // 0..1
        const share = 0.34 + 0.58 * k;                              // ahtapotun payı
        const others = [(1 - share) * 0.6, (1 - share) * 0.4];
        const bars = [['Ahtapot', share, '#ff9a3a'], ['Yılan Balığı', others[0], '#5ec6ff'], ['Deniz Anası', others[1], '#b58cff']];
        ctx.fillStyle = 'rgba(4,14,26,0.55)';
        ctx.fillRect(40, 40, DW - 80, DH - 80);
        ctx.font = 'bold 18px sans-serif';
        ctx.fillStyle = '#e8f6ff';
        ctx.fillText('Son iki dalgada verilen hasarın payı', 62, 76);
        const bx = 190;
        const bw = DW - 270;
        bars.forEach(([name, v, color], i) => {
            const y = 108 + i * 62;
            ctx.font = 'bold 16px sans-serif';
            ctx.fillStyle = '#cfe7f5';
            ctx.fillText(name, 62, y + 22);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(bx, y, bw, 32);
            ctx.fillStyle = color;
            ctx.fillRect(bx, y, bw * v, 32);
            ctx.fillStyle = '#fff';
            ctx.fillText('%' + Math.round(v * 100), bx + bw * v + 8, y + 22);
        });
        // eşik çizgisi
        const tx = bx + bw * 0.55;
        ctx.strokeStyle = '#ffd45a';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(tx, 98);
        ctx.lineTo(tx, 290);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd45a';
        ctx.font = '14px sans-serif';
        ctx.fillText('%55 eşik', tx - 24, 92);
        const resist = Math.max(0, Math.min(Core.ADAPT_MAX, (share - Core.ADAPT_FREE_SHARE) * 0.8));
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = resist > 0.01 ? '#ffb347' : '#8fe0a8';
        ctx.fillText(resist > 0.01 ? `Düşmanlar alıştı: Ahtapot %${Math.round(resist * 100)} daha az hasar veriyor` : 'Karışık dizilim: alışma yok', 62, 322);
    }

    function drawDarkness(sc) {
        const w = sc.world;
        const lights = w.towers.filter(t => t.type === 'angler').map(t => ({ x: t.x, y: t.y, r: w.lightRadius(t) }));
        if (!lights.length) return;
        if (!sc.dark) { sc.dark = document.createElement('canvas'); sc.dark.width = DW; sc.dark.height = DH; }
        const g = sc.dark.getContext('2d');
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, DW, DH);
        g.fillStyle = 'rgba(0,4,16,0.66)';
        g.fillRect(0, 0, DW, DH);
        g.globalCompositeOperation = 'destination-out';
        lights.forEach(l => {
            const grad = g.createRadialGradient(l.x, l.y, l.r * 0.82, l.x, l.y, l.r);
            grad.addColorStop(0, 'rgba(0,0,0,1)');
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grad;
            g.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
        });
        ctx.drawImage(sc.dark, 0, 0, DW, DH);
    }

    function drawScene(sc) {
        const c = sc.ctx;
        c.setTransform(RES, 0, 0, RES, 0, 0);
        c.drawImage(bgCanvas, 0, 0, DW, DH);
        withDemo(sc, () => {
            drawGas();
            drawScorch();
            drawEntities();
            drawMechanics();
            drawChomps();
            drawMeteors();
            drawFx();
            if (sc.spec.rings) drawRanges(sc);
            if (sc.spec.custom === 'adapt') drawAdapt(sc);
            if (sc.spec.dark) drawDarkness(sc);
        });
    }

    function stepScene(sc, dt) {
        withDemo(sc, () => {
            sc.world.update(dt);
            feedStep(sc, dt);
            updateFx(dt);
            fx.alert = null;                 // "PATRON SALDIRIYOR" gibi dev uyarılar küçük sahneyi kaplamasın
        });
    }

    function frame(ts) {
        raf = requestAnimationFrame(frame);
        if (!isOpen || !st) return;
        const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
        lastTs = ts;
        if (!world) animTime += dt;          // ana oyun çalışmıyorsa animasyon saatini biz ilerletiriz
        try {
            stepScene(st, dt);
            drawScene(st);
        } catch (e) {
            if (window.__errs && window.__errs.length < 20) window.__errs.push('rehber: ' + String((e && e.stack) || e));
        }
    }

    // ------------------------------------------------------------------ sahne seçimi
    function setScene(spec, caption) {
        if (st) { st.world.onEvent = () => { }; }
        if (!bgCanvas) bgCanvas = makeBackground();
        st = makeScene(spec);
        $('guideCaption').dataset.caption = caption || spec.caption || '';
        renderCaption();
        $('guideMain').classList.toggle('nostage', !!spec.noStage);
    }

    function towerSpec(type, level, c3, c5) {
        const lvl = level;
        const towers = [[type, lvl, c3, c5, SPOT.main]];
        const p3 = (Core.perkOptions(type, 3) || [])[c3] ? Core.perkOptions(type, 3)[c3].id : '';
        const p5 = (Core.perkOptions(type, 5) || [])[c5] ? Core.perkOptions(type, 5)[c5].id : '';
        const perks = lvl >= 5 ? [p3, p5] : lvl >= 3 ? [p3] : [];
        let feed;
        const extra = [];
        switch (type) {
            case 'octopus': feed = [['standard', 3], ['flying', 2], ['armored', 1], ['swarm', 4]]; if (perks.includes('oct-mark')) extra.push(['eel', 2, 0, 0, SPOT.left]); break;
            case 'eel': feed = [['swarm', 6], ['armored', 2], ['standard', 3]]; break;
            case 'jellyfish': feed = [['standard', 3], ['armored', 1], ['swarm', 4]]; extra.push(['octopus', 2, 0, 0, SPOT.left]); break;
            case 'swordfish': feed = [['standard', 3], ['armored', 2], ['shocker', 1]]; break;
            case 'angler': feed = [['standard', 3], ['stealth', 3], ['flying', 1]]; if (perks.includes('ang-halo')) extra.push(['octopus', 2, 0, 0, SPOT.left]); break;
            case 'puffer': feed = [['swarm', 7], ['armored', 2], ['shield', 1]]; break;
            default: feed = [['standard', 4]];
        }
        if (perks.includes('oct-pierce') || perks.includes('puf-gas') || perks.includes('eel-burn') || perks.includes('swo-cut')) feed = [['armored', 3], ['standard', 2], ['armored', 2]];
        if (perks.includes('eel-chain')) feed = [['swarm', 8], ['standard', 4]];
        if (perks.includes('jel-poison')) feed = [['armored', 3], ['shield', 1], ['standard', 2]];
        if (perks.includes('jel-pulse') || perks.includes('jel-field')) feed = [['standard', 4], ['flying', 2], ['swarm', 4]];
        if (perks.includes('swo-hunt') || perks.includes('swo-aim') || perks.includes('swo-rain')) feed = [['standard', 4], ['armored', 2], ['standard', 3]];
        return { towers: towers.concat(extra), feed, noStage: false, mapExtra: null };
    }

    function enemyScene(key) {
        const info = ENEMY_INFO[key];
        if (info.boss) return { towers: [['swordfish', 3, 0, 0, SPOT.high], ['octopus', 3, 0, 0, SPOT.main]], boss: info.boss, mapExtra: { boss: info.boss } };
        const sc = info.scene;
        return { towers: sc.towers.map(([t, l, a, b, s, m]) => [t, l, a, b, s, m]), feed: sc.feed };
    }

    function mapScene(m) {
        const mech = (m.mechanics || [])[0];
        const spec = { towers: [['octopus', 2, 0, 0, SPOT.main], ['jellyfish', 2, 0, 0, SPOT.left]], feed: [['standard', 4], ['flying', 1], ['armored', 1]] };
        if (!mech) return spec;
        const copy = Object.assign({}, mech);
        switch (mech.type) {
            case 'tangle': spec.mech = [Object.assign({}, copy, { zones: [{ from: 0.3, to: 0.7, factor: mech.zones[0].factor }] })]; spec.caption = 'Sarmaşıklı bölümde düşmanlar yavaşlar'; break;
            case 'pull': spec.mech = [Object.assign({}, copy, { from: 0.4 })]; spec.caption = 'Yolun son bölümünde girdap düşmanları hızlandırır'; break;
            case 'treasure': spec.treasure = { x: 330, y: 345 }; spec.mech = [Object.assign({}, copy, { first: 1.5, interval: 5, life: 4 })]; spec.caption = 'Sandık parlayınca tıklarsın (gösterimde otomatik toplanır)'; break;
            case 'guardians': spec.guardians = [{ x: 250, y: 215 }, { x: 420, y: 215 }]; spec.mech = [Object.assign({}, copy, { first: 2, interval: 6 })]; spec.caption = 'Koruyucu küreler dolunca düşmanlara yıldırım atar'; break;
            case 'blizzard': spec.mech = [Object.assign({}, copy, { first: 2, interval: 11, duration: 7 })]; spec.caption = 'Kar fırtınasında menzil kısalır'; break;
            case 'eruption': spec.mech = [Object.assign({}, copy, { first: 2, interval: 6, bombChance: 0.45 })]; spec.caption = 'Lav patlamaları ve düşen kayalar'; break;
            case 'darkness': spec.mech = [copy]; spec.dark = true; spec.towers = [['angler', 2, 0, 0, SPOT.main], ['octopus', 2, 0, 0, SPOT.right], ['octopus', 2, 0, 0, SPOT.left]]; spec.feed = [['standard', 3], ['stealth', 2]]; spec.caption = 'Işığın içindeki kule tam menzille, dışındaki %15 kısa vurur'; break;
            default: break;
        }
        return spec;
    }

    // ------------------------------------------------------------------ sayfa kurma
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    const imgTag = (src, cls) => `<img class="${cls || 'g-ico'}" src="${src}" alt="">`;
    const chip = (a, b) => `<span class="g-chip"><b>${esc(a)}</b> ${esc(b)}</span>`;
    const list = arr => `<ul>${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;

    function renderTabs() {
        $('guideTabs').innerHTML = TABS.map(t => `<button class="g-tab${t.id === tab ? ' on' : ''}" onclick="Guide.go('${t.id}')">${t.label}</button>`).join('');
    }

    function navItems() {
        switch (tab) {
            case 'towers': return Object.keys(Core.TOWER_TYPES).map(id => ({ id, title: towerName(id), icon: SPRITE_FILES.towers[id], sub: `${Core.TOWER_TYPES[id].cost} enerji` }));
            case 'enemies': return [
                ...['standard', 'armored', 'flying', 'swarm', 'shield', 'healer', 'stealth', 'shocker'].map(id => ({ id, title: enemyName(id), icon: SPRITE_FILES.enemies[id], sub: Core.ENEMY_INTRO[id] ? `${Core.ENEMY_INTRO[id]}. dalgadan` : 'her dalga' })),
                ...['shark', 'crab', 'manta', 'brood'].map(k => ({ id: 'boss_' + k, title: Core.BOSS_KINDS[k].name, icon: SPRITE_FILES.enemies['boss_' + k], sub: 'patron' })),
            ];
            case 'maps': return MAPS.map(m => ({ id: m.id, title: m.name, icon: m.thumb, sub: m.desc.split('·')[1] || '', thumb: true }));
            case 'rules': return RULES.map(r => ({ id: r.id, title: r.title, glyph: r.icon }));
            default: return [];
        }
    }

    function renderNav() {
        const items = navItems();
        const nav = $('guideList');
        nav.classList.toggle('hidden', tab === 'start');
        nav.innerHTML = items.map(it => `<button class="g-nav${it.id === selected[tab] ? ' on' : ''}" onclick="Guide.pick('${it.id}')">${it.icon ? imgTag(it.icon, it.thumb ? 'g-thumb' : 'g-ico') : `<span class="g-glyph">${it.glyph}</span>`}<span><b>${esc(it.title)}</b><small>${esc(it.sub || '')}</small></span></button>`).join('');
    }

    function towerPage(id) {
        const def = Core.TOWER_TYPES[id];
        const info = TOWER_INFO[id];
        const air = def.groundOnly ? 'Hayır' : 'Evet';
        const facts = [chip('Fiyat', def.cost), chip('Menzil', def.range), chip('Hasar', def.dmg), chip('Atış', fmt(def.rate) + ' sn'), chip('Havayı vurur', air)];
        if (def.aoe) facts.push(chip('Alan', def.aoe));
        if (def.pierce) facts.push(chip('Zırh deler', '%' + Math.round(def.pierce * 100)));
        return `<h3>${imgTag(SPRITE_FILES.towers[id], 'g-ico big')} ${esc(towerName(id))}</h3><p class="lead">${esc(info.lead)}</p>
            <div class="g-chips">${facts.join('')}</div>
            <div class="g-cols"><div class="g-good"><h4>✓ Güçlü olduğu yerler</h4>${list(info.good)}</div><div class="g-bad"><h4>✗ Zayıf olduğu yerler</h4>${list(info.bad)}</div></div>
            <h4>Yükseltme</h4><p>Her seviye hasarı %35, menzili %7 artırır, atışı %11 hızlandırır. 3. ve 5. seviyede yeteneklerden birini seçersin (seçim kalıcıdır). Gösterimin altındaki kartlara tıklayarak her yeteneği canlı izleyebilirsin.</p>
            <h4>İpuçları</h4>${list(info.tips)}`;
    }

    // Gösterimin altındaki kontroller: seviye düğmeleri ve yetenek kartları
    function towerControls(id) {
        const perks3 = Core.perkOptions(id, 3);
        const perks5 = Core.perkOptions(id, 5);
        const perkCard = (o, lv, i, chosen) => `<button class="g-perk${chosen ? ' on' : ''} ${i === 0 ? 'a' : 'b'}" onclick="Guide.perk(${lv},${i})"><span class="g-perk-tag">${lv}. SEVİYE · ${i === 0 ? 'A' : 'B'}</span><b>${esc(o.name)}</b><span>${esc(o.desc)}</span></button>`;
        const lvBtns = [1, 2, 3, 4, 5].map(l => `<button class="g-lv${ui.level === l ? ' on' : ''}" onclick="Guide.level(${l})">${l}</button>`).join('');
        return `<div class="g-lvrow"><span>Gösterimde seviye:</span>${lvBtns}</div>
            <div class="g-perks">${perks3.map((o, i) => perkCard(o, 3, i, ui.level >= 3 && ui.c3 === i)).join('')}${perks5.map((o, i) => perkCard(o, 5, i, ui.level >= 5 && ui.c5 === i)).join('')}</div>`;
    }

    function enemyControls(id) {
        const key = id.startsWith('boss_') ? 'boss' : id;
        const cn = COUNTERS[key];
        if (!cn) return '';
        const ico = t => `<img class="adv-tower" src="${SPRITE_FILES.towers[t]}" title="${esc(towerName(t))}" alt="">`;
        return `<h4>Bu düşmana karşı</h4><div class="g-vs"><span class="adv-good">✓ iyi:</span>${cn.good.map(ico).join('')}${cn.bad.length ? `<span class="adv-bad">✗ kötü:</span>${cn.bad.map(ico).join('')}` : ''}</div>`;
    }

    function enemyPage(id) {
        const info = ENEMY_INFO[id];
        if (info.boss) {
            const k = Core.BOSS_KINDS[info.boss];
            const bt = Core.ENEMY_TYPES.boss;
            const maps = MAPS.filter(m => m.boss === info.boss).map(m => m.name).join(', ');
            return `<h3>${imgTag(SPRITE_FILES.enemies[id], 'g-ico big')} ${esc(k.name)}</h3><p class="lead">${esc(info.lead)}</p>
                <div class="g-chips">${chip('Tür', 'patron')}${chip('Zırh', k.armor)}${chip('Hız', 'x' + fmt(k.speed))}${chip('Can', 'x' + fmt(k.hp))}${chip('Uçar', k.flying ? 'Evet' : 'Hayır')}${chip('Üsse hasar', bt.damage)}</div>
                <h4>Davranışı</h4>${list([
                    'Her haritada son dalgada büyük patron, 5. dalgada (12 dalgalı haritada 6.) yarı güçte ara patron gelir',
                    'Canı %70, %40 ve %15\'e inince kalkan kazanır, 4 sn hızlanır ve sersemletilemez (ara patronda yalnızca %60)',
                    'Yakınındaki en yüksek seviyeli kuleye çenesini açar, sonra yutar: kule yok olur',
                    k.splits ? 'Canı yarıya inince 8 yavru köpek balığı saçar' : (k.flying ? 'Havadan gelir: yalnızca havayı vurabilen kuleler çalışır' : 'Zırhı yüksektir: zırh delen kuleler gerekir'),
                ])}
                <h4>Karşı koymak</h4>${list(['Kılıç Balığı patronlara %50 fazla vurur (Zırh Kesen: %80)', 'Yavaşlatıcılar ve çok sayıda kule: patron bir kuleyle erimez', `Bu patron: ${maps || '-'}`])}`;
        }
        const def = Core.ENEMY_TYPES[id];
        const facts = [chip('Can', def.hp), chip('Hız', def.speed), chip('Zırh', def.armor), chip('Uçar', def.flying ? 'Evet' : 'Hayır'), chip('Ödül', def.reward), chip('Üsse hasar', def.damage)];
        if (def.shield) facts.push(chip('Kalkan', '%' + Math.round(def.shield * 100) + ' can'));
        const where = MAPS.filter(m => (m.enemyPool || []).includes(id)).map(m => m.name);
        return `<h3>${imgTag(SPRITE_FILES.enemies[id], 'g-ico big')} ${esc(enemyName(id))}</h3><p class="lead">${esc(info.lead)}</p>
            <div class="g-chips">${facts.join('')}</div>
            <h4>Davranışı</h4>${list(info.points)}
            <h4>Karşı koymak</h4>${list(info.counter)}
            <p class="g-small">${Core.ENEMY_INTRO[id] ? `İlk çıktığı dalga: ${Core.ENEMY_INTRO[id]}. ` : ''}${where.length && where.length < MAPS.length ? 'Bu haritalarda: ' + esc(where.join(', ')) : 'Tüm haritalarda çıkar.'}</p>`;
    }

    function mapPage(id) {
        const m = MAPS.find(x => x.id === id);
        const towers = m.towers.map(t => `<span class="g-t">${imgTag(SPRITE_FILES.towers[t], 'g-ico')}${esc(towerName(t))}</span>`).join('');
        const specials = (m.enemyPool || []).filter(t => Core.SPECIAL_ENEMIES.includes(t)).map(t => `<span class="g-t">${imgTag(SPRITE_FILES.enemies[t], 'g-ico')}${esc(enemyName(t))}</span>`).join('');
        const pathCount = (m.paths || [m.pathPoints]).length;
        const high = m.buildSpots.filter(s => s.kind === 'high').length;
        return `<h3>${esc(m.name)}</h3><p class="lead">${esc(m.desc)}</p>
            <div class="g-chips">${chip('Dalga', Core.totalWavesOf(m))}${chip('Yol', pathCount > 1 ? pathCount + ' kollu' : 'tek')}${chip('Kule yeri', m.buildSpots.length)}${chip('Yüksek zemin', high)}${chip('Başlangıç enerjisi', m.startMoney)}${chip('Zorluk', '●'.repeat(m.stars) + '○'.repeat(5 - m.stars))}</div>
            <h4>Harita kuralı</h4><p class="g-rule">${esc(m.rule || 'Özel kural yok')}</p>${mechText(m).map(t => `<p>${esc(t)}</p>`).join('')}
            <h4>Kullanabileceğin kuleler</h4><div class="g-tl">${towers}</div>
            <h4>Patron</h4><div class="g-tl"><span class="g-t">${imgTag(SPRITE_FILES.enemies['boss_' + (m.boss || 'shark')], 'g-ico')}${esc(Core.BOSS_KINDS[m.boss || 'shark'].name)}</span></div>
            ${specials ? `<h4>Özel düşmanlar</h4><div class="g-tl">${specials}</div>` : ''}`;
    }

    function difficultyTable() {
        const rows = [
            ['Düşman canı', d => d.hp === 1 ? 'standart' : (d.hp > 1 ? '+' : '') + Math.round((d.hp - 1) * 100) + '%'],
            ['Düşman hızı', d => d.speed === 1 ? 'standart' : (d.speed > 1 ? '+' : '') + Math.round((d.speed - 1) * 100) + '%'],
            ['Başlangıç enerjisi', d => 250 + d.startBonus],
            ['Aynı türden kule fiyatı', d => d.costStep ? 'her kule +%' + Math.round(d.costStep * 100) : 'sabit'],
            ['Öldürme ödülü', d => d.reward === 1 ? 'standart' : (d.reward > 1 ? '+' : '') + Math.round((d.reward - 1) * 100) + '%'],
            ['Dalga bonusu', d => d.bonus === 1 ? 'standart' : (d.bonus > 1 ? '+' : '') + Math.round((d.bonus - 1) * 100) + '%'],
            ['Üs canı', d => d.health],
            ['Satış iadesi', d => '%' + Math.round(d.refund * 100)],
        ];
        const ds = ['easy', 'normal', 'hard'].map(k => Core.DIFFICULTY[k]);
        return `<table class="g-table"><tr><th></th>${ds.map(d => `<th>${d.label}</th>`).join('')}</tr>${rows.map(([n, f]) => `<tr><td>${n}</td>${ds.map(d => `<td>${f(d)}</td>`).join('')}</tr>`).join('')}</table>`;
    }

    function rulePage(id) {
        const r = RULES.find(x => x.id === id);
        return `<h3><span class="g-glyph big">${r.icon}</span> ${esc(r.title)}</h3><p class="lead">${esc(r.lead)}</p>
            ${r.table ? difficultyTable() : ''}${r.sections.map(([h, t]) => `<h4>${esc(h)}</h4><p>${esc(t)}</p>`).join('')}`;
    }

    function renderPage() {
        const box = $('guideText');
        const id = selected[tab];
        let html = '';
        let spec = null;
        if (tab === 'start') {
            html = rulePage('start');
            spec = RULES[0].scene;
        } else if (tab === 'towers') {
            html = towerPage(id);
            spec = towerSpec(id, ui.level, ui.c3, ui.c5);
        } else if (tab === 'enemies') {
            html = enemyPage(id);
            spec = enemyScene(id);
        } else if (tab === 'maps') {
            html = mapPage(id);
            spec = mapScene(MAPS.find(m => m.id === id));
        } else if (tab === 'rules') {
            html = rulePage(id);
            const r = RULES.find(x => x.id === id);
            spec = r.scene ? Object.assign({}, r.scene) : { noStage: true, towers: [] };
            if (r.scene && r.scene.boss) spec = { towers: [['swordfish', 3, 0, 0, SPOT.high], ['octopus', 3, 0, 0, SPOT.main]], boss: r.scene.boss, caption: r.scene.caption };
            if (r.scene && r.scene.towers && !spec.towers) spec.towers = r.scene.towers;
        }
        box.innerHTML = html;
        box.scrollTop = 0;
        $('guideControls').innerHTML = tab === 'towers' ? towerControls(id) : (tab === 'enemies' ? enemyControls(id) : '');
        let caption = '';
        if (tab === 'towers') {
            const o3 = ui.level >= 3 ? Core.perkOptions(id, 3)[ui.c3] : null;
            const o5 = ui.level >= 5 ? Core.perkOptions(id, 5)[ui.c5] : null;
            caption = `Gösterim: ${towerName(id)}, seviye ${ui.level}` + (o3 ? ` · ${o3.name}` : '') + (o5 ? ` + ${o5.name}` : '');
        }
        setScene(normalizeSpec(spec), caption);
    }

    // sahne tanımındaki [tür, seviye, ...] dizilerini makeScene'in beklediği biçime getirir
    function normalizeSpec(spec) {
        const out = Object.assign({}, spec);
        out.towers = (spec.towers || []).map(t => (Array.isArray(t) ? [t[0], t[1] || 1, t[2] || 0, t[3] || 0, t[4] || 0, t[5]] : t));
        return out;
    }

    function renderCaption() {
        const cap = $('guideCaption');
        cap.innerText = cap.dataset.caption || '';
    }

    // ------------------------------------------------------------------ dış arayüz
    function open(tabId, itemId) {
        if (!el) el = $('guideScreen');
        if (tabId && TABS.some(t => t.id === tabId)) tab = tabId;
        if (itemId) selected[tab] = itemId;
        defaults();
        isOpen = true;
        el.classList.remove('hidden');
        // oyun içinden açıldıysa oyun duraklar
        const inGame = typeof world !== 'undefined' && world && !$('gameScreen').classList.contains('hidden');
        pausedBefore = typeof paused !== 'undefined' ? paused : false;
        if (inGame && !pausedBefore) togglePause();
        renderTabs();
        renderNav();
        renderPage();
        lastTs = 0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
    }

    function defaults() {
        if (!selected.towers) selected.towers = 'octopus';
        if (!selected.enemies) selected.enemies = 'standard';
        if (!selected.maps) selected.maps = MAPS[0].id;
        if (!selected.rules) selected.rules = 'high';
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        cancelAnimationFrame(raf);
        if (st) st.world.onEvent = () => { };
        st = null;
        el.classList.add('hidden');
        const inGame = typeof world !== 'undefined' && world && !$('gameScreen').classList.contains('hidden');
        if (inGame && !pausedBefore && paused) togglePause();
    }

    function go(t) {
        tab = t;
        defaults();
        renderTabs();
        renderNav();
        renderPage();
    }

    function pick(id) {
        selected[tab] = id;
        if (tab === 'towers') { ui.level = 1; ui.c3 = 0; ui.c5 = 0; }
        renderNav();
        renderPage();
    }

    function level(l) { ui.level = l; renderPage(); }

    function perk(lv, i) {
        if (lv === 3) ui.c3 = i; else ui.c5 = i;
        ui.level = Math.max(ui.level, lv);
        renderPage();
    }

    document.addEventListener('keydown', e => {
        if (isOpen && e.key === 'Escape') { e.preventDefault(); close(); }
    });

    return {
        open, close, go, pick, level, perk,
        // testler ve araçlar için
        RULES, TOWER_INFO, ENEMY_INFO, mechText,
    };
})();

function openGuide(tabId, itemId) { Guide.open(tabId, itemId); }
function closeGuide() { Guide.close(); }
