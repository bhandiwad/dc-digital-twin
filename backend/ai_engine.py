"""
Thin Facade for Facility AI, Control & Analytics Services (`DataCenterAIService`).

Delegates every domain responsibility to isolated, single-responsibility modules under
`backend/services/` so multiple engineers can work concurrently without merge conflicts:
- `services/forecaster_anomaly.py`: IsolationForest + physics residual detector & state-space forecaster
- `services/optimizer_whatif.py`: Topology-generic setpoint optimizer & counterfactual sandbox
- `services/calibration_rls.py`: Stateful Recursive Least Squares (RLS) zone system identification
- `services/mpc_solver.py`: Real `scipy.optimize` SLSQP Constrained MPC trajectory solver
- `services/mop_graphrag.py`: NetworkX blast-radius & ASHRAE/NFPA Method of Procedure generator
- `services/energy_roi.py`: Config-driven Utility TOU, UPS BESS peak-shaving & Executive ROI
- `services/copilot_service.py`: OpenRouter/OpenAI tool-calling agent & offline tool router
"""

from __future__ import annotations
from typing import Any, List, Tuple

from models import (
    AgentCopilotResponse,
    AnomalyEvent,
    EnergyDispatchRequest,
    EnergyGridManagementState,
    ExecutiveROIReport,
    ForecastHorizonPoint,
    MOPDocumentResponse,
    MOPGenerationRequest,
    MPCPolicyState,
    OpenDTCalibrationReport,
    OptimizationRecommendation,
    WhatIfRequest,
    WhatIfResponse,
)
from services import (
    ConstrainedMPCService,
    CopilotAgentService,
    EnergyROIService,
    ForecasterAnomalyService,
    GraphRAGMOPService,
    OpenDTCalibrationService,
    OptimizerWhatIfService,
)
from simulator import DataHallTwinEngine


class DataCenterAIService:
    def __init__(self) -> None:
        self.forecaster = ForecasterAnomalyService()
        self.optimizer = OptimizerWhatIfService()
        self.calibrator = OpenDTCalibrationService()
        self.mpc = ConstrainedMPCService()
        self.mop = GraphRAGMOPService()
        self.energy = EnergyROIService()
        self.copilot = CopilotAgentService()
        self.llm_config = self.copilot.llm_config

    def update_forecasts_and_anomalies(
        self, engine: DataHallTwinEngine
    ) -> Tuple[List[ForecastHorizonPoint], List[AnomalyEvent]]:
        return self.forecaster.update_forecasts_and_anomalies(engine)

    def compute_optimization(self, engine: DataHallTwinEngine) -> OptimizationRecommendation:
        return self.optimizer.compute_optimization(engine)

    def run_whatif_simulation(self, engine: DataHallTwinEngine, req: WhatIfRequest) -> WhatIfResponse:
        return self.optimizer.run_whatif_simulation(engine, req)

    def compute_opendt_calibration(self, engine: DataHallTwinEngine) -> OpenDTCalibrationReport:
        return self.calibrator.compute_calibration(engine)

    def compute_mpc_policy(self, engine: DataHallTwinEngine) -> MPCPolicyState:
        opt = self.compute_optimization(engine)
        return self.mpc.solve_policy(engine, projected_opt_pue=opt.projected_pue, power_saved_kw=opt.power_saved_kw)

    def generate_graphrag_mop(self, engine: DataHallTwinEngine, req: MOPGenerationRequest) -> MOPDocumentResponse:
        return self.mop.generate_mop(engine, req)

    def compute_energy_grid_management(self, engine: DataHallTwinEngine) -> EnergyGridManagementState:
        opt = self.compute_optimization(engine)
        return self.energy.compute_grid_state(engine, opt)

    def update_energy_dispatch(
        self, engine: DataHallTwinEngine, req: EnergyDispatchRequest
    ) -> EnergyGridManagementState:
        opt = self.compute_optimization(engine)
        return self.energy.update_dispatch(engine, req, opt)

    def generate_executive_roi_report(
        self, engine: DataHallTwinEngine, telemetry_store: Any = None
    ) -> ExecutiveROIReport:
        opt = self.compute_optimization(engine)
        return self.energy.generate_roi_report(engine, opt)

    def answer_copilot_query(
        self,
        engine: DataHallTwinEngine,
        question: str,
        auto_execute_tools: bool = True,
        telemetry_store: Any = None,
        llm_provider: str | None = None,
        llm_model: str | None = None,
        api_key: str | None = None,
    ) -> AgentCopilotResponse:
        return self.copilot.answer_query(
            ai_facade=self,
            engine=engine,
            question=question,
            auto_execute_tools=auto_execute_tools,
            telemetry_store=telemetry_store,
            llm_provider=llm_provider,
            llm_model=llm_model,
            api_key=api_key,
        )
