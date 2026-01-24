#!/bin/bash
set -e

echo "Starting File Embedder Service..."
echo "Note: This service uses ChromaDB which does not require migrations"

# Download models at runtime if not already cached
echo "Checking for required ML models..."

echo "  → Downloading Whisper model (base)..."
python -c "import whisper; whisper.load_model('base')" 2>&1 | grep -v "FutureWarning" || true

echo "  → Downloading BGE sentence transformer..."
python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')" 2>&1 | grep -v "FutureWarning" || true

echo "  → Downloading Contriever model..."
python -c "from transformers import AutoModel, AutoTokenizer; AutoTokenizer.from_pretrained('facebook/contriever'); AutoModel.from_pretrained('facebook/contriever')" 2>&1 | grep -v "FutureWarning" || true

echo "  → Downloading CLIP model..."
python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')" 2>&1 | grep -v "FutureWarning" || true

echo "All models loaded successfully!"
echo "Starting FastAPI application..."

exec python main.py
