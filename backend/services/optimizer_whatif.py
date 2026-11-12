"""
Topology-Generic Cooling Optimizer & Counterfactual What-If Sandbox Runner.

Dynamically inspects `engine.cracs`, `engine.cdus`, `engine.pdus`, and `engine.site_config`
without any hardcoded row or equipment IDs.
"""

from __future__ import annotations
from typing import Any, Dict, List

from models import (
    CoolingType,
    OptimizationAction,
    OptimizationRecommendation,
    Severity,
    WhatIfComparisonMetric,
    WhatIfRequest,
    WhatIfResponse,
)
from simulator import DataHallTwinEngine


class OptimizerWhatIfService:
    def compute_optimization(self, engine: DataHallTwinEngine) -> OptimizationRecommendation:
        latest = engine.history[-1]
        econ = engine.site_config.economics
        limits = engine.site_config.ashrae_limits
        actions: List[OptimizationAction] = []

        # 1. Inspect every CRAC unit dynamically via its `served_rows`
        for cid, crac in engine.cracs.items():
            zone_racks = engine.get_racks_for_rows(crac.served_rows)
            if not zone_racks:
                continue
            max_inlet = max(r.inlet_temp_c for r in zone_racks)
            mostly_liquid = sum(1 for r in zone_racks if r.cooling_type == CoolingType.HYBRID_LIQUID) > (len(zone_racks) / 2)

            if not crac.enabled:
                actions.append(
                    OptimizationAction(
                        target_id=cid,
                        parameter="Restore Unit / Rebalance Peer Fan",
                        current_value=0.0,
                        recommended_value=88.0,
                        unit="%",
                        rationale=f"{cid} is offline; restore VFD blower or boost peer CRAC fan speed to prevent hot-aisle spillover.",
                    )
                )
            elif max_inlet > (limits.air_inlet_recommend_max_c - 0.5):
                rec_fan = round(min(96.0, crac.fan_speed_pct + 16.0), 1)
                actions.append(
                    OptimizationAction(
                        target_id=cid,
                        parameter="Blower Fan Speed",
                        current_value=crac.fan_speed_pct,
                        recommended_value=rec_fan,
                        unit="%",
                        rationale=f"High cold-aisle inlet ({max_inlet:.1f}°C); increasing static pressure eliminates end-of-row recirculation.",
                    )
                )
            elif mostly_liquid and max_inlet < 23.2 and crac.fan_speed_pct > 62.0:
                rec_fan = round(max(56.0, crac.fan_speed_pct - 14.0), 1)
                actions.append(
                    OptimizationAction(
                        target_id=cid,
                        parameter="VFD Fan Speed (Cubic Affinity Savings)",
                        current_value=crac.fan_speed_pct,
                        recommended_value=rec_fan,
                        unit="%",
                        rationale=(
                            f"~76% of {', '.join(crac.served_rows)} heat is captured by liquid CDUs; "
                            f"reducing {cid} fan speed yields cubic power savings."
                        ),
                    )
                )
            elif max_inlet < 22.8 and crac.supply_air_setpoint_c < 20.5:
                rec_sp = round(min(21.0, crac.supply_air_setpoint_c + 2.0), 1)
                actions.append(
                    OptimizationAction(
                        target_id=cid,
                        parameter="Supply Air Setpoint",
                        current_value=crac.supply_air_setpoint_c,
                        recommended_value=rec_sp,
                        unit="°C",
                        rationale=(
                            f"Zone max inlet is {max_inlet:.1f}°C ({limits.air_inlet_recommend_max_c - max_inlet:.1f}°C below ASHRAE A1 limit). "
                            f"Raising supply setpoint lifts chiller COP."
                        ),
                    )
                )

        # 2. Inspect every Liquid CDU dynamically via its `served_rows`
        for cdu_id, cdu in engine.cdus.items():
            row_racks = engine.get_racks_for_rows(cdu.served_rows)
            if not row_racks:
                continue
            max_chip = max(r.chip_temp_c for r in row_racks)
            rows_label = ", ".join(cdu.served_rows)

            if max_chip >= limits.chip_warning_c:
                rec_pump = round(min(98.0, cdu.pump_speed_pct + 22.0), 1)
                actions.append(
                    OptimizationAction(
                        target_id=cdu_id,
                        parameter="Coolant Pump Speed",
                        current_value=cdu.pump_speed_pct,
                        recommended_value=rec_pump,
                        unit="%",
                        rationale=f"{rows_label} peak silicon temp at {max_chip:.1f}°C. Boosting LPM narrows cold-plate ΔT.",
                    )
                )
            elif max_chip < 64.5 and cdu.supply_temp_setpoint_c < 26.5:
                rec_sp = round(min(27.0, cdu.supply_temp_setpoint_c + 2.2), 1)
                actions.append(
                    OptimizationAction(
                        target_id=cdu_id,
                        parameter="Coolant Supply Setpoint",
                        current_value=cdu.supply_temp_setpoint_c,
                        recommended_value=rec_sp,
                        unit="°C",
                        rationale=f"{rows_label} peak temp is {max_chip:.1f}°C (<{limits.chip_warning_c:.0f}°C). Warm-water economizer mode cuts chiller draw.",
                    )
                )

        if engine.auto_optimize:
            if not actions:
                for c_cfg in engine.site_config.crac_units:
                    crac = engine.cracs.get(c_cfg.crac_id)
                    if crac and crac.enabled and abs(crac.supply_air_setpoint_c - c_cfg.supply_air_setpoint_c) >= 0.4:
                        actions.append(
                            OptimizationAction(
                                target_id=c_cfg.crac_id,
                                parameter="BACnet Priority 8 Active (Air + VFD)",
                                current_value=c_cfg.supply_air_setpoint_c,
                                recommended_value=round(crac.supply_air_setpoint_c, 1),
                                unit="°C",
                                rationale=(
                                    f"Holding {crac.supply_air_setpoint_c:.1f}°C @ {crac.fan_speed_pct:.0f}% fan "
                                    f"(vs Manual Priority 16: {c_cfg.supply_air_setpoint_c:.1f}°C @ {c_cfg.initial_fan_speed_pct:.0f}%)."
                                ),
                            )
                        )
                for cdu_cfg in engine.site_config.cdu_units:
                    cdu = engine.cdus.get(cdu_cfg.cdu_id)
                    if cdu and cdu.enabled and abs(cdu.supply_temp_setpoint_c - cdu_cfg.supply_temp_setpoint_c) >= 0.4:
                        actions.append(
                            OptimizationAction(
                                target_id=cdu_cfg.cdu_id,
                                parameter="BACnet Priority 8 Active (Warm Liquid)",
                                current_value=cdu_cfg.supply_temp_setpoint_c,
                                recommended_value=round(cdu.supply_temp_setpoint_c, 1),
                                unit="°C",
                                rationale=(
                                    f"Holding {cdu.supply_temp_setpoint_c:.1f}°C @ {cdu.pump_speed_pct:.0f}% pump "
                                    f"(vs Manual Priority 16: {cdu_cfg.supply_temp_setpoint_c:.1f}°C @ {cdu_cfg.initial_pump_speed_pct:.0f}%)."
                                ),
                            )
                        )
            manual_baseline_pue = max(latest.pue + 0.04, econ.legacy_baseline_pue - 0.025)
            power_saved_kw = round(latest.total_it_power_kw * (manual_baseline_pue - latest.pue), 1)
            projected_pue = latest.pue
        else:
            potential_pue_drop = min(0.065, 0.014 * len(actions) + max(0.0, latest.pue - 1.16) * 0.45)
            projected_pue = round(max(1.11, latest.pue - potential_pue_drop), 3)
            power_saved_kw = round(latest.total_it_power_kw * (latest.pue - projected_pue), 1)

        annual_kwh_saved = max(4.5, power_saved_kw) * 8760.0
        annual_cost_usd = round(annual_kwh_saved * econ.blended_electricity_usd_per_kwh, 0)
        annual_carbon_tons = round((annual_kwh_saved * latest.carbon_intensity_g_per_kwh) / 1_000_000.0, 1)
        min_margin = min(r.thermal_margin_c for r in engine.racks.values())

        return OptimizationRecommendation(
            current_pue=latest.pue,
            projected_pue=projected_pue,
            power_saved_kw=max(4.5, power_saved_kw),
            annual_cost_savings_usd=max(2500.0, annual_cost_usd),
            annual_carbon_saved_tons=max(6.0, annual_carbon_tons),
            thermal_safety_margin_c=round(min_margin, 1),
            auto_pilot_active=engine.auto_optimize,
            actions=actions[:5],
        )

    def run_whatif_simulation(self, engine: DataHallTwinEngine, req: WhatIfRequest) -> WhatIfResponse:
        baseline_metrics = engine.history[-1]
        sandbox = engine.clone_for_whatif()
        limits = sandbox.site_config.ashrae_limits

        configured_rows = [r.row_id for r in sandbox.site_config.rows]
        default_row = "ROW-C" if "ROW-C" in configured_rows else configured_rows[-1]
        target_row = req.target_row if (req.target_row in configured_rows) else default_row

        row_racks = sandbox.get_racks_for_rows([target_row])
        rack_cnt = max(1, len(row_racks))

        if req.add_gpu_load_kw != 0.0:
            per_rack_kw = req.add_gpu_load_kw / float(rack_cnt)
            sandbox.row_load_boost_kw[target_row] = sandbox.row_load_boost_kw.get(target_row, 0.0) + per_rack_kw
            for rk in row_racks:
                rk.max_power_kw = max(rk.max_power_kw, rk.power_kw + per_rack_kw * 1.15)

        first_cdu_id = next(iter(sandbox.cdus.keys()), None)
        if req.convert_air_to_liquid and first_cdu_id:
            for rk in row_racks:
                if rk.cooling_type == CoolingType.AIR:
                    rk.cooling_type = CoolingType.HYBRID_LIQUID
                    rk.cdu_id = first_cdu_id
                    sandbox.rack_specs[rk.rack_id].cooling_type = CoolingType.HYBRID_LIQUID
                    sandbox.rack_specs[rk.rack_id].cdu_id = first_cdu_id
                    if target_row not in sandbox.cdus[first_cdu_id].served_rows:
                        sandbox.cdus[first_cdu_id].served_rows.append(target_row)
                    sandbox.graph.add_edge(first_cdu_id, rk.rack_id, layer="liquid_cooling", capacity_kw=rk.max_power_kw * 0.8)

        if req.crac_failure_id and req.crac_failure_id in sandbox.cracs:
            sandbox.cracs[req.crac_failure_id].enabled = False
            sandbox.cracs[req.crac_failure_id].fan_speed_pct = 0.0

        if req.cdu_pump_degradation_pct > 0 and first_cdu_id:
            factor = max(0.35, 1.0 - (req.cdu_pump_degradation_pct / 100.0))
            sandbox.cdu_fouling_factor[first_cdu_id] = factor

        if req.crac_setpoint_c is not None:
            for c in sandbox.cracs.values():
                c.supply_air_setpoint_c = req.crac_setpoint_c

        if req.cdu_setpoint_c is not None:
            for c in sandbox.cdus.values():
                c.supply_temp_setpoint_c = req.cdu_setpoint_c

        if req.ambient_wetbulb_c is not None:
            sandbox.outdoor_wetbulb_c = req.ambient_wetbulb_c
            sandbox.outdoor_drybulb_c = req.ambient_wetbulb_c + 8.5

        if req.workload_rebalance:
            # Facility-only closed-loop cooling optimization (never touches customer workloads)
            sandbox.auto_optimize = True

        proj_metrics = baseline_metrics
        for _ in range(18):
            proj_metrics = sandbox.step(dt_sec=3.0)

        def make_comp(name: str, unit: str, base: float, proj: float, better: str) -> WhatIfComparisonMetric:
            prec = 3 if unit == "ratio" else 1
            delta = round(proj - base, prec)
            pct = round(((proj - base) / max(abs(base), 1e-4)) * 100.0, 1)
            return WhatIfComparisonMetric(
                metric=name,
                unit=unit,
                baseline=round(base, prec),
                projected=round(proj, prec),
                delta=delta,
                delta_pct=pct,
                better_when=better,
            )

        comparisons = [
            make_comp("Facility PUE", "ratio", baseline_metrics.pue, proj_metrics.pue, "lower"),
            make_comp("Total Facility Power", "kW", baseline_metrics.total_facility_power_kw, proj_metrics.total_facility_power_kw, "lower"),
            make_comp("IT Compute Load", "kW", baseline_metrics.total_it_power_kw, proj_metrics.total_it_power_kw, "higher"),
            make_comp("Cooling Plant Power", "kW", baseline_metrics.total_cooling_power_kw, proj_metrics.total_cooling_power_kw, "lower"),
            make_comp("Peak Cold-Aisle Inlet", "°C", baseline_metrics.max_inlet_temp_c, proj_metrics.max_inlet_temp_c, "lower"),
            make_comp("Peak GPU Junction Temp", "°C", baseline_metrics.max_chip_temp_c, proj_metrics.max_chip_temp_c, "lower"),
            make_comp("Carbon Emissions", "kg/hr", baseline_metrics.carbon_emissions_kg_per_hr, proj_metrics.carbon_emissions_kg_per_hr, "lower"),
        ]

        affected_racks: List[Dict[str, Any]] = []
        for rid, s_rk in sandbox.racks.items():
            b_rk = engine.racks[rid]
            d_chip = round(s_rk.chip_temp_c - b_rk.chip_temp_c, 1)
            d_inlet = round(s_rk.inlet_temp_c - b_rk.inlet_temp_c, 1)
            d_power = round(s_rk.power_kw - b_rk.power_kw, 1)
            if abs(d_chip) >= 0.8 or abs(d_inlet) >= 0.6 or abs(d_power) >= 2.0:
                affected_racks.append({
                    "rack_id": rid,
                    "row_id": s_rk.row_id,
                    "baseline_power_kw": round(b_rk.power_kw, 1),
                    "projected_power_kw": round(s_rk.power_kw, 1),
                    "baseline_inlet_c": round(b_rk.inlet_temp_c, 1),
                    "projected_inlet_c": round(s_rk.inlet_temp_c, 1),
                    "baseline_chip_c": round(b_rk.chip_temp_c, 1),
                    "projected_chip_c": round(s_rk.chip_temp_c, 1),
                    "delta_chip_c": d_chip,
                    "status": s_rk.status.value,
                })
        affected_racks.sort(key=lambda x: abs(x["delta_chip_c"]), reverse=True)

        recs: List[str] = []
        if proj_metrics.max_chip_temp_c >= limits.chip_throttle_c or proj_metrics.max_inlet_temp_c >= 29.5:
            risk = Severity.CRITICAL
            recs.append(
                f"CRITICAL THERMAL RISK: Peak temperature reaches {proj_metrics.max_chip_temp_c:.1f}°C on {proj_metrics.max_chip_rack_id}. Pre-cool CDU supply water to 21.0°C before energizing this cage."
            )
        elif proj_metrics.max_chip_temp_c >= limits.chip_warning_c or proj_metrics.max_inlet_temp_c >= (limits.air_inlet_recommend_max_c - 0.2):
            risk = Severity.WARNING
            recs.append(
                f"Thermal margin narrows on {proj_metrics.max_chip_rack_id} ({proj_metrics.max_chip_temp_c:.1f}°C). Increase CDU pump VFD speed by +15% to preserve SLA buffer."
            )
        else:
            risk = Severity.NORMAL
            recs.append(
                f"All {len(sandbox.racks)} racks remain within ASHRAE A1 and liquid thermal envelopes (peak {proj_metrics.max_chip_temp_c:.1f}°C)."
            )

        if req.convert_air_to_liquid:
            recs.append(
                f"Direct-to-chip liquid retrofit in {target_row} captures ~76% of rack heat in the warm-water loop, lowering PUE from {baseline_metrics.pue:.3f} to {proj_metrics.pue:.3f}."
            )
        if req.add_gpu_load_kw > 0:
            row_pdu = next((p for p in sandbox.pdus.values() if p.row_id == target_row), None)
            if row_pdu:
                recs.append(
                    f"Adding +{req.add_gpu_load_kw:.0f} kW in {target_row} brings {row_pdu.pdu_id} load to {row_pdu.load_pct:.1f}% of rated capacity."
                )
        if proj_metrics.pue < baseline_metrics.pue:
            recs.append(
                f"Projected PUE improves by {baseline_metrics.pue - proj_metrics.pue:.3f} ({proj_metrics.pue:.3f}), saving ${(baseline_metrics.energy_cost_usd_per_hr - proj_metrics.energy_cost_usd_per_hr) * 8760:,.0f}/year."
            )

        annual_dollar_impact = round(
            (proj_metrics.energy_cost_usd_per_hr - baseline_metrics.energy_cost_usd_per_hr) * 8760.0, 0
        )
        summary = (
            f"Simulated '{req.name}' across {len(sandbox.racks)} racks: Facility power moves from "
            f"{baseline_metrics.total_facility_power_kw:.0f} kW → {proj_metrics.total_facility_power_kw:.0f} kW, "
            f"PUE shifts {baseline_metrics.pue:.3f} → {proj_metrics.pue:.3f}, and peak temperature reaches "
            f"{proj_metrics.max_chip_temp_c:.1f}°C ({proj_metrics.max_chip_rack_id})."
        )

        return WhatIfResponse(
            scenario_name=req.name,
            summary=summary,
            risk_level=risk,
            metrics_comparison=comparisons,
            affected_racks=affected_racks[:10],
            ai_recommendations=recs,
            baseline_pue=baseline_metrics.pue,
            projected_pue=proj_metrics.pue,
            annual_dollar_impact_usd=annual_dollar_impact,
        )
