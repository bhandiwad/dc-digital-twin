"""
FastAPI Backend for the High-Density AI Data Center Digital Twin.
Exposes:
- GET /api/state : Complete snapshot of the 32-rack data hall, CRACs, CDUs, PDUs, UPS, AI forecasts, anomalies, and optimization
- GET /api/topology : NetworkX graph nodes and edges across Power, Air Cooling, and Liquid Cooling layers
- POST /api/scenario : Trigger realistic operational scenarios (GPU training burst, CRAC failure, CDU fouling, heatwave, recirculation)
- POST /api/controls : Adjust CRAC/CDU setpoints, fan/pump speeds, or toggle AI Auto-Pilot closed-loop optimization
- POST /api/what-if : Run counterfactual "What-If" simulations on a cloned sandbox twin
- POST /api/copilot : Natural-language root-cause & scenario Q&A assistant
- WS /ws/telemetry : Real-time 1.5s streaming telemetry + AI inference broadcast
"""

from __future__ import annotations
import asyncio
import os
from contextlib import asynccontextmanager
from typing import List, Dict, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, PlainTextResponse

from models import (
    TwinStateSnapshot,
    WhatIfRequest,
    WhatIfResponse,
    ControlSetpointRequest,
    ScenarioTriggerRequest,
    AgentQueryRequest,
    DatasetInfo,
    ReplayTimelinePoint,
    ReplaySeekRequest,
    RackElevationResponse,
    BladeActionRequest,
    AgentCopilotResponse,
    ExecutiveROIReport,
    ConnectorSpec,
    ConnectorTestRequest,
    ConnectorTestResponse,
    BYODIngestRequest,
    BYODIngestResponse,
    OpenDTCalibrationReport,
    MPCPolicyState,
    MOPGenerationRequest,
    MOPDocumentResponse,
    LLMProviderConfigRequest,
)
from simulator import DataHallTwinEngine
from ai_engine import DataCenterAIService
from telemetry_store import DuckDBTelemetryStore
from connectors import EnterpriseConnectorManager


DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
twin_engine = DataHallTwinEngine()
ai_service = DataCenterAIService()
telemetry_store = DuckDBTelemetryStore(data_dir=DATA_DIR)
connector_manager = EnterpriseConnectorManager()
connected_clients: List[WebSocket] = []


def build_snapshot() -> TwinStateSnapshot:
    forecasts, anomalies = ai_service.update_forecasts_and_anomalies(twin_engine)
    optimization = ai_service.compute_optimization(twin_engine)
    latest_facility = twin_engine.history[-1]

    return TwinStateSnapshot(
        facility=latest_facility,
        racks=list(twin_engine.racks.values()),
        cracs=list(twin_engine.cracs.values()),
        cdus=list(twin_engine.cdus.values()),
        pdus=list(twin_engine.pdus.values()),
        ups_units=list(twin_engine.ups_units.values()),
        anomalies=anomalies,
        forecasts=forecasts,
        optimization=optimization,
        history=twin_engine.history[-50:],
        active_scenarios=twin_engine.active_scenarios,
    )


async def simulation_loop() -> None:
    while True:
        await asyncio.sleep(1.5)
        twin_engine.step(dt_sec=2.0)
        if connected_clients:
            snapshot = build_snapshot()
            payload = snapshot.model_dump()
            stale: List[WebSocket] = []
            for ws in connected_clients:
                try:
                    await ws.send_json(payload)
                except Exception:
                    stale.append(ws)
            for ws in stale:
                if ws in connected_clients:
                    connected_clients.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(simulation_loop())
    yield
    task.cancel()


app = FastAPI(
    title="Pandita's Aether-DCTWIN API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "dctwin-engine"}


@app.get("/api/state", response_model=TwinStateSnapshot)
def get_state() -> TwinStateSnapshot:
    return build_snapshot()


@app.get("/api/topology")
def get_topology() -> Dict[str, Any]:
    edges = [e.model_dump() for e in twin_engine.get_topology_edges()]
    return {
        "node_count": twin_engine.graph.number_of_nodes(),
        "edge_count": twin_engine.graph.number_of_edges(),
        "edges": edges,
    }


@app.post("/api/scenario", response_model=TwinStateSnapshot)
def trigger_scenario(req: ScenarioTriggerRequest) -> TwinStateSnapshot:
    twin_engine.trigger_scenario(req.scenario_id)
    # Run 3 rapid steps so the initial impact is immediately visible in the UI
    for _ in range(3):
        twin_engine.step(dt_sec=2.0)
    return build_snapshot()


@app.post("/api/controls", response_model=TwinStateSnapshot)
def update_controls(req: ControlSetpointRequest) -> TwinStateSnapshot:
    if req.auto_optimize is not None:
        twin_engine.auto_optimize = req.auto_optimize

    if req.outdoor_wetbulb_c is not None:
        twin_engine.outdoor_wetbulb_c = req.outdoor_wetbulb_c
        twin_engine.outdoor_drybulb_c = req.outdoor_wetbulb_c + 7.5

    if req.crac_id and req.crac_id in twin_engine.cracs:
        crac = twin_engine.cracs[req.crac_id]
        if req.crac_supply_temp_c is not None:
            crac.supply_air_setpoint_c = req.crac_supply_temp_c
        if req.crac_fan_speed_pct is not None:
            crac.fan_speed_pct = req.crac_fan_speed_pct
        if req.crac_enabled is not None:
            crac.enabled = req.crac_enabled

    if req.cdu_id and req.cdu_id in twin_engine.cdus:
        cdu = twin_engine.cdus[req.cdu_id]
        if req.cdu_supply_temp_c is not None:
            cdu.supply_temp_setpoint_c = req.cdu_supply_temp_c
        if req.cdu_pump_speed_pct is not None:
            cdu.pump_speed_pct = req.cdu_pump_speed_pct
        if req.cdu_enabled is not None:
            cdu.enabled = req.cdu_enabled

    twin_engine.step(dt_sec=2.0)
    return build_snapshot()


@app.post("/api/apply-optimization", response_model=TwinStateSnapshot)
def apply_ai_optimization() -> TwinStateSnapshot:
    """Immediately apply the AI Optimizer's recommended CRAC/CDU setpoints and enable Auto-Pilot."""
    opt = ai_service.compute_optimization(twin_engine)
    for act in opt.actions:
        if act.target_id in twin_engine.cracs:
            c = twin_engine.cracs[act.target_id]
            if "Setpoint" in act.parameter:
                c.supply_air_setpoint_c = act.recommended_value
            elif "Fan" in act.parameter or "Restore" in act.parameter:
                c.enabled = True
                c.fan_speed_pct = act.recommended_value
        elif act.target_id in twin_engine.cdus:
            cdu = twin_engine.cdus[act.target_id]
            if "Setpoint" in act.parameter:
                cdu.supply_temp_setpoint_c = act.recommended_value
            elif "Pump" in act.parameter:
                cdu.enabled = True
                cdu.pump_speed_pct = act.recommended_value
                twin_engine.cdu_fouling_factor[act.target_id] = max(0.88, twin_engine.cdu_fouling_factor.get(act.target_id, 1.0))

    twin_engine.auto_optimize = True
    for _ in range(4):
        twin_engine.step(dt_sec=2.5)
    return build_snapshot()


@app.post("/api/what-if", response_model=WhatIfResponse)
def evaluate_what_if(req: WhatIfRequest) -> WhatIfResponse:
    return ai_service.run_whatif_simulation(twin_engine, req)


@app.post("/api/copilot", response_model=AgentCopilotResponse)
def ask_copilot(req: AgentQueryRequest) -> AgentCopilotResponse:
    return ai_service.answer_copilot_query(
        twin_engine,
        req.question,
        auto_execute_tools=req.auto_execute_tools,
        telemetry_store=telemetry_store,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        api_key=req.api_key,
    )


@app.get("/api/llm/config")
def get_llm_config() -> Dict[str, Any]:
    return ai_service.llm_config.get_status()


@app.post("/api/llm/config")
def update_llm_config(req: LLMProviderConfigRequest) -> Dict[str, Any]:
    return ai_service.llm_config.update_config(
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
    )


# --- Upgrade 1 Endpoints: 24-Hour DuckDB / Parquet Time-Series Replay & Public Datasets ---

@app.get("/api/datasets", response_model=List[DatasetInfo])
def list_public_datasets() -> List[DatasetInfo]:
    return telemetry_store.list_datasets()


@app.get("/api/replay/{dataset_id}", response_model=List[ReplayTimelinePoint])
def get_dataset_replay_timeline(dataset_id: str) -> List[ReplayTimelinePoint]:
    return telemetry_store.get_timeline(dataset_id)


@app.post("/api/replay/seek", response_model=TwinStateSnapshot)
def seek_replay_timestamp(req: ReplaySeekRequest) -> TwinStateSnapshot:
    telemetry_store.apply_historical_step_to_twin(twin_engine, req.dataset_id, req.step_index)
    return build_snapshot()


# --- Upgrade 2 Endpoints: 42U Rack Elevation Drill-Down & Blade Fault Injection ---

@app.get("/api/rack/{rack_id}/elevation", response_model=RackElevationResponse)
def get_rack_elevation_view(rack_id: str) -> RackElevationResponse:
    return twin_engine.get_rack_elevation(rack_id)


@app.post("/api/rack/blade-action", response_model=RackElevationResponse)
def execute_blade_action(req: BladeActionRequest) -> RackElevationResponse:
    return twin_engine.apply_blade_action(req.rack_id, req.node_id, req.action)


# --- Upgrade 3 Endpoint: Executive ROI & Sustainability Report Generator ---

@app.get("/api/roi-report", response_model=ExecutiveROIReport)
def get_executive_roi_report() -> ExecutiveROIReport:
    return ai_service.generate_executive_roi_report(twin_engine, telemetry_store=telemetry_store)


# --- Upgrade 4 Endpoints: Enterprise BMS / DCIM / GPU Connectors & BYOD CSV Ingestion ---

@app.get("/api/connectors", response_model=List[ConnectorSpec])
def list_enterprise_connectors() -> List[ConnectorSpec]:
    return connector_manager.list_connectors()


@app.post("/api/connectors/test", response_model=ConnectorTestResponse)
def test_enterprise_connector(req: ConnectorTestRequest) -> ConnectorTestResponse:
    return connector_manager.test_and_sync_connector(twin_engine, req)


@app.get("/api/connectors/sample-csv/{vendor_profile}")
def download_sample_vendor_csv(vendor_profile: str) -> PlainTextResponse:
    filename, content = connector_manager.generate_sample_vendor_csv(vendor_profile)
    return PlainTextResponse(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/connectors/ingest-byod", response_model=BYODIngestResponse)
def ingest_byod_telemetry(req: BYODIngestRequest) -> BYODIngestResponse:
    return connector_manager.ingest_byod_csv(req, telemetry_store, twin_engine)


# --- Upgrade 5 Endpoints: OpenDT Self-Calibration, Constrained MPC & GraphRAG SOP/MOP ---

@app.get("/api/opendt/calibration", response_model=OpenDTCalibrationReport)
def get_opendt_calibration_report() -> OpenDTCalibrationReport:
    return ai_service.compute_opendt_calibration(twin_engine)


@app.get("/api/mpc/policy", response_model=MPCPolicyState)
def get_mpc_policy_state() -> MPCPolicyState:
    return ai_service.compute_mpc_policy(twin_engine)


@app.post("/api/graphrag/mop", response_model=MOPDocumentResponse)
def generate_facility_mop(req: MOPGenerationRequest) -> MOPDocumentResponse:
    return ai_service.generate_graphrag_mop(twin_engine, req)


@app.websocket("/ws/telemetry")
async def websocket_telemetry(ws: WebSocket) -> None:
    await ws.accept()
    connected_clients.append(ws)
    try:
        # Send immediate snapshot upon connection
        await ws.send_json(build_snapshot().model_dump())
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in connected_clients:
            connected_clients.remove(ws)
    except Exception:
        if ws in connected_clients:
            connected_clients.remove(ws)


# Serve production React + Three.js build when available
FRONTEND_DIST = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/")
    def serve_spa_index() -> FileResponse:
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))

