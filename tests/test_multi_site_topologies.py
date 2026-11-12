"""
Multi-Site Topology & Real Numerical Solver Tests (`tests/test_multi_site_topologies.py`).

Proves that zero asset IDs (`"ROW-C"`, `"CRAC-2"`, `"CDU-1"`) are hardcoded in the physics
simulator, stateful Recursive Least Squares (RLS) estimator, SLSQP Constrained MPC solver,
What-If sandbox, or GraphRAG MOP synthesizer by executing the entire stack against BOTH:
1. `default_hall.yaml` (32 racks, 4 rows, 4 CRACs, 2 CDUs)
2. `compact_edge_16rack.yaml` (16 racks, 2 rows `ROW-E1`/`ROW-E2`, 2 CRACs, 1 CDU `CDU-EDGE-1`)
"""

from __future__ import annotations
import pytest

from ai_engine import DataCenterAIService
from models import MOPGenerationRequest, WhatIfRequest


@pytest.mark.parametrize("fixture_name,expected_racks,expected_cdus", [
    ("default_engine", 32, 2),
    ("compact_engine", 16, 1),
])
def test_full_ml_and_physics_pipeline_across_arbitrary_site_blueprints(
    request, fixture_name: str, expected_racks: int, expected_cdus: int
):
    engine = request.getfixturevalue(fixture_name)
    ai = DataCenterAIService()

    assert len(engine.racks) == expected_racks
    assert len(engine.cdus) == expected_cdus

    # Advance coupled electro-thermal ODEs and verify PUE >= 1.0
    for _ in range(6):
        metrics = engine.step(dt_sec=2.0)
        assert metrics.pue >= 1.0
        assert metrics.total_facility_power_kw > metrics.total_it_power_kw

    # 1. Stateful OpenDT RLS Self-Calibration converges below uncalibrated RMSE
    cal_report = ai.compute_opendt_calibration(engine)
    assert len(cal_report.zones) >= 2
    assert cal_report.overall_calibrated_rmse_c < cal_report.overall_uncalibrated_rmse_c

    # 2. Real SciPy SLSQP Constrained MPC satisfies ASHRAE cold-aisle & liquid barriers
    mpc_state = ai.compute_mpc_policy(engine)
    assert mpc_state.solver_iterations >= 1
    assert len(mpc_state.lookahead_trajectory) == 7
    for pt in mpc_state.lookahead_trajectory:
        assert pt.mpc_controlled_inlet_c <= pt.ashrae_sla_limit_c + 0.3
        assert pt.mpc_controlled_return_liquid_c <= pt.liquid_sla_limit_c + 0.5

    # 3. Anomaly detection, optimizer, and Energy/TOU grid manager run cleanly
    forecasts, anomalies = ai.update_forecasts_and_anomalies(engine)
    assert len(forecasts) == 5
    assert isinstance(anomalies, list)

    opt = ai.compute_optimization(engine)
    assert opt.projected_pue <= opt.current_pue + 0.01

    grid = ai.compute_energy_grid_management(engine)
    assert len(grid.schedule_24h) == 12
    assert grid.annual_total_energy_opex_savings_usd >= 0

    # 4. Counterfactual What-If simulation works on site's own rows
    target_row = next(iter(engine.racks.values())).row_id
    whatif_res = ai.run_whatif_simulation(
        engine,
        WhatIfRequest(
            name="Topology-Generic Cluster Addition",
            target_row=target_row,
            add_gpu_load_kw=80.0,
            convert_air_to_liquid=False,
        ),
    )
    assert whatif_res.projected_pue >= 1.0
    assert len(whatif_res.affected_racks) > 0

    # 5. GraphRAG MOP Generator resolves blast radius dynamically from topology graph
    first_cdu_id = next(iter(engine.cdus.keys()))
    mop = ai.generate_graphrag_mop(
        engine,
        MOPGenerationRequest(
            target_component_id=first_cdu_id,
            procedure_type="live_isolation_maintenance",
            maintenance_window_minutes=45,
        ),
    )
    assert mop.target_component_id == first_cdu_id
    assert len(mop.blast_radius_racks) > 0
    assert len(mop.steps) == 5
