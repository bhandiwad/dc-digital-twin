# Contributing to Pandita's Aether-DCTWIN

Welcome to the engineering team! Whether your background is distributed systems, backend Python, React/Three.js, or ML—start with these two 5-minute reads before writing code:
1. **[Data Center Critical Facilities for Software Engineers](file:///Users/pb/dctwin/docs/DOMAIN_PRIMER_FOR_SWES.md)** — Translates PUE, CRACs, CDUs, Wet-Bulb, Dew Point, 3-Phase PDUs, and BACnet Priority Arrays into software engineering concepts.
2. **[Modular Architecture Guide](file:///Users/pb/dctwin/docs/ARCHITECTURE.md)** — Shows where physics primitives, services, adapters, YAML configs, and auto-mounted feature plugins live.

---

## 1. Local Development Setup

### Prerequisites
- **Python 3.11+** (virtualenv `.venv`)
- **Node.js 20+ / 22+** (`npm`)

### Install & Run Tests
```bash
# 1. Create virtualenv & install backend dependencies
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt

# 2. Run the full physics, multi-topology, demarcation & API test suite (runs in <2s)
PYTHONPATH=backend .venv/bin/pytest tests -v

# 3. Install frontend packages & run strict TypeScript check
cd frontend
npm install
npx tsc --noEmit
```

### Run Hot-Reload Dev Servers
```bash
# Terminal 1 — FastAPI Backend (Port 8000)
PYTHONPATH=backend .venv/bin/uvicorn main:app --reload --port 8000

# Terminal 2 — Vite React + Three.js Dev Server (Port 5173, proxies /api & /ws to 8000)
cd frontend && npm run dev
```

### Test Against Different Customer Data Hall Topologies
Never assume a facility has 32 racks or IDs like `"ROW-C"` or `"CDU-1"`. Always verify your feature against our 16-rack compact edge hall as well:
```bash
DCTWIN_SITE_CONFIG=configs/sites/compact_edge_16rack.yaml PYTHONPATH=backend .venv/bin/uvicorn main:app --reload --port 8000
```

---

## 2. How to Ship a Feature Spec PR (`PRD-01` .. `PRD-10`) Without Merge Conflicts

We have 10 feature specifications under `docs/requirements/`. Because multiple engineers work concurrently, **avoid editing `backend/main.py` or `frontend/src/App.tsx`** unless modifying shared core chrome. Follow this 4-step pattern:

1. **Reuse or Extend Pure Physics (`backend/domain/`)**:
   - Put pure equations in `backend/domain/` with explicit unit suffixes (`_c`, `_kw`, `_lpm`, `_kpa`, `_pct`).
   - Add unit & physical invariant tests in `tests/test_domain_physics.py`.
2. **Add Service Logic (`backend/services/<feature_slug>.py`)**:
   - Query `engine.racks`, `engine.cracs`, `engine.cdus`, `engine.pdus`, and `engine.graph` dynamically—never hardcode row or unit names.
   - Read site thresholds and tariffs from `engine.site_config`.
3. **Expose Auto-Mounted FastAPI Endpoints (`backend/api/features/<feature_slug>.py`)**:
   - Export `router = APIRouter(prefix="/api/...", tags=["..."])` and import `from api.deps import runtime`.
   - `backend/api/plugin_loader.py` mounts your router automatically at startup—zero edits to `main.py`!
4. **Add a Self-Registering Workbench UI Tab (`frontend/src/components/workbench/features/<FeatureName>Panel.tsx`)**:
   - Export `export const plugin: FeatureWorkbenchPlugin = { id: '...', label: '...', Component: ... }`.
   - `featureTabs.ts` discovers and renders your tab automatically—zero edits to `App.tsx`!

---

## 3. Non-Negotiable PR Checklist (Verified Automatically by GitHub Actions CI)

- [ ] **Critical Facilities Demarcation**: Zero server OS agents, `NVIDIA DCGM`, `Redfish`, `IPMI`, `SSH`, GPU clock throttling, or Slurm/Kubernetes job-scheduling logic (`tests/test_demarcation_boundary.py` will fail CI if violated).
- [ ] **Topology Agnostic**: Feature works cleanly on both `default_hall.yaml` (32 racks) and `compact_edge_16rack.yaml` (16 racks) in `tests/test_multi_site_topologies.py`.
- [ ] **Explicit Unit Suffixes**: Every numeric schema field ends with `_c`, `_kw`, `_lpm`, `_cfm`, `_kpa`, `_v`, `_amps`, or `_pct`.
- [ ] **All Checks Green**: `PYTHONPATH=backend pytest tests -v`, `npx tsc --noEmit`, and `npm run build` pass with zero errors.
