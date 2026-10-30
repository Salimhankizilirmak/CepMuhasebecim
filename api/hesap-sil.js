import { env, send, getUser } from './_lib.js';

// Kullanıcının kendi hesabını ve (cascade ile) tüm verilerini kalıcı olarak siler.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { hata: 'Yalnızca POST' });
  const user = await getUser(req).catch(() => null);
  if (!user) return send(res, 401, { hata: 'Oturumun kapanmış, tekrar giriş yap.' });
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${env('SUPABASE_URL').replace(/\/$/, '')}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
    method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!r.ok) return send(res, 502, { hata: 'Hesap silinemedi, tekrar dene.' });
  send(res, 200, { tamam: true });
}
