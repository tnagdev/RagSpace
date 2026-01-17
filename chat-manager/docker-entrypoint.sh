#!/bin/bash
set -e

echo "Running database migrations..."
prisma db push --schema ./prisma/schema.prisma --skip-generate

echo "Starting Chat Manager Service..."
exec python main.py
