#!/bin/bash
set -e

echo "Generating Prisma client..."
prisma generate --schema ./prisma/schema.prisma

echo "Creating database schema if not exists..."
echo 'CREATE SCHEMA IF NOT EXISTS "chat_manager";' | prisma db execute --stdin --schema ./prisma/schema.prisma

echo "Running database migrations..."
prisma migrate deploy --schema ./prisma/schema.prisma

echo "Starting Chat Manager Service..."
exec python main.py
