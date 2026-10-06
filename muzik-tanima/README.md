# 🎵 Video Müzik Tanıma

Herhangi bir videodaki arka plan müziğini ve şarkıları tanır: **sanatçı, şarkı adı, albüm,
yıl, tür, plak şirketi, ISRC**, şarkının **videoda çaldığı zaman aralıkları**, şarkının hangi
saniyesinden kullanıldığı ve **Spotify / Apple Music / YouTube / Shazam / MusicBrainz** linkleri.

Hem yerel dosya (`.mp4`, `.mov`, `.mkv`, `.webm`, ses dosyaları…) hem de link
(YouTube, Instagram, TikTok, X, Facebook… — yt-dlp'nin desteklediği her yer) kabul eder.

## Kurulum

```bash
# ffmpeg gerekli
sudo apt install ffmpeg        # macOS: brew install ffmpeg / Windows: winget install ffmpeg
pip install -r requirements.txt
```

## Kullanım

```bash
python muzik_tanima.py video.mp4
python muzik_tanima.py "https://www.youtube.com/watch?v=..."
python muzik_tanima.py video.mp4 --json          # makine tarafından okunabilir çıktı
python muzik_tanima.py reels.mp4 --adim 6        # kısa/hızlı kurgulu videolar için daha sık tarama
python muzik_tanima.py --web                     # tarayıcı arayüzü: http://127.0.0.1:8765
```

Örnek çıktı:

```
🎵 Müzik tanıma sonucu — video.mp4
   Video süresi: 02:10, taranan pencere: 9

1. Sanatçı — Şarkı Adı
   Albüm        : Albüm Adı
   Yıl          : 2021
   Tür          : Pop
   Plak şirketi : …
   ISRC         : …
   Videoda      : 00:00–01:12
   Şarkıda      : ~01:03 civarı kullanılmış
   Güven        : %56 (5 eşleşme, kaynak: shazam, shazam+konusma_bastirma)
   🔗 spotify: …
   🔗 apple_music: …
```

## Nasıl çalışır?

1. Link verildiyse **yt-dlp** ile yalnızca ses indirilir (platformun kendi müzik etiketi de ipucu olarak okunur).
2. **ffmpeg** sesi 12 sn'lik pencerelere böler (varsayılan 15 sn adımla).
3. Her pencere **Shazam** parmak izi ile tanınır (`shazamio`, API anahtarı gerekmez).
4. Eşleşme yoksa **konuşma bastırma** ile tekrar denenir: stereo kayıtlarda merkezdeki
   konuşma L−R farkıyla iptal edilir, konuşma bandı zayıflatılır — vlog/röportaj altındaki müzik için.
5. İsteğe bağlı **AudD** yedeği: `export AUDD_API_TOKEN=...`
6. Aynı şarkının ardışık eşleşmeleri birleştirilir, **MusicBrainz** ile ilk yayın tarihi, süre ve albüm bilgisi tamamlanır.

## Claude skill'i

Aynı araç `.claude/skills/video-muzik-tanima/` altında bir Claude skill'i olarak da var:

- **Claude Code**: bu depoda çalışırken otomatik yüklenir — "bu videodaki şarkı ne?" demeniz yeterli.
- **claude.ai**: `./skill_paketle.sh` çalıştırın, oluşan `dist/video-muzik-tanima.skill` dosyasını
  *Ayarlar → Yetenekler (Skills)* bölümünden yükleyin.

`muzik_tanima.py` güncellendiğinde skill kopyasını eşitlemek için `./skill_paketle.sh` yeniden çalıştırılmalı.

## Testler

```bash
python -m unittest test_muzik_tanima.py
```

Testler ağ gerektirmez; Shazam yanıtı taklit edilerek sentetik bir video üzerinde uçtan uca akış doğrulanır.

## Sınırlar

- Telifsiz/stok müzik, özgün besteler ve Shazam veritabanında olmayan parçalar tanınamaz.
- Hızı/perdesi değiştirilmiş (sped up, slowed, nightcore) sürümler sıklıkla tanınmaz.
- Shazam resmi olmayan bir uç noktadır; yoğun kullanımda hız sınırına takılabilir. Ticari kullanım için ACRCloud/AudD gibi ücretli API'ler önerilir.
