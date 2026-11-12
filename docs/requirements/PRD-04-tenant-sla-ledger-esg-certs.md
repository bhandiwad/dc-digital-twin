# PRD-04: Tenant Demarcation SLA Ledger, Blame-Defense & ESG / WUE Certificates

| Metadata | Details |
| :--- | :--- |
| **Feature ID** | `PRD-04` |
| **Platform** | **Pandita's Aether-DCTWIN** |
| **Track** | Colocation Commercial Operations, SLA Defense & EU EED Sustainability |
| **Estimated Effort** | `Medium (4–5 Engineering Days)` |
| **Assignee** | *TBD (Assign via GitHub PR)* |
| **Demarcation Boundary** | **100% Facility Demarcation Point** (PDU Branch Whip + CDU Manifold Tap) — Zero tenant server access |
| **Target Codebase Touchpoints** | `backend/domain/ashrae.py`, `backend/services/tenant_sla_esg.py`, `backend/api/features/tenant_sla_esg.py`, `frontend/src/components/workbench/features/TenantSlaEsgPanel.tsx` |

---

## 1. Problem Statement & Operator Value

Colocation operators face two intense commercial pressures from enterprise and AI hyperscale customers:
1. **Thermal Excursion "Blame Defense":** When an AI tenant's GPUs thermal-throttle, the tenant immediately claims the data center violated its cooling SLA and demands service credits. In reality, excursions are frequently **tenant-induced** (e.g., tenant drew `115%` of contracted kW whip allocation, installed blanking-panel gaps causing local recirculation, or blocked internal server fans while facility cold-aisle supply air and CDU supply coolant stayed strictly within ASHRAE A1 / W2 limits!). Operators need automated **Demarcation Blame Attribution** measured strictly at the facility handoff point.
2. **Per-Tenant Overhead Cooling & EU EED / Scope 2 Reporting:** Flat facility-average PUE billing penalizes efficient liquid-cooled tenants (`PUE ~ 1.11`) for perimeter CRAC fans serving legacy air cages (`PUE ~ 1.38`). Under the **EU Energy Efficiency Directive (EED)** and enterprise ESG audits, tenants require auditable certificates showing their exact IT `kWh`, attributed cooling overhead `kWh`, **Water Usage Effectiveness (`WUE`)**, and Scope 2 `kgCO₂`.

---

## 2. Strict Facility Demarcation Guarantee

* **Demarcation Sensors Only:**
  * **Electrical:** Row PDU branch circuit breaker meters (`kW` draw vs. contracted `kW` cap).
  * **Liquid Handoff:** CDU row manifold supply temperature ($T_{\text{CDU,sup}}$) & differential pressure ($\Delta P$).
  * **Air Handoff:** Cold-aisle boundary supply temperature sensors ($T_{\text{inlet}}$).
* **Zero Server Access:** Never inspects tenant workloads, processes, or IPMI logs.

---

## 3. Default Colocation Tenant Mapping (32-Rack Hall)

Map the 4 rows into 4 realistic colocation tenant cages (configurable via API):
* **`TENANT-ALPHA` (*HyperScale AI Labs*):** `ROW-C` (`R-C01..R-C08`), Contracted `560 kW`, ASHRAE Liquid Class `W2` (`Supply ≤ 27°C`) + Air `A1` (`Inlet ≤ 27°C`).
* **`TENANT-BETA` (* Sovereign Cloud Inference*):** `ROW-D` (`R-D01..R-D08`), Contracted `440 kW`, ASHRAE Liquid Class `W2` + Air `A1`.
* **`TENANT-GAMMA` (*FinServ Core Enterprise*):** `ROW-A` (`R-A01..R-A08`), Contracted `125 kW`, ASHRAE Air Class `A1` (`18–27°C`).
* **`TENANT-DELTA` (*Media & Object Storage*):** `ROW-B` (`R-B01..R-B08`), Contracted `150 kW`, ASHRAE Air Class `A1` (`18–27°C`).

---

## 4. Attribution & Blame-Defense Formulas

### 4.1 Excursion Causal Attribution Rule
Whenever any rack $i$ in tenant cage $k$ exhibits elevated temperature ($T_{\text{inlet}, i} > 27.0^\circ\text{C}$ or $T_{\text{chip}, i} > 75.0^\circ\text{C}$):
* **Case A — `FACILITY_SLA_RISK`:** Zone CRAC supply air $> 21.5^\circ\text{C}$ (disabled/tripped) OR CDU supply coolant $> 27.0^\circ\text{C}$ / fouled flow below contract minimum while tenant power $P_{k} \le P_{\text{contract}, k}$.
* **Case B — `TENANT_OVERDRAW_OR_BYPASS` (Operator Protected):** Facility handoff supply (`CRAC` supply air $\le 20.5^\circ\text{C}$ and `CDU` supply $\le 26.5^\circ\text{C}$) is **100% compliant**, AND either $P_k > 1.02 \cdot P_{\text{contract}, k}$ (contracted breaker over-draw) OR rack blanking-panel recirculation fault (`rack_recirc_fault`) is active on tenant cabinet.

### 4.2 Physics-Proportional Zone PUE, WUE & Carbon Allocation
Instead of multiplying every tenant by global PUE, attribute cooling & electrical losses proportionally by actual heat-rejection pathway:

$$P_{\text{overhead}, k} = P_{\text{air}, k} \cdot \left(\frac{P_{\text{CRAC,zone}} + P_{\text{chiller,air}}}{Q_{\text{air,zone}}}\right) + P_{\text{liq}, k} \cdot \left(\frac{P_{\text{CDU,zone}} + P_{\text{chiller,liq}}}{Q_{\text{liq,zone}}}\right) + P_{\text{PDU/UPS\_loss}, k}$$

$$\text{Effective Tenant PUE}_k = \frac{P_{\text{IT}, k} + P_{\text{overhead}, k}}{P_{\text{IT}, k}}$$

$$\text{Tenant Carbon Rate}_k = \bigl(P_{\text{IT}, k} + P_{\text{overhead}, k}\bigr) \cdot \frac{I_{\text{carbon}}}{1000} \quad [\text{kgCO}_2/\text{hr}]$$

---

## 5. Backend Technical Specification

### 5.1 Pydantic Schemas (`backend/models.py`)
* `AttributionVerdict(str, Enum)`: `"COMPLIANT"`, `"TENANT_INDUCED_EXCURSION"`, `"FACILITY_SLA_BREACH"`
* `TenantCageSLARecord(BaseModel)`: `tenant_id`, `tenant_name`, `row_id`, `rack_ids: List[str]`, `cooling_class: str`, `contracted_kw: float`, `actual_it_kw: float`, `contract_utilization_pct: float`, `allocated_cooling_kw: float`, `effective_tenant_pue: float`, `wue_liters_per_hr: float`, `scope2_co2_kg_per_hr: float`, `sla_uptime_pct: float`, `handoff_supply_temp_c: float`, `max_cage_inlet_c: float`, `attribution_verdict: AttributionVerdict`, `attribution_evidence: str`
* `TenantSLAPortalResponse(BaseModel)`: `timestamp: float`, `facility_blended_pue: float`, `eu_eed_compliant: bool`, `tenants: List[TenantCageSLARecord]`

### 5.2 Service & Endpoints (`backend/ai_engine.py`, `backend/main.py`)
* `GET /api/tenants/sla-ledger` → Computes `TenantSLAPortalResponse` from live `twin_engine` and 24h DuckDB history.
* `GET /api/tenants/{tenant_id}/certificate.md` → Generates a downloadable monthly **Tenant SLA, PUE/WUE & Scope 2 Carbon Audit Certificate** (`PlainTextResponse` Markdown).

---

## 6. Frontend UI / UX Specification

* **Location:** Add a **`🏢 Tenant SLA & ESG Certificates`** tab inside `ExecutiveROIModal.tsx` (or dedicated header modal), styled cleanly for Light and Dark modes.
* **UI Elements:**
  1. **4-Tenant Cage Ledger Cards:** Contracted vs. Actual kW progress bar, Effective Tenant PUE (`e.g., 1.108 Liquid vs. 1.312 Air`), SLA Compliance (`99.998%`), and prominent **Blame-Defense Status Pill** (`Facility Handoff Compliant` vs. `Tenant Over-Draw Detected` vs. `Facility SLA Alert`).
  2. **Excursion Evidence Box:** Live diagnostic string citing exact demarcation readings when scenarios like `gpu_burst_row_c` or `recirc_hotspot` are triggered.
  3. **Per-Tenant `Export ESG & SLA Certificate (.md)` Button.**

---

## 7. Acceptance Criteria & Definition of Done

- [ ] Triggering `gpu_burst_row_c` (`+30%` AI Burst) pushes `TENANT-ALPHA` above `560 kW` contracted draw and classifies any thermal elevation as `TENANT_INDUCED_EXCURSION` when `CDU-1` supply remains within spec.
- [ ] Triggering `crac2_trip` while `TENANT-GAMMA` is below contracted kW classifies any `ROW-A` inlet rise $> 27^\circ\text{C}$ as `FACILITY_SLA_BREACH`.
- [ ] Weighted sum of tenant IT + allocated overhead kW reconciles within `±0.5%` of `facility.total_facility_power_kw`.
- [ ] Certificate export downloads cleanly and UI compiles without errors.

---

## Team Onboarding & Modular Implementation Map (Phase 0 Ready)

> **Non-Domain Engineers — Start Here:** Read `docs/DOMAIN_PRIMER_FOR_SWES.md` and `CONTRIBUTING.md` before coding. You do **not** need to derive thermodynamics or 3-phase AC equations from scratch.

1. **Ready-to-Use Physics SDK Primitives**: Import `ASHRAE_AIR_ENVELOPES_C`, `ASHRAE_LIQUID_MAX_SUPPLY_C` (`backend/domain/ashrae.py`), `calc_pue` (`backend/domain/electrical.py`), `DuckDBTelemetryStore` (`backend/telemetry_store.py`).
2. **Backend Service Module**: Implement business logic in `backend/services/tenant_sla_esg.py` using topology-generic graph/asset iteration (`engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, `engine.site_config`) — **zero hardcoded row or unit IDs**.
3. **Zero-Conflict FastAPI Router**: Create `backend/api/features/tenant_sla_esg.py` exporting `router = APIRouter()`. It is **auto-mounted** by `backend/api/plugin_loader.py` with zero edits to `backend/main.py`.
4. **Zero-Conflict Workbench UI Panel**: Create `frontend/src/components/workbench/features/TenantSlaEsgPanel.tsx` exporting `export const plugin: FeatureWorkbenchPlugin = ...`. It is **auto-discovered** by `featureTabs.ts` with zero edits to `frontend/src/App.tsx`.
5. **Verification Gate**: Add unit & multi-topology tests under `tests/` verifying both `configs/sites/default_hall.yaml` (32 racks) and `configs/sites/compact_edge_16rack.yaml` (16 racks), then run `PYTHONPATH=backend pytest tests -v` and `npx --prefix frontend tsc --noEmit`.
