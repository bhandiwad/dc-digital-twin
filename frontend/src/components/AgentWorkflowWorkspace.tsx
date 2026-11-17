import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Copy,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Terminal,
  XCircle,
  Zap,
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
      label: 'CHG0049182 · CDU-1 Strainer LOTO @ 15:00 (Vendor Draft)',
      sublabel: 'Peak afternoon weather + missing safety clauses → BLOCKED',
      patch: {
        raw_mop_text:
          'CHG0049182 — Mechanical vendor isolating CDU-1 primary basket strainer at 15:00 for 45 mins to flush debris screen. Standard LOTO padlock applied.',
        target_component_id: undefined,
        window_hour_local: undefined,
        forecast_wetbulb_c: undefined,
        duration_minutes: undefined,
      },
    },
    {
      id: 'crac2_morning_conditional',
      label: 'CHG0049205 · CRAC-2 VFD Service @ 10:00 (Partial MOP)',
      sublabel: 'Has dew-point check; omits peer VFD lock & abort °C → CONDITIONAL',
      patch: {
        raw_mop_text:
          'CHG0049205 — Preventative VFD drive inspection on CRAC-2 scheduled at 10:00 for 40 mins. Technician will verify hall dew point prior to opening cabinet.',
        target_component_id: undefined,
        window_hour_local: undefined,
        forecast_wetbulb_c: undefined,
        duration_minutes: undefined,
      },
    },
    {
      id: 'pdua_night_safe',
      label: 'CHG0049219 · PDU-A Thermography @ 03:00 (Complete MOP)',
      sublabel: 'Cool off-peak weather + full safety guardbands → APPROVED',
      patch: {
        raw_mop_text:
          'CHG0049219 — Non-intrusive infrared thermography scan on PDU-A busway at 03:00 for 30 mins. Confirmed hall dew point margin, peer unit manual lock at 90%, and thermal abort trigger at 25.5C.',
        target_component_id: undefined,
        window_hour_local: undefined,
        forecast_wetbulb_c: undefined,
        duration_minutes: undefined,
      },
    },
  ],
  incident_commander: [
    {
      id: 'inc_crac2',
      label: 'INC-901 · CRAC-2 Supply Fan VFD Trip (0 CFM)',
      sublabel: 'Collapses multi-cage cold-aisle alarms into 1 perimeter HVAC fault',
      patch: { incident_scenario_id: 'crac_2_fail' },
    },
    {
      id: 'inc_cdu1',
      label: 'INC-904 · CDU-1 Primary Strainer Restriction (+ΔP kPa)',
      sublabel: 'Liquid manifold return °C rise; stages duplex basket changeover',
      patch: { incident_scenario_id: 'cdu_1_fouling' },
    },
    {
      id: 'inc_recirc',
      label: 'INC-909 · Hot-Aisle Containment Roof Damper Drop',
      sublabel: 'Positive cold-aisle static pressure loss & exhaust backflow',
      patch: { incident_scenario_id: 'hot_aisle_recirc' },
    },
  ],
  shift_handover: [
    {
      id: 'shift_day_night',
      label: 'Outgoing Day (07:00–19:00) → Incoming Night Shift',
      sublabel: 'Catches frozen thermistor SAT-B04 + CRAC valve stiction',
      patch: {
        shift_window: 'day_to_night',
        dataset_id: 'kaggle_green_ai_24h',
        operator_shift_notes:
          '16:20 walkdown: heard slight actuator chatter on CRAC-4 chilled-water valve; Row B cold-aisle probe SAT-B04 looks flat since noon.',
      },
    },
    {
      id: 'shift_liquid_trace',
      label: 'High-Density Liquid Gallery Trace (12h CDU ΔP Creep)',
      sublabel: 'Correlates strainer ΔP trend + sensor hygiene across AI cages',
      patch: {
        shift_window: 'day_to_night',
        dataset_id: 'ornl_frontier_cdu_24h',
        operator_shift_notes:
          '18:10 liquid gallery check: CDU-1 primary strainer ΔP up ~14 kPa since morning shift start; duplex Basket B clean on standby.',
      },
    },
    {
      id: 'shift_night_day',
      label: 'Outgoing Night (19:00–07:00) → Incoming Day Shift',
      sublabel: 'Overnight economiser free-cooling & L1/L2/L3 neutral current audit',
      patch: {
        shift_window: 'night_to_day',
        dataset_id: 'ieee_ashrae_fault_24h',
        operator_shift_notes:
          '05:45 overnight tour: waterside economiser carried 72% of cooling load; PDU-A neutral current slightly elevated on Cage-101.',
      },
    },
  ],
  colo_deal_desk: [
    {
      id: 'rfp_ai_850kw',
      label: 'Broker Email · 850 kW Liquid AI Pod (10 Racks)',
      sublabel: 'Parses email + checks CDU/PDU spare kW + flags pre-quote specs',
      patch: {
        raw_rfp_email:
          'Hi Capacity Team — Representing an AI lab seeking 850 kW contiguous across 10 direct-to-chip liquid racks for Q3 deployment. Customer SLA requires summer PUE <= 1.28. Please confirm row availability and fit-out CapEx.',
        requested_kw: undefined,
        requested_racks: undefined,
        cooling_preference: undefined,
        target_pue_cap: undefined,
      },
    },
    {
      id: 'rfp_ent_180kw',
      label: 'Enterprise Inquiry · 180 kW Air Cage (12 Racks)',
      sublabel: '15 kW/rack standard air compute — fits dark spare bays',
      patch: {
        raw_rfp_email:
          'Looking for a private colocation cage with 180 kW across 12 standard air cabinets (no liquid manifolds). Target PUE cap 1.33, steady inference workload, populated racks weigh ~850 kg.',
        requested_kw: undefined,
        requested_racks: undefined,
        cooling_preference: undefined,
        target_pue_cap: undefined,
      },
    },
    {
      id: 'rfp_air_trap',
      label: 'Infeasible Spec · 900 kW in 10 Air-Only Racks (90 kW/rack)',
      sublabel: 'Blocks >35 kW/rack air physics trap & drafts DLC counter-offer',
      patch: {
        raw_rfp_email:
          'Urgent broker inquiry: prospect wants 900 kW in 10 cabinets using perimeter air-only cooling (no liquid). Target PUE <= 1.30. Can your hall support this?',
        requested_kw: undefined,
        requested_racks: undefined,
        cooling_preference: undefined,
        target_pue_cap: undefined,
      },
    },
  ],
  stranded_power: [
    {
      id: 'strand_full_80',
      label: 'Full Hall Bottom-Up Whip Audit (NEC 80% Rule)',
      sublabel: 'Sums real L1-L2 / L2-L3 / L3-L1 rack whips + ghost cages',
      patch: { audit_scope: 'full_hall', breaker_limit_pct: 80 },
    },
    {
      id: 'strand_liquid_85',
      label: 'High-Density Liquid Rows C & D (85% Dynamic Breaker)',
      sublabel: 'Audits Cage-301 / Cage-401 AI whips & ghost reservations',
      patch: { audit_scope: 'liquid_rows', breaker_limit_pct: 85 },
    },
    {
      id: 'strand_air_80',
      label: 'Air Colocation Rows A & B (80% Continuous Rule)',
      sublabel: 'Pinpoints L1-L2 phase skew & neutral bus current',
      patch: { audit_scope: 'air_rows', breaker_limit_pct: 80 },
    },
  ],
};

const BASE_DEFAULTS: AgentWorkflowRunRequest = {
  incident_scenario_id: 'crac_2_fail',
  sync_to_live_hall: false,
  shift_window: 'day_to_night',
  dataset_id: 'kaggle_green_ai_24h',
  audit_scope: 'full_hall',
  breaker_limit_pct: 80,
};

export interface AgentWorkflowWorkspaceProps {
  workflowId: AgentWorkflowId;
  snapshot: TwinStateSnapshot;
  onInspectIn3D: (
    assetId?: string | null,
    assetType?: 'rack' | 'crac' | 'cdu' | 'pdu' | null
  ) => void;
  onTriggerLiveScenario: (scenarioId: string) => void;
  onUpdateControl: (payload: Record<string, unknown>) => Promise<void>;
}

export const AgentWorkflowWorkspace: React.FC<AgentWorkflowWorkspaceProps> = ({
  workflowId,
  snapshot,
  onInspectIn3D,
  onTriggerLiveScenario,
  onUpdateControl,
}) => {
  const presets = WORKFLOW_PRESETS[workflowId];
  const cardMeta = USE_CASE_CATALOG.find((c) => c.id === workflowId);

  const [activePresetId, setActivePresetId] = useState<string>(presets[0].id);
  const [req, setReq] = useState<AgentWorkflowRunRequest>({
    ...BASE_DEFAULTS,
    ...presets[0].patch,
  });

  const [result, setResult] = useState<AgentWorkflowResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showManualOverride, setShowManualOverride] = useState<boolean>(false);
  const [rebalanceFlash, setRebalanceFlash] = useState<boolean>(false);
  const [advisoryFlash, setAdvisoryFlash] = useState<boolean>(false);

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
    setShowManualOverride(false);
    const initialReq: AgentWorkflowRunRequest = {
      ...BASE_DEFAULTS,
      ...first.patch,
    };
    setReq(initialReq);
    runAgenticWorkflow(workflowId, initialReq)
      .then(setResult)
      .catch(console.error);
  }, [workflowId]);

  const handleSelectPreset = (p: WorkflowPreset) => {
    setActivePresetId(p.id);
    setShowManualOverride(false);
    const next: AgentWorkflowRunRequest = { ...BASE_DEFAULTS, ...p.patch };
    setReq(next);
    executeRun(next);
  };

  const handleCopyDoc = (secId: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(secId);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleRebalanceWhips = async () => {
    await onUpdateControl({ rebalance_pdu_whips: true });
    setRebalanceFlash(true);
    setTimeout(() => setRebalanceFlash(false), 2400);
    await executeRun();
  };

  const handleStageAdvisoryTrim = async () => {
    await onUpdateControl({ bms_control_mode: 'advisory', approve_advisory_trim: true });
    setAdvisoryFlash(true);
    setTimeout(() => setAdvisoryFlash(false), 2200);
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
      {/* Left Rail: Scenario Presets, Unstructured Inputs & Live Hall Actions */}
      <aside className="w-full lg:w-[405px] border-b lg:border-b-0 lg:border-r border-slate-800/80 bg-slate-950/60 overflow-y-auto p-5 space-y-5 shrink-0">
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

        {/* 1-Click Field Scenario Presets */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Field Scenario Presets
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

        {/* Workflow-Specific Operational Inputs */}
        <div className="bg-slate-900/55 border border-slate-800 rounded-xl p-3.5 space-y-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Operational Input &amp; Context
          </div>

          {workflowId === 'redteam_change' && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-200 block mb-1.5">
                  Raw ServiceNow Ticket / Vendor MOP Draft
                </label>
                <textarea
                  rows={4}
                  value={req.raw_mop_text || ''}
                  onChange={(e) =>
                    setReq({
                      ...req,
                      raw_mop_text: e.target.value,
                      target_component_id: undefined,
                      window_hour_local: undefined,
                      forecast_wetbulb_c: undefined,
                      duration_minutes: undefined,
                    })
                  }
                  placeholder="Paste change ticket or vendor MOP text (e.g. isolating CDU-1 at 15:00 for 45 mins)..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-2.5 text-xs text-white leading-relaxed resize-y"
                />
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Extracts equipment ID, window &amp; duration, pulls site wet-bulb weather, and
                  critiques missing MOP safety clauses.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowManualOverride(!showManualOverride)}
                className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 pt-0.5"
              >
                <span>Optional: Override Weather / Equipment Manually</span>
                {showManualOverride ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showManualOverride && (
                <div className="space-y-3 pt-1 border-t border-slate-800/80">
                  <div>
                    <label className="text-xs text-slate-300 block mb-1">Pin Asset Override</label>
                    <select
                      value={req.target_component_id || ''}
                      onChange={(e) =>
                        setReq({ ...req, target_component_id: e.target.value || undefined })
                      }
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="">Auto-detect from MOP text</option>
                      {allAssetOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1 tabular-nums">
                      <span className="text-slate-300">Override Wet-Bulb Forecast</span>
                      <span className="text-amber-400 font-semibold">
                        {req.forecast_wetbulb_c !== undefined
                          ? `${req.forecast_wetbulb_c.toFixed(1)}°C`
                          : 'Auto (Site Diurnal API)'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={31}
                      step={0.5}
                      value={req.forecast_wetbulb_c ?? 26.0}
                      onChange={(e) =>
                        setReq({ ...req, forecast_wetbulb_c: Number(e.target.value) })
                      }
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {workflowId === 'incident_commander' && (
            <>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Active BMS Fault Event</label>
                <select
                  value={req.incident_scenario_id}
                  onChange={(e) => setReq({ ...req, incident_scenario_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="crac_2_fail">CRAC-2 Supply Fan VFD Trip (Perimeter Air)</option>
                  <option value="cdu_1_fouling">CDU-1 Strainer Restriction (Liquid AI Row)</option>
                  <option value="hot_aisle_recirc">Hot-Aisle Containment Damper Drop</option>
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

              <div>
                <label className="text-xs font-medium text-slate-200 block mb-1">
                  Outgoing Shift Operator Log Notes
                </label>
                <textarea
                  rows={3}
                  value={req.operator_shift_notes || ''}
                  onChange={(e) => setReq({ ...req, operator_shift_notes: e.target.value })}
                  placeholder="Enter walkdown observations, vendor visits, or valve noise notes..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-2.5 text-xs text-white leading-relaxed resize-y"
                />
              </div>
            </>
          )}

          {workflowId === 'colo_deal_desk' && (
            <>
              <div>
                <label className="text-xs font-medium text-slate-200 block mb-1.5">
                  Inbound Broker / Customer RFP Email
                </label>
                <textarea
                  rows={4}
                  value={req.raw_rfp_email || ''}
                  onChange={(e) =>
                    setReq({
                      ...req,
                      raw_rfp_email: e.target.value,
                      requested_kw: undefined,
                      requested_racks: undefined,
                      cooling_preference: undefined,
                      target_pue_cap: undefined,
                    })
                  }
                  placeholder="Paste broker email (e.g. 850 kW across 10 liquid racks, PUE <= 1.28)..."
                  className="w-full bg-slate-950 border border-slate-700/80 rounded-lg p-2.5 text-xs text-white leading-relaxed resize-y"
                />
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Parses kW/MW, rack count, cooling mode &amp; PUE SLA cap, checks hall spare bays,
                  and lists missing specs to ask prospect.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowManualOverride(!showManualOverride)}
                className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 pt-0.5"
              >
                <span>Optional: Override Capacity via Sliders</span>
                {showManualOverride ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>

              {showManualOverride && (
                <div className="space-y-3 pt-1 border-t border-slate-800/80">
                  <div>
                    <div className="flex justify-between text-xs mb-1 tabular-nums">
                      <span className="text-slate-300">Override IT Power</span>
                      <span className="text-sky-400 font-semibold">
                        {req.requested_kw !== undefined ? `${req.requested_kw} kW` : 'Auto-parsed'}
                      </span>
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
                      <span className="text-slate-300">Override Rack Count</span>
                      <span className="text-white font-semibold">
                        {req.requested_racks !== undefined
                          ? `${req.requested_racks} Racks`
                          : 'Auto-parsed'}
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
                </div>
              )}
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
                  <option value="full_hall">Full Hall (All Row PDUs &amp; Tenant Cages)</option>
                  <option value="liquid_rows">Liquid AI Rows (ROW-C &amp; ROW-D)</option>
                  <option value="air_rows">Air Colocation Rows (ROW-A &amp; ROW-B)</option>
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
              <span>Inspect {result?.focus_asset_id || 'Hall'} in 3D Digital Twin</span>
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {workflowId === 'stranded_power' && (
            <button
              type="button"
              onClick={handleRebalanceWhips}
              className="w-full py-2 px-3 rounded-lg bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/35 text-xs font-medium text-violet-300 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-violet-400" />
                <span>
                  {rebalanceFlash
                    ? 'Rack Whips Balanced Across L1/L2/L3!'
                    : 'Execute Whip Phase Rebalance on Hall'}
                </span>
              </span>
              {rebalanceFlash ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <ArrowUpRight className="w-3.5 h-3.5" />
              )}
            </button>
          )}

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

          {snapshot.facility.bms_control_mode !== 'bounded_autotrim' && (
            <button
              type="button"
              onClick={handleStageAdvisoryTrim}
              className="w-full py-2 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium text-emerald-300 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {advisoryFlash
                    ? 'Approved +1.0°C / -6% VFD Advisory Trim'
                    : `Approve Advisory Trim (-${snapshot.optimization.power_saved_kw.toFixed(0)} kW Pot.)`}
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
            <span>Executing multi-step facility agent tools...</span>
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
                  Engine compute:{' '}
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
                                    : cell.includes('Quarantined') || cell.includes('TIGHT')
                                    ? 'text-amber-400 font-medium'
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
                    {sec.checklist.map((item, idx) => {
                      const isGap = item.priority === 'MOP GAP' || item.priority === 'ASK PROSPECT';
                      return (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-4 p-3.5 rounded-xl bg-slate-950/65 border border-slate-800/90"
                        >
                          <div className="flex items-start gap-2.5">
                            {isGap ? (
                              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            ) : (
                              <ClipboardCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                            )}
                            <div>
                              <div className="text-xs font-semibold text-white">{item.label}</div>
                              <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                                {item.detail}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md border shrink-0 tabular-nums ${
                              isGap
                                ? 'bg-amber-500/15 border-amber-500/35 text-amber-300'
                                : 'bg-slate-900 border-slate-700/80 text-sky-300'
                            }`}
                          >
                            {item.priority}
                          </span>
                        </div>
                      );
                    })}
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
