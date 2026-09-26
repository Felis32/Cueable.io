#!/bin/sh
# Desktop is a file-provider folder, so Next stalls while reading node_modules there.
# Run the app from /tmp with dependencies on local disk, and sync source on start.
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
APP="/tmp/primecut"
mkdir -p "$APP"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  "$ROOT/" "$APP/"
cd "$APP"
if [ ! -d node_modules/next ]; then
  npm install --no-audit --no-fund
fi
exec ./node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port 3000
