FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install shared-py non-editably (editable installs break multi-stage Docker builds)
COPY contracts/ ./contracts/
COPY packages/shared-py ./packages/shared-py
RUN pip install --no-cache-dir --user datamodel-code-generator && \
    python -m datamodel_code_generator --version && \
    python packages/shared-py/scripts/generate.py
COPY chat-manager/requirements.txt ./requirements.txt

RUN pip install --no-cache-dir --user ./packages/shared-py && \
    sed '/shared-py/d' requirements.txt > /tmp/reqs-filtered.txt && \
    pip install --no-cache-dir --user -r /tmp/reqs-filtered.txt

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
COPY --chown=appuser:appuser chat-manager/ .
RUN chmod +x docker-entrypoint.sh && \
    mkdir -p /home/appuser/.cache && \
    chown -R appuser:appuser /home/appuser && \
    chown -R appuser:appuser /home/appuser/.local

USER appuser

ENV PATH=/home/appuser/.local/bin:$PATH
ENV PYTHONPATH=/app
ENV PORT=8080
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health').read()" || exit 1
CMD ["./docker-entrypoint.sh"]
