"""
Multi-MW / 10,000-GPU AI Training Cluster Scale-Out & Infrastructure Gap Planner.

Models physical space, slab loading, First-Law liquid vs. residual air heat split,
`Q = m_dot * Cp * dT` coolant flow, 415V/MV electrical distribution, and synchronous
AI training (`AllReduce`) sub-second step-load transients against the current facility blueprint.
"""

from __future__ import annotations
import math
from typing import Dict, Any, List

from models import (
    ClusterInfrastructureDelta,
    ClusterScaleRequest,
    ClusterScaleResponse,
)
from simulator import DataHallTwinEngine


ARCH_CATALOG: Dict[str, Dict[str, Any]] = {
    "gb200_nvl72": {
        "label": "NVIDIA GB200 NVL72 (Liquid Rack-Scale)",
        "gpus_per_rack": 72,
        "kw_per_rack": 126.0,
        "fabric_ratio": 8,  # 1 InfiniBand/storage rack per 8 compute racks
        "fabric_rack_kw": 28.0,
        "liquid_capture_fraction": 0.87,
        "rack_weight_kg": 1630,
        "allows_air_only": False,
        "step_swing_fraction": 0.62,  # Synchronous FSDP/AllReduce barrier swing
    },
    "h200_hgx": {
        "label": "NVIDIA HGX H200 (8-GPU Nodes, 32 GPU/Rack)",
        "gpus_per_rack": 32,
        "kw_per_rack": 42.0,
        "fabric_ratio": 10,
        "fabric_rack_kw": 22.0,
        "liquid_capture_fraction": 0.76,
        "rack_weight_kg": 1180,
        "allows_air_only": True,
        "step_swing_fraction": 0.54,
    },
    "nextgen_ultra": {
        "label": "Next-Gen Rubin / Ultra NVL144 (240 kW/Rack)",
        "gpus_per_rack": 144,
        "kw_per_rack": 240.0,
        "fabric_ratio": 6,
        "fabric_rack_kw": 36.0,
        "liquid_capture_fraction": 0.92,
        "rack_weight_kg": 2050,
        "allows_air_only": False,
        "step_swing_fraction": 0.68,
    },
}


COOLING_MODES: Dict[str, Dict[str, Any]] = {
    "warm_water_dlc": {
        "label": "Warm-Water Direct Liquid (30°C Supply + Dry-Cooler Economizer)",
        "pue": 1.13,
        "delta_t_c": 11.0,
    },
    "chilled_water_dlc": {
        "label": "Chiller-Backed Direct Liquid (20°C Supply + Mechanical Chiller)",
        "pue": 1.23,
        "delta_t_c": 10.0,
    },
    "legacy_air": {
        "label": "Perimeter CRAC Air-Only (Hot/Cold Aisle Containment)",
        "pue": 1.41,
        "delta_t_c": 11.0,
    },
}


class ClusterScalePlannerService:
    def evaluate_cluster_scale(
        self, engine: DataHallTwinEngine, req: ClusterScaleRequest
    ) -> ClusterScaleResponse:
        arch = ARCH_CATALOG.get(req.gpu_arch, ARCH_CATALOG["gb200_nvl72"])
        cool = COOLING_MODES.get(req.cooling_strategy, COOLING_MODES["warm_water_dlc"])
        econ = engine.site_config.economics
        latest = engine.history[-1]

        existing_racks = len(engine.racks)
        current_it_mw = round(latest.total_it_power_kw / 1000.0, 2)
        current_pdu_cap_mw = round(sum(p.rated_capacity_kw for p in engine.pdus.values()) / 1000.0, 2)
        current_cdu_count = len(engine.cdus)
        current_cdu_lpm = int(sum(engine.cdu_max_lpm_map.values()))

        # Check physical feasibility of Air-Only above ~35 kW/rack
        feasible = True
        infeasibility_reason = None
        gpus_per_rack = int(arch["gpus_per_rack"])
        kw_per_rack = float(arch["kw_per_rack"])
        liquid_frac = float(arch["liquid_capture_fraction"])

        if req.cooling_strategy == "legacy_air":
            if not arch["allows_air_only"]:
                feasible = False
                infeasibility_reason = (
                    f"{arch['label']} dissipates {kw_per_rack:.0f} kW/rack. Perimeter air cooling hits "
                    f"acoustic and airflow velocity limits above ~35 kW/rack—Direct-to-Chip Liquid Cooling is mandatory."
                )
            else:
                # Air-only H200 requires depopulating racks from 32 GPUs (42 kW) -> 24 GPUs (~31.5 kW)
                gpus_per_rack = 24
                kw_per_rack = 31.5
                liquid_frac = 0.0

        compute_racks = math.ceil(req.gpu_count / gpus_per_rack)
        network_storage_racks = max(2, math.ceil(compute_racks / int(arch["fabric_ratio"])))
        total_racks = compute_racks + network_storage_racks

        data_halls_required = math.ceil(total_racks / max(1, existing_racks))
        rack_weight_kg = int(arch["rack_weight_kg"])
        slab_upgrade_required = rack_weight_kg > 1250

        # First-Law IT Power (MW)
        compute_mw = (compute_racks * kw_per_rack) / 1000.0
        fabric_mw = (network_storage_racks * float(arch["fabric_rack_kw"])) / 1000.0
        cluster_it_mw = round(compute_mw + fabric_mw, 2)

        projected_pue = float(cool["pue"])
        total_utility_mw = round(cluster_it_mw * projected_pue, 2)

        # Exact First-Law Heat Rejection Split: Q_it = Q_liquid + Q_air_residual
        liquid_heat_mw = round(cluster_it_mw * liquid_frac, 2)
        air_residual_mw = round(max(0.0, cluster_it_mw - liquid_heat_mw), 2)

        # Sensible Coolant Flow: Q (kW) = (LPM / 60) * rho (1.02 kg/L) * Cp (3.92 kJ/kg*K) * dT
        # => LPM_per_MW = (1000 * 60) / (1.02 * 3.92 * dT)
        cp_kj_per_l_k = 1.02 * 3.92  # ~3.998 kJ/(L·K) for 25% Propylene Glycol
        lpm_per_mw = 60000.0 / (cp_kj_per_l_k * float(cool["delta_t_c"]))
        total_coolant_flow_lpm = int(round(liquid_heat_mw * lpm_per_mw)) if liquid_heat_mw > 0 else 0

        # Modular 1.5 MW Liquid CDUs with N+1 redundancy
        modular_cdus_n1 = (math.ceil(liquid_heat_mw / 1.45) + 1) if liquid_heat_mw > 0 else 0

        # Medium-Voltage 2.5 MVA (2.25 MW @ 0.9 PF) Transformers with N+1 redundancy
        mv_transformers_n1 = math.ceil(total_utility_mw / 2.25) + 1

        # AI Training Synchronous Step-Load Transient (AllReduce barrier power drop/spike in <100ms)
        step_swing_mw = round(compute_mw * float(arch["step_swing_fraction"]), 2)
        bess_buffer_mw = round(step_swing_mw * 1.05, 1)
        bess_buffer_mwh = round(bess_buffer_mw * 0.25, 2)  # 15-minute high-rate C-rate Li-Ion / supercap buffer
        # 6-minute chilled/warm-water ride-through buffer tank
        thermal_buffer_liters = int(round((total_coolant_flow_lpm * 6.0) if total_coolant_flow_lpm > 0 else (cluster_it_mw * 4500)))

        # Cooling Power & OpEx Savings vs Legacy Air/Chilled Baseline (PUE 1.38)
        reference_pue = max(projected_pue, 1.38)
        cooling_power_saved_mw = round(cluster_it_mw * (reference_pue - projected_pue), 2)
        annual_cooling_savings_usd = round(
            cooling_power_saved_mw * 1000.0 * 8760.0 * econ.blended_electricity_usd_per_kwh, 0
        )

        # Phase-1 Pilot: How many GPUs can existing Hall 1 host if retrofitted inside current PDU envelope?
        usable_hall1_it_kw = sum(p.rated_capacity_kw for p in engine.pdus.values()) * 0.85  # 85% NEC continuous load limit
        max_compute_racks_hall1 = min(existing_racks - 2, int(usable_hall1_it_kw // kw_per_rack))
        phase1_max_gpus = max(0, max_compute_racks_hall1 * gpus_per_rack)
        phase1_summary = (
            f"Current Hall ({existing_racks} racks, {current_pdu_cap_mw:.2f} MW rated PDUs) can host a Phase-1 pilot of "
            f"up to {phase1_max_gpus:,} GPUs ({max_compute_racks_hall1} racks) after retrofitting air rows to liquid. "
            f"Deploying all {req.gpu_count:,} GPUs requires {data_halls_required} high-density halls ({total_utility_mw:.1f} MW utility feed)."
        )

        deltas: List[ClusterInfrastructureDelta] = [
            ClusterInfrastructureDelta(
                category="Space & Floor Loading",
                current_site_value=f"1 Hall · {existing_racks} Racks (≤1,100 kg)",
                required_cluster_value=f"{data_halls_required} Halls · {total_racks} Racks ({rack_weight_kg:,} kg/rack)",
                upgrade_delta=f"+{max(0, total_racks - existing_racks)} Racks ({compute_racks} GPU + {network_storage_racks} Fabric)",
                bottleneck_severity="critical" if data_halls_required > 1 else "warning",
                engineering_note=(
                    "Requires slab-on-grade or reinforced seismic pedestals (standard raised floor buckles >1,250 kg/rack)."
                    if slab_upgrade_required
                    else "Fits standard heavy-duty data hall structural load limits."
                ),
            ),
            ClusterInfrastructureDelta(
                category="Utility Substation & Busways",
                current_site_value=f"{current_it_mw:.2f} MW IT ({current_pdu_cap_mw:.1f} MW PDUs)",
                required_cluster_value=f"{cluster_it_mw:.1f} MW IT · {total_utility_mw:.1f} MW Grid",
                upgrade_delta=f"{mv_transformers_n1}× 2.5 MVA MV Transformers (N+1)",
                bottleneck_severity="critical",
                engineering_note="Upgrade 208V whips to Dual 415V/480V 800A Overhead Busways + 50V DC In-Rack Power Shelves.",
            ),
            ClusterInfrastructureDelta(
                category="Liquid Cooling Plant (CDUs)",
                current_site_value=f"{current_cdu_count} CDUs · {current_cdu_lpm:,} LPM",
                required_cluster_value=(
                    f"{modular_cdus_n1}× 1.5 MW CDUs · {total_coolant_flow_lpm:,} LPM"
                    if liquid_heat_mw > 0
                    else "Air-Only (0 CDUs)"
                ),
                upgrade_delta=f"{liquid_heat_mw:.1f} MW Direct Cold-Plate Heat ({int(liquid_frac * 100)}%)",
                bottleneck_severity="critical" if modular_cdus_n1 > current_cdu_count else "warning",
                engineering_note=(
                    "30°C warm-water supply enables compressor-free dry-cooler rejection for >75% of the year."
                    if req.cooling_strategy == "warm_water_dlc" and liquid_heat_mw > 0
                    else "High-flow stainless overhead manifolds + dripless blind-mate quick disconnects per rack."
                ),
            ),
            ClusterInfrastructureDelta(
                category="Residual Room Air Cooling",
                current_site_value=f"{len(engine.cracs)} Perimeter CRACs",
                required_cluster_value=f"{air_residual_mw:.2f} MW Air Heat Rejection",
                upgrade_delta=f"{math.ceil(air_residual_mw / 0.35)}× 400 kW CRAC / Rear-Door HX",
                bottleneck_severity="warning",
                engineering_note="Even 87–92% liquid-cooled AI racks still reject 8–13% heat from VRMs, optical transceivers, and switches into hall air.",
            ),
            ClusterInfrastructureDelta(
                category="AI Step-Load Transient Buffer",
                current_site_value="Standard Backup UPS Only",
                required_cluster_value=f"{bess_transient_filter_label(bess_buffer_mw, bess_buffer_mwh)}",
                upgrade_delta=f"±{step_swing_mw:.1f} MW swing in <100 ms",
                bottleneck_severity="critical",
                engineering_note=(
                    f"Synchronous AllReduce barriers swing {step_swing_mw:.1f} MW instantaneously—requires grid-interactive "
                    f"UPS BESS ramp-rate smoothing + {thermal_buffer_liters:,} L thermal buffer tank."
                ),
            ),
            ClusterInfrastructureDelta(
                category="PUE & Annual Cooling OpEx",
                current_site_value=f"PUE {latest.pue:.2f}",
                required_cluster_value=f"PUE {projected_pue:.2f} ({cool['label'].split('(')[0].strip()})",
                upgrade_delta=(
                    f"-{cooling_power_saved_mw:.2f} MW Cooling (${annual_cooling_savings_usd:,.0f}/yr)"
                    if cooling_power_saved_mw > 0
                    else "No PUE gain (Air-Only penalty)"
                ),
                bottleneck_severity="info" if feasible else "critical",
                engineering_note="Warm-water liquid cooling reclaims megawatts of transformer capacity for revenue-generating GPUs.",
            ),
        ]

        changes = [
            f"Multi-Hall Pod Topology: Organize {req.gpu_count:,} GPUs into {data_halls_required} liquid-cooled pods ({compute_racks} GPU racks + {network_storage_racks} non-blocking rail-optimized InfiniBand/RoCE spine racks to keep optical cables <50m).",
            f"87/13 Hybrid Heat Split: Size overhead stainless manifolds for {total_coolant_flow_lpm:,} LPM ({liquid_heat_mw:.1f} MW liquid), while keeping {air_residual_mw:.2f} MW of Rear-Door HX / CRAC air cooling for optical transceivers & storage.",
            f"Sub-Second Power Smoothing: Add {bess_buffer_mw:.1f} MW active UPS BESS / rack capacitor smoothing so synchronous training barriers (±{step_swing_mw:.1f} MW in <100ms) never trip utility feeders or diesel gensets.",
            phase1_summary,
        ]

        return ClusterScaleResponse(
            gpu_count=req.gpu_count,
            gpu_arch_label=arch["label"],
            cooling_strategy_label=cool["label"],
            feasible=feasible,
            infeasibility_reason=infeasibility_reason,
            gpus_per_compute_rack=gpus_per_rack,
            kw_per_compute_rack=kw_per_rack,
            compute_racks=compute_racks,
            network_storage_racks=network_storage_racks,
            total_cluster_racks=total_racks,
            existing_hall_racks=existing_racks,
            data_halls_required=data_halls_required,
            rack_weight_kg=rack_weight_kg,
            slab_upgrade_required=slab_upgrade_required,
            current_hall_it_mw=current_it_mw,
            cluster_it_mw=cluster_it_mw,
            projected_pue=projected_pue,
            total_utility_mw=total_utility_mw,
            liquid_heat_mw=liquid_heat_mw,
            air_residual_mw=air_residual_mw,
            total_coolant_flow_lpm=total_coolant_flow_lpm,
            modular_cdus_n1=modular_cdus_n1,
            mv_transformers_n1=mv_transformers_n1,
            synchronous_step_swing_mw=step_swing_mw,
            bess_transient_buffer_mw=bess_buffer_mw,
            bess_transient_buffer_mwh=bess_buffer_mwh,
            thermal_buffer_tank_liters=thermal_buffer_liters,
            annual_cooling_savings_usd=annual_cooling_savings_usd,
            cooling_power_saved_mw=cooling_power_saved_mw,
            phase1_max_gpus_in_current_hall=phase1_max_gpus,
            phase1_summary=phase1_summary,
            infrastructure_deltas=deltas,
            architectural_changes=changes,
        )


def bess_transient_filter_label(mw: float, mwh: float) -> str:
    return f"{mw:.1f} MW / {mwh:.2f} MWh Smoothing BESS"
