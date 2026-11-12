# Pandita's Aether-DCTWIN
**AI-Native Digital Twin & Autonomous Facility Operations Platform for High-Density AI Data Centers**

---

## Overview

**Pandita's Aether-DCTWIN** is a production-structured, config-driven **Data Center Critical Facilities Digital Twin** engineered for modern hybrid-cooled data halls that combine perimeter air cooling (`CRAC`) with **direct-to-chip liquid cooling (`CDU`)** for high-density AI clusters (`65–85 kW/rack`).

Designed strictly around the real-world **Critical Facilities vs. Tenant IT demarcation boundary**, Aether-DCTWIN delivers self-calibrating electro-thermal physics, constrained Model Predictive Control (`SLSQP MPC`), BACnet Priority Array supervisory control, automated Method of Procedure (`MOP`) generation, and counterfactual *"What-If"* capacity simulation **without ever requiring agents, exporters, or access inside tenant IT servers**.

---

## Executive Deck, PDFs & Live Demo Playbook

- **[Pandita AI — AI for Data Centres (Updated Platform Deck)](docs/Pandita_AI_for_Data_Centres_Updated_Deck.pdf)** — 14-slide widescreen presentation combining Pandita AI's data centre strategy with live product screenshots across cooling, 10k-GPU planning, predictive maintenance, fault triage, Copilot, and ROI.
- **[Master 6-Act Live Demo Playbook (`docs/DEMO_PLAYBOOK.md`)](docs/DEMO_PLAYBOOK.md)** — Click-by-click speaker walkthrough and plain-English talking tracks for customer and executive demos.
- **[Simple 2-Page Product Overview (`docs/Aether_DCTWIN_Simple_Overview.pdf`)](docs/Aether_DCTWIN_Simple_Overview.pdf)** — Concise non-technical summary of business outcomes and facility-side safety.
- **[2-Page Technology Stack Reference (`docs/Aether_DCTWIN_Technology_Stack.pdf`)](docs/Aether_DCTWIN_Technology_Stack.pdf)** — Breakdown of the 3D WebGL frontend, FastAPI/DuckDB backend, physics & SciPy solvers, and OT protocol boundary.

---

## New Team Members: Start Here!

Assigning or picking up one of the Feature Specification PRs (`PRD-01` through `PRD-10`)? Read these three guides first (no prior HVAC or electrical background required):

1. **[Data Center Critical Facilities for Software Engineers (`docs/DOMAIN_PRIMER_FOR_SWES.md`)](file:///Users/pb/dctwin/docs/DOMAIN_PRIMER_FOR_SWES.md)** — Translates PUE, CRACs, CDUs, Wet-Bulb, Dew Point, 3-Phase PDUs, and BACnet Priority Arrays into distributed systems mental models.
2. **[Modular Architecture Guide (`docs/ARCHITECTURE.md`)](file:///Users/pb/dctwin/docs/ARCHITECTURE.md)** — Complete map of declarative YAML blueprints (`configs/sites/`), the pure Physics SDK (`backend/domain/`), BACnet adapters (`backend/adapters/`), numerical solvers (`backend/services/`), and zero-conflict plugin loaders.
3. **[Developer Contributing Guide (`CONTRIBUTING.md`)](file:///Users/pb/dctwin/CONTRIBUTING.md)** — Local setup, `pytest` invariant suite, multi-topology verification, and how to ship a feature PR in 4 conflict-free steps.

---

## Key Capabilities at a Glance

| Capability Pillar | What It Does | Key Modules |
| :--- | :--- | :--- |
| **1. Declarative Multi-Site 3D Digital Twin & 42U Inspector** | Config-driven 3D WebGL data hall (`configs/sites/*.yaml`, e.g., 32-rack Hybrid AI Hall or 16-rack Edge Hall) with 5 heatmap layers, CFD exhaust plumes, liquid coolant flow pulses, **Light/Dark Mode**, and clickable **42U rack elevation drill-down**. | `configs/sites/`, `frontend/src/components/DataHall3D.tsx`, `RackElevation42U.tsx` |
| **2. Validated Critical Facilities Physics SDK** | Pure, unit-tested thermodynamic & electrical functions: Magnus-Tetens dew point, chiller `COP` & waterside economizer share, VFD cubic affinity laws, sensible $\Delta T$, thermal ride-through runway, and `120°` 3-phase phasor neutral current. | `backend/domain/` |
| **3. Stateful OpenDT Self-Calibration (`NumPy` RLS)** | Online `2×2` Recursive Least Squares covariance filter learning zone **Thermal Resistance ($R_{\text{th}}$)** and **Thermal Capacitance ($C_{\text{th}}$)** from PDU & CDU/CRAC demarcation meters—detecting heat-exchanger `UA` fouling drift automatically. | `backend/services/calibration_rls.py`, `SystemHealthPanel.tsx` |
| **4. Constrained `SciPy SLSQP` MPC Controller** | Solves a receding-horizon 30-minute trajectory using `scipy.optimize.minimize(..., method="SLSQP")` with hard **Control Barrier Functions (CBF)** (`Cold-Aisle ≤ 27.0°C`, `CDU Return ≤ 40.0°C`, `Max VFD Slew ≤ 4%/min`). | `backend/services/mpc_solver.py`, `SystemHealthPanel.tsx` |
| **5. BACnet Priority 8/16 Adapter & Facility Connectors** | Hardware abstraction supporting ASHRAE 135 **BACnet Priority 8** supervisory setpoint writes with atomic `NULL` relinquishment to **Priority 16** local PID, plus **Modbus TCP CDU, SNMPv3 EPMS, Sparkplug B, and BYOD CSV** ingestion. | `backend/adapters/`, `backend/connectors.py`, `DataConnectorsModal.tsx` |
| **6. PUE, Utility TOU Grid Tariff & UPS BESS Peak-Shaving** | Real-time 5-way facility power & PUE decomposition, config-driven Utility Time-of-Use (`TOU`) tariff arbitrage, **UPS Li-Ion BESS peak-demand shaving**, and chilled-water thermal storage pre-cooling. | `backend/services/energy_roi.py`, `OverviewOptimizePanel.tsx` |
| **7. GraphRAG Blast-Radius & Automated MOP Generator** | Traverses the `NetworkX` facility dependency graph from any asset (`CDU`, `CRAC`, `PDU`) to identify downstream blast radius and generates an ASHRAE TC 9.9 **Method of Procedure (MOP)** with `T-15m` pre-cooling setpoints and LOTO steps. | `backend/services/mop_graphrag.py`, `PlanSandboxPanel.tsx` |
| **8. OpenRouter LLM Tool-Calling Agent & Executive ROI** | Live function-calling LLM loop (`OpenRouter` / `OpenAI` compatible) chaining 7 simulator, RLS, MPC, GraphRAG, and DuckDB SQL tools, paired with an inline **ROI & Unlocked Capacity** tab and **10k-GPU Cluster Scale-Out Planner**. | `backend/llm_agent.py`, `AgentCopilotPanel.tsx`, `ROIBusinessCasePanel.tsx`, `cluster_planner.py` |

---

## Quick Start

### 1. Single-Command Local Launch
```bash
chmod +x start_twin.sh
./start_twin.sh
```
Open **http://127.0.0.1:8000** in your browser.

*(Optional)* Switch to an alternate customer site blueprint or configure an OpenRouter API key:
```bash
export DCTWIN_SITE_CONFIG="configs/sites/compact_edge_16rack.yaml"
export OPENROUTER_API_KEY="sk-or-v1-..."
./start_twin.sh
```

### 2. Run Automated Guardrail & Physics Tests
```bash
PYTHONPATH=backend .venv/bin/pytest tests -v
```

### 3. Docker Compose Launch
```bash
docker compose up --build
```

### 4. Hot-Reload Team Development Mode
```bash
# Terminal 1: FastAPI Backend
PYTHONPATH=backend .venv/bin/uvicorn main:app --reload --port 8000

# Terminal 2: Vite Frontend Dev Server
cd frontend && npm run dev
```

---

## Documentation Index

- **[docs/Aether_DCTWIN_Simple_Overview.pdf](file:///Users/pb/dctwin/docs/Aether_DCTWIN_Simple_Overview.pdf)** — Clean 2-page plain-English overview & value proposition.
- **[docs/Aether_DCTWIN_Technology_Stack.pdf](file:///Users/pb/dctwin/docs/Aether_DCTWIN_Technology_Stack.pdf)** — 2-page technology stack & system architecture reference.
- **[docs/DEMO_PLAYBOOK.md](file:///Users/pb/dctwin/docs/DEMO_PLAYBOOK.md)** — Master 6-Act presenter storyline & complete feature showcase guide.
- **[docs/DOMAIN_PRIMER_FOR_SWES.md](file:///Users/pb/dctwin/docs/DOMAIN_PRIMER_FOR_SWES.md)** — *"Data Center Critical Facilities for Software Engineers"* (non-domain onboarding Rosetta Stone).
- **[docs/ARCHITECTURE.md](file:///Users/pb/dctwin/docs/ARCHITECTURE.md)** — Modular backend/frontend architecture, YAML site configs, and zero-conflict plugin loaders.
- **[CONTRIBUTING.md](file:///Users/pb/dctwin/CONTRIBUTING.md)** — Developer workflow, unit-suffix standards, demarcation guardrails, and PR checklist.
- **[docs/DEPLOYMENT.md](file:///Users/pb/dctwin/docs/DEPLOYMENT.md)** — Bare-metal, Docker Compose, Cloud PaaS, Nginx TLS (`wss://`), Kubernetes (`k8s`), and BMS/EPMS firewall guide.
- **[docs/TECHNICAL_DOCUMENTATION.md](file:///Users/pb/dctwin/docs/TECHNICAL_DOCUMENTATION.md)** — Electro-thermal equations, RLS & SLSQP MPC formulations, DuckDB historian schema, and REST/WebSocket reference.
- **[docs/USER_DOCUMENTATION.md](file:///Users/pb/dctwin/docs/USER_DOCUMENTATION.md)** — Operator & customer demo walkthrough.

---

## Repository Structure

```text
dctwin/
├── .github/workflows/ci.yml           # Automated Pytest + TypeScript CI on every Push & PR
├── CONTRIBUTING.md                    # Team onboarding, unit rules & 4-step feature PR workflow
├── README.md                          # Overview, quick start & documentation index
├── configs/sites/                     # Declarative customer facility blueprints (zero hardcoded IDs)
│   ├── default_hall.yaml              # 32-Rack Hybrid Air + Direct-Liquid AI Hall
│   └── compact_edge_16rack.yaml       # 16-Rack Edge AI Hall (used in multi-topology CI tests)
├── backend/
│   ├── config_loader.py               # Pydantic-validated YAML site & tariff config loader
│   ├── domain/                        # Pure Physics SDK (ASHRAE, psychrometrics, hydraulics, 3-phase AC)
│   ├── adapters/                      # BaseTelemetryAdapter + BACnet Priority 8/16 & NULL relinquish
│   ├── services/                      # Modular NumPy RLS, SciPy SLSQP MPC, What-If, MOP, TOU & ROI
│   ├── api/
│   │   ├── deps.py                    # Shared TwinRuntimeContainer dependency singleton
│   │   ├── routers/                   # Core domain FastAPI routers
│   │   ├── plugin_loader.py           # Auto-mounts feature routers in api/features/*.py
│   │   └── features/                  # Drop-in conflict-free feature routers (PRD-01..PRD-10)
│   ├── simulator.py                   # Topology-generic coupled electro-thermal engine + NetworkX graph
│   ├── telemetry_store.py             # DuckDB + Parquet 24-hour historian & SQL engine
│   ├── connectors.py                  # BACnet/Modbus/CoolIT CDU/SNMP EPMS/Sparkplug bridges & BYOD mapper
│   ├── llm_agent.py                   # OpenRouter / OpenAI tool-calling agent loop
│   └── main.py                        # Thin 89-line FastAPI entrypoint
├── frontend/src/
│   ├── App.tsx                        # Clean application shell & 3D viewport layout
│   ├── api/client.ts                  # Typed REST client helpers
│   └── components/
│       ├── DataHall3D.tsx             # Clean Three.js / R3F 3D data hall, hover pills & liquid loops
│       ├── RackElevation42U.tsx       # 42U rack elevation & manifold valve/load inspector
│       └── workbench/                 # Uncluttered 5-tab right panel + auto-discovered features/*.tsx
└── tests/                             # Pytest Physics SDK, Multi-Topology, Demarcation & API suite
```
