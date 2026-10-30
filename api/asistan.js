import { env, send, readJson, getUser, isAllowed, db, gemini, extractJson, istanbulDate } from './_lib.js';

const ALANLAR = `kart: ad, banka, limit, donemBorcu (ödenmemiş son ekstre), sonOdemeTarihi (YYYY-MM-DD), kesimGunu, odemePlani (tam|asgari|sabit), sabitOdeme, aylikHarcama
alisveris (karta taksitli ya da peşin alışveriş): ad, tutar, taksit, tarih (YYYY-MM-DD), kartId (kartın id'si; bilinmiyorsa boş, nakitse "__nakit"), pesinat, dugun ("1" düğün masrafıysa)
kredi: ad, banka, taksitTutari, kalanTaksit, odemeGunu, ilkAy (YYYY-MM), faiz (aylık %)
kmh: ad, banka, limit, bakiye, faizGunu, aylikOdeme
sahis (kişisel borç): ad, tutar (toplam), kacAy, ilkAy (YYYY-MM), gun
gelir: ad, tutar, siklik (aylik|tek), ay (YYYY-MM), bitisAy, gun, durum (kesin|beklenen), dugun ("1" ise)
gider: ad, tutar, kategori (kira|fatura|market|ulasim|aile|diger), gun`;

const SYSTEM = `Sen "Cep Muhasebecim" uygulamasının kişisel mali asistanısın. Kullanıcı Türkiye'de yaşıyor; Türkçe, samimi ve net konuş.
Görevin: kredi kartı limitlerini, ekstrelerini, taksitlerini, kredilerini ve düğün masraflarını takip etmesine; hangi gün hangi bankaya ne ödeyeceğini görmesine; limit yetmediğinde seçenekleri (karta önceden ödeme yapıp limit açmak, alışverişi kartlara bölmek, borç bulmak) değerlendirmesine yardım etmek.
Kurallar:
- Cevabını yalnızca sana verilen VERİLER bölümündeki rakamlara dayandır; rakam uydurma. Somut TL tutarları ve tarihler ver (örn. 12 Aralık'ta Bonus'a 26.667 TL).
- Kısa yaz: birkaç cümle ve gerekirse "- " ile başlayan maddeler. Tablo ve başlık kullanma.
- Borç önceliği: önce taksit ve asgari ödemeleri aksatma (gecikme faizi, kredi notu), sonra en yüksek faizli borca (genelde KMH ve kart borcu) fazla öde. Asgari ödemenin maliyetini rakamla göster.
- Lisanslı yatırım danışmanı değilsin; hisse, döviz, altın, kripto, fon önerme.
- Kullanıcı yeni bir kart, taksitli alışveriş, kredi, borç, gelir ya da gider söylerse "eylemler" listesine "ekle" eylemi koy. Var olan kaydı değiştirmek için "guncelle" eylemi koy (id VERİLER'deki KAYITLAR'dan). Kayıt silme eylemi yok. Kullanıcı eylemleri onaylamadan hiçbir şey kaydedilmez; cevapta "onaylarsan eklerim" de.
- Zorunlu bir rakam eksikse (tutar, limit gibi) eylem koyma, önce sor.
Kayıt alanları:
${ALANLAR}
Cevabı YALNIZCA şu biçimde JSON olarak ver:
{"cevap": "kullanıcıya gösterilecek metin", "eylemler": [{"islem": "ekle", "tur": "alisveris", "veri": {...}, "ozet": "tek cümle özet"}, {"islem": "guncelle", "id": "...", "veri": {...}, "ozet": "..."}]}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { hata: 'Yalnızca POST' });
  if (!env('GEMINI_API_KEY')) return send(res, 503, { hata: 'Asistan etkin değil.' });
  const user = await getUser(req).catch(() => null);
  if (!user) return send(res, 401, { hata: 'Oturumun kapanmış, tekrar giriş yap.' });
  if (!(await isAllowed(user))) return send(res, 403, { hata: 'Hesabın henüz onaylanmadı.' });

  // Günlük kullanım sınırı
  const limit = Number(env('AI_GUNLUK_LIMIT')) || 40;
  const gun = istanbulDate();
  const rows = await db(`ai_kullanim?select=adet&user_id=eq.${user.id}&gun=eq.${gun}`);
  const adet = rows[0]?.adet || 0;
  if (adet >= limit) return send(res, 429, { hata: `Bugünlük asistan hakkın doldu (${limit} soru). Yarın tekrar dene.` });
  await db('ai_kullanim?on_conflict=user_id,gun', { method: 'POST', body: { user_id: user.id, gun, adet: adet + 1 }, prefer: 'resolution=merge-duplicates' });

  const body = await readJson(req);
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-9)
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.slice(0, 4000) }] }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return send(res, 400, { hata: 'Mesaj boş.' });
  const context = String(body.context || '').slice(0, 60000);
  // Veriler ilk kullanıcı mesajının başına eklenir (geçmiş model mesajıyla başlıyorsa önüne yeni bir tur açılır)
  if (msgs[0].role === 'user') msgs[0] = { role: 'user', parts: [{ text: `VERİLER:\n${context}\n\n---\n${msgs[0].parts[0].text}` }] };
  else msgs.unshift({ role: 'user', parts: [{ text: `VERİLER:\n${context}` }] });

  try {
    const { text } = await gemini({ system: SYSTEM, contents: msgs, json: true, temperature: 0.4, timeoutMs: 20000 });
    const j = extractJson(text) || { cevap: text };
    send(res, 200, { cevap: String(j.cevap || ''), eylemler: Array.isArray(j.eylemler) ? j.eylemler.slice(0, 5) : [] });
  } catch (e) {
    send(res, 502, { hata: 'Asistan şu an cevap veremiyor. Biraz sonra tekrar dene.' });
    console.error(e);
  }
}
