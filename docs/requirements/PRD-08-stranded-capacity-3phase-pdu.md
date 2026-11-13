# PRD-08: Row Stranded Capacity & 3-Phase (L1 / L2 / L3) PDU Breaker Balance Monitor

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-08` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Quick-Win Customer Implementation (`Simple • Electrical & Capacity Visibility`) |
| **Estimated Effort** | `Small (2–3 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Critical Facilities / EPMS & Row PDU Metering** — Zero tenant server access |
| **Target Codebase Touchpoints** | `backend/domain/electrical.py`, `backend/services/pdu_phase_balancer.py`, `backend/api/features/pdu_phase_balancer.py`, `frontend/src/components/workbench/features/PduPhaseBalancerPanel.tsx` |

---

## 1. Problem Statement & Operator Value

Data center operators routinely encounter **"phantom capacity"** on paper that cannot actually be sold or energized due to two facility-level mismatches:
1. **3-Phase (`L1 / L2 / L3`) Current Imbalance:** Row PDUs (`415V` 3-phase Wye) feed single-phase or unevenly balanced rack PDU branch whips. When one phase (`e.g., L2`) reaches `78%` of breaker rating while `L1` and `L3` sit at `56%`, the **most-loaded phase governs breaker trip capacity**, stranding `15–20%` of PDU kW and inducing neutral harmonic heating and transformer $I^2 R$ losses.
2. **Power vs. Cooling Row Mismatch (*Stranded Capacity*):** If `PDU-B` has `110 kW` of spare electrical headroom, but `ROW-B` perimeter air cooling only has `55 kW` of thermal headroom before cold-aisle temperatures exceed `27°C`, **`55 kW` of electrical infrastructure is stranded**.

---

## 2. Strict Facility Demarcation Guarantee

* **Allowed Signals:** Row `PDU-A..D` main & branch meter registers (`L1/L2/L3` RMS current in Amps, Line-to-Line Voltage `415V`, Power Factor, Total HD%), plus row-level `CRAC` and `CDU` thermal capacities.
* **Prohibited Signals:** Zero visibility or agents inside customer servers.

---

## 3. User Stories

1. **As a Facility Electrical Engineer**, I want to inspect live **`Phase L1 / L2 / L3` Amps, Neutral Current (`A`), and Phase Imbalance `%`** on `PDU-A`, `PDU-B`, `PDU-C`, and `PDU-D` in the Controls Inspector, flagging any PDU exceeding the IEEE / NEMA `10%` current imbalance threshold.
2. **As a Data Hall Capacity Manager**, I want a **Row Stranded Capacity Chart (`ROW-A..D`)** comparing *Usable Electrical Spare kW (Phase-Derated)* vs. *Usable Cooling Spare kW*, highlighting exact **Sellable kW** vs. **Stranded Power / Stranded Cooling kW**.
3. **As an Electrician planning a whip re-balance**, I want a 1-click **`Simulate Phase Re-Tap`** preview showing recovered breaker kW and reduced PDU transformer loss (`kW`).

---

## 4. Electrical & Stranded Capacity Equations

### 4.1 3-Phase (`415V`) Current & Imbalance Calculation
For total 3-phase apparent power $S = \frac{P_{\text{PDU,kW}} \cdot 1000}{\text{PF}}$ at $V_{LL} = 415\text{ V}$:
$$I_{\text{avg}} = \frac{P_{\text{PDU,kW}} \cdot 1000}{\sqrt{3} \cdot V_{LL} \cdot \text{PF}} \quad [\text{Amps}]$$
Given phase load distribution weights $(w_1, w_2, w_3)$ with $\frac{w_1 + w_2 + w_3}{3} = 1$:
$$I_{L1} = w_1 I_{\text{avg}}, \quad I_{L2} = w_2 I_{\text{avg}}, \quad I_{L3} = w_3 I_{\text{avg}}$$
* **Phase Current Imbalance (`%`):**
  $$\text{Imbalance \%} = \frac{\max\bigl(|I_{L1} - I_{\text{avg}}|,\; |I_{L2} - I_{\text{avg}}|,\; |I_{L3} - I_{\text{avg}}|\bigr)}{I_{\text{avg}}} \times 100$$
* **Phasor Neutral Current (`120°` symmetrical displacement):**
  $$I_N = \sqrt{I_{L1}^2 + I_{L2}^2 + I_{L3}^2 - I_{L1}I_{L2} - I_{L2}I_{L3} - I_{L3}I_{L1}} \quad [\text{Amps}]$$
* **Phase-Derated Usable Electrical Spare (`NEC 80%` continuous rule on peak phase):**
  $$P_{\text{elec,usable}, r} = \max\!\left(0,\; 0.80 \cdot P_{\text{PDU,rated}, r} - P_{\text{PDU,current}, r} \cdot \frac{\max(I_{L1}, I_{L2}, I_{L3})}{I_{\text{avg}}}\right)$$

### 4.2 Row Sellable vs. Stranded kW
For each row $r \in \{\text{ROW-A..D}\}$ with available zone thermal headroom $Q_{\text{cool,spare}, r}$:
* $\text{Sellable kW}_r = \min\bigl(P_{\text{elec,usable}, r},\; Q_{\text{cool,spare}, r}\bigr)$
* $\text{Stranded Electrical kW}_r = \max\bigl(0,\; P_{\text{elec,usable}, r} - Q_{\text{cool,spare}, r}\bigr)$
* $\text{Stranded Cooling kW}_r = \max\bigl(0,\; Q_{\text{cool,spare}, r} - P_{\text{elec,usable}, r}\bigr)$

---

## 5. Backend Technical Specification

### 5.1 Schema Updates (`backend/models.py`)
* Extend `PDUTelemetry` with:
  * `phase_l1_amps: float = 0.0`, `phase_l2_amps: float = 0.0`, `phase_l3_amps: float = 0.0`
  * `neutral_amps: float = 0.0`, `phase_imbalance_pct: float = 0.0`
* Add `RowStrandedCapacityItem(BaseModel)` and `StrandedCapacityReport(BaseModel)`:
  * Per-row `usable_electrical_spare_kw`, `usable_cooling_spare_kw`, `sellable_kw`, `stranded_electrical_kw`, `stranded_cooling_kw`, `phase_imbalance_pct`, `rebalance_gain_kw`.

### 5.2 Simulator & Endpoints (`backend/simulator.py`, `backend/main.py`)
* Populate realistic row-dependent phase skews in `DataHallTwinEngine.step()` (e.g., `PDU-B` at `~11.8%` phase imbalance warning, `PDU-C` at `~4.2%` balanced) and add extra $I^2 R$ loss penalty when imbalance $> 10\%$.
* `GET /api/capacity/stranded` → Returns `StrandedCapacityReport`.
* `POST /api/pdu/{pdu_id}/rebalance` → Simulates electrician whip re-tapping (`imbalance < 2.0%`) and updates live `twin_engine`.

---

## 6. Frontend UI / UX Specification

* **Location:** Inside the **`Controls` Tab (`selectedType === 'pdu'`)** and a compact **`⚡ Stranded kW & 3-Phase`** card in `FacilityMLSuitePanel.tsx` / `Controls`.
* **UI Elements:**
  1. **3-Phase Bar Meter (`L1`, `L2`, `L3`, `N`)** with `Imbalance %` warning pill (`> 10% Amber`).
  2. **4-Row Stacked Comparison Chart:** `Deployed Load kW` + `Sellable Spare kW` + hatched `Stranded Power / Cooling kW` + `Simulate Whip Re-Balance` button.

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Symmetrical phasor equation yields $I_N = 0.0\text{ A}$ when $I_{L1} = I_{L2} = I_{L3}$ and accurate non-zero neutral amps under skew.
- [ ] Re-balancing an imbalanced PDU (`PDU-B`) immediately increases `usable_electrical_spare_kw` and decreases `pdu.loss_kw`.
- [ ] Degrading `CDU-1` (`cdu1_fouling` scenario) reduces `ROW-C` cooling spare and visibly converts previously sellable `PDU-C` electrical headroom into `Stranded Electrical kW`.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `calc_3phase_currents_and_imbalance`, `PhaseElectricalMetrics` (`backend/domain/electrical.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/pdu_phase_balancer.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/pdu_phase_balancer.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/PduPhaseBalancerPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
