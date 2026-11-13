# PRD-07: Automated 24x7 NOC Shift Handover Digest & Sign-Off Log

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-07` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Quick-Win Customer Implementation (`Simple • Daily NOC Stickiness`) |
| **Estimated Effort** | `Small (2–3 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / NOC Operations** — Zero tenant server access |
| **Target Codebase Touchpoints** | `backend/services/noc_shift_digest.py`, `backend/api/features/noc_shift_digest.py`, `frontend/src/components/workbench/features/NocShiftDigestPanel.tsx` |

---

## 1. Problem Statement & Operator Value

Critical facilities run `24×7×365` across 8-hour or 12-hour shifts (`Day 06:00–18:00` / `Night 18:00–06:00`). At every shift change, outgoing watch engineers spend `20–30 minutes` manually pulling BMS trend screenshots, listing setpoint overrides, summarizing thermal/electrical anomalies, and typing handover emails in Word or Outlook. Crucial context (like a manual CRAC fan speed override or gradual CDU strainer drift) is routinely missed between shifts, causing human-error incidents.

An **Automated `24×7` NOC Shift Handover Digest & Sign-Off Log** gives operators daily operational value on Day 1 of installation with zero control risk.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** `DuckDBTelemetryStore` historical facility/cooling trends, active BMS scenarios, manual/AI setpoint overrides on `CRAC/CDU`, UPS BESS SOC, and operator-entered shift notes.
* **Prohibited Signals:** No tenant server logs, maintenance tickets inside guest VMs, or IT workload schedules.

---

## 3. User Stories

1. **As an Outgoing Shift Engineer**, I want to click **`Generate Shift Handover`** for the last `8h` or `12h` window and get an instant structured summary of **Peak/Min/Avg IT & Facility kW, PUE range, Peak Thermal Hotspots, Active Overrides/Faults, and Standing Watch Items**.
2. **As an Incoming Shift Lead**, I want to enter my name, review outgoing engineer notes, acknowledge open standing orders, and record a timestamped **Shift Sign-Off** stored persistently in `DuckDB`.
3. **As a Facility Manager**, I want to browse the **Shift Handover History Log** and export any handover brief as clean Markdown (`Copy to Clipboard` / `Download .md`) for email/Slack/Teams distribution.

---

## 4. Data Aggregation & Persistence Spec

### 4.1 Shift Window Aggregation (`backend/telemetry_store.py`)
Query the embedded `DuckDB` historian (`facility_telemetry_24h` + live `engine.history` buffer) over the selected shift window (`last_8h = 96` 5-min points or `last_12h = 144` points):
* `avg_pue`, `min_pue`, `max_pue`
* `peak_facility_kw`, `peak_it_kw`, `total_shift_mwh`
* `max_inlet_temp_c` & `hotspot_rack_id`, `max_chip_temp_c`
* Equipment exceptions: any disabled `CRAC/CDU`, `cdu_fouling_factor < 0.95`, non-default manual setpoint deltas vs. baseline (`17.5°C/18.5°C` CRAC, `23.5°C/24.5°C` CDU), and active scenarios.

### 4.2 Persistent Handover Table in DuckDB
Create table `shift_handover_logs` in `DuckDBTelemetryStore._init_schema()`:
* Columns: `handover_id VARCHAR`, `created_at TIMESTAMP`, `shift_window VARCHAR`, `outgoing_engineer VARCHAR`, `incoming_engineer VARCHAR`, `avg_pue DOUBLE`, `peak_facility_kw DOUBLE`, `active_alarms_count INTEGER`, `operator_notes VARCHAR`, `markdown_body VARCHAR`.

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
* `ShiftWindow(str, Enum)`: `"8h"`, `"12h"`, `"24h"`
* `ShiftOverrideItem(BaseModel)`: `asset_id`, `parameter`, `current_value`, `default_value`, `status_note`
* `ShiftHandoverSummary(BaseModel)`: `handover_id`, `generated_at: str`, `shift_window: ShiftWindow`, `avg_pue: float`, `min_pue: float`, `max_pue: float`, `peak_facility_kw: float`, `peak_it_kw: float`, `total_shift_mwh: float`, `peak_inlet_c: float`, `hotspot_rack_id: str`, `active_anomalies_count: int`, `active_overrides: List[ShiftOverrideItem]`, `watch_items: List[str]`, `outgoing_engineer: str`, `incoming_engineer: str`, `operator_notes: str`, `signed_off: bool`, `markdown_digest: str`
* `ShiftSignOffRequest(BaseModel)`: `shift_window: ShiftWindow = ShiftWindow.EIGHT_HOURS`, `outgoing_engineer: str`, `incoming_engineer: str`, `operator_notes: str = ""`

### 5.2 FastAPI Endpoints (`backend/main.py`)
* `GET /api/ops/shift-handover?window=8h` → Generates live `ShiftHandoverSummary` preview.
* `POST /api/ops/shift-handover/signoff` → Persists signed-off handover record into `DuckDB` and returns `ShiftHandoverSummary`.
* `GET /api/ops/shift-handover/history` → Lists the most recent 20 signed-off shift logs from `DuckDB`.

---

## 6. Frontend UI / UX Specification

* **Location:** Add a compact **`📋 Shift Log`** button in the top header ribbon of `frontend/src/App.tsx` opening `ShiftHandoverModal.tsx` (supporting Light & Dark mode).
* **UI Elements:**
  1. **Window Selector (`8h Day/Swing/Night` | `12h Shift` | `24h Daily`)** + KPI summary strip (`Shift MWh`, `PUE Min/Avg/Max`, `Peak Inlet`, `Active Overrides`).
  2. **Auto-Detected Equipment Overrides & Watch-Items Checklist** (highlights disabled CRACs, fouled CDUs, or manual setpoint shifts).
  3. **Sign-Off Form:** Outgoing Engineer, Incoming Engineer, Shift Notes textarea, `Sign Off & Save to DuckDB` button, `Copy Markdown`, and collapsible `Recent Signed Handovers` table.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Manually changing a CRAC/CDU setpoint or injecting a fault scenario immediately surfaces under `active_overrides` and `watch_items` in the generated digest.
- [ ] Signing off a shift handover persists across API reloads in `DuckDB` (`shift_handover_logs` table) without locking conflicts.
- [ ] `Copy Markdown` / `.md` download produces a clean, executive-formatted shift report.
- [ ] Full Light Mode and Dark Mode compatibility.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `DuckDBTelemetryStore` (`backend/telemetry_store.py`), `compute_opendt_calibration` (`backend/services/calibration_rls.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/noc_shift_digest.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/noc_shift_digest.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/NocShiftDigestPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
