# syntax=docker/dockerfile:1

# Combined MeetFlow image: Express API + Next.js web + nginx reverse proxy.
# One container, one port (80), one domain — no path routing needed on the host.
#
# Build context MUST be `apps/`:
#   docker build -f combined/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://<domain>/api/v1 \
#     --build-arg NEXT_PUBLIC_ROOMS_API_URL=https://<domain>/api/v1 \
#     -t <user>/meetflow:v1 .
# NOTE: NEXT_PUBLIC_* values are inlined by Next at build time, so the public
# domain must be known when the image is built. Rebuild to change it.

ARG NODE_IMAGE=node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293

# ─── Server: build ───────────────────────────────────────
FROM ${NODE_IMAGE} AS server-build
RUN apk add --no-cache openssl libc6-compat python3 make g++
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/prisma ./prisma
RUN npx prisma generate
COPY server/ ./
RUN npm run build

# ─── Server: production dependencies ─────────────────────
FROM ${NODE_IMAGE} AS server-prod-deps
RUN apk add --no-cache openssl libc6-compat python3 make g++
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ─── Web: build ──────────────────────────────────────────
FROM ${NODE_IMAGE} AS web-build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ROOMS_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ROOMS_API_URL=$NEXT_PUBLIC_ROOMS_API_URL
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ─── Runtime ─────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
RUN apk add --no-cache openssl libc6-compat nginx
WORKDIR /app

# API
COPY --from=server-prod-deps /app/node_modules ./server/node_modules
COPY --from=server-build /app/node_modules/.prisma ./server/node_modules/.prisma
COPY --from=server-build /app/node_modules/@prisma/client ./server/node_modules/@prisma/client
COPY --from=server-build /app/dist ./server/dist
COPY --from=server-build /app/prisma ./server/prisma
COPY server/package.json ./server/

# Web (Next standalone output)
COPY --from=web-build /app/.next/standalone ./web
COPY --from=web-build /app/.next/static ./web/.next/static
COPY --from=web-build /app/public ./web/public

# Reverse proxy
COPY combined/nginx.conf /etc/nginx/http.d/default.conf
COPY combined/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80
ENTRYPOINT ["entrypoint.sh"]
