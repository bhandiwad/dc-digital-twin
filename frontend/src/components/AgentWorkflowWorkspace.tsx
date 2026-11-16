import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Terminal,
  XCircle,
} from 'lucide-react';
import {
  AgentWorkflowId,
  AgentWorkflowResult,
  AgentWorkflowRunRequest,
  TwinStateSnapshot,
} from '../types';
import { runAgenticWorkflow } from '../api/client';
import { USE_CASE_CATALOG } from './UseCaseLaunchpad';

interface WorkflowPreset {
  id: string;
  label: string;
  sublabel: string;
  patch: Partial<AgentWorkflowRunRequest>;
}

const WORKFLOW_PRESETS: Record<AgentWorkflowId, WorkflowPreset[]> = {
  redteam_change: [
    {
      id: 'cdu1_peak_heatwave',
      label: 'CHG-4082 · CDU-1 Strainer Swap @ 15:00 (28.5°C WB)',
      sublabel: 'Peak afternoon heatwave — catches hidden SLA risk',
      patch: {
        target_component_id: 'CDU-1',
        window_hour_local: 15,
        forecast_wetbulb_c: 28.5,
        duration_minutes: 45,
      },
    },
    {
      id: 'crac2_afternoon',
      label: 'CHG-4091 · CRAC-2 VFD Service @ 13:00 (24.5°C WB)',
      sublabel: 'Conditional approval — requires T-20m pre-cooling',
      patch: {
        target_component_id: 'CRAC-2',
        window_hour_local: 13,
        forecast_wetbulb_c: 24.5,
        duration_minutes: 40,
      },
    },
    {
      id: 'pdua_night_safe',
      label: 'CHG-4104 · PDU-A Thermography @ 03:00 (18.0°C WB)',
      sublabel: 'Cool off-peak maintenance window — passes N+1 checks',
      patch: {
        target_component_id: 'PDU-A',
        window_hour_local: 3,
        forecast_wetbulb_c: 18.0,
        duration_minutes: 30,
      },
    },
  ],
  incident_commander: [
    {
      id: 'inc_crac2',
      label: 'INC-901 · CRAC-2 Blower Overcurrent Trip (0 CFM)',
      sublabel: 'Perimeter air unit failure & Row B thermal spillover',
      patch: { incident_scenario_id: 'crac_2_fail' },
    },
    {
      id: 'inc_cdu1',
      label: 'INC-904 · CDU-1 Duplex Strainer Restriction (-42% Flow)',
      sublabel: 'High-density liquid AI Row C differential pressure spike',
      patch: { incident_scenario_id: 'cdu_1_fouling' },
    },
    {
      id: 'inc_recirc',
      label: 'INC-909 · Hot-Aisle Containment Damper Bypass Leak',
      sublabel: 'Localized exhaust recirculation into cold-aisle intake',
      patch: { incident_scenario_id: 'hot_aisle_recirc' },
    },
  ],
  shift_handover: [
    {
      id: 'shift_day_night',
      label: 'Outgoing Day (07:00–19:00) → Incoming Night Shift',
      sublabel: 'Includes afternoon ambient heatwave & peak TOU window',
      patch: { shift_window: 'day_to_night', dataset_id: 'kaggle_green_ai_24h' },
    },
    {
      id: 'shift_liquid_trace',
      label: 'High-Density Liquid AI Trace (12h CDU Fouling Drift)',
      sublabel: 'Scans checkpoint power spikes & secondary loop ΔP creep',
      patch: { shift_window: 'day_to_night', dataset_id: 'ornl_frontier_cdu_24h' },
    },
    {
      id: 'shift_night_day',
      label: 'Outgoing Night (19:00–07:00) → Incoming Day Shift',
      sublabel: 'Overnight waterside economizer & HVAC fault audit',
      patch: { shift_window: 'night_to_day', dataset_id: 'ieee_ashrae_fault_24h' },
    },
  ],
  colo_deal_desk: [
    {
      id: 'rfp_ai_850kw',
      label: 'RFP-214 · AI Cloud Tenant (850 kW · 10 Liquid GPU Racks)',
      sublabel: '85 kW/rack direct-to-chip liquid · PUE ≤ 1.28 SLA cap',
      patch: {
        requested_kw: 850,
        requested_racks: 10,
        cooling_preference: 'liquid_dlc',
        target_pue_cap: 1.28,
      },
    },
    {
      id: 'rfp_ent_180kw',
      label: 'RFP-219 · Enterprise Cage (180 kW · 12 Air Racks)',
      sublabel: '15 kW/rack standard air compute · immediate turn-up',
      patch: {
        requested_kw: 180,
        requested_racks: 12,
        cooling_preference: 'air_only',
        target_pue_cap: 1.32,
      },
    },
    {
      id: 'rfp_air_trap',
      label: 'RFP-225 · 900 kW in 10 Air-Only Racks (90 kW/rack)',
      sublabel: 'Demonstrates physics infeasibility guard (>35 kW/rack air)',
      patch: {
        requested_kw: 900,
        requested_racks: 10,
        cooling_preference: 'air_only',
        target_pue_cap: 1.3,
      },
    },
  ],
  stranded_power: [
    {
      id: 'strand_full_80',
      label: 'Full Hall Audit (All 4 Row PDUs · NEC 80% Rule)',
      sublabel: 'Reclaims L1 phase-trapped kW + p99 ghost reservations',
      patch: { audit_scope: 'full_hall', breaker_limit_pct: 80 },
    },
    {
      id: 'strand_liquid_85',
      label: 'High-Density Liquid Rows C & D (85% Dynamic Breaker)',
      sublabel: 'Targets high-value AI rack rows for GPU expansion',
      patch: { audit_scope: 'liquid_rows', breaker_limit_pct: 85 },
    },
    {
      id: 'strand_air_80',
      label: 'Legacy Air Compute Rows A & B (80% Breaker Rule)',
      sublabel: 'Identifies single-phase whip skew & neutral currents',
      patch: { audit_scope: 'air_rows', breaker_limit_pct: 80 },
    },
  ],
};

export interface AgentWorkflowWorkspaceProps {
  workflowId: AgentWorkflowId;
  snapshot: TwinStateSnapshot;
  onInspectIn3D: (assetId?: string | null, assetType?: 'rack' | 'crac' | 'cdu' | 'pdu' | null) => void;
  onTriggerLiveScenario: (scenarioId: string) => void;
  onEnableAutoPilot: () => void;
}

export const AgentWorkflowWorkspace: React.FC<AgentWorkflowWorkspaceProps> = ({
  workflowId,
  snapshot,
  onInspectIn3D,
  onTriggerLiveScenario,
  onEnableAutoPilot,
}) => {
  const presets = WORKFLOW_PRESETS[workflowId];
  const cardMeta = USE_CASE_CATALOG.find((c) => c.id === workflowId);

  const [activePresetId, setActivePresetId] = useState<string>(presets[0].id);
  const [req, setReq] = useState<AgentWorkflowRunRequest>({
    target_component_id: 'CDU-1',
    window_hour_local: 15,
    forecast_wetbulb_c: 28.5,
    duration_minutes: 45,
    incident_scenario_id: 'crac_2_fail',
    sync_to_live_hall: false,
    shift_window: 'day_to_night',
    dataset_id: 'kaggle_green_ai_24h',
    requested_kw: 850,
    requested_racks: 10,
    cooling_preference: 'liquid_dlc',
    target_pue_cap: 1.28,
    audit_scope: 'full_hall',
    breaker_limit_pct: 80,
    ...presets[0].patch,
  });

  const [result, setResult] = useState<AgentWorkflowResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const executeRun = useCallback(
    async (override?: AgentWorkflowRunRequest) => {
      const payload = override || req;
      setLoading(true);
      try {
        const res = await runAgenticWorkflow(workflowId, payload);
        setResult(res);
      } catch (err) {
        console.error('Agent workflow execution failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [workflowId, req]
  );

  useEffect(() => {
    const first = WORKFLOW_PRESETS[workflowId][0];
    setActivePresetId(first.id);
    const initialReq: AgentWorkflowRunRequest = {
      target_component_id: 'CDU-1',
      window_hour_local: 15,
      forecast_wetbulb_c: 28.5,
      duration_minutes: 45,
      incident_scenario_id: 'crac_2_fail',
      sync_to_live_hall: false,
      shift_window: 'day_to_night',
      dataset_id: 'kaggle_green_ai_24h',
      requested_kw: 850,
      requested_racks: 10,
      cooling_preference: 'liquid_dlc',
      target_pue_cap: 1.28,
      audit_scope: 'full_hall',
      breaker_limit_pct: 80,
      ...first.patch,
    };
    setReq(initialReq);
    runAgenticWorkflow(workflowId, initialReq)
      .then(setResult)
      .catch(console.error);
  }, [workflowId]);

  const handleSelectPreset = (p: WorkflowPreset) => {
    setActivePresetId(p.id);
    const next = { ...req, ...p.patch };
    setReq(next);
    executeRun(next);
  };

  const handleCopyDoc = (secId: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(secId);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const allAssetOptions = [
    ...snapshot.cdus.map((c) => ({ id: c.cdu_id, label: `${c.cdu_id} · Liquid CDU` })),
    ...snapshot.cracs.map((c) => ({ id: c.crac_id, label: `${c.crac_id} · Perimeter CRAC` })),
    ...snapshot.pdus.map((p) => ({ id: p.pdu_id, label: `${p.pdu_id} · Row PDU` })),
  ];

  const verdictStyle = (status?: AgentWorkflowResult['verdict_status']) => {
    switch (status) {
      case 'blocked':
        return {
          banner: 'bg-rose-950/35 border-rose-500/40',
          badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
          icon: XCircle,
          iconColor: 'text-rose-400',
        };
      case 'conditional':
      case 'critical_action':
        return {
          banner: 'bg-amber-950/30 border-amber-500/40',
          badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          icon: AlertTriangle,
          iconColor: 'text-amber-400',
        };
      default:
        return {
          banner: 'bg-emerald-950/30 border-emerald-500/40',
          badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          icon: CheckCircle2,
          iconColor: 'text-emerald-400',
        };
    }
  };

  const vStyle = verdictStyle(result?.verdict_status);
  const VerdictIcon = vStyle.icon;

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-[#090d16] overflow-hidden">
      {/* Left Rail: Scenario Presets, Parameters & 3D Bridge */}
      <aside className="w-full lg:w-[390px] border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-950/60 overflow-y-auto p-5 space-y-5 shrink-0">
        {/* Agent Identity Header */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              {cardMeta?.numberTag} · {cardMeta?.category}
            </span>
          </div>
          <h2 className="text-base font-bold text-white leading-snug">{cardMeta?.title}</h2>
          <p className="text-xs text-slate-400 leading-relaxed">{cardMeta?.description}</p>
        </div>

        {/* 1-Click Demo Scenarios */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Scenario Presets
          </div>
          <div className="space-y-1.5">
            {presets.map((p) => {
              const active = activePresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    active
                      ? 'bg-sky-500/10 border-sky-500/45 text-white'
                      : 'bg-slate-900/50 hover:bg-slate-900 border-slate-800 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-semibold leading-snug">{p.label}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{p.sublabel}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Workflow-Specific Interactive Controls */}
        <div className="bg-slate-900/55 border border-slate-800 rounded-xl p-3.5 space-y-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Agent Input Parameters
          </div>

          {workflowId === 'redteam_change' && (
            <>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Target Equipment (LOTO)</label>
                <select
                  value={req.target_component_id}
                  onChange={(e) => setReq({ ...req, target_component_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  {allAssetOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 tabular-nums">
                  <span className="text-slate-300">Planned Start Hour (Local)</span>
                  <span className="text-sky-400 font-semibold">
                    {String(req.window_hour_local ?? 15).padStart(2, '0')}:00
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={23}
                  step={1}
                  value={req.window_hour_local ?? 15}
                  onChange={(e) => setReq({ ...req, window_hour_local: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 tabular-nums">
                  <span className="text-slate-300">Forecast Outdoor Wet-Bulb</span>
                  <span className="text-amber-400 font-semibold">
                    {(req.forecast_wetbulb_c ?? 28.0).toFixed(1)}°C
                  </span>
                </div>
                <input
                  type="range"
                  min={14}
                  max={31}
                  step={0.5}
                  value={req.forecast_wetbulb_c ?? 28.0}
                  onChange={(e) => setReq({ ...req, forecast_wetbulb_c: Number(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>
            </>
          )}

          {workflowId === 'incident_commander' && (
            <>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Active Fault Event</label>
                <select
                  value={req.incident_scenario_id}
                  onChange={(e) => setReq({ ...req, incident_scenario_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="crac_2_fail">CRAC-2 Blower Trip (Perimeter Air)</option>
                  <option value="cdu_1_fouling">CDU-1 Strainer Fouling (Liquid AI Row)</option>
                  <option value="hot_aisle_recirc">Hot-Aisle Containment Bypass Leak</option>
                </select>
              </div>

              <label className="flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer pt-1">
                <span>Also mirror fault onto live 3D hall</span>
                <input
                  type="checkbox"
                  checked={Boolean(req.sync_to_live_hall)}
                  onChange={(e) => setReq({ ...req, sync_to_live_hall: e.target.checked })}
                  className="accent-sky-400 rounded"
                />
              </label>
            </>
          )}

          {workflowId === 'shift_handover' && (
            <>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Shift Transition</label>
                <select
                  value={req.shift_window}
                  onChange={(e) => setReq({ ...req, shift_window: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="day_to_night">Day (07:00–19:00) → Incoming Night</option>
                  <option value="night_to_day">Night (19:00–07:00) → Incoming Day</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">DuckDB 24h Historian Log</label>
                <select
                  value={req.dataset_id}
                  onChange={(e) => setReq({ ...req, dataset_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="kaggle_green_ai_24h">Diurnal AI + Afternoon Heatwave (24h)</option>
                  <option value="ornl_frontier_cdu_24h">High-Density Liquid CDU Trace (24h)</option>
                  <option value="ieee_ashrae_fault_24h">Perimeter HVAC Fault Trace (24h)</option>
                </select>
              </div>
            </>
          )}

          {workflowId === 'colo_deal_desk' && (
            <>
              <div>
                <div className="flex justify-between text-xs mb-1 tabular-nums">
                  <span className="text-slate-300">Requested IT Power</span>
                  <span className="text-sky-400 font-semibold">{req.requested_kw ?? 850} kW</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={2500}
                  step={50}
                  value={req.requested_kw ?? 850}
                  onChange={(e) => setReq({ ...req, requested_kw: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 tabular-nums">
                  <span className="text-slate-300">Customer Rack Count</span>
                  <span className="text-white font-semibold">
                    {req.requested_racks ?? 10} Racks (
                    {Math.round((req.requested_kw ?? 850) / Math.max(1, req.requested_racks ?? 10))}{' '}
                    kW/rack)
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={32}
                  step={1}
                  value={req.requested_racks ?? 10}
                  onChange={(e) => setReq({ ...req, requested_racks: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-300 block mb-1">Cooling Specification</label>
                <select
                  value={req.cooling_preference}
                  onChange={(e) =>
                    setReq({
                      ...req,
                      cooling_preference: e.target.value as 'liquid_dlc' | 'air_only',
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="liquid_dlc">Direct-to-Chip Liquid + Residual Air</option>
                  <option value="air_only">Perimeter Air-Only (CRAC)</option>
                </select>
              </div>
            </>
          )}

          {workflowId === 'stranded_power' && (
            <>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Row PDU Audit Scope</label>
                <select
                  value={req.audit_scope}
                  onChange={(e) =>
                    setReq({
                      ...req,
                      audit_scope: e.target.value as 'full_hall' | 'air_rows' | 'liquid_rows',
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="full_hall">Full Hall (All Row PDUs &amp; Racks)</option>
                  <option value="liquid_rows">Liquid AI Rows (ROW-C &amp; ROW-D)</option>
                  <option value="air_rows">Air Compute Rows (ROW-A &amp; ROW-B)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 tabular-nums">
                  <span className="text-slate-300">Continuous Breaker Limit</span>
                  <span className="text-sky-400 font-semibold">
                    {req.breaker_limit_pct ?? 80}% Rated
                  </span>
                </div>
                <input
                  type="range"
                  min={75}
                  max={88}
                  step={1}
                  value={req.breaker_limit_pct ?? 80}
                  onChange={(e) => setReq({ ...req, breaker_limit_pct: Number(e.target.value) })}
                  className="w-full accent-sky-400"
                />
              </div>
            </>
          )}

          <button
            type="button"
            onClick={() => executeRun()}
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Multi-Tool Agent...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Agentic Workflow</span>
              </>
            )}
          </button>
        </div>

        {/* Cross-Link Actions to Live 3D Digital Twin */}
        <div className="bg-slate-900/45 border border-slate-800/90 rounded-xl p-3.5 space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Connected Live Digital Twin Actions
          </div>

          <button
            type="button"
            onClick={() => onInspectIn3D(result?.focus_asset_id, result?.focus_asset_type)}
            className="w-full py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700/80 text-xs font-medium text-white flex items-center justify-between transition-colors"
          >
            <span className="flex items-center gap-2">
              <Box className="w-3.5 h-3.5 text-sky-400" />
              <span>
                Inspect {result?.focus_asset_id || 'Hall'} in 3D Digital Twin
              </span>
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {workflowId === 'incident_commander' && (
            <button
              type="button"
              onClick={() => {
                onTriggerLiveScenario(req.incident_scenario_id || 'crac_2_fail');
                onInspectIn3D(result?.focus_asset_id, result?.focus_asset_type);
              }}
              className="w-full py-2 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs font-medium text-amber-300 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Simulate This Fault on 3D Floor</span>
              </span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}

          {!snapshot.optimization.auto_pilot_active && (
            <button
              type="button"
              onClick={onEnableAutoPilot}
              className="w-full py-2 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium text-emerald-300 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  Enable Auto-Pilot (-{snapshot.optimization.power_saved_kw.toFixed(0)} kW)
                </span>
              </span>
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Agent Execution & Decision Canvas */}
      <main className="flex-1 overflow-y-auto p-6">
        {!result ? (
          <div className="h-full flex items-center justify-center text-slate-400 gap-2.5 text-sm">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
            <span>Executing multi-step agent tools...</span>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Verdict Banner */}
            <div className={`rounded-2xl border p-5 space-y-2.5 ${vStyle.banner}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${vStyle.badge}`}
                >
                  <VerdictIcon className={`w-3.5 h-3.5 ${vStyle.iconColor}`} />
                  {result.verdict_badge}
                </span>

                <span className="text-xs text-slate-400 tabular-nums flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-sky-400" />
                  {result.tool_steps.length} deterministic facility tools executed
                </span>
              </div>

              <h1 className="text-xl font-bold text-white">{result.title}</h1>
              <p className="text-sm text-slate-200 leading-relaxed">{result.executive_summary}</p>
            </div>

            {/* 4 Key KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 tabular-nums">
              {result.kpis.map((kpi, idx) => (
                <div
                  key={idx}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1"
                >
                  <div className="text-xs text-slate-400">{kpi.label}</div>
                  <div
                    className={`text-lg font-bold ${
                      kpi.tone === 'good'
                        ? 'text-emerald-400'
                        : kpi.tone === 'bad'
                        ? 'text-rose-400'
                        : kpi.tone === 'warn'
                        ? 'text-amber-400'
                        : 'text-white'
                    }`}
                  >
                    {kpi.value}
                  </div>
                  <div className="text-[11px] text-slate-500">{kpi.subtext}</div>
                </div>
              ))}
            </div>

            {/* Multi-Step Agentic Tool Execution Trace */}
            <div className="bg-slate-900/45 border border-slate-800 rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-semibold text-white">
                    Agentic Reasoning &amp; Tool Execution Pipeline
                  </h3>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  Total:{' '}
                  {result.tool_steps.reduce((acc, s) => acc + s.duration_ms, 0).toFixed(1)} ms
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.tool_steps.map((st) => (
                  <div
                    key={st.step}
                    className="bg-slate-950/75 border border-slate-800/90 rounded-xl p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
                            st.status === 'alert'
                              ? 'bg-rose-500/20 text-rose-300'
                              : st.status === 'warn'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-emerald-500/20 text-emerald-300'
                          }`}
                        >
                          {st.step}
                        </span>
                        <span className="text-xs font-semibold text-white truncate">
                          {st.title}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                        {st.duration_ms}ms
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-sky-400/90">{st.tool_name}()</div>
                    <p className="text-xs text-slate-300 leading-relaxed">{st.summary}</p>

                    {Object.keys(st.metrics).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {Object.entries(st.metrics).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 tabular-nums"
                          >
                            <span className="text-slate-500 mr-1">{k}:</span>
                            <span className="font-medium text-white">{v}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Structured Output Sections (Tables, Checklists, Timelines, Copyable Documents) */}
            {result.sections.map((sec) => (
              <div
                key={sec.id}
                className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 space-y-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{sec.title}</h3>
                    {sec.subtitle && (
                      <p className="text-xs text-slate-400 mt-0.5">{sec.subtitle}</p>
                    )}
                  </div>

                  {sec.kind === 'document' && sec.document_markdown && (
                    <button
                      type="button"
                      onClick={() => handleCopyDoc(sec.id, sec.document_markdown || '')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors"
                    >
                      {copiedId === sec.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy Packet</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {sec.kind === 'table' && (
                  <div className="overflow-x-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left border-collapse text-xs tabular-nums">
                      <thead>
                        <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
                          {sec.columns.map((col, cIdx) => (
                            <th key={cIdx} className="py-2.5 px-3.5 font-medium">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {sec.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-900/80">
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className={`py-2.5 px-3.5 ${
                                  cIdx === 0
                                    ? 'font-semibold text-white'
                                    : cell.includes('BREACH') || cell.includes('BLOCKED')
                                    ? 'text-rose-400 font-semibold'
                                    : cell.includes('SAFE') || cell.startsWith('+')
                                    ? 'text-emerald-400 font-medium'
                                    : 'text-slate-300'
                                }`}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {sec.kind === 'checklist' && (
                  <div className="space-y-2">
                    {sec.checklist.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-slate-950/65 border border-slate-800/90"
                      >
                        <div className="flex items-start gap-2.5">
                          <ClipboardCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                          <div>
                            <div className="text-xs font-semibold text-white">{item.label}</div>
                            <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                              {item.detail}
                            </div>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-700/80 text-sky-300 shrink-0 tabular-nums">
                          {item.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {sec.kind === 'timeline' && (
                  <div className="space-y-2.5">
                    {sec.timeline.map((ev, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3.5 p-3 rounded-xl bg-slate-950/65 border border-slate-800/80"
                      >
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-sky-300 shrink-0">
                          <Clock className="w-3 h-3" />
                          {ev.time_label}
                        </span>
                        <div>
                          <div className="text-xs font-semibold text-white">{ev.title}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{ev.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {sec.kind === 'document' && sec.document_markdown && (
                  <pre className="bg-slate-950/85 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                    {sec.document_markdown}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};
