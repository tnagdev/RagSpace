#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy --schema ./src/modules/prisma/schema.prisma

echo "Starting Upload Manager..."
exec node dist/main
