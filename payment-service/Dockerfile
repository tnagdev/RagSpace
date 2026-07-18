FROM node:20-alpine AS builder

WORKDIR /app

# ── shared-ts: install deps + build (with codegen) ───────────────────────────
COPY contracts/ ./contracts/
COPY packages/shared-ts/package*.json ./packages/shared-ts/
RUN cd packages/shared-ts && npm ci
COPY packages/shared-ts/ ./packages/shared-ts/
RUN cd packages/shared-ts && npm run build

# ── payment-service: install deps ────────────────────────────────────────────
COPY payment-service/package*.json ./payment-service/
COPY payment-service/prisma.config.ts ./payment-service/
COPY payment-service/src/prisma ./payment-service/src/prisma/

WORKDIR /app/payment-service
RUN npm ci
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --schema ./src/prisma/schema.prisma

# ── payment-service: build ────────────────────────────────────────────────────
COPY payment-service/ ./
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine

RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

WORKDIR /app

COPY packages/shared-ts/package*.json ./packages/shared-ts/
COPY --from=builder /app/packages/shared-ts/dist ./packages/shared-ts/dist

WORKDIR /app/payment-service

COPY --chown=nodejs:nodejs payment-service/package*.json ./
COPY --chown=nodejs:nodejs payment-service/prisma.config.ts ./
COPY --chown=nodejs:nodejs payment-service/src/prisma ./src/prisma/

RUN npm ci --omit=dev
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --schema ./src/prisma/schema.prisma

COPY --from=builder --chown=nodejs:nodejs /app/payment-service/dist ./dist
COPY --chown=nodejs:nodejs payment-service/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nodejs

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["./docker-entrypoint.sh"]
