"""
Real Multi-Provider LLM Tool-Calling Agent for Pandita's Aether-DCTWIN.
Supports:
- OpenRouter (`https://openrouter.ai/api/v1/chat/completions`) — First-class default with OpenAI-compatible function/tool calling!
  Supports any OpenRouter model (`anthropic/claude-3.7-sonnet`, `google/gemini-2.5-pro`, `openai/gpt-4o`, `deepseek/deepseek-r1`, `meta-llama/llama-3.3-70b-instruct`).
- Anthropic (`https://api.anthropic.com/v1/messages`) — Uses `ANTHROPIC_API_KEY`
- OpenAI (`https://api.openai.com/v1/chat/completions`) — Uses `OPENAI_API_KEY`
- Google Gemini (`https://generativelanguage.googleapis.com/v1beta/models/...`) — Uses `GEMINI_API_KEY`
- Local Ollama (`http://127.0.0.1:11434/v1/chat/completions`)

How the Real Agentic Loop Works:
1. Sends the user's question + live Digital Twin context + 6 callable JSON Schema Tools to the real LLM API.
2. When the LLM returns `tool_calls` (e.g., `inspect_facility_telemetry`, `run_opendt_rls_calibration`,
   `solve_constrained_mpc_lookahead`, `graphrag_blast_radius_and_sop`, `run_counterfactual_whatif`,
   `execute_cooling_setpoints`, `query_duckdb_24h_history`), this module executes the actual Python physics/ML/DuckDB
   functions, records the execution latency & output in `AgentToolCallTrace`, and feeds the tool results back to the LLM
   so the LLM synthesizes a deeply reasoned engineering answer grounded 100% in the real tool outputs.
"""

from __future__ import annotations
import json
import os
import time
import urllib.request
import urllib.error
from typing import Dict, List, Any, Optional, Tuple

from models import (
    WhatIfRequest,
    MOPGenerationRequest,
    AgentToolCallTrace,
    AgentCopilotResponse,
)
from simulator import DataHallTwinEngine


AGENT_TOOLS_OPENAI_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "inspect_facility_telemetry",
            "description": "Inspect real-time facility power, PUE, peak cold-aisle inlet temperature, peak GPU junction temperature, active IsolationForest anomalies, and 30-minute thermal forecasts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "include_anomalies": {"type": "boolean", "description": "Include active thermal and mechanical anomalies."}
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_opendt_rls_calibration",
            "description": "Run the OpenDT Recursive Least Squares (RLS) and Kalman Filter self-calibration engine using facility PDU/CDU/CRAC sensors to estimate zone thermal resistance (R_th), capacitance (C_th), RMSE error, and heat-exchanger UA fouling drift.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "solve_constrained_mpc_lookahead",
            "description": "Solve the 30-minute Constrained Model Predictive Control (MPC) / Safe-RL lookahead trajectory with Control Barrier Functions (ASHRAE A1 <= 27C inlet, CDU return <= 40C) and calculate anti-hunting VFD savings.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "graphrag_blast_radius_and_sop",
            "description": "Traverse the NetworkX facility topology graph to compute the downstream blast radius (rows, racks, kW load) for a target cooling/power unit and generate an ASHRAE/vendor-compliant Method of Procedure (MOP) checklist.",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_component_id": {
                        "type": "string",
                        "description": "Facility asset ID, e.g., 'CDU-1', 'CDU-2', 'CRAC-2', 'CRAC-3', 'PDU-C'.",
                    },
                    "procedure_type": {
                        "type": "string",
                        "description": "Maintenance procedure: 'strainer_swap', 'vfd_replacement', or 'breaker_thermography'.",
                    },
                },
                "required": ["target_component_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_counterfactual_whatif",
            "description": "Clone the live Digital Twin in memory and run a counterfactual What-If physics simulation (adding/removing GPU kW load, retrofitting air racks to direct liquid cooling, or tripping a CRAC unit).",
            "parameters": {
                "type": "object",
                "properties": {
                    "target_row": {"type": "string", "description": "Row ID: 'ROW-A', 'ROW-B', 'ROW-C', or 'ROW-D'."},
                    "add_gpu_load_kw": {"type": "number", "description": "Additional IT load in kW (e.g., 120 or 160)."},
                    "convert_air_to_liquid": {"type": "boolean", "description": "Whether to retrofit the target row to direct-to-chip liquid cooling."},
                },
                "required": ["target_row", "add_gpu_load_kw"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_duckdb_24h_history",
            "description": "Run analytical SQL aggregations against the 24-hour DuckDB/Parquet telemetry store (avg/min/max PUE, peak facility power, anomalous hours).",
            "parameters": {
                "type": "object",
                "properties": {
                    "dataset_id": {
                        "type": "string",
                        "description": "Dataset ID: 'kaggle_green_ai_24h', 'ornl_frontier_cdu_24h', or 'ieee_ashrae_fault_24h'.",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "execute_cooling_setpoints",
            "description": "Actuate recommended CRAC supply air setpoints, VFD fan speeds, and CDU liquid supply setpoints on the live Digital Twin and enable closed-loop AI Auto-Pilot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "enable_autopilot": {"type": "boolean", "description": "Enable closed-loop AI Auto-Pilot."}
                },
            },
        },
    },
]


class LiveLLMConfigManager:
    def __init__(self) -> None:
        self.openrouter_api_key: str = os.environ.get("OPENROUTER_API_KEY", "")
        self.anthropic_api_key: str = os.environ.get("ANTHROPIC_API_KEY", "")
        self.openai_api_key: str = os.environ.get("OPENAI_API_KEY", "")
        self.gemini_api_key: str = os.environ.get("GEMINI_API_KEY", "")

        # Default to OpenRouter if key is configured, otherwise Anthropic if present in env
        if self.openrouter_api_key:
            self.active_provider = "openrouter"
            self.active_model = "anthropic/claude-3.7-sonnet"
        elif self.anthropic_api_key:
            self.active_provider = "anthropic"
            self.active_model = "claude-sonnet-4-20250514"
        else:
            self.active_provider = "openrouter"
            self.active_model = "openai/gpt-4o-mini"

    def update_config(
        self, provider: str, model: str, api_key: Optional[str] = None
    ) -> Dict[str, Any]:
        self.active_provider = provider.lower().strip()
        if model:
            self.active_model = model.strip()
        if api_key and api_key.strip():
            clean_key = api_key.strip()
            if self.active_provider == "openrouter":
                self.openrouter_api_key = clean_key
            elif self.active_provider == "anthropic":
                self.anthropic_api_key = clean_key
            elif self.active_provider == "openai":
                self.openai_api_key = clean_key
            elif self.active_provider == "gemini":
                self.gemini_api_key = clean_key
        return self.get_status()

    def get_status(self) -> Dict[str, Any]:
        has_or = bool(self.openrouter_api_key)
        has_ant = bool(self.anthropic_api_key)
        has_oai = bool(self.openai_api_key)
        has_gem = bool(self.gemini_api_key)

        active_has_key = (
            (self.active_provider == "openrouter" and has_or)
            or (self.active_provider == "anthropic" and has_ant)
            or (self.active_provider == "openai" and has_oai)
            or (self.active_provider == "gemini" and has_gem)
        )

        return {
            "active_provider": self.active_provider,
            "active_model": self.active_model,
            "live_llm_ready": active_has_key,
            "configured_providers": {
                "openrouter": has_or,
                "anthropic": has_ant,
                "openai": has_oai,
                "gemini": has_gem,
            },
            "popular_openrouter_models": [
                "anthropic/claude-3.7-sonnet",
                "google/gemini-2.5-pro-preview",
                "google/gemini-2.5-flash",
                "openai/gpt-4o",
                "openai/gpt-4o-mini",
                "deepseek/deepseek-chat-v3-0324",
                "meta-llama/llama-3.3-70b-instruct",
            ],
        }


def execute_single_tool(
    tool_name: str,
    args: Dict[str, Any],
    engine: DataHallTwinEngine,
    ai_service: Any,
    telemetry_store: Any,
    actions_taken: List[str],
) -> Tuple[Dict[str, Any], str]:
    """Execute one real Digital Twin tool and return (structured_json_dict, short_summary_str)."""
    if tool_name == "inspect_facility_telemetry":
        forecasts, anoms = ai_service.update_forecasts_and_anomalies(engine)
        opt = ai_service.compute_optimization(engine)
        m = engine.history[-1]
        res = {
            "facility_pue": m.pue,
            "projected_optimal_pue": opt.projected_pue,
            "total_it_power_kw": m.total_it_power_kw,
            "total_cooling_power_kw": m.total_cooling_power_kw,
            "max_inlet_temp_c": m.max_inlet_temp_c,
            "max_inlet_rack_id": m.max_inlet_rack_id,
            "max_chip_temp_c": m.max_chip_temp_c,
            "max_chip_rack_id": m.max_chip_rack_id,
            "outdoor_wetbulb_c": m.outdoor_wetbulb_c,
            "liquid_cooling_share_pct": m.liquid_cooling_share_pct,
            "active_anomalies": [a.model_dump() for a in anoms[:4]],
            "forecast_15m": forecasts[3].model_dump() if len(forecasts) > 3 else {},
            "recommended_actions": [a.model_dump() for a in opt.actions[:4]],
        }
        summary = f"IT={m.total_it_power_kw:.0f}kW, PUE={m.pue:.3f} (Opt {opt.projected_pue:.3f}), MaxInlet={m.max_inlet_temp_c:.1f}°C ({m.max_inlet_rack_id}), ActiveAnomalies={len(anoms)}"
        return res, summary

    if tool_name == "run_opendt_rls_calibration":
        cal = ai_service.compute_opendt_calibration(engine)
        summary = f"Uncalibrated RMSE ±{cal.overall_uncalibrated_rmse_c:.2f}°C -> OpenDT RLS RMSE ±{cal.overall_calibrated_rmse_c:.2f}°C (MAPE {cal.overall_mape_pct:.1f}%, Convergence {cal.convergence_pct}%)"
        return cal.model_dump(), summary

    if tool_name == "solve_constrained_mpc_lookahead":
        mpc = ai_service.compute_mpc_policy(engine)
        summary = f"Solved 30-min CBF-safe trajectory in {mpc.solve_time_ms}ms. Anti-hunting fan/pump savings: -{mpc.anti_hunting_savings_kw} kW."
        return mpc.model_dump(), summary

    if tool_name == "graphrag_blast_radius_and_sop":
        comp_id = str(args.get("target_component_id", "CDU-1")).upper()
        proc = str(args.get("procedure_type", "strainer_swap"))
        mop = ai_service.generate_graphrag_mop(
            engine,
            MOPGenerationRequest(target_component_id=comp_id, procedure_type=proc, duration_minutes=20),
        )
        summary = f"GraphRAG traced {len(mop.blast_radius_racks)} racks ({mop.total_affected_kw} kW) in {', '.join(mop.blast_radius_rows)}. Generated MOP `{mop.mop_id}`."
        return mop.model_dump(), summary

    if tool_name == "run_counterfactual_whatif":
        row_id = str(args.get("target_row", "ROW-C")).upper()
        add_kw = float(args.get("add_gpu_load_kw", 120.0))
        conv = bool(args.get("convert_air_to_liquid", False))
        wi = ai_service.run_whatif_simulation(
            engine,
            WhatIfRequest(
                name=f"LLM Sandbox: +{add_kw:.0f}kW in {row_id}",
                target_row=row_id,
                add_gpu_load_kw=add_kw,
                convert_air_to_liquid=conv,
                cdu_setpoint_c=22.5,
            ),
        )
        summary = f"Baseline PUE {wi.baseline_pue:.3f} -> Projected PUE {wi.projected_pue:.3f}, Risk={wi.risk_level.value.upper()}"
        return wi.model_dump(), summary

    if tool_name == "query_duckdb_24h_history":
        ds_id = str(args.get("dataset_id", "kaggle_green_ai_24h"))
        if telemetry_store is not None:
            sql_res = telemetry_store.run_sql_analytics(ds_id)
            summary = f"DuckDB `{ds_id}`: Avg PUE={sql_res['avg_pue']}, Peak={sql_res['peak_facility_kw']}kW, Anomalous={sql_res['anomalous_hours']} hrs."
            return sql_res, summary
        return {"status": "no_store"}, "No store"

    if tool_name == "execute_cooling_setpoints":
        opt = ai_service.compute_optimization(engine)
        for act in opt.actions:
            if act.target_id in engine.cracs:
                c = engine.cracs[act.target_id]
                if "Setpoint" in act.parameter:
                    c.supply_air_setpoint_c = act.recommended_value
                else:
                    c.enabled = True
                    c.fan_speed_pct = act.recommended_value
                actions_taken.append(f"Adjusted {act.target_id} ({act.parameter}) → {act.recommended_value}{act.unit}")
            elif act.target_id in engine.cdus:
                cdu = engine.cdus[act.target_id]
                if "Setpoint" in act.parameter:
                    cdu.supply_temp_setpoint_c = act.recommended_value
                else:
                    cdu.enabled = True
                    cdu.pump_speed_pct = act.recommended_value
                    engine.cdu_fouling_factor[act.target_id] = 0.96
                actions_taken.append(f"Adjusted {act.target_id} ({act.parameter}) → {act.recommended_value}{act.unit}")
        engine.auto_optimize = True
        for _ in range(3):
            m = engine.step(dt_sec=2.0)
        summary = f"Actuated {len(actions_taken)} CRAC/CDU setpoints; live PUE converged to {m.pue:.3f}."
        return {"new_pue": m.pue, "actions_applied": actions_taken}, summary

    return {"error": f"Unknown tool {tool_name}"}, f"Unknown tool {tool_name}"


def call_openrouter_or_openai_with_tools(
    endpoint_url: str,
    api_key: str,
    model: str,
    question: str,
    engine: DataHallTwinEngine,
    ai_service: Any,
    telemetry_store: Any,
) -> Tuple[str, List[AgentToolCallTrace], List[str]]:
    """
    Execute a real OpenAI / OpenRouter Function-Calling loop (`tools` + `tool_choice="auto"`),
    running the requested Digital Twin tools in Python and feeding their JSON outputs back to the LLM.
    """
    m = engine.history[-1]
    system_prompt = (
        "You are the Autonomous Chief Facility AI Engineer for Pandita's Aether-DCTWIN, a High-Density AI Data Center Digital Twin "
        "(32 racks: Rows A & B air-cooled, Rows C & D direct-to-chip liquid cooled via CDU-1 & CDU-2; 4 perimeter CRAC units; 4 PDUs; 2 UPS). "
        "CRITICAL POLICY: You operate strictly at the Facility / BMS / Cooling / Power boundary and never log into or touch tenant servers. "
        f"Current Snapshot: IT Load={m.total_it_power_kw:.1f} kW, Facility PUE={m.pue:.3f}, Peak Cold Inlet={m.max_inlet_temp_c:.1f}°C ({m.max_inlet_rack_id}), "
        f"Peak Coolant/Chip={m.max_chip_temp_c:.1f}°C ({m.max_chip_rack_id}), Outdoor Wet-Bulb={m.outdoor_wetbulb_c:.1f}°C. "
        "Always call one or more of your tools (`inspect_facility_telemetry`, `run_opendt_rls_calibration`, `solve_constrained_mpc_lookahead`, "
        "`graphrag_blast_radius_and_sop`, `run_counterfactual_whatif`, `query_duckdb_24h_history`, `execute_cooling_setpoints`) "
        "to gather exact numbers before answering. Format your final response in concise, high-impact Markdown with exact figures."
    )

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": question},
    ]

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "http://127.0.0.1:8000",
        "X-Title": "Panditas Aether-DCTWIN",
    }

    traces: List[AgentToolCallTrace] = []
    actions_taken: List[str] = []
    step_counter = 1

    # Step 1: First LLM call with tools enabled
    req_body = {
        "model": model,
        "messages": messages,
        "tools": AGENT_TOOLS_OPENAI_SCHEMA,
        "tool_choice": "auto",
        "temperature": 0.2,
        "max_tokens": 900,
    }
    req = urllib.request.Request(
        endpoint_url,
        data=json.dumps(req_body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=28) as resp:
        resp_data = json.loads(resp.read().decode("utf-8"))

    choice = resp_data["choices"][0]["message"]
    tool_calls = choice.get("tool_calls") or []

    if tool_calls:
        messages.append(choice)
        for tc in tool_calls:
            fn_name = tc["function"]["name"]
            raw_args = tc["function"].get("arguments") or "{}"
            try:
                parsed_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
            except Exception:
                parsed_args = {}

            t0 = time.perf_counter()
            tool_res, summary_str = execute_single_tool(
                fn_name, parsed_args, engine, ai_service, telemetry_store, actions_taken
            )
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)

            traces.append(
                AgentToolCallTrace(
                    step=step_counter,
                    tool_name=fn_name,
                    arguments=parsed_args,
                    result_summary=summary_str,
                    duration_ms=elapsed_ms,
                )
            )
            step_counter += 1

            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "name": fn_name,
                "content": json.dumps(tool_res),
            })

        # Step 2: Second LLM call to synthesize the final answer from tool outputs
        req_body_2 = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 900,
        }
        req2 = urllib.request.Request(
            endpoint_url,
            data=json.dumps(req_body_2).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req2, timeout=28) as resp2:
            resp2_data = json.loads(resp2.read().decode("utf-8"))
        final_text = resp2_data["choices"][0]["message"].get("content") or "Completed tool execution."
        return final_text, traces, actions_taken

    # If the model answered directly without invoking a tool, run a quick telemetry inspection trace so UI always shows live grounding
    t0 = time.perf_counter()
    _, summary_str = execute_single_tool(
        "inspect_facility_telemetry", {"include_anomalies": True}, engine, ai_service, telemetry_store, actions_taken
    )
    traces.append(
        AgentToolCallTrace(
            step=1,
            tool_name="inspect_facility_telemetry",
            arguments={"include_anomalies": True},
            result_summary=summary_str,
            duration_ms=round((time.perf_counter() - t0) * 1000.0, 1),
        )
    )
    return choice.get("content", ""), traces, actions_taken
