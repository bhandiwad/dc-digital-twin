# Pandita's Aether-DCTWIN — Master Demo Storyline & Complete Showcase Guide

**Live Local URL:** `http://127.0.0.1:8000`

---

## Presenter Narrative Arc (15–20 Minute Full Showcase)

Instead of clicking random tabs, tell **one continuous story about a single facility team's day**—starting from calm morning operations, capturing immediate energy savings, surviving a sudden afternoon equipment failure, sizing a massive new 10,000-GPU customer request, planning safe preventive maintenance, and wrapping up shift handover:

1. **Act 1: The Floor (`2–3m`)** — 3D Hybrid Air + Liquid Hall & Zero-Agent Demarcation Rule
2. **Act 2: Save Money Today (`3–4m`)** — Closed-Loop Auto-Pilot, Peak Utility Shaving & Inline ROI
3. **Act 3: Survive a Crisis (`4m`)** — 5 Live Fault Events, 42U Rack Drill-Down & Cooling Sliders
4. **Act 4: Plan Growth (`4m`)** — 10,000-GPU Mega-Cluster Scale-Out & Phase-1 Row Retrofit
5. **Act 5: Prevent Downtime (`2–3m`)** — Strainer Fouling Calibration, Safety Guardrails & MOP Checklists
6. **Act 6: Prove & Hand Over (`2–3m`)** — 24h DuckDB DVR Replay, BYOD CSV Onboarding & Copilot

---

## Act 1: Orienting the Room — The Hybrid Hall & Demarcation Rule (`2–3 mins`)

### What to Say
> *"Walk into almost any modern data center today and you'll see two worlds sharing one room: legacy 15–20 kW air-cooled racks right next to 45–125 kW liquid-cooled AI racks. Legacy BMS screens give you thousands of flat sensor tags, and facility teams aren't allowed to install agents on customer servers.*
>
> *What you're looking at is Pandita's Aether-DCTWIN—built strictly on facility-side meters: row PDUs, liquid CDUs, perimeter CRACs, and UPS systems. Zero software on tenant servers."*

### What to Click & Showcase
1. **Top KPI Strip:** Point out the single-glance vitals: **`Power`** (`~1,338 kW` facility / `1,010 kW` IT), **`PUE`** (`1.32 → 1.26`), **`Peak Cold Inlet`** (`~20.7°C`), and **`Alerts: Healthy`**.
2. **Orbit & Hover on the 3D Floor:** Drag to rotate/zoom the 32-rack hall. Move your cursor across individual racks, the blue **CRAC** perimeter units, the cyan **CDU** liquid units on the right, and the purple **PDU** row lineups on the left. Labels appear **only on hover, selection, or alert**.
3. **Top-Left 3D Layer Bar (Show all 5 perspectives + 2 overlays):**
   - **`Inlet °C`:** Cold-aisle intake health across all 32 racks.
   - **`Rack kW`:** Power density contrast between legacy Rows A–B and dense AI Rows C–D.
   - **`Thermal`:** Estimated internal thermal load proxy derived from power and cooling ΔT.
   - **`Cooling`:** Architectural split—16 slate **Air** racks (Rows A–B) vs. 16 sky-blue **Liquid** racks (Rows C–D).
   - **`Risk`:** Anomaly confidence map (calm green at baseline).
   - **`Loops` & `Airflow` Toggles:** Point out the animated overhead cyan liquid manifolds (`Loops`), then toggle **`Airflow`** briefly to show 3D rising hot-aisle exhaust plumes.
4. **Top-Right Sun / Moon Icon:** Toggle **Light Mode** briefly for bright conference rooms vs. dark NOC walls, then return to Dark Mode and **`Inlet °C`**.

---

## Act 2: Day-1 Payback — Smart Cooling, Peak Shaving & Inline ROI (`3–4 mins`)

### What to Say
> *"Notice our cold aisles are sitting around 18.6°C to 20.7°C—way below the 27°C ASHRAE safe limit—because engineers leave cooling on fixed conservative defaults year-round. Let's turn on Auto-Pilot."*

### What to Click & Showcase
1. **`Overview` Tab → `Cooling Optimization` Card:**
   - Point out **`Manual Mode — cooling units are running fixed default setpoints`** and expand **`View 5 proposed setpoint adjustments`** to show the exact CRAC air temperature, CDU warm-water, and VFD fan/pump speed recommendations.
2. **Turn Auto-Pilot ON:** Click **`Enable Auto-Pilot & Apply Setpoints`** (or the **`Auto-Pilot`** pill in the top bar).
   - Top bar **`Power`** drops immediately by **`~65–80 kW`** and **`PUE`** steps down (`1.32 → 1.26`).
   - 3D racks shift from over-cooled cyan (`18.6°C`) to efficient emerald green (`~21.5–23.0°C`).
   - Top-right button turns green (**`Auto-Pilot On (-66 kW)`**) and `Overview` shows **`Auto-Pilot Active`**.
3. **Demonstrate Safe Hardware Fallback:** Click **`Switch to Manual Mode (Fixed Setpoints)`** briefly—`Power` and `PUE` revert cleanly to built-in hardware defaults—then turn **`Auto-Pilot`** back **On**.
4. **`Overview` Tab → `Grid & Peak Shaving` Card:**
   - Check **`Simulate Utility Peak Event`** (`$0.285/kWh`).
   - Show **`UPS Battery Peak Shaving`** + **`Chilled-Water Pre-Cooling`** shaving `>200 kW` off peak grid draw, and expand **`Power breakdown & 24h tariff schedule`**.
5. **`ROI` Tab (Inline Business Case):**
   - Walk through **Annual OpEx Savings**, **PUE Reduction**, **Unlocked AI Capacity (`+GPUs` / `+kW`)**, **5-Year NPV**, **Avoided Tier-III CapEx**, lever-by-lever dollar breakdown, and 1-click **`Copy` / `.md`** export.

---

## Act 3: Surviving an Afternoon Crisis — Fault Simulation, 42U Drill-Down & Live Controls (`4 mins`)

### What to Say
> *"Saving money on a calm Tuesday is great—but chief engineers judge software on what happens when hardware breaks at 2:00 PM. Let's trip a cooling unit."*

### What to Click & Showcase
1. **Top-Right `Simulate Event` Menu:**
   - Trigger **`CRAC Blower Trip`** (also available: **`Liquid Row Surge`**, **`CDU Strainer Fouling`**, **`Hot-Aisle Bypass`**, **`Summer Heatwave`**).
   - Only impacted racks illuminate on the 3D floor; the top bar surfaces **`Active: CRAC Blower Trip [Reset]`**; **`Overview`** displays root cause and **`Recommended fix`**.
2. **Drill Into a 42U Rack (`Inspect` Tab → `Rack 42U View`):**
   - Click any highlighted rack on the floor to inspect its 42U chassis list (switches, 8-GPU nodes, power shelves, liquid manifold supply/return).
   - Open **`Simulate rack manifold or load fault`** on a liquid rack to test **`Restrict Manifold`** or **`Load Spike`**, then **`Reset`**.
3. **Manual Override Sliders (`Inspect` Tab → `Cooling Setpoints`):**
   - Switch to **`Cooling Setpoints`** and adjust live CDU/CRAC supply temperature and pump/fan sliders.
4. **Verify Thermal Trajectory (`Bottom Dock` → `Live Trends`):**
   - Open **`Live Trends`** to verify the **`30-Minute Forecast`** stays safely below the `27°C` ASHRAE red line, then collapse **`Live Trends`** and click **`Reset`** in the top-right scenario pill.

---

## Act 4: Strategic Capacity Planning — From 10,000-GPU Mega-Clusters to Single-Row Retrofits (`4 mins`)

### What to Say
> *"Next comes the big strategic question: 'Our AI team—or an anchor tenant—wants to deploy a 10,000-GPU training cluster. What actually changes, and what can we fit in our existing building next month?'"*

### What to Click & Showcase
1. **`Plan` Tab → `AI Cluster` (Multi-MW Scale-Out Planner):**
   - Show **`10k Cluster`** (`10,000 GPUs`) on **`NVIDIA GB200 NVL72 (72 GPU · 126 kW/rack)`** with **`Warm-Water Liquid (30°C)`**:
     - Requires **`18.0 MW IT` (`20.4 MW` utility)** across **`157 racks` (`139` GPU + `18` fabric)** = **`5 Data Halls`** (vs. Hall 1's `32 racks / ~1.0 MW`).
   - Switch **Cooling Plant Design** briefly to **`Perimeter CRAC Air-Only`** to show the physical infeasibility guard (`>35 kW/rack` exceeds air limits), then return to **`Warm-Water Liquid`**.
   - Walk through the **6 Infrastructure Upgrade Cards** (Slab Load `1,630 kg/rack`, `11× 2.5 MVA` MV Transformers & `415V` Busways, `12× 1.5 MW` CDUs @ `~21,400 LPM`, `2.34 MW` Residual Room Air Cooling, `±10.9 MW` `<100ms` Synchronous Training Step-Load BESS Buffer, and PUE OpEx Savings).
2. **Bridge Macro Plan → Current Hall Pilot (`Row What-If`):**
   - Click **`Test Phase-1 Pilot Retrofit on Current Hall →`** to automatically simulate converting legacy air-cooled **`ROW-A`** to direct liquid cooling (`+160 kW`) inside an isolated physics clone.

---

## Act 5: Proactive Maintenance — Catching Strainer Drift & Generating Safe Checklists (`2–3 mins`)

### What to Click & Showcase
1. Click **`Simulate Event` → `CDU Strainer Fouling`**.
2. **`Health` Tab:**
   - **`Zone Calibration & Fouling`:** Shows zone efficiency loss (`%`) and **`Early Drift` / `Service Needed`** learned purely from PDU vs. cooling loop meters.
   - **`30-Minute Safety Lookahead`:** Contrasts **`Standard BMS`** vs. **`Smart Control`** alongside **`Active Hardware Guardrails`**.
3. **`Plan` Tab → `MOP Steps`:**
   - Select **`CDU-1 · Liquid CDU`** and **`Strainer / Filter Service`** to show downstream **Affected Scope**, **15-minute pre-cool setpoints**, numbered isolation steps, and **Stop / Rollback triggers**—ready to **`Copy`**.
   - Click **`Reset`** in the top-right scenario pill.

---

## Act 6: Forensics, Zero-Agent Onboarding & Shift Handover (`2–3 mins`)

### What to Click & Showcase
1. **`Bottom Dock` → `24h Replay`:** Scrub or play (`1x` / `2x` / `4x`) across 24 hours of DuckDB history to time-travel the entire 3D floor, then click **`Exit Replay`**.
2. **`Top Bar` → `Data`:** Show facility-only OT protocols (`BACnet/IP`, `Modbus TCP`, `SNMPv3`, `MQTT Sparkplug B`) and **BYOD CSV/JSON Upload** for instant customer dataset replay.
3. **`Copilot` Tab:** Run a starter prompt and expand **`Ran X facility inspection tools`** to prove every answer comes from deterministic telemetry, DuckDB SQL, and physics tools.
