"""
Psychrometric & Chiller Plant Thermodynamic Primitives.

Covers:
- Magnus-Tetens dew-point temperature calculation from Dry-Bulb (°C) and Relative Humidity (%)
- Liquid manifold condensation safety margin
- Central chiller plant Coefficient of Performance (COP) vs. outdoor wet-bulb & part-load ratio
- Waterside free-cooling economizer regime and heat-rejection share
"""

from __future__ import annotations
import math
from typing import Tuple


def calc_dewpoint_magnus_c(drybulb_c: float, relative_humidity_pct: float) -> float:
    """
    Calculate air dew-point temperature (°C) using the ASHRAE / Alduchov-Eskridge Magnus-Tetens equation.
    Invariant: `dewpoint_c <= drybulb_c` for all valid `relative_humidity_pct <= 100`.
    """
    rh_clamped = max(1.0, min(100.0, float(relative_humidity_pct)))
    a = 17.625
    b = 243.04
    gamma = math.log(rh_clamped / 100.0) + (a * drybulb_c) / (b + drybulb_c)
    dewpoint = (b * gamma) / (a - gamma)
    return round(min(dewpoint, drybulb_c), 2)


def calc_condensation_margin_c(coolant_supply_c: float, dewpoint_c: float) -> float:
    """
    Degrees Celsius above space dew point. ASHRAE TC 9.9 recommends >= +2.0°C to +3.0°C
    margin to prevent moisture condensation ("sweating") on uninsulated QDC manifolds.
    """
    return round(float(coolant_supply_c - dewpoint_c), 2)


def calc_chiller_cop(
    outdoor_wetbulb_c: float,
    supply_water_c: float = 18.0,
    part_load_ratio: float = 0.72,
) -> float:
    """
    Non-linear central chiller + cooling tower plant Coefficient of Performance (COP).
    Higher supply water temperature (warm-water cooling) and lower outdoor wet-bulb lift COP.
    """
    plr = max(0.15, min(1.15, float(part_load_ratio)))
    lift_c = max(6.0, (outdoor_wetbulb_c + 4.5) - (supply_water_c - 6.0))
    # Carnot-inspired empirical chiller curve with variable-speed centrifugal PLR peak near 0.68
    plr_efficiency_factor = 1.0 - 0.35 * ((plr - 0.68) ** 2)
    cop = (28.5 / lift_c + 2.45) * plr_efficiency_factor
    return round(max(2.2, min(16.0, cop)), 2)


def calc_waterside_economizer_share(
    outdoor_wetbulb_c: float,
    approach_c: float,
    loop_supply_target_c: float,
    loop_return_temp_c: float,
) -> Tuple[str, float]:
    """
    Classify waterside plate-and-frame economizer operating regime and free-cooling fraction [0..1].

    Returns:
        (regime, free_cooling_fraction)
        where regime is `"FULL_FREE_COOLING" | "PARTIAL_ECONOMIZER" | "MECHANICAL_CHILLER"`.
    """
    min_tower_supply_c = outdoor_wetbulb_c + max(1.0, approach_c)
    if min_tower_supply_c <= loop_supply_target_c:
        return "FULL_FREE_COOLING", 1.0

    usable_ceiling_c = loop_return_temp_c - 1.0
    if min_tower_supply_c <= usable_ceiling_c and loop_return_temp_c > loop_supply_target_c:
        frac = (loop_return_temp_c - min_tower_supply_c) / max(0.5, loop_return_temp_c - loop_supply_target_c)
        return "PARTIAL_ECONOMIZER", round(max(0.05, min(0.95, frac)), 3)

    return "MECHANICAL_CHILLER", 0.0
