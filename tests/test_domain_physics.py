"""
Unit & Invariant Tests for the Pure Physics SDK (`backend/domain/`).

Allows non-domain software engineers to modify routers, UI panels, or data pipelines with
confidence that ASHRAE psychrometric, hydraulic, aerodynamic, and 3-phase AC laws hold.
"""

from __future__ import annotations
import math
import pytest

from domain.ashrae import ASHRAEAirClass, ASHRAE_AIR_ENVELOPES_C, classify_rack_thermal_severity
from domain.electrical import calc_3phase_currents_and_imbalance, calc_pue
from domain.hydraulics_airflow import (
    calc_air_loop_delta_t_c,
    calc_fouling_health_and_penalty,
    calc_liquid_loop_delta_t_c,
    calc_thermal_runway_seconds,
    calc_vfd_affinity_power_kw,
)
from domain.psychrometrics import (
    calc_chiller_cop,
    calc_condensation_margin_c,
    calc_dewpoint_magnus_c,
    calc_waterside_economizer_share,
)
from models import Severity


def test_magnus_dewpoint_invariants_and_ashrae_reference():
    # At 100% RH, dew point equals dry-bulb temperature
    assert calc_dewpoint_magnus_c(22.0, 100.0) == pytest.approx(22.0, abs=0.05)

    # Standard ASHRAE Hall reference: 24.0°C dry-bulb @ 50% RH => ~12.9°C dew point
    dp = calc_dewpoint_magnus_c(24.0, 50.0)
    assert 12.7 <= dp <= 13.1

    # Physical invariant: dewpoint_c <= drybulb_c across entire operating grid
    for db_c in [15.0, 20.0, 25.0, 32.0, 40.0]:
        for rh_pct in [10.0, 35.0, 60.0, 85.0, 100.0]:
            assert calc_dewpoint_magnus_c(db_c, rh_pct) <= db_c

    # Condensation safety margin check
    assert calc_condensation_margin_c(coolant_supply_c=22.0, dewpoint_c=13.0) == 9.0
    assert calc_condensation_margin_c(coolant_supply_c=14.0, dewpoint_c=15.5) == -1.5


def test_chiller_cop_and_waterside_economizer_regimes():
    # Warmer supply water & cooler outdoor wet-bulb must strictly improve chiller COP
    cop_cool_weather_warm_water = calc_chiller_cop(outdoor_wetbulb_c=12.0, supply_water_c=24.0)
    cop_hot_weather_chilled_water = calc_chiller_cop(outdoor_wetbulb_c=27.0, supply_water_c=16.0)
    assert cop_cool_weather_warm_water > cop_hot_weather_chilled_water

    # Waterside economizer regime transitions
    regime_free, frac_free = calc_waterside_economizer_share(
        outdoor_wetbulb_c=11.0, approach_c=3.0, loop_supply_target_c=22.0, loop_return_temp_c=34.0
    )
    assert regime_free == "FULL_FREE_COOLING"
    assert frac_free == 1.0

    regime_part, frac_part = calc_waterside_economizer_share(
        outdoor_wetbulb_c=23.0, approach_c=3.0, loop_supply_target_c=22.0, loop_return_temp_c=34.0
    )
    assert regime_part == "PARTIAL_ECONOMIZER"
    assert 0.0 < frac_part < 1.0

    regime_mech, frac_mech = calc_waterside_economizer_share(
        outdoor_wetbulb_c=31.0, approach_c=3.5, loop_supply_target_c=20.0, loop_return_temp_c=30.0
    )
    assert regime_mech == "MECHANICAL_CHILLER"
    assert frac_mech == 0.0


def test_vfd_cubic_affinity_and_sensible_heat_balance():
    # Halving VFD fan speed (100% -> 50%) cuts dynamic shaft power by 8x (12.5%)
    p_full = calc_vfd_affinity_power_kw(speed_pct=100.0, rated_dynamic_kw=16.0, standby_kw=0.0)
    p_half = calc_vfd_affinity_power_kw(speed_pct=50.0, rated_dynamic_kw=16.0, standby_kw=0.0)
    assert p_full == pytest.approx(16.0, abs=0.05)
    assert p_half == pytest.approx(2.0, abs=0.05)

    # Liquid sensible dT decreases monotonically with higher coolant flow rate
    dt_low_flow = calc_liquid_loop_delta_t_c(heat_rejected_kw=65.0, flow_lpm=70.0)
    dt_high_flow = calc_liquid_loop_delta_t_c(heat_rejected_kw=65.0, flow_lpm=120.0)
    assert dt_low_flow > dt_high_flow > 0.0

    # Air sensible dT decreases monotonically with higher CFM
    assert calc_air_loop_delta_t_c(20.0, 2000.0) > calc_air_loop_delta_t_c(20.0, 3500.0)

    # Thermal capacitance ride-through seconds: C_th * (T_sla - T_now) / Q_kw
    runway_s = calc_thermal_runway_seconds(
        c_th_kj_per_c=1200.0, current_temp_c=21.0, sla_limit_c=27.0, net_uncooled_heat_kw=120.0
    )
    assert runway_s == pytest.approx(60.0, abs=0.2)
    assert calc_thermal_runway_seconds(1200.0, 28.0, 27.0, 120.0) == 0.0

    # Fouling degradation increases wasted VFD kW
    clean = calc_fouling_health_and_penalty(450.0, 450.0, 10.0)
    fouled = calc_fouling_health_and_penalty(340.0, 450.0, 10.0)
    assert clean["health_pct"] == 100.0
    assert clean["wasted_vfd_kw"] == 0.0
    assert fouled["health_pct"] < clean["health_pct"]
    assert fouled["wasted_vfd_kw"] > 0.0


def test_3phase_phasor_neutral_current_and_first_law_pue():
    # Perfectly balanced 3-phase load has 0.0A neutral current and 0% imbalance
    bal = calc_3phase_currents_and_imbalance(
        active_power_kw=300.0,
        rated_capacity_kw=500.0,
        voltage_ll_v=415.0,
        power_factor=0.97,
        phase_weights=(1.0, 1.0, 1.0),
    )
    assert bal.neutral_amps == 0.0
    assert bal.phase_imbalance_pct == 0.0
    assert bal.usable_continuous_spare_kw == pytest.approx(500.0 * 0.80 - 300.0, abs=0.2)

    # Skewed single-phase whip allocation creates non-zero neutral current and stranded kW
    skewed = calc_3phase_currents_and_imbalance(
        active_power_kw=300.0,
        rated_capacity_kw=500.0,
        voltage_ll_v=415.0,
        power_factor=0.97,
        phase_weights=(1.28, 0.90, 0.82),
    )
    assert skewed.neutral_amps > 50.0
    assert skewed.phase_imbalance_pct > 20.0
    assert skewed.usable_continuous_spare_kw < bal.usable_continuous_spare_kw

    # First-Law Thermodynamic PUE invariant: PUE >= 1.0 always
    assert calc_pue(total_facility_power_kw=1250.0, total_it_power_kw=1000.0) == 1.25
    assert calc_pue(total_facility_power_kw=800.0, total_it_power_kw=1000.0) == 1.0


def test_ashrae_envelope_classification():
    rec_min, rec_max, _, _ = ASHRAE_AIR_ENVELOPES_C[ASHRAEAirClass.A1]
    assert (rec_min, rec_max) == (18.0, 27.0)
    assert classify_rack_thermal_severity(inlet_temp_c=21.0, chip_temp_c=58.0) == Severity.NORMAL
    assert classify_rack_thermal_severity(inlet_temp_c=27.4, chip_temp_c=62.0) == Severity.WARNING
    assert classify_rack_thermal_severity(inlet_temp_c=30.1, chip_temp_c=62.0) == Severity.CRITICAL
