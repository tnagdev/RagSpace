#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# generate-envs.sh — Generate per-service .env.prod files from root .env.prod
# ═══════════════════════════════════════════════════════════════════════════════
# Usage (from repo root):
#   bash scripts/generate-envs.sh [--env-file /path/to/.env.prod]
#
# Run this on your VPS before starting containers:
#   bash scripts/generate-envs.sh
#   docker compose -f docker-compose.prod.yml --env-file .env up -d
# ───────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${1:-$REPO_ROOT/.env.prod}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: Root env file not found: $ENV_FILE" >&2
  exit 1
fi

# Load root env (strip comments and blank lines)
set -a
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$')
set +a

# ── Derived values ─────────────────────────────────────────────────────────────
DB_BASE_URL="postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@${SUPABASE_DB_HOST}:5432/postgres"
RABBITMQ_URL="amqp://${RABBITMQ_USER}:${RABBITMQ_PASS}@rabbitmq:5672"
S3_ENDPOINT="https://${SUPABASE_PROJECT_REF}.storage.supabase.co/storage/v1/s3"

echo "Generating service .env.prod files from: $ENV_FILE"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. api-gateway
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/api-gateway/.env.prod" << EOF
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB_BASE_URL}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
CORS_ORIGIN=${PUBLIC_URL}
AUTH_SERVICE_URL=http://auth-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
EOF
echo "  ✓ api-gateway/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 2. auth-service
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/auth-service/.env.prod" << EOF
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB_BASE_URL}?schema=ragauth
BETTER_AUTH_URL=${PUBLIC_URL}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
CORS_ORIGIN=${PUBLIC_URL}
FRONTEND_URL=${PUBLIC_URL}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URI=${PUBLIC_URL}/api/auth/google/callback
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}
APP_NAME=${APP_NAME}
PAYMENT_SERVICE_URL=http://payment-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
EOF
echo "  ✓ auth-service/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 3. upload-manager
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/upload-manager/.env.prod" << EOF
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB_BASE_URL}?schema=upload
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
RABBITMQ_URL=${RABBITMQ_URL}
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.upload.queue
MAX_FILE_SIZE=${MAX_FILE_SIZE}
ALLOWED_FILE_TYPES=${ALLOWED_FILE_TYPES}
EOF
echo "  ✓ upload-manager/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 4. payment-service
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/payment-service/.env.prod" << EOF
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB_BASE_URL}?schema=payment
PAYMENT_PROVIDER=${PAYMENT_PROVIDER}
RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID}
RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET}
RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_WEBHOOK_SECRET}
LEMON_SQUEEZY_API_KEY=${LEMON_SQUEEZY_API_KEY}
LEMON_SQUEEZY_STORE_ID=${LEMON_SQUEEZY_STORE_ID}
LEMON_SQUEEZY_WEBHOOK_SECRET=${LEMON_SQUEEZY_WEBHOOK_SECRET}
API_GATEWAY_URL=http://api-gateway:8080
FRONTEND_URL=${PUBLIC_URL}
EOF
echo "  ✓ payment-service/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 5. scene-detector
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/scene-detector/.env.prod" << EOF
PORT=8080
DATABASE_URL=${DB_BASE_URL}?schema=scene_detector
RABBITMQ_URL=${RABBITMQ_URL}
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=scene.detector.queue
RABBITMQ_ROUTING_KEY=file.upload.completed
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
SCENE_DETECTION_THRESHOLD=${SCENE_DETECTION_THRESHOLD}
SCENE_DETECTION_MIN_SCENE_LENGTH=${SCENE_DETECTION_MIN_SCENE_LENGTH}
THUMBNAIL_WIDTH=${THUMBNAIL_WIDTH}
THUMBNAIL_HEIGHT=${THUMBNAIL_HEIGHT}
THUMBNAIL_QUALITY=${THUMBNAIL_QUALITY}
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=${MAX_CONCURRENT_JOBS}
UPLOAD_MANAGER_URL=http://upload-manager:8080
EOF
echo "  ✓ scene-detector/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 6. file-embedder
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/file-embedder/.env.prod" << EOF
PORT=8080
RABBITMQ_URL=${RABBITMQ_URL}
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.embedder.queue
CHROMA_HOST=${CHROMA_HOST}
CHROMA_PORT=${CHROMA_PORT}
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
CLIP_MODEL=${CLIP_MODEL}
TEXT_MODEL=${TEXT_MODEL}
DEVICE=${DEVICE}
NVIDIA_API_KEY=${NVIDIA_API_KEY}
TESSERACT_CMD=/usr/bin/tesseract
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
EOF
echo "  ✓ file-embedder/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 7. chat-manager
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/chat-manager/.env.prod" << EOF
PORT=8080
DATABASE_URL=${DB_BASE_URL}?schema=chat_manager
NVIDIA_API_KEY=${NVIDIA_API_KEY}
CHROMA_HOST=${CHROMA_HOST}
CHROMA_PORT=${CHROMA_PORT}
AWS_REGION=${AWS_REGION}
AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
AWS_S3_BUCKET=${AWS_S3_BUCKET}
S3_ENDPOINT_URL=${S3_ENDPOINT}
S3_URL_EXPIRATION=${S3_URL_EXPIRATION}
MAX_CONVERSATION_HISTORY=${MAX_CONVERSATION_HISTORY}
CONTEXT_WINDOW_SIZE=${CONTEXT_WINDOW_SIZE}
FILE_EMBEDDER_URL=http://file-embedder-server:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
EOF
echo "  ✓ chat-manager/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 8. frontend
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/frontend/.env.prod" << EOF
VITE_API_URL=${PUBLIC_URL}
EOF
echo "  ✓ frontend/.env.prod"

# ─────────────────────────────────────────────────────────────────────────────
# 9. Root .env for docker-compose interpolation
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/.env" << EOF
RABBITMQ_USER=${RABBITMQ_USER}
RABBITMQ_PASS=${RABBITMQ_PASS}
HTTP_PORT=${HTTP_PORT}
PUBLIC_URL=${PUBLIC_URL}
EOF
echo "  ✓ .env (docker-compose vars)"

echo ""
echo "Done. All service .env.prod files have been generated."
echo ""
echo "Next step:"
echo "  docker compose -f docker-compose.prod.yml --env-file .env up -d"
