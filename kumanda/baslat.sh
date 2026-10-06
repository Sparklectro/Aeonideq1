#!/bin/sh
# Kumanda: Linux / macOS / Termux için başlatıcı.
cd "$(dirname "$0")"
[ -d node_modules ] || npm install || exit 1
exec node server/index.js
