"""
Shared Application Runtime Container (`backend/api/deps.py`).

Provides centralized, testable access to the Digital Twin engine, AI service facade,
DuckDB historian, enterprise connector manager, and BACnet/telemetry adapter.
"""

from __future__ import annotations
import os
from typing import List
from fastapi import WebSocket

from adapters import SimulatedTwinAdapter
from ai_engine import DataCenterAIService
from connectors import EnterpriseConnectorManager
from models import TwinStateSnapshot
from simulator import DataHallTwinEngine
from telemetry_store import DuckDBTelemetryStore


DATA_DIR = os.path.abspath(
    os.getenv(
        "DCTWIN_DATA_DIR",
        os.path.join(os.path.dirname(__file__), "..", "..", "data"),
    )
)


class TwinRuntimeContainer:
    def __init__(self, data_dir: str = DATA_DIR) -> None:
        self.twin_engine = DataHallTwinEngine()
        self.telemetry_adapter = SimulatedTwinAdapter(self.twin_engine)
        self.ai_service = DataCenterAIService()
        self.telemetry_store = DuckDBTelemetryStore(data_dir=data_dir)
        self.connector_manager = EnterpriseConnectorManager()
        self.connected_clients: List[WebSocket] = []

    def build_snapshot(self) -> TwinStateSnapshot:
        forecasts, anomalies = self.ai_service.update_forecasts_and_anomalies(self.twin_engine)
        optimization = self.ai_service.compute_optimization(self.twin_engine)
        latest_facility = self.twin_engine.history[-1]

        return TwinStateSnapshot(
            facility=latest_facility,
            racks=list(self.twin_engine.racks.values()),
            cracs=list(self.twin_engine.cracs.values()),
            cdus=list(self.twin_engine.cdus.values()),
            pdus=list(self.twin_engine.pdus.values()),
            ups_units=list(self.twin_engine.ups_units.values()),
            anomalies=anomalies,
            forecasts=forecasts,
            optimization=optimization,
            history=self.twin_engine.history[-50:],
            active_scenarios=self.twin_engine.active_scenarios,
        )


runtime = TwinRuntimeContainer()
