"""
Critical Facilities Demarcation Guardrail Tests (`tests/test_demarcation_boundary.py`).

Enforces the strict "Church & State" Data Center Operations boundary:
- Zero IT server OS agents, NVIDIA DCGM exporters, Redfish/IPMI BMC scraping, or Slurm/K8s
  job migration commands may exist in connectors or facility remediation actions.
- All closed-loop actuation must operate through BACnet Priority Arrays (`Priority 8` with
  `NULL` relinquishment fallback to `Priority 16` local PID).
"""

from __future__ import annotations
import pytest

from adapters import SimulatedTwinAdapter
from ai_engine import DataCenterAIService
from connectors import EnterpriseConnectorManager


FORBIDDEN_SERVER_SIDE_TERMS = (
    "dcgm",
    "redfish",
    "ipmi",
    "openbmc",
    "slurm",
    "kubectl",
    "kubernetes",
    "ssh ",
    "migrate batch",
)


def test_connectors_strictly_respect_facility_demarcation():
    mgr = EnterpriseConnectorManager()
    connectors = mgr.list_connectors()
    assert len(connectors) >= 4

    for conn in connectors:
        blob = (
            f"{conn.connector_id} {conn.name} {conn.protocol.value} "
            f"{conn.vendor_examples} {conn.target_layer} {conn.endpoint_url}"
        ).lower()
        for term in FORBIDDEN_SERVER_SIDE_TERMS:
            assert term not in blob, (
                f"Connector `{conn.connector_id}` violated facility demarcation with `{term}`"
            )


def test_anomaly_remediations_never_prescribe_it_workload_interference(default_engine):
    ai = DataCenterAIService()
    for scenario in ["gpu_burst_row_c", "crac_2_fail", "cdu_1_fouling", "hot_aisle_recirc"]:
        default_engine.trigger_scenario(scenario)
        default_engine.step(dt_sec=2.0)
        _, anomalies = ai.update_forecasts_and_anomalies(default_engine)
        for anom in anomalies:
            text = f"{anom.title} {anom.description} {anom.recommended_action}".lower()
            for term in FORBIDDEN_SERVER_SIDE_TERMS:
                assert term not in text, (
                    f"Anomaly `{anom.title}` prescribed server-touching action `{term}`"
                )


def test_bacnet_priority_8_writeback_and_null_relinquishment(default_engine):
    adapter = SimulatedTwinAdapter(default_engine)
    crac_id = next(iter(default_engine.cracs.keys()))
    baseline_pri16 = default_engine.cracs[crac_id].supply_air_setpoint_c

    # Write supervisory AI setpoint at BACnet Priority 8
    res_write = adapter.write_setpoint(crac_id, "supply_air_setpoint_c", 20.5, bacnet_priority=8)
    assert res_write["written_priority"] == 8
    assert res_write["effective_value"] == 20.5
    assert default_engine.cracs[crac_id].supply_air_setpoint_c == 20.5

    # Clamping safety check: out-of-range write is clamped to safe mechanical bounds [16.0, 22.5]
    res_clamp = adapter.write_setpoint(crac_id, "supply_air_setpoint_c", 9.0, bacnet_priority=8)
    assert res_clamp["effective_value"] == 16.0

    # Watchdog relinquishment (`NULL` to Priority 8) restores local Priority 16 PID setpoint
    res_rel = adapter.relinquish_setpoint(crac_id, "supply_air_setpoint_c", bacnet_priority=8)
    assert res_rel["effective_value"] == baseline_pri16
    assert default_engine.cracs[crac_id].supply_air_setpoint_c == baseline_pri16

    # Rejects attempts to write to non-facility/unknown points
    with pytest.raises(KeyError):
        adapter.write_setpoint("R-C04", "gpu_clock_limit_mhz", 1200.0)
