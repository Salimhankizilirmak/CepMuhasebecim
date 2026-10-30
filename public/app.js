import {
  analyze, tryPurchase, loanInstallment, normRates, DEFAULT_RATES, num, pad, addMonths, monthDiff, monthOf, dayOf,
  validMonth, validDate, isoOf, monthLabel, monthShort, dateLabel, dateShort, AYK
} from './engine.js';

/* ---------- Biçimlendirme ---------- */
const fmtTL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
const fmtCompact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
const fmtPct = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const tl = v => fmtTL.format(Math.round(v || 0));
const pct = v => '%' + fmtPct.format(v || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const newId = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayISO = () => isoOf(new Date());
const $ = id => document.getElementById(id);
const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};
const TABS = [
  ['ozet', 'Özet', '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>'],
  ['kartlar', 'Kartlar', '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>'],
  ['butce', 'Bütçe', '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/><circle cx="16" cy="13.5" r="1.4"/>'],
  ['dugun', 'Düğün', '<circle cx="9" cy="14" r="5.5"/><circle cx="15" cy="14" r="5.5"/><path d="M10 4.5l2 2.5 2-2.5"/>'],
  ['asistan', 'Asistan', '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>']
];

/* ---------- Kayıt türleri ve formlar ---------- */
const TUR_AD = { kart: 'Kredi kartı', alisveris: 'Taksitli alışveriş', kredi: 'Banka kredisi', kmh: 'Ek hesap (KMH)', sahis: 'Kişisel borç', gelir: 'Gelir', gider: 'Sabit gider' };
const CAT = [['kira', 'Kira / aidat'], ['fatura', 'Fatura'], ['market', 'Market / mutfak'], ['ulasim', 'Ulaşım'], ['aile', 'Aile'], ['diger', 'Diğer']];
const CAT_AD = Object.fromEntries(CAT);
const FORMS = {
  kart: [
    { k: 'ad', l: 'Kart adı', t: 'text', ph: 'Örn. Bonus Platinum', req: true },
    { k: 'banka', l: 'Banka', t: 'text', ph: 'Örn. Garanti BBVA' },
    { k: 'limit', l: 'Kart limiti (₺)', t: 'num', req: true },
    { k: 'donemBorcu', l: 'Son ekstre borcu (₺)', t: 'num', hint: 'Henüz ödemediğin son ekstre tutarı. Ödediysen 0 yaz.' },
    { k: 'sonOdemeTarihi', l: 'Bu ekstrenin son ödeme tarihi', t: 'date', req: true },
    { k: 'kesimGunu', l: 'Hesap kesim günü', t: 'day', hint: 'Ekstrenin kesildiği gün. Bilmiyorsan boş bırak (son ödemeden 10 gün önce varsayılır).' },
    { k: 'odemePlani', l: 'Her ay nasıl ödüyorsun?', t: 'select', opts: [['tam', 'Ekstrenin tamamını'], ['asgari', 'Asgari tutarı'], ['sabit', 'Sabit bir tutar']] },
    { k: 'sabitOdeme', l: 'Sabit ödeme tutarı (₺)', t: 'num', hint: 'Yalnızca "Sabit bir tutar" seçtiysen' },
    { k: 'aylikHarcama', l: 'Taksitsiz aylık harcama tahmini (₺)', t: 'num', hint: 'Market, akaryakıt gibi her ay karta yazdığın tutar' }
  ],
  alisveris: [
    { k: 'ad', l: 'Ne aldın / alacaksın?', t: 'text', ph: 'Örn. Düğün salonu', req: true },
    { k: 'tutar', l: 'Toplam tutar (₺)', t: 'num', req: true },
    { k: 'taksit', l: 'Taksit sayısı', t: 'int', hint: '1 = tek çekim' },
    { k: 'tarih', l: 'Alışveriş / ödeme tarihi', t: 'date', req: true, hint: 'Geçmiş bir alışverişse ilk taksitin çekildiği tarih' },
    { k: 'kartId', l: 'Nasıl ödenecek?', t: 'cardsel' },
    { k: 'pesinat', l: 'Peşinat (₺)', t: 'num', hint: 'Peşin ödenen kısım. Kalanı karta taksitlenir.' },
    { k: 'dugun', l: 'Düğün masrafı mı?', t: 'select', opts: [['', 'Hayır'], ['1', 'Evet']] }
  ],
  kredi: [
    { k: 'ad', l: 'Kredi adı', t: 'text', ph: 'Örn. İhtiyaç kredisi', req: true },
    { k: 'banka', l: 'Banka', t: 'text' },
    { k: 'taksitTutari', l: 'Aylık taksit (₺)', t: 'num', req: true },
    { k: 'kalanTaksit', l: 'Kalan taksit sayısı', t: 'int', req: true },
    { k: 'odemeGunu', l: 'Taksit günü', t: 'day' },
    { k: 'ilkAy', l: 'Ödenmemiş ilk taksitin ayı', t: 'month' },
    { k: 'faiz', l: 'Aylık faiz (%)', t: 'num', hint: 'Kalan anaparayı hesaplamak için' }
  ],
  kmh: [
    { k: 'ad', l: 'Hesap adı', t: 'text', ph: 'Örn. Ziraat ek hesap', req: true },
    { k: 'banka', l: 'Banka', t: 'text' },
    { k: 'limit', l: 'Hesap limiti (₺)', t: 'num' },
    { k: 'bakiye', l: 'Kullanılan tutar (₺)', t: 'num', req: true },
    { k: 'faizGunu', l: 'Faiz tahakkuk günü', t: 'day' },
    { k: 'aylikOdeme', l: 'Her ay kapatacağın tutar (₺)', t: 'num', hint: 'Boş bırakırsan yalnızca faiz ödenir, borç azalmaz' }
  ],
  sahis: [
    { k: 'ad', l: 'Kime / ne için?', t: 'text', ph: 'Örn. Ahmet abi', req: true },
    { k: 'tutar', l: 'Toplam borç (₺)', t: 'num', req: true },
    { k: 'kacAy', l: 'Kaç ayda ödenecek?', t: 'int', hint: '1 = tek seferde' },
    { k: 'ilkAy', l: 'İlk ödeme ayı', t: 'month' },
    { k: 'gun', l: 'Ödeme günü', t: 'day' }
  ],
  gelir: [
    { k: 'ad', l: 'Gelir adı', t: 'text', ph: 'Örn. Maaş', req: true },
    { k: 'tutar', l: 'Tutar (₺)', t: 'num', req: true },
    { k: 'siklik', l: 'Sıklık', t: 'select', opts: [['aylik', 'Her ay'], ['tek', 'Tek sefer']] },
    { k: 'ay', l: 'Ay', t: 'month', hint: 'Tek seferse gelirin geleceği ay; her aysa başlangıç ayı (boş = şimdiden)' },
    { k: 'bitisAy', l: 'Bitiş ayı', t: 'month', hint: 'Bir gün bitecek aylık gelirler için' },
    { k: 'gun', l: 'Ayın kaçında', t: 'day' },
    { k: 'durum', l: 'Durum', t: 'select', opts: [['kesin', 'Kesin'], ['beklenen', 'Beklenen']] },
    { k: 'dugun', l: 'Düğünle ilgili mi?', t: 'select', opts: [['', 'Hayır'], ['1', 'Evet (takı, nikah parası)']] }
  ],
  gider: [
    { k: 'ad', l: 'Gider adı', t: 'text', ph: 'Örn. Kira', req: true },
    { k: 'tutar', l: 'Aylık tutar (₺)', t: 'num', req: true },
    { k: 'kategori', l: 'Kategori', t: 'select', opts: CAT },
    { k: 'gun', l: 'Ayın kaçında', t: 'day' }
  ]
};
const WEDDING_PRESETS = ['Düğün salonu', 'Beyaz eşya', 'Mobilya', 'Gelinlik', 'Damatlık', 'Takı / altın', 'Fotoğraf & video', 'Organizasyon', 'Nişan', 'Balayı'];

function cleanFields(tur, input) {
  const out = {};
  for (const f of FORMS[tur] || []) {
    if (!(f.k in input)) continue;
    const v = input[f.k];
    if (f.t === 'num') out[f.k] = Math.max(0, num(v));
    else if (f.t === 'int' || f.t === 'day') out[f.k] = Math.max(0, Math.round(num(v)));
    else if (f.t === 'month') { if (validMonth(String(v))) out[f.k] = String(v); else if (v === '') out[f.k] = ''; }
    else if (f.t === 'date') { if (validDate(String(v))) out[f.k] = String(v); }
    else if (f.t === 'select') { const s = v === true ? '1' : String(v ?? ''); if (f.opts.some(o => o[0] === s)) out[f.k] = s; }
    else if (f.t === 'cardsel') out[f.k] = String(v ?? '');
    else out[f.k] = String(v ?? '').slice(0, 80);
  }
  if (tur === 'alisveris' && 'kartId' in out) {
    if (out.kartId === '__nakit') { out.nakit = true; out.kartId = ''; }
    else { out.nakit = false; if (out.kartId && !S.recs.some(r => r.id === out.kartId && r.tur === 'kart')) out.kartId = ''; }
  }
  if ('dugun' in out) out.dugun = out.dugun === '1';
  return out;
}

/* ---------- Durum ---------- */
const S = {
  mode: 'loading', sb: null, user: null, cfg: null, allowed: false, admin: false,
  recs: [], rates: normRates(DEFAULT_RATES), tab: 'ozet', mi: null,
  chat: [], busy: false, installPrompt: null
};
const profile = () => S.recs.find(r => r.id === 'profil') || { id: 'profil', tur: 'profil' };
const paidDoc = key => S.recs.find(r => r.id === 'odendi-' + key);
const cardName = id => { const c = S.recs.find(r => r.id === id); return c ? c.ad : 'Kart'; };

/* ---------- Depolama ---------- */
const LS = 'cep-muhasebecim-yerel-v1';
const strip = rec => Object.fromEntries(Object.entries(rec).filter(([k]) => k !== 'id' && k !== 'tur' && !k.startsWith('_')));
const store = {
  async load() {
    if (S.mode === 'local') { try { return JSON.parse(localStorage.getItem(LS) || '[]'); } catch { return []; } }
    const { data, error } = await S.sb.from('kayitlar').select('id,tur,veri');
    if (error) throw error;
    return data.map(r => ({ ...r.veri, id: r.id, tur: r.tur }));
  },
  async save(rec) {
    if (S.mode === 'local') { localStorage.setItem(LS, JSON.stringify(S.recs.map(r => ({ id: r.id, tur: r.tur, ...strip(r) })))); return; }
    const { error } = await S.sb.from('kayitlar').upsert({ user_id: S.user.id, id: rec.id, tur: rec.tur, veri: strip(rec), guncellendi: new Date().toISOString() }, { onConflict: 'user_id,id' });
    if (error) throw error;
  },
  async remove(id) {
    if (S.mode === 'local') return this.save();
    const { error } = await S.sb.from('kayitlar').delete().eq('id', id);
    if (error) throw error;
  },
  async removeAll() {
    if (S.mode === 'local') { localStorage.removeItem(LS); return; }
    const { error } = await S.sb.from('kayitlar').delete().eq('user_id', S.user.id);
    if (error) throw error;
  }
};
async function saveRec(rec, silent) {
  rec = { ...rec, guncelleme: todayISO() };
  const i = S.recs.findIndex(r => r.id === rec.id);
  if (i >= 0) S.recs[i] = rec; else S.recs.push(rec);
  render();
  try { await store.save(rec); if (!silent) toast('Kaydedildi'); }
  catch (e) { toast('Kaydedilemedi: ' + (e.message || 'bağlantını kontrol et')); reload(); }
}
async function removeRec(id) {
  S.recs = S.recs.filter(r => r.id !== id);
  // Karta bağlı alışverişleri karttan ayır
  const orphans = S.recs.filter(r => r.tur === 'alisveris' && r.kartId === id);
  render();
  try { await store.remove(id); for (const o of orphans) await saveRec({ ...o, kartId: '' }, true); toast('Silindi'); }
  catch (e) { toast('Silinemedi: ' + (e.message || '')); reload(); }
}
async function reload() {
  try { S.recs = await store.load(); render(); } catch (e) { toast('Veriler yüklenemedi: ' + (e.message || '')); }
}
async function loadRates() {
  if (S.mode === 'local') return;
  const { data } = await S.sb.from('oranlar').select('veri,guncellendi').eq('id', 1).maybeSingle();
  if (data?.veri) S.rates = normRates(data.veri);
}

/* ---------- Açılış ---------- */
async function boot() {
  let cfg = null;
  try { const r = await fetch('/api/config', { cache: 'no-store' }); if (r.ok) cfg = await r.json(); } catch {}
  S.cfg = cfg || {};
  if (!cfg?.supabaseUrl || !cfg?.supabaseAnonKey || !window.supabase) {
    S.mode = 'local';
    S.recs = await store.load();
    shell(); render();
    return;
  }
  S.mode = 'cloud';
  S.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'cm-oturum' } });
  S.sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') { authView('yeni-sifre'); return; }
    if (ev === 'SIGNED_OUT') { S.user = null; S.recs = []; authView('giris'); }
    if (ev === 'SIGNED_IN' && session && (!S.user || S.user.id !== session.user.id)) afterLogin(session.user);
  });
  const { data } = await S.sb.auth.getSession();
  if (data.session) afterLogin(data.session.user); else authView('giris');
}
let loggingIn = false;
async function afterLogin(user) {
  if (loggingIn) return; loggingIn = true;
  S.user = user;
  $('root').innerHTML = '<div class="splash">Verilerin yükleniyor…</div>';
  try {
    const [{ data: ok }, { data: adm }] = await Promise.all([S.sb.rpc('izinli'), S.sb.rpc('yonetici')]);
    S.allowed = !!ok; S.admin = !!adm;
    if (!S.allowed) { pendingView(); return; }
    await Promise.all([loadRates(), (async () => { S.recs = await store.load(); })()]);
    shell(); render();
  } catch (e) {
    $('root').innerHTML = `<div class="auth"><div class="card"><h2>Bağlanılamadı</h2><p class="muted">${esc(e.message || 'Bilinmeyen hata')}</p><button class="btn" data-act="reload">Tekrar dene</button></div></div>`;
  } finally { loggingIn = false; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.mode === 'cloud' && S.allowed && $('view')) { reload(); loadRates(); } });

/* ---------- Giriş ekranları ---------- */
function authView(kind) {
  const titles = { giris: 'Giriş yap', kayit: 'Hesap oluştur', unuttum: 'Şifreni sıfırla', 'yeni-sifre': 'Yeni şifre belirle' };
  $('root').innerHTML = `<div class="auth">
    <div class="brand" style="font-size:1.6rem"><span class="brand-mark">₺</span>Cep Muhasebecim</div>
    <p class="lead">Kart limitlerin, taksitlerin, kredilerin ve düğün planın tek yerde. Verilerini yalnızca sen görürsün.</p>
    <form class="card form" id="auth-form" data-kind="${kind}">
      <h2>${titles[kind]}</h2>
      ${kind !== 'yeni-sifre' ? `<div class="field"><label for="a-email">E-posta</label><input id="a-email" name="email" type="email" autocomplete="email" required></div>` : ''}
      ${kind !== 'unuttum' ? `<div class="field"><label for="a-pass">${kind === 'yeni-sifre' ? 'Yeni şifre' : 'Şifre'}</label><input id="a-pass" name="password" type="password" minlength="8" autocomplete="${kind === 'giris' ? 'current-password' : 'new-password'}" required>${kind !== 'giris' ? '<span class="hint">En az 8 karakter</span>' : ''}</div>` : ''}
      <p class="err" id="auth-err" hidden></p>
      <button class="btn" type="submit">${titles[kind]}</button>
      <div class="btn-row" style="justify-content:space-between">
        ${kind === 'giris' ? '<button type="button" class="linkbtn" data-auth="kayit">Hesabın yok mu? Kaydol</button><button type="button" class="linkbtn" data-auth="unuttum">Şifremi unuttum</button>' : ''}
        ${kind === 'kayit' || kind === 'unuttum' ? '<button type="button" class="linkbtn" data-auth="giris">Girişe dön</button>' : ''}
      </div>
    </form>
    <p class="small muted">Bu uygulama yalnızca davet edilen kişilere açıktır. Kaydolduktan sonra hesabının onaylanması gerekir.</p>
  </div>`;
}
async function submitAuth(form) {
  const kind = form.dataset.kind, err = $('auth-err'), btn = form.querySelector('button[type=submit]');
  const email = form.email?.value.trim().toLowerCase(), password = form.password?.value;
  err.hidden = true; btn.disabled = true;
  const fail = m => { err.textContent = m; err.hidden = false; btn.disabled = false; };
  const tr = m => /invalid login/i.test(m) ? 'E-posta ya da şifre hatalı.' : /already registered/i.test(m) ? 'Bu e-postayla zaten bir hesap var. Giriş yap.' : /email not confirmed/i.test(m) ? 'E-postanı henüz onaylamadın. Gelen kutunu kontrol et.' : /rate limit/i.test(m) ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.' : m;
  try {
    if (kind === 'giris') { const { error } = await S.sb.auth.signInWithPassword({ email, password }); if (error) return fail(tr(error.message)); }
    else if (kind === 'kayit') {
      const { data, error } = await S.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
      if (error) return fail(tr(error.message));
      if (!data.session) { form.innerHTML = '<h2>E-postanı kontrol et</h2><p>Hesabını etkinleştirmek için gönderdiğimiz bağlantıya tıkla, sonra buradan giriş yap.</p><button type="button" class="btn" data-auth="giris">Girişe dön</button>'; }
    } else if (kind === 'unuttum') {
      const { error } = await S.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
      if (error) return fail(tr(error.message));
      form.innerHTML = '<h2>E-postanı kontrol et</h2><p>Şifre sıfırlama bağlantısı gönderdik.</p><button type="button" class="btn" data-auth="giris">Girişe dön</button>';
    } else if (kind === 'yeni-sifre') {
      const { data, error } = await S.sb.auth.updateUser({ password });
      if (error) return fail(tr(error.message));
      toast('Şifren güncellendi'); afterLogin(data.user);
    }
  } catch (e) { fail('Bağlantı hatası: ' + (e.message || '')); }
}
function pendingView() {
  $('root').innerHTML = `<div class="auth">
    <div class="brand" style="font-size:1.6rem"><span class="brand-mark">₺</span>Cep Muhasebecim</div>
    <div class="card"><h2>Hesabın onay bekliyor</h2>
      <p>Uygulama yalnızca davet edilen kişilere açık. Uygulamayı kuran kişiye bu e-postayı ilet, seni listeye eklesin:</p>
      <p class="num" style="font-size:1.05rem">${esc(S.user?.email)}</p>
      <div class="btn-row"><button class="btn" data-act="reload">Onaylandı, tekrar dene</button><button class="btn ghost" data-act="logout">Çıkış yap</button></div>
    </div></div>`;
}

/* ---------- Kabuk ---------- */
function shell() {
  $('root').innerHTML = `<div class="app">
    <header class="top">
      <div class="brand"><span class="brand-mark">₺</span>Cep Muhasebecim</div>
      <div class="top-actions"><span class="store-chip" id="store-chip"></span><button class="icon-btn" data-act="tab" data-t="ayarlar" aria-label="Ayarlar">${ICON.gear}</button></div>
    </header>
    ${S.mode === 'local' ? '<div class="banner"><span>Sunucu ayarları yapılmamış: veriler yalnızca bu cihazda tutuluyor, giriş ve asistan kapalı.</span></div>' : ''}
    <main id="view"></main>
  </div>
  <nav class="tabs" aria-label="Bölümler"><div class="tabs-inner">
    ${TABS.map(([k, l, p]) => `<button class="tab" data-tab="${k}"><svg viewBox="0 0 24 24">${p}</svg>${l}</button>`).join('')}
  </div></nav>`;
  const h = location.hash.slice(1);
  if ([...TABS.map(t => t[0]), 'ayarlar'].includes(h)) S.tab = h;
}

let A = null;
function render() {
  const view = $('view'); if (!view) return;
  $('store-chip').textContent = S.mode === 'local' ? 'Bu cihazda' : (S.user?.email || '').split('@')[0];
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-current', b.dataset.tab === S.tab ? 'page' : 'false'));
  A = analyze(S.recs, S.rates, todayISO());
  // Ayın sonlarında bu ay ödenecek bir şey kalmadıysa doğrudan gelecek ayı göster
  if (S.mi == null) S.mi = dayOf(todayISO()) >= 20 && !A.months[0].ev.some(e => e.g !== 'gelir' && e.date >= todayISO()) ? 1 : 0;
  if (S.tab === 'asistan' && view.dataset.tab === 'asistan' && $('chat')) { renderChat(); return; }
  view.dataset.tab = S.tab;
  view.innerHTML = ({ ozet: vOzet, kartlar: vKartlar, butce: vButce, dugun: vDugun, asistan: vAsistan, ayarlar: vAyarlar })[S.tab]();
  if (S.tab === 'asistan') renderChat();
  if (S.tab === 'kartlar') updatePlanner();
}

/* ---------- Ortak parçalar ---------- */
const dateBox = iso => `<div class="date"><b>${dayOf(iso)}</b><span>${AYK[+iso.slice(5, 7) - 1]}</span></div>`;
function evTitle(e) {
  const r = e.rec;
  if (e.g === 'kart') return `${esc(r.ad)}${r.banka ? ` <span class="pill kart">${esc(r.banka)}</span>` : ''}`;
  if (e.g === 'kredi' || e.g === 'kmh') return `${esc(r.ad)}${r.banka ? ` <span class="pill">${esc(r.banka)}</span>` : ''}`;
  if (e.g === 'nakit') return `${esc(r.ad)}${r.dugun ? ' <span class="pill dugun">Düğün</span>' : ''}`;
  return esc(r.ad);
}
function evSub(e) {
  if (e.g === 'kart') {
    const plan = e.rec.odemePlani === 'asgari' ? 'asgari ödeme' : e.rec.odemePlani === 'sabit' ? 'sabit ödeme' : 'ekstrenin tamamı';
    return `Kart ekstresi ${tl(e.stmt)} · asgari ${tl(e.min)} · ${plan}${e.inst ? ` · taksitler ${tl(e.inst)}` : ''}`;
  }
  if (e.g === 'kredi') return `Kredi taksiti ${e.seq}`;
  if (e.g === 'kmh') return `Ek hesap · bakiye ${tl(e.balance)}${num(e.rec.aylikOdeme) > 0 ? '' : ' · yalnızca faiz'}`;
  if (e.g === 'sahis') return `Kişisel borç${e.seq ? ' ' + e.seq : ''}`;
  if (e.g === 'gider') return CAT_AD[e.rec.kategori] || 'Sabit gider';
  if (e.g === 'nakit') return e.label === 'Peşinat' ? 'Peşinat (nakit)' : 'Peşin / nakit ödeme';
  if (e.g === 'gelir') return e.expected ? 'Beklenen gelir' : 'Gelir';
  return '';
}
const evKey = e => `${e.g}:${e.rec.id}:${e.date}`;
const incomeOf = m => m.incomeSure + (profile().beklenenHaric ? 0 : m.incomeExp);

function alerts() {
  const out = [];
  const today = todayISO();
  for (const p of A.plans) if (p.shortfall > 0.5) out.push(`<b>${esc(p.rec.ad)}</b> (${dateShort(p.rec.tarih)}, ${tl(p.need)}): ${p.cardId ? esc(cardName(p.cardId)) + ' kartında' : 'kartlarında'} ${tl(p.shortfall)} limit eksik.`);
  for (const c of A.cards) {
    const over = c.timeline.find(t => t.after < -0.5);
    if (over) out.push(`<b>${esc(c.rec.ad)}</b>: ${dateShort(over.date)} ödemesinden sonra bile limit ${tl(-over.after)} aşılıyor.`);
    if (validDate(c.rec.sonOdemeTarihi) && c.rec.sonOdemeTarihi < today) out.push(`<b>${esc(c.rec.ad)}</b>: ekstre bilgisi eski (son ödeme ${dateShort(c.rec.sonOdemeTarihi)} geçti). Yeni ekstreyi gir.`);
  }
  A.months.slice(0, 6).forEach(m => { const net = incomeOf(m) - m.total; if (net < -0.5) out.push(`<b>${monthLabel(m.key)}</b>: gelirin ödemeleri karşılamıyor, ${tl(-net)} açık var.`); });
  for (const r of A.totals.stuck) out.push(`<b>${esc(r.ad)}</b>: bu ödeme planıyla borç kapanmıyor. Aylık ödemeyi artırmalısın.`);
  if (!out.length) return '';
  return `<div class="alert bad"><ul>${out.slice(0, 6).map(x => `<li>${x}</li>`).join('')}</ul></div>`;
}

/* ---------- Özet ---------- */
function emptyState() {
  return `<section class="card">
    <div class="eyebrow">Başlayalım</div>
    <h2>Önce kartlarını ekle</h2>
    <p class="muted">Her kart için limitini, son ekstre borcunu ve son ödeme tarihini gir; ardından taksitli alışverişlerini ekle. Uygulama hangi gün hangi bankaya ne ödeyeceğini, limitinin ne zaman açılacağını ve düğün alışverişlerinin hangi karta sığacağını hesaplar.</p>
    <div class="chips">
      <button class="chip add" data-act="new" data-k="kart">Kredi kartı</button>
      <button class="chip add" data-act="new" data-k="kredi">Banka kredisi</button>
      <button class="chip add" data-act="salary">Maaşım</button>
      <button class="chip add" data-act="tab" data-t="dugun">Düğün planı</button>
    </div>
  </section>`;
}
function vOzet() {
  if (!S.recs.some(r => !['profil', 'odendi'].includes(r.tur))) return emptyState();
  const m = A.months[S.mi];
  const inc = incomeOf(m), out = m.total, net = inc - out;
  const pays = m.ev.filter(e => e.g !== 'gelir');
  const incs = m.ev.filter(e => e.g === 'gelir');
  const marks = (paidDoc(m.key) || {}).marks || {};
  const paidSum = pays.filter(e => marks[evKey(e)]).reduce((s, e) => s + e.amount, 0);
  const paidCount = pays.filter(e => marks[evKey(e)]).length;
  const den = Math.max(out, inc) || 1;
  const segs = [['kart', 'var(--c-kart)', 'Kartlar'], ['borc', 'var(--c-borc)', 'Kredi / KMH / kişisel'], ['gider', 'var(--c-gider)', 'Sabit gider'], ['nakit', 'var(--c-nakit)', 'Nakit / peşinat']];
  const val = k => k === 'borc' ? m.out.kredi + m.out.kmh + m.out.sahis : m.out[k];
  const hasExp = A.months.some(x => x.incomeExp > 0);
  return `${S.mi === 0 ? alerts() : ''}
  <section class="hero">
    <div class="month-nav">
      <button class="icon-btn" data-act="mprev" aria-label="Önceki ay" ${S.mi === 0 ? 'disabled' : ''}>‹</button>
      <h2>${monthLabel(m.key)}</h2>
      <button class="icon-btn" data-act="mnext" aria-label="Sonraki ay" ${S.mi >= A.months.length - 1 ? 'disabled' : ''}>›</button>
    </div>
    <div><div class="eyebrow">${S.mi === 0 ? 'Bu ay ödemen gereken' : 'Bu ay ödenecek'}</div><div class="big">${tl(out)}</div></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Gelir</div><div class="v">${tl(inc)}</div></div>
      <div class="kpi"><div class="l">Ödemeler</div><div class="v">${tl(out)}</div></div>
      <div class="kpi"><div class="l">${net >= 0 ? 'Elde kalan' : 'Açık'}</div><div class="v ${net >= 0 ? 'pos' : 'neg'}">${tl(Math.abs(net))}</div></div>
    </div>
    <div class="stack" role="img" aria-label="Ödemelerin dağılımı">${segs.map(([k, c]) => `<span style="width:${(val(k) / den * 100).toFixed(2)}%;background:${c}"></span>`).join('')}</div>
    <div class="legend">${segs.filter(([k]) => val(k) > 0).map(([k, c, l]) => `<span><i style="background:${c}"></i>${l} ${tl(val(k))}</span>`).join('')}</div>
    ${hasExp ? `<label class="toggle"><input type="checkbox" id="use-exp" data-act="use-exp" ${profile().beklenenHaric ? '' : 'checked'}> Beklenen gelirleri hesaba kat</label>` : ''}
    ${m.interest > 1 ? `<p class="note">Bu ay ödenmeyen kart/KMH bakiyesine yaklaşık ${tl(m.interest)} faiz ve vergi binecek.</p>` : ''}
  </section>
  <section class="card">
    <div class="card-head"><h3>Ne zaman, nereye ödeyeceksin?</h3><span class="small muted">${paidCount}/${pays.length} ödendi</span></div>
    ${pays.length ? `<div class="list">${pays.map(e => payRow(e, m.key, !!marks[evKey(e)])).join('')}</div>
      <div class="progress"><span>Ödenen ${tl(paidSum)}</span><span>Kalan <b class="num">${tl(out - paidSum)}</b></span></div>` : '<p class="muted">Bu ay ödeme yok.</p>'}
  </section>
  ${incs.length ? `<section class="card"><h3>Bu ay gelecek para</h3><div class="list">${incs.map(e => `<div class="row tap" data-act="edit" data-id="${esc(e.rec.id)}">${dateBox(e.date)}<div style="min-width:0"><div class="t">${esc(e.rec.ad)} ${e.expected ? '<span class="pill dugun">Beklenen</span>' : ''}</div></div><div class="amt pos">${tl(e.amount)}</div></div>`).join('')}</div></section>` : ''}
  <section class="card">
    <div class="card-head"><h3>Önümüzdeki 12 ay</h3><span class="small muted">Bir aya dokun, o ayı aç</span></div>
    <div class="chart-wrap">${chart12(A.months.slice(0, 12))}</div>
    <div class="legend">${segs.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}<span><i style="background:var(--c-gelir);height:2px"></i>Gelir</span></div>
  </section>
  <section class="card">
    <h3>Borç durumu</h3>
    <div class="stats">
      <div class="stat"><div class="l">Toplam borç (bugün)</div><div class="v">${tl(A.totals.debtNow)}</div></div>
      <div class="stat"><div class="l">Kartlarda kullanılabilir limit</div><div class="v">${tl(A.totals.availTotal)}</div></div>
      <div class="stat"><div class="l">12 ayda ödenecek faiz*</div><div class="v">${tl(A.totals.interest12)}</div></div>
      <div class="stat"><div class="l">Borçsuz kalma</div><div class="v">${A.totals.debtFree ? monthLabel(A.totals.debtFree) : 'Kapanmıyor'}</div></div>
    </div>
    <p class="small muted">*Ödenmeyen kart ve KMH bakiyelerine binecek faiz. Kredi taksitlerindeki faiz taksite dahildir.</p>
  </section>`;
}
function payRow(e, key, done) {
  return `<div class="row ${done ? 'done' : ''}">
    <button class="check ${done ? 'on' : ''}" data-act="paid" data-k="${esc(evKey(e))}" data-m="${key}" aria-pressed="${done}" aria-label="Ödendi olarak işaretle">${done ? ICON.check : `<b>${dayOf(e.date)}</b><span>${AYK[+e.date.slice(5, 7) - 1]}</span>`}</button>
    <div style="min-width:0" class="tap" data-act="edit" data-id="${esc(e.rec.id)}"><div class="t">${evTitle(e)}</div><div class="s">${evSub(e)}</div>
      ${e.shortPlan ? '<div class="note">Sabit ödemen asgarinin altında; asgari yazıldı.</div>' : ''}</div>
    <div class="amt">${tl(e.amount)}${e.interest > 1 ? `<small>+${tl(e.interest)} faiz</small>` : ''}</div>
  </div>`;
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function chart12(ms) {
  const W = 360, H = 190, L = 34, B = 22, T = 8, Rp = 4;
  const maxV = Math.max(1, ...ms.map(m => Math.max(m.total, incomeOf(m))));
  const step = niceStep(maxV / 3), top = Math.ceil(maxV / step) * step;
  const y = v => T + (H - T - B) * (1 - v / top);
  const bw = (W - L - Rp) / ms.length;
  let g = '';
  for (let v = 0; v <= top + 1; v += step) g += `<line class="grid" x1="${L}" x2="${W - Rp}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text x="${L - 4}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v ? fmtCompact.format(v) : '0'}</text>`;
  let bars = ''; const pts = [];
  ms.forEach((m, i) => {
    const x = L + i * bw + bw * 0.18, w = bw * 0.64, sel = i === S.mi;
    let base = 0;
    [[m.out.kart, 'var(--c-kart)'], [m.out.kredi + m.out.kmh + m.out.sahis, 'var(--c-borc)'], [m.out.gider, 'var(--c-gider)'], [m.out.nakit, 'var(--c-nakit)']].forEach(([v, c]) => {
      if (v <= 0) return;
      bars += `<rect x="${x.toFixed(1)}" y="${y(base + v).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(base) - y(base + v)).toFixed(1)}" fill="${c}" opacity="${sel ? 1 : 0.55}"/>`;
      base += v;
    });
    pts.push([x + w / 2, y(incomeOf(m))]);
    bars += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" style="${sel ? 'fill:var(--ink);font-weight:600' : ''}">${AYK[+m.key.slice(5, 7) - 1]}</text>`;
    bars += `<rect class="hit" data-act="mset" data-i="${i}" x="${(L + i * bw).toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H}"><title>${monthLabel(m.key)}: ödemeler ${tl(m.total)}, gelir ${tl(incomeOf(m))}</title></rect>`;
  });
  const line = `<polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="var(--c-gelir)" stroke-width="1.6" stroke-linejoin="round"/>` + pts.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2" fill="var(--c-gelir)"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="12 aylık gelir ve ödeme grafiği">${g}${bars}${line}</svg>`;
}

/* ---------- Kartlar ---------- */
function vKartlar() {
  const T = A.totals;
  const cards = A.cards.map(cardBlock).join('');
  return `<section class="card">
    <div class="card-head"><h2>Kartlarım</h2><button class="btn sm" data-act="new" data-k="kart">+ Kart ekle</button></div>
    ${A.cards.length ? `<div class="stats">
      <div class="stat"><div class="l">Toplam limit</div><div class="v">${tl(T.limitTotal)}</div></div>
      <div class="stat"><div class="l">Kullanılabilir limit</div><div class="v ${T.availTotal < 0 ? 'neg' : ''}">${tl(T.availTotal)}</div></div>
      <div class="stat"><div class="l">Ekstre + gelecek taksitler</div><div class="v">${tl(T.kartNow)}</div></div>
      <div class="stat"><div class="l">Planlanan alışverişlerde limit açığı</div><div class="v ${T.shortfallTotal > 0 ? 'neg' : ''}">${tl(T.shortfallTotal)}</div></div>
    </div>` : '<p class="muted">Kartını ekle: limit, son ekstre borcu ve son ödeme tarihi yeterli.</p>'}
  </section>
  ${A.cards.length ? plannerCard() : ''}
  ${cards}`;
}
function cardBlock(c) {
  const L = c.cfg.limit || 1, n = c.now;
  const w = v => Math.max(0, Math.min(100, v / L * 100)).toFixed(1);
  const next = c.stmts.find(s => s.due >= todayISO());
  const over = n.avail < 0;
  return `<section class="ccard">
    <div class="ccard-head">
      <div style="min-width:0"><div class="t">${esc(c.rec.ad)}</div><div class="small muted">${esc(c.rec.banka || '')}${c.rec.banka ? ' · ' : ''}kesim ${c.cfg.cutDay}, son ödeme ${c.cfg.dueDay}</div></div>
      <button class="btn ghost sm" data-act="edit" data-id="${esc(c.rec.id)}">Düzenle</button>
    </div>
    <div class="limitbar" role="img" aria-label="Limit kullanımı"><span style="width:${w(n.billed)}%;background:var(--c-billed)"></span><span style="width:${w(n.unbilled + c.cfg.harcama)}%;background:var(--c-unbilled)"></span></div>
    <div class="legend"><span><i style="background:var(--c-billed)"></i>Ekstre ${tl(n.billed)}</span><span><i style="background:var(--c-unbilled)"></i>Gelecek taksitler ${tl(n.unbilled)}${c.cfg.harcama ? ` + harcama ${tl(c.cfg.harcama)}` : ''}</span></div>
    <div class="facts">
      <div class="fact"><div class="l">Limit</div><div class="v">${tl(c.cfg.limit)}</div></div>
      <div class="fact"><div class="l">Kullanılabilir</div><div class="v ${over ? 'neg' : 'pos'}">${tl(n.avail)}</div></div>
      <div class="fact"><div class="l">Sıradaki ödeme</div><div class="v">${next ? `${tl(next.pay)}<div class="small muted">${dateShort(next.due)}</div>` : '—'}</div></div>
    </div>
    ${c.stuck ? '<p class="note">Bu ödeme planıyla kart borcu kapanmıyor.</p>' : ''}
    <div class="sub">
      <h4>Ödemeden sonra açılan limit</h4>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Son ödeme</th><th class="n">Ödeme</th><th class="n">Sonra kullanılabilir</th></tr></thead><tbody>
      ${c.timeline.slice(0, 6).map(t => `<tr><td>${dateLabel(t.date)}</td><td class="n">${tl(t.pay)}</td><td class="n ${t.after < 0 ? 'neg' : ''}">${tl(t.after)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>
    <div class="sub">
      <div class="card-head"><h4>Taksitli işlemler</h4><button class="btn ghost sm" data-act="new" data-k="alisveris" data-card="${esc(c.rec.id)}">+ Taksit ekle</button></div>
      ${c.remainingInst.length ? `<div class="list">${c.remainingInst.sort((a, b) => a.p.tarih < b.p.tarih ? -1 : 1).map(r => `<div class="row tap" data-act="edit" data-id="${esc(r.p.id)}">
        ${dateBox(r.p.tarih)}
        <div style="min-width:0"><div class="t">${esc(r.p.ad)} ${r.p.dugun ? '<span class="pill dugun">Düğün</span>' : ''} ${r.future ? '<span class="pill">Planlı</span>' : ''} ${r.p.kartId ? '' : '<span class="pill bad">Öneri, kart seçilmedi</span>'}</div>
        <div class="s">${r.n} × ${tl(r.per)} · ${r.kalan ? `kalan ${r.kalan} taksit` : 'bitti'} · son ${dateShort(r.last)}</div></div>
        <div class="amt">${tl(r.per * r.kalan)}<small>kalan</small></div></div>`).join('')}</div>` : '<p class="small muted">Taksitli işlem yok.</p>'}
    </div>
  </section>`;
}
function plannerCard() {
  return `<section class="card">
    <h3>Bu alışveriş hangi karta sığar?</h3>
    <p class="small muted">Tutarı, taksiti ve tarihi yaz; o gün her kartta ne kadar yer olacağını göstereyim.</p>
    <div class="two">
      <div class="field"><label for="pl-tutar">Tutar (₺)</label><input id="pl-tutar" type="number" inputmode="decimal" min="0" data-plan="1" value="${esc(S.plan?.tutar ?? '')}"></div>
      <div class="field"><label for="pl-taksit">Taksit</label><input id="pl-taksit" type="number" inputmode="numeric" min="1" data-plan="1" value="${esc(S.plan?.taksit ?? 1)}"></div>
      <div class="field"><label for="pl-tarih">Tarih</label><input id="pl-tarih" type="date" data-plan="1" value="${esc(S.plan?.tarih || todayISO())}"></div>
      <div class="field"><label for="pl-pesinat">Peşinat (₺)</label><input id="pl-pesinat" type="number" inputmode="decimal" min="0" data-plan="1" value="${esc(S.plan?.pesinat ?? '')}"></div>
    </div>
    <div id="pl-out"></div>
  </section>`;
}
function updatePlanner() {
  const out = $('pl-out'); if (!out) return;
  const d = { tutar: num($('pl-tutar').value), taksit: Math.max(1, Math.round(num($('pl-taksit').value)) || 1), tarih: $('pl-tarih').value, pesinat: num($('pl-pesinat').value) };
  S.plan = d;
  if (!(d.tutar > 0) || !validDate(d.tarih)) { out.innerHTML = ''; return; }
  const p = tryPurchase(S.recs, S.rates, todayISO(), d);
  if (!p) { out.innerHTML = ''; return; }
  out.innerHTML = `<div class="list">${p.options.map(o => `<div class="row"><div class="date"><b>${o.avail >= p.need ? '✓' : '✕'}</b></div>
      <div style="min-width:0"><div class="t">${esc(cardName(o.cardId))}</div><div class="s">${dateShort(d.tarih)} tarihinde kullanılabilir ${tl(o.avail)}</div></div>
      <div class="amt ${o.avail >= p.need ? 'pos' : 'neg'}">${o.avail >= p.need ? 'Sığar' : tl(p.need - Math.max(0, o.avail)) + '<small>eksik</small>'}</div></div>`).join('')}</div>
    ${resolution(p)}
    <p class="small muted">Aylık taksit ${tl(p.need / d.taksit)} × ${d.taksit}.</p>
    <div class="btn-row"><button class="btn" data-act="plan-save">Plana kaydet</button></div>`;
}
function resolution(p) {
  if (!p.options.length) return '';
  if (p.options.some(o => o.avail >= p.need)) {
    const best = p.options.find(o => o.avail >= p.need);
    return `<div class="alert good">En rahat kart <b>${esc(cardName(best.cardId))}</b>: çekimden sonra ${tl(best.avail - p.need)} limit kalır.</div>`;
  }
  const best = p.options[0], gap = p.need - Math.max(0, best.avail);
  const totalAvail = p.options.reduce((s, o) => s + Math.max(0, o.avail), 0);
  let split = '';
  if (totalAvail >= p.need) {
    let rest = p.need; const parts = [];
    for (const o of p.options) { if (rest <= 0.5 || o.avail <= 0) continue; const take = Math.min(rest, o.avail); parts.push(`${esc(cardName(o.cardId))} kartına ${tl(take)}`); rest -= take; }
    split = `<li><b>Böl:</b> ${parts.join(', ')} çekilebilir (işyeri birden fazla kart kabul ederse).</li>`;
  }
  const r = num(S.rates.ihtiyac.tipik), inst12 = loanInstallment(gap, r, 12, S.rates);
  return `<div class="alert warn"><b>Hiçbir kart tek başına yetmiyor.</b> En çok yer ${esc(cardName(best.cardId))} kartında; ${tl(gap)} eksik. Seçeneklerin:
    <ul>
      <li><b>Limit aç:</b> ${dateShort(p.rec.tarih)} tarihinden önce ${esc(cardName(best.cardId))} kartına ${tl(gap)} ekstra ödeme yap; limit hemen açılır.</li>
      ${split}
      <li><b>Borç bul:</b> ${tl(gap)} için 12 ay vadeli ihtiyaç kredisi (aylık ${pct(r)}, vergiler dahil) ≈ ayda ${tl(inst12)}, toplam faiz ${tl(inst12 * 12 - gap)}. Tanıdıktan faizsiz borç daha ucuz olur.</li>
      <li><b>Peşinatı artır</b> ya da taksiti bir sonraki ekstre dönemine kaydır.</li>
    </ul></div>`;
}

/* ---------- Bütçe ---------- */
function vButce() {
  const by = t => S.recs.filter(r => r.tur === t);
  const gelir = by('gelir').filter(r => !r.dugun), gider = by('gider'), kredi = by('kredi'), kmh = by('kmh'), sahis = by('sahis');
  const m0 = A.months[0];
  const monthlySure = gelir.filter(r => r.siklik !== 'tek' && r.durum !== 'beklenen').reduce((s, r) => s + num(r.tutar), 0);
  const giderT = gider.reduce((s, r) => s + num(r.tutar), 0);
  const borcAy = A.months.slice(0, 3).reduce((s, m) => s + m.total - m.out.gider, 0) / 3;
  const serbest = monthlySure - giderT - borcAy;
  const row = (r, sub, amt) => `<div class="row tap" data-act="edit" data-id="${esc(r.id)}"><div class="date"><b>${pad(num(r.gun || r.odemeGunu || r.faizGunu) || 1)}</b><span>gün</span></div>
    <div style="min-width:0"><div class="t">${esc(r.ad)}${r.banka ? ` <span class="pill">${esc(r.banka)}</span>` : ''}</div><div class="s">${sub}</div></div><div class="amt">${amt}</div></div>`;
  const section = (title, add, list, empty) => `<section class="card"><div class="card-head"><h3>${title}</h3><div class="chips">${add}</div></div>${list || `<p class="small muted">${empty}</p>`}</section>`;
  return `<section class="card">
    <h2>Maaş planı</h2>
    <div class="stats">
      <div class="stat"><div class="l">Kesin aylık gelir</div><div class="v">${tl(monthlySure)}</div></div>
      <div class="stat"><div class="l">Sabit giderler</div><div class="v">${tl(giderT)}</div></div>
      <div class="stat"><div class="l">Borç ödemeleri (3 ay ort.)</div><div class="v">${tl(borcAy)}</div></div>
      <div class="stat"><div class="l">Serbest kalan</div><div class="v ${serbest >= 0 ? 'pos' : 'neg'}">${tl(serbest)}</div></div>
    </div>
    ${monthlySure > 0 ? `<p class="small muted">Gelirinin ${pct(borcAy / monthlySure * 100)} borca, ${pct(giderT / monthlySure * 100)} sabit gidere gidiyor.${borcAy / monthlySure > 0.5 ? ' Borç yükün gelirinin yarısını aşıyor; yeni taksite girmeden önce iki kez düşün.' : ''}</p>` : ''}
  </section>
  ${section('Gelirler', `${gelir.some(r => r.maas) ? '' : '<button class="chip add" data-act="salary">Maaş</button>'}<button class="chip add" data-act="new" data-k="gelir">Gelir</button>`,
    gelir.length && `<div class="list">${gelir.map(r => row(r, `${r.siklik === 'tek' ? (validMonth(r.ay) ? monthLabel(r.ay) + ', tek sefer' : 'Tek sefer') : 'Her ay' + (validMonth(r.bitisAy) ? ', ' + monthShort(r.bitisAy) + ' sonuna kadar' : '')} · ${r.durum === 'beklenen' ? 'beklenen' : 'kesin'}`, tl(num(r.tutar)))).join('')}</div>`,
    'Maaşını ve beklediğin paraları (prim, ikramiye, alacak) ekle.')}
  ${section('Banka kredileri', '<button class="chip add" data-act="new" data-k="kredi">Kredi</button>',
    kredi.length && `<div class="list">${kredi.map(r => { const k = Math.max(0, Math.round(num(r.kalanTaksit)) - Math.max(0, monthDiff(validMonth(r.ilkAy) ? r.ilkAy : A.CUR, A.CUR))); return row(r, `${k} taksit kaldı${num(r.faiz) ? ' · aylık ' + pct(num(r.faiz)) : ''}`, tl(num(r.taksitTutari)) + '<small>aylık</small>'); }).join('')}</div>`,
    'İhtiyaç, taşıt veya konut kredin varsa taksit tutarı ve kalan taksit sayısıyla ekle.')}
  ${section('Ek hesap (KMH)', '<button class="chip add" data-act="new" data-k="kmh">Ek hesap</button>',
    kmh.length && `<div class="list">${kmh.map(r => row(r, `Aylık ${pct(S.rates.kmh.akdi)} faiz${num(r.aylikOdeme) ? ' · ayda ' + tl(num(r.aylikOdeme)) + ' kapatılıyor' : ' · yalnızca faiz ödeniyor'}`, tl(num(r.bakiye)))).join('')}</div>`,
    'Ek hesap en pahalı borçlardandır; varsa mutlaka ekle.')}
  ${section('Kişisel borçlar', '<button class="chip add" data-act="new" data-k="sahis">Kişisel borç</button>',
    sahis.length && `<div class="list">${sahis.map(r => row(r, `${Math.max(1, Math.round(num(r.kacAy)) || 1)} ayda${validMonth(r.ilkAy) ? ', ' + monthShort(r.ilkAy) + ' başlangıç' : ''}`, tl(num(r.tutar)))).join('')}</div>`,
    'Arkadaş ya da aileden aldığın borçlar.')}
  ${section('Sabit giderler', ['Kira', 'Faturalar', 'Market'].map(n => `<button class="chip add" data-act="new" data-k="gider" data-name="${n}">${n}</button>`).join(''),
    gider.length && `<div class="list">${gider.map(r => row(r, CAT_AD[r.kategori] || 'Diğer', tl(num(r.tutar)))).join('')}</div>`,
    'Her ay çıkan kira, fatura, market gibi giderler.')}`;
}

/* ---------- Düğün ---------- */
function vDugun() {
  const P = profile();
  const items = S.recs.filter(r => r.tur === 'alisveris' && r.dugun).sort((a, b) => a.tarih < b.tarih ? -1 : 1);
  const wInc = S.recs.filter(r => r.tur === 'gelir' && r.dugun);
  const total = items.reduce((s, r) => s + num(r.tutar), 0);
  const nakit = items.reduce((s, r) => s + (r.nakit ? num(r.tutar) : Math.min(num(r.pesinat), num(r.tutar))), 0);
  const plans = A.plans.filter(p => p.rec.dugun);
  const short = plans.reduce((s, p) => s + p.shortfall, 0);
  const days = validDate(P.dugunTarihi) ? Math.round((new Date(P.dugunTarihi + 'T00:00') - new Date(todayISO() + 'T00:00')) / 864e5) : null;
  const load = A.months.filter(m => m.dugun > 0.5);
  const maxM = Math.max(1, ...load.map(m => m.dugun));
  const wIncT = wInc.reduce((s, r) => s + num(r.tutar), 0);
  const itemRow = r => {
    const p = A.plans.find(x => x.rec.id === r.id);
    const n = Math.max(1, Math.round(num(r.taksit)) || 1), A0 = num(r.tutar) - Math.min(num(r.pesinat), num(r.tutar));
    let how, status = '';
    if (r.nakit) how = 'Nakit / peşin';
    else {
      const cid = r.kartId || p?.cardId;
      how = `${n > 1 ? `${n} × ${tl(A0 / n)}` : 'Tek çekim'} · ${cid ? esc(cardName(cid)) : 'kart yok'}${!r.kartId && cid ? ' (öneri)' : ''}${num(r.pesinat) ? ` · peşinat ${tl(num(r.pesinat))}` : ''}`;
      if (p) status = p.shortfall > 0.5 ? `<span class="pill bad">${tl(p.shortfall)} limit eksik</span>` : `<span class="pill ok">Limit yeterli</span>`;
    }
    return `<div class="row tap" data-act="edit" data-id="${esc(r.id)}">${dateBox(r.tarih)}
      <div style="min-width:0"><div class="t">${esc(r.ad)} ${status}</div><div class="s">${how}</div>
      ${p && !r.kartId && p.cardId ? `<button class="btn ghost sm" style="margin-top:6px" data-act="apply-card" data-id="${esc(r.id)}" data-card="${esc(p.cardId)}">${esc(cardName(p.cardId))} kartına ata</button>` : ''}</div>
      <div class="amt">${tl(num(r.tutar))}</div></div>`;
  };
  const worst = plans.filter(p => p.shortfall > 0.5);
  return `<section class="card">
    <div class="card-head"><h2>Düğün planı</h2>${validDate(P.dugunTarihi) ? `<span class="pill dugun">${dateLabel(P.dugunTarihi)}</span>` : ''}</div>
    ${days != null ? `<div class="countdown"><span class="big">${Math.max(0, days)}</span><span class="muted">${days > 0 ? 'gün kaldı' : 'Düğün tarihi geçti'}</span></div>` : ''}
    <div class="field"><label for="f-wdate">Düğün tarihi</label><input type="date" id="f-wdate" data-act="wdate" value="${esc(P.dugunTarihi || '')}"></div>
    <div class="stats">
      <div class="stat"><div class="l">Toplam bütçe</div><div class="v">${tl(total)}</div></div>
      <div class="stat"><div class="l">Nakit gereken (peşin + peşinat)</div><div class="v">${tl(nakit)}</div></div>
      <div class="stat"><div class="l">Kart limit açığı</div><div class="v ${short > 0 ? 'neg' : 'pos'}">${tl(short)}</div></div>
      <div class="stat"><div class="l">Beklenen takı / para</div><div class="v">${tl(wIncT)}</div></div>
    </div>
  </section>
  ${worst.length ? worst.map(p => `<section class="card"><h3>${esc(p.rec.ad)} · ${dateLabel(p.rec.tarih)}</h3>${resolution(p)}</section>`).join('') : items.length ? '<div class="alert good">Tüm düğün alışverişleri kart limitlerine sığıyor.</div>' : ''}
  <section class="card">
    <div class="card-head"><h3>Kalemler</h3></div>
    <div class="chips">${WEDDING_PRESETS.map(n => `<button class="chip add" data-act="new" data-k="alisveris" data-name="${esc(n)}" data-wedding="1">${n}</button>`).join('')}</div>
    ${items.length ? `<div class="list">${items.map(itemRow).join('')}</div>` : '<p class="muted">Salon, beyaz eşya gibi kalemleri tutar, taksit ve tarihle ekle. Kart seçmezsen limiti en uygun kartı öneririm.</p>'}
  </section>
  ${load.length ? `<section class="card"><h3>Aylık düğün yükü</h3><div class="list">${load.map(m => `<div class="row"><span class="small muted num" style="width:52px">${monthShort(m.key)}</span>
      <div class="meter" style="height:10px"><span style="width:${(m.dugun / maxM * 100).toFixed(1)}%;background:var(--c-dugun)"></span></div><span class="amt">${tl(m.dugun)}</span></div>`).join('')}</div></section>` : ''}
  <section class="card">
    <div class="card-head"><h3>Düğünde beklenen gelir</h3><div class="chips"><button class="chip add" data-act="new" data-k="gelir" data-name="Takı ve nikah parası" data-wedding="1">Takı / para</button></div></div>
    ${wInc.length ? `<div class="list">${wInc.map(r => `<div class="row tap" data-act="edit" data-id="${esc(r.id)}"><div class="date"><b>₺</b><span>${r.durum === 'beklenen' ? 'tahmin' : 'kesin'}</span></div>
      <div style="min-width:0"><div class="t">${esc(r.ad)}</div><div class="s">${validMonth(r.ay) ? monthLabel(r.ay) : 'Ay seçilmedi'}</div></div><div class="amt">${tl(num(r.tutar))}</div></div>`).join('')}</div>` : '<p class="small muted">Takılacak altın ve paranın tahminini girersen düğün sonrası borç kapatma planına katarım.</p>'}
  </section>`;
}

/* ---------- Asistan ---------- */
const SUGGEST = ['Ay sonunda hangi bankaya ne ödeyeceğim?', 'Düğün alışverişleri için limitim yetecek mi?', 'Hangi borcu önce kapatmalıyım?', 'Kartlarda asgari ödersem ne olur?'];
function vAsistan() {
  if (S.mode !== 'cloud' || !S.cfg.ai) return `<section class="card"><h2>Asistan</h2><p class="muted">${S.mode !== 'cloud' ? 'Asistan için uygulamanın sunucuya kurulması gerekiyor.' : 'Asistan henüz etkin değil: sunucuya Gemini API anahtarı eklenmemiş.'}</p></section>`;
  return `<section class="card" style="gap:8px"><h2>Mali asistanın</h2>
    <p class="small muted">Kartlarını, taksitlerini ve düğün planını görerek cevap verir. "Bonus kartıma 5 Aralık'ta 240 bin salon ödemesini 9 taksit yazdır" gibi yazarsan kaydı hazırlar, sen onaylarsın. Yatırım tavsiyesi vermez.</p></section>
    <div class="chat" id="chat"></div>
    <div class="chips" id="suggest">${SUGGEST.map(q => `<button class="chip" data-act="ask" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="composer" id="composer"><textarea id="chat-input" rows="1" placeholder="Sor ya da borcunu anlat…" aria-label="Mesaj" maxlength="2000"></textarea><button class="btn" id="send-btn" type="submit">Gönder</button></form>`;
}
function md(text) {
  return esc(text).split(/\n{2,}/).map(b => {
    const lines = b.split('\n');
    const inl = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^#+\s*/, '');
    if (lines.every(l => /^\s*([-•*]|\d+[.)])\s+/.test(l))) return '<ul>' + lines.map(l => '<li>' + inl(l.replace(/^\s*([-•*]|\d+[.)])\s+/, '')) + '</li>').join('') + '</ul>';
    return '<p>' + lines.map(inl).join('<br>') + '</p>';
  }).join('');
}
function actionHtml(a, mi, ai) {
  if (a.done) return `<div class="action-card"><span class="pill ok">${a.done}</span> ${esc(a.ozet || '')}</div>`;
  return `<div class="action-card"><b>${a.islem === 'guncelle' ? 'Güncelleme' : 'Yeni kayıt'}: ${esc(TUR_AD[a.tur] || a.tur || '')}</b><span>${esc(a.ozet || '')}</span>
    <div class="btn-row"><button class="btn sm" data-act="ai-apply" data-m="${mi}" data-a="${ai}">${a.islem === 'guncelle' ? 'Güncelle' : 'Ekle'}</button><button class="btn ghost sm" data-act="ai-skip" data-m="${mi}" data-a="${ai}">Vazgeç</button></div></div>`;
}
function renderChat() {
  const box = $('chat'); if (!box) return;
  box.innerHTML = S.chat.map((t, mi) => t.role === 'user' ? `<div class="msg u">${esc(t.content)}</div>`
    : t.role === 'sys' ? `<div class="msg sys">${esc(t.content)}</div>`
    : `<div class="msg a">${t.pending ? '<span class="thinking"><i></i><i></i><i></i></span>' : md(t.content)}${(t.actions || []).map((a, ai) => actionHtml(a, mi, ai)).join('')}</div>`).join('');
  const sug = $('suggest'); if (sug) sug.hidden = S.chat.length > 0;
  const btn = $('send-btn'); if (btn) btn.disabled = S.busy;
  box.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
}
function contextText() {
  const R = S.rates, today = todayISO();
  const recs = S.recs.filter(r => !['odendi'].includes(r.tur)).map(r => ({ id: r.id, tur: r.tur, ...strip(r) }));
  const cards = A.cards.map(c => `${c.rec.ad} (id ${c.rec.id}): limit ${Math.round(c.cfg.limit)}, şu an kullanılabilir ${Math.round(c.now.avail)}, ekstre ${Math.round(c.now.billed)}, gelecek taksitler ${Math.round(c.now.unbilled)}, kesim günü ${c.cfg.cutDay}, son ödeme günü ${c.cfg.dueDay}. Önümüzdeki ödemeler: ${c.timeline.slice(0, 4).map(t => `${t.date} ${Math.round(t.pay)} TL (sonra kullanılabilir ${Math.round(t.after)})`).join('; ')}`).join('\n');
  const plans = A.plans.map(p => `${p.rec.ad} ${p.rec.tarih} ${Math.round(p.need)} TL → ${p.cardId ? cardName(p.cardId) : 'kart yok'}${p.suggested ? ' (öneri)' : ''}, eksik limit ${Math.round(p.shortfall)}`).join('\n');
  const months = A.months.slice(0, 12).map(m => `${m.key}: gelir ${Math.round(m.incomeSure)} (+beklenen ${Math.round(m.incomeExp)}), kart ${Math.round(m.out.kart)}, kredi ${Math.round(m.out.kredi)}, KMH ${Math.round(m.out.kmh)}, kişisel ${Math.round(m.out.sahis)}, gider ${Math.round(m.out.gider)}, nakit ${Math.round(m.out.nakit)}, düğün payı ${Math.round(m.dugun)}`).join('\n');
  const thisMonth = A.months[0].ev.filter(e => e.g !== 'gelir').map(e => `${e.date} ${e.rec.ad}${e.rec.banka ? ' (' + e.rec.banka + ')' : ''}: ${Math.round(e.amount)} TL`).join('\n');
  return `Bugün: ${today}. Düğün tarihi: ${profile().dugunTarihi || 'girilmedi'}.
GÜNCEL ORANLAR (${R.updated}): kart aylık azami akdi ${R.kartTiers.map(t => (t.upTo ? '<' + t.upTo : 'üstü') + ' %' + t.akdi).join(', ')}; KMH %${R.kmh.akdi}; asgari ödeme limit ${R.asgari.esik} TL ve altı %${R.asgari.dusuk}, üstü %${R.asgari.yuksek}; ihtiyaç kredisi aylık %${R.ihtiyac.min}-%${R.ihtiyac.max}; KKDF %${R.vergi.kkdf} + BSMV %${R.vergi.bsmv}; politika faizi %${R.policy}; yasal faiz %${R.yasal}.
KARTLAR:
${cards || 'yok'}
PLANLANAN ALIŞVERİŞLER (limit kontrolü):
${plans || 'yok'}
BU AYIN ÖDEMELERİ:
${thisMonth || 'yok'}
12 AYLIK TABLO (TL):
${months}
TOPLAM BORÇ: ${Math.round(A.totals.debtNow)} TL. 12 ayda faiz: ${Math.round(A.totals.interest12)} TL. Borçsuz kalma: ${A.totals.debtFree || 'kapanmıyor'}.
KAYITLAR (JSON): ${JSON.stringify(recs).slice(0, 40000)}`;
}
async function ask(q) {
  q = (q || '').trim();
  if (!q || S.busy) return;
  if (S.tab !== 'asistan') { S.tab = 'asistan'; render(); }
  const history = S.chat.filter(t => (t.role === 'user' || t.role === 'assistant') && t.content).slice(-8).map(t => ({ role: t.role, content: t.content }));
  S.chat.push({ role: 'user', content: q });
  const ans = { role: 'assistant', content: '', pending: true, actions: [] };
  S.chat.push(ans); S.busy = true; renderChat();
  try {
    const { data: { session } } = await S.sb.auth.getSession();
    const r = await fetch('/api/asistan', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify({ messages: [...history, { role: 'user', content: q }], context: contextText() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.hata || 'Asistan cevap veremedi.');
    ans.content = j.cevap || '';
    ans.actions = (Array.isArray(j.eylemler) ? j.eylemler : []).filter(a => a && (a.islem === 'ekle' ? FORMS[a.tur] : S.recs.some(r => r.id === a.id))).slice(0, 5)
      .map(a => ({ ...a, tur: a.islem === 'guncelle' ? S.recs.find(r => r.id === a.id).tur : a.tur }));
    if (!ans.content && !ans.actions.length) ans.content = 'Bir cevap oluşturamadım, farklı sormayı dene.';
  } catch (e) {
    S.chat.splice(S.chat.indexOf(ans), 1);
    S.chat.push({ role: 'sys', content: e.message || 'Bağlantı sorunu oldu.' });
  } finally { ans.pending = false; S.busy = false; renderChat(); }
}
async function applyAction(mi, ai) {
  const a = S.chat[mi]?.actions?.[ai]; if (!a || a.done) return;
  const veri = cleanFields(a.tur, a.veri || {});
  if (a.islem === 'guncelle') {
    const rec = S.recs.find(r => r.id === a.id); if (!rec) return;
    await saveRec({ ...rec, ...veri }); a.done = 'Güncellendi';
  } else {
    if (!veri.ad) { toast('Kaydın adı eksik'); return; }
    if (a.tur === 'alisveris' && !veri.tarih) veri.tarih = todayISO();
    if (a.tur === 'kart' && !veri.sonOdemeTarihi) { openForm('kart', null, veri); a.done = 'Forma aktarıldı'; renderChat(); return; }
    await saveRec({ id: newId(a.tur.slice(0, 2)), tur: a.tur, ...veri }); a.done = 'Eklendi';
  }
  renderChat();
}

/* ---------- Ayarlar ---------- */
function vAyarlar() {
  const R = S.rates;
  const rows = R.kartTiers.map((t, i) => {
    const lo = i === 0 ? 0 : R.kartTiers[i - 1].upTo;
    const label = t.upTo == null ? `${fmtCompact.format(lo)} TL üzeri` : lo ? `${fmtCompact.format(lo)} – ${fmtCompact.format(t.upTo)} TL` : `${fmtCompact.format(t.upTo)} TL altı`;
    return `<tr><td>Kart, dönem borcu ${label}</td><td class="n">${pct(t.akdi)}</td><td class="n">${pct(t.gecikme)}</td></tr>`;
  }).join('');
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<section class="card">
    <div class="card-head"><h2>Ayarlar</h2><button class="btn ghost sm" data-act="tab" data-t="ozet">Kapat</button></div>
    ${S.mode === 'cloud' ? `<p>Hesap: <b>${esc(S.user.email)}</b>${S.admin ? ' <span class="pill kart">Yönetici</span>' : ''}</p><div class="btn-row"><button class="btn ghost" data-act="logout">Çıkış yap</button></div>` : '<p class="muted">Yerel mod: veriler yalnızca bu cihazda.</p>'}
  </section>
  ${standalone ? '' : `<section class="card"><h3>Telefona yükle</h3>
    ${S.installPrompt ? '<p class="small muted">Uygulamayı ana ekranına ekle; tam ekran açılır.</p><div class="btn-row"><button class="btn" data-act="install">Ana ekrana ekle</button></div>'
      : ios ? '<p class="small muted">Safari\'de alttaki Paylaş düğmesine dokun, sonra "Ana Ekrana Ekle"yi seç.</p>' : '<p class="small muted">Tarayıcı menüsünden "Uygulamayı yükle" ya da "Ana ekrana ekle"yi seç.</p>'}</section>`}
  <section class="card">
    <div class="card-head"><h3>Güncel faiz oranları</h3><span class="pill">${dateLabel(R.updated) || '—'}</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Aylık azami oran</th><th class="n">Akdi</th><th class="n">Gecikme</th></tr></thead>
      <tbody>${rows}<tr><td>Nakit avans / KMH</td><td class="n">${pct(R.kmh.akdi)}</td><td class="n">${pct(R.kmh.gecikme)}</td></tr></tbody></table></div>
    <div class="stats">
      <div class="stat"><div class="l">TCMB politika faizi (yıllık)</div><div class="v">${pct(R.policy)}</div></div>
      <div class="stat"><div class="l">Yasal faiz (yıllık)</div><div class="v">${pct(R.yasal)}</div></div>
      <div class="stat"><div class="l">İhtiyaç kredisi (aylık)</div><div class="v">${pct(R.ihtiyac.min)} – ${pct(R.ihtiyac.max)}</div></div>
      <div class="stat"><div class="l">Asgari ödeme</div><div class="v">${pct(R.asgari.dusuk)} / ${pct(R.asgari.yuksek)}</div></div>
    </div>
    <p class="small muted">Faize KKDF ${pct(R.vergi.kkdf)} ve BSMV ${pct(R.vergi.bsmv)} eklenir. Asgari ödeme: limit ${tl(R.asgari.esik)} ve altıysa ${pct(R.asgari.dusuk)}, üstündeyse ${pct(R.asgari.yuksek)}. Oranlar her ayın 2'sinde otomatik güncellenir. ${esc(R.note || '')}</p>
    ${R.sources.length ? `<details><summary>Kaynaklar</summary><div class="src" style="margin-top:8px">${R.sources.map(s => `<a href="${esc(s.u)}" target="_blank" rel="noopener noreferrer">${esc(s.t || s.u)}</a>`).join('')}</div></details>` : ''}
    ${S.admin ? `<div class="btn-row"><button class="btn ghost" data-act="rates-refresh" id="rates-refresh">İnternetten şimdi güncelle</button><button class="btn ghost" data-act="rates-edit">Elle düzelt</button></div>` : ''}
  </section>
  ${S.admin ? `<section class="card"><h3>Davetli arkadaşlar</h3>
    <p class="small muted">Yalnızca bu listedeki e-postalar uygulamayı kullanabilir. Her kişi yalnızca kendi verisini görür.</p>
    <form class="btn-row" id="invite-form"><input id="invite-email" type="email" placeholder="arkadas@ornek.com" required style="flex:1;min-width:0;border:1px solid var(--line);background:var(--surface-2);border-radius:10px;padding:10px 12px"><button class="btn" type="submit">Ekle</button></form>
    <div class="list" id="invite-list"><p class="small muted">Yükleniyor…</p></div></section>` : ''}
  <section class="card"><h3>Gizlilik ve verilerin</h3>
    <p class="small muted">Verilerin yalnızca senin hesabınla okunabilir; diğer kullanıcılar göremez. Asistanı kullandığında sorunla birlikte özet bilgilerin Google Gemini'ye gönderilir.</p>
    <div class="btn-row"><button class="btn ghost" data-act="export">Verilerimi indir</button><button class="btn danger" data-act="wipe" data-step="1">Tüm kayıtlarımı sil</button>${S.mode === 'cloud' ? '<button class="btn danger" data-act="delete-account" data-step="1">Hesabımı sil</button>' : ''}</div>
  </section>`;
}
async function loadInvites() {
  const box = $('invite-list'); if (!box) return;
  const { data, error } = await S.sb.from('izinli_eposta').select('email').order('email');
  if (error) { box.innerHTML = `<p class="err">${esc(error.message)}</p>`; return; }
  box.innerHTML = data.length ? data.map(r => `<div class="row"><div class="date"><b>@</b></div><div class="t" style="min-width:0;overflow-wrap:anywhere">${esc(r.email)}</div><button class="btn ghost sm" data-act="uninvite" data-email="${esc(r.email)}">Çıkar</button></div>`).join('') : '<p class="small muted">Henüz kimse eklenmedi.</p>';
}
async function authedFetch(url, opts = {}) {
  const { data: { session } } = await S.sb.auth.getSession();
  return fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}), Authorization: 'Bearer ' + session.access_token } });
}

/* ---------- Formlar ---------- */
const sheet = $('sheet'), panel = $('sheet-panel');
function fieldHtml(f, v) {
  const id = 'f-' + f.k, val = v ?? '';
  let input;
  if (f.t === 'select') input = `<select id="${id}" name="${f.k}">${f.opts.map(([o, l]) => `<option value="${o}" ${String(val === true ? '1' : val === false ? '' : val) === o ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  else if (f.t === 'cardsel') {
    const cards = S.recs.filter(r => r.tur === 'kart');
    const cur = v === '__nakit' ? '__nakit' : (v || '');
    input = `<select id="${id}" name="${f.k}">${cards.map(c => `<option value="${esc(c.id)}" ${cur === c.id ? 'selected' : ''}>${esc(c.ad)} kartı</option>`).join('')}
      <option value="" ${cur === '' ? 'selected' : ''}>Kart seçmedim, uygun olanı öner</option><option value="__nakit" ${cur === '__nakit' ? 'selected' : ''}>Nakit / havale (peşin)</option></select>`;
  }
  else if (f.t === 'month') input = `<input id="${id}" name="${f.k}" type="month" value="${esc(val)}">`;
  else if (f.t === 'date') input = `<input id="${id}" name="${f.k}" type="date" value="${esc(val)}" ${f.req ? 'required' : ''}>`;
  else if (f.t === 'day') input = `<input id="${id}" name="${f.k}" type="number" inputmode="numeric" min="1" max="31" value="${val ? esc(val) : ''}">`;
  else if (f.t === 'num' || f.t === 'int') input = `<input id="${id}" name="${f.k}" type="number" inputmode="decimal" step="any" min="0" value="${val === 0 || val ? esc(val) : ''}" ${f.req ? 'required' : ''}>`;
  else input = `<input id="${id}" name="${f.k}" type="text" placeholder="${esc(f.ph || '')}" value="${esc(val)}" ${f.req ? 'required' : ''} maxlength="80">`;
  return `<div class="field"><label for="${id}">${f.l}</label>${input}${f.hint ? `<span class="hint">${f.hint}</span>` : ''}</div>`;
}
let formRec = null;
function openForm(tur, rec, preset = {}) {
  const isNew = !rec;
  rec = rec || { id: newId(tur.slice(0, 2)), tur, ...(tur === 'gelir' ? { siklik: 'aylik', durum: 'kesin' } : {}), ...(tur === 'kart' ? { odemePlani: 'tam' } : {}), ...(tur === 'alisveris' ? { taksit: 1, tarih: todayISO() } : {}), ...preset };
  formRec = rec;
  const vals = { ...rec, ...(tur === 'alisveris' && rec.nakit ? { kartId: '__nakit' } : {}) };
  const calc = tur === 'kredi' ? `<details class="calc"><summary>Taksiti benim yerime hesapla</summary><div class="form" style="margin-top:10px">
      <div class="two">${fieldHtml({ k: 'c-p', l: 'Çekilen tutar (₺)', t: 'num' })}${fieldHtml({ k: 'c-n', l: 'Vade (ay)', t: 'int' })}</div>
      ${fieldHtml({ k: 'c-r', l: 'Aylık faiz (%)', t: 'num', hint: `Bankaların ilan ettiği aralık ${pct(S.rates.ihtiyac.min)} – ${pct(S.rates.ihtiyac.max)}. KKDF ve BSMV eklenir.` }, S.rates.ihtiyac.tipik)}
      <button type="button" class="btn ghost" data-act="calc">Hesapla ve doldur</button><p class="small muted" id="calc-out"></p></div></details>` : '';
  panel.innerHTML = `<div class="card-head"><h2>${isNew ? 'Yeni: ' : ''}${TUR_AD[tur]}</h2><button class="icon-btn" data-act="close" aria-label="Kapat">×</button></div>
    <form class="form" id="rec-form" data-tur="${tur}">${calc}${FORMS[tur].map(f => fieldHtml(f, vals[f.k])).join('')}
      <div class="btn-row"><button class="btn" type="submit">Kaydet</button>${isNew ? '' : '<button class="btn danger" type="button" data-act="del" data-step="1">Sil</button>'}</div></form>`;
  sheet.hidden = false;
  setTimeout(() => panel.querySelector('input[type=text], input[type=number]')?.focus({ preventScroll: true }), 40);
}
function closeSheet() { sheet.hidden = true; panel.innerHTML = ''; formRec = null; }
function submitForm(form) {
  const tur = form.dataset.tur, raw = {};
  for (const f of FORMS[tur]) { const el = form.elements[f.k]; if (el) raw[f.k] = el.value.trim(); }
  const rec = { ...formRec, ...cleanFields(tur, raw) };
  if (tur === 'kart' && validDate(rec.sonOdemeTarihi)) rec.sonOdemeGunu = dayOf(rec.sonOdemeTarihi);
  if (tur === 'gelir' && /maaş/i.test(rec.ad)) rec.maas = true;
  closeSheet();
  saveRec(rec);
}
function openRatesForm() {
  const R = S.rates;
  const fields = [
    ...R.kartTiers.map((t, i) => ({ k: 'k' + i, l: `Kart akdi, kademe ${i + 1}`, t: 'num', v: t.akdi })),
    { k: 'kmh', l: 'KMH / nakit avans akdi', t: 'num', v: R.kmh.akdi }, { k: 'policy', l: 'Politika faizi (yıllık)', t: 'num', v: R.policy },
    { k: 'yasal', l: 'Yasal faiz (yıllık)', t: 'num', v: R.yasal }, { k: 'tipik', l: 'Tipik ihtiyaç kredisi (aylık)', t: 'num', v: R.ihtiyac.tipik },
    { k: 'esik', l: 'Asgari ödeme limit eşiği (₺)', t: 'num', v: R.asgari.esik }, { k: 'dusuk', l: 'Asgari ödeme, eşik altı (%)', t: 'num', v: R.asgari.dusuk },
    { k: 'yuksek', l: 'Asgari ödeme, eşik üstü (%)', t: 'num', v: R.asgari.yuksek }
  ];
  panel.innerHTML = `<div class="card-head"><h2>Oranları düzelt</h2><button class="icon-btn" data-act="close" aria-label="Kapat">×</button></div>
    <p class="small muted">Gecikme faizi akdi orana 0,30 puan eklenerek güncellenir. Tüm kullanıcıların hesapları bu oranlarla yapılır.</p>
    <form class="form" id="rates-form"><div class="two">${fields.map(f => fieldHtml(f, f.v)).join('')}</div><div class="btn-row"><button class="btn" type="submit">Kaydet</button></div></form>`;
  sheet.hidden = false;
}
async function submitRates(form) {
  const g = k => num(form.elements[k].value), R = S.rates;
  const next = { ...R, kartTiers: R.kartTiers.map((t, i) => ({ ...t, akdi: g('k' + i), gecikme: +(g('k' + i) + 0.3).toFixed(2) })),
    kmh: { akdi: g('kmh'), gecikme: +(g('kmh') + 0.3).toFixed(2) }, policy: g('policy'), yasal: g('yasal'),
    ihtiyac: { ...R.ihtiyac, tipik: g('tipik') }, asgari: { esik: g('esik'), dusuk: g('dusuk'), yuksek: g('yuksek') },
    updated: todayISO(), note: 'Yönetici tarafından elle düzeltildi.' };
  closeSheet();
  const { error } = await S.sb.from('oranlar').upsert({ id: 1, veri: next, guncellendi: new Date().toISOString() });
  if (error) { toast('Kaydedilemedi: ' + error.message); return; }
  S.rates = normRates(next); render(); toast('Oranlar güncellendi');
}

/* ---------- Olaylar ---------- */
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800); }
function setTab(t) {
  S.tab = t; try { history.replaceState(null, '', '#' + t); } catch {}
  render(); window.scrollTo({ top: 0 });
  if (t === 'ayarlar' && S.admin) loadInvites();
}
document.addEventListener('click', async e => {
  const authBtn = e.target.closest('[data-auth]'); if (authBtn) { authView(authBtn.dataset.auth); return; }
  const tabBtn = e.target.closest('.tab'); if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
  if (e.target === sheet) { closeSheet(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (a === 'mprev') { S.mi = Math.max(0, S.mi - 1); render(); }
  else if (a === 'mnext') { S.mi = Math.min(A.months.length - 1, S.mi + 1); render(); }
  else if (a === 'mset') { S.mi = +el.dataset.i; render(); }
  else if (a === 'tab') setTab(el.dataset.t);
  else if (a === 'new') {
    const k = el.dataset.k, P = profile();
    const preset = { ...(el.dataset.name ? { ad: el.dataset.name } : {}), ...(el.dataset.card ? { kartId: el.dataset.card } : {}) };
    if (el.dataset.wedding && k === 'alisveris') Object.assign(preset, { dugun: true, kartId: '', tarih: todayISO() });
    if (el.dataset.wedding && k === 'gelir') Object.assign(preset, { dugun: true, siklik: 'tek', durum: 'beklenen', ay: (P.dugunTarihi || '').slice(0, 7) });
    openForm(k, null, preset);
  }
  else if (a === 'salary') openForm('gelir', null, { ad: 'Maaş', maas: true, gun: 15 });
  else if (a === 'edit') { const r = S.recs.find(x => x.id === el.dataset.id); if (r && FORMS[r.tur]) openForm(r.tur, r); }
  else if (a === 'close') closeSheet();
  else if (a === 'del') {
    if (el.dataset.step === '1') { el.dataset.step = '2'; el.textContent = 'Emin misin? Kalıcı olarak sil'; return; }
    const id = formRec?.id; closeSheet(); if (id) removeRec(id);
  }
  else if (a === 'paid') {
    const key = el.dataset.m, k = el.dataset.k;
    const doc = paidDoc(key) || { id: 'odendi-' + key, tur: 'odendi', marks: {} };
    const marks = { ...(doc.marks || {}) }; if (marks[k]) delete marks[k]; else marks[k] = true;
    saveRec({ ...doc, marks }, true);
  }
  else if (a === 'apply-card') { const r = S.recs.find(x => x.id === el.dataset.id); if (r) saveRec({ ...r, kartId: el.dataset.card }); }
  else if (a === 'plan-save') { const d = S.plan || {}; openForm('alisveris', null, { tutar: d.tutar, taksit: d.taksit, tarih: d.tarih, pesinat: d.pesinat, kartId: '' }); }
  else if (a === 'calc') {
    const p = num($('f-c-p').value), n = Math.round(num($('f-c-n').value)), r = num($('f-c-r').value), out = $('calc-out');
    if (!(p > 0 && n > 0)) { out.textContent = 'Tutar ve vadeyi gir.'; return; }
    const inst = loanInstallment(p, r, n, S.rates);
    $('f-taksitTutari').value = Math.round(inst); $('f-kalanTaksit').value = n; $('f-faiz').value = r;
    out.textContent = `Aylık taksit ≈ ${tl(inst)} · toplam geri ödeme ${tl(inst * n)} · faiz ve vergi ${tl(inst * n - p)}`;
  }
  else if (a === 'ask') ask(el.dataset.q);
  else if (a === 'ai-apply') applyAction(+el.dataset.m, +el.dataset.a);
  else if (a === 'ai-skip') { const x = S.chat[+el.dataset.m]?.actions?.[+el.dataset.a]; if (x) { x.done = 'Vazgeçildi'; renderChat(); } }
  else if (a === 'logout') { await S.sb.auth.signOut(); }
  else if (a === 'reload') location.reload();
  else if (a === 'install') { const p = S.installPrompt; if (p) { p.prompt(); await p.userChoice.catch(() => {}); S.installPrompt = null; render(); } }
  else if (a === 'rates-edit') openRatesForm();
  else if (a === 'rates-refresh') {
    el.disabled = true; el.textContent = 'Güncelleniyor… (1 dk sürebilir)';
    try {
      const r = await authedFetch('/api/faiz-guncelle', { method: 'POST' }); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.hata || 'Güncellenemedi');
      await loadRates(); render(); toast(j.degisen?.length ? 'Güncellendi: ' + j.degisen.join(', ') : 'Oranlar kontrol edildi, değişiklik yok');
    } catch (err) { toast(err.message); el.disabled = false; el.textContent = 'İnternetten şimdi güncelle'; }
  }
  else if (a === 'uninvite') { const { error } = await S.sb.from('izinli_eposta').delete().eq('email', el.dataset.email); if (error) toast(error.message); loadInvites(); }
  else if (a === 'export') {
    const blob = new Blob([JSON.stringify({ disaAktarim: new Date().toISOString(), kayitlar: S.recs.map(r => ({ id: r.id, tur: r.tur, ...strip(r) })) }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'cep-muhasebecim-verilerim.json'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }
  else if (a === 'wipe') {
    if (el.dataset.step === '1') { el.dataset.step = '2'; el.textContent = 'Emin misin? Hepsi silinecek'; return; }
    try { await store.removeAll(); S.recs = []; render(); toast('Tüm kayıtların silindi'); } catch (err) { toast(err.message); }
  }
  else if (a === 'delete-account') {
    if (el.dataset.step === '1') { el.dataset.step = '2'; el.textContent = 'Emin misin? Hesap ve tüm veriler silinir'; return; }
    try { const r = await authedFetch('/api/hesap-sil', { method: 'POST' }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).hata || 'Silinemedi'); localStorage.clear(); await S.sb.auth.signOut(); toast('Hesabın silindi'); }
    catch (err) { toast(err.message); }
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !sheet.hidden) closeSheet();
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'chat-input') { e.preventDefault(); $('composer').requestSubmit(); }
});
document.addEventListener('input', e => { if (e.target.dataset.plan) updatePlanner(); });
document.addEventListener('change', e => {
  const a = e.target.dataset.act;
  if (a === 'use-exp') saveRec({ ...profile(), tur: 'profil', beklenenHaric: !e.target.checked }, true);
  if (a === 'wdate') saveRec({ ...profile(), tur: 'profil', dugunTarihi: e.target.value }, true);
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'auth-form') submitAuth(f);
  else if (f.id === 'rec-form') submitForm(f);
  else if (f.id === 'rates-form') submitRates(f);
  else if (f.id === 'composer') { const inp = $('chat-input'); const q = inp.value; inp.value = ''; ask(q); }
  else if (f.id === 'invite-form') {
    const email = $('invite-email').value.trim().toLowerCase();
    const { error } = await S.sb.from('izinli_eposta').upsert({ email });
    if (error) toast(error.message); else { toast(email + ' eklendi'); $('invite-email').value = ''; }
    loadInvites();
  }
});

/* ---------- PWA ---------- */
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installPrompt = e; if (S.tab === 'ayarlar') render(); });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
