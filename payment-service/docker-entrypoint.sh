#!/bin/sh

echo "🚀 Starting Payment Service..."

# Wait for database
echo "⏳ Waiting for database..."
until npx prisma db push --accept-data-loss; do
  echo "Database not ready, retrying in 5 seconds..."
  sleep 5
done

echo "✅ Database ready"

# Run migrations
echo "🔄 Running migrations..."
npx prisma migrate deploy

# Generate Prisma client
echo "📦 Generating Prisma client..."
npx prisma generate

# Seed database (only if not already seeded)
echo "🌱 Seeding database..."
npm run prisma:seed || echo "⚠️  Seed skipped (likely already seeded)"

# Start application
echo "✅ Starting application..."
exec "$@"
