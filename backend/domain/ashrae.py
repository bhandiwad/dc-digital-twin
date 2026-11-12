"""
ASHRAE TC 9.9 Thermal & Liquid Cooling Envelope Reference Primitives.
"""

from __future__ import annotations
from enum import Enum
from typing import Dict, Tuple
from models import Severity


class ASHRAEAirClass(str, Enum):
    A1 = "A1"  # Recommended 18–27°C, Allowable 15–32°C (Enterprise & AI Servers)
    A2 = "A2"  # Recommended 18–27°C, Allowable 10–35°C
    A3 = "A3"  # Allowable 5–40°C
    A4 = "A4"  # Allowable 5–45°C


class ASHRAELiquidClass(str, Enum):
    W1 = "W1"  # Facility Supply 2–17°C (Chilled water required)
    W2 = "W2"  # Facility Supply 2–27°C (Warm-water economizer compatible)
    W3 = "W3"  # Facility Supply 2–32°C (Year-round free cooling)
    W4 = "W4"  # Facility Supply 2–45°C (Dry cooler / tower only)


# (recommended_min_c, recommended_max_c, allowable_min_c, allowable_max_c)
ASHRAE_AIR_ENVELOPES_C: Dict[ASHRAEAirClass, Tuple[float, float, float, float]] = {
    ASHRAEAirClass.A1: (18.0, 27.0, 15.0, 32.0),
    ASHRAEAirClass.A2: (18.0, 27.0, 10.0, 35.0),
    ASHRAEAirClass.A3: (18.0, 27.0, 5.0, 40.0),
    ASHRAEAirClass.A4: (18.0, 27.0, 5.0, 45.0),
}

ASHRAE_LIQUID_MAX_SUPPLY_C: Dict[ASHRAELiquidClass, float] = {
    ASHRAELiquidClass.W1: 17.0,
    ASHRAELiquidClass.W2: 27.0,
    ASHRAELiquidClass.W3: 32.0,
    ASHRAELiquidClass.W4: 45.0,
}


def classify_rack_thermal_severity(
    inlet_temp_c: float,
    chip_temp_c: float,
    has_recirc_fault: bool = False,
    inlet_sla_max_c: float = 27.0,
    inlet_critical_c: float = 29.5,
    chip_warning_c: float = 70.0,
    chip_critical_c: float = 78.0,
) -> Severity:
    """Classify rack status strictly against ASHRAE cold-aisle and silicon thermal limits."""
    if chip_temp_c >= chip_critical_c or inlet_temp_c >= inlet_critical_c:
        return Severity.CRITICAL
    if chip_temp_c >= chip_warning_c or inlet_temp_c >= inlet_sla_max_c or has_recirc_fault:
        return Severity.WARNING
    if chip_temp_c >= (chip_warning_c - 5.0) or inlet_temp_c >= (inlet_sla_max_c - 2.0):
        return Severity.ADVISORY
    return Severity.NORMAL
