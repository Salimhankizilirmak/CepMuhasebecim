-- Cep Muhasebecim veritabanı şeması
-- Supabase panelinde: SQL Editor > New query > bu dosyanın tamamını yapıştır > Run.
-- Tekrar çalıştırılabilir (var olanları bozmaz).

-- 1) Uygulamayı kullanmasına izin verilen e-postalar (davet listesi)
create table if not exists public.izinli_eposta (
  email text primary key check (email = lower(email)),
  eklendi timestamptz not null default now()
);

-- 2) Yöneticiler (oranları düzenleyebilir, davet listesini yönetir)
create table if not exists public.yoneticiler (
  user_id uuid primary key references auth.users (id) on delete cascade
);

-- 3) Kullanıcı kayıtları: kartlar, taksitler, krediler, gelirler, düğün kalemleri...
create table if not exists public.kayitlar (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  tur text not null check (char_length(tur) between 1 and 30),
  veri jsonb not null default '{}'::jsonb check (pg_column_size(veri) < 64000),
  guncellendi timestamptz not null default now(),
  primary key (user_id, id)
);

-- 4) Güncel faiz oranları (tek satır, id = 1)
create table if not exists public.oranlar (
  id int primary key default 1 check (id = 1),
  veri jsonb not null,
  guncellendi timestamptz not null default now()
);

-- 5) Yapay zekâ kullanım sayacı (günlük sınır için; yalnızca sunucu erişir)
create table if not exists public.ai_kullanim (
  user_id uuid not null references auth.users (id) on delete cascade,
  gun date not null default current_date,
  adet int not null default 0,
  primary key (user_id, gun)
);

-- Yardımcı fonksiyonlar (security definer: listeyi açığa çıkarmadan kontrol eder)
create or replace function public.izinli() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.izinli_eposta where email = lower(coalesce(auth.jwt() ->> 'email', '')))
      or exists (select 1 from public.yoneticiler where user_id = auth.uid());
$$;

create or replace function public.yonetici() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.yoneticiler where user_id = auth.uid());
$$;

-- Bu fonksiyonlar yalnızca çağıran kişinin kendisi hakkında evet/hayır döndürür.
-- Giriş yapmamış ziyaretçiler çağıramaz; giriş yapanlar çağırabilmeli (güvenlik kuralları da bunları kullanır).
revoke execute on function public.izinli() from public, anon;
revoke execute on function public.yonetici() from public, anon;
grant execute on function public.izinli() to authenticated;
grant execute on function public.yonetici() to authenticated;

-- Satır düzeyinde güvenlik (RLS): her kullanıcı yalnızca kendi satırlarını görür
alter table public.kayitlar enable row level security;
alter table public.oranlar enable row level security;
alter table public.izinli_eposta enable row level security;
alter table public.yoneticiler enable row level security;
alter table public.ai_kullanim enable row level security;

drop policy if exists "kendi kayitlarini oku" on public.kayitlar;
drop policy if exists "kendi kayitlarini ekle" on public.kayitlar;
drop policy if exists "kendi kayitlarini guncelle" on public.kayitlar;
drop policy if exists "kendi kayitlarini sil" on public.kayitlar;
create policy "kendi kayitlarini oku" on public.kayitlar for select to authenticated
  using (user_id = auth.uid() and public.izinli());
create policy "kendi kayitlarini ekle" on public.kayitlar for insert to authenticated
  with check (user_id = auth.uid() and public.izinli());
create policy "kendi kayitlarini guncelle" on public.kayitlar for update to authenticated
  using (user_id = auth.uid() and public.izinli()) with check (user_id = auth.uid());
create policy "kendi kayitlarini sil" on public.kayitlar for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "oranlari herkes okur" on public.oranlar;
drop policy if exists "oranlari yonetici yazar" on public.oranlar;
create policy "oranlari herkes okur" on public.oranlar for select to authenticated using (true);
create policy "oranlari yonetici yazar" on public.oranlar for all to authenticated
  using (public.yonetici()) with check (public.yonetici());

drop policy if exists "davet listesini yonetici yonetir" on public.izinli_eposta;
create policy "davet listesini yonetici yonetir" on public.izinli_eposta for all to authenticated
  using (public.yonetici()) with check (public.yonetici());

drop policy if exists "kendi yoneticiligini gor" on public.yoneticiler;
create policy "kendi yoneticiligini gor" on public.yoneticiler for select to authenticated
  using (user_id = auth.uid());
-- ai_kullanim için politika yok: istemciler hiç erişemez, yalnızca sunucu (service role) yazar.

-- Başlangıç oranları (30 Ekim 2026). Aylık otomatik güncelleme bunların üzerine yazar.
insert into public.oranlar (id, veri) values (1, '{
  "updated": "2026-10-30",
  "policy": 36,
  "kartTiers": [
    {"upTo": 30000, "akdi": 3.25, "gecikme": 3.55},
    {"upTo": 180000, "akdi": 3.75, "gecikme": 4.05},
    {"upTo": null, "akdi": 4.25, "gecikme": 4.55}
  ],
  "kmh": {"akdi": 4.25, "gecikme": 4.55},
  "asgari": {"esik": 100000, "dusuk": 20, "yuksek": 40},
  "ihtiyac": {"min": 2.79, "tipik": 3.49, "max": 5.49},
  "yasal": 31,
  "vergi": {"kkdf": 15, "bsmv": 15},
  "note": "Başlangıç değerleri: TCMB azami kart/KMH faizleri (Ekim 2026), politika faizi %36, BDDK asgari ödeme eşiği 100 bin TL.",
  "sources": []
}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- KURULUMDAN SONRA (bir kez): kendi hesabınla uygulamaya kaydol, sonra
-- aşağıdaki satırdaki e-postayı kendininkiyle değiştirip çalıştır:
--
-- insert into public.yoneticiler (user_id)
--   select id from auth.users where email = 'senin@epostan.com'
--   on conflict do nothing;
-- ---------------------------------------------------------------
