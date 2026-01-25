FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 appuser && \
    useradd -r -u 1001 -g appuser -m -d /home/appuser appuser

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

RUN mkdir -p /app/chroma_data /home/appuser/.cache /home/appuser/.cache/huggingface /home/appuser/.cache/torch /tmp/file-embedder && \
    chown -R appuser:appuser /app/chroma_data && \
    chown -R appuser:appuser /home/appuser/.cache && \
    chown -R appuser:appuser /tmp/file-embedder && \
    chmod -R 755 /tmp/file-embedder

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

HEALTHCHECK --interval=30s --timeout=3s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request, os; urllib.request.urlopen(f'http://127.0.0.1:8080/health').read()" || exit 1

CMD ["./docker-entrypoint.sh"]
