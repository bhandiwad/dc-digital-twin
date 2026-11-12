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

