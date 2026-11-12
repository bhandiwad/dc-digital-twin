# Pandita's Aether-DCTWIN — Demo Storylines & Walkthrough Playbook

**Live Local URL:** `http://127.0.0.1:8000`

---

## 1. The 30-Second Opening Hook

> *"Modern data halls run legacy air-cooled racks right alongside high-density liquid-cooled AI racks. Today, facility teams over-cool the room just to stay safe, wait days to answer simple capacity questions, and react to pump or fan issues after alarms fire—all while strictly prohibited from installing agents on customer servers.*
>
> *Pandita's Aether-DCTWIN connects only to facility equipment—PDUs, liquid CDUs, perimeter CRACs, and UPS meters—giving operators one calm 3D view of the hall, 1-click cooling & utility peak savings, offline capacity what-if planning, and automated maintenance checklists."*

---

## 2. The 10-Minute "Golden Path" End-to-End Demo

If you have **10 minutes with mixed leadership + engineering stakeholders**, run these 4 beats in order:

1. **Calm Baseline & Immediate Savings (2.5m)** → Start on **`Overview`**, show live PUE savings & **`Apply Recommended Setpoints`**, toggle **`Grid & Peak Shaving`**, and open **`ROI Summary`**.
2. **Live Fault & Fast Triage (2.5m)** → Trigger **`Simulate Event → CRAC Blower Trip`**, watch only the impacted racks light up on the 3D floor, inspect a rack in **`Inspect`**, and **`Reset`**.
3. **Capacity Expansion Without Guesswork (2.5m)** → Open **`Plan → Capacity What-If`**, test **`+160 kW in ROW-C`** and **`Convert ROW-A to Liquid`**.
4. **Proactive Maintenance & Shift Handover (2.5m)** → Check **`Health`** for heat-exchanger drift + 30-min safety guardrails, generate a **`Maintenance Checklist`** for `CDU-1`, and run one query in **`Copilot`**.

---

## 3. Six Targeted Use-Case Storylines (Click-by-Click)

### Storyline 1: Cutting Cooling Waste & Utility Peak Bills
- **Best For:** VP of Operations, Sustainability Lead, CFO, Facility Director
- **Narrative:** Facility teams keep air and liquid setpoints 2°C colder than necessary out of caution, paying steep electric bills and peak demand charges during afternoon utility windows.
- **Walkthrough (`3 mins`):**
  1. Point to the clean top strip: **`Power`**, **`PUE`** (`Current → Optimized`), **`Peak Cold Inlet`**, and **`Alerts: Healthy`**.
  2. On the **`Overview`** tab under **`Cooling Optimization`**, click **`View proposed setpoint adjustments`** to show the exact CRAC/CDU temperature and fan/pump trims—nothing is a black box.
  3. Click **`Apply Recommended Setpoints`** (or enable **`Auto-Pilot`** in the top bar) and point out the live `PUE` drop.
  4. Under **`Grid & Peak Shaving`**, check **`Simulate Utility Peak Event`** (`$0.285/kWh`) to show how **UPS Battery Peak Shaving** and **Chilled-Water Pre-Cooling** trim ~200 kW of peak grid draw without touching IT racks.
  5. Click **`ROI Summary`** in the top bar to show annualized OpEx savings, avoided CO₂, and unlocked rack capacity.

---

### Storyline 2: Fast Triage During a Cooling Trip or AI Power Surge
- **Best For:** NOC Operators, Critical Facilities Engineers, Incident Commanders
- **Narrative:** When a perimeter CRAC trips—or an AI cluster surges +145 kW—operators normally face dozens of raw BMS threshold alarms without spatial context.
- **Walkthrough (`4 mins`):**
  1. Top-right of the 3D viewport: click **`Simulate Event` → `CRAC Blower Trip`** (or **`Liquid Row Surge`**).
  2. Highlight the calm-by-design alerting:
     - Only affected racks on the 3D floor illuminate with warning/critical rings and live temperature pills.
     - Top bar updates **`Alerts`** and surfaces an **`Active: CRAC Blower Trip [Reset]`** pill.
     - Right panel automatically opens **`Overview`** with plain-English impact and **`Recommended fix`**.
  3. Toggle **`Airflow`** in the top-left 3D layer bar to visualize hot exhaust plumes rising over the impacted aisle.
  4. Click any highlighted rack on the 3D floor—the right panel switches to **`Inspect`** (`Rack 42U View`), showing 42U server/manifold telemetry. Switch to **`Cooling Setpoints`** inside **`Inspect`** to adjust adjacent CRAC/CDU sliders live.
  5. Click **`Live Trends`** on the bottom dock to verify the **`30-Minute Forecast`** stays safely below the `27°C` ASHRAE limit, then click **`Reset`**.

---

### Storyline 3: 30-Second Capacity & Liquid Retrofit Decisions
- **Best For:** Capacity Planners, Colocation Sales Engineers, Data Center Architects
- **Narrative:** A customer asks: *"Can we add 160 kW of AI racks in Row C next month?"* or *"What happens if we convert legacy air-cooled Row A to direct liquid cooling?"* Answering in seconds wins deals and prevents stranded power.
- **Walkthrough (`3 mins`):**
  1. In the top-left 3D layer bar, click **`Cooling`** to show the split hall topology (Rows A–B Air Cooled vs. Rows C–D Direct-to-Chip Liquid Cooled with overhead supply loops), then click **`Rack kW`**.
  2. Open the **`Plan`** tab (`Capacity What-If`).
  3. Click the preset **`+160 kW in ROW-C`** (or drag **`Row IT Power Change`** and **`Liquid Supply Temp`**) and press **`Run Simulation`**.
  4. Walk through the **`Baseline → Projected`** deltas (PUE, peak cold inlet, liquid thermal margin, and risk level)—emphasizing that this runs in an isolated physics clone while live floor operations continue undisturbed.
  5. Click **`Convert ROW-A to Liquid`** to demonstrate how retrofitting an air row absorbs +80 kW of dense load while actually *improving* PUE.

---

### Storyline 4: Catching Strainer Fouling Early & Safe Maintenance Checklists
- **Best For:** Chief Building Engineers, Mechanical/Electrical Technicians, Compliance Leads
- **Narrative:** CDU strainers and heat exchangers foul slowly over weeks. Waiting for a high-temperature alarm risks thermal throttling, while isolating the wrong valve during maintenance can starve live racks.
- **Walkthrough (`4 mins`):**
  1. Click **`Simulate Event` → `CDU Strainer Fouling`**.
  2. Open the **`Health`** tab:
     - In **`Zone Calibration & Fouling`**, show how the twin detects efficiency loss (`%`) and flags **`Early Drift` / `Service Needed`** purely by comparing PDU electrical load against cooling loop $\Delta T$.
     - In **`30-Minute Safety Lookahead`**, compare **`Standard BMS`** (lags behind thermal inertia) against **`Smart Control`** (pre-cools within explicit hardware guardrails).
  3. Open **`Plan` → `Maintenance Checklist`**:
     - Select **`CDU-1 · Liquid CDU`** and **`Strainer / Filter Service`**.
     - Point out the automatic **Affected Scope** (downstream racks & kW), **15-minute pre-cool setpoints**, and step-by-step isolation & rollback triggers.
     - Click **`Copy`** to show 1-click export into a change ticket.
  4. Click **`Reset`** in the top-right pill.

---

### Storyline 5: DVR Time-Travel Replay & Zero-Agent Data Onboarding
- **Best For:** Customer Solutions Architects, BMS/OT Integrators, Security Reviewers
- **Narrative:** Prospects always ask two practical questions: *"How do we investigate what happened at 3:00 AM?"* and *"Can this work with our existing BMS/PDU data without touching tenant servers?"*
- **Walkthrough (`3 mins`):**
  1. Click **`24h Replay`** on the bottom dock below the 3D floor. Drag the timeline scrubber or press **Play** (`2x` / `4x`) to rewind the entire 3D hall and KPI strip across historical DuckDB snapshots, then click **`Exit Replay`**.
  2. Click **`Data`** in the top bar to open **Data & Connectors**.
  3. Point out the strict **Facility-Only Demarcation** (`BACnet/IP`, `Modbus TCP CDU`, `SNMPv3 PDU`, `MQTT Sparkplug B`—zero host/GPU agents) and demonstrate **BYOD CSV/JSON upload** for offline customer dataset evaluation.

---

### Storyline 6: Auditable Shift Handover with Facility Copilot
- **Best For:** Shift Supervisors, Junior Operators, Executive Walkthroughs
- **Narrative:** Operators want plain-English answers at shift change, backed by real telemetry and physics calculations—never LLM guesswork.
- **Walkthrough (`2 mins`):**
  1. Open the **`Copilot`** tab (clean chat view using the built-in physics assistant out of the box, or optional OpenRouter/OpenAI key under **`LLM Key`**).
  2. Click *"Which racks have the warmest inlet temperatures right now?"* or *"Check CDU heat-exchanger drift and fouling health"*.
  3. Expand **`Ran X facility inspection tools`** above the response to show the exact deterministic tool calls (`inspect_facility_telemetry`, `query_duckdb_24h_history`, `run_counterfactual_whatif`) and execution times.
