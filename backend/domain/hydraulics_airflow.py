"""
Hydraulic (CDU Liquid Loop) & Aerodynamic (CRAC Cold-Aisle) Physics Primitives.

Covers:
- VFD Fan / Pump Cubic Affinity Laws (`P ~ Speed^3`)
- First-Law Sensible Heat Balance (`Q = m_dot * c_p * dT`) for water/glycol & air
- Thermal Capacitance ODE Ride-Through Time (`Time-to-SLA-Breach`)
- Filter / Strainer Fouling Resistance Health & Parasitic Power Penalty
"""

from __future__ import annotations
from typing import Dict


# Propylene-glycol / inhibited water (~25% mix): rho * Cp ~ 3.95 kJ/(L*K) => 3.95 / 60 = 0.06583 kW/(LPM*K)
WATER_GLYCOL_KW_PER_LPM_K: float = 0.0658

# Standard sea-level dry air sensible heat factor: dT(°C) = Q(kW) * 1755 / CFM
AIR_SENSIBLE_CFM_K_PER_KW: float = 1755.0


def calc_vfd_affinity_power_kw(
    speed_pct: float,
    rated_dynamic_kw: float,
    standby_kw: float = 0.5,
    exponent: float = 3.0,
) -> float:
    """
    Calculate VFD-driven centrifugal fan or pump electrical input kW using Pump/Fan Affinity Laws.
    """
    clamped_pct = max(0.0, min(120.0, float(speed_pct)))
    if clamped_pct <= 5.0:
        return round(standby_kw, 3)
    ratio = clamped_pct / 100.0
    return round(standby_kw + rated_dynamic_kw * (ratio ** exponent), 2)


def calc_liquid_loop_delta_t_c(
    heat_rejected_kw: float,
    flow_lpm: float,
    kw_per_lpm_k: float = WATER_GLYCOL_KW_PER_LPM_K,
) -> float:
    """Sensible temperature rise (°C) across a cold-plate or CDU secondary coolant loop."""
    if heat_rejected_kw <= 0.0:
        return 0.0
    denom = max(0.25, float(flow_lpm) * kw_per_lpm_k)
    return round(heat_rejected_kw / denom, 2)


def calc_air_loop_delta_t_c(heat_rejected_kw: float, airflow_cfm: float) -> float:
    """Sensible air temperature rise (°C) across a server chassis or cold/hot aisle."""
    if heat_rejected_kw <= 0.0:
        return 0.0
    safe_cfm = max(150.0, float(airflow_cfm))
    return round((heat_rejected_kw * AIR_SENSIBLE_CFM_K_PER_KW) / safe_cfm, 2)


def calc_thermal_runway_seconds(
    c_th_kj_per_c: float,
    current_temp_c: float,
    sla_limit_c: float,
    net_uncooled_heat_kw: float,
) -> float:
    """
    First-order lumped thermal capacitance time-to-threshold (seconds) if primary cooling trips:
        C_th * (dT / dt) = Q_net   =>   dt = C_th * (T_limit - T_now) / Q_net
    Note: 1 kW == 1 kJ/s, so (kJ/°C * °C) / kW yields seconds directly.
    """
    margin_c = float(sla_limit_c) - float(current_temp_c)
    if margin_c <= 0.0:
        return 0.0
    q_net = max(0.5, float(net_uncooled_heat_kw))
    return round((max(1.0, c_th_kj_per_c) * margin_c) / q_net, 1)


def calc_fouling_health_and_penalty(
    measured_flow: float,
    clean_flow_at_current_speed: float,
    current_vfd_power_kw: float,
) -> Dict[str, float]:
    """
    Estimate filter/strainer hydraulic health % and wasted VFD power kW from flow degradation.
    """
    eta_flow = max(0.30, min(1.0, measured_flow / max(1e-3, clean_flow_at_current_speed)))
    health_pct = max(0.0, min(100.0, ((eta_flow - 0.65) / 0.35) * 100.0))
    wasted_kw = max(0.0, current_vfd_power_kw * (1.0 - (eta_flow ** 3)))
    return {
        "flow_efficiency_ratio": round(eta_flow, 3),
        "health_pct": round(health_pct, 1),
        "wasted_vfd_kw": round(wasted_kw, 2),
    }
