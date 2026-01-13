#!/bin/sh
set -e

echo 'DATABASE_URL='"${DATABASE_URL}"''

echo "Running database migrations..."
npx prisma migrate deploy --schema ./src/prisma/schema.prisma

echo "Starting API Gateway..."
exec node dist/src/main
