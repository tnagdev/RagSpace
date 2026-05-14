#!/bin/sh
set -e

echo "Starting API Gateway..."
exec node dist/main
