"""
Hardware & Telemetry Adapter Layer (`backend/adapters/`).

Decouples field BMS/EPMS protocols (BACnet/IP, Modbus TCP, SNMPv3, MQTT Sparkplug B) from the
Digital Twin physics & control services. Supports ASHRAE 135 16-level BACnet Priority Arrays
(`Priority 8` supervisory AI write-back with safe `NULL` relinquishment to `Priority 16` local PID).
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

from simulator import DataHallTwinEngine


class BaseTelemetryAdapter(ABC):
    """Contract implemented by both `SimulatedTwinAdapter` (dev/CI) and real field gateway drivers."""

    @abstractmethod
    def read_facility_points(self) -> Dict[str, Any]:
        """Return latest normalized BMS/EPMS register snapshot."""

    @abstractmethod
    def write_setpoint(
        self, asset_id: str, point_name: str, value: float, bacnet_priority: int = 8
    ) -> Dict[str, Any]:
        """Write a clamped supervisory setpoint at the given BACnet priority level (default 8)."""

    @abstractmethod
    def relinquish_setpoint(
        self, asset_id: str, point_name: str, bacnet_priority: int = 8
    ) -> Dict[str, Any]:
        """Write `NULL` to `bacnet_priority` so local controller falls back to `Priority 16` PID."""


class SimulatedTwinAdapter(BaseTelemetryAdapter):
    """In-memory adapter backed by `DataHallTwinEngine` with explicit BACnet Priority 8/16 state."""

    def __init__(self, engine: DataHallTwinEngine) -> None:
        self.engine = engine
        self.priority_arrays: Dict[str, Dict[int, Optional[float]]] = {}
        self._seed_defaults()

    def _seed_defaults(self) -> None:
        for cid, crac in self.engine.cracs.items():
            self.priority_arrays[f"{cid}:supply_air_setpoint_c"] = {
                8: None,
                16: crac.supply_air_setpoint_c,
            }
        for cdu_id, cdu in self.engine.cdus.items():
            self.priority_arrays[f"{cdu_id}:supply_temp_setpoint_c"] = {
                8: None,
                16: cdu.supply_temp_setpoint_c,
            }

    def _resolve_effective(self, key: str, fallback: float) -> float:
        arr = self.priority_arrays.get(key, {})
        for prio in sorted(arr.keys()):
            val = arr[prio]
            if val is not None:
                return val
        return fallback

    def read_facility_points(self) -> Dict[str, Any]:
        m = self.engine.history[-1]
        return {
            "site_id": self.engine.site_config.site_id,
            "pue": m.pue,
            "total_facility_power_kw": m.total_facility_power_kw,
            "cracs": {cid: c.supply_air_temp_c for cid, c in self.engine.cracs.items()},
            "cdus": {cid: c.supply_temp_c for cid, c in self.engine.cdus.items()},
            "pdus_kw": {pid: p.current_load_kw for pid, p in self.engine.pdus.items()},
        }

    def write_setpoint(
        self, asset_id: str, point_name: str, value: float, bacnet_priority: int = 8
    ) -> Dict[str, Any]:
        key = f"{asset_id}:{point_name}"
        if asset_id in self.engine.cracs and point_name == "supply_air_setpoint_c":
            clamped = max(16.0, min(22.5, float(value)))
            self.priority_arrays.setdefault(key, {16: 18.0})[bacnet_priority] = clamped
            eff = self._resolve_effective(key, clamped)
            self.engine.cracs[asset_id].supply_air_setpoint_c = eff
        elif asset_id in self.engine.cdus and point_name == "supply_temp_setpoint_c":
            clamped = max(20.0, min(27.0, float(value)))
            self.priority_arrays.setdefault(key, {16: 24.0})[bacnet_priority] = clamped
            eff = self._resolve_effective(key, clamped)
            self.engine.cdus[asset_id].supply_temp_setpoint_c = eff
        else:
            raise KeyError(f"Unsupported facility write-back point `{key}`")

        return {"point": key, "written_priority": bacnet_priority, "effective_value": eff}

    def relinquish_setpoint(
        self, asset_id: str, point_name: str, bacnet_priority: int = 8
    ) -> Dict[str, Any]:
        key = f"{asset_id}:{point_name}"
        arr = self.priority_arrays.setdefault(key, {16: 18.0})
        arr[bacnet_priority] = None
        eff = self._resolve_effective(key, arr.get(16) or 18.0)

        if asset_id in self.engine.cracs and point_name == "supply_air_setpoint_c":
            self.engine.cracs[asset_id].supply_air_setpoint_c = eff
        elif asset_id in self.engine.cdus and point_name == "supply_temp_setpoint_c":
            self.engine.cdus[asset_id].supply_temp_setpoint_c = eff

        return {"point": key, "relinquished_priority": bacnet_priority, "effective_value": eff}
