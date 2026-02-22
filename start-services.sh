#!/bin/bash
# Bash script to start RagSpace services with Docker Compose
# Usage: ./start-services.sh [dev|prod] [--detach] [--build] [--logs] [--service <name>]

MODE="dev"
DETACH=""
BUILD=""
LOGS=false
SERVICE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        dev|prod)
            MODE="$1"
            shift
            ;;
        --detach|-d)
            DETACH="-d"
            shift
            ;;
        --build|-b)
            BUILD="--build"
            shift
            ;;
        --logs|-l)
            LOGS=true
            shift
            ;;
        --service|-s)
            SERVICE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: ./start-services.sh [dev|prod] [--detach] [--build] [--logs] [--service <name>]"
            exit 1
            ;;
    esac
done

echo "🚀 RagSpace Docker Compose Manager"
echo "================================="
echo ""

# Check if Docker is running
if ! docker ps &> /dev/null; then
    echo "✗ Docker is not running. Please start Docker."
    exit 1
fi

echo "✓ Docker is running"

# Show logs
if [ "$LOGS" = true ]; then
    echo "📋 Showing logs for services..."
    if [ -n "$SERVICE" ]; then
        docker-compose logs -f "$SERVICE"
    else
        docker-compose logs -f
    fi
    exit 0
fi

# Display configuration
echo ""
echo "Configuration:"
echo "  Mode: $MODE"
echo "  Detached: ${DETACH:-false}"
echo "  Build: ${BUILD:-false}"
[ -n "$SERVICE" ] && echo "  Service: $SERVICE"
echo ""

# Start services
echo "🔨 Starting services..."

if [ -n "$SERVICE" ]; then
    docker-compose up $DETACH $BUILD "$SERVICE"
else
    docker-compose up $DETACH $BUILD
fi

if [ -n "$DETACH" ]; then
    echo ""
    echo "✓ Services started successfully!"
    echo ""
    echo "Service URLs:"
    echo "  Frontend:         http://localhost:3000"
    echo "  API Gateway:      http://localhost:8000"
    echo "  Auth Service:     http://localhost:8001"
    echo "  Upload Manager:   http://localhost:8002"
    echo "  Scene Detector:   http://localhost:8003"
    echo "  File Embedder:    http://localhost:8004"
    echo "  Chat Manager:     http://localhost:8005"
    echo "  Payment Service:  http://localhost:8006"
    echo ""
    echo "View logs: ./start-services.sh --logs"
    echo "Stop all: docker-compose down"
fi
