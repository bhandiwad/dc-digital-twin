# Data Center Critical Facilities for Software Engineers
**The Non-Domain Engineer's Rosetta Stone for Pandita's Aether-DCTWIN**

Welcome! You do **not** need a degree in mechanical or electrical engineering to ship production features in **Pandita's Aether-DCTWIN**. Every thermodynamic, psychrometric, hydraulic, and 3-phase AC equation is already encapsulated and unit-tested inside `backend/domain/`.

This guide translates Data Center Critical Facilities concepts directly into software systems mental models so you can build APIs, UI workflows, DuckDB analytics, and control loops with total confidence.

---

## 1. The Golden Rule: The "Church & State" Demarcation Boundary

In every enterprise and colocation data center (Equinix, Digital Realty, NTT, CyrusOne, hyperscale), there are two completely separate organizations:
1. **Critical Facilities Ops (Our Customer)**: Owns the building power chain (`Utility -> Transformer -> UPS -> 415V Row PDU -> Rack Whip`) and cooling plant (`Chiller -> Cooling Tower -> CRAC Air Units -> Liquid CDUs -> Cold-Aisle / Manifold Sensors`).
2. **Tenant IT / Compute Ops (NOT Our Scope)**: Owns what runs inside the 42U servers (Linux OS, GPUs, Kubernetes, Slurm, workloads).

### Strict Engineering Guardrail (Enforced by `tests/test_demarcation_boundary.py`)
- **WE NEVER** install agents on servers, scrape `NVIDIA DCGM` / `Redfish` / `IPMI`, SSH into hosts, throttle GPU clocks, or migrate batch jobs.
- **WE ONLY** read and actuate **Critical Facilities infrastructure** via industrial protocols (`BACnet/IP`, `Modbus TCP`, `SNMPv3 EPMS`, `MQTT Sparkplug B`, `AVEVA PI` CSV/Parquet historians):
  - How do we know a rack is drawing `72 kW`? From the **Row PDU branch circuit breaker meter** (`SNMPv3 / Modbus EPMS`), *not* from the OS.
  - How do we know a liquid-cooled AI row is running hot? From the **CDU secondary manifold return temperature (`°C`), flow rate (`LPM`), and differential pressure (`ΔP kPa`)**, *not* from `nvidia-smi`.

---

## 2. Software Engineer's Glossary (Systems Analogy Table)

| Facility Term | What It Actually Is | Distributed Systems Analogy | Where It Lives in Code |
| :--- | :--- | :--- | :--- |
| **PUE** (*Power Usage Effectiveness*) | `Total Building Power kW / IT Rack Power kW`. Ideal = `1.00` (impossible in practice); modern AI halls = `1.12–1.35`. | **Protocol Framing Overhead** (`Total Wire Bytes / Payload Bytes`). | `domain/electrical.py` -> `calc_pue()` |
| **CRAC / CRAH** (*Computer Room Air Conditioner / Handler*) | Big perimeter air-handling cabinet with Variable Frequency Drive (`VFD`) fans blowing cold air (`16–22°C`) under/into the Cold Aisle. | **Stateless Load-Balanced Worker Pool** serving an aisle zone. | `CRACTelemetry` (`models.py`), `simulator.py` |
| **CDU** (*Coolant Distribution Unit*) | Heat-exchanger + VFD pump cabinet that circulates warm water/glycol (`20–27°C`) through pipes directly onto GPU cold-plates (`65–100 kW/rack`). | **Dedicated High-Throughput RDMA Channel** bypassing slow air cooling. | `CDUTelemetry` (`models.py`), `simulator.py` |
| **Row PDU & Whip** (*Power Distribution Unit*) | 415V 3-phase (`L1, L2, L3`) electrical panel at the end of a rack row feeding individual rack power cords ("whips"). | **Top-of-Rack Switch Uplinks**—if one phase (`L1`) hits 80% breaker rating while `L2/L3` sit at 50%, capacity is "stranded." | `domain/electrical.py` -> `calc_3phase_currents_and_imbalance()` |
| **UPS** (*Uninterruptible Power Supply*) | Inline AC/DC/AC power conditioner + Li-Ion battery bank (`BESS`) bridging utility blips until diesel generators spin up. | **Write-Ahead Durable Buffer + Rate Limiter** for utility grid peaks. | `UPSTelemetry`, `services/energy_roi.py` |
| **ASHRAE A1 / W2** | Industry-standard safe operating temperature envelopes: **A1 Cold-Aisle Air = `18–27°C`**; **W2 Liquid Supply = up to `27°C`**. | **Hard Latency SLOs** (`p99 < 27.0°C`). Breaching `27°C` violates tenant colocation SLAs. | `domain/ashrae.py` |
| **Wet-Bulb Temp (`°C`)** | Lowest temperature outdoor air can reach via evaporative cooling (depends on both heat + humidity). Governs Cooling Tower & Chiller efficiency (`COP`). | **Upstream Network RTT Floor**—sets the physical floor on free cooling. | `domain/psychrometrics.py` -> `calc_chiller_cop()`, `calc_waterside_economizer_share()` |
| **Dew Point (`°C`)** | Exact temperature at which water vapor in hall air condenses into liquid droplets on cold metal pipes. | **Memory OOM Cliff**—if `CDU_Supply_Temp <= Hall_Dew_Point`, pipes "sweat" water onto electronics! Keep `>= +2.0°C` margin. | `domain/psychrometrics.py` -> `calc_dewpoint_magnus_c()` |
| **BACnet Priority Array (`1..16`)** | Standard 16-slot hardware command table inside every BMS controller. Lowest slot number with a non-`NULL` value wins (`1` = Life Safety, `8` = Supervisory/AI, `16` = Local Fallback PID). | **CSS Specificity / Config Override Hierarchy** with instant atomic rollback (`write NULL to slot 8` -> hardware immediately reverts to slot 16!). | `adapters/telemetry_adapter.py` -> `SimulatedTwinAdapter` |

---

## 3. The 5 Core Physics Laws (Already Built in `backend/domain/`)

Whenever a PRD asks you to compute power, airflow, temperatures, dew point, or breaker headroom, **do not invent ad-hoc formulas**. Import the pure functions in `backend/domain/`:

1. **VFD Pump & Fan Cubic Affinity Law** (`calc_vfd_affinity_power_kw`):
   - Fan/pump motor power scales with the **cube** of speed: $\text{Power} \propto (\text{Speed})^{3}$.
   - Dropping a CRAC fan from `100%` to `80%` speed cuts fan electricity by **`49%`** ($0.8^3 = 0.512$)! That is why AI cooling optimization saves so much money.
2. **First-Law Sensible Heat Balance** (`calc_liquid_loop_delta_t_c`, `calc_air_loop_delta_t_c`):
   - $Q_{\text{kW}} = \dot{m} \cdot c_p \cdot (T_{\text{return}} - T_{\text{supply}})$.
   - At fixed rack heat $Q$, slowing flow $\dot{m}$ raises $\Delta T$; if $\Delta T$ spikes *without* a flow drop or power spike, a strainer or heat exchanger is fouling!
3. **Thermal Ride-Through Capacitance** (`calc_thermal_runway_seconds`):
   - $t_{\text{breach}} = \frac{C_{\text{th}} \cdot (T_{\text{SLA}} - T_{\text{now}})}{Q_{\text{uncooled}}}$.
   - Tells an operator how many **seconds** (`e.g., 95s vs. 420s`) a zone has before breaching `27.0°C` if a CRAC/CDU trips right now (`N-1` failure).
4. **Magnus-Tetens Dew Point & Condensation Guard** (`calc_dewpoint_magnus_c`, `calc_condensation_margin_c`):
   - Computes exact hall dew point from Dry-Bulb `°C` and Relative Humidity `%`. Physical invariant: `dewpoint_c <= drybulb_c` always.
5. **3-Phase `120°` Phasor Neutral Current & NEC 80% Breaker Headroom** (`calc_3phase_currents_and_imbalance`):
   - Balanced 3-phase currents cancel out on the neutral wire (`0.0 A`). Unbalanced single-phase loads create neutral current and strand kW capacity on the highest-loaded phase (`L1`, `L2`, or `L3`).

---

## 4. Unit Suffix Naming Convention (Zero Unit Bugs)

Every field in Pydantic (`backend/models.py`), YAML (`configs/sites/*.yaml`), and TypeScript (`frontend/src/types.ts`) **must** end with its explicit physical unit suffix:

- Temperature: `_c` (Celsius, never Fahrenheit in internal math)
- Power: `_kw` (Kilowatts, `1 MW = 1000 kW`)
- Thermal Capacitance / Energy: `_kj_per_c`, `_kwh`, `_mwh`
- Liquid Flow: `_lpm` (Liters Per Minute)
- Airflow: `_cfm` (Cubic Feet Per Minute)
- Pressure: `_kpa` (Kilopascals)
- Electrical: `_v` (Volts line-to-line), `_amps` (RMS Amperes)
- Ratios / Percentages: `_pct` (`0–100`), except `pue` and `cop` which are standard dimensionless ratios (`>= 1.0`).
