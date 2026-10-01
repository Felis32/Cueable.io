#!/bin/sh
# Desktop is a file-provider folder, so Next stalls while reading node_modules there.
# Run the app from /tmp with dependencies on local disk, and sync source on start.
set -e
PORT="${PORT:-3000}"
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
APP="/tmp/primecut"
if ! node -e 'const net = require("node:net"); const server = net.createServer(); server.once("error", () => process.exit(1)); server.listen(Number(process.argv[1]), "127.0.0.1", () => server.close(() => process.exit(0)));' "$PORT"; then
  printf 'Port %s is already in use; refusing to sync into the active app directory.\n' "$PORT" >&2
  exit 1
fi
mkdir -p "$APP"
rsync -a --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  "$ROOT/" "$APP/"
cd "$APP"
if [ ! -d node_modules/next ] || [ ! -d node_modules/@supabase/ssr ] || [ -z "$(ls -A node_modules 2>/dev/null)" ]; then
  rm -rf node_modules
  npm install --no-audit --no-fund
fi
exec ./node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port "$PORT"
