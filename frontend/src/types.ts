export type CoolingType = 'air' | 'hybrid_liquid';
export type WorkloadClass = 'llm_training' | 'ai_inference' | 'hpc_simulation' | 'cloud_storage' | 'general_compute';
export type Severity = 'normal' | 'advisory' | 'warning' | 'critical';
export type OverlayMode = 'inlet_temp' | 'chip_temp' | 'power_kw' | 'anomaly' | 'cooling_type';

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface RackTelemetry {
  rack_id: string;
  row_id: string;
  name: string;
  cooling_type: CoolingType;
  workload_class: WorkloadClass;
  max_power_kw: number;
  gpu_count: number;
  pdu_id: string;
  cdu_id?: string | null;
  position: Position3D;
  it_utilization_pct: number;
  power_kw: number;
  air_power_kw: number;
  liquid_power_kw: number;
  inlet_temp_c: number;
  outlet_temp_c: number;
  chip_temp_c: number;
  coolant_supply_temp_c?: number | null;
  coolant_return_temp_c?: number | null;
  coolant_flow_lpm?: number | null;
  airflow_cfm: number;
  fan_power_kw: number;
  thermal_margin_c: number;
  anomaly_score: number;
  predicted_inlet_15m_c: number;
  predicted_chip_15m_c: number;
  status: Severity;
  active_faults: string[];
}

export interface CRACTelemetry {
  crac_id: string;
  name: string;
  served_rows: string[];
  position: Position3D;
  enabled: boolean;
  supply_air_setpoint_c: number;
  supply_air_temp_c: number;
  return_air_temp_c: number;
  fan_speed_pct: number;
  airflow_cfm: number;
  cooling_capacity_kw: number;
  thermal_load_kw: number;
  power_kw: number;
  cop: number;
  status: Severity;
}

export interface CDUTelemetry {
  cdu_id: string;
  name: string;
  served_rows: string[];
  position: Position3D;
  enabled: boolean;
  supply_temp_setpoint_c: number;
  supply_temp_c: number;
  return_temp_c: number;
  pump_speed_pct: number;
  total_flow_lpm: number;
  pressure_kpa: number;
  cooling_capacity_kw: number;
  thermal_load_kw: number;
  power_kw: number;
  status: Severity;
}

export interface PDUTelemetry {
  pdu_id: string;
  name: string;
  row_id: string;
  ups_id: string;
  position: Position3D;
  rated_capacity_kw: number;
  current_load_kw: number;
  loss_kw: number;
  voltage_v: number;
  power_factor: number;
  load_pct: number;
  status: Severity;
}

export interface UPSTelemetry {
  ups_id: string;
  name: string;
  rated_capacity_kw: number;
  current_load_kw: number;
  efficiency_pct: number;
  loss_kw: number;
  battery_soc_pct: number;
  status: Severity;
}

export interface FacilityMetrics {
  timestamp: number;
  sim_step: number;
  outdoor_wetbulb_c: number;
  outdoor_drybulb_c: number;
  total_it_power_kw: number;
  total_cooling_power_kw: number;
  total_power_loss_kw: number;
  total_facility_power_kw: number;
  pue: number;
  wue_l_per_kwh: number;
  carbon_intensity_g_per_kwh: number;
  carbon_emissions_kg_per_hr: number;
  energy_cost_usd_per_hr: number;
  avg_inlet_temp_c: number;
  max_inlet_temp_c: number;
  max_inlet_rack_id: string;
  avg_chip_temp_c: number;
  max_chip_temp_c: number;
  max_chip_rack_id: string;
  liquid_cooling_share_pct: number;
  active_alarms_count: number;
  health_score: number;
}

export interface AnomalyEvent {
  id: string;
  timestamp: number;
  component_id: string;
  component_type: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  anomaly_score: number;
  root_cause: string;
  recommended_action: string;
}

export interface ForecastHorizonPoint {
  horizon_min: number;
  predicted_it_power_kw: number;
  predicted_facility_power_kw: number;
  predicted_pue: number;
  predicted_max_inlet_c: number;
  predicted_max_chip_c: number;
  upper_bound_chip_c: number;
  lower_bound_chip_c: number;
  hotspot_risk_pct: number;
}

export interface OptimizationAction {
  target_id: string;
  parameter: string;
  current_value: number;
  recommended_value: number;
  unit: string;
  rationale: string;
}

export interface OptimizationRecommendation {
  current_pue: number;
  projected_pue: number;
  power_saved_kw: number;
  annual_cost_savings_usd: number;
  annual_carbon_saved_tons: number;
  thermal_safety_margin_c: number;
  auto_pilot_active: boolean;
  actions: OptimizationAction[];
}

export interface TwinStateSnapshot {
  facility: FacilityMetrics;
  racks: RackTelemetry[];
  cracs: CRACTelemetry[];
  cdus: CDUTelemetry[];
  pdus: PDUTelemetry[];
  ups_units: UPSTelemetry[];
  anomalies: AnomalyEvent[];
  forecasts: ForecastHorizonPoint[];
  optimization: OptimizationRecommendation;
  history: FacilityMetrics[];
  active_scenarios: string[];
}

export interface WhatIfRequest {
  name: string;
  target_row?: string;
  add_gpu_load_kw: number;
  convert_air_to_liquid: boolean;
  crac_failure_id?: string | null;
  cdu_pump_degradation_pct: number;
  chiller_supply_delta_c: number;
  crac_setpoint_c?: number | null;
  cdu_setpoint_c?: number | null;
  ambient_wetbulb_c?: number | null;
  workload_rebalance: boolean;
}

export interface WhatIfComparisonMetric {
  metric: string;
  unit: string;
  baseline: number;
  projected: number;
  delta: number;
  delta_pct: number;
  better_when: string;
}

export interface WhatIfResponse {
  scenario_name: string;
  summary: string;
  risk_level: Severity;
  metrics_comparison: WhatIfComparisonMetric[];
  affected_racks: Array<{
    rack_id: string;
    row_id: string;
    baseline_power_kw: number;
    projected_power_kw: number;
    baseline_inlet_c: number;
    projected_inlet_c: number;
    baseline_chip_c: number;
    projected_chip_c: number;
    delta_chip_c: number;
    status: string;
  }>;
  ai_recommendations: string[];
  baseline_pue: number;
  projected_pue: number;
  annual_dollar_impact_usd: number;
}

// --- Upgrade 1: 24-Hour Time-Series Replay & Public Dataset Ingestion (DuckDB / Parquet) ---

export interface DatasetInfo {
  dataset_id: string;
  name: string;
  source_citation: string;
  description: string;
  total_points: number;
  interval_minutes: number;
  parquet_path: string;
  peak_it_kw: number;
  min_pue: number;
  max_pue: number;
  notable_events: Array<{
    step_index: number;
    time_label: string;
    event_tag: string;
    peak_chip_c: number;
  }>;
}

export interface ReplayTimelinePoint {
  step_index: number;
  timestamp_iso: string;
  hour_label: string;
  dataset_id: string;
  event_tag?: string | null;
  outdoor_wetbulb_c: number;
  total_it_power_kw: number;
  total_cooling_power_kw: number;
  total_facility_power_kw: number;
  pue: number;
  avg_inlet_temp_c: number;
  max_inlet_temp_c: number;
  max_chip_temp_c: number;
  liquid_cooling_share_pct: number;
  carbon_intensity_g_per_kwh: number;
  predicted_max_chip_15m_c: number;
  anomaly_count: number;
}

// --- Upgrade 2: 42U Server-Level Rack Elevation Drill-Down ---

export type UChassisType =
  | 'tor_switch'
  | 'nvlink_fabric'
  | 'ai_gpu_node'
  | 'compute_blade'
  | 'storage_array'
  | 'liquid_manifold'
  | 'shelf_psu';

export interface ServerNodeTelemetry {
  node_id: string;
  rack_id: string;
  u_start: number;
  u_height: number;
  name: string;
  chassis_type: UChassisType;
  cooling_mode: string;
  gpu_model?: string | null;
  gpu_count: number;
  utilization_pct: number;
  power_kw: number;
  inlet_temp_c: number;
  exhaust_temp_c: number;
  cpu_temp_c: number;
  gpu_max_temp_c?: number | null;
  gpu_temps_c: number[];
  coolant_flow_lpm?: number | null;
  qd_valve_status: string;
  fan_rpm: number;
  throttled: boolean;
  fault_injected: boolean;
  status: Severity;
}

export interface RackElevationResponse {
  rack: RackTelemetry;
  total_u: number;
  occupied_u: number;
  total_blade_power_kw: number;
  max_blade_temp_c: number;
  manifold_supply_c?: number | null;
  manifold_return_c?: number | null;
  manifold_pressure_kpa?: number | null;
  nodes: ServerNodeTelemetry[];
}

// --- Upgrade 3: True Tool-Calling AI Agent & Executive ROI Report Generator ---

export interface AgentToolCallTrace {
  step: number;
  tool_name: string;
  arguments: Record<string, unknown>;
  result_summary: string;
  duration_ms: number;
}

export interface AgentCopilotResponse {
  question: string;
  answer: string;
  timestamp: number;
  llm_provider_used?: string;
  llm_model_used?: string;
  tool_calls: AgentToolCallTrace[];
  actions_taken: string[];
  follow_up_suggestions: string[];
}

export interface ExecutiveROIReport {
  report_id: string;
  generated_at_iso: string;
  facility_name: string;
  baseline_pue: number;
  optimized_pue: number;
  pue_reduction_pct: number;
  baseline_facility_kw: number;
  optimized_facility_kw: number;
  power_saved_kw: number;
  annual_mwh_saved: number;
  annual_cost_savings_usd: number;
  annual_carbon_saved_tons: number;
  annual_water_saved_kl: number;
  stranded_capacity_unlocked_kw: number;
  additional_ai_gpus_supported: number;
  capex_avoided_usd: number;
  payback_months: number;
  five_year_npv_usd: number;
  key_findings: string[];
  optimization_breakdown: Array<{
    lever: string;
    kw_saved: number;
    annual_usd: number;
    mechanism: string;
  }>;
  markdown_export: string;
}

// --- Upgrade 4: Enterprise BMS / DCIM / GPU Telemetry Connectors & BYOD Ingestion Hub ---

export interface ConnectorSpec {
  connector_id: string;
  name: string;
  protocol: string;
  vendor_examples: string;
  target_layer: string;
  endpoint_url: string;
  polling_interval_sec: number;
  status: string;
  points_mapped: number;
  last_sync_ms: number;
  register_or_metric_map: Array<{
    source: string;
    target: string;
    unit: string;
  }>;
  sample_payload_preview: string;
}

export interface ConnectorTestResponse {
  connector_id: string;
  reachable: boolean;
  latency_ms: number;
  records_polled: number;
  mapped_fields: Record<string, string>;
  raw_frame_sample: Record<string, unknown>;
  calibration_summary: string;
}

export interface BYODColumnMapping {
  source_column: string;
  canonical_field: string;
  confidence: number;
  sample_value: unknown;
  unit_detected: string;
}

export interface BYODIngestResponse {
  dataset_id: string;
  dataset_name: string;
  rows_ingested: number;
  columns_mapped: BYODColumnMapping[];
  calibrated_baseline_pue: number;
  calibrated_peak_it_kw: number;
  calibrated_peak_chip_c: number;
  anomalies_detected_in_upload: number;
  parquet_saved_path: string;
  summary: string;
}

// --- Upgrade 5: OpenDT Online Self-Calibration, Constrained MPC & GraphRAG SOP/MOP ---

export interface ZoneCalibrationMetrics {
  zone_id: string;
  zone_name: string;
  cooling_loop: string;
  samples_processed: number;
  uncalibrated_rmse_c: number;
  calibrated_rmse_c: number;
  mape_pct: number;
  learned_r_th_c_per_kw: number;
  nominal_r_th_c_per_kw: number;
  learned_c_th_kj_per_c: number;
  ua_degradation_pct: number;
  fouling_status: string;
  rls_forgetting_factor: number;
  kalman_gain_norm: number;
}

export interface OpenDTCalibrationReport {
  timestamp: number;
  total_telemetry_frames: number;
  overall_uncalibrated_rmse_c: number;
  overall_calibrated_rmse_c: number;
  overall_mape_pct: number;
  convergence_pct: number;
  zones: ZoneCalibrationMetrics[];
  predictive_maintenance_alerts: string[];
}

export interface MPCHorizonStep {
  step_min: number;
  predicted_it_load_kw: number;
  uncontrolled_inlet_c: number;
  mpc_controlled_inlet_c: number;
  ashrae_sla_limit_c: number;
  uncontrolled_return_liquid_c: number;
  mpc_controlled_return_liquid_c: number;
  liquid_sla_limit_c: number;
  optimal_crac_setpoint_c: number;
  optimal_crac_fan_pct: number;
  optimal_cdu_setpoint_c: number;
  optimal_cdu_pump_pct: number;
  projected_pue: number;
}

export interface MPCPolicyState {
  controller_status: string;
  solver_iterations: number;
  solve_time_ms: number;
  objective_cost_j: number;
  energy_term_weight: number;
  sla_barrier_weight: number;
  actuator_smoothness_weight: number;
  active_safety_barriers: string[];
  anti_hunting_savings_kw: number;
  pre_cooling_lead_time_min: number;
  lookahead_trajectory: MPCHorizonStep[];
}

export interface MOPStepItem {
  step_number: number;
  phase: string;
  action: string;
  verification_metric: string;
  rollback_trigger: string;
}

export interface MOPDocumentResponse {
  mop_id: string;
  title: string;
  target_component_id: string;
  procedure_type: string;
  risk_classification: string;
  blast_radius_rows: string[];
  blast_radius_racks: string[];
  total_affected_kw: number;
  sop_references: string[];
  required_precool_setpoints: Record<string, string>;
  steps: MOPStepItem[];
  markdown_document: string;
}

// --- Upgrade 6: PUE, Grid Tariff, UPS BESS Peak-Shaving & Thermal Storage Energy Management ---

export interface TariffPeriodWindow {
  hour_label: string;
  tariff_tier: string;
  price_usd_per_kwh: number;
  grid_carbon_g_per_kwh: number;
  baseline_grid_draw_kw: number;
  optimized_grid_draw_kw: number;
  bess_discharge_kw: number;
  thermal_precool_kw: number;
  projected_pue: number;
}

export interface EnergyGridManagementState {
  timestamp: number;
  current_tariff_tier: string;
  current_price_usd_per_kwh: number;
  utility_transformer_limit_kw: number;
  current_grid_import_kw: number;
  optimized_grid_import_kw: number;
  peak_demand_shaved_kw: number;
  bess_mode: string;
  ups_a_soc_pct: number;
  ups_b_soc_pct: number;
  bess_dispatch_kw: number;
  thermal_storage_mode: string;
  chilled_water_buffer_soc_pct: number;
  demand_response_event_active: boolean;
  daily_tou_cost_savings_usd: number;
  monthly_demand_charge_savings_usd: number;
  annual_total_energy_opex_savings_usd: number;
  power_breakdown_kw: Record<string, number>;
  schedule_24h: TariffPeriodWindow[];
}

export interface ClusterInfrastructureDelta {
  category: string;
  current_site_value: string;
  required_cluster_value: string;
  upgrade_delta: string;
  bottleneck_severity: 'info' | 'warning' | 'critical';
  engineering_note: string;
}

export interface ClusterScaleRequest {
  gpu_count: number;
  gpu_arch: 'gb200_nvl72' | 'h200_hgx' | 'nextgen_ultra';
  cooling_strategy: 'warm_water_dlc' | 'chilled_water_dlc' | 'legacy_air';
}

export interface ClusterScaleResponse {
  gpu_count: number;
  gpu_arch_label: string;
  cooling_strategy_label: string;
  feasible: boolean;
  infeasibility_reason?: string | null;
  gpus_per_compute_rack: number;
  kw_per_compute_rack: number;
  compute_racks: number;
  network_storage_racks: number;
  total_cluster_racks: number;
  existing_hall_racks: number;
  data_halls_required: number;
  rack_weight_kg: number;
  slab_upgrade_required: boolean;
  current_hall_it_mw: number;
  cluster_it_mw: number;
  projected_pue: number;
  total_utility_mw: number;
  liquid_heat_mw: number;
  air_residual_mw: number;
  total_coolant_flow_lpm: number;
  modular_cdus_n1: number;
  mv_transformers_n1: number;
  synchronous_step_swing_mw: number;
  bess_transient_buffer_mw: number;
  bess_transient_buffer_mwh: number;
  thermal_buffer_tank_liters: number;
  annual_cooling_savings_usd: number;
  cooling_power_saved_mw: number;
  phase1_max_gpus_in_current_hall: number;
  phase1_summary: string;
  infrastructure_deltas: ClusterInfrastructureDelta[];
  architectural_changes: string[];
}




