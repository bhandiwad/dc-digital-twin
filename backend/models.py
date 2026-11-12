"""
Data models and schemas for the High-Density AI Data Center Digital Twin.
Covers:
- Facility Topology (Rows, Racks, CRAC units, Liquid Cooling CDUs, PDUs, UPS, Chiller Plant)
- Real-time Telemetry (IT Load, Rack Power, Inlet/Outlet/Chip Temps, Coolant Flow, PUE, Carbon Intensity)
- AI Layer Outputs (Thermal/Power Forecasts, Anomaly Detection, Cooling/Workload Optimization, What-If Analysis)
"""

from __future__ import annotations
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class CoolingType(str, Enum):
    AIR = "air"
    HYBRID_LIQUID = "hybrid_liquid"  # Direct-to-chip liquid cooling (75%) + Rear door / air (25%)


class WorkloadClass(str, Enum):
    LLM_TRAINING = "llm_training"
    AI_INFERENCE = "ai_inference"
    HPC_SIMULATION = "hpc_simulation"
    CLOUD_STORAGE = "cloud_storage"
    GENERAL_COMPUTE = "general_compute"


class Severity(str, Enum):
    NORMAL = "normal"
    ADVISORY = "advisory"
    WARNING = "warning"
    CRITICAL = "critical"


class Position3D(BaseModel):
    x: float
    y: float
    z: float


class RackSpec(BaseModel):
    rack_id: str
    row_id: str
    slot_index: int
    name: str
    cooling_type: CoolingType
    workload_class: WorkloadClass
    max_power_kw: float = Field(description="Rated maximum power capacity in kW (e.g., 15kW air, 80-100kW AI liquid)")
    gpu_count: int = Field(default=0, description="Number of H100/B200 class GPUs installed")
    pdu_id: str
    cdu_id: Optional[str] = None
    crac_zone_ids: List[str] = Field(default_factory=list)
    position: Position3D


class RackTelemetry(BaseModel):
    rack_id: str
    row_id: str
    name: str
    cooling_type: CoolingType
    workload_class: WorkloadClass
    max_power_kw: float
    gpu_count: int
    pdu_id: str
    cdu_id: Optional[str] = None
    position: Position3D

    # Dynamic telemetry
    it_utilization_pct: float = Field( description="Compute / GPU utilization percentage (0-100)")
    power_kw: float = Field(description="Current instantaneous electrical power draw in kW")
    air_power_kw: float = Field(description="Heat rejected to air aisle in kW")
    liquid_power_kw: float = Field(description="Heat rejected to liquid loop in kW")
    inlet_temp_c: float = Field(description="Cold aisle air inlet temperature (°C)")
    outlet_temp_c: float = Field(description="Hot aisle air exhaust temperature (°C)")
    chip_temp_c: float = Field(description="Average GPU/CPU junction temperature (°C)")
    coolant_supply_temp_c: Optional[float] = Field(default=None, description="Liquid supply temperature (°C)")
    coolant_return_temp_c: Optional[float] = Field(default=None, description="Liquid return temperature (°C)")
    coolant_flow_lpm: Optional[float] = Field(default=None, description="Coolant flow rate in Liters/min")
    airflow_cfm: float = Field(description="Server fan airflow in CFM")
    fan_power_kw: float = Field(description="Server internal fan power in kW")
    thermal_margin_c: float = Field(description="Degrees below throttling threshold (85°C chip / 32°C inlet)")

    # AI scores per rack
    anomaly_score: float = Field(default=0.0, description="Normalized anomaly score (0.0 to 1.0)")
    predicted_inlet_15m_c: float = Field(default=22.0, description="AI 15-min ahead predicted inlet temp (°C)")
    predicted_chip_15m_c: float = Field(default=55.0, description="AI 15-min ahead predicted chip temp (°C)")
    status: Severity = Severity.NORMAL
    active_faults: List[str] = Field(default_factory=list)


class CRACTelemetry(BaseModel):
    crac_id: str
    name: str
    served_rows: List[str]
    position: Position3D
    enabled: bool = True
    supply_air_setpoint_c: float = 18.0
    supply_air_temp_c: float = 18.2
    return_air_temp_c: float = 29.5
    fan_speed_pct: float = 72.0
    airflow_cfm: float = 28000.0
    cooling_capacity_kw: float = 250.0
    thermal_load_kw: float = 165.0
    power_kw: float = 24.5
    cop: float = 4.2
    status: Severity = Severity.NORMAL


class CDUTelemetry(BaseModel):
    cdu_id: str
    name: str
    served_rows: List[str]
    position: Position3D
    enabled: bool = True
    supply_temp_setpoint_c: float = 24.0
    supply_temp_c: float = 24.1
    return_temp_c: float = 36.8
    pump_speed_pct: float = 78.0
    total_flow_lpm: float = 420.0
    pressure_kpa: float = 185.0
    cooling_capacity_kw: float = 850.0
    thermal_load_kw: float = 540.0
    power_kw: float = 14.2
    status: Severity = Severity.NORMAL


class PDUTelemetry(BaseModel):
    pdu_id: str
    name: str
    row_id: str
    ups_id: str
    position: Position3D
    rated_capacity_kw: float = 500.0
    current_load_kw: float = 310.0
    loss_kw: float = 6.2
    voltage_v: float = 415.0
    power_factor: float = 0.97
    load_pct: float = 62.0
    status: Severity = Severity.NORMAL


class UPSTelemetry(BaseModel):
    ups_id: str
    name: str
    rated_capacity_kw: float = 1200.0
    current_load_kw: float = 720.0
    efficiency_pct: float = 96.4
    loss_kw: float = 26.8
    battery_soc_pct: float = 100.0
    status: Severity = Severity.NORMAL


class FacilityMetrics(BaseModel):
    timestamp: float
    sim_step: int
    outdoor_wetbulb_c: float
    outdoor_drybulb_c: float
    total_it_power_kw: float
    total_cooling_power_kw: float
    total_power_loss_kw: float
    total_facility_power_kw: float
    pue: float
    wue_l_per_kwh: float
    carbon_intensity_g_per_kwh: float
    carbon_emissions_kg_per_hr: float
    energy_cost_usd_per_hr: float
    avg_inlet_temp_c: float
    max_inlet_temp_c: float
    max_inlet_rack_id: str
    avg_chip_temp_c: float
    max_chip_temp_c: float
    max_chip_rack_id: str
    liquid_cooling_share_pct: float
    active_alarms_count: int
    health_score: float = Field(description="Overall data hall health score 0-100")


class AnomalyEvent(BaseModel):
    id: str
    timestamp: float
    component_id: str
    component_type: str  # rack, crac, cdu, pdu
    severity: Severity
    category: str  # thermal_runaway, recirculation, cdu_degradation, fan_fault, power_spike
    title: str
    description: str
    anomaly_score: float
    root_cause: str
    recommended_action: str


class ForecastHorizonPoint(BaseModel):
    horizon_min: int  # +1, +5, +10, +15, +30
    predicted_it_power_kw: float
    predicted_facility_power_kw: float
    predicted_pue: float
    predicted_max_inlet_c: float
    predicted_max_chip_c: float
    upper_bound_chip_c: float
    lower_bound_chip_c: float
    hotspot_risk_pct: float


class OptimizationAction(BaseModel):
    target_id: str
    parameter: str
    current_value: float
    recommended_value: float
    unit: str
    rationale: str


class OptimizationRecommendation(BaseModel):
    current_pue: float
    projected_pue: float
    power_saved_kw: float
    annual_cost_savings_usd: float
    annual_carbon_saved_tons: float
    thermal_safety_margin_c: float
    auto_pilot_active: bool
    actions: List[OptimizationAction]


class TopologyEdge(BaseModel):
    source: str
    target: str
    layer: str  # "power" | "air_cooling" | "liquid_cooling"
    capacity_kw: float
    current_flow_kw: float


class TwinStateSnapshot(BaseModel):
    facility: FacilityMetrics
    racks: List[RackTelemetry]
    cracs: List[CRACTelemetry]
    cdus: List[CDUTelemetry]
    pdus: List[PDUTelemetry]
    ups_units: List[UPSTelemetry]
    anomalies: List[AnomalyEvent]
    forecasts: List[ForecastHorizonPoint]
    optimization: OptimizationRecommendation
    history: List[FacilityMetrics]
    active_scenarios: List[str]


class WhatIfRequest(BaseModel):
    name: str = "Custom Scenario"
    target_row: Optional[str] = "ROW-C"
    add_gpu_load_kw: float = 0.0
    convert_air_to_liquid: bool = False
    crac_failure_id: Optional[str] = None
    cdu_pump_degradation_pct: float = 0.0
    chiller_supply_delta_c: float = 0.0
    crac_setpoint_c: Optional[float] = None
    cdu_setpoint_c: Optional[float] = None
    ambient_wetbulb_c: Optional[float] = None
    workload_rebalance: bool = False


class WhatIfComparisonMetric(BaseModel):
    metric: str
    unit: str
    baseline: float
    projected: float
    delta: float
    delta_pct: float
    better_when: str  # "lower" | "higher"


class WhatIfResponse(BaseModel):
    scenario_name: str
    summary: str
    risk_level: Severity
    metrics_comparison: List[WhatIfComparisonMetric]
    affected_racks: List[Dict[str, Any]]
    ai_recommendations: List[str]
    baseline_pue: float
    projected_pue: float
    annual_dollar_impact_usd: float


class ControlSetpointRequest(BaseModel):
    crac_id: Optional[str] = None
    crac_supply_temp_c: Optional[float] = None
    crac_fan_speed_pct: Optional[float] = None
    crac_enabled: Optional[bool] = None
    cdu_id: Optional[str] = None
    cdu_supply_temp_c: Optional[float] = None
    cdu_pump_speed_pct: Optional[float] = None
    cdu_enabled: Optional[bool] = None
    outdoor_wetbulb_c: Optional[float] = None
    auto_optimize: Optional[bool] = None


class ScenarioTriggerRequest(BaseModel):
    scenario_id: str  # e.g. "normal", "gpu_burst_row_c", "crac_2_fail", "cdu_1_fouling", "heatwave", "hot_aisle_recirc"


class AgentQueryRequest(BaseModel):
    question: str
    auto_execute_tools: bool = True
    llm_provider: Optional[str] = None  # "auto" | "anthropic" | "gemini" | "openai" | "ollama"
    llm_model: Optional[str] = None
    api_key: Optional[str] = None


class LLMProviderConfigRequest(BaseModel):
    provider: str = "anthropic"  # "anthropic" | "gemini" | "openai" | "ollama"
    model: str = "claude-sonnet-4-20250514"
    api_key: Optional[str] = None
    ollama_base_url: str = "http://127.0.0.1:11434"



# --- Upgrade 1: 24-Hour Time-Series Replay & Public Dataset Ingestion (DuckDB / Parquet) ---

class DatasetInfo(BaseModel):
    dataset_id: str
    name: str
    source_citation: str
    description: str
    total_points: int  # e.g. 288 points at 5-minute intervals = 24 hours
    interval_minutes: int = 5
    parquet_path: str
    peak_it_kw: float
    min_pue: float
    max_pue: float
    notable_events: List[Dict[str, Any]] = Field(default_factory=list)


class ReplayTimelinePoint(BaseModel):
    step_index: int
    timestamp_iso: str
    hour_label: str
    dataset_id: str
    event_tag: Optional[str] = None
    outdoor_wetbulb_c: float
    total_it_power_kw: float
    total_cooling_power_kw: float
    total_facility_power_kw: float
    pue: float
    avg_inlet_temp_c: float
    max_inlet_temp_c: float
    max_chip_temp_c: float
    liquid_cooling_share_pct: float
    carbon_intensity_g_per_kwh: float
    predicted_max_chip_15m_c: float
    anomaly_count: int


class ReplaySeekRequest(BaseModel):
    dataset_id: str = "kaggle_green_ai_24h"
    step_index: int = 0
    apply_to_live_twin: bool = True


# --- Upgrade 2: 42U Server-Level Rack Elevation Drill-Down ---

class UChassisType(str, Enum):
    TOR_SWITCH = "tor_switch"
    NVLINK_FABRIC = "nvlink_fabric"
    AI_GPU_NODE = "ai_gpu_node"
    COMPUTE_BLADE = "compute_blade"
    STORAGE_ARRAY = "storage_array"
    LIQUID_MANIFOLD = "liquid_manifold"
    SHELF_PSU = "shelf_psu"


class ServerNodeTelemetry(BaseModel):
    node_id: str
    rack_id: str
    u_start: int
    u_height: int
    name: str
    chassis_type: UChassisType
    cooling_mode: str  # "Direct-to-Chip Cold Plate" | "High-Velocity Air" | "Passive Bus"
    gpu_model: Optional[str] = None
    gpu_count: int = 0
    utilization_pct: float
    power_kw: float
    inlet_temp_c: float
    exhaust_temp_c: float
    cpu_temp_c: float
    gpu_max_temp_c: Optional[float] = None
    gpu_temps_c: List[float] = Field(default_factory=list)
    coolant_flow_lpm: Optional[float] = None
    qd_valve_status: str = "NOMINAL"  # "NOMINAL" | "THROTTLED" | "RESTRICTED"
    fan_rpm: int = 6200
    throttled: bool = False
    fault_injected: bool = False
    status: Severity = Severity.NORMAL


class RackElevationResponse(BaseModel):
    rack: RackTelemetry
    total_u: int = 42
    occupied_u: int
    total_blade_power_kw: float
    max_blade_temp_c: float
    manifold_supply_c: Optional[float] = None
    manifold_return_c: Optional[float] = None
    manifold_pressure_kpa: Optional[float] = None
    nodes: List[ServerNodeTelemetry]


class BladeActionRequest(BaseModel):
    rack_id: str
    node_id: str
    action: str  # "inject_qd_restriction" | "inject_workload_spike" | "cap_power_80" | "clear_fault"


# --- Upgrade 3: True Tool-Calling AI Agent & Executive ROI Report Generator ---

class AgentToolCallTrace(BaseModel):
    step: int
    tool_name: str
    arguments: Dict[str, Any]
    result_summary: str
    duration_ms: float


class AgentCopilotResponse(BaseModel):
    question: str
    answer: str
    timestamp: float
    llm_provider_used: str = "deterministic_fallback"
    llm_model_used: str = "rule-router"
    tool_calls: List[AgentToolCallTrace] = Field(default_factory=list)
    actions_taken: List[str] = Field(default_factory=list)
    follow_up_suggestions: List[str] = Field(default_factory=list)



class ExecutiveROIReport(BaseModel):
    report_id: str
    generated_at_iso: str
    facility_name: str
    baseline_pue: float
    optimized_pue: float
    pue_reduction_pct: float
    baseline_facility_kw: float
    optimized_facility_kw: float
    power_saved_kw: float
    annual_mwh_saved: float
    annual_cost_savings_usd: float
    annual_carbon_saved_tons: float
    annual_water_saved_kl: float
    stranded_capacity_unlocked_kw: float
    additional_ai_gpus_supported: int
    capex_avoided_usd: float
    payback_months: float
    five_year_npv_usd: float
    key_findings: List[str]
    optimization_breakdown: List[Dict[str, Any]]
    markdown_export: str


# --- Upgrade 4: Enterprise BMS / DCIM / GPU Telemetry Connectors & BYOD Ingestion Hub ---

class ConnectorProtocol(str, Enum):
    BACNET_MODBUS = "bacnet_modbus"
    SNMP_MODBUS_EPMS = "snmp_modbus_epms"
    COOLIT_CDU_MODBUS = "coolit_cdu_modbus"
    MQTT_SPARKPLUG = "mqtt_sparkplug_b"
    SNOWFLAKE_HISTORIAN = "osi_pi_historian"


class ConnectorSpec(BaseModel):
    connector_id: str
    name: str
    protocol: ConnectorProtocol
    vendor_examples: str
    target_layer: str  # "Facility BMS / Cooling" | "42U Server Racks" | "AI GPU Fabric" | "Historian / IoT Bus"
    endpoint_url: str
    polling_interval_sec: float = 2.0
    status: str = "CONNECTED_SHADOW"  # "CONNECTED_SHADOW" | "READY" | "ACTIVE_STREAMING"
    points_mapped: int
    last_sync_ms: float
    register_or_metric_map: List[Dict[str, str]]
    sample_payload_preview: str


class ConnectorTestRequest(BaseModel):
    connector_id: str
    endpoint_override: Optional[str] = None
    sync_to_live_twin: bool = True


class ConnectorTestResponse(BaseModel):
    connector_id: str
    reachable: bool
    latency_ms: float
    records_polled: int
    mapped_fields: Dict[str, str]
    raw_frame_sample: Dict[str, Any]
    calibration_summary: str


class BYODColumnMapping(BaseModel):
    source_column: str
    canonical_field: str
    confidence: float
    sample_value: Any
    unit_detected: str


class BYODIngestRequest(BaseModel):
    dataset_name: str = "Customer Facility Telemetry"
    vendor_profile: str = "auto"  # "auto" | "schneider_bms" | "coolit_epms" | "sunbird_dcim"
    csv_content: str
    apply_immediately: bool = True


class BYODIngestResponse(BaseModel):
    dataset_id: str
    dataset_name: str
    rows_ingested: int
    columns_mapped: List[BYODColumnMapping]
    calibrated_baseline_pue: float
    calibrated_peak_it_kw: float
    calibrated_peak_chip_c: float
    anomalies_detected_in_upload: int
    parquet_saved_path: str
    summary: str


# --- Upgrade 5: OpenDT Online Self-Calibration (RLS/Kalman), Constrained MPC & GraphRAG SOP/MOP ---

class ZoneCalibrationMetrics(BaseModel):
    zone_id: str
    zone_name: str
    cooling_loop: str
    samples_processed: int
    uncalibrated_rmse_c: float
    calibrated_rmse_c: float
    mape_pct: float
    learned_r_th_c_per_kw: float
    nominal_r_th_c_per_kw: float
    learned_c_th_kj_per_c: float
    ua_degradation_pct: float
    fouling_status: str  # "HEALTHY" | "EARLY_DRIFT" | "MAINTENANCE_REQUIRED"
    rls_forgetting_factor: float = 0.985
    kalman_gain_norm: float = 0.14


class OpenDTCalibrationReport(BaseModel):
    timestamp: float
    total_telemetry_frames: int
    overall_uncalibrated_rmse_c: float
    overall_calibrated_rmse_c: float
    overall_mape_pct: float
    convergence_pct: float
    zones: List[ZoneCalibrationMetrics]
    predictive_maintenance_alerts: List[str]


class MPCHorizonStep(BaseModel):
    step_min: int  # +0, +5, +10, +15, +20, +25, +30
    predicted_it_load_kw: float
    uncontrolled_inlet_c: float
    mpc_controlled_inlet_c: float
    ashrae_sla_limit_c: float = 27.0
    uncontrolled_return_liquid_c: float
    mpc_controlled_return_liquid_c: float
    liquid_sla_limit_c: float = 40.0
    optimal_crac_setpoint_c: float
    optimal_crac_fan_pct: float
    optimal_cdu_setpoint_c: float
    optimal_cdu_pump_pct: float
    projected_pue: float


class MPCPolicyState(BaseModel):
    controller_status: str
    solver_iterations: int
    solve_time_ms: float
    objective_cost_j: float
    energy_term_weight: float
    sla_barrier_weight: float
    actuator_smoothness_weight: float
    active_safety_barriers: List[str]
    anti_hunting_savings_kw: float
    pre_cooling_lead_time_min: int
    lookahead_trajectory: List[MPCHorizonStep]


class MOPGenerationRequest(BaseModel):
    target_component_id: str = "CDU-1"
    procedure_type: str = "strainer_swap"  # "strainer_swap" | "vfd_replacement" | "chiller_economizer_switchover" | "pdu_breaker_test"
    duration_minutes: int = 20


class MOPStepItem(BaseModel):
    step_number: int
    phase: str  # "PRE-CHECKS & PRE-COOLING" | "ISOLATION & LOTO" | "EXECUTION" | "RESTORATION & VERIFICATION"
    action: str
    verification_metric: str
    rollback_trigger: str


class MOPDocumentResponse(BaseModel):
    mop_id: str
    title: str
    target_component_id: str
    procedure_type: str
    risk_classification: str
    blast_radius_rows: List[str]
    blast_radius_racks: List[str]
    total_affected_kw: float
    sop_references: List[str]
    required_precool_setpoints: Dict[str, str]
    steps: List[MOPStepItem]
    markdown_document: str


# --- Upgrade 6: PUE, Grid Tariff, UPS BESS Peak-Shaving & Thermal Storage Energy Management ---

class TariffPeriodWindow(BaseModel):
    hour_label: str
    tariff_tier: str  # "OFF_PEAK" | "SHOULDER" | "CRITICAL_PEAK"
    price_usd_per_kwh: float
    grid_carbon_g_per_kwh: float
    baseline_grid_draw_kw: float
    optimized_grid_draw_kw: float
    bess_discharge_kw: float  # >0 discharging UPS BESS to shave peak, <0 charging off-peak
    thermal_precool_kw: float  # >0 pre-cooling water loop before peak, <0 coasting during peak
    projected_pue: float


class EnergyGridManagementState(BaseModel):
    timestamp: float
    current_tariff_tier: str
    current_price_usd_per_kwh: float
    utility_transformer_limit_kw: float = 1600.0
    current_grid_import_kw: float
    optimized_grid_import_kw: float
    peak_demand_shaved_kw: float
    bess_mode: str  # "PEAK_SHAVING_DISCHARGE" | "OFF_PEAK_RECHARGE" | "STANDBY_RESERVE"
    ups_a_soc_pct: float
    ups_b_soc_pct: float
    bess_dispatch_kw: float
    thermal_storage_mode: str  # "PRE_COOL_CHARGING" | "THERMAL_COAST_DISCHARGE" | "NOMINAL"
    chilled_water_buffer_soc_pct: float
    demand_response_event_active: bool
    daily_tou_cost_savings_usd: float
    monthly_demand_charge_savings_usd: float
    annual_total_energy_opex_savings_usd: float
    power_breakdown_kw: Dict[str, float]
    schedule_24h: List[TariffPeriodWindow]


class EnergyDispatchRequest(BaseModel):
    bess_peak_shaving_enabled: bool = True
    thermal_precool_enabled: bool = True
    simulate_grid_dr_event: bool = False
    target_grid_cap_kw: float = 1250.0


# --- Multi-MW / 10k-GPU AI Training Cluster Scale-Out Planner ---

class ClusterInfrastructureDelta(BaseModel):
    category: str
    current_site_value: str
    required_cluster_value: str
    upgrade_delta: str
    bottleneck_severity: str  # "info" | "warning" | "critical"
    engineering_note: str


class ClusterScaleRequest(BaseModel):
    gpu_count: int = Field(default=10000, ge=256, le=100000)
    gpu_arch: str = "gb200_nvl72"  # "gb200_nvl72" | "h200_hgx" | "nextgen_ultra"
    cooling_strategy: str = "warm_water_dlc"  # "warm_water_dlc" | "chilled_water_dlc" | "legacy_air"


class ClusterScaleResponse(BaseModel):
    gpu_count: int
    gpu_arch_label: str
    cooling_strategy_label: str
    feasible: bool
    infeasibility_reason: Optional[str] = None
    # Footprint & Halls
    gpus_per_compute_rack: int
    kw_per_compute_rack: float
    compute_racks: int
    network_storage_racks: int
    total_cluster_racks: int
    existing_hall_racks: int
    data_halls_required: int
    rack_weight_kg: int
    slab_upgrade_required: bool
    # Power & Cooling First-Law Split
    current_hall_it_mw: float
    cluster_it_mw: float
    projected_pue: float
    total_utility_mw: float
    liquid_heat_mw: float
    air_residual_mw: float
    total_coolant_flow_lpm: int
    modular_cdus_n1: int
    mv_transformers_n1: int
    # AI Training Synchronous Step-Load Transient
    synchronous_step_swing_mw: float
    bess_transient_buffer_mw: float
    bess_transient_buffer_mwh: float
    thermal_buffer_tank_liters: int
    # Financial / Efficiency Comparison vs Air/Chilled Baseline
    annual_cooling_savings_usd: float
    cooling_power_saved_mw: float
    # Phase-1 Current Hall Pilot Fit
    phase1_max_gpus_in_current_hall: int
    phase1_summary: str
    infrastructure_deltas: List[ClusterInfrastructureDelta]
    architectural_changes: List[str]





