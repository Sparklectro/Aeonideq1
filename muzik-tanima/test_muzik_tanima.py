"""Ağ gerektirmeyen testler: python -m unittest test_muzik_tanima.py"""

import asyncio
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import muzik_tanima as mt

ORNEK_SHAZAM_YANITI = {
    "matches": [{"id": "1", "offset": 63.4, "timeskew": 0.0, "frequencyskew": 0.0}],
    "track": {
        "key": "12345",
        "title": "Örnek Şarkı",
        "subtitle": "Örnek Sanatçı",
        "isrc": "TRA000000001",
        "url": "https://www.shazam.com/track/12345",
        "genres": {"primary": "Pop"},
        "images": {"coverart": "https://example.com/c.jpg"},
        "hub": {
            "explicit": False,
            "options": [{"actions": [{"uri": "https://music.apple.com/tr/album/x"}]}],
            "providers": [{"type": "SPOTIFY", "actions": [{"uri": "spotify:search:x"}]}],
        },
        "sections": [
            {"type": "SONG", "metadata": [
                {"title": "Album", "text": "Örnek Albüm"},
                {"title": "Label", "text": "Örnek Plak"},
                {"title": "Released", "text": "2021"},
            ]},
            {"type": "LYRICS", "text": ["..."], "footer": "Writer(s): A  B\nLyrics powered by X",
             "beacondata": {"providername": "musixmatch"}},
        ],
    },
}


class AyristirmaTesti(unittest.TestCase):
    def test_shazam_ayristir(self):
        s = mt.shazam_ayristir(ORNEK_SHAZAM_YANITI)
        self.assertEqual(s["sarki"], "Örnek Şarkı")
        self.assertEqual(s["sanatci"], "Örnek Sanatçı")
        self.assertEqual(s["album"], "Örnek Albüm")
        self.assertEqual(s["yil"], "2021")
        self.assertEqual(s["plak_sirketi"], "Örnek Plak")
        self.assertEqual(s["sarkidaki_konum_sn"], 63.4)
        self.assertIn("apple_music", s["linkler"])
        self.assertIn("spotify", s["linkler"])
        self.assertTrue(s["ekstra"]["sozler_mevcut"])
        self.assertEqual(s["ekstra"]["soz_kredisi"], "Writer(s): A B Lyrics powered by X")
        self.assertEqual(s["ekstra"]["soz_saglayici"], "musixmatch")
        self.assertNotIn("text", s["ekstra"])

    def test_shazam_bos(self):
        self.assertIsNone(mt.shazam_ayristir({"matches": []}))

    def test_audd_ayristir(self):
        s = mt.audd_ayristir({"status": "success", "result": {
            "artist": "A", "title": "B", "album": "C", "release_date": "2020-01-01",
            "song_link": "https://lis.tn/x"}})
        self.assertEqual((s["sanatci"], s["sarki"], s["album"]), ("A", "B", "C"))
        self.assertIsNone(mt.audd_ayristir({"status": "success", "result": None}))


class PlanVeBirlestirmeTesti(unittest.TestCase):
    def test_kisa_video_tek_pencere(self):
        self.assertEqual(mt.pencereleri_planla(8, 12, 15), [(0.0, 8)])

    def test_son_kisim_kapsanir(self):
        plan = mt.pencereleri_planla(50, 12, 15)
        self.assertEqual(plan[-1][0] + plan[-1][1], 50)
        plan = mt.pencereleri_planla(38.1, 12, 6)  # gerçek videoda son 2 sn atlanıyordu
        self.assertAlmostEqual(plan[-1][0] + plan[-1][1], 38.1)

    def test_birlestirme(self):
        d = mt.shazam_ayristir(ORNEK_SHAZAM_YANITI)
        e = lambda b, k="shazam:1", ad="X": mt.Eslesme(b, b + 12, "shazam", k, ad, "Y", dict(d))
        sonuc = mt.eslesmeleri_birlestir(
            [e(0), e(15), e(30), e(90), e(45, "shazam:2", "Z")], pencere_sayisi=8,
            bosluk_toleransi=16)
        self.assertEqual(len(sonuc), 2)
        self.assertEqual(sonuc[0].zaman_araliklari, [[0, 42], [90, 102]])
        self.assertEqual(sonuc[0].eslesme_sayisi, 4)
        self.assertEqual(sonuc[0].guven, 0.5)
        self.assertIn("sozler_genius", sonuc[0].linkler)


class UctanUcaTest(unittest.TestCase):
    """Sentetik video üretip Shazam'ı taklit ederek tüm akışı çalıştırır."""

    def test_akis(self):
        with tempfile.TemporaryDirectory() as g:
            video = Path(g) / "v.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=black:s=64x64:d=40",
                "-f", "lavfi", "-i", "sine=f=440:d=40", "-ac", "2", "-shortest", str(video),
            ], check=True)

            cagri = {"n": 0}

            async def sahte_tani(self, wav):
                assert wav[:4] == b"RIFF"
                cagri["n"] += 1
                return mt.shazam_ayristir(ORNEK_SHAZAM_YANITI) if cagri["n"] % 2 else None

            with mock.patch.object(mt.ShazamTanima, "tani", sahte_tani), \
                 mock.patch.object(mt.asyncio, "sleep", mock.AsyncMock()):
                sonuc = asyncio.run(mt.videoyu_analiz_et(
                    str(video), zenginlestir=False, sessiz=True))

            self.assertEqual(sonuc["taranan_pencere"], 3)
            self.assertEqual(len(sonuc["sarkilar"]), 1)
            rapor = mt.rapor_yaz(sonuc)
            self.assertIn("Örnek Sanatçı — Örnek Şarkı", rapor)
            self.assertIn("class=\"kart\"", mt.web_sonuc_html(sonuc))


if __name__ == "__main__":
    unittest.main()
