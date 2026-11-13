# PRD-10: Ambient Wet-Bulb Free-Cooling Economizer Advisor

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-10` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Quick-Win Customer Implementation (`Simple • High Chiller Energy Savings`) |
| **Estimated Effort** | `Small (2–3 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / Central Chiller & Economizer Plant** — Zero tenant server access |
| **Target Codebase Touchpoints** | `backend/domain/psychrometrics.py`, `backend/services/wetbulb_economizer.py`, `backend/api/features/wetbulb_economizer.py`, `frontend/src/components/workbench/features/WetbulbEconomizerPanel.tsx` |

---

## 1. Problem Statement & Operator Value

Chiller compressors represent the single largest cooling electrical load in a data center (`60–75%` of total cooling kW). Facility operators frequently leave chilled-water and CRAC/CDU supply setpoints locked at conservative winter-blind defaults (`e.g., 17.5°C CRAC / 23.5°C CDU`), forcing mechanical vapor-compression chillers to run even during cool nights, mornings, and shoulder seasons when **waterside free-cooling economizers** (plate-and-frame heat exchangers bypassing the chiller compressor) could reject `50–100%` of the hall's heat using cooling towers or dry coolers alone!

Notably, **hybrid liquid-cooled AI halls (`Rows C & D` running `24–27°C` warm-water loops)** can operate in **free-cooling mode up to `21–23°C` outdoor wet-bulb**—far warmer than legacy `7°C` chilled-water air plants! Quantifying live and 24-hour **Economizer Opportunity (`kW` & `$` saved)** is straightforward to deploy and immediately lowers facility PUE.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** BMS Outdoor Weather Station (`outdoor_wetbulb_c`, `outdoor_drybulb_c`), cooling tower approach temperature, CRAC supply/return air temps, CDU warm-water supply/return temps, and central plant COP.
* **Prohibited Signals:** Zero tenant server access or workload rescheduling.

---

## 3. User Stories

1. **As a Central Plant Operator**, I want to see the current **Economizer Operating Regime** separately for our **Perimeter Air Loop (`Chilled Water`)** and **Warm-Water AI Liquid Loop (`CDU Primary`)**:
   * `FULL_FREE_COOLING` (Compressor OFF — tower/dry-cooler + plate HX only, `COP ~ 14–18`)
   * `PARTIAL_INTEGRATED_ECONOMIZER` ( Economizer pre-cools return water + partial compressor trim, `COP ~ 6.5–10`)
   * `MECHANICAL_CHILLER_ONLY` (High outdoor wet-bulb — full mechanical refrigeration, `COP ~ 3.2–4.8`)
2. **As an Energy Engineer**, I want an interactive **24-Hour Diurnal Wet-Bulb & Free-Cooling Window Timeline** showing which hours tonight/tomorrow qualify for free cooling—and how raising CDU/CRAC setpoints by `+1.5°C` (within ASHRAE A1/W2 envelopes) unlocks **additional free-cooling hours** and saves **`X kW` (`$Y/day`)**.
3. **As a Shift Operator**, I want a 1-click **`Apply Economizer-Optimal Setpoints`** button that safely lifts supply setpoints to maximize waterside economizer hours without breaching `27.0°C` cold-aisle limits.

---

## 4. Thermodynamic Economizer Regime Model

Let cooling tower + plate heat-exchanger approach temperature be $\Delta T_{\text{approach}} = 3.2^\circ\text{C}$ (so minimum achievable free-cooling supply water is $T_{\text{econ,sup}} = T_{\text{wb}} + \Delta T_{\text{approach}}$):

1. **Perimeter Chilled-Water Loop (`CRAC-1..4`):**
   * Requires chilled water at $T_{\text{CHW,sup}} \approx \min(T_{\text{CRAC,sp}}) - 4.5^\circ\text{C}$, with return $T_{\text{CHW,ret}} \approx T_{\text{CHW,sup}} + 6.0^\circ\text{C}$.
   * **Full Free-Cooling:** $T_{\text{econ,sup}} \le T_{\text{CHW,sup}}$
   * **Partial Economizer:** $T_{\text{CHW,sup}} < T_{\text{econ,sup}} \le T_{\text{CHW,ret}} - 1.0^\circ\text{C}$ (fraction free-cooled $f_{\text{econ}} = \frac{T_{\text{CHW,ret}} - T_{\text{econ,sup}}}{T_{\text{CHW,ret}} - T_{\text{CHW,sup}}}$)
   * **Mechanical Only:** $T_{\text{econ,sup}} > T_{\text{CHW,ret}} - 1.0^\circ\text{C}$

2. **Warm-Water AI Liquid Loop (`CDU-1..2`):**
   * Requires primary facility water at $T_{\text{FW,sup}} \approx \min(T_{\text{CDU,sp}}) - 2.5^\circ\text{C}$ (`~21–23°C`), enabling **year-round / warm-ambient free cooling** even when air loops require chillers!

3. **Compressor Power Saved ($\Delta P_{\text{econ}}$):**
   $$\Delta P_{\text{econ}} = Q_{\text{loop}} \cdot f_{\text{econ}} \cdot \left(\frac{1}{\text{COP}_{\text{mech}}(T_{\text{wb}})} - \frac{1}{\text{COP}_{\text{econ}}}\right), \qquad \text{COP}_{\text{econ}} \approx 15.5$$

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
* `EconomizerRegime(str, Enum)`: `"FULL_FREE_COOLING"`, `"PARTIAL_ECONOMIZER"`, `"MECHANICAL_CHILLER"`
* `HourlyEconomizerPoint(BaseModel)`: `hour_label: str`, `outdoor_wetbulb_c: float`, `air_loop_regime: EconomizerRegime`, `liquid_loop_regime: EconomizerRegime`, `baseline_chiller_kw: float`, `economizer_optimized_kw: float`, `kw_saved: float`
* `EconomizerAdvisorState(BaseModel)`: `current_wetbulb_c: float`, `economizer_approach_c: float`, `air_loop_regime: EconomizerRegime`, `liquid_loop_regime: EconomizerRegime`, `air_free_cooling_share_pct: float`, `liquid_free_cooling_share_pct: float`, `instantaneous_compressor_saved_kw: float`, `recommended_crac_setpoint_c: float`, `recommended_cdu_setpoint_c: float`, `extra_free_cooling_hours_unlocked: int`, `estimated_daily_savings_usd: float`, `forecast_24h: List[HourlyEconomizerPoint]`

### 5.2 Service & Endpoints (`backend/ai_engine.py`, `backend/main.py`)
* `GET /api/energy/economizer` → Computes `EconomizerAdvisorState` from live `twin_engine` and 24-hour sinusoidal/historical diurnal wet-bulb profile anchored on `engine.outdoor_wetbulb_c`.
* `POST /api/energy/economizer/apply` → Applies ASHRAE-safe economizer-optimal CRAC & CDU setpoints to `twin_engine` and returns updated `EconomizerAdvisorState`.

---

## 6. Frontend UI / UX Specification

* **Location:** Inside the **`⚡ PUE & Grid`** tab (or dedicated **`🌬️ Free-Cooling`** pill) of `frontend/src/components/FacilityMLSuitePanel.tsx`.
* **UI Elements:**
  1. **Dual-Loop Regime Badges:** Side-by-side status cards for *Air Loop (`CHW`)* vs. *AI Warm-Water Loop (`CDU`)* showing why liquid cooling unlocks vastly more free-cooling hours (`e.g., Liquid: FULL FREE-COOLING at 19.5°C WB` vs. `Air: MECHANICAL`).
  2. **24-Hour Economizer Window Ribbon:** Color-coded 24-bar timeline (Emerald = Full Free-Cooling, Cyan = Partial Economizer, Amber = Mechanical Chiller) + `+X Free-Cooling Hours Unlocked` badge.
  3. **1-Click `Unlock Free-Cooling Setpoints` Button.**

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Lowering `outdoor_wetbulb_c` (e.g., `12.0°C`) transitions both Air and Liquid loops into `FULL_FREE_COOLING`; triggering `summer_heatwave` (`29.5°C` WB) shifts both loops to `MECHANICAL_CHILLER`.
- [ ] At moderate ambient (`19.5°C` WB), the AI Warm-Water Liquid Loop achieves `FULL_FREE_COOLING` / high `PARTIAL_ECONOMIZER` while legacy `17.5°C` Air Loop requires mechanical chilling—clearly illustrating hybrid warm-water ROI.
- [ ] Clicking `Unlock Free-Cooling Setpoints` safely raises supply setpoints within ASHRAE A1 (`≤ 27°C` inlet) and immediately lowers facility PUE.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `calc_waterside_economizer_share`, `calc_chiller_cop` (`backend/domain/psychrometrics.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/wetbulb_economizer.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/wetbulb_economizer.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/WetbulbEconomizerPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
