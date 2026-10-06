---
name: video-muzik-tanima
description: Bir videodaki arka plan müziğini/şarkıları tanır; sanatçı, şarkı adı, albüm, yıl, tür, plak şirketi, ISRC, videoda çaldığı zaman aralıkları ve Spotify/Apple Music/YouTube linklerini verir. "Bu videodaki şarkı ne", "arkadaki müzik kimin", "videodaki müziği bul", "şarkıyı tanı", "what song is in this video" isteklerinde, kullanıcı bir video dosyası veya YouTube/Instagram/TikTok/X linki verdiğinde kullan.
---

# Video Müzik Tanıma

Videodaki sesi kayan pencerelere bölüp her pencereyi Shazam parmak iziyle tanır,
sonuçları birleştirip zaman çizelgeli bir şarkı listesi üretir.

## Kurulum (oturumda bir kez)

```bash
command -v ffmpeg || (apt-get install -y ffmpeg || brew install ffmpeg)
pip install -r scripts/requirements.txt
```

`scripts/` bu SKILL.md dosyasının yanındaki klasördür; komutları skill klasörünün tam yolu ile çalıştır.

## Çalıştırma

```bash
python scripts/muzik_tanima.py "<video_dosyası_veya_URL>" --json
```

Seçenekler:
- `--adim 15` / `--pencere 12`: pencereler arası adım ve pencere uzunluğu (sn). Kısa
  videolarda (Reels/TikTok < 60 sn) veya müziğin sık değiştiği montajlarda `--adim 6` kullan.
  Uzun videolarda (> 20 dk) `--adim 30` ile hızlandır.
- `--konusma-bastirma-yok`: konuşmayı bastırarak yeniden denemeyi kapatır (daha hızlı).
- `--zenginlestirme-yok`: MusicBrainz sorgusunu atlar.
- `AUDD_API_TOKEN` ortam değişkeni varsa AudD yedek servis olarak devreye girer.

## Akış

1. Kullanıcının verdiği dosya yolunu ya da linki al. Birden fazla video varsa her biri için ayrı çalıştır.
2. Betiği `--json` ile çalıştır. İlerleme stderr'e, sonuç stdout'a yazılır.
3. JSON'daki `sarkilar` listesini aşağıdaki formatta Türkçe sun.
4. Sonuç boşsa veya güven düşükse "Sorun giderme" bölümünü uygula.

## Sunum formatı

Her şarkı için:

```
🎵 <Sanatçı> — <Şarkı adı>
• Albüm: … (Yıl) · Tür: … · Plak şirketi: …
• Videoda çaldığı yer: 00:15–01:02
• Şarkının ~01:03'ünden itibaren kullanılmış      (sarkidaki_konum_sn varsa)
• Linkler: Spotify · Apple Music · YouTube · Shazam
• Sözler: Shazam · Genius · Musixmatch      (+ "Söz/beste: …" kredisi varsa)
• Güven: %70 (7 eşleşme)
```

Kurallar:
- Yalnızca JSON'da gelen bilgiyi yaz; eksik alanı uydurma, satırı atla.
- `guven` < 0.15 ve `eslesme_sayisi` == 1 ise sonucu "olası eşleşme" diye işaretle.
- Birden çok şarkı varsa videodaki sıraya göre listele.
- `platform_ipucu` içinde `track`/`artist` varsa (YouTube'un "Bu videodaki müzik" etiketi gibi)
  bunu da belirt; Shazam sonucuyla çelişiyorsa ikisini de göster.
- Şarkı sözlerinin metnini yazma, alıntılama ya da başka kaynaktan çekip ekleme (telifli içerik).
  Bunun yerine `linkler.sozler_*` linklerini ver; `ekstra.sozler_mevcut` true ise Shazam sayfasında
  sözlerin bulunduğunu, `ekstra.soz_kredisi` varsa söz/beste kredisini belirt.

## Sorun giderme

- **"Tanıma servislerine ulaşılamadı"**: Ağ `amp.shazam.com` (ve URL için ilgili platform)
  erişimine izin vermiyor. Kullanıcıya betiği kendi bilgisayarında çalıştırmasını öner:
  `pip install -r requirements.txt && python muzik_tanima.py <video>`; yerel web arayüzü için `--web`.
- **Hiç eşleşme yok**: Müzik telifsiz/stok, özgün beste, çok kısık ya da hızlandırılmış/perdesi
  değiştirilmiş olabilir. `--adim 5` ile tekrar dene. Hâlâ yoksa `platform_ipucu.title`/video
  açıklamasındaki ipuçlarını, varsa web aramasını kullan ve bunun tahmin olduğunu açıkça söyle.
- **URL indirilemiyor** (giriş gerektiren/özel video): kullanıcıdan dosyayı doğrudan yüklemesini iste.
- **Python 3.13+ `audioop` hatası**: `pip install audioop-lts`.
