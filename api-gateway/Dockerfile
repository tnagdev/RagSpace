FROM node:20-alpine AS builder

WORKDIR /app

# ── shared-ts: install deps + build (with codegen) ───────────────────────────
COPY contracts/ ./contracts/
COPY packages/shared-ts/package*.json ./packages/shared-ts/
RUN cd packages/shared-ts && npm ci
COPY packages/shared-ts/ ./packages/shared-ts/
RUN cd packages/shared-ts && npm run build

# ── api-gateway: install deps + build ────────────────────────────────────────
COPY api-gateway/package*.json ./api-gateway/
WORKDIR /app/api-gateway
RUN npm ci

COPY api-gateway/ ./
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine

RUN addgroup -g 1001 -S nodejs && \
  adduser -S nodejs -u 1001

WORKDIR /app

COPY packages/shared-ts/package*.json ./packages/shared-ts/
COPY --from=builder /app/packages/shared-ts/dist ./packages/shared-ts/dist

WORKDIR /app/api-gateway

COPY --chown=nodejs:nodejs api-gateway/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=nodejs:nodejs /app/api-gateway/dist ./dist
COPY --chown=nodejs:nodejs api-gateway/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER nodejs

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["./docker-entrypoint.sh"]
