#!/bin/bash
set -e

echo "Generating Prisma client..."
prisma generate --schema ./prisma/schema.prisma

echo "Running database migrations..."
prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting Chat Manager Service..."
exec python main.py
