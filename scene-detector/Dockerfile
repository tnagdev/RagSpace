FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim

# Install runtime dependencies including Node.js for Prisma
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libatomic1 \
    openssl \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 appuser && \
    useradd -r -u 1001 -g appuser -m -d /home/appuser appuser

WORKDIR /app

# Copy Python packages and Prisma generated client from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Give appuser write permissions to site-packages for Prisma client generation
RUN chown -R appuser:appuser /usr/local/lib/python3.11/site-packages

# Create temp directory with proper permissions
RUN mkdir -p /tmp/scene-detector /home/appuser/.cache && \
    chown -R appuser:appuser /tmp/scene-detector && \
    chown -R appuser:appuser /home/appuser/.cache && \
    chmod -R 755 /tmp/scene-detector

COPY --chown=appuser:appuser . .
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown appuser:appuser docker-entrypoint.sh

USER appuser

ENV PYTHONPATH=/app
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request, os; urllib.request.urlopen(f'http://127.0.0.1:8080/health').read()" || exit 1

CMD ["./docker-entrypoint.sh"]
