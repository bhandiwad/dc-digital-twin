"""
Physics-Informed High-Density AI Data Center Digital Twin Engine.
Models:
1. Graph Topology (NetworkX):
   - 2 UPS Modules (UPS-A, UPS-B) -> 4 Row PDUs (PDU-A..D) -> 32 Racks (4 Rows x 8 Racks)
   - 4 Perimeter CRAC Units (CRAC-1..4) supplying cold aisles
   - 2 Direct-to-Chip Liquid Cooling Distribution Units (CDU-1, CDU-2) serving High-Density AI Rows C & D
   - Central Chiller + Cooling Tower Plant
2. coupled Electro-Thermal Physics:
   - IT utilization -> server power + static leakage + cubic fan affinity laws
   - Air vs. Direct-to-Chip liquid heat split (75% liquid capture on hybrid AI racks)
   - Cold-aisle spatial temperature distribution + hot-aisle recirculation when airflow/cooling degrades
   - Thermal capacitance ODE step (dT/dt) for realistic thermal inertia on chips and inlet air
   - Chiller COP as a non-linear function of outdoor wet-bulb temp, part-load ratio, and supply water temp
"""

from __future__ import annotations
import copy
import math
import time
from typing import Dict, List, Optional, Tuple
import networkx as nx
import numpy as np

from models import (
    CoolingType,
    WorkloadClass,
    Severity,
    Position3D,
    RackSpec,
    RackTelemetry,
    CRACTelemetry,
    CDUTelemetry,
    PDUTelemetry,
    UPSTelemetry,
    FacilityMetrics,
    TopologyEdge,
    UChassisType,
    ServerNodeTelemetry,
    RackElevationResponse,
)


class DataHallTwinEngine:
    def __init__(self) -> None:
        self.rng = np.random.default_rng(42)
        self.sim_step: int = 0
        self.start_time: float = time.time()
        self.outdoor_wetbulb_c: float = 19.5
        self.outdoor_drybulb_c: float = 26.8
        self.auto_optimize: bool = False
        self.active_scenarios: List[str] = ["normal"]

        # Scenario modifiers
        self.row_load_boost_kw: Dict[str, float] = {"ROW-A": 0.0, "ROW-B": 0.0, "ROW-C": 0.0, "ROW-D": 0.0}
        self.rack_recirc_fault: Dict[str, float] = {}  # rack_id -> extra recirculation °C
        self.cdu_fouling_factor: Dict[str, float] = {"CDU-1": 1.0, "CDU-2": 1.0}  # <1.0 means degraded heat transfer
        self.blade_overrides: Dict[str, Dict[str, Any]] = {}  # f"{rack_id}:{node_id}" -> fault/cap state

        # Build topology & state
        self.graph = nx.DiGraph()
        self.rack_specs: Dict[str, RackSpec] = {}
        self.racks: Dict[str, RackTelemetry] = {}
        self.cracs: Dict[str, CRACTelemetry] = {}
        self.cdus: Dict[str, CDUTelemetry] = {}
        self.pdus: Dict[str, PDUTelemetry] = {}
        self.ups_units: Dict[str, UPSTelemetry] = {}
        self.history: List[FacilityMetrics] = []

        self._init_topology()
        # Warm-up 45 steps so history is populated immediately on launch
        for _ in range(45):
            self.step(dt_sec=2.0)

    def _init_topology(self) -> None:
        # 1. UPS Units
        self.ups_units = {
            "UPS-A": UPSTelemetry(ups_id="UPS-A", name="UPS Module A (N+1)", rated_capacity_kw=1600.0),
            "UPS-B": UPSTelemetry(ups_id="UPS-B", name="UPS Module B (N+1)", rated_capacity_kw=1600.0),
        }
        for ups_id in self.ups_units:
            self.graph.add_node(ups_id, type="ups")

        # 2. Row PDUs
        row_configs = [
            ("ROW-A", "PDU-A", "UPS-A", -7.5, CoolingType.AIR, WorkloadClass.GENERAL_COMPUTE, 18.0, 0),
            ("ROW-B", "PDU-B", "UPS-A", -2.5, CoolingType.AIR, WorkloadClass.CLOUD_STORAGE, 22.0, 4),
            ("ROW-C", "PDU-C", "UPS-B", 2.5, CoolingType.HYBRID_LIQUID, WorkloadClass.LLM_TRAINING, 85.0, 32),
            ("ROW-D", "PDU-D", "UPS-B", 7.5, CoolingType.HYBRID_LIQUID, WorkloadClass.AI_INFERENCE, 65.0, 24),
        ]

        for row_id, pdu_id, ups_id, z_pos, _, _, max_kw, _ in row_configs:
            rated = 250.0 if max_kw < 30 else 800.0
            self.pdus[pdu_id] = PDUTelemetry(
                pdu_id=pdu_id,
                name=f"{row_id} Power Distribution",
                row_id=row_id,
                ups_id=ups_id,
                position=Position3D(x=-11.5, y=1.1, z=z_pos),
                rated_capacity_kw=rated,
            )
            self.graph.add_node(pdu_id, type="pdu", row_id=row_id)
            self.graph.add_edge(ups_id, pdu_id, layer="power", capacity_kw=rated)

        # 3. Perimeter CRAC Units (Air Cooling)
        crac_configs = [
            ("CRAC-1", "CRAC North-West", ["ROW-A", "ROW-B"], Position3D(x=-6.0, y=1.2, z=-12.0), 17.5),
            ("CRAC-2", "CRAC North-East", ["ROW-A", "ROW-B"], Position3D(x=6.0, y=1.2, z=-12.0), 17.5),
            ("CRAC-3", "CRAC South-West", ["ROW-C", "ROW-D"], Position3D(x=-6.0, y=1.2, z=12.0), 18.5),
            ("CRAC-4", "CRAC South-East", ["ROW-C", "ROW-D"], Position3D(x=6.0, y=1.2, z=12.0), 18.5),
        ]
        for crac_id, name, rows, pos, sp in crac_configs:
            self.cracs[crac_id] = CRACTelemetry(
                crac_id=crac_id,
                name=name,
                served_rows=rows,
                position=pos,
                supply_air_setpoint_c=sp,
                supply_air_temp_c=sp,
                fan_speed_pct=72.0,
                cooling_capacity_kw=280.0,
            )
            self.graph.add_node(crac_id, type="crac")

        # 4. Liquid Cooling Distribution Units (CDUs for Rows C & D)
        cdu_configs = [
            ("CDU-1", "Liquid CDU Alpha (Row C AI)", ["ROW-C"], Position3D(x=11.5, y=1.1, z=2.5), 23.5, 850.0),
            ("CDU-2", "Liquid CDU Beta (Row D AI)", ["ROW-D"], Position3D(x=11.5, y=1.1, z=7.5), 24.5, 750.0),
        ]
        for cdu_id, name, rows, pos, sp, cap in cdu_configs:
            self.cdus[cdu_id] = CDUTelemetry(
                cdu_id=cdu_id,
                name=name,
                served_rows=rows,
                position=pos,
                supply_temp_setpoint_c=sp,
                supply_temp_c=sp,
                pump_speed_pct=80.0,
                cooling_capacity_kw=cap,
            )
            self.graph.add_node(cdu_id, type="cdu")

        # 5. 32 Racks (4 Rows x 8 Racks per Row)
        for row_id, pdu_id, _, z_pos, cooling_type, workload, max_kw, gpus in row_configs:
            row_letter = row_id.split("-")[1]
            cdu_id = "CDU-1" if row_id == "ROW-C" else ("CDU-2" if row_id == "ROW-D" else None)
            crac_zones = ["CRAC-1", "CRAC-2"] if row_id in ("ROW-A", "ROW-B") else ["CRAC-3", "CRAC-4"]

            for slot in range(1, 9):
                rack_id = f"R-{row_letter}{slot:02d}"
                x_pos = -7.8 + (slot - 1) * 2.2
                pos = Position3D(x=round(x_pos, 2), y=1.0, z=z_pos)

                spec = RackSpec(
                    rack_id=rack_id,
                    row_id=row_id,
                    slot_index=slot,
                    name=f"Rack {row_letter}{slot:02d} ({workload.value.replace('_', ' ').title()})",
                    cooling_type=cooling_type,
                    workload_class=workload,
                    max_power_kw=max_kw,
                    gpu_count=gpus,
                    pdu_id=pdu_id,
                    cdu_id=cdu_id,
                    crac_zone_ids=crac_zones,
                    position=pos,
                )
                self.rack_specs[rack_id] = spec

                # Initial utilization profile: higher in middle racks of AI clusters
                base_util = 58.0 + 14.0 * math.sin(slot * 0.6) if cooling_type == CoolingType.HYBRID_LIQUID else 46.0 + 10.0 * math.cos(slot * 0.5)
                init_power = max_kw * (0.15 + 0.85 * (base_util / 100.0))

                self.racks[rack_id] = RackTelemetry(
                    rack_id=rack_id,
                    row_id=row_id,
                    name=spec.name,
                    cooling_type=cooling_type,
                    workload_class=workload,
                    max_power_kw=max_kw,
                    gpu_count=gpus,
                    pdu_id=pdu_id,
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

                self.graph.add_node(rack_id, type="rack", row_id=row_id)
                self.graph.add_edge(pdu_id, rack_id, layer="power", capacity_kw=max_kw)
                for cid in crac_zones:
                    self.graph.add_edge(cid, rack_id, layer="air_cooling", capacity_kw=max_kw)
                if cdu_id:
                    self.graph.add_edge(cdu_id, rack_id, layer="liquid_cooling", capacity_kw=max_kw * 0.8)

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
                    flow = rk.air_power_kw / 2.0
                elif layer == "liquid_cooling":
                    flow = rk.liquid_power_kw
            elif v in self.pdus:
                flow = self.pdus[v].current_load_kw
            edges.append(TopologyEdge(source=u, target=v, layer=layer, capacity_kw=round(cap, 1), current_flow_kw=round(flow, 2)))
        return edges

    def trigger_scenario(self, scenario_id: str) -> None:
        # Reset baseline faults first if switching to "normal"
        if scenario_id == "normal":
            self.active_scenarios = ["normal"]
            self.row_load_boost_kw = {k: 0.0 for k in self.row_load_boost_kw}
            self.rack_recirc_fault.clear()
            self.cdu_fouling_factor = {"CDU-1": 1.0, "CDU-2": 1.0}
            self.outdoor_wetbulb_c = 19.5
            self.outdoor_drybulb_c = 26.8
            for crac in self.cracs.values():
                crac.enabled = True
                crac.fan_speed_pct = 74.0
                crac.supply_air_setpoint_c = 18.0
            for cdu in self.cdus.values():
                cdu.enabled = True
                cdu.pump_speed_pct = 80.0
                cdu.supply_temp_setpoint_c = 24.0
            return

        if "normal" in self.active_scenarios:
            self.active_scenarios.remove("normal")
        if scenario_id not in self.active_scenarios:
            self.active_scenarios.append(scenario_id)

        if scenario_id == "gpu_burst_row_c":
            # Synchronized LLM checkpoint + training spike in Row C
            self.row_load_boost_kw["ROW-C"] = 18.0
        elif scenario_id == "crac_2_fail":
            # CRAC-2 blower trip -> North-East air cooling degradation + recirculation
            self.cracs["CRAC-2"].enabled = False
            self.cracs["CRAC-2"].fan_speed_pct = 0.0
        elif scenario_id == "cdu_1_fouling":
            # CDU-1 heat exchanger fouling / pump cavitation on Row C AI cluster
            self.cdu_fouling_factor["CDU-1"] = 0.58
            self.cdus["CDU-1"].pump_speed_pct = 48.0
        elif scenario_id == "heatwave":
            # Extreme ambient heatwave -> wet-bulb rises to 28.5°C, chiller COP drops
            self.outdoor_wetbulb_c = 28.5
            self.outdoor_drybulb_c = 39.2
        elif scenario_id == "hot_aisle_recirc":
            # Containment damper stuck open near R-B06, R-B07, R-C05, R-C06
            for rid in ("R-B06", "R-B07", "R-C05", "R-C06"):
                self.rack_recirc_fault[rid] = 6.5

    def step(self, dt_sec: float = 2.0) -> FacilityMetrics:
        self.sim_step += 1
        t = self.sim_step * dt_sec

        # If AI Auto-Pilot optimization is active, dynamically tune CRAC & CDU setpoints
        if self.auto_optimize:
            self._apply_autopilot_control()

        # 1. Update CRAC supply temperatures (first-order lag toward setpoint)
        for crac in self.cracs.values():
            if not crac.enabled or crac.fan_speed_pct <= 5.0:
                crac.airflow_cfm = 0.0
                crac.power_kw = 0.4  # standby electronics
                crac.supply_air_temp_c += (26.5 - crac.supply_air_temp_c) * 0.25
                crac.thermal_load_kw = 0.0
                crac.status = Severity.CRITICAL
            else:
                noise = float(self.rng.normal(0.0, 0.05))
                crac.supply_air_temp_c += (crac.supply_air_setpoint_c - crac.supply_air_temp_c) * 0.35 + noise
                crac.airflow_cfm = 36000.0 * (crac.fan_speed_pct / 100.0)
                # Fan affinity law: power ~ (fan_speed)^3
                crac.power_kw = round(3.2 + 28.0 * ((crac.fan_speed_pct / 100.0) ** 3), 2)
                crac.status = Severity.NORMAL

        # 2. Update CDU liquid supply temperatures & flow rates
        for cdu_id, cdu in self.cdus.items():
            fouling = self.cdu_fouling_factor.get(cdu_id, 1.0)
            if not cdu.enabled or cdu.pump_speed_pct <= 5.0:
                cdu.total_flow_lpm = 10.0
                cdu.power_kw = 0.5
                cdu.supply_temp_c += (32.0 - cdu.supply_temp_c) * 0.2
                cdu.status = Severity.CRITICAL
            else:
                noise = float(self.rng.normal(0.0, 0.04))
                effective_setpoint = cdu.supply_temp_setpoint_c + (1.0 - fouling) * 6.5
                cdu.supply_temp_c += (effective_setpoint - cdu.supply_temp_c) * 0.35 + noise
                cdu.total_flow_lpm = round(560.0 * (cdu.pump_speed_pct / 100.0) * fouling, 1)
                cdu.pressure_kpa = round(220.0 * ((cdu.pump_speed_pct / 100.0) ** 1.8) / max(fouling, 0.4), 1)
                cdu.power_kw = round(2.0 + 18.5 * ((cdu.pump_speed_pct / 100.0) ** 2.8), 2)
                cdu.status = Severity.WARNING if fouling < 0.8 else Severity.NORMAL

        # 3. Update Rack IT Loads, Power, and Coupled Air/Liquid Thermal Dynamics
        row_air_heat: Dict[str, float] = {"ROW-A": 0.0, "ROW-B": 0.0, "ROW-C": 0.0, "ROW-D": 0.0}
        cdu_liquid_heat: Dict[str, float] = {"CDU-1": 0.0, "CDU-2": 0.0}

        for rack_id, rk in self.racks.items():
            spec = self.rack_specs[rack_id]
            slot = spec.slot_index

            # Realistic time-varying workload pattern: harmonic diurnal/job wave + stochastic micro-bursts
            phase = slot * 0.55 + (0.0 if rk.row_id in ("ROW-A", "ROW-B") else 1.4)
            wave = 8.0 * math.sin(t * 0.035 + phase) + 4.5 * math.cos(t * 0.09 - slot)
            base_target = 64.0 if rk.cooling_type == CoolingType.HYBRID_LIQUID else 48.0
            boost_kw = self.row_load_boost_kw.get(rk.row_id, 0.0)
            boost_util = (boost_kw / rk.max_power_kw) * 100.0

            target_util = np.clip(
                base_target + wave + boost_util + float(self.rng.normal(0.0, 1.8)),
                12.0,
                99.5,
            )
            rk.it_utilization_pct = round(0.72 * rk.it_utilization_pct + 0.28 * float(target_util), 1)

            # Server electrical power = idle static leakage (14%) + dynamic compute power + internal server fan power
            compute_kw = rk.max_power_kw * (0.14 + 0.82 * (rk.it_utilization_pct / 100.0))

            # Calculate cold aisle air inlet temperature for this rack
            served_cracs = [self.cracs[cid] for cid in spec.crac_zone_ids]
            active_cracs = [c for c in served_cracs if c.enabled and c.airflow_cfm > 1000]
            if not active_cracs:
                supply_air_c = 27.5
                total_zone_cfm = 2000.0
            else:
                # Distance-weighted supply air temperature (CRAC-1/3 at West x=-6, CRAC-2/4 at East x=+6)
                weights = []
                for c in active_cracs:
                    dist = abs(rk.position.x - c.position.x) + 2.0
                    weights.append((c.airflow_cfm / dist, c.supply_air_temp_c))
                w_sum = sum(w for w, _ in weights)
                supply_air_c = sum(w * temp for w, temp in weights) / max(w_sum, 1e-3)
                total_zone_cfm = sum(c.airflow_cfm for c in active_cracs)

            # End-of-row recirculation effect & deficit airflow penalty
            edge_recirc = 0.85 if slot in (1, 8) else 0.25
            airflow_deficit_c = max(0.0, (42000.0 - total_zone_cfm) / 8000.0) * (1.2 + 0.15 * slot)
            fault_recirc_c = self.rack_recirc_fault.get(rack_id, 0.0)

            target_inlet_c = (
                supply_air_c
                + edge_recirc
                + airflow_deficit_c
                + fault_recirc_c
                + 0.025 * compute_kw
                + float(self.rng.normal(0.0, 0.08))
            )
            # Thermal inertia on inlet sensor
            rk.inlet_temp_c = round(0.68 * rk.inlet_temp_c + 0.32 * target_inlet_c, 2)

            # Server internal fans spin up non-linearly when inlet temp or chip temp rises
            temp_drive = max(0.0, (rk.inlet_temp_c - 18.0) / 12.0)
            fan_fraction = np.clip(0.35 + 0.50 * (rk.it_utilization_pct / 100.0) + 0.35 * temp_drive, 0.30, 1.0)
            max_fan_kw = 1.6 if rk.cooling_type == CoolingType.AIR else 2.4
            rk.fan_power_kw = round(max_fan_kw * (fan_fraction ** 3), 2)
            rk.power_kw = round(compute_kw + rk.fan_power_kw, 2)

            if rk.cooling_type == CoolingType.HYBRID_LIQUID and rk.cdu_id:
                cdu = self.cdus[rk.cdu_id]
                fouling = self.cdu_fouling_factor.get(rk.cdu_id, 1.0)
                # Direct-to-chip cold plates capture ~76% of heat under healthy flow, less if fouled
                liquid_capture_ratio = 0.76 * min(1.0, (cdu.total_flow_lpm / 360.0))
                rk.liquid_power_kw = round(rk.power_kw * liquid_capture_ratio, 2)
                rk.air_power_kw = round(rk.power_kw - rk.liquid_power_kw, 2)

                # Per-rack coolant flow in LPM (8 racks per CDU)
                rack_flow_lpm = max(8.0, (cdu.total_flow_lpm / 8.0) * (0.92 + 0.16 * (rk.power_kw / rk.max_power_kw)))
                rk.coolant_flow_lpm = round(rack_flow_lpm, 1)
                rk.coolant_supply_temp_c = round(cdu.supply_temp_c, 2)

                # Q = m_dot * Cp * dT -> Cp of water/glycol ~ 3.95 kJ/(kg*K) -> 0.0658 kW/(LPM*K)
                delta_t_liquid = rk.liquid_power_kw / max(rack_flow_lpm * 0.0658, 0.3)
                rk.coolant_return_temp_c = round(rk.coolant_supply_temp_c + delta_t_liquid, 2)

                # Air exhaust for remaining 24% heat
                rk.airflow_cfm = round(1350.0 * fan_fraction, 0)
                # Air deltaT: Q_air (kW) * 3160 / CFM (in °F) -> / 1.8 for °C => Q_air * 1755 / CFM
                delta_t_air = (rk.air_power_kw * 1755.0) / max(rk.airflow_cfm, 250.0)
                rk.outlet_temp_c = round(rk.inlet_temp_c + delta_t_air, 2)

                # GPU junction temperature: cold plate supply + thermal resistance * load + fouling penalty
                r_th_chip = 0.34 / max(fouling, 0.45)  # °C per kW
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
                delta_t_air = (rk.air_power_kw * 1755.0) / max(rk.airflow_cfm, 300.0)
                rk.outlet_temp_c = round(rk.inlet_temp_c + delta_t_air, 2)

                target_chip_c = rk.inlet_temp_c + 14.0 + 1.45 * rk.power_kw
                rk.chip_temp_c = round(0.65 * rk.chip_temp_c + 0.35 * target_chip_c, 2)

            row_air_heat[rk.row_id] += rk.air_power_kw

            # Thermal margin and severity classification
            inlet_margin = 32.0 - rk.inlet_temp_c
            chip_margin = 85.0 - rk.chip_temp_c
            rk.thermal_margin_c = round(min(inlet_margin * 2.2, chip_margin), 1)

            faults: List[str] = []
            if rk.inlet_temp_c >= 29.5:
                faults.append("High Inlet Air Temperature (ASHRAE A1 Exceeded)")
            elif rk.inlet_temp_c >= 27.0:
                faults.append("Elevated Cold-Aisle Inlet Temp")
            if rk.chip_temp_c >= 78.0:
                faults.append("GPU Junction Near Thermal Throttling")
            if rack_id in self.rack_recirc_fault:
                faults.append("Hot-Aisle Containment Recirculation Detected")
            rk.active_faults = faults

            if rk.chip_temp_c >= 78.0 or rk.inlet_temp_c >= 29.5:
                rk.status = Severity.CRITICAL
            elif rk.chip_temp_c >= 70.0 or rk.inlet_temp_c >= 27.0 or faults:
                rk.status = Severity.WARNING
            elif rk.chip_temp_c >= 65.0 or rk.inlet_temp_c >= 25.0:
                rk.status = Severity.ADVISORY
            else:
                rk.status = Severity.NORMAL

        # 4. Roll up thermal loads to CRACs and CDUs
        north_air_kw = row_air_heat["ROW-A"] + row_air_heat["ROW-B"]
        south_air_kw = row_air_heat["ROW-C"] + row_air_heat["ROW-D"]

        for zone_cracs, zone_heat in (
            ([self.cracs["CRAC-1"], self.cracs["CRAC-2"]], north_air_kw),
            ([self.cracs["CRAC-3"], self.cracs["CRAC-4"]], south_air_kw),
        ):
            total_cfm = sum(c.airflow_cfm for c in zone_cracs if c.enabled)
            for c in zone_cracs:
                if c.enabled and total_cfm > 0:
                    share = c.airflow_cfm / total_cfm
                    c.thermal_load_kw = round(zone_heat * share, 1)
                    delta_air = (c.thermal_load_kw * 1755.0) / max(c.airflow_cfm, 1000.0)
                    c.return_air_temp_c = round(c.supply_air_temp_c + delta_air, 2)
                else:
                    c.thermal_load_kw = 0.0
                    c.return_air_temp_c = 31.5

        for cdu_id, cdu in self.cdus.items():
            cdu.thermal_load_kw = round(cdu_liquid_heat.get(cdu_id, 0.0), 1)
            if cdu.total_flow_lpm > 1.0:
                cdu.return_temp_c = round(
                    cdu.supply_temp_c + cdu.thermal_load_kw / (cdu.total_flow_lpm * 0.0658), 2
                )

        # 5. Roll up electrical power to PDUs & UPS modules
        for pdu in self.pdus.values():
            row_racks = [r for r in self.racks.values() if r.pdu_id == pdu.pdu_id]
            it_sum = sum(r.power_kw for r in row_racks)
            # Transformer + distribution loss ~ 1.8%
            pdu.loss_kw = round(it_sum * 0.018, 2)
            pdu.current_load_kw = round(it_sum + pdu.loss_kw, 2)
            pdu.load_pct = round((pdu.current_load_kw / pdu.rated_capacity_kw) * 100.0, 1)
            pdu.status = Severity.WARNING if pdu.load_pct > 85.0 else Severity.NORMAL

        for ups in self.ups_units.values():
            connected_pdus = [p for p in self.pdus.values() if p.ups_id == ups.ups_id]
            pdu_sum = sum(p.current_load_kw for p in connected_pdus)
            ups.loss_kw = round(pdu_sum * (1.0 - ups.efficiency_pct / 100.0), 2)
            ups.current_load_kw = round(pdu_sum + ups.loss_kw, 2)

        # 6. Central Chiller + Cooling Tower Plant & Facility PUE Calculation
        total_it_kw = sum(r.power_kw for r in self.racks.values())
        total_liquid_heat_kw = sum(c.thermal_load_kw for c in self.cdus.values())
        total_air_heat_kw = sum(c.thermal_load_kw for c in self.cracs.values())

        # Chiller efficiency (COP) improves with higher supply setpoints and lower outdoor wet-bulb
        avg_crac_sp = float(np.mean([c.supply_air_setpoint_c for c in self.cracs.values() if c.enabled] or [18.0]))
        avg_cdu_sp = float(np.mean([c.supply_temp_setpoint_c for c in self.cdus.values() if c.enabled] or [24.0]))

        # Air loop requires chilled water around 7-12°C -> lower COP (~4.1 at 19.5°C wetbulb)
        chiller_cop_air = max(2.2, 4.4 + 0.14 * (avg_crac_sp - 18.0) - 0.13 * (self.outdoor_wetbulb_c - 18.0))
        # Direct-to-chip warm water loop (24°C+) uses partial free-cooling / economizer -> higher COP (~7.8)
        chiller_cop_liquid = max(3.5, 8.2 + 0.22 * (avg_cdu_sp - 24.0) - 0.16 * (self.outdoor_wetbulb_c - 18.0))

        for c in self.cracs.values():
            c.cop = round(chiller_cop_air, 2)

        chiller_air_kw = total_air_heat_kw / chiller_cop_air
        chiller_liquid_kw = total_liquid_heat_kw / chiller_cop_liquid
        crac_fan_kw = sum(c.power_kw for c in self.cracs.values())
        cdu_pump_kw = sum(c.power_kw for c in self.cdus.values())
        cooling_tower_aux_kw = 14.5 + 0.65 * max(0.0, self.outdoor_wetbulb_c - 16.0)

        total_cooling_kw = chiller_air_kw + chiller_liquid_kw + crac_fan_kw + cdu_pump_kw + cooling_tower_aux_kw
        total_power_loss_kw = sum(p.loss_kw for p in self.pdus.values()) + sum(u.loss_kw for u in self.ups_units.values()) + 8.5  # lighting/BMS
        total_facility_kw = total_it_kw + total_cooling_kw + total_power_loss_kw
        pue = total_facility_kw / max(total_it_kw, 1.0)

        inlet_temps = [r.inlet_temp_c for r in self.racks.values()]
        chip_temps = [r.chip_temp_c for r in self.racks.values()]
        max_inlet_rack = max(self.racks.values(), key=lambda r: r.inlet_temp_c)
        max_chip_rack = max(self.racks.values(), key=lambda r: r.chip_temp_c)

        alarms_count = sum(1 for r in self.racks.values() if r.status in (Severity.WARNING, Severity.CRITICAL))
        alarms_count += sum(1 for c in self.cracs.values() if c.status != Severity.NORMAL)
        alarms_count += sum(1 for c in self.cdus.values() if c.status != Severity.NORMAL)

        # Health score deduction from thermal excursions and active alarms
        thermal_penalty = max(0.0, (max_chip_rack.chip_temp_c - 66.0) * 1.8) + max(0.0, (max_inlet_rack.inlet_temp_c - 24.5) * 3.2)
        health_score = float(np.clip(100.0 - thermal_penalty - alarms_count * 2.5, 18.0, 100.0))

        wue = 0.42 + 0.024 * max(0.0, self.outdoor_wetbulb_c - 15.0)
        carbon_intensity = 310.0 + 25.0 * math.sin(t * 0.01)

        metrics = FacilityMetrics(
            timestamp=time.time(),
            sim_step=self.sim_step,
            outdoor_wetbulb_c=round(self.outdoor_wetbulb_c, 1),
            outdoor_drybulb_c=round(self.outdoor_drybulb_c, 1),
            total_it_power_kw=round(total_it_kw, 1),
            total_cooling_power_kw=round(total_cooling_kw, 1),
            total_power_loss_kw=round(total_power_loss_kw, 1),
            total_facility_power_kw=round(total_facility_kw, 1),
            pue=round(pue, 3),
            wue_l_per_kwh=round(wue, 2),
            carbon_intensity_g_per_kwh=round(carbon_intensity, 1),
            carbon_emissions_kg_per_hr=round((total_facility_kw * carbon_intensity) / 1000.0, 1),
            energy_cost_usd_per_hr=round(total_facility_kw * 0.115, 2),
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
        """Closed-loop AI cooling controller that tracks optimal thermal margin while minimizing PUE."""
        north_racks = [r for r in self.racks.values() if r.row_id in ("ROW-A", "ROW-B")]
        south_racks = [r for r in self.racks.values() if r.row_id in ("ROW-C", "ROW-D")]

        max_north_inlet = max(r.inlet_temp_c for r in north_racks)
        max_south_inlet = max(r.inlet_temp_c for r in south_racks)

        # Target max cold-aisle inlet around 23.2°C (ASHRAE A1 safe & high chiller COP)
        for cid in ("CRAC-1", "CRAC-2"):
            crac = self.cracs[cid]
            if crac.enabled:
                if max_north_inlet < 22.8:
                    crac.supply_air_setpoint_c = min(21.0, round(crac.supply_air_setpoint_c + 0.15, 2))
                    crac.fan_speed_pct = max(56.0, round(crac.fan_speed_pct - 1.2, 1))
                elif max_north_inlet > 24.2:
                    crac.supply_air_setpoint_c = max(16.5, round(crac.supply_air_setpoint_c - 0.25, 2))
                    crac.fan_speed_pct = min(96.0, round(crac.fan_speed_pct + 2.5, 1))

        for cid in ("CRAC-3", "CRAC-4"):
            crac = self.cracs[cid]
            if crac.enabled:
                if max_south_inlet < 23.0:
                    crac.supply_air_setpoint_c = min(21.5, round(crac.supply_air_setpoint_c + 0.15, 2))
                    crac.fan_speed_pct = max(55.0, round(crac.fan_speed_pct - 1.2, 1))
                elif max_south_inlet > 24.5:
                    crac.supply_air_setpoint_c = max(16.5, round(crac.supply_air_setpoint_c - 0.25, 2))
                    crac.fan_speed_pct = min(96.0, round(crac.fan_speed_pct + 2.5, 1))

        for cdu_id, row_id in (("CDU-1", "ROW-C"), ("CDU-2", "ROW-D")):
            cdu = self.cdus[cdu_id]
            row_racks = [r for r in self.racks.values() if r.row_id == row_id]
            max_chip = max(r.chip_temp_c for r in row_racks)
            if max_chip < 64.0:
                cdu.supply_temp_setpoint_c = min(27.5, round(cdu.supply_temp_setpoint_c + 0.15, 2))
                cdu.pump_speed_pct = max(62.0, round(cdu.pump_speed_pct - 1.0, 1))
            elif max_chip > 69.5:
                cdu.supply_temp_setpoint_c = max(20.0, round(cdu.supply_temp_setpoint_c - 0.3, 2))
                cdu.pump_speed_pct = min(98.0, round(cdu.pump_speed_pct + 3.0, 1))

    def clone_for_whatif(self) -> "DataHallTwinEngine":
        """Create a fast deep-copy sandbox of the current twin state to run what-if simulations without mutating live state."""
        cloned = copy.deepcopy(self)
        return cloned

    def apply_blade_action(self, rack_id: str, node_id: str, action: str) -> RackElevationResponse:
        """Inject or clear a 42U server-blade level fault or power cap (e.g., Quick-Disconnect valve restriction, workload burst, 80% power cap)."""
        key = f"{rack_id}:{node_id}"
        if action == "clear_fault":
            self.blade_overrides.pop(key, None)
        elif action == "inject_qd_restriction":
            self.blade_overrides[key] = {"qd_restricted": True, "fault_injected": True}
        elif action == "inject_workload_spike":
            self.blade_overrides[key] = {"util_boost": 32.0, "fault_injected": True}
        elif action == "cap_power_80":
            self.blade_overrides[key] = {"power_cap_pct": 80.0, "throttled": True}

        # Step physics once so rack rollup reflects blade state
        self.step(dt_sec=1.5)
        return self.get_rack_elevation(rack_id)

    def get_rack_elevation(self, rack_id: str) -> RackElevationResponse:
        """
        Generate the full 42U server-level chassis layout and real-time node telemetry for any of the 32 racks.
        - High-Density Hybrid Liquid Racks (ROW-C, ROW-D):
          U41-U42: Top-of-Rack 400GbE InfiniBand / RoCE Switch (2U)
          U39-U40: 1U Liquid Cooling Manifold Distribution Header + 1U Rack Busbar Shelf PSU
          U25-U38: 4x 3U HGX B200 / H100 8-GPU Liquid-Cooled Nodes + 2U NVLink Switch Fabric
          U19-U24: 3x 2U NVSwitch Interconnect Fabrics
          U03-U18: 4x 4U HGX 8-GPU Direct-to-Chip Cold-Plate Nodes
          U01-U02: Bottom 48V Busbar Rectifier Shelf (2U)
        - Air-Cooled Compute / Storage Racks (ROW-A, ROW-B):
          U41-U42: Redundant Top-of-Rack Switches (2U)
          U03-U40: 19x 2U Dual-Socket Compute / NVMe Storage Nodes
          U01-U02: Rack UPS / PDU Shelf (2U)
        """
        if rack_id not in self.racks:
            rack_id = "R-C04"
        rk = self.racks[rack_id]
        nodes: List[ServerNodeTelemetry] = []

        if rk.cooling_type == CoolingType.HYBRID_LIQUID:
            gpu_model = "NVIDIA HGX B200 (1000W TDP)" if rk.row_id == "ROW-C" else "NVIDIA HGX H200 (700W TDP)"
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

        for idx, (u_start, u_height, label, ctype, cmode, gpus, p_weight) in enumerate(layout):
            node_id = f"{rack_id}-U{u_start:02d}"
            override = self.blade_overrides.get(f"{rack_id}:{node_id}", {})

            # Vertical thermal stratification: top of rack is slightly warmer than bottom
            height_factor = (u_start / 42.0) * 1.4
            base_util = np.clip(rk.it_utilization_pct + 6.0 * math.sin(u_start * 0.4) + override.get("util_boost", 0.0), 8.0, 99.8)
            if "power_cap_pct" in override:
                base_util = min(base_util, override["power_cap_pct"] * 0.82)

            node_power = round(rk.power_kw * p_weight * (1.28 if override.get("util_boost") else (0.78 if override.get("power_cap_pct") else 1.0)), 2)
            node_inlet = round(rk.inlet_temp_c + height_factor * 0.65 - 0.4, 1)

            qd_restricted = bool(override.get("qd_restricted", False))
            qd_status = "RESTRICTED (42% FLOW)" if qd_restricted else ("THROTTLED" if override.get("throttled") else "NOMINAL")

            if rk.cooling_type == CoolingType.HYBRID_LIQUID and cmode == "Direct-to-Chip Cold Plate":
                base_flow = (rk.coolant_flow_lpm or 40.0) * p_weight * (0.42 if qd_restricted else 1.0)
                flow_lpm = round(max(0.8, base_flow), 1)
                chip_base = rk.chip_temp_c + height_factor * 0.8 + (13.5 if qd_restricted else 0.0) + (5.5 if override.get("util_boost") else 0.0) - (4.5 if override.get("power_cap_pct") else 0.0)
            else:
                flow_lpm = None
                chip_base = rk.chip_temp_c + height_factor * 0.9 + (6.5 if override.get("util_boost") else 0.0) - (4.0 if override.get("power_cap_pct") else 0.0)

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
            manifold_return_c=rk.coolant_return_temp_c,
            manifold_pressure_kpa=182.0 if rk.cooling_type == CoolingType.HYBRID_LIQUID else None,
            nodes=nodes,
        )

