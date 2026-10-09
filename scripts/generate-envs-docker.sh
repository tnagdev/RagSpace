#!/usr/bin/env bash
# Writes every service's .env.docker for docker-compose.dev.yml.
# Secrets come from the environment, else from the file being replaced, so re-running keeps your keys:
#   NVIDIA_API_KEY=nvapi-... GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... bash scripts/generate-envs-docker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

APP_URL="http://localhost:3000"
DB="postgresql://postgres:postgres@postgres:5432/postgres"
RABBITMQ_URL="amqp://guest:guest@rabbitmq:5672"
S3_ENDPOINT="http://minio:9000"
# Presigned URLs are opened by the browser, which reaches MinIO on its published port.
S3_PUBLIC_ENDPOINT="http://localhost:9000"
S3_REGION="us-east-1"
S3_BUCKET="rag-user-uploads"
S3_KEY="minioadmin"
S3_SECRET="minioadmin"

AUTH_GRPC="auth-service:50051"
FILES_GRPC="upload-manager:50051"
SCENES_GRPC="scene-detector-server:50051"
SEARCH_GRPC="file-embedder-server:50051"
CHAT_GRPC="chat-manager:50051"
BILLING_GRPC="payment-service:50051"

secret() {
  local value="$1" name="$2" file="$ROOT/$3" fallback="${4:-}"
  if [[ -z "$value" && -f "$file" ]]; then
    value="$(sed -n "s/^${name}=//p" "$file" | tr -d '\r' | tail -n 1)"
  fi
  printf '%s' "${value:-$fallback}"
}

write() {
  cat > "$ROOT/$1"
  echo "  $1"
}

BETTER_AUTH_SECRET="$(secret "${BETTER_AUTH_SECRET:-}" BETTER_AUTH_SECRET auth-service/.env.docker 'local-dev-secret-32-chars-min!!')"
GOOGLE_CLIENT_ID="$(secret "${GOOGLE_CLIENT_ID:-}" GOOGLE_CLIENT_ID auth-service/.env.docker)"
GOOGLE_CLIENT_SECRET="$(secret "${GOOGLE_CLIENT_SECRET:-}" GOOGLE_CLIENT_SECRET auth-service/.env.docker)"
SMTP_HOST="$(secret "${SMTP_HOST:-}" SMTP_HOST auth-service/.env.docker)"
SMTP_PORT="$(secret "${SMTP_PORT:-}" SMTP_PORT auth-service/.env.docker 587)"
SMTP_SECURE="$(secret "${SMTP_SECURE:-}" SMTP_SECURE auth-service/.env.docker false)"
SMTP_USER="$(secret "${SMTP_USER:-}" SMTP_USER auth-service/.env.docker)"
SMTP_PASS="$(secret "${SMTP_PASS:-}" SMTP_PASS auth-service/.env.docker)"
SMTP_FROM="$(secret "${SMTP_FROM:-}" SMTP_FROM auth-service/.env.docker noreply@ragspace.local)"
CHAT_NVIDIA_API_KEY="$(secret "${NVIDIA_API_KEY:-}" NVIDIA_API_KEY chat-manager/.env.docker)"
NVIDIA_API_KEY="$(secret "${NVIDIA_API_KEY:-}" NVIDIA_API_KEY file-embedder/.env.docker)"
CHAT_NVIDIA_API_KEY="${CHAT_NVIDIA_API_KEY:-$NVIDIA_API_KEY}"
RAZORPAY_KEY_ID="$(secret "${RAZORPAY_KEY_ID:-}" RAZORPAY_KEY_ID payment-service/.env.docker)"
RAZORPAY_KEY_SECRET="$(secret "${RAZORPAY_KEY_SECRET:-}" RAZORPAY_KEY_SECRET payment-service/.env.docker)"
RAZORPAY_WEBHOOK_SECRET="$(secret "${RAZORPAY_WEBHOOK_SECRET:-}" RAZORPAY_WEBHOOK_SECRET payment-service/.env.docker)"
LEMON_SQUEEZY_API_KEY="$(secret "${LEMON_SQUEEZY_API_KEY:-}" LEMON_SQUEEZY_API_KEY payment-service/.env.docker)"
LEMON_SQUEEZY_STORE_ID="$(secret "${LEMON_SQUEEZY_STORE_ID:-}" LEMON_SQUEEZY_STORE_ID payment-service/.env.docker)"
LEMON_SQUEEZY_WEBHOOK_SECRET="$(secret "${LEMON_SQUEEZY_WEBHOOK_SECRET:-}" LEMON_SQUEEZY_WEBHOOK_SECRET payment-service/.env.docker)"

echo "Writing .env.docker files:"

write api-gateway/.env.docker << EOF
PORT=8080
NODE_ENV=docker
APP_ORIGINS=${APP_URL}
RABBITMQ_URL=${RABBITMQ_URL}
AUTH_HTTP_URL=http://auth-service:8080
AUTH_GRPC_ADDRESS=${AUTH_GRPC}
FILES_GRPC_ADDRESS=${FILES_GRPC}
SEARCH_GRPC_ADDRESS=${SEARCH_GRPC}
CHAT_GRPC_ADDRESS=${CHAT_GRPC}
BILLING_GRPC_ADDRESS=${BILLING_GRPC}
EOF

write auth-service/.env.docker << EOF
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB}?schema=ragauth
BETTER_AUTH_URL=${APP_URL}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
FRONTEND_URL=${APP_URL}
TRUSTED_ORIGINS=${APP_URL}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URI=${APP_URL}/api/v1/auth/oauth/google/callback
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_SECURE=${SMTP_SECURE}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}
APP_NAME=RagSpace
RABBITMQ_URL=${RABBITMQ_URL}
EOF

write upload-manager/.env.docker << EOF
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB}?schema=upload
RABBITMQ_URL=${RABBITMQ_URL}
BILLING_GRPC_ADDRESS=${BILLING_GRPC}
AWS_REGION=${S3_REGION}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
AWS_S3_BUCKET=${S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
AWS_S3_PUBLIC_ENDPOINT=${S3_PUBLIC_ENDPOINT}
MAX_FILE_SIZE=1073741824
EOF

write payment-service/.env.docker << EOF
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB}?schema=payment
RABBITMQ_URL=${RABBITMQ_URL}
FRONTEND_URL=${APP_URL}
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID}
RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET}
RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_WEBHOOK_SECRET}
LEMON_SQUEEZY_API_KEY=${LEMON_SQUEEZY_API_KEY}
LEMON_SQUEEZY_STORE_ID=${LEMON_SQUEEZY_STORE_ID}
LEMON_SQUEEZY_WEBHOOK_SECRET=${LEMON_SQUEEZY_WEBHOOK_SECRET}
EOF

write scene-detector/.env.docker << EOF
PORT=8080
DATABASE_URL=${DB}?schema=scene_detector
RABBITMQ_URL=${RABBITMQ_URL}
FILES_GRPC_ADDRESS=${FILES_GRPC}
AWS_REGION=${S3_REGION}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
AWS_S3_BUCKET=${S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
AWS_S3_PUBLIC_ENDPOINT=${S3_PUBLIC_ENDPOINT}
SCENE_DETECTION_THRESHOLD=27.0
SCENE_DETECTION_MIN_SCENE_LENGTH=15
THUMBNAIL_WIDTH=256
THUMBNAIL_HEIGHT=256
THUMBNAIL_QUALITY=70
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=2
EOF

write file-embedder/.env.docker << EOF
PORT=8080
RABBITMQ_URL=${RABBITMQ_URL}
FILES_GRPC_ADDRESS=${FILES_GRPC}
SCENES_GRPC_ADDRESS=${SCENES_GRPC}
CHROMA_HOST=chromadb
CHROMA_PORT=8000
AWS_REGION=${S3_REGION}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
AWS_S3_BUCKET=${S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
CLIP_MODEL=ViT-B-32
TEXT_MODEL=BAAI/bge-base-en-v1.5
DEVICE=cpu
NVIDIA_API_KEY=${NVIDIA_API_KEY}
EOF

write chat-manager/.env.docker << EOF
PORT=8080
DATABASE_URL=${DB}?schema=chat_manager
RABBITMQ_URL=${RABBITMQ_URL}
SEARCH_GRPC_ADDRESS=${SEARCH_GRPC}
FILES_GRPC_ADDRESS=${FILES_GRPC}
SCENES_GRPC_ADDRESS=${SCENES_GRPC}
BILLING_GRPC_ADDRESS=${BILLING_GRPC}
NVIDIA_API_KEY=${CHAT_NVIDIA_API_KEY}
EOF

write frontend/.env.docker << EOF
API_GATEWAY_URL=http://api-gateway:8080
EOF

echo
echo "Next: docker compose -f docker-compose.dev.yml up -d"
[[ -n "$NVIDIA_API_KEY" ]] || echo "NVIDIA_API_KEY is empty: visual descriptions and chat replies need it."
