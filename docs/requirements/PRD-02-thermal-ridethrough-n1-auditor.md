# PRD-02: Live Thermal Ride-Through Clock & Continuous Tier-III N-1 Compliance Auditor

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-02` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Uptime Protection & Tier-III/IV Compliance |
| **Estimated Effort** | `Medium (4–6 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / BMS & EPMS** — Zero agents or access inside tenant IT servers |
| **Target Codebase Touchpoints** | `backend/domain/hydraulics_airflow.py`, `backend/services/ridethrough_auditor.py`, `backend/api/features/ridethrough_auditor.py`, `frontend/src/components/workbench/features/RideThroughAuditorPanel.tsx` |

---

## 1. Problem Statement & Operator Value

In legacy `8 kW/rack` air-cooled halls, operators had `12–18 minutes` of room-air thermal inertia if cooling tripped before equipment throttled. In modern `65–85 kW/rack` direct-to-chip liquid-cooled AI halls (`Rows C & D`), secondary coolant loops hold very small fluid volumes—leaving **only `90 to 210 seconds`** before ASHRAE Liquid Class W2 (`40°C` return / `45°C` manifold) or Air Class A1 (`27°C` inlet / `32°C` allowable) limits are breached.

Simultaneously, Uptime Institute **Tier-III Concurrent Maintainability** requires that *any* single distribution path or cooling/power component (`N-1`) can be taken offline for planned maintenance or unexpected trip without impacting critical IT load. As tenant density grows unevenly across rows, data halls frequently drift silently into **hidden `N-1` violations** during peak hours without triggering standard BMS threshold alarms.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** Zone thermal capacitance ($C_{\text{th}}$) and thermal resistance ($R_{\text{th}}$) learned by `compute_opendt_calibration()` from `PDU-A..D` kW, `CRAC-1..4` airflow/temps, `CDU-1..2` LPM/temps, and `UPS-A..B` load %.
* **Prohibited Signals:** No server OS telemetry, no workload throttling hooks, and no in-band GPU clock inspection.

---

## 3. User Stories

1. **As a Critical Facilities Watch Engineer**, I want to see a live **Thermal Ride-Through Countdown (`mm:ss` to ASHRAE SLA Breach)** for each row (`ROW-A..D`) and rack if primary cooling (`CDU` pump or zone `CRAC` pair) trips right now, so I know our exact emergency response window.
2. **As a Chief Engineer preparing for a Tier-III audit or maintenance window**, I want the Digital Twin to run a continuous background **`N-1` Contingency Sweep** across all `4 CRACs`, `2 CDUs`, `4 PDUs`, and `2 UPS` units using `clone_for_whatif()` and flag any single-component outage that would cause a downstream overload or thermal breach within 15 minutes.
3. **As a NOC Operator viewing the 3D Data Hall**, I want a **`Thermal Runway (sec)`** 3D heatmap layer in `DataHall3D.tsx` highlighting racks with `< 180s` of thermal ride-through in amber/red.

---

## 4. Physics & Contingency Math

### 4.1 Per-Zone & Per-Rack Thermal Ride-Through Time ($t_{\text{runway}}$)
Using the online-calibrated zone thermal capacitance $C_{\text{th}, z}$ ($\text{kJ}/^\circ\text{C}$) from `compute_opendt_calibration()` and current heat load $Q_{\text{rack}}$ ($\text{kW} = \text{kJ/s}$):

* **Air-Cooled Racks (`ROW-A`, `ROW-B`):** Time from current cold-aisle inlet $T_{\text{inlet}, i}$ to ASHRAE A1 upper limit ($T_{\text{SLA,air}} = 27.0^\circ\text{C}$) and critical limit ($32.0^\circ\text{C}$) under loss of zone mechanical cooling ($Q_{\text{residual}}$ from adjacent aisle diffusion):
  $$t_{\text{breach,air}, i} = \frac{C_{\text{th,rack}, i} \cdot \max\bigl(0,\; T_{\text{SLA,air}} - T_{\text{inlet}, i}\bigr)}{\max\bigl(0.5,\; Q_{\text{air}, i} - Q_{\text{residual}, i}\bigr)} \quad [\text{seconds}]$$

* **Hybrid Liquid-Cooled AI Racks (`ROW-C`, `ROW-D`):** Cold-plate + manifold fluid volume thermal mass $C_{\text{th,liq}, i} = m_{\text{coolant}, i} c_p + C_{\text{coldplate}}$ against liquid heat load $Q_{\text{liquid}, i}$ (`75%` of rack kW) to $T_{\text{SLA,liq,ret}} = 45.0^\circ\text{C}$:
  $$t_{\text{breach,liq}, i} = \frac{C_{\text{th,liq}, i} \cdot \max\bigl(0,\; T_{\text{SLA,liq,ret}} - T_{\text{ret}, i}\bigr)}{\max\bigl(1.0,\; Q_{\text{liquid}, i}\bigr)} \quad [\text{seconds}]$$
  Effective rack ride-through is $t_{\text{runway}, i} = \min(t_{\text{breach,air}, i},\; t_{\text{breach,liq}, i})$.

### 4.2 Automated Non-Destructive `N-1` Contingency Sweep
For each candidate critical asset $a \in \{\text{CRAC-1..4}, \text{CDU-1..2}, \text{UPS-A..B}\}$:
1. Clone `sandbox = engine.clone_for_whatif()`.
2. Disable asset $a$ (for `UPS-A` loss, transfer dual-corded IT load onto peer `UPS-B` bus tie; for `CDU-1` loss, model emergency secondary cross-tie manifold capacity at `70%` flow).
3. Step `sandbox` forward `15 minutes` (`dt_sec=10.0`, `90` steps) and check:
   * Electrical bus load $\le 95\%$ of rated kW.
   * Peak rack inlet $\le 27.0^\circ\text{C}$ and CDU return $\le 42.0^\circ\text{C}$.
4. Classify each contingency as `PASS (Tier-III Compliant)`, `MARGINAL (< 3 min buffer)`, or `FAIL (N-1 Violation)`.

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
* `RackRideThroughMetric(BaseModel)`: `rack_id`, `row_id`, `cooling_type`, `current_load_kw`, `sla_breach_seconds`, `critical_throttle_seconds`, `limiting_domain` (`"liquid_loop" | "air_aisle"`), `risk_level: Severity`
* `ContingencyCaseResult(BaseModel)`: `asset_id`, `asset_type`, `outage_scenario`, `compliant: bool`, `peak_post_trip_inlet_c: float`, `peak_post_trip_cdu_ret_c: float`, `peer_asset_load_pct: float`, `min_margin_kw: float`, `remediation_hint: str`
* `ResilienceAuditReport(BaseModel)`: `timestamp: float`, `tier_iii_n1_compliant: bool`, `min_hall_ridethrough_sec: int`, `bottleneck_rack_id: str`, `zone_ridethrough_sec: Dict[str, int]`, `rack_metrics: List[RackRideThroughMetric]`, `n1_contingencies: List[ContingencyCaseResult]`

### 5.2 Engine & AI Methods (`backend/ai_engine.py`)
* Add `compute_resilience_and_ridethrough(engine: DataHallTwinEngine) -> ResilienceAuditReport` caching the `N-1` sandbox sweep for `5 seconds` so `1.5s` UI polling remains `< 15 ms` CPU overhead.

### 5.3 FastAPI Endpoints (`backend/main.py`)
* `GET /api/resilience/audit` → Returns `ResilienceAuditReport`
* `POST /api/resilience/stress-n2` → Runs an on-demand dual-fault (`N-2`, e.g., `CRAC-3 + CDU-1`) simulation and returns `ResilienceAuditReport`.

---

## 6. Frontend UI / UX Specification

* **3D Viewport Overlay (`frontend/src/components/DataHall3D.tsx` & `App.tsx`):**
  * Add `'ridethrough'` (`Runway Clock`) to `OverlayMode` coloring racks green (`> 300s`), amber (`120–300s`), and pulsing red (`< 120s`).
* **Workbench Sub-Tab (`frontend/src/components/FacilityMLSuitePanel.tsx`):**
  * Add **`⏱️ N-1 & Runway`** view showing:
    1. Banner badge: `TIER-III N-1 COMPLIANT` (emerald) or `N-1 VIOLATION DETECTED` (red) with worst-case rack countdown (`e.g., 01m 48s on R-C04`).
    2. Row-by-Row Thermal Runway bar chart (`ROW-A..D`).
    3. Interactive `N-1` Contingency Matrix table (`CRAC-1..4`, `CDU-1..2`, `UPS-A..B`) + `Run N-2 Dual-Failure Stress` button.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] `GET /api/resilience/audit` executes non-destructively via `clone_for_whatif()` without mutating live `twin_engine` telemetry.
- [ ] Injecting the `gpu_burst_row_c` (`+30%` AI Training Burst) scenario visibly shortens `ROW-C` liquid thermal ride-through seconds and flags any `CDU-1` cross-tie `N-1` margin compression.
- [ ] 3D `Runway Clock` heatmap layer renders smoothly in both Light and Dark themes.
- [ ] `npm run build` and backend health checks pass cleanly.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `calc_thermal_runway_seconds` (`backend/domain/hydraulics_airflow.py`), `ASHRAE_AIR_ENVELOPES_C` (`backend/domain/ashrae.py`), `ZoneRLSFilterState` (`backend/services/calibration_rls.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/ridethrough_auditor.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/ridethrough_auditor.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/RideThroughAuditorPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
