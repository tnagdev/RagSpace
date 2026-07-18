#!/bin/sh
set -e

echo "🚀 Starting Payment Service..."

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy --schema ./src/prisma/schema.prisma

# Seed default plan data (upsert — safe to run on every start)
echo "🌱 Seeding plan data..."
node dist/src/prisma/seed.js || echo "⚠️  Seed skipped (non-fatal)"

# Start application
echo "Starting application..."
exec node dist/src/main

