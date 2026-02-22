# PowerShell script to start RagSpace services with Docker Compose
# Usage: .\start-services.ps1 [-mode dev|prod] [-detach]

param(
    [string]$mode = "dev",
    [switch]$detach = $false,
    [switch]$build = $false,
    [switch]$logs = $false,
    [string]$service = ""
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 RagSpace Docker Compose Manager" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker ps | Out-Null
    Write-Host "✓ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "✗ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Parse command
if ($logs) {
    Write-Host "📋 Showing logs for services..." -ForegroundColor Yellow
    if ($service -ne "") {
        docker-compose logs -f $service
    } else {
        docker-compose logs -f
    }
    exit 0
}

# Build services
$buildFlag = if ($build) { "--build" } else { "" }
$detachFlag = if ($detach) { "-d" } else { "" }

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Mode: $mode" -ForegroundColor White
Write-Host "  Detached: $detach" -ForegroundColor White
Write-Host "  Build: $build" -ForegroundColor White
if ($service -ne "") {
    Write-Host "  Service: $service" -ForegroundColor White
}
Write-Host ""

# Start services
try {
    Write-Host "🔨 Starting services..." -ForegroundColor Cyan
    
    if ($service -ne "") {
        docker-compose up $detachFlag $buildFlag $service
    } else {
        docker-compose up $detachFlag $buildFlag
    }
    
    if ($detach) {
        Write-Host ""
        Write-Host "✓ Services started successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Service URLs:" -ForegroundColor Yellow
        Write-Host "  Frontend:         http://localhost:3000" -ForegroundColor White
        Write-Host "  API Gateway:      http://localhost:8000" -ForegroundColor White
        Write-Host "  Auth Service:     http://localhost:8001" -ForegroundColor White
        Write-Host "  Upload Manager:   http://localhost:8002" -ForegroundColor White
        Write-Host "  Scene Detector:   http://localhost:8003" -ForegroundColor White
        Write-Host "  File Embedder:    http://localhost:8004" -ForegroundColor White
        Write-Host "  Chat Manager:     http://localhost:8005" -ForegroundColor White
        Write-Host "  Payment Service:  http://localhost:8006" -ForegroundColor White
        Write-Host ""
        Write-Host "View logs: .\start-services.ps1 -logs" -ForegroundColor Cyan
        Write-Host "Stop all: docker-compose down" -ForegroundColor Cyan
    }
} catch {
    Write-Host ""
    Write-Host "✗ Failed to start services" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
