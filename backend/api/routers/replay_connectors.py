"""
24-Hour DuckDB / Parquet Historian Replay & Facility Protocol Connectors Router.
"""

from __future__ import annotations
from typing import List
from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from api.deps import runtime
from models import (
    BYODIngestRequest,
    BYODIngestResponse,
    ConnectorSpec,
    ConnectorTestRequest,
    ConnectorTestResponse,
    DatasetInfo,
    ReplaySeekRequest,
    ReplayTimelinePoint,
    TwinStateSnapshot,
)

router = APIRouter(tags=["replay-and-connectors"])


@router.get("/api/datasets", response_model=List[DatasetInfo])
def list_public_datasets() -> List[DatasetInfo]:
    return runtime.telemetry_store.list_datasets()


@router.get("/api/replay/{dataset_id}", response_model=List[ReplayTimelinePoint])
def get_dataset_replay_timeline(dataset_id: str) -> List[ReplayTimelinePoint]:
    return runtime.telemetry_store.get_timeline(dataset_id)


@router.post("/api/replay/seek", response_model=TwinStateSnapshot)
def seek_replay_timestamp(req: ReplaySeekRequest) -> TwinStateSnapshot:
    runtime.telemetry_store.apply_historical_step_to_twin(
        runtime.twin_engine, req.dataset_id, req.step_index
    )
    return runtime.build_snapshot()


@router.get("/api/connectors", response_model=List[ConnectorSpec])
def list_enterprise_connectors() -> List[ConnectorSpec]:
    return runtime.connector_manager.list_connectors()


@router.post("/api/connectors/test", response_model=ConnectorTestResponse)
def test_enterprise_connector(req: ConnectorTestRequest) -> ConnectorTestResponse:
    return runtime.connector_manager.test_and_sync_connector(runtime.twin_engine, req)


@router.get("/api/connectors/sample-csv/{vendor_profile}")
def download_sample_vendor_csv(vendor_profile: str) -> PlainTextResponse:
    filename, content = runtime.connector_manager.generate_sample_vendor_csv(vendor_profile)
    return PlainTextResponse(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/api/connectors/ingest-byod", response_model=BYODIngestResponse)
def ingest_byod_telemetry(req: BYODIngestRequest) -> BYODIngestResponse:
    return runtime.connector_manager.ingest_byod_csv(
        req, runtime.telemetry_store, runtime.twin_engine
    )
