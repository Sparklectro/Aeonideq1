# 📱 Kumanda

Telefondan bilgisayarına tam hakimiyet. Bilgisayarda küçük bir sunucu çalışır; telefon
tarayıcıdan (ya da ana ekrana eklenmiş uygulama olarak) ona bağlanır ve şunları yaparsın:

- **Gerçek terminal** — Windows'ta PowerShell, Linux/macOS'ta bash/zsh. PC'deki konsolda ne
  yazabiliyorsan telefonda da yazarsın: `claude`, `git`, `npm`, `python`…
- **Claude Code'u telefondan sür** — projeye tek dokunuşla `claude` başlatılır. Telefon uykuya
  geçse ya da bağlantı kopsa da oturum bilgisayarda yaşamaya devam eder; geri dönünce son
  çıktıyla birlikte kaldığın yerden devam edersin.
- **GitHub projeleri** — depolarını listele, tek dokunuşla klonla; durum, fark, geçmiş, pull,
  commit, push butonları.
- **Dosyalar** — klasörlerde gez, dosya aç/düzenle/kaydet, yeni dosya/klasör, yeniden adlandır,
  sil. Dosya sen açtıktan sonra başkası (ör. Claude) değiştirdiyse üzerine yazmadan uyarır.
- **Önizleme** — bilgisayarda çalışan geliştirme sunucusunu (`npm run dev` → 3000 portu gibi)
  telefonda aç.

```
 Telefon (tarayıcı / PWA)  ──WebSocket + HTTPS──▶  Bilgisayar: kumanda sunucusu
   terminal · projeler · dosyalar · önizleme          └─ PowerShell / bash (gerçek PTY)
                                                         └─ claude, git, npm …
```

## Kurulum (bilgisayar)

Gerekenler: [Node.js](https://nodejs.org) 18+ (LTS önerilir) ve Git.

```powershell
git clone https://github.com/Sparklectro/Aeonideq1.git
cd Aeonideq1\kumanda
npm install
npm start          # ya da Windows'ta baslat.cmd'ye çift tıkla
```

Sunucu açılınca bağlantı adreslerini ve bir **QR kod** yazdırır:

```
  Kumanda çalışıyor
  Kabuk     : pwsh.exe (pty)
  Projeler  : C:\Users\batu\kumanda-projeler

  http://localhost:7681/#token=…
  http://192.168.1.34:7681/#token=…
```

Telefon aynı Wi-Fi'deyse QR'ı okut, o kadar. Bağlantıdaki anahtar telefona kaydedilir ve
adres çubuğundan silinir. Chrome'da **⋮ → Ana ekrana ekle** (iPhone'da Safari **Paylaş →
Ana Ekrana Ekle**) ile uygulama gibi tam ekran açılır.

> İlk açılışta Windows Güvenlik Duvarı izin isteyebilir; **Özel ağlar** için izin ver.

## Evin dışından erişim (önerilen: Tailscale)

Portu internete doğrudan açma — anahtarı ele geçiren bilgisayarının tamamına erişir.
Bunun yerine [Tailscale](https://tailscale.com) kullan (kişisel kullanım ücretsiz):

1. Bilgisayara ve telefona Tailscale'i kur, aynı hesapla giriş yap.
2. Bilgisayarda HTTPS ile yayınla:
   ```powershell
   tailscale serve --bg 7681
   ```
3. Telefonda `https://<bilgisayar-adı>.<tailnet>.ts.net/#token=…` adresini aç.

HTTPS üzerinden açınca ek olarak **pano (Yapıştır)**, **çevrimdışı açılış** ve tam PWA
kurulumu da çalışır. Yerel ağda düz `http://` ile bunlar tarayıcı tarafından kısıtlanır;
Yapıştır tuşu o durumda bir metin kutusu açar.

## Telefonda kullanım ipuçları

- **Tuş çubuğu**: Esc, Tab, Ctrl, Alt, oklar, ^C/^D/^Z/^R/^L, Home/End/PgUp/PgDn ve klavyede
  zor bulunan `| / \ ~ $ & * < > { } [ ]` karakterleri. **Ctrl**'e bas, sonra harfe bas → Ctrl+harf.
- **Hızlı komutlar** (turuncu satır): `claude`, `claude -c`, `git status`… Ayarlar'dan
  `etiket=komut` biçiminde istediğin gibi düzenle.
- **Metin** tuşu: terminal çıktısını seçilebilir düz metin olarak açar (mobilde kopyalamak için).
- **Satır modu** (Ayarlar): klavyenin otomatik düzeltmesi terminale garip karakterler
  gönderiyorsa, komutu önce normal bir kutuya yazıp sonra gönderirsin; ↑/↓ ile geçmiş.
- **A− / A+**: yazı boyutu.

## GitHub

"Depoları getir" için bir jeton gerekir. İki yol:

- Bilgisayarda bir kez `gh auth login` yap (GitHub CLI) — Kumanda onu kendiliğinden kullanır.
- Ya da Ayarlar'a bir [kişisel erişim jetonu](https://github.com/settings/tokens) yapıştır
  (`repo` izni yeterli). Jeton yalnızca bilgisayarda, `~/.kumanda/config.json` içinde durur.

Klonlama ve pull/push sırasında jeton yalnızca o komuta başlık olarak verilir; projenin
`.git/config` dosyasına yazılmaz.

## Ayarlar

`~/.kumanda/config.json` (ilk çalıştırmada oluşur) ya da ortam değişkenleri:

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `KUMANDA_PORT` | `7681` | Dinlenen port |
| `KUMANDA_HOST` | `0.0.0.0` | Sadece Tailscale kullanacaksan `127.0.0.1` yap |
| `KUMANDA_WORKSPACE` | `~/kumanda-projeler` | Projelerin klonlandığı klasör |
| `KUMANDA_SHELL` | PowerShell 7 → Windows PowerShell; Unix'te `$SHELL` | Kabuk |
| `KUMANDA_TOKEN` | rastgele üretilir | Erişim anahtarı |
| `GITHUB_TOKEN` | — | GitHub jetonu |

Anahtarı yenilemek için `config.json` içindeki `token` satırını silip sunucuyu yeniden başlat.

## Bilgisayar açılınca otomatik başlasın (Windows)

`Win + R` → `shell:startup` → açılan klasöre `baslat.cmd` için bir kısayol koy.

## Sunucuyu telefonda çalıştırmak (Android / Termux)

Bilgisayar olmadan telefonun kendisini de yönetebilirsin:

```sh
pkg install nodejs git util-linux
git clone https://github.com/Sparklectro/Aeonideq1.git && cd Aeonideq1/kumanda
npm install        # node-pty derlenemezse sorun değil, "script" yedek moduna geçer
./baslat.sh
```

Sonra telefonun tarayıcısında `http://localhost:7681/#token=…` adresini aç.

## Güvenlik

- Erişim anahtarı = bilgisayarın üzerinde tam yetki. Kimseyle paylaşma.
- 5 hatalı denemeden sonra o adres 1 dakika kilitlenir.
- Portu modemden dışarı açma; uzaktan erişim için Tailscale (ya da Cloudflare Tunnel + Access)
  kullan.

## Geliştirme

```sh
npm test           # sunucu, terminal, dosya ve git testleri
```

- `server/` — Node.js: HTTP + WebSocket, PTY oturumları (`@lydell/node-pty`, hazır derlenmiş;
  yoksa `script`/boru yedeği), dosya ve git API'leri.
- `client/` — derleme adımı olmayan PWA: xterm.js terminal, mobil tuş çubuğu, projeler,
  dosya editörü, önizleme.

Sıradaki adımlar için fikirler: Capacitor ile Play Store'a konabilen yerel Android paketi,
sözdizimi renklendirmeli editör (CodeMirror), bildirim (uzun süren komut / Claude bitti),
birden çok bilgisayarı tek uygulamadan yönetme.
