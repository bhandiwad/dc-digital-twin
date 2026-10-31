# Pandita's Aether-DCTWIN — User & Operator Guide

**Step-by-Step Operations Manual, Feature Walkthrough & Customer Demo Playbook**

---

## Table of Contents
1. [Launching the Platform](#1-launching-the-platform)
2. [Command Center Layout & Light/Dark Theme](#2-command-center-layout--lightdark-theme)
3. [Navigating the 3D Data Hall, Overlays & CFD Plumes](#3-navigating-the-3d-data-hall-overlays--cfd-plumes)
4. [Injecting Live Operational Fault & Stress Scenarios](#4-injecting-live-operational-fault--stress-scenarios)
5. [Using the 6-Tab Engineering Workbench](#5-using-the-6-tab-engineering-workbench)
   - [Tab 1: ML / MOP Suite (OpenDT Calibration, Constrained MPC & GraphRAG MOP)](#tab-1-ml--mop-suite-opendt-calibration-constrained-mpc--graphrag-mop)
   - [Tab 2: 42U Server-Level Rack Elevation Inspector](#tab-2-42u-server-level-rack-elevation-inspector)
   - [Tab 3: Live Cooling Plant Controls (CRACs & Liquid CDUs)](#tab-3-live-cooling-plant-controls-cracs--liquid-cdus)
   - [Tab 4: AI Optimizer & Anomaly Root-Cause Feed](#tab-4-ai-optimizer--anomaly-root-cause-feed)
   - [Tab 5: Counterfactual "What-If" Lab](#tab-5-counterfactual-what-if-lab)
   - [Tab 6: Autonomous OpenRouter Tool-Calling Agent](#tab-6-autonomous-openrouter-tool-calling-agent)
6. [24-Hour Time-Series Replay ("TiVo for the Data Hall")](#6-24-hour-time-series-replay-tivo-for-the-data-hall)
7. [Onboarding Customer Data: BYOD & Protocol Connectors Hub](#7-onboarding-customer-data-byod--protocol-connectors-hub)
8. [Generating & Exporting the Executive ROI Business Case](#8-generating--exporting-the-executive-roi-business-case)
9. [5-Minute Executive Demo Script (For Data Center Operators & Investors)](#9-5-minute-executive-demo-script-for-data-center-operators--investors)

---

## 1. Launching the Platform

From `/Users/pb/dctwin`, run:
```bash
./start_twin.sh
```
Open **http://127.0.0.1:8000** in Chrome, Safari, or Edge.

---

## 2. Command Center Layout & Light/Dark Theme

The interface is organized into four synchronized zones:
1. **Top Executive KPI Ribbon**: Displays real-time **Facility Power (kW)**, **Live PUE vs. AI-Optimized PUE**, **Peak Cold-Aisle Inlet (°C)**, **Peak GPU Junction (°C)**, **Auto-Pilot Toggle**, **Light/Dark Mode Toggle (`☀️ Light` / `🌙 Dark`)**, **`BYOD & Connectors`**, and **`Executive ROI Report`**.
2. **Center 3D WebGL Data Hall**: Interactive 3D replica of the 32-rack hall (`ROW-A` & `ROW-B` Air-Cooled; `ROW-C` & `ROW-D` Direct-to-Chip Liquid-Cooled AI) with floating layer controls and scenario fault buttons.
3. **Bottom Time-Series Replay & Telemetry Strip**: 24-hour DuckDB/Parquet timeline scrubber (`00:00` to `23:55`) and 3 live sparkline/forecast panels (**Live PUE Trajectory**, **Peak GPU Junction Trend**, and **AI 30-Min Multi-Horizon Forecast**).
4. **Right 6-Tab Engineering Workbench**: Deep inspection and control panels (`ML / MOP`, `42U Rack`, `Controls`, `AI`, `What-If`, and `Agent`).

---

## 3. Navigating the 3D Data Hall, Overlays & CFD Plumes

- **Camera Controls**:
  - **Left-Click + Drag**: Orbit 360° around the data hall.
  - **Right-Click + Drag**: Pan across rows.
  - **Scroll Wheel**: Zoom in to individual racks, CRACs, CDUs, or PDUs.
- **3D Layer Selector (Top-Left Floating Bar)**:
  - **`Inlet Temp`**: Colors racks by cold-aisle intake temperature (Cyan `18°C` → Green `22°C` → Amber `26°C` → Red `>29°C`).
  - **`GPU Junction`**: Visualizes internal processor/cold-plate temperatures (`50°C` to `85°C`).
  - **`Rack Power`**: Shows instantaneous kW draw and adjusts the vertical power pillar atop each rack.
  - **`AI Anomaly Risk`**: Highlights racks flagged by `IsolationForest` + physics $\Delta T$ residual scoring.
  - **`Cooling Topology`**: Distinguishes Air-Cooled rows (Slate) from Direct-to-Chip Liquid rows (Cyan).
- **`Loops ON/OFF`**: Toggles the overhead `CDU-1` and `CDU-2` liquid cooling headers (with animated coolant flow pulses) and dashed purple PDU busways.
- **`CFD Plumes ON/OFF`**: Toggles the animated 3D rising hot-exhaust plumes and cold-to-hot airflow streamline particles on all 32 racks.

---

## 4. Injecting Live Operational Fault & Stress Scenarios

Use the **Top-Right Floating Scenario Bar** inside the 3D viewport to test how the Digital Twin and AI react to real facility emergencies:
- **`🟢 Baseline Healthy`**: Restores nominal compute load and healthy CRAC/CDU operation.
- **`🔥 Row C LLM Surge`**: Injects a synchronized `+145 kW` AI training power burst across Row C.
- **`⚠️ CRAC-2 Blower Trip`**: Trips the North-East air handler (`0 CFM`), causing asymmetric pressure loss and cold-aisle starvation in Rows A & B.
- **`💧 CDU-1 Loop Fouling`**: Simulates plate heat-exchanger / strainer fouling on Row C's liquid loop, reducing coolant flow and widening the approach $\Delta T$.
- **`🌀 Aisle Recirculation`**: Simulates a stuck hot-aisle containment damper causing hot exhaust spillover into `R-B06`, `R-B07`, `R-C05`, and `R-C06`.
- **`☀️ Ambient Heatwave`**: Raises outdoor wet-bulb temperature to `28.5°C`, degrading chiller plant COP and spiking PUE.

---

## 5. Using the 6-Tab Engineering Workbench

### Tab 1: `ML / MOP` Suite (PUE & Grid BESS, OpenDT Calibration, Constrained MPC & GraphRAG MOP)
Operates **100% on facility sensors & electrical/cooling infrastructure** without touching tenant servers:
1. **`⚡ PUE & Grid BESS` (Default Sub-Tab)**:
   - View the **5-way Real-Time PUE & Power Component Breakdown** (`IT Compute & GPUs`, `Chiller & Cooling Tower Plant`, `Perimeter CRAC VFD Fans`, `Liquid CDU Pumps`, and `UPS & PDU Transformer Losses`).
   - Toggle **🔋 UPS-A/B Li-Ion BESS Peak Shaving**, **❄️ Chilled-Water Thermal Pre-Cool & Coast**, and **⚡ Simulate Utility Critical-Peak Demand Response (DR) Event (`$0.285/kWh`)** to watch peak grid import drop by **`-209 to -235 kW`** (`~$152,844/yr` in combined TOU + peak-demand charge savings).
   - Inspect the **24-Hour Utility TOU Tariff, BESS Arbitrage & Thermal Pre-Cool Schedule** (`00:00` → `22:00`).
2. **`OpenDT RLS`**:
   - View online Recursive Least Squares + Kalman Filter convergence (`Uncalibrated RMSE ±3.00°C` → `OpenDT RLS RMSE ±0.34°C`).
   - Inspect each zone's learned **Thermal Resistance ($R_{\text{th}}$)** and **UA Fouling Drift (%)**. Try injecting **`💧 CDU-1 Loop Fouling`** from the top bar and watch `ZONE-C` transition to `MAINTENANCE_REQUIRED` as its learned $R_{\text{th}}$ drifts upward.
3. **`MPC / Safe-RL`**:
   - Inspect the **30-Minute Lookahead Trajectory (`+0m` to `+30m`)** comparing **Reactive PID Inlet** vs. **Constrained MPC Inlet**, active **Control Barrier Functions (CBFs)**, and anti-hunting VFD power savings.
4. **`GraphRAG MOP`**:
   - Choose any asset (`CDU-1`, `CDU-2`, `CRAC-2`, `CRAC-3`, `PDU-C`) and maintenance type (*Duplex Strainer Clean*, *VFD Replacement*, *Breaker Thermography*).
   - Review the `NetworkX` blast radius (`8 Racks`, `490+ kW` affected), required `T-15m` pre-cooling setpoints, and the 5-step LOTO execution checklist. Click **`Copy MOP (.md)`** to copy the full procedure document.

### Tab 2: `42U Rack` Server-Level Elevation Inspector
- Click any rack in the 3D scene (e.g., `R-C04`) to inspect its populated `U01–U42` slots (ToR InfiniBand Switch, CDU Manifold Header, `8x HGX B200` Cold-Plate Trays, NVLink Fabric, 48V Busbar Shelf).
- Click any server blade to view its individual **`GPU0`–`GPU7` cold-plate die temperatures** and test blade-level actions:
  - **`Restrict Liquid QD Valve`** (clogs that blade's Quick-Disconnect valve to 42% flow)
  - **`100% TDP Burn-In Spike`**
  - **`Apply 80% DVFS Power Cap`**
  - **`Restore Nominal Blade`**

### Tab 3: `Controls` (Live Cooling Plant Sliders)
- Manually adjust **CDU-1 / CDU-2 Liquid Supply Setpoints (`19–28°C`)** and **Pump Speeds (`40–100%`)**, or **CRAC 1–4 Air Setpoints (`15–22°C`)** and **VFD Fan Speeds (`35–100%`)**, and watch PUE and rack temperatures respond in real time.

### Tab 4: `AI` (Constrained Cooling Optimizer & Anomaly Feed)
- Review ranked setpoint recommendations with quantified kW, annual `\$`, and `tCO₂` impact.
- Click **`Execute Recommended Setpoints & Enable AI Auto-Pilot`** to let the closed-loop controller automatically remediate faults and optimize PUE.

### Tab 5: `What-If` Counterfactual Lab
- Click quick presets like **`🚀 +160kW GPU Load (Row C)`** or **`💧 Retrofit Row B to Liquid +80kW`**, or customize row load, CDU setpoint, and `N-1` CRAC trips.
- Click **`Run Counterfactual Simulation`** to compare Baseline vs. Projected PUE, facility power, peak temperatures, and thermal risk without disturbing the live hall.

### Tab 6: `Agent` (Autonomous OpenRouter Tool-Calling Agent)
- **Connecting OpenRouter**: Paste your `sk-or-v1-...` key into the **Configure OpenRouter / Model** box at the top of the tab, select any model (`anthropic/claude-3.7-sonnet`, `google/gemini-2.5-pro-preview`, `openai/gpt-4o`, etc.), and click **`Save Key`**.
- Ask natural-language questions or click the suggested prompts. Watch the Agent execute real Python tools (`run_opendt_rls_calibration`, `graphrag_blast_radius_and_sop`, `solve_constrained_mpc_lookahead`, `run_counterfactual_whatif`) and display the **Agent Tool Trace** cards with execution time in milliseconds above its answer.

---

## 6. 24-Hour Time-Series Replay ("TiVo for the Data Hall")

Located directly above the bottom telemetry charts:
1. Choose from the 3 built-in benchmark datasets (**Kaggle Green AI 24h**, **Zenodo/ORNL Frontier Liquid CDU 24h**, **IEEE DataPort HVAC Fault 24h**) or any customer dataset uploaded via BYOD.
2. Drag the **`00:00` → `23:55` slider** or click **`Replay 24h`** (`1x`, `4x`, `8x` speed) to scrub through the day and watch the 3D scene synchronize to that exact historical timestamp.
3. Click **`Notable Events & Citation ▼`** to jump directly to historical incidents (e.g., `14:10 • CDU-1 Strainer Fouling`).

---

## 7. Onboarding Customer Data: BYOD & Protocol Connectors Hub

Click **`BYOD & Connectors`** in the top-right header bar to open the enterprise onboarding modal:
- **Mode 1 (`BYOD CSV / Historian Ingest`)**:
  - Click any of the 3 vendor templates (**Schneider EcoStruxure**, **NVIDIA DCGM Export**, **Sunbird / OSIsoft PI**) or click **`Choose Local CSV File...`** to upload a prospect's `.csv` export.
  - Click **`Ingest into DuckDB/Parquet & Calibrate 3D Digital Twin`**. The AI Schema Auto-Mapper matches their vendor column names, writes a `.parquet` dataset, calibrates the 3D twin to their peak thermal interval, and loads their trace into the 24h replay bar.
- **Mode 2 (`Live Protocol Bridges`)**:
  - Select **BACnet/IP & Modbus TCP**, **NVIDIA DCGM Prometheus**, **DMTF Redfish / OpenBMC**, or **MQTT Sparkplug B** and click **`Test Handshake & Poll Live Frame`** to inspect live register/metric mappings and raw protocol payloads.

---

## 8. Generating & Exporting the Executive ROI Business Case

Click **`Executive ROI Report`** in the top-right header bar:
- View the financial & sustainability summary: **PUE Reduction**, **Annual OpEx Savings (`$/yr` & `MWh/yr`)**, **Unlocked AI Capacity (`+GPUs` supported & avoided Tier-III CapEx)**, **ESG Carbon (`tCO₂/yr`) & Evaporative Water (`kL/yr`) Saved**, and **5-Year NPV**.
- Click **`Copy Markdown`** or **`Export Report (.md)`** to hand a complete business case document to the prospect or executive sponsor.

---

## 9. 5-Minute Executive Demo Script (For Data Center Operators & Investors)

1. **Minute 1 — The 3D Hybrid Data Hall & Light/Dark Mode**:
   - Show the 32-rack hall with animated **CFD Plumes** and **Liquid Cooling Loops**. Toggle between **Dark Mode** and **Light Mode**, and click `R-C04` to show the **42U Rack Elevation** without needing server OS access.
2. **Minute 2 — Injecting a Real Facility Emergency**:
   - Click **`💧 CDU-1 Loop Fouling`** or **`⚠️ CRAC-2 Blower Trip`** in the top scenario bar. Watch the 3D racks turn red/amber, the 15-minute thermal forecast spike, and the **OpenDT RLS Calibration** panel flag `MAINTENANCE_REQUIRED` due to rising thermal resistance $R_{\text{th}}$.
3. **Minute 3 — Constrained MPC & Automated MOP Generation**:
   - In the **`ML / MOP`** tab, show the **Constrained MPC** 30-minute lookahead trajectory keeping temperatures inside ASHRAE A1 barriers, then switch to **`GraphRAG SOP / MOP`** to generate an instant 5-step LOTO procedure to service `CDU-1`.
4. **Minute 4 — Autonomous OpenRouter AI Agent Remediation**:
   - Open the **`Agent`** tab and click *"Execute remediation and optimize setpoints now"*. Watch the Agent invoke `execute_cooling_setpoints`, enable **AI Auto-Pilot**, and bring PUE down to `~1.15`.
5. **Minute 5 — Customer BYOD Upload & Executive ROI Close**:
   - Open **`BYOD & Connectors`**, ingest the **Schneider EcoStruxure BMS** CSV in one click, and open **`Executive ROI Report`** to show **~$199k/year in OpEx savings**, **+254 unlocked AI GPUs**, and a **3.2-month payback**.
