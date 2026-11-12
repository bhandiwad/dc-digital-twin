# PRD-09: Condition-Based Maintenance (CBM) Filter & CDU Strainer RUL Tracker

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-09` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Quick-Win Customer Implementation (`Simple • Immediate OpEx & Labor ROI`) |
| **Estimated Effort** | `Small (2–3 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / Mechanical Maintenance** — Zero tenant server access |
| **Target Codebase Touchpoints** | `backend/domain/hydraulics_airflow.py`, `backend/services/cbm_rul_tracker.py`, `backend/api/features/cbm_rul_tracker.py`, `frontend/src/components/workbench/features/CbmRulTrackerPanel.tsx` |

---

## 1. Problem Statement & Operator Value

Most data centers still perform **calendar-based Preventive Maintenance (PM)**—swapping `CRAC` MERV-13 air filter banks every 90 days regardless of loading, while missing rapid particulate clogging on `50 µm` `CDU` liquid strainers after loop work or construction dust.

Clogged filters and strainers force VFD fans and pumps to spin faster along a **cubic power curve ($P \propto N^3$)** to maintain target CFM/LPM, silently wasting thousands of dollars in parasitic power weeks before a flow alarm triggers. Estimating component **Health `%`**, **Remaining Useful Life (`RUL` in days)**, and **Monthly Wasted Energy Penalty (`$/mo`)** purely from existing BMS fan/pump speed-to-flow curves delivers immediate labor and energy savings.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** `CRAC-1..4` VFD fan speed `%`, airflow `CFM`, and fan kW; `CDU-1..2` VFD pump speed `%`, secondary coolant flow `LPM`, differential pressure `kPa`, and `cdu_fouling_factor`.
* **Prohibited Signals:** Zero server fan IPMI reads or in-rack IT telemetry.

---

## 3. User Stories

1. **As a Chief Mechanical Technician**, I want a ranked **Condition-Based Maintenance (`CBM`) Health Table** across all `4 CRAC` MERV-13 filter banks and `2 CDU` `50 µm` strainers + heat exchangers showing **Health `%`**, **Estimated $\Delta P$ (`Pa / kPa`)**, and **Remaining Useful Life (`RUL` days)**.
2. **As a Facility Operations Manager**, I want each maintenance item to show **Parasitic VFD Power Wasted (`+kW` & `$/month`)** and **PM Payback Days** (*Labor/Filter Cost ÷ Daily Energy Wasted*), so my team services the highest-ROI unit first instead of following blind 90-day calendars.
3. **As a Maintenance Engineer completing a PM**, I want a **`Record Filter / Strainer Serviced`** action that resets fouling resistance on that asset in the Digital Twin and shows immediate `kW` and `PUE` recovery.

---

## 4. Hydraulic / Aerodynamic Fouling & RUL Model

### 4.1 Flow-Resistance Fouling Index
In an clean hydraulic/air loop, volumetric flow scales linearly with VFD speed ($\dot{V}_{\text{clean}} = k_0 \cdot \text{Speed\%}$). As filter/strainer resistance $R_{\text{foul}}$ grows, observed flow drops relative to VFD speed (or VFD speed rises to hold flow):

$$\eta_{\text{flow}, j} = \frac{\dot{V}_{\text{measured}, j}}{\dot{V}_{\text{clean\_baseline}}(\text{Speed\%}_j)} \in (0, 1]$$

* **Component Health Score (`0–100%`):**
  $$\text{Health\%}_j = \text{clip}\!\left(\frac{\eta_{\text{flow}, j} - 0.65}{0.35} \times 100,\; 0,\; 100\right)$$
* **Parasitic VFD Power Penalty ($\Delta P_{\text{waste,kW}}$):**
  From cubic affinity laws, compensating for flow factor $\eta_{\text{flow}, j}$ increases shaft power by:
  $$\Delta P_{\text{waste}, j} = P_{\text{fan/pump}, j} \cdot \left(1 - \eta_{\text{flow}, j}^3\right) \quad [\text{kW}]$$
* **Remaining Useful Life (`RUL` Days):**
  Linearly/exponentially extrapolate current degradation slope $\frac{d(\text{Health\%})}{dt}$ to the mandatory service threshold (`Health = 25%` / max $\Delta P$):
  $$\text{RUL}_{\text{days}, j} = \max\!\left(0,\; \frac{\text{Health\%}_j - 25.0}{\dot{d}_j}\right)$$

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
* `CBMAssetHealth(BaseModel)`: `asset_id`, `component_name` (`"MERV-13 Air Filter Bank" | "50µm Strainer & Plate HX"`), `health_pct: float`, `delta_p_display: str`, `rul_days: int`, `wasted_vfd_kw: float`, `monthly_energy_penalty_usd: float`, `estimated_pm_cost_usd: float`, `payback_days: float`, `recommendation: str` (`"SERVICE_NOW" | "SCHEDULE_14D" | "HEALTHY_DEFER_CALENDAR_PM"`), `status: Severity`
* `CBMTrackerSummary(BaseModel)`: `total_wasted_kw: float`, `annualized_avoidable_loss_usd: float`, `deferred_calendar_pms_count: int`, `assets: List[CBMAssetHealth]`

### 5.2 Simulator & Service Logic (`backend/simulator.py`, `backend/ai_engine.py`, `backend/main.py`)
* Add `self.crac_filter_health: Dict[str, float] = {"CRAC-1": 0.96, "CRAC-2": 0.89, "CRAC-3": 0.78, "CRAC-4": 0.94}` on `DataHallTwinEngine` (coupled with `cdu_fouling_factor` on `CDU-1/2`) affecting fan kW / CFM slightly.
* `GET /api/maintenance/cbm` → Returns `CBMTrackerSummary` sorted by lowest `payback_days` / `rul_days`.
* `POST /api/maintenance/cbm/{asset_id}/service` → Restores filter/strainer fouling factor to `1.0` (`100%` clean) and steps `twin_engine`.

---

## 6. Frontend UI / UX Specification

* **Location:** Add a **`🔧 CBM & RUL`** sub-tab (or collapsible section under `OpenDT RLS` fouling diagnostics) in `frontend/src/components/FacilityMLSuitePanel.tsx`.
* **UI Elements:**
  1. **Fleet CBM Summary Banner:** `Total Fouling Energy Waste (kW)` • `Calendar PMs Safely Deferred` • `Urgent Strainer/Filter Actions`.
  2. **6-Asset Health & RUL Cards (`CRAC-1..4`, `CDU-1..2`):** Health progress bar, `RUL: X days`, `+$Y/mo penalty`, `Payback: Z days`, and 1-click **`Mark Cleaned / Replaced`** button.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Triggering `cdu1_fouling` immediately drops `CDU-1` `50µm Strainer & Plate HX` health `%`, shortens `rul_days` to `< 5 days`, increases `wasted_vfd_kw`, and flags `SERVICE_NOW`.
- [ ] Clicking `Mark Cleaned / Replaced` on `CDU-1` restores `cdu_fouling_factor["CDU-1"] = 1.0`, lowers pump kW & Row C chip temperatures, and updates PUE.
- [ ] Clean units (`CRAC-1`, `CRAC-4`) display `HEALTHY_DEFER_CALENDAR_PM` demonstrating labor savings vs. blind 90-day swaps.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `calc_fouling_health_and_penalty`, `calc_vfd_affinity_power_kw` (`backend/domain/hydraulics_airflow.py`), `engine.site_config.economics` (`backend/config_loader.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/cbm_rul_tracker.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/cbm_rul_tracker.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/CbmRulTrackerPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
