"""
Declarative Site Blueprint Configuration Loader (`configs/sites/*.yaml`).

Eliminates hardcoded asset IDs, row counts, utility tariffs, and ASHRAE thresholds from
Python logic so customer facilities of any size or topology can be onboarded purely via YAML.
"""

from __future__ import annotations
import os
from typing import List, Optional
import yaml
from pydantic import BaseModel, Field

from models import CoolingType, WorkloadClass, Position3D


class AmbientDefaultsConfig(BaseModel):
    outdoor_wetbulb_c: float = 19.5
    outdoor_drybulb_c: float = 26.8
    hall_relative_humidity_pct: float = 45.0


class ASHRAELimitsConfig(BaseModel):
    air_inlet_recommend_max_c: float = 27.0
    air_inlet_allowable_max_c: float = 32.0
    chip_warning_c: float = 70.0
    chip_throttle_c: float = 78.0
    chip_critical_max_c: float = 85.0
    liquid_return_sla_max_c: float = 40.0
    dewpoint_safety_margin_c: float = 2.5


class SiteEconomicsConfig(BaseModel):
    utility_transformer_limit_kw: float = 1600.0
    blended_electricity_usd_per_kwh: float = 0.115
    off_peak_usd_per_kwh: float = 0.068
    shoulder_usd_per_kwh: float = 0.115
    peak_tou_usd_per_kwh: float = 0.185
    critical_dr_usd_per_kwh: float = 0.285
    monthly_demand_charge_usd_per_kw: float = 22.50
    tier_iii_capex_usd_per_kw: float = 8500.0
    legacy_baseline_pue: float = 1.345
    wue_evap_factor_l_per_kwh: float = 1.45
    grid_carbon_g_per_kwh_default: float = 310.0


class UPSUnitConfig(BaseModel):
    ups_id: str
    name: str
    rated_capacity_kw: float = 1600.0


class CRACUnitConfig(BaseModel):
    crac_id: str
    name: str
    served_rows: List[str]
    position: Position3D
    supply_air_setpoint_c: float = 18.0
    initial_fan_speed_pct: float = 72.0
    cooling_capacity_kw: float = 280.0
    max_airflow_cfm: float = 36000.0


class CDUUnitConfig(BaseModel):
    cdu_id: str
    name: str
    served_rows: List[str]
    position: Position3D
    supply_temp_setpoint_c: float = 24.0
    initial_pump_speed_pct: float = 80.0
    cooling_capacity_kw: float = 800.0
    max_flow_lpm: float = 560.0


class RowBlueprintConfig(BaseModel):
    row_id: str
    pdu_id: str
    ups_id: str
    pdu_rated_kw: float
    z_pos: float
    rack_count: int = Field(default=8, ge=1, le=32)
    cooling_type: CoolingType
    workload_class: WorkloadClass
    rack_max_kw: float
    gpus_per_rack: int = 0
    nominal_r_th_c_per_kw: float = 0.05
    nominal_c_th_kj_per_c: float = 600.0


class SiteBlueprintConfig(BaseModel):
    site_id: str
    site_name: str
    ambient_defaults: AmbientDefaultsConfig = Field(default_factory=AmbientDefaultsConfig)
    ashrae_limits: ASHRAELimitsConfig = Field(default_factory=ASHRAELimitsConfig)
    economics: SiteEconomicsConfig = Field(default_factory=SiteEconomicsConfig)
    ups_units: List[UPSUnitConfig]
    crac_units: List[CRACUnitConfig]
    cdu_units: List[CDUUnitConfig] = Field(default_factory=list)
    rows: List[RowBlueprintConfig]


DEFAULT_SITE_YAML = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "configs", "sites", "default_hall.yaml")
)


def load_site_blueprint(config_path: Optional[str] = None) -> SiteBlueprintConfig:
    """Load and validate a YAML facility blueprint (defaults to `DCTWIN_SITE_CONFIG` or `default_hall.yaml`)."""
    resolved = config_path or os.environ.get("DCTWIN_SITE_CONFIG") or DEFAULT_SITE_YAML
    with open(resolved, "r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return SiteBlueprintConfig.model_validate(raw)
