# ═══════════════════════════════════════════════════════════════════════════════
# generate-envs.ps1 — Generate per-service .env.prod files from root .env.prod
# ═══════════════════════════════════════════════════════════════════════════════
# Usage (from repo root):
#   .\scripts\generate-envs.ps1
#   .\scripts\generate-envs.ps1 -EnvFile "D:\path\to\.env.prod"
# ───────────────────────────────────────────────────────────────────────────────
param(
    [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $RepoRoot ".env.prod" }

if (-not (Test-Path $EnvFile)) {
    Write-Error "Root env file not found: $EnvFile"
    exit 1
}

# ── Load root .env.prod into a hashtable ──────────────────────────────────────
$Env = @{}
foreach ($line in Get-Content $EnvFile) {
    $line = $line.Trim()
    if ($line -match '^\s*#' -or $line -eq '') { continue }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { continue }
    $key   = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1)
    $Env[$key] = $value
}

# ── Derived values ─────────────────────────────────────────────────────────────
$DB_BASE     = "postgresql://postgres.$($Env.SUPABASE_PROJECT_REF):$($Env.SUPABASE_DB_PASSWORD)@$($Env.SUPABASE_DB_HOST):5432/postgres"
$RABBIT_URL  = "amqp://$($Env.RABBITMQ_USER):$($Env.RABBITMQ_PASS)@rabbitmq:5672"
$S3_ENDPOINT = "https://$($Env.SUPABASE_PROJECT_REF).storage.supabase.co/storage/v1/s3"

function Write-Env([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content)
    Write-Host "  + $(Resolve-Path $Path -Relative)"
}

Write-Host "Generating service .env.prod files from: $EnvFile`n"

# ── 1. api-gateway ────────────────────────────────────────────────────────────
Write-Env "$RepoRoot\api-gateway\.env.prod" @"
PORT=8080
NODE_ENV=production
DATABASE_URL=$DB_BASE
BETTER_AUTH_SECRET=$($Env.BETTER_AUTH_SECRET)
CORS_ORIGIN=$($Env.PUBLIC_URL)
AUTH_SERVICE_URL=http://auth-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
"@

# ── 2. auth-service ───────────────────────────────────────────────────────────
Write-Env "$RepoRoot\auth-service\.env.prod" @"
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB_BASE}?schema=ragauth
BETTER_AUTH_URL=$($Env.PUBLIC_URL)
BETTER_AUTH_SECRET=$($Env.BETTER_AUTH_SECRET)
CORS_ORIGIN=$($Env.PUBLIC_URL)
FRONTEND_URL=$($Env.PUBLIC_URL)
GOOGLE_CLIENT_ID=$($Env.GOOGLE_CLIENT_ID)
GOOGLE_CLIENT_SECRET=$($Env.GOOGLE_CLIENT_SECRET)
GOOGLE_REDIRECT_URI=$($Env.PUBLIC_URL)/api/auth/google/callback
SMTP_HOST=$($Env.SMTP_HOST)
SMTP_PORT=$($Env.SMTP_PORT)
SMTP_USER=$($Env.SMTP_USER)
SMTP_PASS=$($Env.SMTP_PASS)
SMTP_FROM=$($Env.SMTP_FROM)
APP_NAME=$($Env.APP_NAME)
PAYMENT_SERVICE_URL=http://payment-service:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
FILE_EMBEDDER_URL=http://file-embedder-server:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
"@

# ── 3. upload-manager ─────────────────────────────────────────────────────────
Write-Env "$RepoRoot\upload-manager\.env.prod" @"
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB_BASE}?schema=upload
AWS_REGION=$($Env.AWS_REGION)
AWS_ACCESS_KEY_ID=$($Env.AWS_ACCESS_KEY_ID)
AWS_SECRET_ACCESS_KEY=$($Env.AWS_SECRET_ACCESS_KEY)
AWS_S3_BUCKET=$($Env.AWS_S3_BUCKET)
AWS_S3_ENDPOINT=$S3_ENDPOINT
RABBITMQ_URL=$RABBIT_URL
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.upload.queue
MAX_FILE_SIZE=$($Env.MAX_FILE_SIZE)
ALLOWED_FILE_TYPES=$($Env.ALLOWED_FILE_TYPES)
"@

# ── 4. payment-service ────────────────────────────────────────────────────────
Write-Env "$RepoRoot\payment-service\.env.prod" @"
PORT=8080
NODE_ENV=production
DATABASE_URL=${DB_BASE}?schema=payment
PAYMENT_PROVIDER=$($Env.PAYMENT_PROVIDER)
RAZORPAY_KEY_ID=$($Env.RAZORPAY_KEY_ID)
RAZORPAY_KEY_SECRET=$($Env.RAZORPAY_KEY_SECRET)
RAZORPAY_WEBHOOK_SECRET=$($Env.RAZORPAY_WEBHOOK_SECRET)
LEMON_SQUEEZY_API_KEY=$($Env.LEMON_SQUEEZY_API_KEY)
LEMON_SQUEEZY_STORE_ID=$($Env.LEMON_SQUEEZY_STORE_ID)
LEMON_SQUEEZY_WEBHOOK_SECRET=$($Env.LEMON_SQUEEZY_WEBHOOK_SECRET)
API_GATEWAY_URL=http://api-gateway:8080
FRONTEND_URL=$($Env.PUBLIC_URL)
"@

# ── 5. scene-detector ─────────────────────────────────────────────────────────
Write-Env "$RepoRoot\scene-detector\.env.prod" @"
PORT=8080
DATABASE_URL=${DB_BASE}?schema=scene_detector
RABBITMQ_URL=$RABBIT_URL
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=scene.detector.queue
RABBITMQ_ROUTING_KEY=file.upload.completed
AWS_REGION=$($Env.AWS_REGION)
AWS_ACCESS_KEY_ID=$($Env.AWS_ACCESS_KEY_ID)
AWS_SECRET_ACCESS_KEY=$($Env.AWS_SECRET_ACCESS_KEY)
AWS_S3_BUCKET=$($Env.AWS_S3_BUCKET)
AWS_S3_ENDPOINT=$S3_ENDPOINT
SCENE_DETECTION_THRESHOLD=$($Env.SCENE_DETECTION_THRESHOLD)
SCENE_DETECTION_MIN_SCENE_LENGTH=$($Env.SCENE_DETECTION_MIN_SCENE_LENGTH)
THUMBNAIL_WIDTH=$($Env.THUMBNAIL_WIDTH)
THUMBNAIL_HEIGHT=$($Env.THUMBNAIL_HEIGHT)
THUMBNAIL_QUALITY=$($Env.THUMBNAIL_QUALITY)
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=$($Env.MAX_CONCURRENT_JOBS)
UPLOAD_MANAGER_URL=http://upload-manager:8080
"@

# ── 6. file-embedder ──────────────────────────────────────────────────────────
Write-Env "$RepoRoot\file-embedder\.env.prod" @"
PORT=8080
RABBITMQ_URL=$RABBIT_URL
RABBITMQ_EXCHANGE=file.events
RABBITMQ_QUEUE=file.embedder.queue
CHROMA_HOST=$($Env.CHROMA_HOST)
CHROMA_PORT=$($Env.CHROMA_PORT)
AWS_REGION=$($Env.AWS_REGION)
AWS_ACCESS_KEY_ID=$($Env.AWS_ACCESS_KEY_ID)
AWS_SECRET_ACCESS_KEY=$($Env.AWS_SECRET_ACCESS_KEY)
AWS_S3_BUCKET=$($Env.AWS_S3_BUCKET)
AWS_S3_ENDPOINT=$S3_ENDPOINT
CLIP_MODEL=$($Env.CLIP_MODEL)
TEXT_MODEL=$($Env.TEXT_MODEL)
DEVICE=$($Env.DEVICE)
NVIDIA_API_KEY=$($Env.NVIDIA_API_KEY)
TESSERACT_CMD=/usr/bin/tesseract
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
CHAT_MANAGER_URL=http://chat-manager:8080
"@

# ── 7. chat-manager ───────────────────────────────────────────────────────────
Write-Env "$RepoRoot\chat-manager\.env.prod" @"
PORT=8080
DATABASE_URL=${DB_BASE}?schema=chat_manager
NVIDIA_API_KEY=$($Env.NVIDIA_API_KEY)
CHROMA_HOST=$($Env.CHROMA_HOST)
CHROMA_PORT=$($Env.CHROMA_PORT)
AWS_REGION=$($Env.AWS_REGION)
AWS_ACCESS_KEY_ID=$($Env.AWS_ACCESS_KEY_ID)
AWS_SECRET_ACCESS_KEY=$($Env.AWS_SECRET_ACCESS_KEY)
AWS_S3_BUCKET=$($Env.AWS_S3_BUCKET)
S3_ENDPOINT_URL=$S3_ENDPOINT
S3_URL_EXPIRATION=$($Env.S3_URL_EXPIRATION)
MAX_CONVERSATION_HISTORY=$($Env.MAX_CONVERSATION_HISTORY)
CONTEXT_WINDOW_SIZE=$($Env.CONTEXT_WINDOW_SIZE)
FILE_EMBEDDER_URL=http://file-embedder-server:8080
UPLOAD_MANAGER_URL=http://upload-manager:8080
SCENE_DETECTOR_URL=http://scene-detector-server:8080
PAYMENT_SERVICE_URL=http://payment-service:8080
"@

# ── 8. frontend ───────────────────────────────────────────────────────────────
Write-Env "$RepoRoot\frontend\.env.prod" @"
VITE_API_URL=$($Env.PUBLIC_URL)
"@

# ── 9. Root .env for docker-compose interpolation ─────────────────────────────
Write-Env "$RepoRoot\.env" @"
RABBITMQ_USER=$($Env.RABBITMQ_USER)
RABBITMQ_PASS=$($Env.RABBITMQ_PASS)
GATEWAY_PORT=$($Env.GATEWAY_PORT)
"@

Write-Host "`nDone. All service .env.prod files have been generated."
Write-Host "`nNext step:"
Write-Host "  docker compose -f docker-compose.prod.yml --env-file .env up -d"
