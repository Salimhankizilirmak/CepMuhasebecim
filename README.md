# Cep Muhasebecim

Kredi kartı limitlerini, ekstreleri, taksitli alışverişleri, kredileri ve düğün planını takip eden; hangi gün hangi bankaya ne ödeyeceğini ve bir alışverişin hangi karta sığacağını hesaplayan, telefona yüklenebilen (PWA) kişisel finans uygulaması.

- **Arayüz:** `public/` (düz HTML/JS, derleme adımı yok)
- **Veritabanı ve giriş:** Supabase (PostgreSQL + e-posta/şifre girişi + satır düzeyi güvenlik)
- **Sunucu:** `api/` altındaki Vercel fonksiyonları (yapay zekâ asistanı, aylık faiz güncelleme, hesap silme)
- **Yapay zekâ:** Google Gemini API (asistan + Google Arama ile faiz oranı taraması)
- **Resmî veri:** TCMB EVDS (isteğe bağlı)

---

## Kurulum (yaklaşık 30 dakika)

Üç ücretsiz hesap gerekiyor: **Supabase**, **Google AI Studio** ve **Vercel**. Adımları sırayla yap.

### 1. Supabase: veritabanı ve giriş

1. [supabase.com](https://supabase.com) adresinde hesap aç ve **New project** de.
   - **Region:** `Central EU (Frankfurt)` seç (Türkiye'ye en yakın).
   - Veritabanı şifresini bir yere kaydet.
2. Soldaki menüden **SQL Editor > New query** aç. [`supabase/schema.sql`](supabase/schema.sql) dosyasının tamamını yapıştır ve **Run**'a bas. "Success" görmelisin.
3. **Authentication > Sign In / Providers > Email** bölümünde:
   - **Email** açık olsun.
   - **Confirm email**: Supabase'in ücretsiz e-posta servisi saatte birkaç e-posta ile sınırlı. Arkadaş grubun küçükse bunu **kapatabilirsin**. Uygulama zaten yalnızca davet listesindeki e-postalara veri kaydettiriyor.
4. **Project Settings > API** sayfasından şu üç değeri kopyala (4. adımda lazım):
   - `Project URL` → `SUPABASE_URL`
   - `anon public` anahtar → `SUPABASE_ANON_KEY`
   - `service_role` anahtar → `SUPABASE_SERVICE_ROLE_KEY` (**gizli**, kimseyle paylaşma)

### 2. Gemini API anahtarı

1. [aistudio.google.com](https://aistudio.google.com) adresine Google hesabınla gir, **Get API key > Create API key** de.
2. Anahtarı kopyala → `GEMINI_API_KEY`.

> **Gizlilik notu:** Gemini API'nin ücretsiz katmanında Google, gönderilen içerikleri ürünlerini geliştirmek için kullanabilir. Asistana kart ve borç bilgilerin gittiği için Google AI Studio'da **faturalandırmayı açman (ücretli katman)** önerilir. Ücretli katmanda içerikler bu amaçla kullanılmaz. Kullanım ücreti bu boyutta bir uygulama için genelde aylık birkaç dolardır.

### 3. (İsteğe bağlı) TCMB EVDS anahtarı

Bankaların ihtiyaç kredisi faiz ortalamasını resmî kaynaktan çekmek için:

1. [evds2.tcmb.gov.tr](https://evds2.tcmb.gov.tr) adresinde üye ol, **Profil > API Anahtarı**'ndan anahtarını al → `EVDS_API_KEY`.
2. Varsayılan seri kodu `TP.KTF10`. Bu kodun "ihtiyaç kredisi" serisi olduğunu EVDS'deki **Kredi Faiz Oranları** başlığından doğrula. Farklıysa `EVDS_IHTIYAC_SERIES` değişkenine doğru kodu yaz.

Bu adımı atlarsan oranlar yalnızca Gemini'nin Google Arama ile bulduğu TCMB/BDDK duyurularından güncellenir.

### 4. Vercel: yayına alma

En kolay yol GitHub üzerinden:

1. Bu klasörü (`cep-muhasebecim`) GitHub'da **özel (private)** bir depoya yükle.
2. [vercel.com](https://vercel.com) adresine GitHub hesabınla gir, **Add New > Project** de ve depoyu seç.
   - **Framework Preset:** `Other`
   - Build ve Output ayarlarına dokunma (`vercel.json` hallediyor).
3. **Environment Variables** bölümüne şunları ekle:

   | Değişken | Değer |
   |---|---|
   | `SUPABASE_URL` | 1. adımdan |
   | `SUPABASE_ANON_KEY` | 1. adımdan |
   | `SUPABASE_SERVICE_ROLE_KEY` | 1. adımdan |
   | `GEMINI_API_KEY` | 2. adımdan |
   | `CRON_SECRET` | Uzun, rastgele bir metin (örn. bir şifre üreticisinden 40 karakter) |
   | `EVDS_API_KEY` | (isteğe bağlı) 3. adımdan |
   | `AI_GUNLUK_LIMIT` | (isteğe bağlı) Kişi başı günlük asistan sorusu, varsayılan 40 |

4. **Deploy**'a bas. Birkaç dakika sonra `https://proje-adin.vercel.app` gibi bir adresin olur.
5. Supabase'e dön: **Authentication > URL Configuration > Site URL** alanına bu adresi yaz. Şifre sıfırlama e-postaları buraya yönlendirir.

GitHub kullanmak istemezsen bu klasörde terminal açıp şunu çalıştırabilirsin (Vercel hesabına giriş ister):

```bash
npx vercel --prod
```

Ortam değişkenlerini sonra Vercel panelinden ekleyip **Redeploy** de.

### 5. İlk giriş ve yönetici olma

1. Sitenin adresini aç, **Kaydol** de ve kendi e-postanla hesap oluştur. "Hesabın onay bekliyor" ekranı gelecek; bu normal.
2. Supabase **SQL Editor**'da şunu çalıştır (e-postayı kendininkiyle değiştir):

   ```sql
   insert into public.yoneticiler (user_id)
     select id from auth.users where email = 'senin@epostan.com'
     on conflict do nothing;
   ```
3. Uygulamada **Onaylandı, tekrar dene**'ye bas. Artık yöneticisin.
4. **Ayarlar (⚙) > Davetli arkadaşlar** bölümünden arkadaşlarının e-postalarını ekle. Onlar da siteye girip aynı e-postayla kaydolur.

### 6. Telefona yükleme

- **Android (Chrome):** Siteyi aç, menüden **Uygulamayı yükle** ya da **Ana ekrana ekle**'yi seç. Ayarlar ekranındaki **Ana ekrana ekle** düğmesi de çalışır.
- **iPhone (Safari):** Alttaki **Paylaş** düğmesine dokun, **Ana Ekrana Ekle**'yi seç.

Uygulama tam ekran açılır; internet yokken de açılır ama verileri görmek için bağlantı gerekir.

---

## Nasıl kullanılır?

1. **Kartlar:** Her kart için limit, ödenmemiş son ekstre borcu, bu ekstrenin son ödeme tarihi ve hesap kesim günü. Sonra karttaki **taksitli işlemleri** ekle (toplam tutar, taksit sayısı, alışveriş tarihi). Uygulama hangi taksitin hangi ekstreye gireceğini kesim gününe göre hesaplar.
2. **Bu alışveriş hangi karta sığar?** Tutar, taksit ve tarih yaz; o gün her kartta ne kadar kullanılabilir limit olacağını görürsün. Yetmiyorsa üç seçenek sunar: önceden karta ödeme yapıp limit açmak, kartlara bölmek, borç bulmak (aylık taksitiyle birlikte).
3. **Düğün:** Kalemleri (salon, beyaz eşya…) tarih, tutar ve taksitle ekle. Kart seçmezsen uygulama limiti en uygun kartı önerir ve limit açığını gösterir.
4. **Özet:** Bu ay hangi gün hangi bankaya ne ödeyeceğin. Ödediklerini işaretle. 12 aylık tablo ve uyarılar (limit aşımı, açık veren aylar).
5. **Bütçe:** Maaş ve diğer gelirler, krediler, ek hesap, kişisel borçlar, sabit giderler.
6. **Asistan:** Sorularını cevaplar. "World kartıma 5 Aralık'ta 160 bin beyaz eşya, 6 taksit" gibi yazarsan kaydı hazırlar, sen **Ekle**'ye basınca kaydeder.

**Her ay ekstre gelince** kartın "son ekstre borcu" ve "son ödeme tarihi" alanlarını güncelle; hesaplar buna dayanır. Ekstre bilgisi eskiyen kart için Özet'te uyarı çıkar.

---

## Gizlilik

- Her kullanıcının verisi veritabanında **satır düzeyi güvenlik (RLS)** ile korunur: kimse başkasının kaydını okuyamaz, değiştiremez. Bu kural uygulama kodunda değil, veritabanının kendisinde uygulanır.
- Yalnızca **davet listesindeki** e-postalar veri kaydedebilir ve asistanı kullanabilir.
- Veritabanı sahibi olarak sen Supabase panelinden teknik olarak tüm tabloları görebilirsin. Arkadaşlarına bunu söylemen dürüst olur.
- Asistan kullanıldığında soru ve özet finansal bilgiler Google Gemini'ye gönderilir (bkz. 2. adımdaki not).
- Her kullanıcı **Ayarlar > Gizlilik** bölümünden verilerini indirebilir, tüm kayıtlarını ya da hesabını kalıcı olarak silebilir.
- `SUPABASE_SERVICE_ROLE_KEY` yalnızca Vercel sunucusunda durur; tarayıcıya hiç gönderilmez.

## Faiz oranları nasıl güncelleniyor?

- Vercel her ayın 2'sinde 10:00'da (Türkiye saati) `/api/faiz-guncelle` adresini çağırır.
- Bu fonksiyon Gemini'ye Google Arama ile TCMB'nin kredi kartı/KMH azami faizlerini, politika faizini, BDDK asgari ödeme kurallarını, yasal faizi ve bankaların ihtiyaç kredisi aralığını buldurur. EVDS anahtarı varsa TCMB'nin resmî kredi faizi serisini de ekler.
- Gelen her değer makul aralıkta mı diye kontrol edilir; şüpheli olan değiştirilmez. Kaynak bağlantıları Ayarlar'da görünür.
- Yönetici, **Ayarlar > İnternetten şimdi güncelle** ile elle de tetikleyebilir ya da **Elle düzelt** ile değiştirebilir.

> Türk bankalarının faiz oranları için herkese açık bir API'si yok; açık bankacılık API'leri yalnızca lisanslı kuruluşlara açık. Bu yüzden resmî kaynak olarak TCMB EVDS, güncel duyurular için Google Arama kullanılıyor.

## Geliştirme

```bash
npm test
```

Hesap motoru testlerini çalıştırır (kart ekstreleri, limit, taksit, kredi hesabı).

Sunucu ayarları olmadan `public/` klasörünü herhangi bir statik sunucuyla açarsan uygulama **yerel modda** çalışır: veriler yalnızca o tarayıcıda tutulur, giriş ve asistan kapalıdır. Arayüzü denemek için kullanışlıdır.

```
api/            Vercel fonksiyonları (config, asistan, faiz-guncelle, hesap-sil)
public/         Uygulama (index.html, app.js, engine.js, styles.css, sw.js, manifest.json, icons/)
supabase/       Veritabanı şeması ve güvenlik kuralları
test/           Hesap motoru testleri
vercel.json     Yayın, cron ve güvenlik başlıkları
```
