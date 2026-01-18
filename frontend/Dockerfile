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
COPY nginx.conf /etc/nginx/templates/default.conf.template

COPY <<EOF /docker-entrypoint.d/40-envsubst-on-templates.sh
#!/bin/sh
set -e

export API_GATEWAY_URL=\${VITE_API_URL:-http://localhost:3000}

# envsubst only these specific variables to avoid touching nginx variables
envsubst '\$API_GATEWAY_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

cat /etc/nginx/conf.d/default.conf
EOF

RUN chmod +x /docker-entrypoint.d/40-envsubst-on-templates.sh

EXPOSE 80

ENV PORT=80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1
