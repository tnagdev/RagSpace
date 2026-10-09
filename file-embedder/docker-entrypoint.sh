#!/bin/bash
set -e

SERVICE_MODE="${1:-main_server.py}"

# Models live on a mounted volume; download them only on first run.
HF_HUB_DIR="${HF_HOME:-/home/appuser/.cache/huggingface}/hub"
if [ ! -d "$HF_HUB_DIR" ] || [ -z "$(ls -A "$HF_HUB_DIR" 2>/dev/null)" ]; then
    echo "Model cache is empty; downloading models"
    python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')"
    python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')"
fi

exec python "$SERVICE_MODE"
