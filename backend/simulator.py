"""
Config-Driven, Physics-Informed Data Center Digital Twin Engine.

Loads facility topology, equipment ratings, ASHRAE limits, and site economics from a
declarative `SiteBlueprintConfig` YAML (`configs/sites/*.yaml`) and executes coupled
electro-thermal & hydraulic dynamics using `backend/domain/` physics primitives.
"""

from __future__ import annotations
import copy
import math
import time
from typing import Any, Dict, List, Optional
import networkx as nx
import numpy as np

from config_loader import SiteBlueprintConfig, load_site_blueprint
from domain import (
    calc_air_loop_delta_t_c,
    calc_liquid_loop_delta_t_c,
    calc_pue,
    calc_vfd_affinity_power_kw,
    classify_rack_thermal_severity,
)
from models import (
    CDUTelemetry,
    CRACTelemetry,
    CoolingType,
    FacilityMetrics,
    PDUTelemetry,
    Position3D,
    RackElevationResponse,
    RackSpec,
    RackTelemetry,
    ServerNodeTelemetry,
    Severity,
    TopologyEdge,
    UChassisType,
    UPSTelemetry,
)


class DataHallTwinEngine:
    def __init__(
        self,
        config_path: Optional[str] = None,
        site_config: Optional[SiteBlueprintConfig] = None,
    ) -> None:
        self.site_config: SiteBlueprintConfig = site_config or load_site_blueprint(config_path)
        self.rng = np.random.default_rng(42)
        self.sim_step: int = 0
        self.start_time: float = time.time()
        self.outdoor_wetbulb_c: float = self.site_config.ambient_defaults.outdoor_wetbulb_c
        self.outdoor_drybulb_c: float = self.site_config.ambient_defaults.outdoor_drybulb_c
        self.hall_relative_humidity_pct: float = self.site_config.ambient_defaults.hall_relative_humidity_pct
        self.auto_optimize: bool = False
        self.active_scenarios: List[str] = ["normal"]

        # Dynamic scenario modifiers keyed by configured IDs (zero hardcoded row/CDU names)
        self.row_load_boost_kw: Dict[str, float] = {r.row_id: 0.0 for r in self.site_config.rows}
        self.rack_recirc_fault: Dict[str, float] = {}
        self.cdu_fouling_factor: Dict[str, float] = {c.cdu_id: 1.0 for c in self.site_config.cdu_units}
        self.crac_max_cfm_map: Dict[str, float] = {c.crac_id: c.max_airflow_cfm for c in self.site_config.crac_units}
        self.cdu_max_lpm_map: Dict[str, float] = {c.cdu_id: c.max_flow_lpm for c in self.site_config.cdu_units}
        self.blade_overrides: Dict[str, Dict[str, Any]] = {}

        # Build topology & live telemetry state
        self.graph = nx.DiGraph()
        self.rack_specs: Dict[str, RackSpec] = {}
        self.racks: Dict[str, RackTelemetry] = {}
        self.cracs: Dict[str, CRACTelemetry] = {}
        self.cdus: Dict[str, CDUTelemetry] = {}
        self.pdus: Dict[str, PDUTelemetry] = {}
        self.ups_units: Dict[str, UPSTelemetry] = {}
        self.history: List[FacilityMetrics] = []

        self._init_topology_from_blueprint()
        for _ in range(45):
            self.step(dt_sec=2.0)

    def _init_topology_from_blueprint(self) -> None:
        cfg = self.site_config

        # 1. UPS Modules
        for u_cfg in cfg.ups_units:
            self.ups_units[u_cfg.ups_id] = UPSTelemetry(
                ups_id=u_cfg.ups_id,
                name=u_cfg.name,
                rated_capacity_kw=u_cfg.rated_capacity_kw,
            )
            self.graph.add_node(u_cfg.ups_id, type="ups")

        # 2. CRAC Air Units
        for c_cfg in cfg.crac_units:
            self.cracs[c_cfg.crac_id] = CRACTelemetry(
                crac_id=c_cfg.crac_id,
                name=c_cfg.name,
                served_rows=list(c_cfg.served_rows),
                position=c_cfg.position,
                supply_air_setpoint_c=c_cfg.supply_air_setpoint_c,
                supply_air_temp_c=c_cfg.supply_air_setpoint_c,
                fan_speed_pct=c_cfg.initial_fan_speed_pct,
                cooling_capacity_kw=c_cfg.cooling_capacity_kw,
            )
            self.graph.add_node(c_cfg.crac_id, type="crac")

        # 3. Liquid CDUs
        for cdu_cfg in cfg.cdu_units:
            self.cdus[cdu_cfg.cdu_id] = CDUTelemetry(
                cdu_id=cdu_cfg.cdu_id,
                name=cdu_cfg.name,
                served_rows=list(cdu_cfg.served_rows),
                position=cdu_cfg.position,
                supply_temp_setpoint_c=cdu_cfg.supply_temp_setpoint_c,
                supply_temp_c=cdu_cfg.supply_temp_setpoint_c,
                pump_speed_pct=cdu_cfg.initial_pump_speed_pct,
                cooling_capacity_kw=cdu_cfg.cooling_capacity_kw,
            )
            self.graph.add_node(cdu_cfg.cdu_id, type="cdu")

        # 4. Rows, Row PDUs, and Racks
        for row_cfg in cfg.rows:
            self.pdus[row_cfg.pdu_id] = PDUTelemetry(
                pdu_id=row_cfg.pdu_id,
                name=f"{row_cfg.row_id} Power Distribution",
                row_id=row_cfg.row_id,
                ups_id=row_cfg.ups_id,
                position=Position3D(x=-11.5, y=1.1, z=row_cfg.z_pos),
                rated_capacity_kw=row_cfg.pdu_rated_kw,
            )
            self.graph.add_node(row_cfg.pdu_id, type="pdu", row_id=row_cfg.row_id)
            self.graph.add_edge(row_cfg.ups_id, row_cfg.pdu_id, layer="power", capacity_kw=row_cfg.pdu_rated_kw)

            row_suffix = row_cfg.row_id.split("-")[-1]
            cdu_id = next((c.cdu_id for c in cfg.cdu_units if row_cfg.row_id in c.served_rows), None)
            crac_zones = [c.crac_id for c in cfg.crac_units if row_cfg.row_id in c.served_rows]

            span_half = ((row_cfg.rack_count - 1) * 2.2) / 2.0
            for slot in range(1, row_cfg.rack_count + 1):
                rack_id = f"R-{row_suffix}{slot:02d}"
                x_pos = -span_half + (slot - 1) * 2.2
                pos = Position3D(x=round(x_pos, 2), y=1.0, z=row_cfg.z_pos)

                spec = RackSpec(
                    rack_id=rack_id,
                    row_id=row_cfg.row_id,
                    slot_index=slot,
                    name=f"Rack {row_suffix}{slot:02d} ({row_cfg.workload_class.value.replace('_', ' ').title()})",
                    cooling_type=row_cfg.cooling_type,
                    workload_class=row_cfg.workload_class,
                    max_power_kw=row_cfg.rack_max_kw,
                    gpu_count=row_cfg.gpus_per_rack,
                    pdu_id=row_cfg.pdu_id,
                    cdu_id=cdu_id,
                    crac_zone_ids=crac_zones,
                    position=pos,
                )
                self.rack_specs[rack_id] = spec

                is_liq = row_cfg.cooling_type == CoolingType.HYBRID_LIQUID
                base_util = 58.0 + 14.0 * math.sin(slot * 0.6) if is_liq else 46.0 + 10.0 * math.cos(slot * 0.5)
                init_power = row_cfg.rack_max_kw * (0.15 + 0.85 * (base_util / 100.0))

                self.racks[rack_id] = RackTelemetry(
                    rack_id=rack_id,
                    row_id=row_cfg.row_id,
                    name=spec.name,
                    cooling_type=row_cfg.cooling_type,
                    workload_class=row_cfg.workload_class,
                    max_power_kw=row_cfg.rack_max_kw,
                    gpu_count=row_cfg.gpus_per_rack,
                    pdu_id=row_cfg.pdu_id,
                    cdu_id=cdu_id,
                    position=pos,
                    it_utilization_pct=round(base_util, 1),
                    power_kw=round(init_power, 2),
                    air_power_kw=round(init_power * (0.25 if cdu_id else 1.0), 2),
                    liquid_power_kw=round(init_power * (0.75 if cdu_id else 0.0), 2),
                    inlet_temp_c=19.5,
                    outlet_temp_c=31.0,
                    chip_temp_c=56.0 if cdu_id else 51.0,
                    coolant_supply_temp_c=24.0 if cdu_id else None,
                    coolant_return_temp_c=35.0 if cdu_id else None,
                    coolant_flow_lpm=42.0 if cdu_id else None,
                    airflow_cfm=1600.0 if not cdu_id else 950.0,
                    fan_power_kw=0.8,
                    thermal_margin_c=28.0,
                )

                self.graph.add_node(rack_id, type="rack", row_id=row_cfg.row_id)
                self.graph.add_edge(row_cfg.pdu_id, rack_id, layer="power", capacity_kw=row_cfg.rack_max_kw)
                for cid in crac_zones:
                    self.graph.add_edge(cid, rack_id, layer="air_cooling", capacity_kw=row_cfg.rack_max_kw)
                if cdu_id:
                    self.graph.add_edge(cdu_id, rack_id, layer="liquid_cooling", capacity_kw=row_cfg.rack_max_kw * 0.8)

    # --- Topology Query Helpers (Use these instead of hardcoding asset IDs!) ---

    def get_racks_for_rows(self, row_ids: List[str]) -> List[RackTelemetry]:
        row_set = set(row_ids)
        return [r for r in self.racks.values() if r.row_id in row_set]

    def get_downstream_racks(self, asset_id: str) -> List[RackTelemetry]:
        """Traverse `self.graph` outgoing edges (1 or 2 hops, e.g. UPS -> PDU -> Rack) to find served racks."""
        if asset_id not in self.graph:
            return []
        found: Dict[str, RackTelemetry] = {}
        for _, target in self.graph.out_edges(asset_id):
            if target in self.racks:
                found[target] = self.racks[target]
            elif target in self.pdus:
                for _, rk_id in self.graph.out_edges(target):
                    if rk_id in self.racks:
                        found[rk_id] = self.racks[rk_id]
        return [found[k] for k in sorted(found.keys())]

    def get_topology_edges(self) -> List[TopologyEdge]:
        edges: List[TopologyEdge] = []
        for u, v, data in self.graph.edges(data=True):
            layer = data.get("layer", "power")
            cap = float(data.get("capacity_kw", 100.0))
            flow = 0.0
            if v in self.racks:
                rk = self.racks[v]
                if layer == "power":
                    flow = rk.power_kw
                elif layer == "air_cooling":
                    peer_count = max(1, len(self.rack_specs[v].crac_zone_ids))
                    flow = rk.air_power_kw / peer_count
                elif layer == "liquid_cooling":
                    flow = rk.liquid_power_kw
            elif v in self.pdus:
                flow = self.pdus[v].current_load_kw
            edges.append(
                TopologyEdge(
                    source=u,
                    target=v,
                    layer=layer,
                    capacity_kw=round(cap, 1),
                    current_flow_kw=round(flow, 2),
                )
            )
        return edges

    def trigger_scenario(self, scenario_id: str) -> None:
        cfg = self.site_config
        if scenario_id == "normal":
            self.active_scenarios = ["normal"]
            self.row_load_boost_kw = {k: 0.0 for k in self.row_load_boost_kw}
            self.rack_recirc_fault.clear()
            self.cdu_fouling_factor = {c.cdu_id: 1.0 for c in cfg.cdu_units}
            self.outdoor_wetbulb_c = cfg.ambient_defaults.outdoor_wetbulb_c
            self.outdoor_drybulb_c = cfg.ambient_defaults.outdoor_drybulb_c
            for crac_cfg in cfg.crac_units:
                crac = self.cracs[crac_cfg.crac_id]
                crac.enabled = True
                crac.fan_speed_pct = crac_cfg.initial_fan_speed_pct
                crac.supply_air_setpoint_c = crac_cfg.supply_air_setpoint_c
            for cdu_cfg in cfg.cdu_units:
                cdu = self.cdus[cdu_cfg.cdu_id]
                cdu.enabled = True
                cdu.pump_speed_pct = cdu_cfg.initial_pump_speed_pct
                cdu.supply_temp_setpoint_c = cdu_cfg.supply_temp_setpoint_c
            return

        if "normal" in self.active_scenarios:
            self.active_scenarios.remove("normal")
        if scenario_id not in self.active_scenarios:
            self.active_scenarios.append(scenario_id)

        liquid_rows = [r.row_id for r in cfg.rows if r.cooling_type == CoolingType.HYBRID_LIQUID]
        crac_ids = list(self.cracs.keys())
        cdu_ids = list(self.cdus.keys())

        if scenario_id == "gpu_burst_row_c" and liquid_rows:
            target_row = "ROW-C" if "ROW-C" in self.row_load_boost_kw else liquid_rows[0]
            self.row_load_boost_kw[target_row] = 18.0
        elif scenario_id == "crac_2_fail" and crac_ids:
            target_crac = "CRAC-2" if "CRAC-2" in self.cracs else crac_ids[min(1, len(crac_ids) - 1)]
            self.cracs[target_crac].enabled = False
            self.cracs[target_crac].fan_speed_pct = 0.0
        elif scenario_id == "cdu_1_fouling" and cdu_ids:
            target_cdu = "CDU-1" if "CDU-1" in self.cdus else cdu_ids[0]
            self.cdu_fouling_factor[target_cdu] = 0.58
            self.cdus[target_cdu].pump_speed_pct = 48.0
        elif scenario_id == "heatwave":
            self.outdoor_wetbulb_c = 28.5
            self.outdoor_drybulb_c = 39.2
        elif scenario_id == "hot_aisle_recirc":
            preferred = [rid for rid in ("R-B06", "R-B07", "R-C05", "R-C06") if rid in self.racks]
            targets = preferred or list(self.racks.keys())[-3:]
            for rid in targets:
                self.rack_recirc_fault[rid] = 6.5

    def step(self, dt_sec: float = 2.0) -> FacilityMetrics:
        self.sim_step += 1
        t = self.sim_step * dt_sec
        limits = self.site_config.ashrae_limits
        econ = self.site_config.economics

        if self.auto_optimize:
            self._apply_autopilot_control()

        # 1. Update CRAC supply temperatures & VFD cubic affinity power
        for crac_id, crac in self.cracs.items():
            max_cfm = self.crac_max_cfm_map.get(crac_id, 36000.0)
            if not crac.enabled or crac.fan_speed_pct <= 5.0:
                crac.airflow_cfm = 0.0
                crac.power_kw = 0.4
                crac.supply_air_temp_c += (26.5 - crac.supply_air_temp_c) * 0.25
                crac.thermal_load_kw = 0.0
                crac.status = Severity.CRITICAL
            else:
                noise = float(self.rng.normal(0.0, 0.05))
                crac.supply_air_temp_c += (crac.supply_air_setpoint_c - crac.supply_air_temp_c) * 0.35 + noise
                crac.airflow_cfm = max_cfm * (crac.fan_speed_pct / 100.0)
                crac.power_kw = calc_vfd_affinity_power_kw(
                    speed_pct=crac.fan_speed_pct,
                    rated_dynamic_kw=28.0,
                    standby_kw=3.2,
                    exponent=3.0,
                )
                crac.status = Severity.NORMAL

        # 2. Update CDU liquid supply temperatures, flow rates & VFD pump power
        for cdu_id, cdu in self.cdus.items():
            fouling = self.cdu_fouling_factor.get(cdu_id, 1.0)
            max_lpm = self.cdu_max_lpm_map.get(cdu_id, 560.0)
            if not cdu.enabled or cdu.pump_speed_pct <= 5.0:
                cdu.total_flow_lpm = 10.0
                cdu.power_kw = 0.5
                cdu.supply_temp_c += (32.0 - cdu.supply_temp_c) * 0.2
                cdu.status = Severity.CRITICAL
            else:
                noise = float(self.rng.normal(0.0, 0.04))
                effective_setpoint = cdu.supply_temp_setpoint_c + (1.0 - fouling) * 6.5
                cdu.supply_temp_c += (effective_setpoint - cdu.supply_temp_c) * 0.35 + noise
                cdu.total_flow_lpm = round(max_lpm * (cdu.pump_speed_pct / 100.0) * fouling, 1)
                cdu.pressure_kpa = round(220.0 * ((cdu.pump_speed_pct / 100.0) ** 1.8) / max(fouling, 0.4), 1)
                cdu.power_kw = calc_vfd_affinity_power_kw(
                    speed_pct=cdu.pump_speed_pct,
                    rated_dynamic_kw=18.5,
                    standby_kw=2.0,
                    exponent=2.8,
                )
                cdu.status = Severity.WARNING if fouling < 0.8 else Severity.NORMAL

        # 3. Update Rack IT Loads, Power, and Coupled Air/Liquid Thermal Dynamics
        row_air_heat: Dict[str, float] = {r.row_id: 0.0 for r in self.site_config.rows}
        cdu_liquid_heat: Dict[str, float] = {c.cdu_id: 0.0 for c in self.site_config.cdu_units}

        for rack_id, rk in self.racks.items():
            spec = self.rack_specs[rack_id]
            slot = spec.slot_index
            is_liq = rk.cooling_type == CoolingType.HYBRID_LIQUID

            phase = slot * 0.55 + (1.4 if is_liq else 0.0)
            wave = 8.0 * math.sin(t * 0.035 + phase) + 4.5 * math.cos(t * 0.09 - slot)
            base_target = 64.0 if is_liq else 48.0
            boost_kw = self.row_load_boost_kw.get(rk.row_id, 0.0)
            boost_util = (boost_kw / rk.max_power_kw) * 100.0

            target_util = np.clip(
                base_target + wave + boost_util + float(self.rng.normal(0.0, 1.8)),
                12.0,
                99.5,
            )
            rk.it_utilization_pct = round(0.72 * rk.it_utilization_pct + 0.28 * float(target_util), 1)
            compute_kw = rk.max_power_kw * (0.14 + 0.82 * (rk.it_utilization_pct / 100.0))

            served_cracs = [self.cracs[cid] for cid in spec.crac_zone_ids if cid in self.cracs]
            active_cracs = [c for c in served_cracs if c.enabled and c.airflow_cfm > 1000]
            if not active_cracs:
                supply_air_c = 27.5
                total_zone_cfm = 2000.0
            else:
                weights = [(c.airflow_cfm / (abs(rk.position.x - c.position.x) + 2.0), c.supply_air_temp_c) for c in active_cracs]
                w_sum = sum(w for w, _ in weights)
                supply_air_c = sum(w * temp for w, temp in weights) / max(w_sum, 1e-3)
                total_zone_cfm = sum(c.airflow_cfm for c in active_cracs)

            row_cfg = next((rc for rc in self.site_config.rows if rc.row_id == rk.row_id), None)
            row_len = row_cfg.rack_count if row_cfg else 8
            edge_recirc = 0.85 if slot in (1, row_len) else 0.25
            nominal_zone_cfm = max(24000.0, 21000.0 * len(served_cracs))
            airflow_deficit_c = max(0.0, (nominal_zone_cfm - total_zone_cfm) / 8000.0) * (1.2 + 0.15 * slot)
            fault_recirc_c = self.rack_recirc_fault.get(rack_id, 0.0)

            target_inlet_c = (
                supply_air_c
                + edge_recirc
                + airflow_deficit_c
                + fault_recirc_c
                + 0.025 * compute_kw
                + float(self.rng.normal(0.0, 0.08))
            )
            rk.inlet_temp_c = round(0.68 * rk.inlet_temp_c + 0.32 * target_inlet_c, 2)

            temp_drive = max(0.0, (rk.inlet_temp_c - 18.0) / 12.0)
            fan_fraction = float(np.clip(0.35 + 0.50 * (rk.it_utilization_pct / 100.0) + 0.35 * temp_drive, 0.30, 1.0))
            max_fan_kw = 1.6 if rk.cooling_type == CoolingType.AIR else 2.4
            rk.fan_power_kw = round(max_fan_kw * (fan_fraction ** 3), 2)
            rk.power_kw = round(compute_kw + rk.fan_power_kw, 2)

            if is_liq and rk.cdu_id and rk.cdu_id in self.cdus:
                cdu = self.cdus[rk.cdu_id]
                fouling = self.cdu_fouling_factor.get(rk.cdu_id, 1.0)
                cdu_served_racks = max(1, len(self.get_downstream_racks(rk.cdu_id)))
                liquid_capture_ratio = 0.76 * min(1.0, (cdu.total_flow_lpm / max(120.0, 45.0 * cdu_served_racks)))
                rk.liquid_power_kw = round(rk.power_kw * liquid_capture_ratio, 2)
                rk.air_power_kw = round(rk.power_kw - rk.liquid_power_kw, 2)

                rack_flow_lpm = max(
                    8.0,
                    (cdu.total_flow_lpm / cdu_served_racks) * (0.92 + 0.16 * (rk.power_kw / rk.max_power_kw)),
                )
                rk.coolant_flow_lpm = round(rack_flow_lpm, 1)
                rk.coolant_supply_temp_c = round(cdu.supply_temp_c, 2)
                delta_t_liquid = calc_liquid_loop_delta_t_c(rk.liquid_power_kw, rack_flow_lpm)
                rk.coolant_return_temp_c = round(rk.coolant_supply_temp_c + delta_t_liquid, 2)

                rk.airflow_cfm = round(1350.0 * fan_fraction, 0)
                delta_t_air = calc_air_loop_delta_t_c(rk.air_power_kw, max(250.0, rk.airflow_cfm))
                rk.outlet_temp_c = round(rk.inlet_temp_c + delta_t_air, 2)

                r_th_chip = 0.34 / max(fouling, 0.45)
                target_chip_c = (
                    rk.coolant_supply_temp_c
                    + 8.5
                    + r_th_chip * rk.power_kw
                    + 0.25 * max(0.0, rk.inlet_temp_c - 20.0)
                )
                rk.chip_temp_c = round(0.65 * rk.chip_temp_c + 0.35 * target_chip_c, 2)
                cdu_liquid_heat[rk.cdu_id] += rk.liquid_power_kw
            else:
                rk.liquid_power_kw = 0.0
                rk.air_power_kw = rk.power_kw
                rk.coolant_supply_temp_c = None
                rk.coolant_return_temp_c = None
                rk.coolant_flow_lpm = None

                rk.airflow_cfm = round(2100.0 * fan_fraction, 0)
                delta_t_air = calc_air_loop_delta_t_c(rk.air_power_kw, max(300.0, rk.airflow_cfm))
                rk.outlet_temp_c = round(rk.inlet_temp_c + delta_t_air, 2)

                target_chip_c = rk.inlet_temp_c + 14.0 + 1.45 * rk.power_kw
                rk.chip_temp_c = round(0.65 * rk.chip_temp_c + 0.35 * target_chip_c, 2)

            row_air_heat[rk.row_id] = row_air_heat.get(rk.row_id, 0.0) + rk.air_power_kw

            inlet_margin = limits.air_inlet_allowable_max_c - rk.inlet_temp_c
            chip_margin = limits.chip_critical_max_c - rk.chip_temp_c
            rk.thermal_margin_c = round(min(inlet_margin * 2.2, chip_margin), 1)

            faults: List[str] = []
            if rk.inlet_temp_c >= 29.5:
                faults.append("High Inlet Air Temperature (ASHRAE A1 Exceeded)")
            elif rk.inlet_temp_c >= limits.air_inlet_recommend_max_c:
                faults.append("Elevated Cold-Aisle Inlet Temp")
            if rk.chip_temp_c >= limits.chip_throttle_c:
                faults.append("Silicon Junction Near Thermal Limit")
            if rack_id in self.rack_recirc_fault:
                faults.append("Hot-Aisle Containment Recirculation Detected")
            rk.active_faults = faults

            rk.status = classify_rack_thermal_severity(
                inlet_temp_c=rk.inlet_temp_c,
                chip_temp_c=rk.chip_temp_c,
                has_recirc_fault=bool(faults),
                inlet_sla_max_c=limits.air_inlet_recommend_max_c,
                inlet_critical_c=29.5,
                chip_warning_c=limits.chip_warning_c,
                chip_critical_c=limits.chip_throttle_c,
            )

        # 4. Dynamically roll up air heat to CRAC zones based on `served_rows`
        row_active_cfm: Dict[str, float] = {}
        for row_id in row_air_heat:
            row_active_cfm[row_id] = sum(
                c.airflow_cfm for c in self.cracs.values() if c.enabled and row_id in c.served_rows
            )

        for crac in self.cracs.values():
            if crac.enabled and crac.airflow_cfm > 0:
                captured_heat_kw = 0.0
                for r_id in crac.served_rows:
                    tot_cfm = row_active_cfm.get(r_id, 0.0)
                    if tot_cfm > 0:
                        captured_heat_kw += row_air_heat.get(r_id, 0.0) * (crac.airflow_cfm / tot_cfm)
                crac.thermal_load_kw = round(captured_heat_kw, 1)
                delta_air = calc_air_loop_delta_t_c(crac.thermal_load_kw, max(1000.0, crac.airflow_cfm))
                crac.return_air_temp_c = round(crac.supply_air_temp_c + delta_air, 2)
            else:
                crac.thermal_load_kw = 0.0
                crac.return_air_temp_c = 31.5

        for cdu_id, cdu in self.cdus.items():
            cdu.thermal_load_kw = round(cdu_liquid_heat.get(cdu_id, 0.0), 1)
            if cdu.total_flow_lpm > 1.0:
                cdu.return_temp_c = round(
                    cdu.supply_temp_c + calc_liquid_loop_delta_t_c(cdu.thermal_load_kw, cdu.total_flow_lpm), 2
                )

        # 5. Roll up electrical power to PDUs & UPS modules via topology bindings
        for pdu in self.pdus.values():
            row_racks = [r for r in self.racks.values() if r.pdu_id == pdu.pdu_id]
            it_sum = sum(r.power_kw for r in row_racks)
            pdu.loss_kw = round(it_sum * 0.018, 2)
            pdu.current_load_kw = round(it_sum + pdu.loss_kw, 2)
            pdu.load_pct = round((pdu.current_load_kw / pdu.rated_capacity_kw) * 100.0, 1)
            pdu.status = Severity.WARNING if pdu.load_pct > 85.0 else Severity.NORMAL

        for ups in self.ups_units.values():
            connected_pdus = [p for p in self.pdus.values() if p.ups_id == ups.ups_id]
            pdu_sum = sum(p.current_load_kw for p in connected_pdus)
            ups.loss_kw = round(pdu_sum * (1.0 - ups.efficiency_pct / 100.0), 2)
            ups.current_load_kw = round(pdu_sum + ups.loss_kw, 2)

        # 6. Central Chiller + Cooling Tower Plant & First-Law Facility PUE
        total_it_kw = sum(r.power_kw for r in self.racks.values())
        total_liquid_heat_kw = sum(c.thermal_load_kw for c in self.cdus.values())
        total_air_heat_kw = sum(c.thermal_load_kw for c in self.cracs.values())

        avg_crac_sp = float(np.mean([c.supply_air_setpoint_c for c in self.cracs.values() if c.enabled] or [18.0]))
        avg_cdu_sp = float(np.mean([c.supply_temp_setpoint_c for c in self.cdus.values() if c.enabled] or [24.0]))

        chiller_cop_air = max(2.2, 4.4 + 0.14 * (avg_crac_sp - 18.0) - 0.13 * (self.outdoor_wetbulb_c - 18.0))
        chiller_cop_liquid = max(3.5, 8.2 + 0.22 * (avg_cdu_sp - 24.0) - 0.16 * (self.outdoor_wetbulb_c - 18.0))

        for c in self.cracs.values():
            c.cop = round(chiller_cop_air, 2)

        chiller_air_kw = total_air_heat_kw / chiller_cop_air
        chiller_liquid_kw = total_liquid_heat_kw / chiller_cop_liquid
        crac_fan_kw = sum(c.power_kw for c in self.cracs.values())
        cdu_pump_kw = sum(c.power_kw for c in self.cdus.values())
        cooling_tower_aux_kw = 14.5 + 0.65 * max(0.0, self.outdoor_wetbulb_c - 16.0)

        total_cooling_kw = chiller_air_kw + chiller_liquid_kw + crac_fan_kw + cdu_pump_kw + cooling_tower_aux_kw
        total_power_loss_kw = (
            sum(p.loss_kw for p in self.pdus.values())
            + sum(u.loss_kw for u in self.ups_units.values())
            + 8.5
        )
        total_facility_kw = total_it_kw + total_cooling_kw + total_power_loss_kw
        pue = calc_pue(total_facility_kw, total_it_kw)

        inlet_temps = [r.inlet_temp_c for r in self.racks.values()]
        chip_temps = [r.chip_temp_c for r in self.racks.values()]
        max_inlet_rack = max(self.racks.values(), key=lambda r: r.inlet_temp_c)
        max_chip_rack = max(self.racks.values(), key=lambda r: r.chip_temp_c)

        alarms_count = sum(1 for r in self.racks.values() if r.status in (Severity.WARNING, Severity.CRITICAL))
        alarms_count += sum(1 for c in self.cracs.values() if c.status != Severity.NORMAL)
        alarms_count += sum(1 for c in self.cdus.values() if c.status != Severity.NORMAL)

        thermal_penalty = (
            max(0.0, (max_chip_rack.chip_temp_c - 66.0) * 1.8)
            + max(0.0, (max_inlet_rack.inlet_temp_c - 24.5) * 3.2)
        )
        health_score = float(np.clip(100.0 - thermal_penalty - alarms_count * 2.5, 18.0, 100.0))

        wue = 0.42 + 0.024 * max(0.0, self.outdoor_wetbulb_c - 15.0)
        carbon_intensity = econ.grid_carbon_g_per_kwh_default + 25.0 * math.sin(t * 0.01)

        metrics = FacilityMetrics(
            timestamp=time.time(),
            sim_step=self.sim_step,
            outdoor_wetbulb_c=round(self.outdoor_wetbulb_c, 1),
            outdoor_drybulb_c=round(self.outdoor_drybulb_c, 1),
            total_it_power_kw=round(total_it_kw, 1),
            total_cooling_power_kw=round(total_cooling_kw, 1),
            total_power_loss_kw=round(total_power_loss_kw, 1),
            total_facility_power_kw=round(total_facility_kw, 1),
            pue=pue,
            wue_l_per_kwh=round(wue, 2),
            carbon_intensity_g_per_kwh=round(carbon_intensity, 1),
            carbon_emissions_kg_per_hr=round((total_facility_kw * carbon_intensity) / 1000.0, 1),
            energy_cost_usd_per_hr=round(total_facility_kw * econ.blended_electricity_usd_per_kwh, 2),
            avg_inlet_temp_c=round(float(np.mean(inlet_temps)), 2),
            max_inlet_temp_c=round(max_inlet_rack.inlet_temp_c, 2),
            max_inlet_rack_id=max_inlet_rack.rack_id,
            avg_chip_temp_c=round(float(np.mean(chip_temps)), 2),
            max_chip_temp_c=round(max_chip_rack.chip_temp_c, 2),
            max_chip_rack_id=max_chip_rack.rack_id,
            liquid_cooling_share_pct=round((total_liquid_heat_kw / max(total_it_kw, 1.0)) * 100.0, 1),
            active_alarms_count=alarms_count,
            health_score=round(health_score, 1),
        )

        self.history.append(metrics)
        if len(self.history) > 120:
            self.history = self.history[-120:]

        return metrics

    def _apply_autopilot_control(self) -> None:
        """Topology-generic closed-loop BACnet Priority 8 supervisory controller."""
        for crac in self.cracs.values():
            if not crac.enabled:
                continue
            zone_racks = self.get_racks_for_rows(crac.served_rows)
            if not zone_racks:
                continue
            max_zone_inlet = max(r.inlet_temp_c for r in zone_racks)
            if max_zone_inlet < 23.2:
                crac.supply_air_setpoint_c = min(21.2, round(crac.supply_air_setpoint_c + 0.55, 2))
                crac.fan_speed_pct = max(56.0, round(crac.fan_speed_pct - 4.0, 1))
            elif max_zone_inlet > 24.5:
                crac.supply_air_setpoint_c = max(16.5, round(crac.supply_air_setpoint_c - 0.75, 2))
                crac.fan_speed_pct = min(96.0, round(crac.fan_speed_pct + 6.0, 1))

        for cdu in self.cdus.values():
            if not cdu.enabled:
                continue
            zone_racks = self.get_racks_for_rows(cdu.served_rows)
            if not zone_racks:
                continue
            max_chip = max(r.chip_temp_c for r in zone_racks)
            if max_chip < 64.5:
                cdu.supply_temp_setpoint_c = min(26.8, round(cdu.supply_temp_setpoint_c + 0.6, 2))
                cdu.pump_speed_pct = max(62.0, round(cdu.pump_speed_pct - 3.5, 1))
            elif max_chip > 69.0:
                cdu.supply_temp_setpoint_c = max(20.0, round(cdu.supply_temp_setpoint_c - 0.8, 2))
                cdu.pump_speed_pct = min(98.0, round(cdu.pump_speed_pct + 6.0, 1))

    def restore_manual_bms_defaults(self) -> None:
        """Revert cooling units back to conservative Priority 16 local BMS static setpoints."""
        for c_cfg in self.site_config.crac_units:
            crac = self.cracs.get(c_cfg.crac_id)
            if crac and crac.enabled:
                crac.supply_air_setpoint_c = c_cfg.supply_air_setpoint_c
                crac.fan_speed_pct = c_cfg.initial_fan_speed_pct

        for cdu_cfg in self.site_config.cdu_units:
            cdu = self.cdus.get(cdu_cfg.cdu_id)
            if cdu and cdu.enabled:
                cdu.supply_temp_setpoint_c = cdu_cfg.supply_temp_setpoint_c
                if self.cdu_fouling_factor.get(cdu_cfg.cdu_id, 1.0) >= 0.9:
                    cdu.pump_speed_pct = cdu_cfg.initial_pump_speed_pct

    def clone_for_whatif(self) -> "DataHallTwinEngine":
        """Create a fast deep-copy sandbox of the current twin state without mutating live state."""
        return copy.deepcopy(self)

    def apply_blade_action(self, rack_id: str, node_id: str, action: str) -> RackElevationResponse:
        key = f"{rack_id}:{node_id}"
        if action == "clear_fault":
            self.blade_overrides.pop(key, None)
        elif action == "inject_qd_restriction":
            self.blade_overrides[key] = {"qd_restricted": True, "fault_injected": True}
        elif action == "inject_workload_spike":
            self.blade_overrides[key] = {"util_boost": 32.0, "fault_injected": True}
        elif action == "cap_power_80":
            self.blade_overrides[key] = {"power_cap_pct": 80.0, "throttled": True}

        self.step(dt_sec=1.5)
        return self.get_rack_elevation(rack_id)

    def get_rack_elevation(self, rack_id: str) -> RackElevationResponse:
        if rack_id not in self.racks:
            rack_id = next(iter(self.racks.keys()))
        rk = self.racks[rack_id]
        nodes: List[ServerNodeTelemetry] = []

        if rk.cooling_type == CoolingType.HYBRID_LIQUID:
            gpu_model = "NVIDIA HGX B200 (1000W TDP)" if rk.max_power_kw >= 80.0 else "NVIDIA HGX H200 (700W TDP)"
            layout = [
                (41, 2, "ToR Quantum-2 InfiniBand Switch", UChassisType.TOR_SWITCH, "High-Velocity Air", 0, 0.03),
                (39, 2, "CDU Rack Manifold Header & Quick-Disconnects", UChassisType.LIQUID_MANIFOLD, "Direct-to-Chip Cold Plate", 0, 0.01),
                (35, 4, "AI Node-08 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (31, 4, "AI Node-07 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (27, 4, "AI Node-06 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (23, 4, "AI Node-05 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (19, 4, "NVLink 5.0 Switch Fabric Interconnect", UChassisType.NVLINK_FABRIC, "Direct-to-Chip Cold Plate", 0, 0.06),
                (15, 4, "AI Node-04 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (11, 4, "AI Node-03 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (7, 4, "AI Node-02 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (3, 4, "AI Node-01 (8x GPU Cold-Plate Tray)", UChassisType.AI_GPU_NODE, "Direct-to-Chip Cold Plate", 8, 0.11),
                (1, 2, "48V DC Busbar Power Shelf (66 kW)", UChassisType.SHELF_PSU, "High-Velocity Air", 0, 0.02),
            ]
        else:
            gpu_model = "NVIDIA L40S Inference" if rk.gpu_count > 0 else None
            layout = [
                (41, 2, "ToR 100GbE Leaf Switch Pair", UChassisType.TOR_SWITCH, "High-Velocity Air", 0, 0.04),
                (37, 4, "Compute Blade Tray 09 (Dual EPYC)", UChassisType.COMPUTE_BLADE, "High-Velocity Air", 0, 0.10),
                (33, 4, "Compute Blade Tray 08 (Dual EPYC)", UChassisType.COMPUTE_BLADE, "High-Velocity Air", 0, 0.10),
                (29, 4, "Compute Blade Tray 07 (Dual EPYC)", UChassisType.COMPUTE_BLADE, "High-Velocity Air", 0, 0.10),
                (25, 4, "Compute Blade Tray 06 (Dual EPYC)", UChassisType.COMPUTE_BLADE, "High-Velocity Air", 0, 0.10),
                (21, 4, "NVMe-oF Flash Array Enclosure 05", UChassisType.STORAGE_ARRAY, "High-Velocity Air", 0, 0.11),
                (17, 4, "NVMe-oF Flash Array Enclosure 04", UChassisType.STORAGE_ARRAY, "High-Velocity Air", 0, 0.11),
                (13, 4, "Compute Blade Tray 03 (Inference)", UChassisType.COMPUTE_BLADE, "High-Velocity Air", 2 if gpu_model else 0, 0.11),
                (9, 4, "Compute Blade Tray 02 (Inference)", UChassisType.COMPUTE_BLADE, "High-Velocity Air", 2 if gpu_model else 0, 0.11),
                (5, 4, "Compute Blade Tray 01 (Core Services)", UChassisType.COMPUTE_BLADE, "High-Velocity Air", 0, 0.09),
                (1, 4, "Redundant AC/DC Power Supply Shelf", UChassisType.SHELF_PSU, "High-Velocity Air", 0, 0.03),
            ]

        for u_start, u_height, label, ctype, cmode, gpus, p_weight in layout:
            node_id = f"{rack_id}-U{u_start:02d}"
            override = self.blade_overrides.get(f"{rack_id}:{node_id}", {})

            height_factor = (u_start / 42.0) * 1.4
            base_util = np.clip(
                rk.it_utilization_pct + 6.0 * math.sin(u_start * 0.4) + override.get("util_boost", 0.0),
                8.0,
                99.8,
            )
            if "power_cap_pct" in override:
                base_util = min(base_util, override["power_cap_pct"] * 0.82)

            mult = 1.28 if override.get("util_boost") else (0.78 if override.get("power_cap_pct") else 1.0)
            node_power = round(rk.power_kw * p_weight * mult, 2)
            node_inlet = round(rk.inlet_temp_c + height_factor * 0.65 - 0.4, 1)

            qd_restricted = bool(override.get("qd_restricted", False))
            qd_status = "RESTRICTED (42% FLOW)" if qd_restricted else ("THROTTLED" if override.get("throttled") else "NOMINAL")

            if rk.cooling_type == CoolingType.HYBRID_LIQUID and cmode == "Direct-to-Chip Cold Plate":
                base_flow = (rk.coolant_flow_lpm or 40.0) * p_weight * (0.42 if qd_restricted else 1.0)
                flow_lpm = round(max(0.8, base_flow), 1)
                chip_base = (
                    rk.chip_temp_c
                    + height_factor * 0.8
                    + (13.5 if qd_restricted else 0.0)
                    + (5.5 if override.get("util_boost") else 0.0)
                    - (4.5 if override.get("power_cap_pct") else 0.0)
                )
            else:
                flow_lpm = None
                chip_base = (
                    rk.chip_temp_c
                    + height_factor * 0.9
                    + (6.5 if override.get("util_boost") else 0.0)
                    - (4.0 if override.get("power_cap_pct") else 0.0)
                )

            cpu_temp = round(chip_base - 4.2, 1)
            gpu_temps = [round(chip_base + 1.2 * math.sin(g + u_start), 1) for g in range(gpus)] if gpus > 0 else []
            gpu_max = max(gpu_temps) if gpu_temps else None
            exhaust_temp = round(rk.outlet_temp_c + height_factor * 0.7 + (4.5 if qd_restricted else 0.0), 1)
            fan_rpm = int(5400 + 2800 * (base_util / 100.0) + (1800 if qd_restricted else 0))

            peak_t = gpu_max or cpu_temp
            if peak_t >= 78.0 or qd_restricted:
                sev = Severity.CRITICAL
            elif peak_t >= 70.0 or override.get("fault_injected"):
                sev = Severity.WARNING
            else:
                sev = Severity.NORMAL

            nodes.append(
                ServerNodeTelemetry(
                    node_id=node_id,
                    rack_id=rack_id,
                    u_start=u_start,
                    u_height=u_height,
                    name=label,
                    chassis_type=ctype,
                    cooling_mode=cmode,
                    gpu_model=gpu_model if gpus > 0 else None,
                    gpu_count=gpus,
                    utilization_pct=round(float(base_util), 1),
                    power_kw=node_power,
                    inlet_temp_c=node_inlet,
                    exhaust_temp_c=exhaust_temp,
                    cpu_temp_c=cpu_temp,
                    gpu_max_temp_c=gpu_max,
                    gpu_temps_c=gpu_temps,
                    coolant_flow_lpm=flow_lpm,
                    qd_valve_status=qd_status,
                    fan_rpm=fan_rpm,
                    throttled=bool(override.get("throttled") or peak_t >= 81.0),
                    fault_injected=bool(override.get("fault_injected", False)),
                    status=sev,
                )
            )

        total_blade_kw = round(sum(n.power_kw for n in nodes), 2)
        max_blade_t = max((n.gpu_max_temp_c or n.cpu_temp_c) for n in nodes)

        return RackElevationResponse(
            rack=rk,
            total_u=42,
            occupied_u=sum(n.u_height for n in nodes),
            total_blade_power_kw=total_blade_kw,
            max_blade_temp_c=round(max_blade_t, 1),
            manifold_supply_c=rk.coolant_supply_temp_c,
            manifold_return_c=rk.coolant_return_c if hasattr(rk, "coolant_return_c") else rk.coolant_return_temp_c,
            manifold_pressure_kpa=182.0 if rk.cooling_type == CoolingType.HYBRID_LIQUID else None,
            nodes=nodes,
        )
