// Zorluk ve strateji denetimi: botlarla tüm haritaları oynatır, sonuçları ölçütlerle karşılaştırır.
//
//   node tools/zorluk_testi.js            tüm haritalar, normal + kolay + zor (birkaç dakika)
//   node tools/zorluk_testi.js hizli      yalnızca üç harita, normal zorluk (CI için)
//   node tools/zorluk_testi.js mercan     tek harita
//
// Denetlenen ölçütler (normal zorlukta, 3 tohum):
//   1. Düzenli dizen oyuncu (karisik) haritayı kazanır (en az 2/3)
//   2. Rastgele dizen oyuncu, düzenli dizenden kötü oynar; tek türe yığılan (spam) en fazla 1/3 kazanır
//   3. Ara patron yolun en az %40'ında, son patron en az %55'inde ölür (ya da üsse ulaşır): tek bir güçlü kule
//      patronu yolun başında eritemez. Keskin nişancı odaklı oyuncuda ara patron en az %30'da ölür
//   4. Kolayda düzenli oyuncu kazanır ve ara patron en az %35 yol alır; zorda 9 haritanın en az 5'inde en az bir galibiyet
// Hiçbir ölçüt tutmazsa çıkış kodu 1 olur.
process.env.PERKSEL = process.env.PERKSEL || 'R';      // botlar yetenekleri karışık seçer
const { play } = require('./balans.js');
const path = require('path');
const MAPS = require(path.join(__dirname, '..', 'src', 'main', 'resources', 'web', 'js', 'maps.js'));

const arg = process.argv[2];
const quick = arg === 'hizli';
const maps = MAPS.filter(m => (quick ? ['mercan', 'volkan', 'cukur'].includes(m.id) : !arg || m.id === arg));
const SEEDS = [11, 23, 37];

const runs = (map, bot, diff) => SEEDS.map(s => play(map, bot, diff, s));
const wins = rs => rs.filter(r => r.result === 'win').length;
const prog = (rs, mini) => {
    const v = rs.flatMap(r => r.bosses.filter(b => !!b.mini === mini).map(b => b.at));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const pct = v => (v == null ? '  - ' : String(Math.round(v * 100)).padStart(3) + '%');

let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('   ✗ ' + msg); } return ok; };
let hardWins = 0;

console.log('harita     normal: düzenli rastgele yığılan | ara-patron son-patron | keskin ara | kolay: kazanma ara | zor');
for (const m of maps) {
    const kar = runs(m, 'karisik', 'normal');
    const ras = runs(m, 'rastgele', 'normal');
    const spm = quick ? [] : runs(m, 'spam', 'normal');
    const kes = quick ? [] : runs(m, 'keskin', 'normal');
    const eas = quick ? [] : runs(m, 'karisik', 'easy');
    const har = quick ? [] : runs(m, 'karisik', 'hard');
    const miniN = prog(kar, true), finN = prog(kar, false), miniK = prog(kes, true), miniE = prog(eas, true);
    console.log(m.id.padEnd(10), `        ${wins(kar)}/3      ${wins(ras)}/3       ${quick ? '-' : wins(spm) + '/3'}    |    ${pct(miniN)}     ${pct(finN)}   |   ${pct(miniK)}   |   ${quick ? '-' : wins(eas) + '/3'}     ${pct(miniE)}  | ${quick ? '-' : wins(har) + '/3'}`);
    check(wins(kar) >= 2, `${m.id}: düzenli oyuncu normalde en az 2/3 kazanmalı (${wins(kar)}/3)`);
    check(wins(kar) > wins(ras) || wins(kar) === 3 && wins(ras) <= 2, `${m.id}: rastgele dizen düzenliden kötü olmalı (${wins(ras)}/3 ≥ ${wins(kar)}/3)`);
    if (!quick) check(wins(spm) <= 1, `${m.id}: tek türe yığılan en fazla 1/3 kazanmalı (${wins(spm)}/3)`);
    if (miniN != null) check(miniN >= 0.40, `${m.id}: ara patron düzenli oyuncuya karşı yolun en az %40'ında ölmeli (%${Math.round(miniN * 100)})`);
    if (finN != null) check(finN >= 0.55, `${m.id}: son patron düzenli oyuncuya karşı yolun en az %55'inde ölmeli (%${Math.round(finN * 100)})`);
    if (!quick) {
        if (miniK != null) check(miniK >= 0.30, `${m.id}: keskin nişancı odaklı oyuncuya karşı ara patron en az %30 yol almalı (%${Math.round(miniK * 100)})`);
        check(wins(eas) >= 2, `${m.id}: kolayda düzenli oyuncu en az 2/3 kazanmalı (${wins(eas)}/3)`);
        if (miniE != null) check(miniE >= 0.35, `${m.id}: kolayda da ara patron en az %35 yol almalı (%${Math.round(miniE * 100)})`);
        if (wins(har) >= 1) hardWins++;
    }
}
if (!quick && maps.length === MAPS.length) check(hardWins >= 5, `zorda en az 5 haritada galibiyet mümkün olmalı (${hardWins}/9)`);
console.log(fails ? `\n${fails} ölçüt tutmadı` : '\nTÜM ÖLÇÜTLER TUTTU');
process.exit(fails ? 1 : 0);
