#!/bin/sh
# Reinstala dependencias solo si package.json / package-lock.json cambiaron.
# Evita el gotcha del volumen anónimo de node_modules tras un git pull.
set -e

cd /app

LOCK_HASH="$(cat package.json package-lock.json | md5sum | cut -d' ' -f1)"
MARKER="node_modules/.deps-hash"

if [ ! -d node_modules ] || [ ! -f "$MARKER" ] || [ "$(cat "$MARKER")" != "$LOCK_HASH" ]; then
  echo "[entrypoint] Dependencias cambiaron -> npm ci"
  npm ci
  npx prisma generate
  echo "$LOCK_HASH" > "$MARKER"
else
  echo "[entrypoint] node_modules al dia"
fi

exec "$@"
