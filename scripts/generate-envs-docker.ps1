# Writes every service's .env.docker for docker-compose.dev.yml.
# Secrets come from the environment, else from the file being replaced, so re-running keeps your keys:
#   $env:NVIDIA_API_KEY = "nvapi-..."; .\scripts\generate-envs-docker.ps1
$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent

$AppUrl = 'http://localhost:3000'
$Db = 'postgresql://postgres:postgres@postgres:5432/postgres'
$RabbitUrl = 'amqp://guest:guest@rabbitmq:5672'
$S3Endpoint = 'http://minio:9000'
# Presigned URLs are opened by the browser, which reaches MinIO on its published port.
$S3PublicEndpoint = 'http://localhost:9000'
$S3Region = 'us-east-1'
$S3Bucket = 'rag-user-uploads'
$S3Key = 'minioadmin'
$S3Secret = 'minioadmin'

$AuthGrpc = 'auth-service:50051'
$FilesGrpc = 'upload-manager:50051'
$ScenesGrpc = 'scene-detector-server:50051'
$SearchGrpc = 'file-embedder-server:50051'
$ChatGrpc = 'chat-manager:50051'
$BillingGrpc = 'payment-service:50051'

function Get-Secret([string]$Name, [string]$File, [string]$Default = "") {
    $value = [Environment]::GetEnvironmentVariable($Name)
    $path = Join-Path $Root $File
    if (-not $value -and (Test-Path $path)) {
        $line = Get-Content $path | Where-Object { $_ -like "$Name=*" } | Select-Object -Last 1
        if ($line) { $value = $line.Substring($Name.Length + 1).TrimEnd("`r") }
    }
    if ($value) { return $value }
    return $Default
}

function Write-Env([string]$Path, [string]$Content) {
    # LF without a BOM: a stray \r or BOM ends up inside the values the services parse.
    [System.IO.File]::WriteAllText((Join-Path $Root $Path), ($Content.Replace("`r`n", "`n") + "`n"))
    Write-Host "  $Path"
}

$BetterAuthSecret = Get-Secret 'BETTER_AUTH_SECRET' 'auth-service/.env.docker' 'local-dev-secret-32-chars-min!!'
$GoogleClientId = Get-Secret 'GOOGLE_CLIENT_ID' 'auth-service/.env.docker'
$GoogleClientSecret = Get-Secret 'GOOGLE_CLIENT_SECRET' 'auth-service/.env.docker'
$SmtpHost = Get-Secret 'SMTP_HOST' 'auth-service/.env.docker'
$SmtpPort = Get-Secret 'SMTP_PORT' 'auth-service/.env.docker' '587'
$SmtpSecure = Get-Secret 'SMTP_SECURE' 'auth-service/.env.docker' 'false'
$SmtpUser = Get-Secret 'SMTP_USER' 'auth-service/.env.docker'
$SmtpPass = Get-Secret 'SMTP_PASS' 'auth-service/.env.docker'
$SmtpFrom = Get-Secret 'SMTP_FROM' 'auth-service/.env.docker' 'noreply@ragspace.local'
$NvidiaApiKey = Get-Secret 'NVIDIA_API_KEY' 'file-embedder/.env.docker'
$ChatNvidiaApiKey = Get-Secret 'NVIDIA_API_KEY' 'chat-manager/.env.docker' $NvidiaApiKey
$RazorpayKeyId = Get-Secret 'RAZORPAY_KEY_ID' 'payment-service/.env.docker'
$RazorpayKeySecret = Get-Secret 'RAZORPAY_KEY_SECRET' 'payment-service/.env.docker'
$RazorpayWebhookSecret = Get-Secret 'RAZORPAY_WEBHOOK_SECRET' 'payment-service/.env.docker'
$LemonApiKey = Get-Secret 'LEMON_SQUEEZY_API_KEY' 'payment-service/.env.docker'
$LemonStoreId = Get-Secret 'LEMON_SQUEEZY_STORE_ID' 'payment-service/.env.docker'
$LemonWebhookSecret = Get-Secret 'LEMON_SQUEEZY_WEBHOOK_SECRET' 'payment-service/.env.docker'

Write-Host "Writing .env.docker files:"

Write-Env 'api-gateway/.env.docker' @"
PORT=8080
NODE_ENV=docker
APP_ORIGINS=$AppUrl
RABBITMQ_URL=$RabbitUrl
AUTH_HTTP_URL=http://auth-service:8080
AUTH_GRPC_ADDRESS=$AuthGrpc
FILES_GRPC_ADDRESS=$FilesGrpc
SEARCH_GRPC_ADDRESS=$SearchGrpc
CHAT_GRPC_ADDRESS=$ChatGrpc
BILLING_GRPC_ADDRESS=$BillingGrpc
"@

Write-Env 'auth-service/.env.docker' @"
PORT=8080
NODE_ENV=docker
DATABASE_URL=$Db`?schema=ragauth
BETTER_AUTH_URL=$AppUrl
BETTER_AUTH_SECRET=$BetterAuthSecret
FRONTEND_URL=$AppUrl
TRUSTED_ORIGINS=$AppUrl
GOOGLE_CLIENT_ID=$GoogleClientId
GOOGLE_CLIENT_SECRET=$GoogleClientSecret
GOOGLE_REDIRECT_URI=$AppUrl/api/v1/auth/oauth/google/callback
SMTP_HOST=$SmtpHost
SMTP_PORT=$SmtpPort
SMTP_SECURE=$SmtpSecure
SMTP_USER=$SmtpUser
SMTP_PASS=$SmtpPass
SMTP_FROM=$SmtpFrom
APP_NAME=RagSpace
RABBITMQ_URL=$RabbitUrl
"@

Write-Env 'upload-manager/.env.docker' @"
PORT=8080
NODE_ENV=docker
DATABASE_URL=$Db`?schema=upload
RABBITMQ_URL=$RabbitUrl
BILLING_GRPC_ADDRESS=$BillingGrpc
AWS_REGION=$S3Region
AWS_ACCESS_KEY_ID=$S3Key
AWS_SECRET_ACCESS_KEY=$S3Secret
AWS_S3_BUCKET=$S3Bucket
AWS_S3_ENDPOINT=$S3Endpoint
AWS_S3_PUBLIC_ENDPOINT=$S3PublicEndpoint
MAX_FILE_SIZE=1073741824
"@

Write-Env 'payment-service/.env.docker' @"
PORT=8080
NODE_ENV=docker
DATABASE_URL=$Db`?schema=payment
RABBITMQ_URL=$RabbitUrl
FRONTEND_URL=$AppUrl
PAYMENT_PROVIDER=razorpay
RAZORPAY_KEY_ID=$RazorpayKeyId
RAZORPAY_KEY_SECRET=$RazorpayKeySecret
RAZORPAY_WEBHOOK_SECRET=$RazorpayWebhookSecret
LEMON_SQUEEZY_API_KEY=$LemonApiKey
LEMON_SQUEEZY_STORE_ID=$LemonStoreId
LEMON_SQUEEZY_WEBHOOK_SECRET=$LemonWebhookSecret
"@

Write-Env 'scene-detector/.env.docker' @"
PORT=8080
DATABASE_URL=$Db`?schema=scene_detector
RABBITMQ_URL=$RabbitUrl
FILES_GRPC_ADDRESS=$FilesGrpc
AWS_REGION=$S3Region
AWS_ACCESS_KEY_ID=$S3Key
AWS_SECRET_ACCESS_KEY=$S3Secret
AWS_S3_BUCKET=$S3Bucket
AWS_S3_ENDPOINT=$S3Endpoint
AWS_S3_PUBLIC_ENDPOINT=$S3PublicEndpoint
SCENE_DETECTION_THRESHOLD=27.0
SCENE_DETECTION_MIN_SCENE_LENGTH=15
THUMBNAIL_WIDTH=256
THUMBNAIL_HEIGHT=256
THUMBNAIL_QUALITY=70
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=2
"@

Write-Env 'file-embedder/.env.docker' @"
PORT=8080
RABBITMQ_URL=$RabbitUrl
FILES_GRPC_ADDRESS=$FilesGrpc
SCENES_GRPC_ADDRESS=$ScenesGrpc
CHROMA_HOST=chromadb
CHROMA_PORT=8000
AWS_REGION=$S3Region
AWS_ACCESS_KEY_ID=$S3Key
AWS_SECRET_ACCESS_KEY=$S3Secret
AWS_S3_BUCKET=$S3Bucket
AWS_S3_ENDPOINT=$S3Endpoint
CLIP_MODEL=ViT-B-32
TEXT_MODEL=BAAI/bge-base-en-v1.5
DEVICE=cpu
NVIDIA_API_KEY=$NvidiaApiKey
"@

Write-Env 'chat-manager/.env.docker' @"
PORT=8080
DATABASE_URL=$Db`?schema=chat_manager
RABBITMQ_URL=$RabbitUrl
SEARCH_GRPC_ADDRESS=$SearchGrpc
FILES_GRPC_ADDRESS=$FilesGrpc
SCENES_GRPC_ADDRESS=$ScenesGrpc
BILLING_GRPC_ADDRESS=$BillingGrpc
NVIDIA_API_KEY=$ChatNvidiaApiKey
"@

Write-Env 'frontend/.env.docker' @"
API_GATEWAY_URL=http://api-gateway:8080
"@

Write-Host ""
Write-Host "Next: docker compose -f docker-compose.dev.yml up -d"
if (-not $NvidiaApiKey) { Write-Host "NVIDIA_API_KEY is empty: visual descriptions and chat replies need it." }
