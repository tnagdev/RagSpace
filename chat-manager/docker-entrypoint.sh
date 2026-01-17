#!/bin/bash
set -e

echo "Generating Prisma client..."
prisma generate --schema ./prisma/schema.prisma

echo "Running database migrations..."
prisma db push --schema ./prisma/schema.prisma --skip-generate

echo "Starting Chat Manager Service..."
exec python main.py
