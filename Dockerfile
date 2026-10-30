# ── Stage 1: build the React frontend ────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build

# ── Stage 2: Flask app + recognition engine ──────────────────────────
FROM python:3.12-slim

# Set by CI / deploy scripts to the git commit; reported by /readyz.
ARG APP_VERSION=dev

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CAMERA_MODE=browser \
    DATA_DIR=/data \
    PORT=8000 \
    APP_VERSION=$APP_VERSION

RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

# The app runs as this unprivileged user (see docker-entrypoint.sh).
RUN useradd --system --uid 10001 --create-home --home-dir /home/app --shell /usr/sbin/nologin app

WORKDIR /app

COPY requirements-cloud.txt .
RUN pip install -r requirements-cloud.txt

# Bake the ONNX models into the image so startup never depends on GitHub.
# YuNet (MIT) and SFace (Apache-2.0) come from the OpenCV model zoo; both
# licences allow redistribution in the image.
COPY scripts/download_models.py scripts/
RUN mkdir -p models && python scripts/download_models.py

COPY . .
COPY --from=frontend /frontend/dist ./frontend/dist
# Application files stay owned by root (read-only for the app user).
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod 0755 docker-entrypoint.sh

# DB, enrolled faces, family photos, uploads and the embedding cache live
# here. Mount a persistent volume at /data or they are lost on every redeploy.
RUN mkdir -p /data && chown app:app /data
VOLUME /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://localhost:%s/healthz' % os.environ.get('PORT', '8000'))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
# One worker on purpose — recognition state is per-process (see wsgi.py).
# No access log: the patient device posts several frames a second.
CMD ["sh", "-c", "exec gunicorn --workers 1 --threads 8 --timeout 120 --graceful-timeout 30 --worker-tmp-dir /dev/shm --bind 0.0.0.0:$PORT wsgi:app"]
