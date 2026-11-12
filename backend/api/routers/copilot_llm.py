"""
Autonomous Tool-Calling Operations Copilot & LLM Provider Configuration Router.
"""

from __future__ import annotations
from typing import Any, Dict
from fastapi import APIRouter

from api.deps import runtime
from models import AgentCopilotResponse, AgentQueryRequest, LLMProviderConfigRequest

router = APIRouter(tags=["copilot-and-llm"])


@router.post("/api/copilot", response_model=AgentCopilotResponse)
def ask_copilot(req: AgentQueryRequest) -> AgentCopilotResponse:
    return runtime.ai_service.answer_copilot_query(
        runtime.twin_engine,
        req.question,
        auto_execute_tools=req.auto_execute_tools,
        telemetry_store=runtime.telemetry_store,
        llm_provider=req.llm_provider,
        llm_model=req.llm_model,
        api_key=req.api_key,
    )


@router.get("/api/llm/config")
def get_llm_config() -> Dict[str, Any]:
    return runtime.ai_service.llm_config.get_status()


@router.post("/api/llm/config")
def update_llm_config(req: LLMProviderConfigRequest) -> Dict[str, Any]:
    return runtime.ai_service.llm_config.update_config(
        provider=req.provider,
        model=req.model,
        api_key=req.api_key,
    )
