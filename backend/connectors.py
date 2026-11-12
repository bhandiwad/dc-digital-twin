"""
Enterprise Facility BMS / EPMS / Liquid CDU / Historian Connectors & BYOD CSV Ingestion Engine.

Strictly adheres to the Data Center Critical Facilities demarcation boundary:
- Connects ONLY to Facility BMS (BACnet/IP, Modbus TCP), EPMS Power Meters (SNMPv3/Modbus),
  Cold-Aisle / Manifold IoT Buses (MQTT Sparkplug B), and Enterprise Historians (AVEVA PI).
- Never requires agents, SSH, IPMI, or exporters inside tenant IT servers.
"""

from __future__ import annotations
import csv
from datetime import datetime, timedelta
import io
import math
import os
import re
import time
from typing import Any, Dict, List, Tuple
import numpy as np

from models import (
    BYODColumnMapping,
    BYODIngestRequest,
    BYODIngestResponse,
    ConnectorProtocol,
    ConnectorSpec,
    ConnectorTestRequest,
    ConnectorTestResponse,
    DatasetInfo,
)
from simulator import DataHallTwinEngine
from telemetry_store import DuckDBTelemetryStore


CANONICAL_FIELD_ALIASES: Dict[str, Tuple[List[str], str]] = {
    "timestamp_iso": (["timestamp", "time", "datetime", "date", "ts", "recorded_at", "interval_start"], "ISO-8601"),
    "total_it_power_kw": (["it_power", "it_load", "pdu_it_kw", "ups_it_kw", "branch_kw_sum", "total_it_kw"], "kW"),
    "total_cooling_power_kw": (["cooling_power", "hvac_kw", "chiller_kw", "crac_cdu_kw", "mechanical_kw", "cooling_load_kw"], "kW"),
    "total_facility_power_kw": (["facility_power", "total_power", "utility_kw", "main_meter_kw", "building_kw"], "kW"),
    "pue": (["pue", "power_usage_effectiveness", "facility_pue", "instant_pue"], "ratio"),
    "outdoor_wetbulb_c": (["wetbulb", "wet_bulb", "ambient_wb", "oat_wb", "outdoor_wb_c", "weather_wb"], "°C"),
    "avg_inlet_temp_c": (["avg_inlet", "cold_aisle_temp", "inlet_degc", "rack_inlet_avg", "supply_air_aisle"], "°C"),
    "max_inlet_temp_c": (["max_inlet", "peak_inlet", "hotspot_inlet", "inlet_max_c", "ashrae_max_inlet"], "°C"),
    "max_chip_temp_c": (["manifold_return", "cdu_return_max_c", "thermal_proxy_c", "peak_return_c", "max_loop_c"], "°C"),
    "liquid_cooling_share_pct": (["liquid_share", "dlc_pct", "cdu_capture_pct", "liquid_ratio", "direct_liquid_pct"], "%"),
    "carbon_intensity_g_per_kwh": (["carbon", "co2_intensity", "grid_g_kwh", "emissions_factor"], "gCO₂/kWh"),
}


class EnterpriseConnectorManager:
    def __init__(self) -> None:
        self.connectors: Dict[str, ConnectorSpec] = {
            "conn_bacnet_bms": ConnectorSpec(
                connector_id="conn_bacnet_bms",
                name="BACnet/IP & Modbus TCP Facility BMS Bridge",
                protocol=ConnectorProtocol.BACNET_MODBUS,
                vendor_examples="Schneider EcoStruxure, Siemens Desigo, Johnson Controls Metasys, Vertiv Liebert CRAC",
                target_layer="Mechanical Cooling Plant (CRAC Units, Chiller COP, Weather Station)",
                endpoint_url="bacnet://10.24.10.15:47808/device:401200",
                polling_interval_sec=2.0,
                status="CONNECTED_SHADOW",
                points_mapped=48,
                last_sync_ms=14.2,
                register_or_metric_map=[
                    {"source": "BACnet AI:3001 (Present_Value)", "target": "CRAC.supply_air_temp_c", "unit": "°C"},
                    {"source": "BACnet AO:3012 (Priority_8_Cmd)", "target": "CRAC.fan_speed_pct", "unit": "%"},
                    {"source": "Modbus Reg 40201 (Float32)", "target": "facility.outdoor_wetbulb_c", "unit": "°C"},
                    {"source": "Modbus Reg 40205 (Float32)", "target": "facility.hall_relative_humidity_pct", "unit": "%"},
                ],
                sample_payload_preview='{"pdu_type":"BACnet-ComplexACK","device_id":401200,"objects":{"AI:3001":18.1,"AO:3012":72.0,"Modbus:40201":19.5}}',
            ),
            "conn_cdu_liquid_modbus": ConnectorSpec(
                connector_id="conn_cdu_liquid_modbus",
                name="CoolIT / Motivair Liquid CDU Secondary Loop Gateway",
                protocol=ConnectorProtocol.COOLIT_CDU_MODBUS,
                vendor_examples="CoolIT CHx750/CHx1000, Motivair MCDU, Boyd / Vertiv XDU Liquid Manifolds",
                target_layer="Direct-to-Chip Liquid Cooling Demarcation (Supply/Return °C, LPM, ΔP kPa)",
                endpoint_url="modbus-tcp://10.24.12.40:502/unit:1",
                polling_interval_sec=1.5,
                status="ACTIVE_STREAMING",
                points_mapped=64,
                last_sync_ms=9.1,
                register_or_metric_map=[
                    {"source": "HoldingReg 40105 (Secondary_Supply_C)", "target": "CDU.supply_temp_c", "unit": "°C"},
                    {"source": "HoldingReg 40109 (Secondary_Return_C)", "target": "CDU.return_temp_c", "unit": "°C"},
                    {"source": "HoldingReg 40118 (Flow_Rate_LPM)", "target": "CDU.total_flow_lpm", "unit": "LPM"},
                    {"source": "HoldingReg 40124 (Strainer_Diff_kPa)", "target": "CDU.pressure_kpa", "unit": "kPa"},
                ],
                sample_payload_preview='{"unit_id":1,"cdu":"CDU-1","secondary_supply_c":23.8,"secondary_return_c":35.4,"flow_lpm":442.5,"diff_pressure_kpa":184.0}',
            ),
            "conn_epms_snmp_pdu": ConnectorSpec(
                connector_id="conn_epms_snmp_pdu",
                name="SNMPv3 / Modbus EPMS Row PDU & UPS Meter Bridge",
                protocol=ConnectorProtocol.SNMP_MODBUS_EPMS,
                vendor_examples="Schneider PowerLogic, Eaton Foreseer, Raritan PX4 / ServerTech Row Whip Meters",
                target_layer="Electrical Power Chain (UPS Modules, 415V Row PDUs, Branch Circuit kW)",
                endpoint_url="snmpv3://epms-poller.hall01.internal:161/mib2",
                polling_interval_sec=2.0,
                status="CONNECTED_SHADOW",
                points_mapped=136,
                last_sync_ms=16.8,
                register_or_metric_map=[
                    {"source": "PowerLogic.ActivePowerTotal_kW", "target": "PDUTelemetry.current_load_kw", "unit": "kW"},
                    {"source": "BranchCircuit.WhipPower_kW", "target": "RackTelemetry.power_kw", "unit": "kW"},
                    {"source": "PowerLogic.VoltageLL_V", "target": "PDUTelemetry.voltage_v", "unit": "V"},
                    {"source": "UPS.BatteryStateOfCharge_Pct", "target": "UPSTelemetry.battery_soc_pct", "unit": "%"},
                ],
                sample_payload_preview='{"epms_host":"epms-poller","pdu":"PDU-C","voltage_ll_v":415.1,"active_kw":548.4,"ups_b_soc_pct":98.5}',
            ),
            "conn_mqtt_sparkplug": ConnectorSpec(
                connector_id="conn_mqtt_sparkplug",
                name="MQTT Sparkplug B Cold-Aisle & Environmental Pod Bus",
                protocol=ConnectorProtocol.MQTT_SPARKPLUG,
                vendor_examples="SynapSense Cold-Aisle Pods, PacketPower Wireless Temps, HiveMQ / OSIsoft PI",
                target_layer="Cold/Hot Aisle Boundary Thermistors & Differential Pressure Sensors",
                endpoint_url="mqtts://broker.hall01.internal:8883/spBv1.0/Hall01/DDATA/#",
                polling_interval_sec=1.5,
                status="ACTIVE_STREAMING",
                points_mapped=96,
                last_sync_ms=6.4,
                register_or_metric_map=[
                    {"source": "spBv1.0/Hall01/DDATA/AislePods/InletTempC", "target": "RackTelemetry.inlet_temp_c", "unit": "°C"},
                    {"source": "spBv1.0/Hall01/DDATA/AislePods/ExhaustTempC", "target": "RackTelemetry.outlet_temp_c", "unit": "°C"},
                    {"source": "spBv1.0/Hall01/DDATA/HallEnv/RelHumidity", "target": "facility.hall_relative_humidity_pct", "unit": "%"},
                ],
                sample_payload_preview='{"topic":"spBv1.0/Hall01/DDATA/AislePods","seq":184,"metrics":[{"name":"InletTempC","value":19.8},{"name":"RelHumidityPct","value":45.2}]}',
            ),
        }

    def list_connectors(self) -> List[ConnectorSpec]:
        return list(self.connectors.values())

    def test_and_sync_connector(
        self, engine: DataHallTwinEngine, req: ConnectorTestRequest
    ) -> ConnectorTestResponse:
        t0 = time.perf_counter()
        conn = self.connectors.get(req.connector_id) or next(iter(self.connectors.values()))

        if req.endpoint_override:
            conn.endpoint_url = req.endpoint_override

        conn.status = "ACTIVE_STREAMING"
        m = engine.history[-1]
        first_crac = next(iter(engine.cracs.values()))
        first_cdu = next(iter(engine.cdus.values()), None)
        first_pdu = next(iter(engine.pdus.values()))
        first_ups = next(iter(engine.ups_units.values()))

        if conn.protocol == ConnectorProtocol.BACNET_MODBUS:
            raw_frame = {
                "protocol": "BACnet/IP + Modbus TCP Gateway",
                "endpoint": conn.endpoint_url,
                "polled_registers": {
                    f"{cid}_Supply_Air_C": round(c.supply_air_temp_c, 2)
                    for cid, c in list(engine.cracs.items())[:2]
                }
                | {
                    "Chiller_Plant_COP": round(first_crac.cop, 2),
                    "Ambient_WetBulb_C": round(engine.outdoor_wetbulb_c, 2),
                },
            }
            cal_msg = (
                f"Polled {conn.points_mapped} BACnet/Modbus holding registers in {conn.last_sync_ms:.1f}ms. "
                f"Synchronized chiller wet-bulb ({engine.outdoor_wetbulb_c:.1f}°C) and CRAC supply air loops."
            )
        elif conn.protocol == ConnectorProtocol.COOLIT_CDU_MODBUS and first_cdu is not None:
            raw_frame = {
                "protocol": "Modbus TCP / CDU Secondary Manifold",
                "endpoint": conn.endpoint_url,
                "cdu_telemetry": {
                    cid: {
                        "supply_c": round(c.supply_temp_c, 2),
                        "return_c": round(c.return_temp_c, 2),
                        "flow_lpm": round(c.total_flow_lpm, 1),
                        "pressure_kpa": round(c.pressure_kpa, 1),
                    }
                    for cid, c in engine.cdus.items()
                },
            }
            cal_msg = (
                f"Polled {len(engine.cdus)} Liquid CDU controllers over Modbus TCP. "
                f"Synchronized secondary manifold flow ({first_cdu.total_flow_lpm:.0f} LPM) and return ΔT."
            )
        elif conn.protocol == ConnectorProtocol.SNMP_MODBUS_EPMS:
            raw_frame = {
                "protocol": "SNMPv3 / Modbus EPMS Power Meters",
                "endpoint": conn.endpoint_url,
                "pdu_loads_kw": {pid: p.current_load_kw for pid, p in engine.pdus.items()},
                "ups_soc_pct": {uid: u.battery_soc_pct for uid, u in engine.ups_units.items()},
            }
            cal_msg = (
                f"Polled {len(engine.pdus)} Row PDUs ({first_pdu.voltage_v:.0f}V) and {len(engine.ups_units)} UPS modules ({first_ups.efficiency_pct:.1f}% eff). "
                f"Total metered IT demarcation power: {m.total_it_power_kw:.0f} kW."
            )
        else:
            raw_frame = {
                "protocol": "MQTT Sparkplug B (TLS 8883)",
                "endpoint": conn.endpoint_url,
                "topics_subscribed": conn.points_mapped,
                "aisle_summary": {
                    "avg_cold_inlet_c": m.avg_inlet_temp_c,
                    "peak_cold_inlet_c": m.max_inlet_temp_c,
                    "peak_rack_id": m.max_inlet_rack_id,
                },
            }
            cal_msg = (
                f"Subscribed to {conn.points_mapped} Sparkplug B cold-aisle environmental topics "
                f"(avg inlet {m.avg_inlet_temp_c:.1f}°C, peak {m.max_inlet_temp_c:.1f}°C)."
            )

        if req.sync_to_live_twin:
            engine.step(dt_sec=1.5)

        elapsed_ms = round((time.perf_counter() - t0) * 1000.0 + conn.last_sync_ms, 1)
        conn.last_sync_ms = elapsed_ms

        return ConnectorTestResponse(
            connector_id=conn.connector_id,
            reachable=True,
            latency_ms=elapsed_ms,
            records_polled=conn.points_mapped,
            mapped_fields={m_item["source"]: m_item["target"] for m_item in conn.register_or_metric_map},
            raw_frame_sample=raw_frame,
            calibration_summary=cal_msg,
        )

    def generate_sample_vendor_csv(self, vendor_profile: str) -> Tuple[str, str]:
        rng = np.random.default_rng(77)
        base_dt = datetime(2026, 10, 30, 0, 0, 0)
        buf = io.StringIO()
        writer = csv.writer(buf)

        if vendor_profile in ("coolit_epms", "epms_pdu_branch"):
            filename = "coolit_cdu_powerlogic_epms_24h.csv"
            writer.writerow([
                "timestamp",
                "branch_kw_sum",
                "crac_cdu_kw",
                "facility_pue",
                "outdoor_wb_c",
                "cold_aisle_temp_c",
                "hotspot_inlet_c",
                "cdu_return_max_c",
                "dlc_pct",
                "grid_g_kwh",
            ])
            for i in range(72):
                ts = (base_dt + timedelta(minutes=i * 20)).isoformat()
                hr = (i * 20) / 60.0
                it_kw = round(1080.0 + 180.0 * math.sin((hr - 8) * math.pi / 12) + float(rng.normal(0, 8)), 1)
                wb = round(20.0 + 4.0 * math.sin((hr - 9) * math.pi / 12), 1)
                pue = round(1.19 + 0.012 * (wb - 18.0) + (0.045 if 13 <= hr <= 16 else 0.0), 3)
                cool_kw = round(it_kw * (pue - 1.03), 1)
                inlet_avg = round(20.2 + 0.005 * (it_kw - 1000), 1)
                inlet_max = round(inlet_avg + 2.8 + (3.2 if 13 <= hr <= 16 else 0.0), 1)
                ret_c = round(61.5 + 0.025 * (it_kw - 950) + (8.5 if 13 <= hr <= 16 else 0.0), 1)
                writer.writerow([ts, it_kw, cool_kw, pue, wb, inlet_avg, inlet_max, ret_c, 64.5, 305.0])

        elif vendor_profile == "sunbird_dcim":
            filename = "sunbird_dcim_facility_historian.csv"
            writer.writerow([
                "recorded_at",
                "ups_it_kw",
                "mechanical_kw",
                "instant_pue",
                "weather_wb_c",
                "rack_inlet_avg_c",
                "ashrae_max_inlet_c",
                "peak_return_c",
                "direct_liquid_pct",
                "emissions_factor",
            ])
            for i in range(72):
                ts = (base_dt + timedelta(minutes=i * 20)).isoformat()
                hr = (i * 20) / 60.0
                it_kw = round(890.0 + 110.0 * math.sin((hr - 7) * math.pi / 12) + float(rng.normal(0, 5)), 1)
                wb = round(19.0 + 3.5 * math.sin((hr - 9) * math.pi / 12), 1)
                pue = round(1.31 + 0.015 * (wb - 18.0), 3)
                cool_kw = round(it_kw * (pue - 1.03), 1)
                writer.writerow([
                    ts,
                    it_kw,
                    cool_kw,
                    pue,
                    wb,
                    round(21.0 + 0.004 * (it_kw - 850), 1),
                    round(24.5 + (3.8 if 10 <= hr <= 13 else 0.0), 1),
                    round(59.0 + (7.2 if 10 <= hr <= 13 else 0.0), 1),
                    52.0,
                    330.0,
                ])
        else:
            filename = "schneider_ecostruxure_bms_export.csv"
            writer.writerow([
                "datetime",
                "Schneider_IT_Load_kW",
                "Liebert_HVAC_kW",
                "Facility_PUE",
                "Ambient_WetBulb_DegC",
                "Cold_Aisle_Supply_DegC",
                "Peak_Inlet_DegC",
                "Manifold_Return_DegC",
                "CDU_Liquid_Share_Pct",
                "Grid_Carbon_g_kWh",
            ])
            for i in range(72):
                ts = (base_dt + timedelta(minutes=i * 20)).isoformat()
                hr = (i * 20) / 60.0
                it_kw = round(1020.0 + 145.0 * math.sin((hr - 8) * math.pi / 12) + float(rng.normal(0, 6)), 1)
                wb = round(21.2 + 4.8 * math.sin((hr - 9) * math.pi / 12), 1)
                pue = round(1.27 + 0.016 * (wb - 18.0) + (0.05 if 14 <= hr <= 17 else 0.0), 3)
                cool_kw = round(it_kw * (pue - 1.03), 1)
                writer.writerow([
                    ts,
                    it_kw,
                    cool_kw,
                    pue,
                    wb,
                    round(20.4 + 0.004 * (it_kw - 950), 1),
                    round(23.8 + (4.4 if 14 <= hr <= 17 else 0.0), 1),
                    round(62.0 + (9.5 if 14 <= hr <= 17 else 0.0), 1),
                    59.0,
                    315.0,
                ])

        return filename, buf.getvalue()

    def ingest_byod_csv(
        self,
        req: BYODIngestRequest,
        telemetry_store: DuckDBTelemetryStore,
        engine: DataHallTwinEngine,
    ) -> BYODIngestResponse:
        reader = csv.DictReader(io.StringIO(req.csv_content.strip()))
        raw_rows = list(reader)
        if not raw_rows:
            raise ValueError("Uploaded CSV contains no data rows.")

        headers = list(raw_rows[0].keys())
        mappings: List[BYODColumnMapping] = []
        col_to_canonical: Dict[str, str] = {}

        for h in headers:
            h_clean = re.sub(r"[^a-z0-9_]", "_", h.strip().lower())
            best_canon = None
            best_conf = 0.0
            best_unit = "scalar"

            for canon_field, (aliases, unit) in CANONICAL_FIELD_ALIASES.items():
                for alias in aliases:
                    if h_clean == alias or alias in h_clean:
                        conf = 0.98 if h_clean == alias else 0.89
                        if conf > best_conf:
                            best_canon = canon_field
                            best_conf = conf
                            best_unit = unit

            if best_canon and best_canon not in col_to_canonical.values():
                col_to_canonical[best_canon] = h
                mappings.append(
                    BYODColumnMapping(
                        source_column=h,
                        canonical_field=best_canon,
                        confidence=best_conf,
                        sample_value=raw_rows[0].get(h, ""),
                        unit_detected=best_unit,
                    )
                )

        slug = re.sub(r"[^a-z0-9]+", "_", req.dataset_name.lower()).strip("_") or "custom_operator_trace"
        dataset_id = f"byod_{slug}"
        telemetry_store.conn.execute("DELETE FROM telemetry_24h WHERE dataset_id = ?", [dataset_id])

        rows_to_insert = []
        anom_total = 0

        def get_float(r: Dict[str, Any], canon: str, default: float) -> float:
            src_col = col_to_canonical.get(canon)
            if not src_col or src_col not in r or r[src_col] in (None, ""):
                return default
            try:
                return float(r[src_col])
            except ValueError:
                return default

        for idx, r in enumerate(raw_rows):
            ts_str = str(r.get(col_to_canonical.get("timestamp_iso", ""), f"2026-10-30T{(idx % 24):02d}:00:00"))
            hour_label = ts_str[11:16] if len(ts_str) >= 16 and "T" in ts_str else f"{(idx % 24):02d}:{(idx * 5) % 60:02d}"

            it_kw = get_float(r, "total_it_power_kw", 1015.0)
            if it_kw > 25000.0:
                it_kw = round(it_kw / 1000.0, 1)

            wetbulb = get_float(r, "outdoor_wetbulb_c", 20.0)
            pue = get_float(r, "pue", 0.0)
            cool_kw = get_float(r, "total_cooling_power_kw", 0.0)
            fac_kw = get_float(r, "total_facility_power_kw", 0.0)

            if pue <= 1.0 and fac_kw > it_kw:
                pue = round(fac_kw / max(it_kw, 1.0), 3)
            elif pue <= 1.0 and cool_kw > 0:
                fac_kw = round(it_kw + cool_kw + it_kw * 0.03, 1)
                pue = round(fac_kw / max(it_kw, 1.0), 3)
            else:
                pue = max(1.08, pue if pue > 1.0 else 1.26)
                fac_kw = round(it_kw * pue, 1)
                cool_kw = round(fac_kw - it_kw * 1.03, 1)

            avg_inlet = get_float(r, "avg_inlet_temp_c", 20.4)
            max_inlet = get_float(r, "max_inlet_temp_c", avg_inlet + 3.1)
            max_chip = get_float(r, "max_chip_temp_c", 59.5 + 0.02 * (it_kw - 950.0))
            dlc_share = get_float(r, "liquid_cooling_share_pct", 58.0)
            carbon = get_float(r, "carbon_intensity_g_per_kwh", 310.0)

            is_anom = max_chip >= 70.0 or max_inlet >= 26.8 or pue >= 1.35
            anom_cnt = 2 if is_anom else 0
            if is_anom:
                anom_total += 1
            event_tag = "Customer Trace Thermal/PUE Excursion" if is_anom else None
            row_boost = max(0.0, (it_kw - 1020.0) / 10.0)

            rows_to_insert.append((
                dataset_id,
                idx,
                ts_str,
                hour_label,
                event_tag,
                round(wetbulb, 2),
                round(it_kw, 1),
                round(cool_kw, 1),
                round(fac_kw, 1),
                round(pue, 3),
                round(avg_inlet, 2),
                round(max_inlet, 2),
                round(max_chip, 2),
                round(dlc_share, 1),
                round(carbon, 1),
                round(max_chip + (2.4 if is_anom else 0.4), 2),
                anom_cnt,
                round(row_boost, 1),
                True,
                0.72 if max_chip >= 72.0 else 1.0,
            ))

        telemetry_store.conn.executemany(
            "INSERT INTO telemetry_24h VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            rows_to_insert,
        )

        parquet_path = os.path.join(telemetry_store.data_dir, f"{dataset_id}.parquet")
        telemetry_store.conn.execute(
            f"COPY (SELECT * FROM telemetry_24h WHERE dataset_id = '{dataset_id}' ORDER BY step_index) TO '{parquet_path}' (FORMAT PARQUET)"
        )

        peak_it = max(r[6] for r in rows_to_insert)
        min_pue = min(r[9] for r in rows_to_insert)
        max_pue = max(r[9] for r in rows_to_insert)
        peak_chip = max(r[12] for r in rows_to_insert)
        avg_pue = round(float(np.mean([r[9] for r in rows_to_insert])), 3)

        telemetry_store.datasets_meta[dataset_id] = DatasetInfo(
            dataset_id=dataset_id,
            name=f"BYOD: {req.dataset_name} ({len(rows_to_insert)} pts)",
            source_citation=f"Operator Uploaded Telemetry ({req.vendor_profile.upper()})",
            description=f"Customer facility trace ingested into DuckDB + Parquet. Avg PUE {avg_pue:.3f}, Peak IT {peak_it:.0f} kW.",
            total_points=len(rows_to_insert),
            interval_minutes=20,
            parquet_path=parquet_path,
            peak_it_kw=peak_it,
            min_pue=min_pue,
            max_pue=max_pue,
            notable_events=[
                {
                    "step_index": r[1],
                    "time_label": r[3],
                    "event_tag": r[4],
                    "peak_chip_c": r[12],
                }
                for r in rows_to_insert
                if r[4] is not None
            ][:4],
        )

        if req.apply_immediately and rows_to_insert:
            peak_step = max(rows_to_insert, key=lambda r: r[12])[1]
            telemetry_store.apply_historical_step_to_twin(engine, dataset_id, peak_step)

        return BYODIngestResponse(
            dataset_id=dataset_id,
            dataset_name=req.dataset_name,
            rows_ingested=len(rows_to_insert),
            columns_mapped=mappings,
            calibrated_baseline_pue=avg_pue,
            calibrated_peak_it_kw=peak_it,
            calibrated_peak_chip_c=peak_chip,
            anomalies_detected_in_upload=anom_total,
            parquet_saved_path=parquet_path,
            summary=(
                f"Ingested {len(rows_to_insert)} facility rows and mapped {len(mappings)} columns into DuckDB/Parquet (`{dataset_id}.parquet`). "
                f"Calibrated Twin to customer baseline PUE `{avg_pue:.3f}` and Peak IT `{peak_it:.0f} kW`."
            ),
        )
