FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN python -c "import whisper; whisper.load_model('base')" && \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')" && \
    python -c "from transformers import AutoModel, AutoTokenizer; AutoTokenizer.from_pretrained('facebook/contriever'); AutoModel.from_pretrained('facebook/contriever')" && \
    python -c "import open_clip; open_clip.create_model_and_transforms('ViT-B-32', pretrained='openai')"

FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 appuser && \
    useradd -r -u 1001 -g appuser -m -d /home/appuser appuser

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy pre-downloaded models from builder stage
COPY --from=builder /root/.cache/huggingface /home/appuser/.cache/huggingface

RUN mkdir -p /app/chroma_data /home/appuser/.cache && \
    chown -R appuser:appuser /app/chroma_data && \
    chown -R appuser:appuser /home/appuser/.cache

COPY --chown=appuser:appuser . .
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown appuser:appuser docker-entrypoint.sh

USER appuser

ENV PYTHONPATH=/app
ENV PORT=8080
ENV TESSERACT_CMD=/usr/bin/tesseract
ENV HF_HOME=/home/appuser/.cache/huggingface
ENV TORCH_HOME=/home/appuser/.cache/torch

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request, os; urllib.request.urlopen(f'http://localhost:{os.getenv(\"PORT\", \"8080\")}/health').read()" || exit 1

CMD ["./docker-entrypoint.sh"]
