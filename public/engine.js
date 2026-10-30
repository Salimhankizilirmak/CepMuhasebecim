// Cep Muhasebecim hesap motoru: kart ekstreleri, limitler, taksitler, nakit akışı.
// Saf fonksiyonlar; tarayıcıda ve Node'da (test) aynı şekilde çalışır.

export const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const AYK = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/* ---------- Tarih ---------- */
export const pad = n => String(n).padStart(2, '0');
export const validMonth = k => /^\d{4}-\d{2}$/.test(k || '');
export const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
export const monthOf = iso => iso.slice(0, 7);
export const dayOf = iso => +iso.slice(8, 10);
export function addMonths(key, n) {
  let [y, m] = key.split('-').map(Number);
  m = m - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y + '-' + pad(m + 1);
}
export function monthDiff(a, b) {
  const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
export function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
export const dayIn = (key, day) => key + '-' + pad(Math.min(Math.max(1, Math.round(day) || 1), daysInMonth(key)));
export const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const monthLabel = k => { const [y, m] = k.split('-').map(Number); return AY[m - 1] + ' ' + y; };
export const monthShort = k => { const [y, m] = k.split('-').map(Number); return AYK[m - 1] + ' ' + String(y).slice(2); };
export const dateLabel = iso => validDate(iso) ? dayOf(iso) + ' ' + AY[+iso.slice(5, 7) - 1] + ' ' + iso.slice(0, 4) : '';
export const dateShort = iso => validDate(iso) ? dayOf(iso) + ' ' + AYK[+iso.slice(5, 7) - 1] : '';

/* ---------- Sayı ---------- */
export const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const EPS = 0.5;

/* ---------- Oranlar ---------- */
export const DEFAULT_RATES = {
  updated: '2026-10-30', policy: 36,
  kartTiers: [{ upTo: 30000, akdi: 3.25, gecikme: 3.55 }, { upTo: 180000, akdi: 3.75, gecikme: 4.05 }, { upTo: null, akdi: 4.25, gecikme: 4.55 }],
  kmh: { akdi: 4.25, gecikme: 4.55 }, asgari: { esik: 100000, dusuk: 20, yuksek: 40 },
  ihtiyac: { min: 2.79, tipik: 3.49, max: 5.49 }, yasal: 31, vergi: { kkdf: 15, bsmv: 15 }, note: '', sources: []
};
export function normRates(r) {
  const d = DEFAULT_RATES;
  return {
    ...d, ...(r || {}),
    kartTiers: Array.isArray(r?.kartTiers) && r.kartTiers.length ? r.kartTiers : d.kartTiers,
    kmh: { ...d.kmh, ...(r?.kmh || {}) }, asgari: { ...d.asgari, ...(r?.asgari || {}) },
    ihtiyac: { ...d.ihtiyac, ...(r?.ihtiyac || {}) }, vergi: { ...d.vergi, ...(r?.vergi || {}) },
    sources: Array.isArray(r?.sources) ? r.sources : []
  };
}
export const taxMul = R => 1 + (num(R.vergi.kkdf) + num(R.vergi.bsmv)) / 100;
export function kartTier(R, bal) {
  for (const t of R.kartTiers) if (t.upTo == null || bal < t.upTo) return t;
  return R.kartTiers[R.kartTiers.length - 1];
}

/* ---------- Kart ayarları ---------- */
export function cardCfg(c, today) {
  const due0 = validDate(c.sonOdemeTarihi) ? c.sonOdemeTarihi : null;
  const dueDay = num(c.sonOdemeGunu) || (due0 ? dayOf(due0) : 10);
  let cutDay = num(c.kesimGunu);
  if (!cutDay) { cutDay = dueDay - 10; if (cutDay <= 0) cutDay += 30; }
  const sameMonth = dueDay > cutDay;
  const dueMonthOfStmt = S => sameMonth ? S : addMonths(S, 1);
  const stmtOfDueMonth = M => sameMonth ? M : addMonths(M, -1);
  const firstStmt = iso => dayOf(iso) <= cutDay ? monthOf(iso) : addMonths(monthOf(iso), 1);
  let S0;
  if (due0) S0 = stmtOfDueMonth(monthOf(due0));
  else { const cur = monthOf(today); S0 = stmtOfDueMonth(dayOf(today) <= dueDay ? cur : addMonths(cur, 1)); }
  return {
    dueDay, cutDay, S0, B0: Math.max(0, num(c.donemBorcu)), limit: Math.max(0, num(c.limit)),
    plan: c.odemePlani || 'tam', sabit: num(c.sabitOdeme), harcama: Math.max(0, num(c.aylikHarcama)),
    dueOf: S => dayIn(dueMonthOfStmt(S), dueDay), cutOf: S => dayIn(S, cutDay), firstStmt
  };
}

/* Bir alışverişin karttaki taksit planı */
function installmentPlan(p, cfg) {
  const A = Math.max(0, num(p.tutar) - Math.min(num(p.pesinat), num(p.tutar)));
  const n = Math.max(1, Math.round(num(p.taksit)) || 1);
  return { A, n, per: A / n, F: cfg.firstStmt(p.tarih) };
}

/* Kart ekstre simülasyonu: S0'dan itibaren H ekstre */
function simCard(c, cfg, purchases, R, H) {
  const tax = taxMul(R);
  const plans = purchases.map(p => ({ p, ...installmentPlan(p, cfg) }));
  const out = [];
  let carry = 0;
  for (let i = 0; i < H; i++) {
    const S = addMonths(cfg.S0, i);
    let inst = 0;
    const items = [];
    if (i > 0) for (const q of plans) {
      const k = monthDiff(q.F, S);
      if (k >= 0 && k < q.n && q.per > 0) { inst += q.per; items.push({ p: q.p, k: k + 1, n: q.n, per: q.per }); }
    }
    const stmt = i === 0 ? cfg.B0 : carry + inst + cfg.harcama;
    const minPct = (cfg.limit > num(R.asgari.esik) ? num(R.asgari.yuksek) : num(R.asgari.dusuk)) / 100;
    const min = stmt * minPct;
    let pay = cfg.plan === 'asgari' ? min : cfg.plan === 'sabit' ? Math.max(cfg.sabit, min) : stmt;
    if (pay > stmt) pay = stmt;
    const unpaid = stmt - pay;
    const tier = kartTier(R, stmt);
    const interest = unpaid > EPS ? unpaid * num(tier.akdi) / 100 * tax : 0;
    carry = unpaid > EPS ? unpaid + interest : 0;
    out.push({ S, cut: cfg.cutOf(S), due: cfg.dueOf(S), stmt, inst, items, min, pay, unpaid, interest, rate: num(tier.akdi), shortPlan: cfg.plan === 'sabit' && cfg.sabit > 0 && cfg.sabit < min });
  }
  return { out, plans };
}

/* T tarihinde kartın limit kullanımı. include(p) hangi alışverişlerin o tarihte yapılmış sayılacağını söyler. */
function usageAt(T, cfg, sim, purchases, include) {
  let k = -1;
  for (let i = 0; i < sim.length; i++) { if (i === 0 || sim[i].cut <= T) k = i; else break; }
  const s = sim[k];
  const billed = T < s.due ? s.stmt : s.unpaid;
  let unbilled = 0;
  for (const p of purchases) {
    if (!include(p)) continue;
    const q = installmentPlan(p, cfg);
    for (let j = 0; j < q.n; j++) if (monthDiff(s.S, addMonths(q.F, j)) > 0) unbilled += q.per;
  }
  const usage = billed + unbilled + cfg.harcama;
  return { usage, billed, unbilled, avail: cfg.limit - usage, S: s.S };
}

/* ---------- Ana analiz ---------- */
export function analyze(recs, Rin, today, opts = {}) {
  const R = normRates(Rin);
  const H = opts.months || 24, LONG = 120;
  const CUR = monthOf(today);
  const byTur = t => recs.filter(r => r.tur === t);
  const cards = byTur('kart'), kredis = byTur('kredi'), kmhs = byTur('kmh'), sahis = byTur('sahis');
  const gelirs = byTur('gelir'), giders = byTur('gider');
  const shops = byTur('alisveris').filter(p => validDate(p.tarih) && num(p.tutar) > 0)
    .sort((a, b) => a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : String(a.id) < String(b.id) ? -1 : 1);
  shops.forEach((p, i) => { p._o = i; });
  const cardIds = new Set(cards.map(c => c.id));
  const cfgs = Object.fromEntries(cards.map(c => [c.id, cardCfg(c, today)]));

  // Kartı seçilmemiş, nakit olmayan alışverişleri sırayla en uygun karta yerleştir (sanal atama)
  const assign = {};
  shops.forEach(p => { if (p.kartId && cardIds.has(p.kartId)) assign[p.id] = p.kartId; });
  const onCard = (cid, upto) => shops.filter(p => assign[p.id] === cid && (!upto || upto(p)));
  const before = p => q => q.id !== p.id && q._o < p._o;
  const availFor = (cid, p) => {
    const cfg = cfgs[cid], list = onCard(cid, before(p));
    const sim = simCard(null, cfg, list, R, Math.max(6, monthDiff(cfg.S0, monthOf(p.tarih)) + 3)).out;
    return usageAt(p.tarih, cfg, sim, list, () => true);
  };
  const plans = [];
  for (const p of shops) {
    if (p.nakit) continue;
    const need = installmentPlan(p, { firstStmt: () => monthOf(p.tarih) }).A;
    const options = cards.map(c => ({ cardId: c.id, ...availFor(c.id, p) })).sort((a, b) => b.avail - a.avail);
    let chosen = assign[p.id], suggested = false;
    if (!chosen && options.length) {
      chosen = (options.find(o => o.avail >= need) || options[0]).cardId;
      assign[p.id] = chosen; suggested = true;
    }
    const mine = options.find(o => o.cardId === chosen);
    const avail = mine ? mine.avail : 0;
    if (p.tarih >= today) plans.push({ rec: p, need, cardId: chosen || null, suggested, avail, shortfall: chosen ? Math.max(0, need - Math.max(0, avail)) : need, options });
  }

  // Kart simülasyonları
  const cardOut = cards.map(c => {
    const cfg = cfgs[c.id], list = onCard(c.id);
    const n = Math.max(LONG, monthDiff(cfg.S0, CUR) + LONG);
    const { out } = simCard(c, cfg, list, R, n);
    const now = usageAt(today, cfg, out, list, p => p.tarih <= today);
    // Her son ödeme gününde, ödeme yapıldıktan sonraki kullanılabilir limit
    const timeline = out.filter(s => s.due >= today).slice(0, 8).map(s => {
      const u = usageAt(s.due, cfg, out, list, p => p.tarih <= s.due);
      return { date: s.due, pay: s.pay, before: cfg.limit - (s.stmt + u.unbilled + cfg.harcama), after: u.avail };
    });
    let last = -1; out.forEach((s, i) => { if (s.pay > EPS) last = i; });
    const stuck = last === out.length - 1 && out[out.length - 1].unpaid > EPS;
    // Taksitli işlemler: bugüne kadar ekstreye yansımamış taksit sayısı
    const remainingInst = list.map(p => {
      const q = installmentPlan(p, cfg);
      let kalan = 0;
      for (let j = 0; j < q.n; j++) if (monthDiff(now.S, addMonths(q.F, j)) > 0) kalan++;
      return { p, ...q, kalan, last: cfg.dueOf(addMonths(q.F, q.n - 1)), future: p.tarih > today };
    });
    return { rec: c, cfg, stmts: out, now, timeline, stuck, payoff: last >= 0 ? out[last].due : null, purchases: list, remainingInst };
  });

  // Aylık nakit akışı
  const tax = taxMul(R);
  const kmhState = Object.fromEntries(kmhs.map(k => [k.id, Math.max(0, num(k.bakiye))]));
  const months = [];
  const span = Math.max(H, LONG);
  for (let m = 0; m < span; m++) {
    const key = addMonths(CUR, m);
    const ev = [];
    for (const co of cardOut) for (const s of co.stmts) if (monthOf(s.due) === key && s.pay > EPS) {
      ev.push({ date: s.due, g: 'kart', rec: co.rec, amount: s.pay, stmt: s.stmt, min: s.min, interest: s.interest, inst: s.inst, harcama: co.cfg.harcama, shortPlan: s.shortPlan });
    }
    for (const r of kredis) {
      const n = Math.round(num(r.kalanTaksit)), d = monthDiff(validMonth(r.ilkAy) ? r.ilkAy : CUR, key);
      if (d >= 0 && d < n) ev.push({ date: dayIn(key, num(r.odemeGunu) || 1), g: 'kredi', rec: r, amount: num(r.taksitTutari), seq: (d + 1) + '/' + n });
    }
    for (const r of kmhs) {
      const b = kmhState[r.id];
      if (b > EPS) {
        const interest = b * num(R.kmh.akdi) / 100 * tax, planned = num(r.aylikOdeme);
        const pay = planned > 0 ? Math.min(planned, b + interest) : interest;
        kmhState[r.id] = b + interest - pay;
        ev.push({ date: dayIn(key, num(r.faizGunu) || 1), g: 'kmh', rec: r, amount: pay, interest, balance: b });
      }
    }
    for (const r of sahis) {
      const n = Math.max(1, Math.round(num(r.kacAy)) || 1), d = monthDiff(validMonth(r.ilkAy) ? r.ilkAy : CUR, key);
      if (d >= 0 && d < n) ev.push({ date: dayIn(key, num(r.gun) || 1), g: 'sahis', rec: r, amount: num(r.tutar) / n, seq: n > 1 ? (d + 1) + '/' + n : '' });
    }
    for (const r of giders) ev.push({ date: dayIn(key, num(r.gun) || 1), g: 'gider', rec: r, amount: num(r.tutar) });
    for (const p of shops) {
      if (monthOf(p.tarih) !== key) continue;
      const pes = Math.min(num(p.pesinat), num(p.tutar));
      if (p.nakit) ev.push({ date: p.tarih, g: 'nakit', rec: p, amount: num(p.tutar) });
      else if (pes > 0) ev.push({ date: p.tarih, g: 'nakit', rec: p, amount: pes, label: 'Peşinat' });
    }
    for (const r of gelirs) {
      let hit;
      if (r.siklik === 'tek') hit = r.ay === key;
      else hit = (!validMonth(r.ay) || key >= r.ay) && (!validMonth(r.bitisAy) || key <= r.bitisAy);
      if (hit) ev.push({ date: dayIn(key, num(r.gun) || 1), g: 'gelir', rec: r, amount: num(r.tutar), expected: r.durum === 'beklenen' });
    }
    ev.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    const sum = g => ev.filter(e => e.g === g).reduce((s, e) => s + e.amount, 0);
    const incomeSure = ev.filter(e => e.g === 'gelir' && !e.expected).reduce((s, e) => s + e.amount, 0);
    const incomeExp = ev.filter(e => e.g === 'gelir' && e.expected).reduce((s, e) => s + e.amount, 0);
    const out = { kart: sum('kart'), kredi: sum('kredi'), kmh: sum('kmh'), sahis: sum('sahis'), gider: sum('gider'), nakit: sum('nakit') };
    const dugun = ev.filter(e => e.rec.dugun && e.g === 'nakit').reduce((s, e) => s + e.amount, 0)
      + cardOut.reduce((s, co) => s + co.stmts.filter(x => monthOf(x.due) === key).reduce((t, x) => t + x.items.filter(it => it.p.dugun).reduce((u, it) => u + it.per, 0), 0), 0);
    const interest = ev.reduce((s, e) => s + (e.interest || 0), 0);
    months.push({ key, ev, incomeSure, incomeExp, out, total: Object.values(out).reduce((a, b) => a + b, 0), dugun, interest });
  }

  // Toplam borç (bugün)
  const kmhNow = kmhs.reduce((s, r) => s + num(r.bakiye), 0);
  const krediNow = kredis.reduce((s, r) => {
    const k = Math.max(0, Math.round(num(r.kalanTaksit)) - Math.max(0, monthDiff(validMonth(r.ilkAy) ? r.ilkAy : CUR, CUR)));
    const inst = num(r.taksitTutari), i = num(r.faiz) / 100 * tax;
    return s + (i > 0 ? inst * (1 - Math.pow(1 + i, -k)) / i : inst * k);
  }, 0);
  const sahisNow = sahis.reduce((s, r) => {
    const n = Math.max(1, Math.round(num(r.kacAy)) || 1), passed = Math.max(0, monthDiff(validMonth(r.ilkAy) ? r.ilkAy : CUR, CUR));
    return s + num(r.tutar) / n * Math.max(0, n - passed);
  }, 0);
  const kartNow = cardOut.reduce((s, co) => s + co.now.billed + co.now.unbilled, 0);
  const debtNow = kartNow + kmhNow + krediNow + sahisNow;
  const interest12 = months.slice(0, 12).reduce((s, m) => s + m.interest, 0);
  const stuckKmh = kmhs.filter(r => kmhState[r.id] > EPS && num(r.aylikOdeme) <= 0);
  const stuck = [...cardOut.filter(c => c.stuck).map(c => c.rec), ...stuckKmh];
  let freeIdx = -1;
  months.forEach((m, i) => {
    if (m.ev.some(e => e.g === 'kart' ? e.stmt - e.harcama > EPS : ['kredi', 'kmh', 'sahis'].includes(e.g) && e.amount > EPS)) freeIdx = i;
  });
  const debtFree = stuck.length ? null : freeIdx < 0 ? CUR : addMonths(CUR, freeIdx);

  const limitTotal = cardOut.reduce((s, c) => s + c.cfg.limit, 0);
  const usedTotal = cardOut.reduce((s, c) => s + c.now.usage, 0);
  const shortfallTotal = plans.reduce((s, p) => s + p.shortfall, 0);

  return {
    R, CUR, today, cards: cardOut, months: months.slice(0, H), plans, assign,
    totals: { debtNow, kartNow, kmhNow, krediNow, sahisNow, interest12, debtFree, stuck, limitTotal, usedTotal, availTotal: limitTotal - usedTotal, shortfallTotal }
  };
}

/* Bir alışveriş denemesi: kaydetmeden hangi kartta yer var? */
export function tryPurchase(recs, R, today, draft) {
  const fake = { id: '__deneme__', tur: 'alisveris', ad: 'Deneme', ...draft, kartId: draft.kartId || '' };
  const A = analyze([...recs, fake], R, today, { months: 1 });
  return A.plans.find(p => p.rec.id === '__deneme__');
}

/* Kredi taksiti (KKDF + BSMV dahil) */
export function loanInstallment(principal, monthlyRatePct, n, R) {
  const i = num(monthlyRatePct) / 100 * taxMul(normRates(R));
  return i > 0 ? principal * i / (1 - Math.pow(1 + i, -n)) : principal / n;
}
