FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM nginx:alpine

RUN addgroup -g 1001 -S nginx-user && \
    adduser -S nginx-user -u 1001 -G nginx-user

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf


RUN echo '#!/bin/sh' > /docker-entrypoint.sh && \
    echo 'if [ -n "$VITE_API_URL" ]; then' >> /docker-entrypoint.sh && \
    echo '  envsubst "\$VITE_API_URL" < /etc/nginx/conf.d/default.conf > /etc/nginx/conf.d/default.conf.tmp' >> /docker-entrypoint.sh && \
    echo '  mv /etc/nginx/conf.d/default.conf.tmp /etc/nginx/conf.d/default.conf' >> /docker-entrypoint.sh && \
    echo 'fi' >> /docker-entrypoint.sh && \
    echo 'exec nginx -g "daemon off;"' >> /docker-entrypoint.sh && \
    chmod +x /docker-entrypoint.sh

EXPOSE 80

ENV PORT=80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
