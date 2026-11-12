"""
3-Phase AC Electrical Distribution (EPMS / PDU / UPS) & PUE Primitives.

Covers:
- Symmetrical 120° 3-phase line currents (`L1`, `L2`, `L3`), phasor neutral current (`I_N`),
  NEMA MG-1 phase current imbalance %, and NEC 80% continuous breaker usable headroom
- First-Law bounded Facility PUE calculation (`PUE >= 1.0`)
"""

from __future__ import annotations
import math
from typing import Tuple
from pydantic import BaseModel


class PhaseElectricalMetrics(BaseModel):
    phase_l1_amps: float
    phase_l2_amps: float
    phase_l3_amps: float
    neutral_amps: float
    phase_imbalance_pct: float
    usable_continuous_spare_kw: float


def calc_3phase_currents_and_imbalance(
    active_power_kw: float,
    rated_capacity_kw: float,
    voltage_ll_v: float = 415.0,
    power_factor: float = 0.97,
    phase_weights: Tuple[float, float, float] = (1.0, 1.0, 1.0),
    nec_continuous_derating: float = 0.80,
) -> PhaseElectricalMetrics:
    """
    Compute 3-phase RMS line currents, 120° symmetrical phasor neutral current, NEMA imbalance %,
    and phase-derated continuous breaker headroom in kW.
    """
    if active_power_kw <= 0.0:
        return PhaseElectricalMetrics(
            phase_l1_amps=0.0,
            phase_l2_amps=0.0,
            phase_l3_amps=0.0,
            neutral_amps=0.0,
            phase_imbalance_pct=0.0,
            usable_continuous_spare_kw=round(rated_capacity_kw * nec_continuous_derating, 2),
        )

    v_safe = max(208.0, float(voltage_ll_v))
    pf_safe = max(0.5, min(1.0, float(power_factor)))
    i_avg = (active_power_kw * 1000.0) / (math.sqrt(3.0) * v_safe * pf_safe)

    w_sum = sum(phase_weights)
    norm_w = tuple((w * 3.0 / max(1e-6, w_sum)) for w in phase_weights)
    i1, i2, i3 = (i_avg * norm_w[0], i_avg * norm_w[1], i_avg * norm_w[2])

    max_dev = max(abs(i1 - i_avg), abs(i2 - i_avg), abs(i3 - i_avg))
    imbalance_pct = (max_dev / max(1e-6, i_avg)) * 100.0

    # Phasor sum for 120° displaced 3-phase Wye system:
    # I_N = sqrt(I1^2 + I2^2 + I3^2 - I1*I2 - I2*I3 - I3*I1)
    radicand = max(0.0, i1 * i1 + i2 * i2 + i3 * i3 - i1 * i2 - i2 * i3 - i3 * i1)
    i_neutral = math.sqrt(radicand)

    peak_phase_multiplier = max(i1, i2, i3) / max(1e-6, i_avg)
    effective_peak_equiv_kw = active_power_kw * peak_phase_multiplier
    usable_spare_kw = max(0.0, nec_continuous_derating * rated_capacity_kw - effective_peak_equiv_kw)

    return PhaseElectricalMetrics(
        phase_l1_amps=round(i1, 1),
        phase_l2_amps=round(i2, 1),
        phase_l3_amps=round(i3, 1),
        neutral_amps=round(i_neutral, 1),
        phase_imbalance_pct=round(imbalance_pct, 2),
        usable_continuous_spare_kw=round(usable_spare_kw, 2),
    )


def calc_pue(total_facility_power_kw: float, total_it_power_kw: float) -> float:
    """
    Green Grid Power Usage Effectiveness (`Total Facility Power / IT Equipment Power`).
    Enforces thermodynamic First-Law invariant `PUE >= 1.0`.
    """
    it_safe = max(0.1, float(total_it_power_kw))
    fac_safe = max(it_safe, float(total_facility_power_kw))
    return round(fac_safe / it_safe, 3)
