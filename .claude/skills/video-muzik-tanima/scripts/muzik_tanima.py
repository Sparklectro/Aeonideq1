#!/usr/bin/env python3
"""Videodaki arka plan müziğini / şarkıları tanıyan araç.

Kullanım:
    python muzik_tanima.py VIDEO_YOLU_VEYA_URL [--json] [--adim 15] [--pencere 12]
    python muzik_tanima.py --web            # yerel web arayüzü (http://127.0.0.1:8765)

Akış:
    1. URL verildiyse yt-dlp ile sesi indir (YouTube, Instagram, TikTok, X ...).
    2. ffmpeg ile videodan sesi çıkar, kayan pencerelere böl.
    3. Her pencereyi Shazam parmak izi ile tanı; olmazsa konuşmayı bastırarak
       (stereo merkez iptali + bant geçiren filtre) yeniden dene.
    4. İsteğe bağlı: AudD (AUDD_API_TOKEN) yedek tanıma, MusicBrainz zenginleştirme.
    5. Aynı şarkının ardışık eşleşmelerini birleştirip zaman çizelgesi üret.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

USER_AGENT = "video-muzik-tanima/1.0 (https://github.com/sparklectro/aeonideq1)"
ORNEK_HIZI = 44100


# --------------------------------------------------------------------------- #
# Veri modelleri
# --------------------------------------------------------------------------- #


@dataclass
class Eslesme:
    """Tek bir ses penceresinin tanıma sonucu."""

    baslangic: float
    bitis: float
    kaynak: str
    anahtar: str
    sarki: str
    sanatci: str
    detay: dict[str, Any] = field(default_factory=dict)


@dataclass
class Sarki:
    """Videoda bulunan bir şarkı (birden çok pencerenin birleşimi)."""

    sarki: str
    sanatci: str
    album: Optional[str] = None
    yil: Optional[str] = None
    tur: Optional[str] = None
    plak_sirketi: Optional[str] = None
    isrc: Optional[str] = None
    sarkidaki_konum_sn: Optional[float] = None
    kapak: Optional[str] = None
    linkler: dict[str, str] = field(default_factory=dict)
    ekstra: dict[str, Any] = field(default_factory=dict)
    zaman_araliklari: list[list[float]] = field(default_factory=list)
    eslesme_sayisi: int = 0
    guven: float = 0.0
    kaynaklar: list[str] = field(default_factory=list)


# --------------------------------------------------------------------------- #
# Ses hazırlama
# --------------------------------------------------------------------------- #


def bagimliliklari_kontrol_et() -> None:
    eksik = [p for p in ("ffmpeg", "ffprobe") if shutil.which(p) is None]
    if eksik:
        sys.exit(f"Hata: {', '.join(eksik)} bulunamadı. Lütfen ffmpeg kurun.")


def url_mi(girdi: str) -> bool:
    return urllib.parse.urlparse(girdi).scheme in ("http", "https")


def url_indir(url: str, hedef_klasor: Path) -> tuple[Path, dict[str, Any]]:
    """yt-dlp ile yalnızca sesi indirir; dosya yolu ve video bilgisini döndürür."""
    try:
        import yt_dlp  # type: ignore
    except ImportError:
        sys.exit("Hata: URL desteği için `pip install yt-dlp` gerekli.")

    secenekler = {
        "format": "bestaudio/best",
        "outtmpl": str(hedef_klasor / "indirilen.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(secenekler) as ydl:
        bilgi = ydl.extract_info(url, download=True)
        yol = Path(ydl.prepare_filename(bilgi))

    # Platformun kendi müzik etiketi varsa (YouTube "Music in this video", TikTok sesi)
    # bunu ipucu olarak sakla.
    ipucu = {
        k: bilgi.get(k)
        for k in ("title", "uploader", "track", "artist", "album", "release_year", "duration")
        if bilgi.get(k)
    }
    return yol, ipucu


def sure_bul(dosya: Path) -> float:
    cikti = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(dosya),
        ],
        capture_output=True, text=True, check=False,
    )
    try:
        return float(cikti.stdout.strip())
    except ValueError:
        sys.exit(f"Hata: '{dosya}' içinde okunabilir ses bulunamadı.")


def kanal_sayisi(dosya: Path) -> int:
    cikti = subprocess.run(
        [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=channels", "-of", "csv=p=0", str(dosya),
        ],
        capture_output=True, text=True, check=False,
    )
    try:
        return int(cikti.stdout.strip().splitlines()[0])
    except (ValueError, IndexError):
        return 0


def pencere_cikar(dosya: Path, baslangic: float, sure: float, konusma_bastir: bool,
                  stereo: bool) -> bytes:
    """Belirtilen aralığı mono 44.1 kHz 16-bit WAV olarak döndürür."""
    filtreler = []
    if konusma_bastir:
        if stereo:
            # Konuşma genelde merkezdedir; L-R farkı merkezdeki sesi iptal eder.
            filtreler.append("pan=mono|c0=0.5*c0-0.5*c1")
        # Konuşma enerjisinin yoğun olduğu bandı zayıflat, müziği öne çıkar.
        filtreler.append("equalizer=f=1000:t=q:w=1.2:g=-8")
        filtreler.append("loudnorm")
    else:
        filtreler.append("loudnorm")

    komut = [
        "ffmpeg", "-v", "error", "-ss", f"{baslangic:.2f}", "-t", f"{sure:.2f}",
        "-i", str(dosya), "-vn", "-af", ",".join(filtreler),
        "-ac", "1", "-ar", str(ORNEK_HIZI), "-f", "wav", "-y",
    ]
    # Pipe yerine dosya: WAV başlığına gerçek uzunluk yazılsın (Shazam çözücüsü bunu ister).
    with tempfile.TemporaryDirectory(prefix="pencere_") as g:
        hedef = Path(g) / "p.wav"
        subprocess.run([*komut, str(hedef)], capture_output=True, check=True)
        return hedef.read_bytes()


def pencereleri_planla(toplam: float, pencere: float, adim: float) -> list[tuple[float, float]]:
    if toplam <= pencere:
        return [(0.0, toplam)]
    araliklar = []
    t = 0.0
    while t + pencere <= toplam + 0.01:
        araliklar.append((t, pencere))
        t += adim
    # Sonda kalan kısmı da kapsa
    son_bas = max(0.0, toplam - pencere)
    if not araliklar or araliklar[-1][0] < son_bas - adim / 2:
        araliklar.append((son_bas, pencere))
    return araliklar


# --------------------------------------------------------------------------- #
# Tanıma servisleri
# --------------------------------------------------------------------------- #


class ShazamTanima:
    ad = "shazam"

    def __init__(self) -> None:
        try:
            from aiohttp_retry import ExponentialRetry
            from shazamio import HTTPClient, Shazam
        except ImportError as e:  # pragma: no cover - kurulum hatası
            sys.exit(f"Hata: shazamio yüklenemedi ({e}). `pip install -r requirements.txt` çalıştırın.")
        self.shazam = Shazam(
            language="tr-TR",
            endpoint_country="TR",
            http_client=HTTPClient(
                retry_options=ExponentialRetry(attempts=3, max_timeout=10,
                                               statuses={500, 502, 503, 504, 429}),
            ),
        )
        self.proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")

    async def tani(self, wav: bytes) -> Optional[dict[str, Any]]:
        yanit = await self.shazam.recognize(wav, proxy=self.proxy)
        return shazam_ayristir(yanit)


def _bolum_metadata(track: dict[str, Any]) -> dict[str, str]:
    meta = {}
    for bolum in track.get("sections", []) or []:
        for m in bolum.get("metadata", []) or []:
            if m.get("title") and m.get("text"):
                meta[m["title"]] = m["text"]
    return meta


def shazam_ayristir(yanit: dict[str, Any]) -> Optional[dict[str, Any]]:
    track = (yanit or {}).get("track")
    if not track:
        return None

    meta = _bolum_metadata(track)
    linkler: dict[str, str] = {}
    if track.get("url"):
        linkler["shazam"] = track["url"]
    for secenek in (track.get("hub") or {}).get("options", []) or []:
        for aksiyon in secenek.get("actions", []) or []:
            uri = aksiyon.get("uri", "")
            if uri.startswith("https://music.apple.com") or "itunes.apple.com" in uri:
                linkler.setdefault("apple_music", uri)
    for saglayici in (track.get("hub") or {}).get("providers", []) or []:
        tip = (saglayici.get("type") or "").lower()
        for aksiyon in saglayici.get("actions", []) or []:
            uri = aksiyon.get("uri", "")
            if tip and uri:
                linkler.setdefault(tip, uri)
    for bolum in track.get("sections", []) or []:
        if bolum.get("type") == "VIDEO" and (bolum.get("youtubeurl") or {}).get("actions"):
            uri = bolum["youtubeurl"]["actions"][0].get("uri")
            if uri:
                linkler.setdefault("youtube", uri)

    eslesmeler = yanit.get("matches") or [{}]
    konum = eslesmeler[0].get("offset")
    lyrics = any(b.get("type") == "LYRICS" for b in track.get("sections", []) or [])

    return {
        "anahtar": f"shazam:{track.get('key')}",
        "sarki": track.get("title", "?"),
        "sanatci": track.get("subtitle", "?"),
        "album": meta.get("Album") or meta.get("Albüm"),
        "yil": meta.get("Released") or meta.get("Yayınlanma"),
        "plak_sirketi": meta.get("Label") or meta.get("Plak Şirketi"),
        "tur": (track.get("genres") or {}).get("primary"),
        "isrc": track.get("isrc"),
        "kapak": (track.get("images") or {}).get("coverarthq")
        or (track.get("images") or {}).get("coverart"),
        "sarkidaki_konum_sn": round(konum, 1) if isinstance(konum, (int, float)) else None,
        "linkler": linkler,
        "ekstra": {"explicit": track.get("hub", {}).get("explicit"), "sozler_mevcut": lyrics},
    }


class AuddTanima:
    """AudD.io yedek tanıma (AUDD_API_TOKEN ortam değişkeni gerekir)."""

    ad = "audd"

    def __init__(self, token: str) -> None:
        self.token = token

    async def tani(self, wav: bytes) -> Optional[dict[str, Any]]:
        return await asyncio.to_thread(self._tani, wav)

    def _tani(self, wav: bytes) -> Optional[dict[str, Any]]:
        govde = urllib.parse.urlencode({
            "api_token": self.token,
            "audio": base64.b64encode(wav).decode(),
            "return": "apple_music,spotify,musicbrainz",
        }).encode()
        istek = urllib.request.Request("https://api.audd.io/", data=govde,
                                       headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(istek, timeout=30) as r:
            yanit = json.load(r)
        return audd_ayristir(yanit)


def audd_ayristir(yanit: dict[str, Any]) -> Optional[dict[str, Any]]:
    if yanit.get("status") != "success" or not yanit.get("result"):
        return None
    s = yanit["result"]
    linkler = {}
    if s.get("song_link"):
        linkler["song_link"] = s["song_link"]
    if (s.get("spotify") or {}).get("external_urls", {}).get("spotify"):
        linkler["spotify"] = s["spotify"]["external_urls"]["spotify"]
    if (s.get("apple_music") or {}).get("url"):
        linkler["apple_music"] = s["apple_music"]["url"]
    am = s.get("apple_music") or {}
    return {
        "anahtar": f"isrc:{am['isrc']}" if am.get("isrc") else f"audd:{s.get('artist')}|{s.get('title')}",
        "sarki": s.get("title", "?"),
        "sanatci": s.get("artist", "?"),
        "album": s.get("album"),
        "yil": s.get("release_date"),
        "plak_sirketi": s.get("label"),
        "tur": (am.get("genreNames") or [None])[0],
        "isrc": am.get("isrc"),
        "kapak": None,
        "sarkidaki_konum_sn": None,
        "linkler": linkler,
        "ekstra": {},
    }


# --------------------------------------------------------------------------- #
# MusicBrainz zenginleştirme (ücretsiz, anahtar gerekmez)
# --------------------------------------------------------------------------- #


def _mb_get(yol: str, parametreler: dict[str, str]) -> dict[str, Any]:
    url = f"https://musicbrainz.org/ws/2/{yol}?{urllib.parse.urlencode({**parametreler, 'fmt': 'json'})}"
    istek = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(istek, timeout=15) as r:
        return json.load(r)


def musicbrainz_zenginlestir(sarki: Sarki) -> None:
    try:
        if sarki.isrc:
            veri = _mb_get(f"isrc/{sarki.isrc}", {"inc": "artist-credits+releases"})
            kayitlar = veri.get("recordings", [])
        else:
            sorgu = f'recording:"{sarki.sarki}" AND artist:"{sarki.sanatci}"'
            veri = _mb_get("recording", {"query": sorgu, "limit": "3"})
            kayitlar = [k for k in veri.get("recordings", []) if k.get("score", 0) >= 90]
        if not kayitlar:
            return
        k = kayitlar[0]
        mb = sarki.ekstra.setdefault("musicbrainz", {})
        mb["kayit_id"] = k.get("id")
        if k.get("length"):
            mb["sure_sn"] = round(k["length"] / 1000)
        if k.get("first-release-date"):
            mb["ilk_yayin"] = k["first-release-date"]
            sarki.yil = sarki.yil or k["first-release-date"][:4]
        surumler = k.get("releases") or []
        if surumler:
            mb["surumler"] = sorted({r.get("title") for r in surumler if r.get("title")})[:5]
            sarki.album = sarki.album or surumler[0].get("title")
        sarki.linkler.setdefault("musicbrainz", f"https://musicbrainz.org/recording/{k.get('id')}")
        time.sleep(1)  # MusicBrainz: saniyede en fazla 1 istek
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        pass


# --------------------------------------------------------------------------- #
# Birleştirme
# --------------------------------------------------------------------------- #


def eslesmeleri_birlestir(eslesmeler: list[Eslesme], pencere_sayisi: int,
                          bosluk_toleransi: float) -> list[Sarki]:
    gruplar: dict[str, Sarki] = {}
    sira: list[str] = []
    for e in sorted(eslesmeler, key=lambda x: x.baslangic):
        # Aynı şarkı farklı servislerden farklı anahtarla gelebilir: isim+sanatçı ile de eşle.
        isim_anahtari = f"{e.sanatci.lower().strip()}|{e.sarki.lower().strip()}"
        anahtar = next((a for a in sira
                        if a.startswith(e.anahtar + "#") or a.endswith("#" + isim_anahtari)), None)
        if anahtar is None:
            anahtar = f"{e.anahtar}#{isim_anahtari}"
            sira.append(anahtar)
            d = e.detay
            gruplar[anahtar] = Sarki(
                sarki=e.sarki, sanatci=e.sanatci, album=d.get("album"), yil=d.get("yil"),
                tur=d.get("tur"), plak_sirketi=d.get("plak_sirketi"), isrc=d.get("isrc"),
                sarkidaki_konum_sn=d.get("sarkidaki_konum_sn"), kapak=d.get("kapak"),
                linkler=dict(d.get("linkler") or {}), ekstra=dict(d.get("ekstra") or {}),
            )
        s = gruplar[anahtar]
        s.eslesme_sayisi += 1
        if e.kaynak not in s.kaynaklar:
            s.kaynaklar.append(e.kaynak)
        for alan in ("album", "yil", "tur", "plak_sirketi", "isrc", "kapak"):
            if getattr(s, alan) is None and e.detay.get(alan):
                setattr(s, alan, e.detay[alan])
        for k, v in (e.detay.get("linkler") or {}).items():
            s.linkler.setdefault(k, v)
        if s.zaman_araliklari and e.baslangic <= s.zaman_araliklari[-1][1] + bosluk_toleransi:
            s.zaman_araliklari[-1][1] = max(s.zaman_araliklari[-1][1], round(e.bitis, 1))
        else:
            s.zaman_araliklari.append([round(e.baslangic, 1), round(e.bitis, 1)])

    sonuc = [gruplar[a] for a in sira]
    for s in sonuc:
        s.guven = round(s.eslesme_sayisi / max(pencere_sayisi, 1), 2)
    return sonuc


# --------------------------------------------------------------------------- #
# Ana akış
# --------------------------------------------------------------------------- #


def _log(mesaj: str, sessiz: bool) -> None:
    if not sessiz:
        print(mesaj, file=sys.stderr, flush=True)


async def videoyu_analiz_et(girdi: str, pencere: float = 12.0, adim: float = 15.0,
                            konusma_bastir: bool = True, zenginlestir: bool = True,
                            sessiz: bool = False) -> dict[str, Any]:
    bagimliliklari_kontrol_et()
    with tempfile.TemporaryDirectory(prefix="muzik_tanima_") as gecici:
        ipucu: dict[str, Any] = {}
        if url_mi(girdi):
            _log(f"⬇  İndiriliyor: {girdi}", sessiz)
            dosya, ipucu = url_indir(girdi, Path(gecici))
        else:
            dosya = Path(girdi).expanduser()
            if not dosya.exists():
                raise FileNotFoundError(f"Dosya bulunamadı: {dosya}")

        toplam = sure_bul(dosya)
        stereo = kanal_sayisi(dosya) >= 2
        plan = pencereleri_planla(toplam, pencere, adim)
        _log(f"🎬 Süre: {sure_metni(toplam)} — {len(plan)} pencere taranacak", sessiz)

        servisler: list[Any] = [ShazamTanima()]
        if os.environ.get("AUDD_API_TOKEN"):
            servisler.append(AuddTanima(os.environ["AUDD_API_TOKEN"]))

        eslesmeler: list[Eslesme] = []
        hatalar: list[str] = []
        for i, (bas, sure) in enumerate(plan, 1):
            denemeler = [False, True] if konusma_bastir else [False]
            bulundu = None
            for servis in servisler:
                for bastir in denemeler:
                    try:
                        wav = pencere_cikar(dosya, bas, sure, bastir, stereo)
                        bulundu = await servis.tani(wav)
                    except Exception as e:  # ağ / servis hatası: devam et
                        hatalar.append(f"{sure_metni(bas)} {servis.ad}: {type(e).__name__}: {e}")
                        bulundu = None
                    if bulundu:
                        bulundu["_kaynak"] = servis.ad + ("+konusma_bastirma" if bastir else "")
                        break
                if bulundu:
                    break
            durum = f"✔ {bulundu['sanatci']} — {bulundu['sarki']}" if bulundu else "·"
            _log(f"  [{i}/{len(plan)}] {sure_metni(bas)}–{sure_metni(bas + sure)}  {durum}", sessiz)
            if bulundu:
                eslesmeler.append(Eslesme(
                    baslangic=bas, bitis=bas + sure, kaynak=bulundu.pop("_kaynak"),
                    anahtar=bulundu["anahtar"], sarki=bulundu["sarki"],
                    sanatci=bulundu["sanatci"], detay=bulundu,
                ))
            await asyncio.sleep(0.5)  # servisleri yormamak için

        sarkilar = eslesmeleri_birlestir(eslesmeler, len(plan), bosluk_toleransi=adim + 1)
        if zenginlestir:
            for s in sarkilar:
                musicbrainz_zenginlestir(s)

        return {
            "girdi": girdi,
            "sure_sn": round(toplam, 1),
            "taranan_pencere": len(plan),
            "platform_ipucu": ipucu,
            "sarkilar": [asdict(s) for s in sarkilar],
            "hata_sayisi": len(hatalar),
            "hatalar": hatalar[:20],
        }


def sure_metni(sn: float) -> str:
    sn = int(round(sn))
    s, kalan = divmod(sn, 3600)
    d, sn = divmod(kalan, 60)
    return f"{s}:{d:02d}:{sn:02d}" if s else f"{d:02d}:{sn:02d}"


def rapor_yaz(sonuc: dict[str, Any]) -> str:
    satirlar = [f"\n🎵 Müzik tanıma sonucu — {sonuc['girdi']}",
                f"   Video süresi: {sure_metni(sonuc['sure_sn'])}, "
                f"taranan pencere: {sonuc['taranan_pencere']}\n"]
    ipucu = sonuc.get("platform_ipucu") or {}
    if ipucu.get("track") or ipucu.get("artist"):
        satirlar.append(f"ℹ  Platformun müzik etiketi: {ipucu.get('artist', '?')} — {ipucu.get('track', '?')}\n")

    if not sonuc["sarkilar"] and sonuc.get("hata_sayisi", 0) >= sonuc["taranan_pencere"]:
        satirlar.append("⚠  Tanıma servislerine ulaşılamadı; internet bağlantısını / proxy ayarını kontrol edin.")
        satirlar.append(f"   İlk hata: {sonuc['hatalar'][0]}")
        return "\n".join(satirlar)
    if not sonuc["sarkilar"]:
        satirlar.append("❌ Tanınan şarkı yok. Olası nedenler: müzik özgün/telifsiz (stok) olabilir, "
                        "çok kısık veya hızı/perdesi değiştirilmiş olabilir.")
        if sonuc["hatalar"]:
            satirlar.append(f"   ({len(sonuc['hatalar'])} servis hatası oluştu; ilki: {sonuc['hatalar'][0]})")
        return "\n".join(satirlar)

    for no, s in enumerate(sonuc["sarkilar"], 1):
        satirlar.append(f"{no}. {s['sanatci']} — {s['sarki']}")
        for etiket, deger in (
            ("Albüm", s["album"]), ("Yıl", s["yil"]), ("Tür", s["tur"]),
            ("Plak şirketi", s["plak_sirketi"]), ("ISRC", s["isrc"]),
        ):
            if deger:
                satirlar.append(f"   {etiket:<13}: {deger}")
        mb = s["ekstra"].get("musicbrainz") or {}
        if mb.get("sure_sn"):
            satirlar.append(f"   {'Şarkı süresi':<13}: {sure_metni(mb['sure_sn'])}")
        araliklar = ", ".join(f"{sure_metni(a)}–{sure_metni(b)}" for a, b in s["zaman_araliklari"])
        satirlar.append(f"   {'Videoda':<13}: {araliklar}")
        if s["sarkidaki_konum_sn"] is not None:
            satirlar.append(f"   {'Şarkıda':<13}: ~{sure_metni(s['sarkidaki_konum_sn'])} civarı kullanılmış")
        satirlar.append(f"   {'Güven':<13}: %{int(s['guven'] * 100)} "
                        f"({s['eslesme_sayisi']} eşleşme, kaynak: {', '.join(s['kaynaklar'])})")
        for ad, url in s["linkler"].items():
            satirlar.append(f"   🔗 {ad}: {url}")
        satirlar.append("")
    return "\n".join(satirlar)


# --------------------------------------------------------------------------- #
# Basit web arayüzü (aiohttp, shazamio ile birlikte zaten kurulu gelir)
# --------------------------------------------------------------------------- #

WEB_SAYFA = """<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Video Müzik Tanıma</title>
<style>
body{font-family:system-ui,sans-serif;max-width:760px;margin:2rem auto;padding:0 16px;background:#fafafa;color:#222}
form{background:#fff;padding:1rem;border-radius:12px;box-shadow:0 1px 4px #0002}
input[type=text]{width:100%;padding:.6rem;box-sizing:border-box}
button{margin-top:.8rem;padding:.6rem 1.2rem;border:0;border-radius:8px;background:#0a7cff;color:#fff;font-size:1rem}
.kart{display:flex;gap:1rem;background:#fff;margin:1rem 0;padding:1rem;border-radius:12px;box-shadow:0 1px 4px #0002}
.kart img{width:110px;height:110px;border-radius:8px;object-fit:cover}
pre{white-space:pre-wrap;background:#fff;padding:1rem;border-radius:12px}
@media (prefers-color-scheme:dark){body{background:#151515;color:#eee}form,.kart,pre{background:#222}}
</style></head><body>
<h1>🎵 Video Müzik Tanıma</h1>
<form method="post" action="/" enctype="multipart/form-data">
<p>Video bağlantısı (YouTube, Instagram, TikTok, X…):</p>
<input type="text" name="url" placeholder="https://...">
<p>…veya video dosyası yükle:</p>
<input type="file" name="dosya" accept="video/*,audio/*">
<br><button type="submit">Tanı</button>
</form>
{sonuc}
</body></html>"""


def _html_kacir(m: Any) -> str:
    import html
    return html.escape(str(m))


def web_sonuc_html(sonuc: dict[str, Any]) -> str:
    if not sonuc["sarkilar"]:
        return f"<pre>{_html_kacir(rapor_yaz(sonuc))}</pre>"
    parcalar = []
    for s in sonuc["sarkilar"]:
        resim = f'<img src="{_html_kacir(s["kapak"])}" alt="">' if s.get("kapak") else ""
        detay = "".join(
            f"<div><b>{e}:</b> {_html_kacir(v)}</div>"
            for e, v in (("Albüm", s["album"]), ("Yıl", s["yil"]), ("Tür", s["tur"]),
                         ("Plak şirketi", s["plak_sirketi"]), ("ISRC", s["isrc"])) if v
        )
        araliklar = ", ".join(f"{sure_metni(a)}–{sure_metni(b)}" for a, b in s["zaman_araliklari"])
        linkler = " · ".join(f'<a href="{_html_kacir(u)}" target="_blank">{_html_kacir(a)}</a>'
                             for a, u in s["linkler"].items())
        parcalar.append(
            f'<div class="kart">{resim}<div><h3>{_html_kacir(s["sanatci"])} — {_html_kacir(s["sarki"])}</h3>'
            f"{detay}<div><b>Videoda:</b> {araliklar}</div>"
            f"<div><b>Güven:</b> %{int(s['guven'] * 100)}</div><div>{linkler}</div></div></div>"
        )
    return "".join(parcalar)


def web_baslat(host: str, port: int) -> None:
    from aiohttp import web

    async def sayfa(_: web.Request) -> web.Response:
        return web.Response(text=WEB_SAYFA.replace("{sonuc}", ""), content_type="text/html")

    async def tani(istek: web.Request) -> web.Response:
        form = await istek.post()
        url = (form.get("url") or "").strip()
        yukleme = form.get("dosya")
        try:
            if url:
                sonuc = await videoyu_analiz_et(url)
            elif getattr(yukleme, "file", None) and yukleme.filename:
                with tempfile.TemporaryDirectory() as gecici:
                    yol = Path(gecici) / Path(yukleme.filename).name
                    yol.write_bytes(yukleme.file.read())
                    sonuc = await videoyu_analiz_et(str(yol))
            else:
                raise ValueError("Bir URL girin veya dosya seçin.")
            govde = web_sonuc_html(sonuc)
        except (Exception, SystemExit) as e:
            govde = f"<pre>Hata: {_html_kacir(e)}</pre>"
        return web.Response(text=WEB_SAYFA.replace("{sonuc}", govde), content_type="text/html")

    app = web.Application(client_max_size=1024 ** 3)
    app.router.add_get("/", sayfa)
    app.router.add_post("/", tani)
    print(f"Web arayüzü: http://{host}:{port}")
    web.run_app(app, host=host, port=port, print=None)


def main() -> None:
    p = argparse.ArgumentParser(description="Videodaki arka plan müziğini/şarkıları tanır.")
    p.add_argument("girdi", nargs="?", help="Video dosyası yolu veya video URL'si")
    p.add_argument("--json", action="store_true", help="Sonucu JSON olarak yazdır")
    p.add_argument("--pencere", type=float, default=12.0, help="Her tanıma penceresinin süresi (sn)")
    p.add_argument("--adim", type=float, default=15.0,
                   help="Pencereler arası adım (sn). Küçük değer = daha ayrıntılı ama yavaş")
    p.add_argument("--konusma-bastirma-yok", action="store_true",
                   help="Başarısız pencerelerde konuşma bastırmalı yeniden denemeyi kapat")
    p.add_argument("--zenginlestirme-yok", action="store_true", help="MusicBrainz sorgusunu atla")
    p.add_argument("--web", action="store_true", help="Yerel web arayüzünü başlat")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    a = p.parse_args()

    if a.web:
        web_baslat(a.host, a.port)
        return
    if not a.girdi:
        p.error("bir video yolu/URL'si verin veya --web kullanın")

    sonuc = asyncio.run(videoyu_analiz_et(
        a.girdi, pencere=a.pencere, adim=a.adim,
        konusma_bastir=not a.konusma_bastirma_yok,
        zenginlestir=not a.zenginlestirme_yok, sessiz=a.json,
    ))
    if a.json:
        print(json.dumps(sonuc, ensure_ascii=False, indent=2))
    else:
        print(rapor_yaz(sonuc))


if __name__ == "__main__":
    main()
