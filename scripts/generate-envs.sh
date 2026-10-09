#!/usr/bin/env bash
# Writes every service's .env.prod for docker-compose.prod.yml from the root .env.prod.
#   bash scripts/generate-envs.sh [--env-file PATH]
#   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env.prod"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) ENV_FILE="$1"; shift ;;
  esac
done
[[ -f "$ENV_FILE" ]] || { echo "Root env file not found: $ENV_FILE" >&2; exit 1; }

# Values can hold characters the shell would interpret (<, `, $), so split on the first = instead of sourcing.
while IFS= read -r line || [[ -n "$line" ]]; do
  line="${line%$'\r'}"
  [[ "$line" =~ ^[[:space:]]*(#|$) || "$line" != *=* ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
    value="${BASH_REMATCH[1]}"
  fi
  export "$key=$value"
done < "$ENV_FILE"

required=(PUBLIC_URL RABBITMQ_USER RABBITMQ_PASS BETTER_AUTH_SECRET AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_S3_BUCKET)
[[ -n "${DATABASE_URL:-}" ]] || required+=(SUPABASE_PROJECT_REF SUPABASE_DB_PASSWORD SUPABASE_DB_HOST)
[[ -n "${AWS_S3_ENDPOINT:-}" || -z "${DATABASE_URL:-}" ]] || required+=(SUPABASE_PROJECT_REF)
missing=()
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || missing+=("$name")
done
if (( ${#missing[@]} )); then
  echo "Missing in $ENV_FILE: ${missing[*]}" >&2
  exit 1
fi

APP_URL="${PUBLIC_URL%/}"
DB="${DATABASE_URL:-postgresql://postgres.${SUPABASE_PROJECT_REF:-}:${SUPABASE_DB_PASSWORD:-}@${SUPABASE_DB_HOST:-}:5432/postgres}"
RABBITMQ_URL="amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@rabbitmq:5672"
S3_ENDPOINT="${AWS_S3_ENDPOINT:-https://${SUPABASE_PROJECT_REF:-}.storage.supabase.co/storage/v1/s3}"
S3_PUBLIC_ENDPOINT="${AWS_S3_PUBLIC_ENDPOINT:-$S3_ENDPOINT}"

AUTH_GRPC="auth-service:50051"
FILES_GRPC="upload-manager:50051"
SCENES_GRPC="scene-detector-server:50051"
SEARCH_GRPC="file-embedder-server:50051"
CHAT_GRPC="chat-manager:50051"
BILLING_GRPC="payment-service:50051"

write() {
  cat > "$ROOT/$1"
  echo "  $1"
}

echo "Writing .env.prod files from $ENV_FILE:"

write api-gateway/.env.prod << EOF
PORT=8080
NODE_ENV=production
APP_ORIGINS=${APP_URL}
RABBITMQ_URL=${RABBITMQ_URL}
AUTH_HTTP_URL=http://auth-service:8080
AUTH_GRPC_ADDRESS=${AUTH_GRPC}
FILES_GRPC_ADDRESS=${FILES_GRPC}
SEARCH_GRPC_ADDRESS=${SEARCH_GRPC}
CHAT_GRPC_ADDRESS=${CHAT_GRPC}
BILLING_GRPC_ADDRESS=${BILLING_GRPC}
EOF

write auth-service/.env.prod << EOF
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB}?schema=ragauth
BETTER_AUTH_URL=${APP_URL}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
FRONTEND_URL=${APP_URL}
TRUSTED_ORIGINS=${APP_URL}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
GOOGLE_REDIRECT_URI=${APP_URL}/api/v1/auth/oauth/google/callback
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_SECURE=${SMTP_SECURE:-false}
SMTP_USER=${SMTP_USER:-}
SMTP_PASS=${SMTP_PASS:-}
SMTP_FROM=${SMTP_FROM:-}
APP_NAME=${APP_NAME:-RagSpace}
RABBITMQ_URL=${RABBITMQ_URL}
EOF

write upload-manager/.env.prod << EOF
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB}?schema=upload
RABBITMQ_URL=${RABBITMQ_URL}
BILLING_GRPC_ADDRESS=${BILLING_GRPC}
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
AWS_S3_PUBLIC_ENDPOINT=${S3_PUBLIC_ENDPOINT}
MAX_FILE_SIZE=${MAX_FILE_SIZE:-1073741824}
EOF

write payment-service/.env.prod << EOF
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB}?schema=payment
RABBITMQ_URL=${RABBITMQ_URL}
FRONTEND_URL=${APP_URL}
PAYMENT_PROVIDER=${PAYMENT_PROVIDER:-razorpay}
RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID:-}
RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET:-}
RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_WEBHOOK_SECRET:-}
LEMON_SQUEEZY_API_KEY=${LEMON_SQUEEZY_API_KEY:-}
LEMON_SQUEEZY_STORE_ID=${LEMON_SQUEEZY_STORE_ID:-}
LEMON_SQUEEZY_WEBHOOK_SECRET=${LEMON_SQUEEZY_WEBHOOK_SECRET:-}
EOF

write scene-detector/.env.prod << EOF
PORT=8080
DATABASE_URL=${DB}?schema=scene_detector
RABBITMQ_URL=${RABBITMQ_URL}
FILES_GRPC_ADDRESS=${FILES_GRPC}
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
AWS_S3_PUBLIC_ENDPOINT=${S3_PUBLIC_ENDPOINT}
SCENE_DETECTION_THRESHOLD=${SCENE_DETECTION_THRESHOLD:-27.0}
SCENE_DETECTION_MIN_SCENE_LENGTH=${SCENE_DETECTION_MIN_SCENE_LENGTH:-15}
THUMBNAIL_WIDTH=${THUMBNAIL_WIDTH:-256}
THUMBNAIL_HEIGHT=${THUMBNAIL_HEIGHT:-256}
THUMBNAIL_QUALITY=${THUMBNAIL_QUALITY:-70}
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=${MAX_CONCURRENT_JOBS:-2}
EOF

write file-embedder/.env.prod << EOF
PORT=8080
RABBITMQ_URL=${RABBITMQ_URL}
FILES_GRPC_ADDRESS=${FILES_GRPC}
SCENES_GRPC_ADDRESS=${SCENES_GRPC}
CHROMA_HOST=${CHROMA_HOST:-chromadb}
CHROMA_PORT=${CHROMA_PORT:-8000}
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
CLIP_MODEL=${CLIP_MODEL:-ViT-B-32}
TEXT_MODEL=${TEXT_MODEL:-BAAI/bge-base-en-v1.5}
DEVICE=${DEVICE:-cpu}
NVIDIA_API_KEY=${NVIDIA_API_KEY:-}
EOF

write chat-manager/.env.prod << EOF
PORT=8080
DATABASE_URL=${DB}?schema=chat_manager
RABBITMQ_URL=${RABBITMQ_URL}
SEARCH_GRPC_ADDRESS=${SEARCH_GRPC}
FILES_GRPC_ADDRESS=${FILES_GRPC}
SCENES_GRPC_ADDRESS=${SCENES_GRPC}
BILLING_GRPC_ADDRESS=${BILLING_GRPC}
NVIDIA_API_KEY=${NVIDIA_API_KEY:-}
EOF

echo
echo "Next: docker compose -f docker-compose.prod.yml --env-file ${ENV_FILE#"$ROOT"/} up -d --build"
[[ -n "${NVIDIA_API_KEY:-}" ]] || echo "NVIDIA_API_KEY is empty: visual descriptions and chat replies need it."
[[ -n "${GOOGLE_CLIENT_ID:-}" ]] || echo "GOOGLE_CLIENT_ID is empty: Google sign-in stays disabled."
