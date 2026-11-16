"""
FastAPI Router for the 5 Multi-Step Agentic Workflows (`backend/api/routers/agentic_workflows.py`).
"""

from __future__ import annotations
from fastapi import APIRouter, HTTPException

from api.deps import runtime
from services.agentic_workflows import (
    AgentWorkflowResult,
    AgentWorkflowRunRequest,
    AgenticWorkflowsService,
)

router = APIRouter(prefix="/api/agents", tags=["Agentic Workflows"])
workflows_service = AgenticWorkflowsService()


@router.post("/{workflow_id}/run", response_model=AgentWorkflowResult)
def run_agentic_workflow(
    workflow_id: str,
    req: AgentWorkflowRunRequest,
) -> AgentWorkflowResult:
    if workflow_id == "redteam_change":
        return workflows_service.run_redteam_change_audit(runtime.twin_engine, req)
    if workflow_id == "incident_commander":
        return workflows_service.run_incident_commander(runtime.twin_engine, req)
    if workflow_id == "shift_handover":
        return workflows_service.run_shift_handover(
            runtime.twin_engine, runtime.telemetry_store, req
        )
    if workflow_id == "colo_deal_desk":
        return workflows_service.run_colo_deal_desk(runtime.twin_engine, req)
    if workflow_id == "stranded_power":
        return workflows_service.run_stranded_power_recovery(runtime.twin_engine, req)
    raise HTTPException(status_code=404, detail=f"Unknown workflow_id: {workflow_id}")
