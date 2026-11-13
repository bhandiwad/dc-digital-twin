# PRD-05: Causal Alarm Storm De-Duplication & CMMS Ticket Dispatch (ServiceNow / Maximo)

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-05` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Day-2 NOC Operations & Enterprise Workflow Integration |
| **Estimated Effort** | `Medium (3–5 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / BMS & CMMS** — Zero access to tenant IT servers |
| **Target Codebase Touchpoints** | `backend/services/alarm_cmms_dispatch.py`, `backend/api/features/alarm_cmms_dispatch.py`, `frontend/src/components/workbench/features/AlarmCmmsPanel.tsx` |

---

## 1. Problem Statement & Operator Value

When a single upstream facility fault occurs—such as `CDU-1` secondary strainer fouling or `CRAC-2` VFD fan trip—legacy BMS panels flood the Network Operations Center (NOC) with **`15 to 40+` correlated threshold alarms** across every downstream manifold, cold-aisle probe, and rack thermal sensor.

Operators suffer severe **alarm fatigue**, spend precious minutes hunting for the upstream cause, and manually copy-paste asset IDs and LOTO procedures into **ServiceNow ITSM / IBM Maximo / Jira Service Management**. Collapsing an alarm storm via the Digital Twin's `NetworkX` causal topology graph into **1 Root-Cause Incident Card** with a pre-attached **GraphRAG Method of Procedure (MOP)** immediately streamlines Day-2 NOC workflows.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** Facility `NetworkX` multi-layer topology graph (`power`, `air_cooling`, `liquid_cooling`), BMS equipment states, cold-aisle/manifold temperatures, and outbound HTTPS REST webhooks to enterprise CMMS platforms.
* **Prohibited Signals:** No guest OS syslogs, SNMP traps from customer switches/servers, or workload schedulers.

---

## 3. User Stories

1. **As a NOC Watch Engineer during an alarm storm**, I want Aether-DCTWIN to automatically group `N` raw symptomatic rack/sensor alarms under their single upstream **Causal Root Asset** (`e.g., 19 raw alarms → 1 Root Incident on CDU-1`), displaying the **Noise Reduction %** (`e.g., 94.7%`).
2. **As a Critical Facilities Technician**, I want each Root-Cause Incident Card to automatically attach the corresponding **ASHRAE / Vendor GraphRAG MOP** checklist from `generate_graphrag_mop()` so I don't have to look up SOP binders.
3. **As an Operations Manager**, I want a **1-Click `Dispatch CMMS Work Order`** action supporting `ServiceNow`, `IBM Maximo`, and `Generic Webhook` payload formats with ticket ID tracking (`INC0049218` / `WO-88412`) and live acknowledgment status.

---

## 4. Graph Causal Correlation Algorithm

Given the current set of raw BMS threshold violations and `AnomalyEvent` items $A = \{a_1, a_2, \dots, a_m\}$ on `engine.graph` ($G = (V, E)$):

1. **Raw Symptom Extraction:** Generate realistic raw BMS threshold alarms whenever rack inlet $> 26.0^\circ\text{C}$, chip $> 72.0^\circ\text{C}$, CDU $\Delta T > 13.5^\circ\text{C}$, CDU fouling $< 0.90$, CRAC disabled, or PDU load $> 85\%$.
2. **Upstream Ancestor Traversal:** For every alarming node $v \in V$, inspect directed edges $(u \to v) \in E$ across `air_cooling`, `liquid_cooling`, and `power` layers (`nx.ancestors(G, v)`).
3. **Root-Cause Promotion:**
   * If an upstream supplier node $u \in \{\text{CRAC-1..4}, \text{CDU-1..2}, \text{PDU-A..D}, \text{UPS-A..B}\}$ has an active equipment fault/degradation OR $\ge 3$ downstream racks sharing supplier $u$ simultaneously breach thresholds, promote $u$ as the **Root-Cause Parent** and attach all downstream rack/probe alarms as `suppressed_child_alarms`.
   * Isolated single-rack faults (`recirc_hotspot` on `R-B05` where `CRAC-1/2` are healthy) remain standalone rack-level incidents (`parent = R-B05`).
4. **Suppression Ratio:**
   $$\text{Suppression Ratio \%} = \left(1 - \frac{N_{\text{root\_incidents}}}{\max(1, N_{\text{raw\_alarms}})}\right) \times 100$$

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
* `CMMSProvider(str, Enum)`: `"servicenow"`, `"ibm_maximo"`, `"webhook"`
* `RawBMSAlarm(BaseModel)`: `alarm_id`, `timestamp`, `node_id`, `node_type`, `point_name`, `measured_value`, `threshold_value`, `unit`, `severity: Severity`
* `CorrelatedIncident(BaseModel)`: `incident_id`, `root_asset_id`, `root_asset_type`, `severity: Severity`, `root_cause_summary`, `causal_layer` (`"liquid_cooling" | "air_cooling" | "power" | "local_airflow"`), `raw_alarm_count: int`, `child_alarms: List[RawBMSAlarm]`, `recommended_mop_type: str`, `dispatched_ticket_id: Optional[str] = None`, `cmms_provider: Optional[CMMSProvider] = None`
* `AlarmCorrelationSummary(BaseModel)`: `raw_bms_alarm_count: int`, `correlated_incident_count: int`, `noise_reduction_pct: float`, `incidents: List[CorrelatedIncident]`
* `CMMSDispatchRequest(BaseModel)`: `incident_id: str`, `provider: CMMSProvider`, `priority: str = "P2"`, `assignee_group: str = "Critical-Facilities-L2"`, `include_mop: bool = True`, `webhook_url: Optional[str] = None`
* `CMMSDispatchResponse(BaseModel)`: `ticket_id: str`, `provider: CMMSProvider`, `status: str`, `dispatched_at: str`, `payload_preview: Dict[str, Any]`

### 5.2 Service & Endpoints (`backend/ai_engine.py`, `backend/connectors.py`, `backend/main.py`)
* `GET /api/alarms/correlated` → Returns `AlarmCorrelationSummary`.
* `POST /api/alarms/dispatch-cmms` → Formats standard ServiceNow (`short_description`, `cmdb_ci`, `work_notes` with GraphRAG MOP) or Maximo (` assetnum`, `jpnum`, `description`) JSON payload, dispatches (or simulates dry-run if no external webhook URL is provided), and records `dispatched_ticket_id`.

---

## 6. Frontend UI / UX Specification

* **Location:** Upgrade the **`AI (...)` Analytics Tab** (`activeTab === 'ai_analytics'` in `frontend/src/App.tsx`) with a toggleable **`🔔 Correlated Incidents & CMMS`** banner and incident tree.
* **UI Elements:**
  1. **Alarm Storm Compression KPI Strip:** `Raw BMS Alarms (e.g., 22)` → `Root Incidents (e.g., 1)` • `95.5% Alarm Noise Suppressed`.
  2. **Expandable Root-Cause Incident Card:** Shows root asset (`CDU-1`), collapsible list of suppressed downstream rack alarms (`R-C01..R-C08`), 1-click `Preview Attached MOP`, and **`Create ServiceNow / Maximo Ticket`** button with JSON payload modal preview.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Injecting `cdu1_fouling` or `crac2_trip` generates `8–16+` raw rack/aisle threshold alarms and accurately collapses them into **1** root-cause incident on `CDU-1` or `CRAC-2`.
- [ ] Injecting `recirc_hotspot` keeps `R-B05` as a localized airflow incident without falsely blaming `CRAC-1/2`.
- [ ] Dispatching a CMMS ticket attaches the live GraphRAG MOP steps and displays a formatted ServiceNow / Maximo JSON payload and ticket badge.
- [ ] Clean Light & Dark mode UI rendering and zero build errors.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `DataHallTwinEngine.get_downstream_racks` (`backend/simulator.py`), `generate_graphrag_mop` (`backend/services/mop_graphrag.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/alarm_cmms_dispatch.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/alarm_cmms_dispatch.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/AlarmCmmsPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
