#!/bin/sh
set -e

# Fixed internal ports so an injected PORT env var cannot break the wiring.
API_PORT=4000
WEB_PORT=3000

echo "[entrypoint] starting API on :$API_PORT"
( cd /app/server && PORT="$API_PORT" node dist/server.js ) &

echo "[entrypoint] starting web on :$WEB_PORT"
( cd /app/web && HOSTNAME=0.0.0.0 PORT="$WEB_PORT" node server.js ) &

echo "[entrypoint] starting nginx on :80"
exec nginx -g 'daemon off;'
