# PRD-06: Psychrometric Dew-Point & Liquid Manifold Condensation Guard

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-06` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Quick-Win Customer Implementation (`Simple • High Safety Value`) |
| **Estimated Effort** | `Small (2–3 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / BMS Psychrometrics** — Zero tenant server access |
| **Target Codebase Touchpoints** | `backend/domain/psychrometrics.py`, `backend/services/dewpoint_guard.py`, `backend/api/features/dewpoint_guard.py`, `frontend/src/components/workbench/features/DewpointGuardPanel.tsx` |

---

## 1. Problem Statement & Operator Value

In hybrid liquid-and-air-cooled AI halls (`Rows C & D`), direct-to-chip coolant pipes and rack quick-disconnect (`QDC`) manifolds run directly through open hall air. If an operator (or naive optimizer) lowers `CDU` supply coolant temperature (`e.g., 18.5°C`) while ambient hall relative humidity (`RH%`) rises—due to monsoon/summer humidity infiltration or an open loading-bay airlock door—the pipe surface drops below the **room air dew-point temperature ($T_{\text{dp}}$)**.

Moisture immediately condenses ("sweats") on manifolds and drips onto live `415V` busbars and GPU chassis. **ASHRAE TC 9.9 Liquid Cooling Guidelines** mandate maintaining liquid coolant supply strictly **$2.0^\circ\text{C}\text{ to }3.0^\circ\text{C}$ above space dew point** at all times. Adding an automated **Psychrometric Dew-Point & Condensation Guard** is fast to implement from existing BMS temp/RH sensors and prevents catastrophic water-drip outages.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** Hall BMS Dry-Bulb Temperature ($T_{\text{db}}$), Hall Relative Humidity ($\text{RH}\%$), Outdoor Wet-Bulb ($T_{\text{wb}}$), and `CDU-1 / CDU-2` secondary supply coolant temperatures & setpoints.
* **Prohibited Signals:** Zero access to tenant servers or internal IT telemetry.

---

## 3. User Stories

1. **As a Liquid-Cooled Facility Engineer**, I want real-time visibility of **Hall Relative Humidity (`RH%`)**, **Calculated Dew-Point Temperature ($T_{\text{dp}}$)**, and per-CDU **Condensation Safety Margin ($T_{\text{CDU,supply}} - T_{\text{dp}}$)** right in the BMS Controls & KPI view.
2. **As a Controls Operator adjusting CDU setpoints**, I want an automatic **Dew-Point Floor Clamp ($T_{\text{min,safe}} = T_{\text{dp}} + 2.5^\circ\text{C}$)** so that neither manual slider overrides nor AI Auto-Pilot can command a CDU supply temperature that risks manifold sweating.
3. **As a Commissioning Engineer**, I want a **`💧 Humid Infiltration` scenario** (or RH% test slider) to verify that when hall humidity spikes to `70% RH`, `CDU-1` and `CDU-2` automatically lift their supply setpoints above the rising dew point.

---

## 4. Psychrometric Equations

### 4.1 Magnus-Tetens Dew-Point Formula
Given hall ambient dry-bulb temperature $T \equiv T_{\text{hall,db}}$ ($^\circ\text{C}$, approximated by hall mean cold-aisle temperature) and relative humidity $\text{RH} \in [5, 95]$ ($\%$):

$$\gamma(T, \text{RH}) = \ln\!\left(\frac{\text{RH}}{100}\right) + \frac{a \cdot T}{b + T}, \qquad a = 17.625,\; b = 243.04^\circ\text{C}$$

$$T_{\text{dp}} = \frac{b \cdot \gamma(T, \text{RH})}{a - \gamma(T, \text{RH})} \quad [^\circ\text{C}]$$

### 4.2 Condensation Margin & Hard Clamp Rule
For each liquid `CDU` $j \in \{\text{CDU-1}, \text{CDU-2}\}$:
$$\Delta T_{\text{cond}, j} = T_{\text{CDU,supply}, j} - T_{\text{dp}}$$
* **Safe (`NORMAL`):** $\Delta T_{\text{cond}, j} \ge 3.0^\circ\text{C}$
* ** Guard Active / Warning (`WARNING`):** $1.5^\circ\text{C} \le \Delta T_{\text{cond}, j} < 3.0^\circ\text{C}$
* **Condensation Imminent (`CRITICAL`):** $\Delta T_{\text{cond}, j} < 1.5^\circ\text{C}$
* **Active Guard Clamp (`dewpoint_guard_enabled = True`):**
  $$T_{\text{CDU,setpoint,effective}, j} = \max\bigl(T_{\text{CDU,setpoint,requested}, j},\; T_{\text{dp}} + 2.5^\circ\text{C}\bigr)$$

---

## 5. Backend Technical Specification

### 5.1 Schema Updates (`backend/models.py`)
* Extend `FacilityMetrics` with:
  * `hall_relative_humidity_pct: float = 45.0`
  * `hall_dewpoint_c: float = 9.2`
  * `dewpoint_guard_enabled: bool = True`
* Extend `CDUTelemetry` with:
  * `condensation_margin_c: float = 14.5`
  * `dewpoint_clamp_active: bool = False`
* Extend `ControlSetpointRequest` with:
  * `hall_relative_humidity_pct: Optional[float] = None`
  * `dewpoint_guard_enabled: Optional[bool] = None`

### 5.2 Simulator & Endpoint Logic (`backend/simulator.py`, `backend/main.py`)
* Track `self.hall_relative_humidity_pct: float = 45.0` and `self.dewpoint_guard_enabled: bool = True` on `DataHallTwinEngine`.
* Compute `hall_dewpoint_c` on every `step()`, enforce the $T_{\text{dp}} + 2.5^\circ\text{C}$ floor on `CDU-1` and `CDU-2` when `dewpoint_guard_enabled` is active, and support scenario `'humidity_spike'` (`RH% -> 72%`) in `trigger_scenario()`.

---

## 6. Frontend UI / UX Specification

* **Location:** Inside the **`Controls` Tab (`activeTab === 'inspector'`)** under CDU & Ambient Facility Controls (`frontend/src/App.tsx`).
* **UI Elements:**
  1. **Psychrometric Guard Card:** Live `Hall RH%` slider (`25% – 80%`), computed `Dew Point (°C)`, `Min Safe Coolant Supply (T_dp + 2.5°C)`, and `Dew-Point Clamp ON/OFF` toggle.
  2. **Per-CDU Condensation Margin Badge:** Green (`+12.4°C Safe`), Amber (`Clamp Active — Raised to 19.8°C`), or Red (`Sweat Risk!`).

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Magnus-Tetens formula matches standard ASHRAE psychrometric chart values within `±0.1°C` (e.g., at `22.0°C` dry-bulb & `50% RH`, $T_{\text{dp}} \approx 11.1^\circ\text{C}$; at `24.0°C` & `75% RH`, $T_{\text{dp}} \approx 19.4^\circ\text{C}$).
- [ ] Raising `Hall RH%` to `75%` when `CDU-1` is set to `20.0°C` automatically clamps `CDU-1` supply setpoint to $T_{\text{dp}} + 2.5^\circ\text{C}$ and sets `dewpoint_clamp_active = True`.
- [ ] Works seamlessly in both Dark and Light UI modes.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `calc_dewpoint_magnus_c`, `calc_condensation_margin_c` (`backend/domain/psychrometrics.py`), `SimulatedTwinAdapter.write_setpoint` (`backend/adapters/telemetry_adapter.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/dewpoint_guard.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/dewpoint_guard.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/DewpointGuardPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
