#!/usr/bin/env bash
# Uygulama betiğini skill klasörüne kopyalar ve claude.ai'ye yüklenebilir .skill (zip) paketi üretir.
set -euo pipefail
cd "$(dirname "$0")"
SKILL=../.claude/skills/video-muzik-tanima
cp muzik_tanima.py requirements.txt "$SKILL/scripts/"
mkdir -p dist
rm -f dist/video-muzik-tanima.skill
(cd "$SKILL/.." && zip -qr - video-muzik-tanima -x '*/__pycache__/*') > dist/video-muzik-tanima.skill
echo "Hazır: $(pwd)/dist/video-muzik-tanima.skill"
