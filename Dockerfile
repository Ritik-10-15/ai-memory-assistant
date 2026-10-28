FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    CAMERA_MODE=browser \
    DATA_DIR=/data \
    PORT=8000

RUN apt-get update \
 && apt-get install -y --no-install-recommends libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements-cloud.txt .
RUN pip install -r requirements-cloud.txt

# Bake the ONNX models into the image so startup never depends on GitHub.
COPY scripts/download_models.py scripts/
RUN mkdir -p models && python scripts/download_models.py

COPY . .

# DB, enrolled faces, uploads and the embedding cache live here.
# Mount a persistent volume at /data or they are lost on every redeploy.
RUN mkdir -p /data
VOLUME /data

EXPOSE 8000

# One worker on purpose — recognition state is per-process (see wsgi.py).
CMD ["sh", "-c", "exec gunicorn --workers 1 --threads 8 --timeout 120 --bind 0.0.0.0:$PORT wsgi:app"]
