"""
Core Facility Telemetry, 3D Topology, BMS Controls, 42U Elevation & What-If Router.
"""

from __future__ import annotations
from typing import Any, Dict
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from api.deps import runtime
from models import (
    BladeActionRequest,
    ClusterScaleRequest,
    ClusterScaleResponse,
    ControlSetpointRequest,
    RackElevationResponse,
    ScenarioTriggerRequest,
    TwinStateSnapshot,
    WhatIfRequest,
    WhatIfResponse,
)

router = APIRouter(tags=["telemetry-and-controls"])


@router.get("/api/health")
def health_check() -> Dict[str, str]:
    return {
        "status": "ok",
        "service": "dctwin-engine",
        "site_id": runtime.twin_engine.site_config.site_id,
    }


@router.get("/api/state", response_model=TwinStateSnapshot)
def get_state() -> TwinStateSnapshot:
    return runtime.build_snapshot()


@router.get("/api/topology")
def get_topology() -> Dict[str, Any]:
    edges = [e.model_dump() for e in runtime.twin_engine.get_topology_edges()]
    return {
        "site_id": runtime.twin_engine.site_config.site_id,
        "node_count": runtime.twin_engine.graph.number_of_nodes(),
        "edge_count": runtime.twin_engine.graph.number_of_edges(),
        "edges": edges,
    }


@router.post("/api/scenario", response_model=TwinStateSnapshot)
def trigger_scenario(req: ScenarioTriggerRequest) -> TwinStateSnapshot:
    runtime.twin_engine.trigger_scenario(req.scenario_id)
    for _ in range(3):
        runtime.twin_engine.step(dt_sec=2.0)
    return runtime.build_snapshot()


@router.post("/api/controls", response_model=TwinStateSnapshot)
def update_controls(req: ControlSetpointRequest) -> TwinStateSnapshot:
    eng = runtime.twin_engine
    if req.auto_optimize is not None:
        eng.auto_optimize = req.auto_optimize
        if req.auto_optimize:
            # Closed-loop BACnet Priority 8 active: converge supervisory setpoints immediately
            for _ in range(7):
                eng.step(dt_sec=2.5)
            for cid, crac in eng.cracs.items():
                runtime.telemetry_adapter.write_setpoint(
                    cid, "supply_air_setpoint_c", crac.supply_air_setpoint_c
                )
            for cdu_id, cdu in eng.cdus.items():
                runtime.telemetry_adapter.write_setpoint(
                    cdu_id, "supply_temp_setpoint_c", cdu.supply_temp_setpoint_c
                )
        else:
            # Relinquish BACnet Priority 8 -> NULL so local Priority 16 conservative BMS setpoints resume
            for cid in eng.cracs:
                runtime.telemetry_adapter.relinquish_setpoint(cid, "supply_air_setpoint_c")
            for cdu_id in eng.cdus:
                runtime.telemetry_adapter.relinquish_setpoint(cdu_id, "supply_temp_setpoint_c")
            eng.restore_manual_bms_defaults()
            for _ in range(7):
                eng.step(dt_sec=2.5)

    if req.outdoor_wetbulb_c is not None:
        eng.outdoor_wetbulb_c = req.outdoor_wetbulb_c
        eng.outdoor_drybulb_c = req.outdoor_wetbulb_c + 7.5

    if req.crac_id and req.crac_id in eng.cracs:
        crac = eng.cracs[req.crac_id]
        if req.crac_supply_temp_c is not None:
            runtime.telemetry_adapter.write_setpoint(req.crac_id, "supply_air_setpoint_c", req.crac_supply_temp_c)
        if req.crac_fan_speed_pct is not None:
            crac.fan_speed_pct = req.crac_fan_speed_pct
        if req.crac_enabled is not None:
            crac.enabled = req.crac_enabled

    if req.cdu_id and req.cdu_id in eng.cdus:
        cdu = eng.cdus[req.cdu_id]
        if req.cdu_supply_temp_c is not None:
            runtime.telemetry_adapter.write_setpoint(req.cdu_id, "supply_temp_setpoint_c", req.cdu_supply_temp_c)
        if req.cdu_pump_speed_pct is not None:
            cdu.pump_speed_pct = req.cdu_pump_speed_pct
        if req.cdu_enabled is not None:
            cdu.enabled = req.cdu_enabled

    eng.step(dt_sec=2.0)
    return runtime.build_snapshot()


@router.post("/api/apply-optimization", response_model=TwinStateSnapshot)
def apply_ai_optimization() -> TwinStateSnapshot:
    eng = runtime.twin_engine
    opt = runtime.ai_service.compute_optimization(eng)
    for act in opt.actions:
        if act.target_id in eng.cracs:
            c = eng.cracs[act.target_id]
            if "Setpoint" in act.parameter:
                runtime.telemetry_adapter.write_setpoint(act.target_id, "supply_air_setpoint_c", act.recommended_value)
            elif "Fan" in act.parameter or "Restore" in act.parameter:
                c.enabled = True
                c.fan_speed_pct = act.recommended_value
        elif act.target_id in eng.cdus:
            cdu = eng.cdus[act.target_id]
            if "Setpoint" in act.parameter:
                runtime.telemetry_adapter.write_setpoint(act.target_id, "supply_temp_setpoint_c", act.recommended_value)
            elif "Pump" in act.parameter:
                cdu.enabled = True
                cdu.pump_speed_pct = act.recommended_value
                eng.cdu_fouling_factor[act.target_id] = max(0.88, eng.cdu_fouling_factor.get(act.target_id, 1.0))

    eng.auto_optimize = True
    for _ in range(4):
        eng.step(dt_sec=2.5)
    return runtime.build_snapshot()


@router.post("/api/what-if", response_model=WhatIfResponse)
def evaluate_what_if(req: WhatIfRequest) -> WhatIfResponse:
    return runtime.ai_service.run_whatif_simulation(runtime.twin_engine, req)


@router.post("/api/plan/cluster-scale", response_model=ClusterScaleResponse)
def evaluate_cluster_scale_plan(req: ClusterScaleRequest) -> ClusterScaleResponse:
    return runtime.ai_service.evaluate_cluster_scale(runtime.twin_engine, req)


@router.get("/api/rack/{rack_id}/elevation", response_model=RackElevationResponse)
def get_rack_elevation_view(rack_id: str) -> RackElevationResponse:
    return runtime.twin_engine.get_rack_elevation(rack_id)


@router.post("/api/rack/blade-action", response_model=RackElevationResponse)
def execute_blade_action(req: BladeActionRequest) -> RackElevationResponse:
    return runtime.twin_engine.apply_blade_action(req.rack_id, req.node_id, req.action)


@router.websocket("/ws/telemetry")
async def websocket_telemetry(ws: WebSocket) -> None:
    await ws.accept()
    runtime.connected_clients.append(ws)
    try:
        await ws.send_json(runtime.build_snapshot().model_dump())
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in runtime.connected_clients:
            runtime.connected_clients.remove(ws)
    except Exception:
        if ws in runtime.connected_clients:
            runtime.connected_clients.remove(ws)
