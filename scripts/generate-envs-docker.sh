#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# generate-envs-docker.sh — Generate per-service .env.docker files for local
#                           Docker Compose development (everything runs locally)
# ═══════════════════════════════════════════════════════════════════════════════
# Usage (from repo root):
#   bash scripts/generate-envs-docker.sh
#   NVIDIA_API_KEY=nvapi-... bash scripts/generate-envs-docker.sh
#
# Local services (docker-compose.dev.yml):
#   PostgreSQL  → postgres:5432         (user: postgres / pass: postgres)
#   RabbitMQ    → rabbitmq:5672         (user: guest    / pass: guest)
#   ChromaDB    → chromadb:8000
#   MinIO (S3)  → minio:9000            (user: minioadmin / pass: minioadmin)
# ───────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# ── Shared local values (override via env vars before running) ─────────────────
DB_BASE="postgresql://postgres:postgres@postgres:5432/postgres"
RABBIT_URL="amqp://guest:guest@rabbitmq:5672"
S3_ENDPOINT="http://minio:9000"
S3_KEY="minioadmin"
S3_SECRET="minioadmin"
S3_BUCKET="rag-user-uploads"
S3_REGION="us-east-1"
FRONTEND_URL="http://localhost:3000"
CHROMA_HOST="chromadb"
CHROMA_PORT="8000"

BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-local-dev-secret-32-chars-min!!}"
NVIDIA_API_KEY="${NVIDIA_API_KEY:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
SMTP_FROM="${SMTP_FROM:-noreply@ragspace.local}"

echo "Generating service .env.docker files for local Docker Compose..."
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# 1. api-gateway
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/api-gateway/.env.docker" << EOF
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB_BASE}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
CORS_ORIGIN=${FRONTEND_URL}
AUTH_SERVICE_URL=http://auth-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
EOF
echo "  ✓ api-gateway/.env.docker"

# ─────────────────────────────────────────────────────────────────────────────
# 2. auth-service
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/auth-service/.env.docker" << EOF
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB_BASE}?schema=ragauth
BETTER_AUTH_URL=${FRONTEND_URL}
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
CORS_ORIGIN=${FRONTEND_URL}
FRONTEND_URL=${FRONTEND_URL}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
GOOGLE_REDIRECT_URI=${FRONTEND_URL}/api/auth/google/callback
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}
SMTP_FROM=${SMTP_FROM}
APP_NAME=RagSpace
PAYMENT_SERVICE_URL=http://payment-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
EOF
echo "  ✓ auth-service/.env.docker"

# ─────────────────────────────────────────────────────────────────────────────
# 3. upload-manager
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/upload-manager/.env.docker" << EOF
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB_BASE}?schema=upload
AWS_REGION=${S3_REGION}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
AWS_S3_BUCKET=${S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
RABBITMQ_URL=${RABBIT_URL}
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.upload.queue
MAX_FILE_SIZE=1073741824
ALLOWED_FILE_TYPES=image/*,video/*,audio/*,application/pdf
AUTH_SERVICE_URL=http://auth-service:8080
AWS_S3_PUBLIC_ENDPOINT=http://localhost:9000
EOF
echo "  ✓ upload-manager/.env.docker"

# ─────────────────────────────────────────────────────────────────────────────
# 4. payment-service
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/payment-service/.env.docker" << EOF
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB_BASE}?schema=payment
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
LEMON_SQUEEZY_API_KEY=
LEMON_SQUEEZY_STORE_ID=
LEMON_SQUEEZY_WEBHOOK_SECRET=
API_GATEWAY_URL=http://api-gateway:8080
FRONTEND_URL=${FRONTEND_URL}
EOF
echo "  ✓ payment-service/.env.docker"

# ─────────────────────────────────────────────────────────────────────────────
# 5. scene-detector
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/scene-detector/.env.docker" << EOF
PORT=8080
DATABASE_URL=${DB_BASE}?schema=scene_detector
RABBITMQ_URL=${RABBIT_URL}
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=scene.detector.queue
RABBITMQ_ROUTING_KEY=file.upload.completed
AWS_REGION=${S3_REGION}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
AWS_S3_BUCKET=${S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
SCENE_DETECTION_THRESHOLD=27.0
SCENE_DETECTION_MIN_SCENE_LENGTH=15
THUMBNAIL_WIDTH=256
THUMBNAIL_HEIGHT=256
THUMBNAIL_QUALITY=70
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=2
UPLOAD_MANAGER_URL=http://upload-manager:8080
EOF
echo "  ✓ scene-detector/.env.docker"

# ─────────────────────────────────────────────────────────────────────────────
# 6. file-embedder
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/file-embedder/.env.docker" << EOF
PORT=8080
RABBITMQ_URL=${RABBIT_URL}
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.embedder.queue
CHROMA_HOST=${CHROMA_HOST}
CHROMA_PORT=${CHROMA_PORT}
AWS_REGION=${S3_REGION}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
AWS_S3_BUCKET=${S3_BUCKET}
AWS_S3_ENDPOINT=${S3_ENDPOINT}
CLIP_MODEL=ViT-B-32
TEXT_MODEL=BAAI/bge-base-en-v1.5
DEVICE=cpu
NVIDIA_API_KEY=${NVIDIA_API_KEY}
TESSERACT_CMD=/usr/bin/tesseract
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
EOF
echo "  ✓ file-embedder/.env.docker"

# ─────────────────────────────────────────────────────────────────────────────
# 7. chat-manager
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/chat-manager/.env.docker" << EOF
PORT=8080
DATABASE_URL=${DB_BASE}?schema=chat_manager
NVIDIA_API_KEY=${NVIDIA_API_KEY}
CHROMA_HOST=${CHROMA_HOST}
CHROMA_PORT=${CHROMA_PORT}
AWS_REGION=${S3_REGION}
AWS_ACCESS_KEY_ID=${S3_KEY}
AWS_SECRET_ACCESS_KEY=${S3_SECRET}
AWS_S3_BUCKET=${S3_BUCKET}
S3_ENDPOINT_URL=${S3_ENDPOINT}
S3_URL_EXPIRATION=3600
MAX_CONVERSATION_HISTORY=10
CONTEXT_WINDOW_SIZE=5
FILE_EMBEDDER_URL=http://file-embedder-server:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
EOF
echo "  ✓ chat-manager/.env.docker"

# ─────────────────────────────────────────────────────────────────────────────
# 8. frontend
# ─────────────────────────────────────────────────────────────────────────────
cat > "$REPO_ROOT/frontend/.env.docker" << EOF
VITE_API_URL=http://localhost:8000
EOF
echo "  ✓ frontend/.env.docker"

echo ""
echo "Done. All service .env.docker files have been generated."
echo ""
echo "Next steps:"
echo "  1. Start local infrastructure + all services:"
echo "       docker compose -f docker-compose.dev.yml up -d"
echo "  2. MinIO bucket is auto-created on first run (bucket: ${S3_BUCKET})"
echo "  3. MinIO console: http://localhost:9001  (minioadmin / minioadmin)"
echo "  4. RabbitMQ UI:   http://localhost:15672 (guest / guest)"
echo "  5. Fill in secrets if needed:"
echo "       NVIDIA_API_KEY=nvapi-... bash scripts/generate-envs-docker.sh"
