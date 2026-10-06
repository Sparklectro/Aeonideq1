# Aeonideq1

Bu dal (`master`) eski kişisel projeleri barındırır. Şirket projeleri
[`Aeonideq`](https://github.com/Sparklectro/Aeonideq1/tree/Aeonideq) dalındadır.

## 🐦 Civilti (eski kurs projesi)

Yaklaşık 7–8 yıl önce bir Python/Django web geliştirme kursu kapsamında yazılmış alıştırma
projesi. Twitter benzeri basit bir mikroblog: kayıt olma / giriş, tweet akışı, profil, kullanıcı
takip etme, takipçi ve takip edilen listeleri.

Arşiv amaçlı tutuluyor; aktif olarak geliştirilmiyor ve güncel Django sürümleriyle olduğu gibi
çalışmayabilir.

```bash
cd civilti
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver           # http://127.0.0.1:8000
```
