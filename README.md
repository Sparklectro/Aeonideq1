# Aeonideq1

Kişisel projeler deposu.

| Klasör | Ne işe yarar |
| --- | --- |
| [`muzik-tanima/`](muzik-tanima/) | 🎵 Videodaki arka plan müziğini/şarkıyı tanıyan araç (CLI + web arayüzü) |
| [`.claude/skills/video-muzik-tanima/`](.claude/skills/video-muzik-tanima/) | Aynı aracın Claude skill'i |
| [`civilti/`](civilti/) | 🐦 Django ile yazılmış Twitter benzeri mikroblog uygulaması |

---

## 🎵 Video Müzik Tanıma

Bir video dosyası ya da linki (YouTube, Instagram, TikTok, X…) verin; arkada çalan şarkıyı bulur:

- **Sanatçı, şarkı adı, albüm, yıl, tür, plak şirketi, ISRC**
- Şarkının **videoda çaldığı zaman aralıkları** ve şarkının hangi saniyesinden kullanıldığı
- **Spotify / Apple Music / YouTube Music / Shazam** linkleri
- Şarkı sözleri için **Shazam / Genius / Musixmatch** linkleri ve söz/beste kredisi

```bash
cd muzik-tanima
pip install -r requirements.txt      # ffmpeg de kurulu olmalı
python muzik_tanima.py video.mp4
python muzik_tanima.py "https://www.youtube.com/watch?v=..."
python muzik_tanima.py --web         # tarayıcı arayüzü: http://127.0.0.1:8765
```

Örnek çıktı:

```
1. Iva Sativa — Kanapel (Qrawlly DnB Version)
   Albüm        : Kanapel - EP
   Tür          : Electronic
   ISRC         : QZNJV2214756
   Videoda      : 00:00–00:38
   Şarkıda      : ~00:47 civarı kullanılmış
   Güven        : %100 (6 eşleşme, kaynak: shazam)
```

Nasıl çalıştığı, seçenekler ve sınırlar için: [`muzik-tanima/README.md`](muzik-tanima/README.md).

### Claude skill'i

- **Claude Code:** bu depoda çalışırken skill otomatik yüklenir. "Bu videodaki şarkı ne?" demeniz yeterli.
- **claude.ai:** [`muzik-tanima/dist/video-muzik-tanima.skill`](muzik-tanima/dist/video-muzik-tanima.skill)
  dosyasını *Ayarlar → Yetenekler* bölümünden yükleyin.
- Bulut oturumunda çalıştırmak için ortamın ağ ayarında `amp.shazam.com` (ve isteğe bağlı
  `musicbrainz.org`) izinli olmalı.

---

## 🐦 Civilti

Django ile yazılmış basit bir mikroblog uygulaması: kayıt olma / giriş, tweet akışı, profil,
kullanıcı takip etme, takipçi ve takip edilen listeleri.

```bash
cd civilti
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver           # http://127.0.0.1:8000
```
