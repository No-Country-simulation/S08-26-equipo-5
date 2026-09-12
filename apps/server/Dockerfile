# syntax=docker/dockerfile:1

# ─── Base ────────────────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS base
# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ─── Development (hot reload) ────────────────────────────
FROM base AS dev
ENV NODE_ENV=development
# Build tools for native modules (bcrypt)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate \
 && cat package.json package-lock.json | md5sum | cut -d' ' -f1 > node_modules/.deps-hash
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
COPY . .
EXPOSE 4000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]

# ─── Builder ─────────────────────────────────────────────
FROM base AS builder
ENV NODE_ENV=development
# Build tools for native modules (bcrypt)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ─── Production dependencies ─────────────────────────────
FROM base AS prod-deps
ENV NODE_ENV=production
# Build tools for native modules (bcrypt)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ─── Production ──────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=prod-deps /app/node_modules ./node_modules
# Generated Prisma client from the builder stage
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
