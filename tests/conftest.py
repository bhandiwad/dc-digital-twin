"""
Pytest Configuration & Shared Fixtures for Pandita's Aether-DCTWIN.

Provides:
- Isolated temporary DuckDB historian directory (`DCTWIN_DATA_DIR`) so tests never lock out
  a developer's running local `uvicorn` instance.
- `default_engine`: 32-rack Hall-01 blueprint (`configs/sites/default_hall.yaml`).
- `compact_engine`: 16-rack Edge blueprint (`configs/sites/compact_edge_16rack.yaml`).
- `api_client`: FastAPI `TestClient` against the full modular router + plugin stack.
"""

from __future__ import annotations
import os
import shutil
import sys
import tempfile
import pytest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
CONFIGS_DIR = os.path.join(REPO_ROOT, "configs", "sites")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Isolate DuckDB data directory for the entire test session before importing `main`
_SESSION_TMP_DATA_DIR = tempfile.mkdtemp(prefix="dctwin_pytest_data_")
os.environ["DCTWIN_DATA_DIR"] = _SESSION_TMP_DATA_DIR


@pytest.fixture(scope="session", autouse=True)
def _cleanup_session_data_dir():
    yield
    try:
        from api.deps import runtime

        runtime.telemetry_store.conn.close()
    except Exception:
        pass
    shutil.rmtree(_SESSION_TMP_DATA_DIR, ignore_errors=True)


@pytest.fixture()
def default_engine():
    from config_loader import load_site_blueprint
    from simulator import DataHallTwinEngine

    cfg = load_site_blueprint(os.path.join(CONFIGS_DIR, "default_hall.yaml"))
    return DataHallTwinEngine(site_config=cfg)


@pytest.fixture()
def compact_engine():
    from config_loader import load_site_blueprint
    from simulator import DataHallTwinEngine

    cfg = load_site_blueprint(os.path.join(CONFIGS_DIR, "compact_edge_16rack.yaml"))
    return DataHallTwinEngine(site_config=cfg)


@pytest.fixture(scope="module")
def api_client():
    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as client:
        yield client
