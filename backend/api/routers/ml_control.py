"""
OpenDT RLS Calibration, SLSQP Constrained MPC & GraphRAG MOP Router.
"""

from __future__ import annotations
from fastapi import APIRouter

from api.deps import runtime
from models import (
    MOPDocumentResponse,
    MOPGenerationRequest,
    MPCPolicyState,
    OpenDTCalibrationReport,
)

router = APIRouter(tags=["ml-control-and-mop"])


@router.get("/api/opendt/calibration", response_model=OpenDTCalibrationReport)
def get_opendt_calibration_report() -> OpenDTCalibrationReport:
    return runtime.ai_service.compute_opendt_calibration(runtime.twin_engine)


@router.get("/api/mpc/policy", response_model=MPCPolicyState)
def get_mpc_policy_state() -> MPCPolicyState:
    return runtime.ai_service.compute_mpc_policy(runtime.twin_engine)


@router.post("/api/graphrag/mop", response_model=MOPDocumentResponse)
def generate_facility_mop(req: MOPGenerationRequest) -> MOPDocumentResponse:
    return runtime.ai_service.generate_graphrag_mop(runtime.twin_engine, req)
