"""
Domain Physics SDK (`backend/domain/`) for Pandita's Aether-DCTWIN.

Provides pure, unit-tested thermodynamic, psychrometric, hydraulic, 3-phase electrical,
and ASHRAE TC 9.9 boundary functions so application engineers never need to write raw
facility physics equations inside API routers or UI services.

Naming convention: Every parameter and return field carries an explicit unit suffix
(`_kw`, `_c`, `_lpm`, `_cfm`, `_kpa`, `_amps`, `_v`, `_pct`, `_sec`).
"""

from domain.ashrae import (
    ASHRAEAirClass,
    ASHRAELiquidClass,
    ASHRAE_AIR_ENVELOPES_C,
    ASHRAE_LIQUID_MAX_SUPPLY_C,
    classify_rack_thermal_severity,
)
from domain.psychrometrics import (
    calc_dewpoint_magnus_c,
    calc_condensation_margin_c,
    calc_chiller_cop,
    calc_waterside_economizer_share,
)
from domain.hydraulics_airflow import (
    calc_vfd_affinity_power_kw,
    calc_liquid_loop_delta_t_c,
    calc_air_loop_delta_t_c,
    calc_thermal_runway_seconds,
    calc_fouling_health_and_penalty,
)
from domain.electrical import (
    PhaseElectricalMetrics,
    calc_3phase_currents_and_imbalance,
    calc_pue,
)

__all__ = [
    "ASHRAEAirClass",
    "ASHRAELiquidClass",
    "ASHRAE_AIR_ENVELOPES_C",
    "ASHRAE_LIQUID_MAX_SUPPLY_C",
    "classify_rack_thermal_severity",
    "calc_dewpoint_magnus_c",
    "calc_condensation_margin_c",
    "calc_chiller_cop",
    "calc_waterside_economizer_share",
    "calc_vfd_affinity_power_kw",
    "calc_liquid_loop_delta_t_c",
    "calc_air_loop_delta_t_c",
    "calc_thermal_runway_seconds",
    "calc_fouling_health_and_penalty",
    "PhaseElectricalMetrics",
    "calc_3phase_currents_and_imbalance",
    "calc_pue",
]
