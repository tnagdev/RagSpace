#!/bin/bash
set -e

echo "Starting File Embedder Service..."
echo "Note: This service uses ChromaDB which does not require migrations"
exec python main.py
