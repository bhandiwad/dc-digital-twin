# PRD-01: Shadow-Mode Pilot Validator & BACnet Priority-Array Watchdog

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-01` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Enterprise Trust & Pilot Onboarding (`#1 Deal Closer`) |
| **Estimated Effort** | `Medium (4–6 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / BMS** — Zero agents, SSH, or telemetry hooks inside tenant IT servers |
| **Target Codebase Touchpoints** | `backend/adapters/telemetry_adapter.py`, `backend/services/shadow_watchdog.py`, `backend/api/features/shadow_watchdog.py`, `frontend/src/components/workbench/features/ShadowWatchdogPanel.tsx` |

---

## 1. Problem Statement & Operator Value

Critical Facilities Directors and Chief Engineers operate under strict `99.999%` availability mandates and multi-million-dollar tenant thermal SLAs. **No data center operator turns on closed-loop AI control (`Auto-Pilot`) on Day 1.**

In real-world enterprise deployments, operators require a **3-Stage Trust Progression**:
1. **Stage 1 — Shadow Mode (Read-Only Validation):** The AI ingests BMS/PDU/CDU telemetry and computes recommended setpoints side-by-side against the legacy BMS PID controller without writing to field equipment, proving cumulative `kWh` / `$` savings and `0` ASHRAE SLA breaches over a 14–30 day pilot window.
2. **Stage 2 — Human-in-the-Loop Advisory:** Shift engineers review individual setpoint change proposals in an approval queue (`Approve`, `Reject with Reason`, or `Run What-If Sandbox First`), building an auditable governance log.
3. **Stage 3 — Bounded Closed-Loop Auto-Pilot with BACnet Watchdog:** Setpoints are written strictly to **BACnet Priority Array Level 8 (Manual/Supervisory Operator Override)** or **Level 12**, bounded by hard hardware clamps and a `15-second` dead-man heartbeat timer. If Aether-DCTWIN loses connectivity or any sensor crosses a safety threshold, `NULL` is written to relinquish control back to local BMS Priority 16 PID loops instantaneously.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** `CRAC-1..4` supply/return air temps & VFD speeds, `CDU-1..2` supply/return temps, LPM & pump speeds, `PDU-A..D` total kW, cold-aisle inlet thermistor strips, and `BACnet/IP` Priority Array registers (`1..16`).
* **Prohibited Signals:** No OS agents, no workload job schedulers, no server IPMI fan overrides, and no tenant container visibility.

---

## 3. User Stories

1. **As a Chief Engineer evaluating Aether-DCTWIN during a 30-day pilot**, I want to run the twin in `Shadow Mode` and view a live cumulative scoreboard comparing *Actual Legacy BMS Power/Temps* vs. *Counterfactual Aether Shadow Power/Temps*, so I have empirical proof that the AI saves energy without breaching `27.0°C` cold-aisle or `40.0°C` CDU return limits.
2. **As a NOC Shift Operator in `Advisory Mode`**, I want a structured `Approve / Reject` queue for proposed CRAC/CDU setpoint adjustments with predicted $\Delta \text{kW}$ and $\Delta T_{\text{inlet}}$ impact and an immutable timestamped audit trail.
3. **As a BMS Controls Engineer**, I want to inspect the **16-Level BACnet Priority Array** per asset (`CRAC-1..4`, `CDU-1..2`) and test a simulated **Heartbeat Timeout / Safety Trip** to verify immediate relinquishment back to local BMS PID fallback (`Priority 16`).

---

## 4. Algorithms & Control Governance Logic

### 4.1 Shadow-Mode Counterfactual Accumulator
On every simulation/telemetry step $\Delta t$ (in hours, $\Delta t = \frac{\text{dt\_sec}}{3600}$), clone or evaluate the current `DataHallTwinEngine` state under `compute_optimization(engine)` recommended setpoints:

$$\Delta P_{\text{shadow}}(t) = \max\bigl(0,\; P_{\text{facility,actual}}(t) - P_{\text{facility,shadow}}(t)\bigr)$$

$$E_{\text{saved,cum}} = \sum_{t} \Delta P_{\text{shadow}}(t) \cdot \Delta t \quad [\text{kWh}]$$

### 4.2 Autopilot Trust Readiness Score ($S_{\text{trust}} \in [0, 100]$)
Computed from four weighted facility validation pillars:
* **Calibration Convergence ($30\%$):** Based on OpenDT RLS temperature RMSE ($\text{RMSE} \le 0.5^\circ\text{C} \Rightarrow 100\%$).
* **Zero Shadow SLA Breaches ($35\%$):** Percentage of shadow steps where predicted $\max(T_{\text{inlet}}) \le 26.8^\circ\text{C}$ and $\max(T_{\text{CDU,ret}}) \le 39.5^\circ\text{C}$.
* **Operator Approval Alignment ($20\%$):** Ratio of approved vs. rejected advisory recommendations (seeded cleanly for pilot baseline).
* **Watchdog & Heartbeat Integrity ($15\%$):** `100%` when BACnet heartbeat latency $< 2000\text{ ms}$ and clamps are active.

### 4.3 BACnet 16-Level Priority Array & Dead-Man Watchdog
Model standard ASHRAE 135 BACnet Priority Array behavior for each controlled point (`CRAC Supply Air Setpoint`, `CDU Supply Coolant Setpoint`):
* `Priority 1`: Manual Life Safety (`NULL` normally)
* `Priority 8`: Aether-DCTWIN Supervisory AI Write-Back (holds active float value when in `bounded_autopilot` or approved `advisory`; set to `NULL` immediately upon `Relinquish / Watchdog Trip`)
* `Priority 16`: Local BMS Default PID Fallback (`17.5°C` CRAC / `23.5°C` CDU)
* **Hard Guardrail Clamps:**
  * CRAC Supply Air Clamp: `[16.0°C, 22.5°C]`, max step rate `±0.5°C / 5 min`
  * CDU Supply Coolant Clamp: `[20.0°C, 27.0°C]`, max step rate `±0.5°C / 5 min`
  * Heartbeat Watchdog TTL: `15 seconds` (if simulated heartbeat failure is triggered, `Priority 8` is cleared to `NULL` within 1 cycle and control falls back to `Priority 16`).

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
Add the following models:
* `GovernanceMode(str, Enum)`: `"shadow"`, `"advisory"`, `"bounded_autopilot"`
* `AdvisoryProposalItem(BaseModel)`: `proposal_id`, `created_at`, `target_id`, `parameter`, `current_value`, `proposed_value`, `unit`, `predicted_kw_delta`, `predicted_inlet_delta_c`, `status` (`"pending" | "approved" | "rejected"`), `operator_note`
* `BACnetPointPriorityState(BaseModel)`: `asset_id`, `point_name`, `active_priority_level` (`8` or `16`), `priority_8_ai_value: Optional[float]`, `priority_16_bms_default: float`, `effective_value: float`, `clamp_min: float`, `clamp_max: float`
* `ShadowValidationSummary(BaseModel)`: `governance_mode: GovernanceMode`, `pilot_hours_elapsed: float`, `cumulative_shadow_kwh_saved: float`, `cumulative_shadow_usd_saved: float`, `shadow_sla_breach_count: int`, `trust_readiness_score_pct: float`, `heartbeat_healthy: bool`, `heartbeat_ttl_sec: int`, `watchdog_status: str`, `pending_proposals: List[AdvisoryProposalItem]`, `audit_log: List[AdvisoryProposalItem]`, `bacnet_priority_table: List[BACnetPointPriorityState]`
* `GovernanceActionRequest(BaseModel)`: `mode: Optional[GovernanceMode]`, `proposal_id: Optional[str]`, `decision: Optional[str]` (`"approve" | "reject"`), `operator_note: Optional[str]`, `simulate_heartbeat_drop: Optional[bool]`

### 5.2 Service Logic (`backend/ai_engine.py` & `backend/connectors.py`)
* Maintain stateful governance tracker on `DataCenterAIService`:
  * `update_shadow_governance(engine: DataHallTwinEngine) -> ShadowValidationSummary`
  * `apply_governance_action(engine: DataHallTwinEngine, req: GovernanceActionRequest) -> ShadowValidationSummary`
* Ensure `twin_engine.auto_optimize` is synchronized: only `True` when `governance_mode == "bounded_autopilot"` AND `heartbeat_healthy == True`.

### 5.3 FastAPI Endpoints (`backend/main.py`)
* `GET /api/governance/shadow` → Returns `ShadowValidationSummary`
* `POST /api/governance/action` → Switches governance mode, approves/rejects a pending setpoint recommendation (applying it to `twin_engine` if approved), or triggers/resets a BACnet watchdog heartbeat drop test.

---

## 6. Frontend UI / UX Specification

* **Location:** Add a dedicated sub-tab **`🛡️ Shadow & Watchdog`** inside `frontend/src/components/FacilityMLSuitePanel.tsx` (supporting both **Dark Mode** and **Light Mode**).
* **UI Elements:**
  1. **3-Stage Governance Mode Selector:** Interactive segmented control (`1. Shadow Mode` → `2. Operator Advisory` → `3. Bounded Auto-Pilot`) with `Trust Readiness %` radial/progress badge.
  2. **Shadow Pilot Scoreboard:** 4 KPI cards (`Shadow kWh Saved`, `Shadow $ Saved`, `Shadow SLA Violations: 0`, `Watchdog Heartbeat: 15s OK`).
  3. **Operator Approval Queue & Audit Trail:** Cards for pending setpoint proposals with `Approve & Write Priority 8` and `Reject` buttons.
  4. **BACnet Priority Array Inspector & Fail-Safe Test Button:** Table displaying `Priority 8 (AI)` vs. `Priority 16 (Local BMS Fallback)` for `CRAC-1..4` and `CDU-1..2`, plus a **`Simulate Heartbeat Drop (Test Fail-Safe)`** button that visibly relinquishes `Priority 8 → NULL` and reverts equipment to `Priority 16`.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Switching between `Shadow`, `Advisory`, and `Bounded Auto-Pilot` persists in backend state and updates `auto_optimize` cleanly.
- [ ] In `Shadow Mode`, `twin_engine` setpoints are **never** mutated automatically, while counterfactual `kWh` and `$` savings accumulate realistically on each step.
- [ ] In `Advisory Mode`, clicking `Approve` writes the recommended setpoint to `Priority 8`, applies it to the target CRAC/CDU, and logs an immutable audit entry.
- [ ] Triggering `Simulate Heartbeat Drop` immediately sets `Priority 8 = NULL`, reverts active setpoints to `Priority 16` BMS defaults, disables `Auto-Pilot`, and raises a clear watchdog banner.
- [ ] UI renders cleanly in both Dark Mode and Light Mode (`npm run build` succeeds with zero TypeScript errors).

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `SimulatedTwinAdapter.write_setpoint(..., bacnet_priority=8)`, `SimulatedTwinAdapter.relinquish_setpoint(...)` (`backend/adapters/telemetry_adapter.py`), `calc_pue` (`backend/domain/electrical.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/shadow_watchdog.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/shadow_watchdog.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/ShadowWatchdogPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
