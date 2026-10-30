// Sunucu tarafı ortak yardımcılar (Vercel fonksiyonları). "_" ile başladığı için kendi başına bir adres olmaz.

export const env = k => (process.env[k] || '').trim();
const SUPABASE_URL = () => env('SUPABASE_URL').replace(/\/$/, '');

export function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

/* İstekteki Supabase oturumunu doğrular, kullanıcıyı döndürür (yoksa null). */
export async function getUser(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || !SUPABASE_URL()) return null;
  const r = await fetch(`${SUPABASE_URL()}/auth/v1/user`, { headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  return r.json();
}

/* Service role ile PostgREST çağrısı (RLS'i atlar; yalnızca sunucuda kullanılır). */
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${SUPABASE_URL()}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Veritabanı hatası (${r.status}): ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

export async function isAdmin(user) {
  const rows = await db(`yoneticiler?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`);
  return rows.length > 0;
}
export async function isAllowed(user) {
  if (await isAdmin(user)) return true;
  const rows = await db(`izinli_eposta?select=email&email=eq.${encodeURIComponent((user.email || '').toLowerCase())}`);
  return rows.length > 0;
}

export const istanbulDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());

/* Gemini generateContent çağrısı. search: Google Arama ile temellendirme. json: JSON çıktısı iste. */
export async function gemini({ system, contents, search = false, json = false, temperature = 0.3 }) {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY tanımlı değil');
  const models = [env('GEMINI_MODEL') || 'gemini-3.8-flash', 'gemini-flash-latest'];
  const body = {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents,
    ...(search ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) }
  };
  let last;
  for (const model of [...new Set(models)]) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const cand = j.candidates?.[0];
      const text = (cand?.content?.parts || []).map(p => p.text || '').join('');
      const sources = (cand?.groundingMetadata?.groundingChunks || []).map(c => c.web).filter(Boolean).map(w => ({ t: w.title || w.uri, u: w.uri }));
      return { text, sources, model };
    }
    last = new Error(`Gemini hatası (${r.status}): ${j.error?.message || 'bilinmiyor'}`);
    if (r.status !== 404 && r.status !== 400) break;
  }
  throw last;
}

/* Metindeki ilk JSON nesnesini ayıkla */
export function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch {} }
  return null;
}
