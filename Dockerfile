# The Wayfarer — deterministic text adventure with an optional language layer.
#
# The game itself needs no network. The language assistant is optional: supply
# ANTHROPIC_API_KEY (a Kubernetes Secret, not a baked-in value) to enable it, or
# set ADVENTURE_LLM=off to run the container fully offline.

FROM python:3.12-slim AS build

WORKDIR /build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1

COPY pyproject.toml README.md ./
COPY src/ ./src/
RUN pip install --prefix=/install ".[web]"


FROM python:3.12-slim

# Run as a non-root user: nothing here needs privileges.
RUN useradd --create-home --uid 10001 wayfarer
WORKDIR /app

COPY --from=build /install /usr/local
COPY worlds/ /app/worlds/

# Play data lands here. A pod's own filesystem does not outlive the pod, so mount
# a volume over this path (or point ADVENTURE_JOURNAL at another backend).
RUN mkdir -p /app/logs && chown wayfarer:wayfarer /app/logs
VOLUME /app/logs

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ADVENTURE_WORLD=/app/worlds/wayfarer.json \
    ADVENTURE_LLM=auto \
    ADVENTURE_JOURNAL=file:/app/logs/playthroughs.jsonl \
    PORT=8000

USER wayfarer
EXPOSE 8000

# Kubernetes should use its own probes against /healthz; this covers plain docker run.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",8000)}/healthz', timeout=2).status == 200 else 1)"

CMD ["sh", "-c", "exec uvicorn adventure.web:build_default_app --factory --host 0.0.0.0 --port ${PORT:-8000}"]
