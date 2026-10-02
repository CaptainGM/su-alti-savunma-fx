// Rehber: kuleler, düşmanlar, haritalar ve kurallar için canlı gösterimli yardım ekranı.
//
// Gösterimler ayrı bir "sahne"dir: küçük bir Core.World (gerçek kurallar, gerçek yetenekler) kurulur ve oyunun
// kendi çizim fonksiyonlarıyla (drawEntities, drawMechanics, drawFx...) ayrı bir tuvale çizilir. Bunun için çizim
// sırasında game.js'in global değişkenleri (world, fx, ctx, canvas, W, H, res, currentMap, sprites) geçici olarak
// sahneye ait olanlarla değiştirilir (withDemo); `inDemo` iken günlük, kayıt ve liste güncellemeleri kapalıdır.
'use strict';

const Guide = (function () {
    // Tuvalin gerçek piksel boyutu (3:2, haritalarla aynı oran). Çizim bu boyutta yapılır, sayfada küçülerek gösterilir.
    const BW = 960;
    const BH = 640;

    // Gösterimler gerçek haritalar üzerinde çalışır. Kule, düşman ve kural sahneleri Mercan Kanalı'nın S dönüşünden bir
    // kesittir (kamera: sol üst köşe ve genişlik, yükseklik 2/3'ü); Haritalar sekmesi seçilen haritanın tamamını gösterir.
    // spots: sahne rollerinin (main, high, left, right) Mercan'ın kendi kule yerlerindeki numarası.
    const STAGE = { mapId: 'mercan', cam: { x: 420, y: 0, w: 900 }, spots: [8, 1, 0, 11] };
    const SPOT = { main: 0, high: 1, left: 2, right: 3 };

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
                ['Dalgalar', 'Boşluk tuşu ya da düğme sıradaki dalgayı başlatır. Sağ paneldeki kutu sıradaki dalganın düşmanlarını gösterir. Takılırsan İpucu düğmesine (ya da H tuşuna) bas: hangi düşmana karşı hangi kulenin iyi, hangisinin kötü olduğunu söyler. Üsse düşman geçince İpucu düğmesi göz kırpar.'],
                ['Kısayollar', 'Boşluk: dalga başlat · P: duraklat · F: hız (1x, 2x, 0,5x) · H: ipucu · 1-6: kule seç · F11: tam ekran · Esc: geri.'],
                ['Kayıt', 'Haritalara dönünce ya da oyunu kapatınca yarım kalan oyun kaydedilir. Haritaya tekrar tıklayınca Devam et ya da Yeniden başla seçersin.'],
            ], scene: { towers: [['octopus', 1, 0, 0, SPOT.main], ['jellyfish', 1, 0, 0, SPOT.right]], feed: [['standard', 3], ['flying', 1]], caption: 'Düşmanlar yoldan gelir, kuleler menzildeki düşmana ateş eder. Üsse ulaşan düşman canını azaltır.' } },
        { id: 'high', title: 'Yüksek zemin', icon: '▲', lead: 'Altın halkalı yerlerde kulenin menzili %20 artar.',
            sections: [
                ['Nasıl çalışır', 'Yüksek zemindeki kule aynı olsa da daha uzağa ulaşır (Ahtapot 210 → 252, Kılıç Balığı 380 → 456). Bunun karşılığında bu yerler genelde yola biraz daha uzaktır. Bir kuleyi altın halkanın üstüne sürüklediğinde ya da imleci üstüne getirdiğinde ekranda büyük bir "+%20 menzil" yazısı çıkar; kurunca da yeni menzil gösterilir.'],
                ['Ne zaman seç', 'Kılıç Balığı ve Balon Balığı gibi uzun menzilli kuleler için idealdir. Kısa menzilli kuleyi çok uzağa koyarsan yolu kaçırabilir; yerin üzerine gelince ipucu çıkar.'],
            ], scene: { towers: [['octopus', 1, 0, 0, SPOT.main], ['octopus', 1, 0, 0, SPOT.high]], feed: [['standard', 3]], rings: true, cam: { x: 250, y: 40, w: 990 }, caption: 'Aynı Ahtapot iki yerde: sağdaki normal zeminde, soldaki altın halkalı yüksek zeminde. Halkalar menzili, çizgiler hedefleri gösterir.' } },
        { id: 'armor', title: 'Zırh ve delme', icon: '◆', lead: 'Zırh hasarı kırar; zırh delen kuleler zırhlıya karşı çok daha etkilidir.',
            sections: [
                ['Formül', 'Hasar çarpanı = 1 − zırh / (zırh + 100). Istakozun zırhı 100 olduğu için hasarın yarısını yer; Ahtapot ona ayrıca yarı hasar verir (toplam %25).'],
                ['Zırh delme', 'Yılan Balığı zırhın %50\'sini, Kılıç Balığı %30\'unu, Fener Balığı %20\'sini yok sayar. Delici Mürekkep, Zırh Kesen gibi yetenekler bunu artırır. Zehir, yanık ve gaz zırhı hiç saymaz.'],
            ], scene: { towers: [['octopus', 2, 0, 0, SPOT.left], ['eel', 2, 0, 0, SPOT.main]], feed: [['armored', 2]], labels: [{ tower: 0, text: 'Ahtapot: zırhlıya zayıf', color: '#ff9a9a' }, { tower: 1, text: 'Yılan Balığı: zırhı deler', color: '#9fffc0' }], caption: 'Aynı Istakoza: Ahtapot çok az, Yılan Balığı belirgin hasar verir' } },
        { id: 'slow', title: 'Yavaşlatma eşleşmesi', icon: '❄', lead: 'Yavaşlayan düşman her kuleden %20 fazla hasar alır.',
            sections: [
                ['Neden değerli', 'Deniz Anası kendi başına az hasar verir ama yavaşlattığı düşman herkesten %20 fazla hasar alır; üstelik yavaş düşman daha uzun süre menzilde kalır. Yavaşlatıcıyı hasar kulelerinin yanına koy.'],
                ['Sınırlar', 'Patronlarda yavaşlatma yarı etkilidir. Kalkan varken yavaşlatma %60 azalır. Buz Dokunuşu yeteneği yavaşlatmayı güçlendirir.'],
            ], scene: { towers: [['jellyfish', 2, 0, 0, SPOT.main], ['octopus', 2, 0, 0, SPOT.left]], feed: [['standard', 3]], labels: [{ tower: 0, text: 'Deniz Anası: yavaşlatır', color: '#9fdcff' }, { tower: 1, text: 'Ahtapot: yavaşlayana %20 fazla vurur', color: '#ffe08a' }], caption: 'Mavi halkalı düşmanlar yavaşlamış: diğer kuleler onlara daha çok vurur' } },
        { id: 'adapt', title: 'Alışma', icon: '↻', lead: 'Hasarın yarısından fazlasını tek türe yaptırırsan düşmanlar ona alışır.',
            sections: [
                ['Nasıl çalışır', '4. dalgadan sonra, son iki dalgada bir kule türü toplam hasarın %55\'inden fazlasını yapıyorsa düşmanlar o türden en fazla %25 az hasar alır (%55 → 0, %100 → %25). Sağ üstteki kutuda "Düşmanlar alıştı" uyarısı çıkar.'],
                ['Çözüm', 'Türleri karıştır: iki ya da üç türe yay. Alışma tür karışınca kendiliğinden kalkar. Bu yüzden tek tür kuleyle yığılmak uzun vadede çalışmaz.'],
            ], scene: { custom: 'adapt', towers: [['octopus', 2, 0, 0, SPOT.main], ['eel', 2, 0, 0, SPOT.left], ['jellyfish', 2, 0, 0, SPOT.right]], feed: [['standard', 3]], caption: 'Ahtapotun hasar payı %55\'i geçince düşmanlar alışır' } },
        { id: 'bossrule', title: 'Patronlar', icon: '♛', lead: 'Patron kule yer, canı düştükçe kalkan kazanıp öfkelenir.',
            sections: [
                ['Evreler', 'Büyük patron canı %70, %40 ve %15\'e inince, ara patron %60\'a inince: maksimum canın %12\'si kadar kalkan kazanır, 4 sn hızlanır ve sersemletilemez. Sağ üstteki patron çubuğunda bu eşikler çizgi olarak görünür.'],
                ['Kuleyi yer', 'Patron zaman zaman yakınındaki en yüksek seviyeli kuleyi hedef alır: kızıl bir halka kuleyi işaretler, patron durup kuleye döner ve çömelir, sonra ağzı kuleye dönük olarak üstüne zıplar, ısırıp yutar ve yola geri atlar. Yenen kule yok olur, para iadesi yoktur. Zıplayıp ısırana kadar patron ölürse kule kurtulur.'],
                ['Hazırlık', 'Tek bir güçlü kuleyle patronu erken eritemezsin; çok kuleli, yavaşlatıcılı savunma kur ve patronun yolundaki en pahalı kuleyi ona yakın bırakma.'],
            ], scene: { boss: 'shark', caption: 'Patron kuleye dönüp zıplar, ısırır ve yola geri atlar; canı eşiklerden inince kalkan kazanıp öfkelenir' } },
        { id: 'difficulty', title: 'Zorluk', icon: '⚙', lead: 'Kolay, Normal ve Zor; harita ekranında seçilir.', table: 'difficulty',
            sections: [
                ['Fiyatlar', 'Kule fiyatları 50-100 arasındadır ve kolay ile normalde sabittir; zorda aynı türden her yeni kule %5 pahalanır.'],
                ['Başlangıç', 'Başlangıç enerjisi kolayda 300, normalde 250, zorda 230 (Derin Çukur ve Buz Koyu\'nda +50).'],
                ['Test', 'Haritaların dengesi botlarla ölçülür: düzenli oynayan kazanır, rastgele dizen ya da tek türe yığılan kaybeder, zorda da her haritada galibiyet mümkündür, patronlar yolun başında erimez (tools/zorluk_testi.js).'],
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
    let viaJava = false;       // kareleri Java sürüyor mu (WebView'ın kendi animasyon döngüsü 60'ta kilitli)
    let hadLoop = false;       // Rehber açılmadan önce Java döngüsü zaten çalışıyor muydu (oyun içinden açıldıysa evet)
    const stats = { frames: 0, since: 0, fps: 0, stepAcc: 0, drawAcc: 0, step: 0, draw: 0 };

    // Kule/düşman/kural sahnelerinin haritası: Mercan Kanalı, gösterim için sakinleştirilmiş (kural yok, her kule ve düşman açık)
    function stageMap() {
        const base = MAPS.find(m => m.id === STAGE.mapId);
        return Object.assign({}, base, {
            hpScale: 1, bossScale: 1, miniHp: 0.5, speedScale: 1, countScale: 1, startMoney: 1e7, rule: '',
            towers: Object.keys(Core.TOWER_TYPES), enemyPool: Object.keys(Core.ENEMY_TYPES), mechanics: [],
        });
    }

    // Kameranın gördüğü yol kesiti: düşmanlar kesite girmeden hemen önce doğar, çıkınca sessizce kaldırılır
    function pathWindow(p, full, cam) {
        const whole = { s0: 0, s1: p.length - 40 };
        if (full) return whole;
        const h = cam.w * BH / BW;
        const m = 40;
        let i0 = -1;
        let i1 = -1;
        p.points.forEach((q, i) => {
            if (q.x > cam.x - m && q.x < cam.x + cam.w + m && q.y > cam.y - m && q.y < cam.y + h + m) { if (i0 < 0) i0 = i; i1 = i; }
        });
        if (i0 < 0) return whole;
        return { s0: Math.max(0, p.dist[i0] - 70), s1: p.dist[i1] + 70 };
    }

    function spawnEnemy(sc, type, opts) {
        const w = sc.world;
        const lane = sc.full ? (sc.lane++ % w.paths.length) : 0;
        const e = new Core.Enemy(w, type, lane, w.nextEnemyId++, (opts && opts.wave) || 5, opts || {});
        e.traveled = sc.win.get(e.path).s0;
        e.update(0);
        w.enemies.push(e);
        return e;
    }

    // kule kaydı [tür, seviye, 3. sv. seçim, 5. sv. seçim, yer rolü (ya da tam haritada kule yeri numarası), hedef modu]
    function placeRec(sc, rec) {
        const [type, level, c3, c5, role, mode] = rec;
        const spot = sc.spotOf(role);
        if (!spot || spot.tower) return null;
        const r = sc.world.placeTower(type, spot);
        if (!r.ok) return null;
        const tw = r.tower;
        while (tw.level < (level || 1)) sc.world.upgradeTower(tw, tw.level + 1 === 3 ? c3 : tw.level + 1 === 5 ? c5 : 0);
        if (mode) tw.mode = mode;
        return tw;
    }

    let spriteSet = null;
    function demoSprites(map) {
        if (!spriteSet) {
            const saved = sprites;
            loadSprites(MAPS[0]);
            spriteSet = sprites;
            sprites = saved;
        }
        return Object.assign({}, spriteSet, {
            bg: loadImage(map.bg),
            caustics: map.ambient && map.ambient.caustics ? loadImage('assets/fx/caustics.png') : null,
        });
    }

    function makeScene(spec) {
        const full = !!spec.mapId;
        let map;
        if (full) {
            const m = MAPS.find(x => x.id === spec.mapId);
            map = Object.assign({}, m, { mechanics: spec.mech || [], hpScale: 0.7, bossScale: 1, miniHp: 0.5, speedScale: (m.speedScale || 1) * 2, startMoney: 1e7 });
        } else {
            map = stageMap();
            if (spec.mapExtra) Object.assign(map, spec.mapExtra);
        }
        const size = map.size || { w: 1350, h: 900 };
        const cam = full ? { x: 0, y: 0, w: size.w } : (spec.cam || STAGE.cam);
        const w = new Core.World(map, { difficulty: 'easy', seed: 7, onEvent: () => { } });
        w.money = 1e8;
        w.health = w.maxHealth = 1e9;
        const cv = $('guideCanvas');
        if (cv.width !== BW || cv.height !== BH) { cv.width = BW; cv.height = BH; }
        const sc = {
            spec, world: w, map, full, cam, size, res: BW / cam.w,
            towers: [], t: 0, nextAt: 0, queue: [], respawn: [], lane: 0, lastTreasure: 0, bg: null, ambient: null,
            fx: { floaters: [], rings: [], bubbles: [], flash: 0, tension: 0, shake: 0, alert: null, warns: [], sparks: [], guardGlow: [], toasts: [], furies: [], meteors: [], chomps: [], arcs: [], smoke: [], scorch: [], storm: 0 },
            ctx: cv.getContext('2d'), canvas: cv, sprites: demoSprites(map),
            pullFrom: ((map.mechanics || []).find(m => m.type === 'pull') || {}).from,
        };
        if (sc.pullFrom === undefined) sc.pullFrom = null;
        sc.win = new Map(w.paths.map(p => [p, pathWindow(p, full, cam)]));
        sc.spotOf = role => (full ? w.spots[role] : w.spots[STAGE.spots[role]]);
        (spec.towers || []).forEach(rec => sc.towers.push({ spec: rec, tower: placeRec(sc, rec) }));
        withDemo(sc, () => { sc.ambient = buildAmbient(map); });
        w.onEvent = (type, d) => withDemo(sc, () => onWorldEvent(type, d));
        return sc;
    }

    // Gösterim süresince oyunun genel değişkenlerini sahneye bağlar
    function withDemo(sc, fn) {
        const saved = { world, fx, ctx, canvas, W, H, res, currentMap, sprites, hoverTowerId, pullFrom, selectedTower, inDemo, ambient };
        world = sc.world; fx = sc.fx; ctx = sc.ctx; canvas = sc.canvas; W = sc.size.w; H = sc.size.h; res = sc.res;
        currentMap = sc.map; sprites = sc.sprites; hoverTowerId = null; pullFrom = sc.pullFrom; selectedTower = null; inDemo = true;
        ambient = sc.ambient;
        try {
            fn();
        } catch (e) {
            if (window.__errs && window.__errs.length < 20) window.__errs.push('rehber: ' + String((e && e.stack) || e));
        } finally {
            world = saved.world; fx = saved.fx; ctx = saved.ctx; canvas = saved.canvas; W = saved.W; H = saved.H; res = saved.res;
            currentMap = saved.currentMap; sprites = saved.sprites; hoverTowerId = saved.hoverTowerId; pullFrom = saved.pullFrom;
            selectedTower = saved.selectedTower; inDemo = saved.inDemo; ambient = saved.ambient;
        }
    }

    // Arka plan (gerçek harita resminin kamera kesiti, yol çizgisi, karanlık) tuval boyutunda bir kez pişirilir;
    // her karede tek bir birebir kopyalama yapılır. Resim henüz yüklenmediyse sonraki karede yeniden denenir.
    function bakeBackground(sc) {
        const img = sc.sprites.bg;
        if (!ready(img)) return;
        const c = document.createElement('canvas');
        c.width = BW;
        c.height = BH;
        const g = c.getContext('2d');
        g.imageSmoothingQuality = 'high';
        const f = img.naturalWidth / sc.size.w;
        const ch = sc.cam.w * BH / BW;
        g.drawImage(img, sc.cam.x * f, sc.cam.y * f, sc.cam.w * f, ch * f, 0, 0, BW, BH);
        withDemo(sc, () => {
            g.save();
            g.translate(-sc.cam.x * sc.res, -sc.cam.y * sc.res);
            bakeRays(g);
            bakeRail(g);
            g.restore();
            if (darknessMech()) bakeDarkness(c);
        });
        sc.bg = c;
    }

    // ------------------------------------------------------------------ düşman akışı
    // feed: [[tür, adet], ...] sırayla tekrar eder. Dalga numarası kule seviyesine göre ayarlanır (düşman canı).
    function feedStep(sc, dt) {
        const spec = sc.spec;
        const w = sc.world;
        sc.t += dt;
        if (spec.boss) bossStep(sc, dt);
        else if (spec.feed && sc.t >= sc.nextAt) {
            if (!sc.queue.length) {
                spec.feed.forEach(([type, n], gi) => {
                    for (let i = 0; i < n; i++) sc.queue.push([type, i === 0 ? (gi === 0 ? 0.5 : 2.2) : (type === 'swarm' ? 0.32 : 0.9)]);
                });
            }
            const [type, gap] = sc.queue.shift();
            const lvl = Math.max(...sc.towers.map(t => (t.tower ? t.tower.level : 1)), 1);
            spawnEnemy(sc, type, { wave: sc.full ? 4 : 3 + lvl * 2 });
            sc.nextAt = sc.t + (sc.queue.length ? sc.queue[0][1] : 3.5);
        }
        // kesitin dışına çıkan düşmanı sessizce kaldır
        w.enemies = w.enemies.filter(e => { const win = sc.win.get(e.path); return !(win && e.traveled > win.s1); });
        // yok edilen kuleleri geri koy (lav, patron)
        sc.towers.forEach(rec => {
            if (!rec.tower || !w.towers.includes(rec.tower)) {
                rec.gone = (rec.gone || 0) + dt;
                if (rec.gone > (spec.boss ? 3.5 : 2.5)) { const tw = placeRec(sc, rec.spec); if (tw) { rec.tower = tw; rec.gone = 0; } }
            }
        });
        if (w.treasure) {
            sc.lastTreasure += dt;
            if (sc.lastTreasure > 2.6) { w.collectTreasure(); sc.lastTreasure = 0; }
        }
    }

    function bossStep(sc, dt) {
        const w = sc.world;
        const boss = w.enemies.find(e => e.type === 'boss' && e.health > 0);
        if (boss) return;
        sc.respawn[0] = (sc.respawn[0] || 0) + dt;
        if (sc.respawn[0] > 2.2 || sc.t < 0.2) {
            sc.respawn[0] = 0;
            const e = spawnEnemy(sc, 'boss', { kind: sc.spec.boss, hpMul: sc.spec.mini ? 0.18 : 0.3, mini: !!sc.spec.mini, wave: 6 });
            e.furyTimer = 2.4;                                       // önce ekranda yürür, sonra kuleye saldırır
            e.speed = e.originalSpeed = e.originalSpeed * 1.9;     // gösterim için yolu daha çabuk bitirir
            sc.towers.forEach(rec => { if (!rec.tower || !w.towers.includes(rec.tower)) { const tw = placeRec(sc, rec.spec); if (tw) { rec.tower = tw; rec.gone = 0; } } });
        }
    }

    // ------------------------------------------------------------------ çizim
    // Etiket: koyu kapsül içinde yazı (kuleye bağlı açıklamalar). x, y kapsülün ortası; kameranın dışına taşmaz.
    function pill(sc, text, x, y, color, size) {
        size = size || 16;
        const ts = textSprite(text, size, color || '#ffffff');
        const w = ts.w;
        const h = size * 1.5;
        const cam = sc.cam;
        const camH = cam.w * BH / BW;
        const left = Math.max(cam.x + 4, Math.min(cam.x + cam.w - w - 4, x - w / 2));
        const top = Math.max(cam.y + 4, Math.min(cam.y + camH - h - 4, y - h / 2));
        const r = h / 2;
        ctx.beginPath();
        ctx.moveTo(left + r, top);
        ctx.arcTo(left + w, top, left + w, top + h, r);
        ctx.arcTo(left + w, top + h, left, top + h, r);
        ctx.arcTo(left, top + h, left, top, r);
        ctx.arcTo(left, top, left + w, top, r);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6,16,28,0.84)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.drawImage(ts.c, left, top + 0.05 * size - 3, ts.w, ts.h);
    }

    // menzil halkaları önbelleğe alınmış sprite olarak basılır (geniş yay çizimi bu WebView'da pahalı)
    const ringCache = new Map();
    function ringSprite(r, rgb, scale) {
        const key = `${r}|${rgb}|${scale.toFixed(3)}`;
        let c = ringCache.get(key);
        if (!c) {
            const px = Math.ceil((r + 6) * 2 * scale);
            c = document.createElement('canvas');
            c.width = c.height = px;
            const g = c.getContext('2d');
            g.scale(scale, scale);
            g.translate(r + 6, r + 6);
            g.fillStyle = `rgba(${rgb},0.08)`;
            g.beginPath();
            g.arc(0, 0, r, 0, 6.2832);
            g.fill();
            g.strokeStyle = 'rgba(0,12,22,0.6)';
            g.lineWidth = 5;
            g.setLineDash([10, 8]);
            g.stroke();
            g.strokeStyle = `rgba(${rgb},0.95)`;
            g.lineWidth = 2.6;
            g.stroke();
            if (ringCache.size > 40) ringCache.clear();
            ringCache.set(key, c);
        }
        return c;
    }

    // Yüksek zemin sahnesi: her kulenin menzil halkası, o kulenin menzilindeki düşmanlara çizgiler ve açıklama etiketi
    function drawRanges(sc) {
        sc.world.towers.forEach(t => {
            const hi = t.spot.kind === 'high';
            const rgb = hi ? '255,215,90' : '255,255,255';
            ctx.drawImage(ringSprite(t.range, rgb, sc.res), t.x - t.range - 6, t.y - t.range - 6, (t.range + 6) * 2, (t.range + 6) * 2);
            ctx.strokeStyle = `rgba(${rgb},0.45)`;
            ctx.lineWidth = 2;
            sc.world.enemies.forEach(e => {
                if (e.health > 0 && Math.hypot(e.x - t.x, e.y - t.y) <= t.range) {
                    ctx.beginPath();
                    ctx.moveTo(t.x, t.y - 8);
                    ctx.lineTo(e.x, e.y);
                    ctx.stroke();
                }
            });
        });
        sc.world.towers.forEach(t => {
            const hi = t.spot.kind === 'high';
            pill(sc, `${hi ? 'Yüksek zemin · menzil ' + t.range + ' (+%20)' : 'Normal zemin · menzil ' + t.range}`, t.x, t.y - 78, hi ? '#ffe08a' : '#ffffff', 24);
        });
    }

    function drawAdapt(sc) {
        // üç tür arasında değişen hasar payları ve %55 eşiği (ekran koordinatlarında)
        const VW = sc.cam.w;
        const VH = sc.cam.w * BH / BW;
        ctx.save();
        ctx.setTransform(sc.res, 0, 0, sc.res, 0, 0);
        const k = (Math.sin(sc.t * 0.55 - 1.2) + 1) / 2;          // 0..1
        const share = 0.34 + 0.58 * k;                              // ahtapotun payı
        const others = [(1 - share) * 0.6, (1 - share) * 0.4];
        const bars = [['Ahtapot', share, '#ff9a3a'], ['Yılan Balığı', others[0], '#5ec6ff'], ['Deniz Anası', others[1], '#b58cff']];
        const x0 = 34;
        const y0 = 54;
        ctx.fillStyle = 'rgba(4,14,26,0.80)';
        ctx.fillRect(x0, y0, VW - 2 * x0, VH - 2 * y0);
        ctx.strokeStyle = 'rgba(120,200,255,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x0, y0, VW - 2 * x0, VH - 2 * y0);
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = '#e8f6ff';
        ctx.fillText('Son iki dalgada verilen hasarın payı', x0 + 22, y0 + 38);
        const bx = 200;
        const bw = VW - 2 * x0 - 200 - 80;
        bars.forEach(([name, v, color], i) => {
            const y = y0 + 78 + i * 62;
            ctx.font = 'bold 17px sans-serif';
            ctx.fillStyle = '#cfe7f5';
            ctx.fillText(name, x0 + 22, y + 23);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(bx, y, bw, 32);
            ctx.fillStyle = color;
            ctx.fillRect(bx, y, bw * v, 32);
            ctx.fillStyle = '#fff';
            ctx.fillText('%' + Math.round(v * 100), bx + bw * v + 8, y + 23);
        });
        const tx = bx + bw * 0.55;
        ctx.strokeStyle = '#ffd45a';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(tx, y0 + 62);
        ctx.lineTo(tx, y0 + 78 + 3 * 62 - 14);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffd45a';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText('%55 eşik', tx - 28, y0 + 56);
        const resist = Math.max(0, Math.min(Core.ADAPT_MAX, (share - Core.ADAPT_FREE_SHARE) * 0.8));
        ctx.font = 'bold 20px sans-serif';
        ctx.fillStyle = resist > 0.01 ? '#ffb347' : '#8fe0a8';
        ctx.fillText(resist > 0.01 ? `Düşmanlar alıştı: Ahtapot %${Math.round(resist * 100)} daha az hasar veriyor` : 'Karışık dizilim: alışma yok', x0 + 22, VH - y0 - 22);
        ctx.restore();
    }

    function drawOverlays(sc) {
        const spec = sc.spec;
        if (spec.rings) drawRanges(sc);
        if (spec.labels) {
            spec.labels.forEach(l => {
                const rec = sc.towers[l.tower];
                if (rec && rec.tower && sc.world.towers.includes(rec.tower)) pill(sc, l.text, rec.tower.x, rec.tower.y - 76, l.color || '#ffffff', 22);
            });
        }
        if (spec.custom === 'adapt') drawAdapt(sc);
    }

    function drawScene(sc) {
        const c = sc.ctx;
        if (!sc.bg) bakeBackground(sc);
        c.setTransform(1, 0, 0, 1, 0, 0);
        if (sc.bg) c.drawImage(sc.bg, 0, 0);
        else { c.fillStyle = sc.map.tint || '#0a3c58'; c.fillRect(0, 0, BW, BH); }
        c.setTransform(sc.res, 0, 0, sc.res, -sc.cam.x * sc.res, -sc.cam.y * sc.res);
        withDemo(sc, () => {
            const fancy = Settings.get().effects;
            if (fancy) drawAmbientBack();
            drawGas();
            drawScorch();
            drawEntities();
            drawMechanics();
            drawChomps();
            drawMeteors();
            if (fancy) drawAmbientFront();
            drawFx();
            drawOverlays(sc);
        });
    }

    function stepScene(sc, dt) {
        withDemo(sc, () => {
            sc.world.update(dt);
            feedStep(sc, dt);
            fx.shake = 0;                    // küçük sahne sarsılmasın
            updateFx(dt);
            fx.alert = null;                 // "PATRON SALDIRIYOR" gibi dev uyarılar küçük sahneyi kaplamasın
            fx.flash = 0;
            fx.tension = 0;
        });
    }

    // Kareyi Java sürer (oyundaki gibi, 60'ı aşabilir); Java yoksa requestAnimationFrame
    function frame(ts) {
        if (!isOpen || !st) return;
        const target = Settings.get().fps;
        if (target > 0 && lastTs && ts - lastTs < 1000 / target - 0.6) return;
        const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
        lastTs = ts;
        if (dt <= 0) return;
        animTime += dt;                       // oyun döngüsü Rehber açıkken durur; animasyon saatini biz ilerletiriz
        try {
            const t0 = performance.now();
            stepScene(st, dt);
            const t1 = performance.now();
            drawScene(st);
            stats.stepAcc += t1 - t0;
            stats.drawAcc += performance.now() - t1;
        } catch (e) {
            if (window.__errs && window.__errs.length < 20) window.__errs.push('rehber: ' + String((e && e.stack) || e));
        }
        stats.frames++;
        const now = performance.now();
        if (now - stats.since >= 500) {
            stats.fps = Math.round(stats.frames * 1000 / (now - stats.since));
            stats.step = +(stats.stepAcc / stats.frames).toFixed(2);
            stats.draw = +(stats.drawAcc / stats.frames).toFixed(2);
            stats.stepAcc = stats.drawAcc = 0;
            stats.frames = 0;
            stats.since = now;
        }
    }

    function tick(ts) {
        raf = requestAnimationFrame(tick);
        frame(ts);
    }

    function startLoop() {
        cancelAnimationFrame(raf);
        lastTs = 0;
        stats.frames = 0;
        stats.since = performance.now();
        viaJava = !!window.javaDriven;
        if (viaJava) {
            hadLoop = loopOn;
            if (!hadLoop) bridgeLoop(true);
        } else {
            raf = requestAnimationFrame(tick);
        }
    }

    function stopLoop() {
        cancelAnimationFrame(raf);
        if (viaJava && !hadLoop) bridgeLoop(false);
    }

    // ------------------------------------------------------------------ sahne seçimi
    function setScene(spec, caption) {
        if (st) { st.world.onEvent = () => { }; }
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
        let note = '';
        switch (type) {
            case 'octopus': feed = [['standard', 3], ['flying', 2], ['armored', 1], ['swarm', 4]]; if (perks.includes('oct-mark')) { extra.push(['eel', 2, 0, 0, SPOT.left]); note = 'Soldaki Yılan Balığı yalnızca işaretli düşmana daha çok vurduğunu göstermek için'; } break;
            case 'eel': feed = [['swarm', 6], ['armored', 2], ['standard', 3]]; break;
            case 'jellyfish': feed = [['standard', 3], ['armored', 1], ['swarm', 4]]; break;
            case 'swordfish': feed = [['standard', 3], ['armored', 2], ['shocker', 1]]; break;
            case 'angler': feed = [['standard', 3], ['stealth', 3], ['flying', 1]]; if (perks.includes('ang-halo')) { extra.push(['octopus', 2, 0, 0, SPOT.left]); note = 'Soldaki Ahtapot ışığın içinde daha çok hasar verdiğini göstermek için'; } break;
            case 'puffer': feed = [['swarm', 7], ['armored', 2], ['shield', 1]]; break;
            default: feed = [['standard', 4]];
        }
        if (perks.includes('oct-pierce') || perks.includes('puf-gas') || perks.includes('eel-burn') || perks.includes('swo-cut')) feed = [['armored', 3], ['standard', 2], ['armored', 2]];
        if (perks.includes('eel-chain')) feed = [['swarm', 8], ['standard', 4]];
        if (perks.includes('jel-poison')) feed = [['armored', 3], ['shield', 1], ['standard', 2]];
        if (perks.includes('jel-pulse') || perks.includes('jel-field')) feed = [['standard', 4], ['flying', 2], ['swarm', 4]];
        if (perks.includes('swo-hunt') || perks.includes('swo-aim') || perks.includes('swo-rain')) feed = [['standard', 4], ['armored', 2], ['standard', 3]];
        return { towers: towers.concat(extra), feed, noStage: false, note };
    }

    function enemyScene(key) {
        const info = ENEMY_INFO[key];
        if (info.boss) return { towers: [['swordfish', 3, 0, 0, SPOT.high], ['octopus', 3, 0, 0, SPOT.main]], boss: info.boss, mapExtra: { boss: info.boss } };
        const sc = info.scene;
        return { towers: sc.towers.map(([t, l, a, b, s, m]) => [t, l, a, b, s, m]), feed: sc.feed };
    }

    // Haritanın tamamı: yol, kule yerleri ve haritanın kuralı gerçek verilerle, küçültülmüş canlı gösterim
    function autoTowers(m) {
        const paths = Core.mapPaths(m).map(Core.buildPath);
        const cover = (sp, r) => {
            let c = 0;
            for (const p of paths) for (let i = 1; i < p.points.length; i++) if (Math.hypot(p.points[i].x - sp.x, p.points[i].y - sp.y) <= r) c += p.dist[i] - p.dist[i - 1];
            return c;
        };
        const scored = m.buildSpots.map((sp, i) => ({ i, sp, c: cover(sp, 200 * (sp.kind === 'high' ? 1.2 : 1)) })).sort((a, b) => b.c - a.c);
        const chosen = [];
        for (const s of scored) {
            if (chosen.length >= 5 || s.c < 150) break;
            if (chosen.every(o => Math.hypot(o.sp.x - s.sp.x, o.sp.y - s.sp.y) > 250)) chosen.push(s);
        }
        const pref = ['octopus', 'jellyfish', 'eel', 'puffer', 'angler', 'swordfish'].filter(t => m.towers.includes(t));
        const dark = (m.mechanics || []).some(x => x.type === 'darkness');
        return chosen.map((s, k) => [dark && k < 2 ? 'angler' : pref[k % pref.length], 2, 0, 0, s.i]);
    }

    function mapScene(m) {
        const mech = (m.mechanics || [])[0];
        const spec = { mapId: m.id, towers: autoTowers(m), feed: [['standard', 4], ['flying', 1], ['swarm', 4], ['armored', 1]], caption: `${m.name}: harita küçültülmüş ve canlı. Kuleler gerçek kule yerlerinde, düşmanlar gerçek yolda yürür.` };
        if (!mech) return spec;
        const copy = Object.assign({}, mech);
        switch (mech.type) {
            case 'tangle': spec.mech = [copy]; spec.caption = 'Sarmaşıklı bölümlerde düşmanlar yavaşlar (ayaklarına yeşil sarmaşık sarılır)'; break;
            case 'pull': spec.mech = [copy]; spec.caption = 'Girdap yolun ikinci yarısında düşmanları hızlandırır (arkalarında su izi kalır)'; break;
            case 'treasure': spec.mech = [Object.assign({}, copy, { first: 1.5, interval: 5, life: 4 })]; spec.caption = 'Sandık parlayınca tıklayıp altın toplarsın (gösterimde otomatik toplanır)'; break;
            case 'guardians': spec.mech = [Object.assign({}, copy, { first: 2, interval: 6 })]; spec.caption = 'Koruyucu küreler dolunca düşmanlara yıldırım atar ve sersemletir'; break;
            case 'blizzard': spec.mech = [Object.assign({}, copy, { first: 2, interval: 11, duration: 7 })]; spec.caption = 'Kar fırtınasında kule menzilleri kısalır ve ekran kenarları buzlanır'; break;
            case 'eruption': spec.mech = [Object.assign({}, copy, { first: 2, interval: 6, bombChance: 0.45 })]; spec.caption = 'Lav patlamaları düşmanları yakar, yakındaki kuleleri susturur; arada kayalar düşer'; break;
            case 'darkness': spec.mech = [copy]; spec.feed = [['standard', 3], ['stealth', 2]]; spec.caption = 'Fener Balığı\'nın ışığındaki kuleler tam menzille, dışındakiler kısa vurur'; break;
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
        const chipOf = t => `<span class="hint-t"><img src="${SPRITE_FILES.towers[t]}" alt="">${esc(towerName(t))}</span>`;
        return `<h4>Bu düşmana karşı</h4><div class="g-vs"><span class="adv-good">✓ İyi kuleler:</span>${cn.good.map(chipOf).join('')}</div>${cn.bad.length ? `<div class="g-vs"><span class="adv-bad">✗ Kötü kuleler:</span>${cn.bad.map(chipOf).join('')}</div>` : ''}`;
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
                    'Yakınındaki en yüksek seviyeli kuleye döner, zıplayıp ısırarak yutar, sonra yola geri atlar: kule yok olur',
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
        if (spec && spec.note) caption = (caption ? caption + ' · ' : '') + spec.note;
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
        if (typeof hintOpen === 'function' && hintOpen()) closeHint();       // ipucu penceresi açıksa kapat (duraklatmayı geri alır)
        defaults();
        isOpen = true;
        // Altta duran ekran (menü resmi, oyun tuvali) gösterim her karede değiştiği için sürekli yeniden boyanıyordu ve
        // Rehber 30 FPS'te kalıyordu; açıkken gizlenir (yerleşim bozulmaz), kapanınca geri gelir.
        document.querySelectorAll('.screen').forEach(sc => { if (sc.id !== 'guideScreen' && !sc.classList.contains('hidden')) sc.classList.add('g-under'); });
        el.classList.remove('hidden');
        // oyun içinden açıldıysa oyun duraklar
        const inGame = typeof world !== 'undefined' && world && !$('gameScreen').classList.contains('hidden');
        pausedBefore = typeof paused !== 'undefined' ? paused : false;
        if (inGame && !pausedBefore) togglePause();
        renderTabs();
        renderNav();
        renderPage();
        startLoop();
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
        stopLoop();
        if (st) st.world.onEvent = () => { };
        st = null;
        el.classList.add('hidden');
        document.querySelectorAll('.g-under').forEach(sc => sc.classList.remove('g-under'));
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
        running: () => isOpen, frame, fps: () => stats.fps, perf: () => stats, scene: () => st,
    };
})();

function openGuide(tabId, itemId) { Guide.open(tabId, itemId); }
function closeGuide() { Guide.close(); }
