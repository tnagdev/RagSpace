FROM node:20-alpine AS builder

WORKDIR /app

# ── shared-ts: install deps + build (with codegen) ───────────────────────────
COPY contracts/ ./contracts/
COPY packages/shared-ts/package*.json ./packages/shared-ts/
RUN cd packages/shared-ts && npm ci
COPY packages/shared-ts/ ./packages/shared-ts/
RUN cd packages/shared-ts && npm run build

# ── upload-manager: install deps ─────────────────────────────────────────────
COPY upload-manager/package*.json ./upload-manager/
COPY upload-manager/prisma.config.* ./upload-manager/
COPY upload-manager/src/modules/prisma ./upload-manager/src/modules/prisma/

WORKDIR /app/upload-manager
RUN npm ci
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --schema ./src/modules/prisma/schema.prisma

# ── upload-manager: build ────────────────────────────────────────────────────
COPY upload-manager/ ./
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine

RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

WORKDIR /app

COPY packages/shared-ts/package*.json ./packages/shared-ts/
COPY --from=builder /app/packages/shared-ts/dist ./packages/shared-ts/dist

WORKDIR /app/upload-manager

COPY --chown=nodejs:nodejs upload-manager/package*.json ./
COPY --chown=nodejs:nodejs upload-manager/prisma.config.* ./
COPY --chown=nodejs:nodejs upload-manager/src/modules/prisma ./src/modules/prisma/

RUN npm ci --omit=dev
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate --schema ./src/modules/prisma/schema.prisma

COPY --from=builder --chown=nodejs:nodejs /app/upload-manager/dist ./dist
COPY --chown=nodejs:nodejs upload-manager/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nodejs

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["./docker-entrypoint.sh"]
