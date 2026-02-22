FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

FROM python:3.11-slim

# Install runtime dependencies for Prisma + Node.js
RUN apt-get update && apt-get install -y \
    libatomic1 \
    openssl \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 appuser && \
    useradd -r -u 1001 -g appuser -m -d /home/appuser appuser

WORKDIR /app

COPY --from=builder /root/.local /home/appuser/.local
COPY --chown=appuser:appuser . .
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown appuser:appuser docker-entrypoint.sh && \
    mkdir -p /home/appuser/.cache && \
    chown -R appuser:appuser /home/appuser && \
    chown -R appuser:appuser /home/appuser/.local

USER appuser

ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request, os; urllib.request.urlopen(f'http://localhost/health').read()" || exit 1

CMD ["./docker-entrypoint.sh"]
