"""
FastAPI Application Entrypoint (`backend/main.py`) for Pandita's Aether-DCTWIN.

Mounts modular domain routers from `backend/api/routers/` and auto-discovers any feature
routers placed in `backend/api/features/` so team members never collide on `main.py`.
"""

from __future__ import annotations
import asyncio
from contextlib import asynccontextmanager
import os
from typing import List
from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.deps import runtime
from api.plugin_loader import register_feature_plugins
from api.routers import (
    copilot_llm,
    energy_roi,
    ml_control,
    replay_connectors,
    telemetry_controls,
)

# Re-export core singletons for backward-compatible test/script imports
twin_engine = runtime.twin_engine
ai_service = runtime.ai_service
telemetry_store = runtime.telemetry_store
connector_manager = runtime.connector_manager
build_snapshot = runtime.build_snapshot
get_state = telemetry_controls.get_state


async def simulation_loop() -> None:
    while True:
        await asyncio.sleep(1.5)
        runtime.twin_engine.step(dt_sec=2.0)
        if runtime.connected_clients:
            payload = runtime.build_snapshot().model_dump()
            stale: List[WebSocket] = []
            for ws in runtime.connected_clients:
                try:
                    await ws.send_json(payload)
                except Exception:
                    stale.append(ws)
            for ws in stale:
                if ws in runtime.connected_clients:
                    runtime.connected_clients.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(simulation_loop())
    yield
    task.cancel()


app = FastAPI(
    title="Pandita's Aether-DCTWIN API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register core domain routers + dynamic feature plugins (`backend/api/features/*.py`)
app.include_router(telemetry_controls.router)
app.include_router(ml_control.router)
app.include_router(energy_roi.router)
app.include_router(replay_connectors.router)
app.include_router(copilot_llm.router)
register_feature_plugins(app)

FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/")
    def serve_spa_index() -> FileResponse:
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
