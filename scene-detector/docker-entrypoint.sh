#!/bin/bash
set -e

# Determine which service to start (default to combined mode for backward compatibility)
SERVICE_MODE="${1:-main.py}"

echo "Generating Prisma client..."
python -m prisma generate --schema ./prisma/schema.prisma

echo "Running database migrations..."
python -m prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting Scene Detector Service: $SERVICE_MODE"
exec python "$SERVICE_MODE"
