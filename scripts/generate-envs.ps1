# Writes every service's .env.prod for docker-compose.prod.yml from the root .env.prod.
#   .\scripts\generate-envs.ps1 [-EnvFile PATH]
#   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
param(
    [string]$EnvFile = ""
)

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
if (-not $EnvFile) { $EnvFile = Join-Path $Root ".env.prod" }
if (-not (Test-Path $EnvFile)) { throw "Root env file not found: $EnvFile" }

$Vars = @{}
foreach ($line in Get-Content $EnvFile) {
    if ($line -match '^\s*(#|$)') { continue }
    $index = $line.IndexOf('=')
    if ($index -lt 1) { continue }
    $value = $line.Substring($index + 1)
    if ($value -match '^"(.*)"$' -or $value -match "^'(.*)'$") { $value = $Matches[1] }
    $Vars[$line.Substring(0, $index).Trim()] = $value
}

function Get-Var([string]$Name, [string]$Default = "") {
    if ($Vars[$Name]) { return $Vars[$Name] }
    return $Default
}

$Required = @('PUBLIC_URL', 'RABBITMQ_USER', 'RABBITMQ_PASS', 'BETTER_AUTH_SECRET', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_S3_BUCKET')
if (-not $Vars['DATABASE_URL']) { $Required += @('SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_HOST') }
elseif (-not $Vars['AWS_S3_ENDPOINT']) { $Required += 'SUPABASE_PROJECT_REF' }
$Missing = @($Required | Where-Object { -not $Vars[$_] })
if ($Missing.Count) { throw "Missing in ${EnvFile}: $($Missing -join ' ')" }

$AppUrl = $Vars['PUBLIC_URL'].TrimEnd('/')
$Db = Get-Var 'DATABASE_URL' "postgresql://postgres.$($Vars['SUPABASE_PROJECT_REF']):$($Vars['SUPABASE_DB_PASSWORD'])@$($Vars['SUPABASE_DB_HOST']):5432/postgres"
$RabbitUrl = "amqp://$($Vars['RABBITMQ_USER']):$($Vars['RABBITMQ_PASS'])@rabbitmq:5672"
$S3Endpoint = Get-Var 'AWS_S3_ENDPOINT' "https://$($Vars['SUPABASE_PROJECT_REF']).storage.supabase.co/storage/v1/s3"
$S3PublicEndpoint = Get-Var 'AWS_S3_PUBLIC_ENDPOINT' $S3Endpoint

$AuthGrpc = 'auth-service:50051'
$FilesGrpc = 'upload-manager:50051'
$ScenesGrpc = 'scene-detector-server:50051'
$SearchGrpc = 'file-embedder-server:50051'
$ChatGrpc = 'chat-manager:50051'
$BillingGrpc = 'payment-service:50051'

function Write-Env([string]$Path, [string]$Content) {
    # LF without a BOM: a stray \r or BOM ends up inside the values the services parse.
    [System.IO.File]::WriteAllText((Join-Path $Root $Path), ($Content.Replace("`r`n", "`n") + "`n"))
    Write-Host "  $Path"
}

Write-Host "Writing .env.prod files from ${EnvFile}:"

Write-Env 'api-gateway/.env.prod' @"
PORT=8080
NODE_ENV=production
APP_ORIGINS=$AppUrl
RABBITMQ_URL=$RabbitUrl
AUTH_HTTP_URL=http://auth-service:8080
AUTH_GRPC_ADDRESS=$AuthGrpc
FILES_GRPC_ADDRESS=$FilesGrpc
SEARCH_GRPC_ADDRESS=$SearchGrpc
CHAT_GRPC_ADDRESS=$ChatGrpc
BILLING_GRPC_ADDRESS=$BillingGrpc
"@

Write-Env 'auth-service/.env.prod' @"
PORT=8080
NODE_ENV=production
DATABASE_URL=$Db`?schema=ragauth
BETTER_AUTH_URL=$AppUrl
BETTER_AUTH_SECRET=$($Vars['BETTER_AUTH_SECRET'])
FRONTEND_URL=$AppUrl
TRUSTED_ORIGINS=$AppUrl
GOOGLE_CLIENT_ID=$(Get-Var 'GOOGLE_CLIENT_ID')
GOOGLE_CLIENT_SECRET=$(Get-Var 'GOOGLE_CLIENT_SECRET')
GOOGLE_REDIRECT_URI=$AppUrl/api/v1/auth/oauth/google/callback
SMTP_HOST=$(Get-Var 'SMTP_HOST')
SMTP_PORT=$(Get-Var 'SMTP_PORT' '587')
SMTP_SECURE=$(Get-Var 'SMTP_SECURE' 'false')
SMTP_USER=$(Get-Var 'SMTP_USER')
SMTP_PASS=$(Get-Var 'SMTP_PASS')
SMTP_FROM=$(Get-Var 'SMTP_FROM')
APP_NAME=$(Get-Var 'APP_NAME' 'RagSpace')
RABBITMQ_URL=$RabbitUrl
"@

Write-Env 'upload-manager/.env.prod' @"
PORT=8080
NODE_ENV=production
DATABASE_URL=$Db`?schema=upload
RABBITMQ_URL=$RabbitUrl
BILLING_GRPC_ADDRESS=$BillingGrpc
AWS_REGION=$($Vars['AWS_REGION'])
AWS_ACCESS_KEY_ID=$($Vars['AWS_ACCESS_KEY_ID'])
AWS_SECRET_ACCESS_KEY=$($Vars['AWS_SECRET_ACCESS_KEY'])
AWS_S3_BUCKET=$($Vars['AWS_S3_BUCKET'])
AWS_S3_ENDPOINT=$S3Endpoint
AWS_S3_PUBLIC_ENDPOINT=$S3PublicEndpoint
MAX_FILE_SIZE=$(Get-Var 'MAX_FILE_SIZE' '1073741824')
"@

Write-Env 'payment-service/.env.prod' @"
PORT=8080
NODE_ENV=production
DATABASE_URL=$Db`?schema=payment
RABBITMQ_URL=$RabbitUrl
FRONTEND_URL=$AppUrl
PAYMENT_PROVIDER=$(Get-Var 'PAYMENT_PROVIDER' 'razorpay')
RAZORPAY_KEY_ID=$(Get-Var 'RAZORPAY_KEY_ID')
RAZORPAY_KEY_SECRET=$(Get-Var 'RAZORPAY_KEY_SECRET')
RAZORPAY_WEBHOOK_SECRET=$(Get-Var 'RAZORPAY_WEBHOOK_SECRET')
LEMON_SQUEEZY_API_KEY=$(Get-Var 'LEMON_SQUEEZY_API_KEY')
LEMON_SQUEEZY_STORE_ID=$(Get-Var 'LEMON_SQUEEZY_STORE_ID')
LEMON_SQUEEZY_WEBHOOK_SECRET=$(Get-Var 'LEMON_SQUEEZY_WEBHOOK_SECRET')
"@

Write-Env 'scene-detector/.env.prod' @"
PORT=8080
DATABASE_URL=$Db`?schema=scene_detector
RABBITMQ_URL=$RabbitUrl
FILES_GRPC_ADDRESS=$FilesGrpc
AWS_REGION=$($Vars['AWS_REGION'])
AWS_ACCESS_KEY_ID=$($Vars['AWS_ACCESS_KEY_ID'])
AWS_SECRET_ACCESS_KEY=$($Vars['AWS_SECRET_ACCESS_KEY'])
AWS_S3_BUCKET=$($Vars['AWS_S3_BUCKET'])
AWS_S3_ENDPOINT=$S3Endpoint
AWS_S3_PUBLIC_ENDPOINT=$S3PublicEndpoint
SCENE_DETECTION_THRESHOLD=$(Get-Var 'SCENE_DETECTION_THRESHOLD' '27.0')
SCENE_DETECTION_MIN_SCENE_LENGTH=$(Get-Var 'SCENE_DETECTION_MIN_SCENE_LENGTH' '15')
THUMBNAIL_WIDTH=$(Get-Var 'THUMBNAIL_WIDTH' '256')
THUMBNAIL_HEIGHT=$(Get-Var 'THUMBNAIL_HEIGHT' '256')
THUMBNAIL_QUALITY=$(Get-Var 'THUMBNAIL_QUALITY' '70')
TEMP_DIR=/tmp/scene-detector
MAX_CONCURRENT_JOBS=$(Get-Var 'MAX_CONCURRENT_JOBS' '2')
"@

Write-Env 'file-embedder/.env.prod' @"
PORT=8080
RABBITMQ_URL=$RabbitUrl
FILES_GRPC_ADDRESS=$FilesGrpc
SCENES_GRPC_ADDRESS=$ScenesGrpc
CHROMA_HOST=$(Get-Var 'CHROMA_HOST' 'chromadb')
CHROMA_PORT=$(Get-Var 'CHROMA_PORT' '8000')
AWS_REGION=$($Vars['AWS_REGION'])
AWS_ACCESS_KEY_ID=$($Vars['AWS_ACCESS_KEY_ID'])
AWS_SECRET_ACCESS_KEY=$($Vars['AWS_SECRET_ACCESS_KEY'])
AWS_S3_BUCKET=$($Vars['AWS_S3_BUCKET'])
AWS_S3_ENDPOINT=$S3Endpoint
CLIP_MODEL=$(Get-Var 'CLIP_MODEL' 'ViT-B-32')
TEXT_MODEL=$(Get-Var 'TEXT_MODEL' 'BAAI/bge-base-en-v1.5')
DEVICE=$(Get-Var 'DEVICE' 'cpu')
NVIDIA_API_KEY=$(Get-Var 'NVIDIA_API_KEY')
"@

Write-Env 'chat-manager/.env.prod' @"
PORT=8080
DATABASE_URL=$Db`?schema=chat_manager
RABBITMQ_URL=$RabbitUrl
SEARCH_GRPC_ADDRESS=$SearchGrpc
FILES_GRPC_ADDRESS=$FilesGrpc
SCENES_GRPC_ADDRESS=$ScenesGrpc
BILLING_GRPC_ADDRESS=$BillingGrpc
NVIDIA_API_KEY=$(Get-Var 'NVIDIA_API_KEY')
"@

Write-Host ""
Write-Host "Next: docker compose -f docker-compose.prod.yml --env-file $EnvFile up -d --build"
if (-not $Vars['NVIDIA_API_KEY']) { Write-Host "NVIDIA_API_KEY is empty: visual descriptions and chat replies need it." }
if (-not $Vars['GOOGLE_CLIENT_ID']) { Write-Host "GOOGLE_CLIENT_ID is empty: Google sign-in stays disabled." }
