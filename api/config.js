import { env, send } from './_lib.js';

// Tarayıcının Supabase'e bağlanması için gereken herkese açık ayarlar.
// Anon anahtar tasarım gereği herkese açıktır; verileri satır düzeyi güvenlik (RLS) korur.
export default function handler(req, res) {
  send(res, 200, {
    supabaseUrl: env('SUPABASE_URL'),
    supabaseAnonKey: env('SUPABASE_ANON_KEY'),
    ai: !!env('GEMINI_API_KEY')
  });
}
