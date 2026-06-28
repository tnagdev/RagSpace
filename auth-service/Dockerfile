FROM node:20-alpine AS builder

WORKDIR /app

# ── shared-ts: install deps + build (with codegen) ───────────────────────────
COPY contracts/ ./contracts/
COPY packages/shared-ts/package*.json ./packages/shared-ts/
RUN cd packages/shared-ts && npm ci
COPY packages/shared-ts/ ./packages/shared-ts/
RUN cd packages/shared-ts && npm run build

# ── auth-service: install deps ───────────────────────────────────────────────
COPY auth-service/package*.json ./auth-service/
COPY auth-service/prisma.config.* ./auth-service/
COPY auth-service/src/prisma ./auth-service/src/prisma/

WORKDIR /app/auth-service
RUN npm ci
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --schema ./src/prisma/schema.prisma

# ── auth-service: build ──────────────────────────────────────────────────────
COPY auth-service/ .
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine

RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

WORKDIR /app

# shared-ts dist + package.json needed at runtime (npm file: dep resolves via this dir)
COPY packages/shared-ts/package*.json ./packages/shared-ts/
COPY --from=builder /app/packages/shared-ts/dist ./packages/shared-ts/dist

WORKDIR /app/auth-service

COPY --chown=nodejs:nodejs auth-service/package*.json ./
COPY --chown=nodejs:nodejs auth-service/prisma.config.* ./
COPY --chown=nodejs:nodejs auth-service/src/prisma ./src/prisma/

RUN npm ci --omit=dev
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --schema ./src/prisma/schema.prisma

COPY --from=builder --chown=nodejs:nodejs /app/auth-service/dist ./dist
COPY --chown=nodejs:nodejs auth-service/auth.ts ./
COPY --chown=nodejs:nodejs auth-service/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nodejs

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/auth/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"
CMD ["./docker-entrypoint.sh"]
