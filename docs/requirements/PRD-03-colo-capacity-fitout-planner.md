# PRD-03: Colocation Pre-Sales Capacity Fit-Out & Summer Design-Day Stress Tester

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-03` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Colocation Revenue Growth & Capacity Engineering |
| **Estimated Effort** | `Medium (4–6 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / Capacity Planning** — Zero access to tenant IT workloads or servers |
| **Target Codebase Touchpoints** | `backend/domain/electrical.py`, `backend/services/colo_fitout_planner.py`, `backend/api/features/colo_fitout_planner.py`, `frontend/src/components/workbench/features/ColoFitoutPlannerPanel.tsx` |

---

## 1. Problem Statement & Operator Value

Colocation and enterprise data center operators lose millions in delayed deals—or worse, over-commit a hall—because Sales Engineering and Critical Facilities cannot rapidly answer:

> *"Can Hall 1 accommodate a prospective customer requesting `6 Racks × 75 kW` direct-to-chip liquid cooling (or `8 Racks × 20 kW` air-cooled compute) starting next month, while maintaining `N-1` electrical/cooling redundancy on an ASHRAE `99.6%` peak summer design day (`31°C` wet-bulb / `40°C` dry-bulb)?"*

Spreadsheet capacity trackers only sum nameplate kW and miss coupled physics bottlenecks: **PDU/UPS breaker headroom**, **CDU secondary flow (`LPM`) & heat-exchanger `UA` fouling**, **cold-aisle `CFM`**, and **summer wet-bulb chiller COP derating**.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** Facility `UPS-A/B` and `PDU-A..D` nameplate vs. peak load kW, `CDU-1/2` LPM & kW capacity, `CRAC-1..4` CFM & cooling kW, rack slot power envelopes, and ASHRAE outdoor psychrometric design-day parameters.
* **Prohibited Signals:** No tenant job traces, application SLAs, or server-internal scheduling.

---

## 3. User Stories

1. **As a Colocation Capacity Planner**, I want to enter a prospective deal's parameters (`Rack Count`, `kW per Rack`, `Cooling Type: Air vs. Direct-to-Chip Liquid`, `Redundancy Target: N or N-1`, and `ASHRAE Summer Design Wet-Bulb °C`) and immediately see `GO / CONDITIONAL GO / NO-GO` across all 4 rows (`ROW-A..D`).
2. **As a Chief Engineer signing off on a Sales Engineering quote**, I want a **4-Constraint Feasibility Breakdown** (*Electrical PDU/UPS*, *Liquid CDU Flow/kW*, *Perimeter Air CFM*, and *Chiller Design-Day Plant Headroom*) showing the exact binding bottleneck and recommended rack slots.
3. **As an Account / Ops Director**, I want to export a clean Markdown **Technical Capacity Sign-Off Certificate** to attach directly to the customer colocation proposal.

---

## 4. Multi-Constraint Feasibility Model

Given a proposed tenant deal of $N_{\text{racks}}$ at $P_{\text{rack}}$ ($\text{kW/rack}$, total $\Delta P_{\text{IT}} = N_{\text{racks}} \cdot P_{\text{rack}}$) evaluated under ambient design wet-bulb $T_{\text{wb,design}}$ (default `29.5°C`):

1. **Electrical Distribution Constraint (`PDU` & `UPS`):**
   $$\text{Headroom}_{\text{PDU}, r} = \alpha_{\text{redundancy}} \cdot P_{\text{PDU,rated}, r} - P_{\text{PDU,peak}, r}$$
   where $\alpha_{\text{redundancy}} = 0.80$ (`NEC 80% continuous breaker rule`) or $0.48$ for dual-bus single-feed `N-1` limit.
2. **Liquid Cooling Loop Constraint (`CDU` — if `hybrid_liquid`):**
   Required liquid heat rejection $\Delta Q_{\text{liq}} = 0.75 \cdot \Delta P_{\text{IT}}$ and required coolant flow at target $\Delta T_{\text{loop}} = 10^\circ\text{C}$:
   $$\Delta \dot{V}_{\text{LPM}} = \frac{\Delta Q_{\text{liq}} \cdot 60}{c_{p,\text{water}} \cdot \rho \cdot \Delta T_{\text{loop}}} \approx 1.43 \cdot \Delta Q_{\text{liq}} \quad [\text{LPM}]$$
   Checked against `CDU` effective fouled capacity $Q_{\text{CDU,rated}} \cdot f_{\text{fouling}} - Q_{\text{CDU,current}}$.
3. **Perimeter Air Cooling Constraint (`CRAC`):**
   Required air heat rejection $\Delta Q_{\text{air}} = (0.25 \text{ if liquid else } 1.0) \cdot \Delta P_{\text{IT}}$ and required airflow $\Delta \text{CFM} \approx 155 \cdot \Delta Q_{\text{air}}$ (at $\Delta T_{\text{air}} = 11^\circ\text{C}$), checked against zone CRAC `N-1` capacity.
4. **Summer Design-Day Chiller COP Derating:**
   Simulate `sandbox = engine.clone_for_whatif()` with `sandbox.outdoor_wetbulb_c = T_wb_design`, inject $\Delta P_{\text{IT}}$ into the candidate row(s), run 15 steady-state steps, and verify $\max(T_{\text{inlet}}) \le 27.0^\circ\text{C}$, $\max(T_{\text{chip}}) \le 78.0^\circ\text{C}$, and report post-deal `Design-Day PUE`.

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
* `CapacityDealRequest(BaseModel)`: `deal_name: str`, `rack_count: int` (`1..16`), `kw_per_rack: float` (`5..100`), `cooling_type: CoolingType`, `require_n1_redundancy: bool = True`, `design_wetbulb_c: float = 29.5`
* `RowFitOutCandidate(BaseModel)`: `row_id`, `verdict` (`"GO" | "CONDITIONAL" | "NO_GO"`), `max_supportable_kw: float`, `electrical_headroom_kw: float`, `liquid_headroom_kw: float`, `air_headroom_kw: float`, `binding_constraint: str`, `recommended_slots: List[str]`, `post_deal_max_inlet_c: float`, `post_deal_pue: float`
* `CapacityFitOutResponse(BaseModel)`: `deal_summary: str`, `overall_verdict: str`, `total_requested_kw: float`, `design_day_pue: float`, `chiller_cop_at_design_wb: float`, `row_candidates: List[RowFitOutCandidate]`, `mitigation_upgrades: List[str]`, `signoff_markdown: str`

### 5.2 Service Logic (`backend/ai_engine.py`)
* Implement `evaluate_colocation_fitout(engine: DataHallTwinEngine, req: CapacityDealRequest) -> CapacityFitOutResponse`.

### 5.3 FastAPI Endpoints (`backend/main.py`)
* `POST /api/capacity/fitout` → Evaluates the prospective customer deal on a cloned summer design-day sandbox and returns `CapacityFitOutResponse`.

---

## 6. Frontend UI / UX Specification

* **Location:** Add a **`📐 Colo Fit-Out`** modal or tab accessible from the top header / `What-If` workbench (`frontend/src/components/ColoFitOutModal.tsx` or `What-If` sub-mode), supporting both Light and Dark themes.
* **UI Elements:**
  1. **Deal Configurator Form:** Deal Name, Rack Count (`1–16`), Density (`kW/rack` slider `10–100 kW`), Cooling Topology (`Air` vs. `Direct-to-Chip Liquid`), `Tier-III N-1` toggle, and `Summer Design Wet-Bulb` preset (`22°C Mild`, `27°C Warm`, `31°C ASHRAE 99.6% Extreme`).
  2. **4-Row Feasibility Scorecard (`ROW-A` to `ROW-D`):** Color-coded `GO / CONDITIONAL / NO-GO` cards showing 4 horizontal constraint bars (*Power*, *Liquid*, *Air*, *Thermal SLA*) and suggested rack IDs.
  3. **One-Click `Download Sign-Off Markdown` Button** for customer RFPs.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Requesting a `450 kW` liquid-cooled deal automatically rules out air-only `ROW-A / ROW-B` and evaluates `ROW-C / ROW-D` against `PDU-C/D` and `CDU-1/2` limits.
- [ ] Raising `design_wetbulb_c` from `19.5°C` to `31.0°C` accurately reflects chiller COP degradation and higher post-deal PUE via `clone_for_whatif()`.
- [ ] Exported Markdown sign-off sheet contains complete constraint tables and remedial actions (e.g., *"Flush CDU-1 strainer to recover +65 kW fouled capacity"*).
- [ ] Zero TypeScript or Vite build warnings in Light and Dark modes.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `calc_3phase_currents_and_imbalance`, `calc_pue` (`backend/domain/electrical.py`), `calc_liquid_loop_delta_t_c`, `calc_air_loop_delta_t_c` (`backend/domain/hydraulics_airflow.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/colo_fitout_planner.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/colo_fitout_planner.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/ColoFitoutPlannerPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
