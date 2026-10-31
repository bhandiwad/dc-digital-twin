#!/usr/bin/env zsh
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load .env if present
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

# 1. Ensure Python virtual environment & dependencies exist
if [ ! -d "$ROOT_DIR/.venv" ]; then
  echo "[1/3] Creating Python virtual environment in $ROOT_DIR/.venv..."
  python3 -m venv "$ROOT_DIR/.venv"
  "$ROOT_DIR/.venv/bin/pip" install --upgrade pip
  "$ROOT_DIR/.venv/bin/pip" install -r "$ROOT_DIR/backend/requirements.txt"
fi

# 2. Ensure Frontend production bundle is built
if [ ! -d "$ROOT_DIR/frontend/dist" ]; then
  echo "[2/3] Building React + Three.js 3D Frontend..."
  (cd "$ROOT_DIR/frontend" && npm install && npm run build)
fi

BIND_HOST="${BIND_HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

echo "Starting Pandita's Aether-DCTWIN: High-Density AI Data Center Digital Twin..."
echo "Web UI & API available at: http://$BIND_HOST:$PORT"

PYTHONPATH="$ROOT_DIR/backend" "$ROOT_DIR/.venv/bin/uvicorn" main:app --host "$BIND_HOST" --port "$PORT"
