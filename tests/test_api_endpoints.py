"""
End-to-End FastAPI Router & Contract Tests (`tests/test_api_endpoints.py`).
"""

from __future__ import annotations


def test_health_and_topology_endpoints(api_client):
    r_health = api_client.get("/api/health")
    assert r_health.status_code == 200
    body = r_health.json()
    assert body["status"] == "ok"
    assert "site_id" in body

    r_topo = api_client.get("/api/topology")
    assert r_topo.status_code == 200
    topo = r_topo.json()
    assert topo["node_count"] > 32
    assert len(topo["edges"]) > 32


def test_state_controls_and_ml_suite_endpoints(api_client):
    r_state = api_client.get("/api/state")
    assert r_state.status_code == 200
    snap = r_state.json()
    assert snap["facility"]["pue"] >= 1.0
    assert len(snap["racks"]) == 32

    r_cal = api_client.get("/api/opendt/calibration")
    assert r_cal.status_code == 200
    assert r_cal.json()["overall_calibrated_rmse_c"] > 0

    r_mpc = api_client.get("/api/mpc/policy")
    assert r_mpc.status_code == 200
    assert len(r_mpc.json()["lookahead_trajectory"]) == 7

    r_mop = api_client.post(
        "/api/graphrag/mop",
        json={
            "target_component_id": "CDU-1",
            "procedure_type": "live_isolation_maintenance",
            "maintenance_window_minutes": 45,
        },
    )
    assert r_mop.status_code == 200
    assert len(r_mop.json()["steps"]) == 5


def test_energy_roi_connectors_and_copilot_endpoints(api_client):
    r_grid = api_client.get("/api/energy/grid")
    assert r_grid.status_code == 200
    assert len(r_grid.json()["schedule_24h"]) == 12

    r_roi = api_client.get("/api/roi-report")
    assert r_roi.status_code == 200
    assert r_roi.json()["annual_cost_savings_usd"] > 0

    r_conn = api_client.get("/api/connectors")
    assert r_conn.status_code == 200
    assert len(r_conn.json()) == 4

    r_csv = api_client.get("/api/connectors/sample-csv/coolit_epms")
    assert r_csv.status_code == 200
    assert "branch_kw_sum" in r_csv.text

    r_cop = api_client.post(
        "/api/copilot",
        json={"question": "Run OpenDT RLS self-calibration and check CDU fouling drift"},
    )
    assert r_cop.status_code == 200
    assert len(r_cop.json()["tool_calls"]) >= 1


def test_dynamic_feature_plugin_loader(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from api.plugin_loader import register_feature_plugins

    plugin_dir = tmp_path / "features"
    plugin_dir.mkdir()
    (plugin_dir / "sample_prd_feature.py").write_text(
        "from fastapi import APIRouter\n"
        "router = APIRouter()\n"
        "@router.get('/api/features/sample-ping')\n"
        "def ping():\n"
        "    return {'feature': 'mounted'}\n"
    )

    isolated_app = FastAPI()
    mounted = register_feature_plugins(isolated_app, features_dir=str(plugin_dir))
    assert mounted == ["sample_prd_feature"]

    with TestClient(isolated_app) as c:
        res = c.get("/api/features/sample-ping")
        assert res.status_code == 200
        assert res.json() == {"feature": "mounted"}


def test_autopilot_toggle_and_bacnet_relinquishment(api_client):
    # Ensure starting from Manual BMS (Auto-Pilot OFF)
    r_off_init = api_client.post("/api/controls", json={"auto_optimize": False})
    assert r_off_init.status_code == 200
    snap_manual = r_off_init.json()
    assert snap_manual["optimization"]["auto_pilot_active"] is False
    manual_pue = snap_manual["facility"]["pue"]

    # Enable Closed-Loop Auto-Pilot (BACnet Priority 8) -> PUE drops measurably
    r_on = api_client.post("/api/controls", json={"auto_optimize": True})
    assert r_on.status_code == 200
    snap_auto = r_on.json()
    assert snap_auto["optimization"]["auto_pilot_active"] is True
    assert snap_auto["facility"]["pue"] < manual_pue - 0.03
    assert len(snap_auto["optimization"]["actions"]) >= 1

    # Turn Auto-Pilot OFF -> Relinquishes Priority 8 back to Manual BMS Priority 16
    r_off_again = api_client.post("/api/controls", json={"auto_optimize": False})
    assert r_off_again.status_code == 200
    snap_reverted = r_off_again.json()
    assert snap_reverted["optimization"]["auto_pilot_active"] is False
    assert snap_reverted["facility"]["pue"] > snap_auto["facility"]["pue"] + 0.02


def test_10k_gpu_cluster_scale_out_planner(api_client):
    # 1. 10,000 GB200 NVL72 GPUs with Warm-Water Direct Liquid Cooling
    res = api_client.post(
        "/api/plan/cluster-scale",
        json={
            "gpu_count": 10000,
            "gpu_arch": "gb200_nvl72",
            "cooling_strategy": "warm_water_dlc",
        },
    )
    assert res.status_code == 200
    plan = res.json()
    assert plan["feasible"] is True
    assert plan["compute_racks"] == 139
    assert plan["data_halls_required"] >= 4
    # First-Law energy balance: liquid + residual air == total IT MW
    assert abs((plan["liquid_heat_mw"] + plan["air_residual_mw"]) - plan["cluster_it_mw"]) < 0.05
    assert plan["total_coolant_flow_lpm"] > 15000
    assert plan["synchronous_step_swing_mw"] > 8.0

    # 2. Air-Only cooling on 126 kW/rack GB200 NVL72 is flagged physically infeasible
    res_air = api_client.post(
        "/api/plan/cluster-scale",
        json={
            "gpu_count": 10000,
            "gpu_arch": "gb200_nvl72",
            "cooling_strategy": "legacy_air",
        },
    )
    assert res_air.status_code == 200
    assert res_air.json()["feasible"] is False


def test_five_agentic_workflows_endpoints(api_client):
    # 1. Change-Window Red-Team (afternoon heatwave -> blocked; cool off-peak -> approved)
    r_block = api_client.post(
        "/api/agents/redteam_change/run",
        json={
            "target_component_id": "CDU-1",
            "window_hour_local": 15,
            "forecast_wetbulb_c": 28.5,
            "duration_minutes": 45,
        },
    )
    assert r_block.status_code == 200
    assert r_block.json()["verdict_status"] == "blocked"
    assert len(r_block.json()["tool_steps"]) == 4

    r_ok = api_client.post(
        "/api/agents/redteam_change/run",
        json={
            "target_component_id": "PDU-A",
            "window_hour_local": 3,
            "forecast_wetbulb_c": 17.5,
            "duration_minutes": 30,
        },
    )
    assert r_ok.status_code == 200
    assert r_ok.json()["verdict_status"] in ("approved", "conditional")

    # 2. Incident Commander & Auto-RCA
    r_inc = api_client.post(
        "/api/agents/incident_commander/run",
        json={"incident_scenario_id": "crac_2_fail", "sync_to_live_hall": False},
    )
    assert r_inc.status_code == 200
    assert r_inc.json()["verdict_status"] == "critical_action"
    assert any(s["kind"] == "document" for s in r_inc.json()["sections"])

    # 3. Silent-Drift & Shift-Handover Investigator
    r_shift = api_client.post(
        "/api/agents/shift_handover/run",
        json={"shift_window": "day_to_night", "dataset_id": "kaggle_green_ai_24h"},
    )
    assert r_shift.status_code == 200
    assert len(r_shift.json()["kpis"]) == 4

    # 4. Colocation Deal-Desk & RFP Fit-Out
    r_deal = api_client.post(
        "/api/agents/colo_deal_desk/run",
        json={"requested_kw": 850.0, "requested_racks": 10, "cooling_preference": "liquid_dlc"},
    )
    assert r_deal.status_code == 200
    assert r_deal.json()["workflow_id"] == "colo_deal_desk"

    # 5. Stranded Power & Ghost-Capacity Recovery
    r_strand = api_client.post(
        "/api/agents/stranded_power/run",
        json={"audit_scope": "full_hall", "breaker_limit_pct": 80.0},
    )
    assert r_strand.status_code == 200
    assert r_strand.json()["verdict_status"] == "opportunity"


def test_field_realism_upgrades(api_client):
    # 1. Colocation demarcation, patchy occupancy & central chiller plant
    snap = api_client.get("/api/state").json()
    assert snap["facility"]["chiller_cop"] > 1.5
    assert "economizer_share_pct" in snap["facility"]
    occupancy_types = {r["occupancy_status"] for r in snap["racks"]}
    assert "active_colo" in occupancy_types
    assert "ghost_reservation" in occupancy_types
    assert "dark_spare" in occupancy_types
    whip_phases = {r["whip_phase"] for r in snap["racks"]}
    assert whip_phases.issubset({"L1-L2", "L2-L3", "L3-L1"})

    # 2. Raw MOP ticket NLP parser + missing MOP safety clause critique
    r_mop_raw = api_client.post(
        "/api/agents/redteam_change/run",
        json={
            "raw_mop_text": (
                "CHG0049182 — Mechanical vendor isolating CDU-1 primary basket strainer "
                "at 15:00 for 45 mins to flush debris screen."
            )
        },
    )
    assert r_mop_raw.status_code == 200
    mop_res = r_mop_raw.json()
    assert mop_res["focus_asset_id"] == "CDU-1"
    assert mop_res["verdict_status"] == "blocked"
    redlines = mop_res["sections"][0]["checklist"]
    assert any(item["priority"] == "MOP GAP" for item in redlines)

    # 3. Raw Broker RFP email parser + pre-quote engineering questions
    r_rfp_raw = api_client.post(
        "/api/agents/colo_deal_desk/run",
        json={
            "raw_rfp_email": (
                "Hi Team — AI prospect seeking 850 kW across 10 direct-to-chip liquid racks "
                "with summer PUE <= 1.28."
            )
        },
    )
    assert r_rfp_raw.status_code == 200
    rfp_res = r_rfp_raw.json()
    assert "850 kW" in rfp_res["title"]
    assert any(
        any(item["priority"] == "ASK PROSPECT" for item in sec["checklist"])
        for sec in rfp_res["sections"]
        if sec["kind"] == "checklist"
    )

    # 4. Shift Handover sensor hygiene (quarantines flatlined probe SAT-B04)
    r_shift_notes = api_client.post(
        "/api/agents/shift_handover/run",
        json={
            "shift_window": "day_to_night",
            "operator_shift_notes": "16:20 walkdown: SAT-B04 unchanged since noon.",
        },
    )
    assert r_shift_notes.status_code == 200
    assert "SAT-B04" in str(r_shift_notes.json()["sections"])

    # 5. 3-Stage BMS Supervisory Control Posture (Shadow -> Advisory -> Bounded Auto-Trim)
    s_shadow = api_client.post("/api/controls", json={"bms_control_mode": "shadow"}).json()
    assert s_shadow["facility"]["bms_control_mode"] == "shadow"
    assert s_shadow["optimization"]["auto_pilot_active"] is False

    s_adv = api_client.post(
        "/api/controls",
        json={"bms_control_mode": "advisory", "approve_advisory_trim": True},
    ).json()
    assert s_adv["facility"]["bms_control_mode"] == "advisory"
    assert s_adv["facility"]["pue"] <= s_shadow["facility"]["pue"]

    s_auto = api_client.post("/api/controls", json={"bms_control_mode": "bounded_autotrim"}).json()
    assert s_auto["facility"]["bms_control_mode"] == "bounded_autotrim"
    assert s_auto["optimization"]["auto_pilot_active"] is True

    api_client.post("/api/controls", json={"bms_control_mode": "shadow"})

    # 6. Bottom-up rack whip phase rebalance measurably drops whip-trapped kW
    before_strand = api_client.post(
        "/api/agents/stranded_power/run",
        json={"audit_scope": "full_hall", "breaker_limit_pct": 80.0},
    ).json()
    before_whip_kw = float(before_strand["kpis"][0]["value"].replace("+", "").replace(" kW", ""))
    assert before_whip_kw > 0

    api_client.post("/api/controls", json={"rebalance_pdu_whips": True})

    after_strand = api_client.post(
        "/api/agents/stranded_power/run",
        json={"audit_scope": "full_hall", "breaker_limit_pct": 80.0},
    ).json()
    after_whip_kw = float(after_strand["kpis"][0]["value"].replace("+", "").replace(" kW", ""))
    assert after_whip_kw < before_whip_kw



