#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema ./src/prisma/schema.prisma

echo "Starting Auth Service..."
exec node dist/src/main
