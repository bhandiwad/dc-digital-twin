"""
PUE Decomposition, Grid TOU / UPS BESS Dispatch & Executive ROI Router.
"""

from __future__ import annotations
from fastapi import APIRouter

from api.deps import runtime
from models import (
    EnergyDispatchRequest,
    EnergyGridManagementState,
    ExecutiveROIReport,
)

router = APIRouter(tags=["energy-and-roi"])


@router.get("/api/energy/grid", response_model=EnergyGridManagementState)
def get_energy_grid_state() -> EnergyGridManagementState:
    return runtime.ai_service.compute_energy_grid_management(runtime.twin_engine)


@router.post("/api/energy/dispatch", response_model=EnergyGridManagementState)
def update_energy_dispatch_controls(req: EnergyDispatchRequest) -> EnergyGridManagementState:
    return runtime.ai_service.update_energy_dispatch(runtime.twin_engine, req)


@router.get("/api/roi-report", response_model=ExecutiveROIReport)
def get_executive_roi_report() -> ExecutiveROIReport:
    return runtime.ai_service.generate_executive_roi_report(
        runtime.twin_engine, telemetry_store=runtime.telemetry_store
    )
