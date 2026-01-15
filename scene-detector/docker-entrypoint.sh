#!/bin/bash
set -e

echo "Running database migrations..."
python -m prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting Scene Detector Service..."
exec python main.py
