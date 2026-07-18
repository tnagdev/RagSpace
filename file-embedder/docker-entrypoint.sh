#!/bin/bash
set -e

# Determine which service to start (default to combined mode for backward compatibility)
SERVICE_MODE="${1:-main.py}"

echo "Starting File Embedder Service (Mode: $SERVICE_MODE)..."
echo "Note: This service uses ChromaDB which does not require migrations"

# Download models only if the cache volume is empty (first-run initialisation).
# On subsequent restarts the models are already in the mounted volume, so this
# is a no-op and startup is fast.
HF_HUB_DIR="${HF_HOME:-/home/appuser/.cache/huggingface}/hub"
if [ ! -d "$HF_HUB_DIR" ] || [ -z "$(ls -A "$HF_HUB_DIR" 2>/dev/null)" ]; then
    echo "Model cache is empty — downloading models (first run, this may take several minutes)..."

    echo "  → Downloading Whisper model (base)..."
    python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')" 2>&1 | grep -v "FutureWarning" || true

    echo "  → Downloading BGE sentence transformer..."
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')" 2>&1 | grep -v "FutureWarning" || true

    echo "  → Downloading Contriever model..."
    python -c "from transformers import AutoModel, AutoTokenizer; \
        AutoTokenizer.from_pretrained('facebook/contriever'); \
        AutoModel.from_pretrained('facebook/contriever')" 2>&1 | grep -v "FutureWarning" || true

    echo "  → Downloading CLIP model..."
    python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')" 2>&1 | grep -v "FutureWarning" || true

    echo "All models downloaded successfully!"
else
    echo "Model cache found — skipping download."
fi

echo "Starting application: $SERVICE_MODE"
exec python "$SERVICE_MODE"
