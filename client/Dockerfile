# ── Stage 1: install deps ────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci

# ── Stage 2: build Next.js ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app/client

COPY --from=deps /app/client/node_modules ./node_modules
COPY client/ ./

# NEXT_PUBLIC_* vars are inlined at build time — pass the public server URL
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:8080
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

# API_URL is used by Next.js rewrites (server-side only, not exposed to browser)
ARG API_URL=http://server:8080
ENV API_URL=$API_URL

# Enable standalone output for Docker self-hosting
ENV DOCKER=1

RUN npm run build

# ── Stage 3: minimal runtime image ───────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/client/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/client/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/client/public           ./public

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
