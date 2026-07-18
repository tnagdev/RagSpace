#!/bin/bash
set -e

# Determine which service to start (default to combined mode for backward compatibility)
SERVICE_MODE="${1:-main.py}"

echo "Generating Prisma client..."
prisma generate --schema ./prisma/schema.prisma

echo "Creating database schema if not exists..."
echo 'CREATE SCHEMA IF NOT EXISTS "scene_detector";' | prisma db execute --stdin --schema ./prisma/schema.prisma

echo "Running database migrations..."
prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting Scene Detector Service: $SERVICE_MODE"
exec python "$SERVICE_MODE"
