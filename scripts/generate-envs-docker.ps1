# ═══════════════════════════════════════════════════════════════════════════════
# generate-envs-docker.ps1 — Generate per-service .env.docker files for local
#                            Docker Compose development (everything runs locally)
# ═══════════════════════════════════════════════════════════════════════════════
# Usage (from repo root):
#   .\scripts\generate-envs-docker.ps1
#   .\scripts\generate-envs-docker.ps1 -BetterAuthSecret "my-secret" -NvidiaApiKey "nvapi-..."
#
# Local services (docker-compose.dev.yml):
#   PostgreSQL  → postgres:5432         (user: postgres / pass: postgres)
#   RabbitMQ    → rabbitmq:5672         (user: guest    / pass: guest)
#   ChromaDB    → chromadb:8000
#   MinIO (S3)  → minio:9000            (user: minioadmin / pass: minioadmin)
# ───────────────────────────────────────────────────────────────────────────────
param(
    [string]$BetterAuthSecret  = "local-dev-secret-32-chars-min!!",
    [string]$NvidiaApiKey      = "",
    [string]$GoogleClientId    = "",
    [string]$GoogleClientSecret = "",
    [string]$SmtpHost          = "",
    [string]$SmtpPort          = "587",
    [string]$SmtpUser          = "",
    [string]$SmtpPass          = "",
    [string]$SmtpFrom          = "noreply@ragspace.local"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent

# ── Shared local values ────────────────────────────────────────────────────────
$DB_BASE       = "postgresql://postgres:postgres@postgres:5432/postgres"
$RABBIT_URL    = "amqp://guest:guest@rabbitmq:5672"
$S3_ENDPOINT   = "http://minio:9000"
$S3_KEY        = "minioadmin"
$S3_SECRET     = "minioadmin"
$S3_BUCKET     = "rag-user-uploads"
$S3_REGION     = "us-east-1"
$FRONTEND_URL  = "http://localhost:3000"
$CHROMA_HOST   = "chromadb"
$CHROMA_PORT   = "8000"

function Write-Env([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content)
    $rel = $Path.Replace($RepoRoot, "").TrimStart("\")
    Write-Host "  + $rel"
}

Write-Host "Generating service .env.docker files for local Docker Compose...`n"

# ── 1. api-gateway ────────────────────────────────────────────────────────────
Write-Env "$RepoRoot\api-gateway\.env.docker" @"
PORT=8080
NODE_ENV=docker
DATABASE_URL=$DB_BASE
BETTER_AUTH_SECRET=$BetterAuthSecret
CORS_ORIGIN=$FRONTEND_URL
AUTH_SERVICE_URL=http://auth-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
"@

# ── 2. auth-service ───────────────────────────────────────────────────────────
Write-Env "$RepoRoot\auth-service\.env.docker" @"
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB_BASE}?schema=ragauth
BETTER_AUTH_URL=$FRONTEND_URL
BETTER_AUTH_SECRET=$BetterAuthSecret
CORS_ORIGIN=$FRONTEND_URL
FRONTEND_URL=$FRONTEND_URL
GOOGLE_CLIENT_ID=$GoogleClientId
GOOGLE_CLIENT_SECRET=$GoogleClientSecret
GOOGLE_REDIRECT_URI=${FRONTEND_URL}/api/auth/google/callback
SMTP_HOST=$SmtpHost
SMTP_PORT=$SmtpPort
SMTP_USER=$SmtpUser
SMTP_PASS=$SmtpPass
SMTP_FROM=$SmtpFrom
APP_NAME=RagSpace
PAYMENT_SERVICE_URL=http://payment-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
"@

# ── 3. upload-manager ─────────────────────────────────────────────────────────
Write-Env "$RepoRoot\upload-manager\.env.docker" @"
PORT=8080
NODE_ENV=docker
DATABASE_URL=${DB_BASE}?schema=upload
AWS_REGION=$S3_REGION
AWS_ACCESS_KEY_ID=$S3_KEY
AWS_SECRET_ACCESS_KEY=$S3_SECRET
AWS_S3_BUCKET=$S3_BUCKET
AWS_S3_ENDPOINT=$S3_ENDPOINT
RABBITMQ_URL=$RABBIT_URL
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.upload.queue
MAX_FILE_SIZE=1073741824
ALLOWED_FILE_TYPES=image/*,video/*,audio/*,application/pdf
"@

# ── 4. payment-service ────────────────────────────────────────────────────────
Write-Env "$RepoRoot\payment-service\.env.docker" @"
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
FRONTEND_URL=$FRONTEND_URL
"@

# ── 5. scene-detector ─────────────────────────────────────────────────────────
Write-Env "$RepoRoot\scene-detector\.env.docker" @"
PORT=8080
DATABASE_URL=${DB_BASE}?schema=scene_detector
RABBITMQ_URL=$RABBIT_URL
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=scene.detector.queue
RABBITMQ_ROUTING_KEY=file.upload.completed
AWS_REGION=$S3_REGION
AWS_ACCESS_KEY_ID=$S3_KEY
AWS_SECRET_ACCESS_KEY=$S3_SECRET
AWS_S3_BUCKET=$S3_BUCKET
AWS_S3_ENDPOINT=$S3_ENDPOINT
SCENE_DETECTION_THRESHOLD=27.0
SCENE_DETECTION_MIN_SCENE_LENGTH=15
THUMBNAIL_WIDTH=256
THUMBNAIL_HEIGHT=256
THUMBNAIL_QUALITY=70
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=2
UPLOAD_MANAGER_URL=http://upload-manager:8080
"@

# ── 6. file-embedder ──────────────────────────────────────────────────────────
Write-Env "$RepoRoot\file-embedder\.env.docker" @"
PORT=8080
RABBITMQ_URL=$RABBIT_URL
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.embedder.queue
CHROMA_HOST=$CHROMA_HOST
CHROMA_PORT=$CHROMA_PORT
AWS_REGION=$S3_REGION
AWS_ACCESS_KEY_ID=$S3_KEY
AWS_SECRET_ACCESS_KEY=$S3_SECRET
AWS_S3_BUCKET=$S3_BUCKET
AWS_S3_ENDPOINT=$S3_ENDPOINT
CLIP_MODEL=ViT-B-32
TEXT_MODEL=BAAI/bge-base-en-v1.5
DEVICE=cpu
NVIDIA_API_KEY=$NvidiaApiKey
TESSERACT_CMD=/usr/bin/tesseract
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
"@

# ── 7. chat-manager ───────────────────────────────────────────────────────────
Write-Env "$RepoRoot\chat-manager\.env.docker" @"
PORT=8080
DATABASE_URL=${DB_BASE}?schema=chat_manager
NVIDIA_API_KEY=$NvidiaApiKey
CHROMA_HOST=$CHROMA_HOST
CHROMA_PORT=$CHROMA_PORT
AWS_REGION=$S3_REGION
AWS_ACCESS_KEY_ID=$S3_KEY
AWS_SECRET_ACCESS_KEY=$S3_SECRET
AWS_S3_BUCKET=$S3_BUCKET
S3_ENDPOINT_URL=$S3_ENDPOINT
S3_URL_EXPIRATION=3600
MAX_CONVERSATION_HISTORY=10
CONTEXT_WINDOW_SIZE=5
FILE_EMBEDDER_URL=http://file-embedder-server:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
"@

# ── 8. frontend ───────────────────────────────────────────────────────────────
Write-Env "$RepoRoot\frontend\.env.docker" @"
VITE_API_URL=http://localhost:8000
"@

Write-Host "`nDone. All service .env.docker files have been generated."
Write-Host "`nNext steps:"
Write-Host "  1. Start local infrastructure + all services:"
Write-Host "       docker compose -f docker-compose.dev.yml up -d"
Write-Host "  2. MinIO bucket is auto-created on first run (bucket: $S3_BUCKET)"
Write-Host "  3. MinIO console: http://localhost:9001  (minioadmin / minioadmin)"
Write-Host "  4. RabbitMQ UI:   http://localhost:15672 (guest / guest)"
Write-Host "  5. Fill in secrets (NVIDIA_API_KEY, SMTP_*, GOOGLE_*) if needed:"
Write-Host "       .\scripts\generate-envs-docker.ps1 -NvidiaApiKey `"nvapi-...`""
