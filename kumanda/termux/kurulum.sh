#!/data/data/com.termux/files/usr/bin/bash
# Kumanda — Android (Termux) kurulumu.
# Tekrar tekrar çalıştırmak güvenlidir: kurulu olanı atlar, eksik olanı tamamlar.
#
#   curl -fsSL https://raw.githubusercontent.com/Sparklectro/Aeonideq1/ccr-0958c9ab-0uudov/kumanda/termux/kurulum.sh | bash
#
set -euo pipefail

BRANCH="${KUMANDA_BRANCH:-ccr-0958c9ab-0uudov}"
REPO="https://github.com/Sparklectro/Aeonideq1.git"
APP="$HOME/.kumanda-uygulama"
DISTRO=ubuntu

adim() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
tamam() { printf '\033[1;32m    ✓ %s\033[0m\n' "$*"; }
hata() { printf '\n\033[1;31m!! %s\033[0m\n' "$*" >&2; exit 1; }
sor() { # sor "Soru" varsayılan  -> cevabı yazdırır (curl | bash ile de klavyeden okur)
  local cevap
  read -r -p "    $1 " cevap </dev/tty || true
  printf '%s' "${cevap:-$2}"
}

# Betiğin tamamı önce okunur, sonra çalışır: "curl | bash" ile çalışırken
# araya giren komutlar betiğin kalanını yutamaz.
main() {
case "${PREFIX:-}" in
  *com.termux*) ;;
  *) hata "Bu betik telefonda, Termux uygulamasının içinde çalıştırılmalı." ;;
esac
[ "$(id -u)" != 0 ] || hata "Termux'u root olarak çalıştırma; normal Termux oturumu yeterli."

# ---------------------------------------------------------------------------
adim "1/8 Termux paketleri güncelleniyor (ilk seferde birkaç dakika sürebilir)"
APT_OPTS=(-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confnew)
apt-get update
apt-get full-upgrade "${APT_OPTS[@]}"
command -v node >/dev/null || apt-get install "${APT_OPTS[@]}" nodejs-lts
apt-get install "${APT_OPTS[@]}" git gh python proot-distro termux-tools
tamam "node $(node -v), git, gh, python, proot-distro hazır"

# ---------------------------------------------------------------------------
adim "2/8 Telefon hafızasına erişim"
if [ ! -d "$HOME/storage/shared" ]; then
  echo "    Birazdan Android 'dosyalara erişim' izni soracak → İZİN VER."
  termux-setup-storage || true
  for _ in $(seq 1 30); do [ -d "$HOME/storage/shared" ] && break; sleep 1; done
fi
if [ -d "$HOME/storage/shared" ]; then
  tamam "Telefon hafızası: ~/storage/shared"
else
  echo "    İzin verilmedi. Sonra 'termux-setup-storage' yazarak tekrar deneyebilirsin."
fi

# ---------------------------------------------------------------------------
adim "3/8 Git kimliği (commit'lerde görünen ad ve e-posta)"
if [ -z "$(git config --global user.name || true)" ]; then
  git config --global user.name "$(sor 'Adın (ör. Batu):' 'Batu')"
fi
if [ -z "$(git config --global user.email || true)" ]; then
  git config --global user.email "$(sor 'GitHub e-postan:' '')"
fi
git config --global init.defaultBranch main
git config --global pull.ff only
tamam "$(git config --global user.name) <$(git config --global user.email)>"

# ---------------------------------------------------------------------------
adim "4/8 GitHub girişi"
if gh auth status -h github.com >/dev/null 2>&1; then
  tamam "Zaten giriş yapılmış"
else
  echo "    Ekranda 8 haneli bir kod çıkacak. Kodu kopyala, açılan GitHub sayfasına yapıştır, onayla."
  gh auth login -h github.com -p https -w </dev/tty
fi
gh auth setup-git -h github.com
tamam "GitHub: $(gh api user --jq .login 2>/dev/null || echo '?')"

# ---------------------------------------------------------------------------
adim "5/8 Kumanda uygulaması indiriliyor"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$BRANCH"
  git -C "$APP" checkout -q -B "$BRANCH" "origin/$BRANCH"
else
  git clone -q --depth 1 -b "$BRANCH" "$REPO" "$APP"
fi
( cd "$APP/kumanda" && npm install --omit=optional --no-fund --no-audit --loglevel=error )
mkdir -p "$HOME/projeler"
tamam "Uygulama: $APP/kumanda   Projeler: ~/projeler"

# ---------------------------------------------------------------------------
adim "6/8 Claude Code için Ubuntu ortamı (resmi Claude Code Android'de doğrudan çalışmaz)"
if [ ! -d "$PREFIX/var/lib/proot-distro/installed-rootfs/$DISTRO" ]; then
  proot-distro install "$DISTRO"
fi
ubuntu() { proot-distro login "$DISTRO" --shared-tmp -- "$@"; }
ubuntu bash -c 'export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq curl ca-certificates git gh ripgrep less nano >/dev/null'
tamam "Ubuntu hazır"

adim "7/8 Claude Code kuruluyor (resmi kurucu: claude.ai/install.sh)"
CLAUDE_BIN=/root/.local/bin/claude
if ubuntu test -x "$CLAUDE_BIN"; then
  tamam "Zaten kurulu, güncelleniyor"
  ubuntu "$CLAUDE_BIN" update || true
else
  ubuntu bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
fi
# GitHub girişini ve git kimliğini Ubuntu tarafına da ver (Claude commit/push yapabilsin).
gh auth token | ubuntu gh auth login -h github.com --with-token
ubuntu gh auth setup-git -h github.com
ubuntu git config --global user.name "$(git config --global user.name)"
ubuntu git config --global user.email "$(git config --global user.email)"
ubuntu git config --global init.defaultBranch main
tamam "Claude Code: $(ubuntu "$CLAUDE_BIN" --version 2>/dev/null || echo '?')"

# ---------------------------------------------------------------------------
adim "8/8 Kısayol komutları"
cp "$APP/kumanda/termux/bin/"* "$PREFIX/bin/"
chmod +x "$PREFIX/bin/kumanda" "$PREFIX/bin/claude" "$PREFIX/bin/kumanda-guncelle"
tamam "kumanda · claude · kumanda-guncelle"

cat <<'SON'

  ┌──────────────────────────────────────────────────────────────┐
  │  KURULUM BİTTİ                                               │
  │                                                              │
  │  1) claude      → bir kez çalıştır, Anthropic hesabınla gir   │
  │                   (çıkan bağlantıyı aç, kodu geri yapıştır)  │
  │  2) kumanda     → paneli Chrome'da açar                      │
  │  3) Chrome ⋮ → "Ana ekrana ekle"                             │
  │                                                              │
  │  Pil: Ayarlar → Uygulamalar → Termux → Pil → Kısıtlamasız     │
  │  Rehber: Kumanda'da sağ üstteki  ?  düğmesi                  │
  └──────────────────────────────────────────────────────────────┘
SON
}

main "$@" </dev/null
