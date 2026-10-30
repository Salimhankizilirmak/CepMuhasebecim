// Hesap motoru testleri: npm test
import assert from 'node:assert/strict';
import { analyze, tryPurchase, loanInstallment } from '../public/engine.js';

const today = '2026-10-30';
const base = [
  { id: 'k1', tur: 'kart', ad: 'Bonus', limit: 300000, donemBorcu: 42000, sonOdemeTarihi: '2026-11-12', kesimGunu: 2, odemePlani: 'tam' },
  { id: 'k2', tur: 'kart', ad: 'World', limit: 150000, donemBorcu: 20000, sonOdemeTarihi: '2026-11-22', odemePlani: 'tam' },
  { id: 'a1', tur: 'alisveris', ad: 'Telefon', tutar: 36000, taksit: 6, tarih: '2026-08-20', kartId: 'k1' }
];
const approx = (a, b, msg) => assert.ok(Math.abs(a - b) < 1, `${msg}: ${a} ≠ ${b}`);

// 1) Bugünkü limit kullanımı: ekstre + henüz ekstreye girmemiş taksitler
{
  const A = analyze(base, null, today);
  const bonus = A.cards.find(c => c.rec.id === 'k1');
  approx(bonus.now.billed, 42000, 'Bonus ekstre');
  approx(bonus.now.unbilled, 18000, 'Bonus kalan telefon taksitleri (Ara, Oca, Şub)');
  approx(bonus.now.avail, 240000, 'Bonus kullanılabilir');
  assert.equal(bonus.remainingInst[0].kalan, 3);
}

// 2) 5 Aralık: salon 240.000 TL / 9 taksit Bonus'a, beyaz eşya 160.000 TL / 6 taksit kart seçilmeden
{
  const recs = [...base,
    { id: 'a2', tur: 'alisveris', ad: 'Düğün salonu', tutar: 240000, taksit: 9, tarih: '2026-12-05', kartId: 'k1', dugun: true },
    { id: 'a3', tur: 'alisveris', ad: 'Beyaz eşya', tutar: 160000, taksit: 6, tarih: '2026-12-05', kartId: '', dugun: true }];
  const A = analyze(recs, null, today);
  const salon = A.plans.find(p => p.rec.id === 'a2');
  approx(salon.avail, 282000, 'Salon günü Bonus kullanılabilir (Kasım ekstresi ödenmiş)');
  assert.equal(salon.shortfall, 0);
  const beyaz = A.plans.find(p => p.rec.id === 'a3');
  assert.equal(beyaz.cardId, 'k2', 'beyaz eşya World kartına önerilmeli');
  approx(beyaz.avail, 150000, 'World kullanılabilir');
  approx(beyaz.shortfall, 10000, 'World limit açığı');
  // Ocak'ta Bonus ekstresi: telefon 6.000 + salon 26.667
  const jan = A.cards.find(c => c.rec.id === 'k1').stmts.find(s => s.S === '2027-01');
  approx(jan.stmt, 32667, 'Bonus Ocak ekstresi');
  assert.equal(jan.due, '2027-01-12');
  // Aralık nakit akışında World'e beyaz eşyanın ilk taksiti (kesim 12'den önce alındığı için Aralık ekstresinde)
  const dec = A.months.find(m => m.key === '2026-12');
  approx(dec.out.kart, 6000 + 26667, 'Aralık kart ödemeleri');
}

// 3) Deneme: hangi karta sığar
{
  const p = tryPurchase(base, null, today, { tutar: 100000, taksit: 3, tarih: '2026-11-10' });
  assert.equal(p.options[0].cardId, 'k1');
  assert.ok(p.options.every(o => typeof o.avail === 'number'));
}

// 4) Asgari ödeme planında borç uzar ve faiz biner
{
  const recs = [{ id: 'k', tur: 'kart', ad: 'K', limit: 60000, donemBorcu: 50000, sonOdemeTarihi: '2026-11-15', odemePlani: 'asgari' }];
  const A = analyze(recs, null, today);
  const c = A.cards[0];
  approx(c.stmts[0].pay, 10000, 'asgari %20');
  assert.ok(c.stmts[1].stmt > 40000, 'ödenmeyen kısma faiz binmeli');
  assert.ok(A.totals.interest12 > 0);
}

// 5) Kredi taksiti (KKDF + BSMV dahil)
approx(loanInstallment(100000, 3.49, 12, null), 10990, '100 bin, 12 ay, %3,49');

console.log('Tüm testler geçti');
