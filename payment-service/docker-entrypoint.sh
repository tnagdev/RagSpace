#!/bin/sh
set -e

echo "🚀 Starting Payment Service..."

# Run migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy --schema ./src/prisma/schema.prisma

# Start application
echo "Starting application..."
exec node dist/src/main

