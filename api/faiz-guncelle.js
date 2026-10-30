import { env, send, getUser, isAdmin, db, gemini, extractJson, istanbulDate } from './_lib.js';

// Faiz oranlarını günceller.
// - Vercel Cron her ayın 2'sinde çağırır (Authorization: Bearer CRON_SECRET).
// - Yönetici, uygulamadaki "İnternetten şimdi güncelle" düğmesiyle de çağırabilir.
// Kaynaklar: TCMB EVDS (resmî seri; EVDS_API_KEY varsa) + Gemini'nin Google Arama ile bulduğu resmî duyurular.

const ddmmyyyy = d => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

/* TCMB EVDS'den bir serinin son değerini çeker. Anahtar yoksa ya da seri bulunamazsa null döner. */
async function evdsLast(series) {
  const key = env('EVDS_API_KEY');
  if (!key || !series) return null;
  const end = new Date(), start = new Date(Date.now() - 120 * 864e5);
  const url = `https://evds2.tcmb.gov.tr/service/evds/series=${encodeURIComponent(series)}&startDate=${ddmmyyyy(start)}&endDate=${ddmmyyyy(end)}&type=json`;
  try {
    const r = await fetch(url, { headers: { key } });
    if (!r.ok) return null;
    const j = await r.json();
    const field = series.replace(/\./g, '_');
    const items = (j.items || []).filter(it => it[field] != null && it[field] !== '');
    const last = items[items.length - 1];
    return last ? { value: Number(String(last[field]).replace(',', '.')), date: last.Tarih, series } : null;
  } catch { return null; }
}

const inRange = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;

/* Gemini'den gelen değerleri doğrula; şüpheli olanı eski değerle değiştir */
function merge(cur, found) {
  const next = JSON.parse(JSON.stringify(cur));
  const changed = [];
  const set = (path, v, lo, hi, label) => {
    if (!inRange(v, lo, hi)) return;
    const keys = path.split('.'); let o = next;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]] ??= {};
    const k = keys[keys.length - 1];
    if (Math.abs((o[k] ?? NaN) - v) > 1e-9 || o[k] == null) { if (o[k] != null) changed.push(`${label} ${o[k]} → ${v}`); else changed.push(`${label} ${v}`); o[k] = v; }
  };
  const t = Array.isArray(found.kartTiers) ? found.kartTiers : null;
  if (t && t.length >= 2 && t.length <= 5 && t.every((x, i) => inRange(x.akdi, 0.5, 15) && inRange(x.gecikme, 0.5, 16) && (i === t.length - 1 ? x.upTo == null : inRange(x.upTo, 1000, 10000000)))) {
    const norm = t.map(x => ({ upTo: x.upTo == null ? null : Number(x.upTo), akdi: Number(x.akdi), gecikme: Number(x.gecikme) }));
    if (JSON.stringify(norm) !== JSON.stringify(next.kartTiers)) { changed.push('kart faizleri ' + norm.map(x => '%' + x.akdi).join('/')); next.kartTiers = norm; }
  }
  set('kmh.akdi', found.kmh?.akdi, 0.5, 15, 'KMH akdi');
  set('kmh.gecikme', found.kmh?.gecikme, 0.5, 16, 'KMH gecikme');
  set('policy', found.policy, 1, 100, 'politika faizi');
  set('yasal', found.yasal, 1, 100, 'yasal faiz');
  set('asgari.esik', found.asgari?.esik, 1000, 10000000, 'asgari eşik');
  set('asgari.dusuk', found.asgari?.dusuk, 1, 100, 'asgari (düşük)');
  set('asgari.yuksek', found.asgari?.yuksek, 1, 100, 'asgari (yüksek)');
  set('ihtiyac.min', found.ihtiyac?.min, 0.1, 15, 'ihtiyaç kredisi min');
  set('ihtiyac.tipik', found.ihtiyac?.tipik, 0.1, 15, 'ihtiyaç kredisi tipik');
  set('ihtiyac.max', found.ihtiyac?.max, 0.1, 20, 'ihtiyaç kredisi max');
  set('vergi.kkdf', found.vergi?.kkdf, 0, 50, 'KKDF');
  set('vergi.bsmv', found.vergi?.bsmv, 0, 50, 'BSMV');
  return { next, changed };
}

export default async function handler(req, res) {
  // Yetki: cron gizli anahtarı ya da yönetici oturumu
  const auth = req.headers.authorization || '';
  const cronOk = env('CRON_SECRET') && auth === `Bearer ${env('CRON_SECRET')}`;
  if (!cronOk) {
    const user = await getUser(req).catch(() => null);
    if (!user || !(await isAdmin(user))) return send(res, 401, { hata: 'Yetkisiz' });
  }
  if (!env('GEMINI_API_KEY')) return send(res, 503, { hata: 'GEMINI_API_KEY tanımlı değil' });

  const rows = await db('oranlar?select=veri&id=eq.1');
  const cur = rows[0]?.veri || {};
  const today = istanbulDate();

  const evds = await evdsLast(env('EVDS_IHTIYAC_SERIES') || 'TP.KTF10');
  const evdsNote = evds && inRange(evds.value, 1, 300)
    ? `TCMB EVDS ${evds.series} serisine göre bankaların ihtiyaç kredisine uyguladığı ağırlıklı ortalama faiz ${evds.date} itibarıyla yıllık %${evds.value} (aylık ≈ %${(evds.value / 12).toFixed(2)}).`
    : '';

  const prompt = `Bugün ${today}. Türkiye'deki şu güncel oranları Google'da ara ve bul. Öncelik: tcmb.gov.tr, bddk.org.tr, resmigazete.gov.tr; bunlar yoksa birden fazla güvenilir haber sitesinin tutarlı verdiği değer.
1) TCMB'nin bu ay için ilan ettiği "kredi kartı işlemlerinde uygulanacak azami faiz oranları": dönem borcu kademelerine göre aylık azami akdi ve gecikme faizi (kademe üst sınırları TL), ayrıca nakit avans / kredili mevduat hesabı (KMH) aylık azami akdi ve gecikme faizi.
2) TCMB politika faizi (bir hafta vadeli repo, yıllık %) ve son PPK karar tarihi.
3) BDDK kredi kartı asgari ödeme oranları ve limit eşiği (örn. limit X TL ve altı %20, üstü %40).
4) 3095 sayılı Kanun'a göre güncel yıllık kanuni (yasal) faiz oranı.
5) Bankaların ilan ettiği güncel aylık ihtiyaç kredisi faiz aralığı (en düşük, tipik, en yüksek; aylık %).
6) Tüketici kredilerinde KKDF ve BSMV oranları (%).
${evdsNote ? 'Ek bilgi: ' + evdsNote : ''}
Emin olamadığın bir değeri null yaz, tahmin etme. Yanıtın SADECE şu JSON olsun (yüzdeler düz sayı, örn. 3.25):
{"kartTiers":[{"upTo":30000,"akdi":0,"gecikme":0},{"upTo":180000,"akdi":0,"gecikme":0},{"upTo":null,"akdi":0,"gecikme":0}],"kmh":{"akdi":0,"gecikme":0},"policy":0,"ppkTarihi":"YYYY-MM-DD","asgari":{"esik":0,"dusuk":0,"yuksek":0},"yasal":0,"ihtiyac":{"min":0,"tipik":0,"max":0},"vergi":{"kkdf":0,"bsmv":0},"aciklama":"hangi ay/karar için geçerli olduğunu anlatan tek cümle"}`;

  let found = null, sources = [], model = '';
  try {
    const r = await gemini({ contents: [{ role: 'user', parts: [{ text: prompt }] }], search: true, temperature: 0 });
    found = extractJson(r.text); sources = r.sources; model = r.model;
  } catch (e) {
    console.error(e);
    return send(res, 502, { hata: 'Gemini ile oranlar alınamadı: ' + e.message });
  }
  if (!found) return send(res, 502, { hata: 'Gemini geçerli bir cevap vermedi; oranlar değiştirilmedi.' });

  const { next, changed } = merge(cur, found);
  next.updated = today;
  next.note = [found.aciklama, evdsNote, changed.length ? '' : 'Son kontrolde değişiklik bulunmadı.'].filter(Boolean).join(' ').slice(0, 600);
  const seen = new Set();
  next.sources = [...sources, ...(evdsNote ? [{ t: 'TCMB EVDS', u: 'https://evds2.tcmb.gov.tr/' }] : [])]
    .filter(s => s.u && !seen.has(s.u) && seen.add(s.u)).slice(0, 8);
  await db('oranlar?on_conflict=id', { method: 'POST', body: { id: 1, veri: next, guncellendi: new Date().toISOString() }, prefer: 'resolution=merge-duplicates' });
  send(res, 200, { tamam: true, degisen: changed, model, evds: !!evdsNote });
}
