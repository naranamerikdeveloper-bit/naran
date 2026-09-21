# NARAN storefront — Next.js 14 (standalone). Build context = this web/ directory.
#
# NEXT_PUBLIC_* values are inlined at BUILD time, so they must be passed as build
# args (Dokploy: set them in the app's Build Args). API_URL is a runtime env.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public, build-time config (baked into the client bundle).
ARG NEXT_PUBLIC_MEDUSA_URL
ARG NEXT_PUBLIC_MEDUSA_PK
ARG NEXT_PUBLIC_MEDUSA_REGION
ARG NEXT_PUBLIC_USE_MEDUSA=1
ARG NEXT_PUBLIC_MEILISEARCH=1
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_META_PIXEL_ID
ARG NEXT_PUBLIC_SENTRY_DSN
# R2/CDN host for product images. next.config.js adds it to images.remotePatterns,
# which is frozen into the standalone build — without it at BUILD time every R2
# image is rejected by /_next/image ("url" parameter is not allowed).
ARG S3_FILE_URL
ENV S3_FILE_URL=$S3_FILE_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_MEDUSA_URL=$NEXT_PUBLIC_MEDUSA_URL \
    NEXT_PUBLIC_MEDUSA_PK=$NEXT_PUBLIC_MEDUSA_PK \
    NEXT_PUBLIC_MEDUSA_REGION=$NEXT_PUBLIC_MEDUSA_REGION \
    NEXT_PUBLIC_USE_MEDUSA=$NEXT_PUBLIC_USE_MEDUSA \
    NEXT_PUBLIC_MEILISEARCH=$NEXT_PUBLIC_MEILISEARCH \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_GA_ID=$NEXT_PUBLIC_GA_ID \
    NEXT_PUBLIC_META_PIXEL_ID=$NEXT_PUBLIC_META_PIXEL_ID \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
# HOSTNAME must be pinned: the standalone server binds to `process.env.HOSTNAME`,
# and Docker sets that to the container id, so Next listens ONLY on the container
# IP. The healthcheck (and anything else on 127.0.0.1) then gets connection
# refused, the container is marked unhealthy, and Traefik drops its routers.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Standalone server + the assets it does not bundle (static + public).
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
