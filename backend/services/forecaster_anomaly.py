"""
Multivariate Anomaly Detection (`IsolationForest` + Physics Residual) & Thermal Forecaster.

Strictly honors the Critical Facilities demarcation boundary: all root-cause diagnostics
and recommended actions target BMS / CRAC / CDU / Containment controls only (never server OS/jobs).
"""

from __future__ import annotations
import math
from typing import List, Tuple
import numpy as np
from sklearn.ensemble import IsolationForest

from models import AnomalyEvent, ForecastHorizonPoint, Severity
from simulator import DataHallTwinEngine


class ForecasterAnomalyService:
    def __init__(self) -> None:
        self.iso_forest = IsolationForest(
            n_estimators=80,
            contamination=0.1,
            random_state=42,
        )
        self._fit_baseline_detector()

    def _fit_baseline_detector(self) -> None:
        rng = np.random.default_rng(42)
        normal_samples = np.column_stack([
            rng.normal(20.5, 1.4, 300),
            rng.normal(11.5, 2.0, 300),
            rng.normal(2.6, 0.35, 300),
            rng.uniform(0.3, 0.9, 300),
        ])
        self.iso_forest.fit(normal_samples)

    def update_forecasts_and_anomalies(
        self, engine: DataHallTwinEngine
    ) -> Tuple[List[ForecastHorizonPoint], List[AnomalyEvent]]:
        racks_list = list(engine.racks.values())
        limits = engine.site_config.ashrae_limits

        features = []
        for rk in racks_list:
            delta_t_air = rk.outlet_temp_c - rk.inlet_temp_c
            chip_ratio = rk.chip_temp_c / max(rk.inlet_temp_c, 10.0)
            power_ratio = rk.power_kw / max(rk.max_power_kw, 1.0)
            features.append([rk.inlet_temp_c, delta_t_air, chip_ratio, power_ratio])

        X = np.array(features, dtype=float)
        raw_scores = -self.iso_forest.score_samples(X)

        anomalies: List[AnomalyEvent] = []
        now = engine.history[-1].timestamp if engine.history else 0.0

        hist = engine.history[-15:]
        if len(hist) >= 4:
            denom = max(len(hist) * 0.2, 1.0)
            power_trend = (hist[-1].total_it_power_kw - hist[0].total_it_power_kw) / denom
            inlet_trend = (hist[-1].max_inlet_temp_c - hist[0].max_inlet_temp_c) / denom
            chip_trend = (hist[-1].max_chip_temp_c - hist[0].max_chip_temp_c) / denom
        else:
            power_trend = inlet_trend = chip_trend = 0.0

        for idx, rk in enumerate(racks_list):
            expected_inlet = 19.5 + 0.025 * rk.power_kw
            inlet_residual = max(0.0, rk.inlet_temp_c - expected_inlet)
            chip_excess = max(0.0, rk.chip_temp_c - 64.0)

            score = float(
                np.clip((raw_scores[idx] - 0.42) * 1.4 + inlet_residual * 0.08 + chip_excess * 0.04, 0.02, 0.99)
            )
            rk.anomaly_score = round(score, 2)

            thermal_drift = 0.45 if rk.rack_id in engine.rack_recirc_fault else 0.0
            if rk.cdu_id and engine.cdu_fouling_factor.get(rk.cdu_id, 1.0) < 0.85:
                thermal_drift += 1.6
            rk.predicted_inlet_15m_c = round(
                rk.inlet_temp_c + float(np.clip(inlet_trend * 3.0 + thermal_drift * 0.6, -1.5, 4.5)), 1
            )
            rk.predicted_chip_15m_c = round(
                rk.chip_temp_c + float(np.clip(chip_trend * 3.0 + thermal_drift * 1.5, -2.5, 7.5)), 1
            )

            if rk.rack_id in engine.rack_recirc_fault or rk.inlet_temp_c >= (limits.air_inlet_recommend_max_c + 0.2):
                anomalies.append(
                    AnomalyEvent(
                        id=f"ANOM-RECIRC-{rk.rack_id}",
                        timestamp=now,
                        component_id=rk.rack_id,
                        component_type="rack",
                        severity=Severity.CRITICAL if rk.inlet_temp_c >= 29.5 else Severity.WARNING,
                        category="recirculation",
                        title=f"Cold-Aisle Recirculation Anomaly on {rk.rack_id}",
                        description=(
                            f"Inlet temperature reached {rk.inlet_temp_c:.1f}°C "
                            f"(+{inlet_residual:.1f}°C above physics baseline for {rk.power_kw:.1f} kW load)."
                        ),
                        anomaly_score=rk.anomaly_score,
                        root_cause="Hot exhaust air bypassing containment damper or insufficient local CRAC static pressure.",
                        recommended_action=(
                            f"Increase zone CRAC VFD fan speed by +15% and inspect aisle containment seal & blanking panels at {rk.row_id}."
                        ),
                    )
                )
            elif rk.chip_temp_c >= 73.0:
                cdu_label = rk.cdu_id or "zone cooling loop"
                anomalies.append(
                    AnomalyEvent(
                        id=f"ANOM-CHIP-{rk.rack_id}",
                        timestamp=now,
                        component_id=rk.rack_id,
                        component_type="rack",
                        severity=Severity.CRITICAL if rk.chip_temp_c >= limits.chip_throttle_c else Severity.WARNING,
                        category="thermal_runaway",
                        title=f"High Rack Thermal Load & Return Temp on {rk.rack_id}",
                        description=(
                            f"Manifold/rack thermal proxy at {rk.chip_temp_c:.1f}°C "
                            f"(15m forecast: {rk.predicted_chip_15m_c:.1f}°C). Margin down to {rk.thermal_margin_c:.1f}°C."
                        ),
                        anomaly_score=rk.anomaly_score,
                        root_cause=(
                            f"High rack branch draw ({rk.power_kw:.1f} kW) paired with elevated coolant return "
                            f"({rk.coolant_return_temp_c or rk.outlet_temp_c:.1f}°C)."
                        ),
                        recommended_action=(
                            f"Lower {cdu_label} supply setpoint by 2.0°C and boost secondary pump VFD speed by +15% to widen thermal margin."
                        ),
                    )
                )

        for crac in engine.cracs.values():
            if not crac.enabled or crac.fan_speed_pct <= 5.0:
                anomalies.append(
                    AnomalyEvent(
                        id=f"ANOM-CRAC-{crac.crac_id}",
                        timestamp=now,
                        component_id=crac.crac_id,
                        component_type="crac",
                        severity=Severity.CRITICAL,
                        category="fan_fault",
                        title=f"{crac.name} Blower Offline / Fault",
                        description=(
                            f"{crac.crac_id} airflow dropped to 0 CFM. Served rows ({', '.join(crac.served_rows)}) "
                            f"experiencing asymmetric static pressure loss."
                        ),
                        anomaly_score=0.98,
                        root_cause="VFD inverter trip on supply blower motor.",
                        recommended_action=(
                            f"Boost peer zone CRAC fan speed to 92% immediately and dispatch BMS technician to inspect {crac.crac_id} VFD."
                        ),
                    )
                )

        for cdu_id, cdu in engine.cdus.items():
            fouling = engine.cdu_fouling_factor.get(cdu_id, 1.0)
            if fouling < 0.85 or not cdu.enabled:
                anomalies.append(
                    AnomalyEvent(
                        id=f"ANOM-CDU-{cdu_id}",
                        timestamp=now,
                        component_id=cdu_id,
                        component_type="cdu",
                        severity=Severity.CRITICAL if fouling < 0.65 else Severity.WARNING,
                        category="cdu_degradation",
                        title=f"{cdu.name} Heat Exchanger Degradation",
                        description=(
                            f"Flow rate reduced to {cdu.total_flow_lpm:.0f} LPM at {cdu.pressure_kpa:.0f} kPa "
                            f"differential pressure. Approach ΔT widening."
                        ),
                        anomaly_score=0.92,
                        root_cause="Secondary loop 50µm strainer ΔP buildup / plate heat-exchanger fouling.",
                        recommended_action=(
                            f"Switch {cdu_id} to redundant duplex strainer & standby pump (92% speed) and lower primary CHW valve setpoint to 21.5°C."
                        ),
                    )
                )

        anomalies.sort(key=lambda a: (0 if a.severity == Severity.CRITICAL else 1, -a.anomaly_score))

        latest = engine.history[-1]
        forecasts: List[ForecastHorizonPoint] = []
        has_fault = any(s != "normal" for s in engine.active_scenarios)

        for h_min in (1, 5, 10, 15, 30):
            scale = math.log1p(h_min) * 1.35
            pred_it = latest.total_it_power_kw + power_trend * scale + 12.0 * math.sin(h_min * 0.25)
            drift_inlet = (
                0.35 * scale if has_fault and not engine.auto_optimize else (-0.1 * scale if engine.auto_optimize else 0.05 * scale)
            )
            drift_chip = (
                0.85 * scale if has_fault and not engine.auto_optimize else (-0.25 * scale if engine.auto_optimize else 0.12 * scale)
            )

            pred_inlet = float(np.clip(latest.max_inlet_temp_c + inlet_trend * scale + drift_inlet, 18.0, 36.0))
            pred_chip = float(np.clip(latest.max_chip_temp_c + chip_trend * scale + drift_chip, 45.0, 89.0))
            pred_pue = float(
                np.clip(
                    latest.pue + (0.008 * scale if has_fault and not engine.auto_optimize else (-0.006 * scale if engine.auto_optimize else 0.0)),
                    1.08,
                    1.65,
                )
            )
            pred_fac = pred_it * pred_pue
            band = 0.6 + 0.12 * h_min
            risk = float(np.clip((pred_chip - 64.0) * 3.8 + (pred_inlet - 24.5) * 6.5, 2.0, 99.0))

            forecasts.append(
                ForecastHorizonPoint(
                    horizon_min=h_min,
                    predicted_it_power_kw=round(pred_it, 1),
                    predicted_facility_power_kw=round(pred_fac, 1),
                    predicted_pue=round(pred_pue, 3),
                    predicted_max_inlet_c=round(pred_inlet, 2),
                    predicted_max_chip_c=round(pred_chip, 2),
                    upper_bound_chip_c=round(pred_chip + band, 2),
                    lower_bound_chip_c=round(pred_chip - band, 2),
                    hotspot_risk_pct=round(risk, 1),
                )
            )

        return forecasts, anomalies[:8]
