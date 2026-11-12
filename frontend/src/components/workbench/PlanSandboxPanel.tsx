import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Cpu,
  FlaskConical,
} from 'lucide-react';
import {
  ClusterScaleRequest,
  ClusterScaleResponse,
  MOPDocumentResponse,
  TwinStateSnapshot,
  WhatIfRequest,
  WhatIfResponse,
} from '../../types';
import { postClusterScalePlan } from '../../api/client';
import { WhatIfPanel } from './WhatIfPanel';

export interface PlanSandboxPanelProps {
  snapshot: TwinStateSnapshot;
  whatIfReq: WhatIfRequest;
  whatIfResult: WhatIfResponse | null;
  whatIfLoading: boolean;
  onChangeReq: (next: WhatIfRequest) => void;
  onRunWhatIf: (overrideReq?: WhatIfRequest) => void;
}

export const PlanSandboxPanel: React.FC<PlanSandboxPanelProps> = ({
  snapshot,
  whatIfReq,
  whatIfResult,
  whatIfLoading,
  onChangeReq,
  onRunWhatIf,
}) => {
  const [subMode, setSubMode] = useState<'cluster_scale' | 'what_if' | 'mop'>('cluster_scale');

  // 10k-GPU Cluster Scale Planner State
  const [clusterReq, setClusterReq] = useState<ClusterScaleRequest>({
    gpu_count: 10000,
    gpu_arch: 'gb200_nvl72',
    cooling_strategy: 'warm_water_dlc',
  });
  const [clusterRes, setClusterRes] = useState<ClusterScaleResponse | null>(null);
  const [clusterLoading, setClusterLoading] = useState<boolean>(false);
  const [showArchNotes, setShowArchNotes] = useState<boolean>(false);

  const evaluateCluster = async (req: ClusterScaleRequest) => {
    setClusterLoading(true);
    try {
      setClusterRes(await postClusterScalePlan(req));
    } catch (e) {
      console.error(e);
    } finally {
      setClusterLoading(false);
    }
  };

  useEffect(() => {
    if (subMode === 'cluster_scale' && !clusterRes) {
      evaluateCluster(clusterReq);
    }
  }, [subMode]);

  const updateClusterReq = (patch: Partial<ClusterScaleRequest>) => {
    const next = { ...clusterReq, ...patch };
    setClusterReq(next);
    evaluateCluster(next);
  };

  // Maintenance Checklist (MOP) State
  const assetOptions = [
    ...snapshot.cdus.map((c) => ({ id: c.cdu_id, label: `${c.cdu_id} · Liquid CDU` })),
    ...snapshot.cracs.map((c) => ({ id: c.crac_id, label: `${c.crac_id} · Air CRAC` })),
    ...snapshot.pdus.map((p) => ({ id: p.pdu_id, label: `${p.pdu_id} · Row PDU` })),
  ];

  const [mopTarget, setMopTarget] = useState<string>(assetOptions[0]?.id || 'CDU-1');
  const [mopType, setMopType] = useState<string>('strainer_swap');
  const [mopDoc, setMopDoc] = useState<MOPDocumentResponse | null>(null);
  const [mopLoading, setMopLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const generateMop = async (targetId: string, procType: string) => {
    setMopLoading(true);
    try {
      const res = await fetch('/api/graphrag/mop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_component_id: targetId,
          procedure_type: procType,
          maintenance_window_minutes: 30,
        }),
      });
      if (res.ok) setMopDoc(await res.json());
    } finally {
      setMopLoading(false);
    }
  };

  useEffect(() => {
    if (subMode === 'mop' && !mopDoc && mopTarget) {
      generateMop(mopTarget, mopType);
    }
  }, [subMode]);

  const copyMarkdown = () => {
    if (!mopDoc) return;
    navigator.clipboard.writeText(mopDoc.markdown_document);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const airRow =
    snapshot.racks.find((r) => r.cooling_type === 'air')?.row_id ||
    snapshot.racks[0]?.row_id ||
    'ROW-A';

  return (
    <div className="space-y-4">
      {/* Clean 3-Way Planning Mode Switch */}
      <div className="grid grid-cols-3 bg-slate-900/80 border border-slate-800 rounded-lg p-1 gap-1">
        <button
          onClick={() => setSubMode('cluster_scale')}
          className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
            subMode === 'cluster_scale'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>AI Cluster</span>
        </button>
        <button
          onClick={() => setSubMode('what_if')}
          className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
            subMode === 'what_if'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Row What-If</span>
        </button>
        <button
          onClick={() => setSubMode('mop')}
          className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1 transition-colors ${
            subMode === 'mop'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>MOP Steps</span>
        </button>
      </div>

      {/* MODE 1: Multi-MW / 10k-GPU AI Cluster Scale-Out Planner */}
      {subMode === 'cluster_scale' && (
        <div className="space-y-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
            <div>
              <h3 className="text-sm font-semibold text-white">AI Training Cluster Scale-Out</h3>
              <p className="text-[11px] text-slate-400">
                Sizes multi-hall power, liquid flow, and step-load buffers vs. current hall
              </p>
            </div>

            {/* Quick Scale Presets */}
            <div className="grid grid-cols-3 gap-1.5 tabular-nums">
              {[
                { count: 2048, label: '2k Pod' },
                { count: 10000, label: '10k Cluster' },
                { count: 25000, label: '25k Campus' },
              ].map((p) => (
                <button
                  key={p.count}
                  onClick={() => updateClusterReq({ gpu_count: p.count })}
                  className={`py-1.5 px-2 rounded-lg text-xs font-medium border transition-colors ${
                    clusterReq.gpu_count === p.count
                      ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                      : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="space-y-3 text-xs tabular-nums">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Target Training Cluster Size</span>
                  <span className="font-semibold text-sky-400">
                    {clusterReq.gpu_count.toLocaleString()} GPUs
                  </span>
                </div>
                <input
                  type="range"
                  min={1000}
                  max={30000}
                  step={500}
                  value={clusterReq.gpu_count}
                  onChange={(e) => updateClusterReq({ gpu_count: parseInt(e.target.value, 10) })}
                  className="w-full accent-sky-500"
                />
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] text-slate-400">GPU Rack Architecture</label>
                  <select
                    value={clusterReq.gpu_arch}
                    onChange={(e) =>
                      updateClusterReq({
                        gpu_arch: e.target.value as ClusterScaleRequest['gpu_arch'],
                      })
                    }
                    className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="gb200_nvl72">NVIDIA GB200 NVL72 (72 GPU · 126 kW/rack)</option>
                    <option value="h200_hgx">NVIDIA HGX H200 (32 GPU · 42 kW/rack)</option>
                    <option value="nextgen_ultra">Next-Gen Ultra NVL144 (144 GPU · 240 kW/rack)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400">Cooling Plant Design</label>
                  <select
                    value={clusterReq.cooling_strategy}
                    onChange={(e) =>
                      updateClusterReq({
                        cooling_strategy: e.target
                          .value as ClusterScaleRequest['cooling_strategy'],
                      })
                    }
                    className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  >
                    <option value="warm_water_dlc">
                      Warm-Water Liquid (30°C + Dry-Cooler Economizer)
                    </option>
                    <option value="chilled_water_dlc">
                      Chiller-Backed Liquid (20°C Mechanical Chiller)
                    </option>
                    <option value="legacy_air">Perimeter CRAC Air-Only</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {clusterLoading && !clusterRes ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Sizing multi-hall infrastructure...
            </div>
          ) : (
            clusterRes && (
              <div className="space-y-3.5">
                {!clusterRes.feasible && clusterRes.infeasibility_reason && (
                  <div className="bg-red-950/35 border border-red-500/50 rounded-xl p-3.5 text-xs space-y-1">
                    <div className="font-semibold text-red-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>Air-Only Cooling Physically Infeasible</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      {clusterRes.infeasibility_reason}
                    </p>
                  </div>
                )}

                {/* Headline Scale Reality Summary */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3 tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">
                      Infrastructure Footprint
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 font-medium">
                      {clusterRes.data_halls_required}{' '}
                      {clusterRes.data_halls_required === 1 ? 'Data Hall' : 'Data Halls'} Needed
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
                      <div className="text-[11px] text-slate-400">Total Utility</div>
                      <div className="text-sm font-semibold text-white mt-0.5">
                        {clusterRes.total_utility_mw.toFixed(1)} MW
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {clusterRes.cluster_it_mw.toFixed(1)} MW IT
                      </div>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
                      <div className="text-[11px] text-slate-400">Total Racks</div>
                      <div className="text-sm font-semibold text-sky-400 mt-0.5">
                        {clusterRes.total_cluster_racks}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {clusterRes.compute_racks} GPU + {clusterRes.network_storage_racks} Net
                      </div>
                    </div>
                    <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
                      <div className="text-[11px] text-slate-400">Step Swing</div>
                      <div className="text-sm font-semibold text-amber-400 mt-0.5">
                        ±{clusterRes.synchronous_step_swing_mw.toFixed(1)} MW
                      </div>
                      <div className="text-[10px] text-slate-500">&lt;100 ms barrier</div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 bg-slate-950/60 border border-slate-800/80 rounded-lg p-2.5 leading-relaxed">
                    {clusterRes.phase1_summary}
                  </div>
                </div>

                {/* What Changes: Current Hall vs Target Cluster */}
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
                  <div className="text-xs font-semibold text-white">
                    What Changes (Current Hall → {clusterRes.gpu_count.toLocaleString()} GPUs)
                  </div>

                  <div className="space-y-2 tabular-nums">
                    {clusterRes.infrastructure_deltas.map((d, i) => (
                      <div
                        key={i}
                        className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-100">{d.category}</span>
                          <span className="text-[11px] font-medium text-sky-400 shrink-0">
                            {d.upgrade_delta}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {d.current_site_value} <span className="text-slate-600">→</span>{' '}
                          <span className="text-slate-200 font-medium">
                            {d.required_cluster_value}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed pt-0.5">
                          {d.engineering_note}
                        </p>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowArchNotes(!showArchNotes)}
                    className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 pt-1"
                  >
                    <span>Key engineering design rules</span>
                    {showArchNotes ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showArchNotes && (
                    <div className="space-y-1.5 pt-1 text-[11px] text-slate-300 leading-relaxed">
                      {clusterRes.architectural_changes.slice(0, 3).map((note, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-950/60 border border-slate-800/70 rounded-lg p-2.5"
                        >
                          {note}
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const pilotPreset: WhatIfRequest = {
                        name: `Phase-1 Pilot: Convert ${airRow} to Liquid AI Pod (+160 kW)`,
                        target_row: airRow,
                        add_gpu_load_kw: 160,
                        convert_air_to_liquid: true,
                        crac_failure_id: null,
                        cdu_pump_degradation_pct: 0,
                        chiller_supply_delta_c: 0,
                        crac_setpoint_c: 20.5,
                        cdu_setpoint_c: 25.5,
                        ambient_wetbulb_c: null,
                        workload_rebalance: false,
                      };
                      onChangeReq(pilotPreset);
                      onRunWhatIf(pilotPreset);
                      setSubMode('what_if');
                    }}
                    className="w-full mt-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-sky-300 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>Test Phase-1 Pilot Retrofit on Current Hall</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* MODE 2: Current Hall Row What-If Sandbox */}
      {subMode === 'what_if' && (
        <WhatIfPanel
          racks={snapshot.racks}
          whatIfReq={whatIfReq}
          whatIfResult={whatIfResult}
          whatIfLoading={whatIfLoading}
          onChangeReq={onChangeReq}
          onRunWhatIf={onRunWhatIf}
        />
      )}

      {/* MODE 3: Equipment Maintenance Checklist (MOP) */}
      {subMode === 'mop' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Maintenance Checklist (MOP)</h3>
              <p className="text-[11px] text-slate-400">
                Checks downstream racks and generates safe pre-cooling & isolation steps.
              </p>
            </div>
            {mopDoc && (
              <button
                onClick={copyMarkdown}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-[11px] text-slate-400">Equipment</label>
              <select
                value={mopTarget}
                onChange={(e) => {
                  setMopTarget(e.target.value);
                  generateMop(e.target.value, mopType);
                }}
                className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                {assetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Work Type</label>
              <select
                value={mopType}
                onChange={(e) => {
                  setMopType(e.target.value);
                  generateMop(mopTarget, e.target.value);
                }}
                className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="strainer_swap">Strainer / Filter Service</option>
                <option value="vfd_replacement">Fan / Pump Drive Swap</option>
                <option value="breaker_thermography">Breaker Transfer & Scan</option>
              </select>
            </div>
          </div>

          {mopLoading || !mopDoc ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Checking affected racks & building checklist...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    Affected Scope: {mopDoc.blast_radius_racks.length} Racks (
                    {mopDoc.total_affected_kw} kW)
                  </span>
                  <span className="text-[11px] text-amber-300">{mopDoc.risk_classification}</span>
                </div>
                <div className="text-slate-400">Rows: {mopDoc.blast_radius_rows.join(', ')}</div>
                {Object.keys(mopDoc.required_precool_setpoints).length > 0 && (
                  <div className="text-sky-400 pt-0.5">
                    Pre-cool 15m before work:{' '}
                    {Object.entries(mopDoc.required_precool_setpoints)
                      .map(([k, v]) => `${k} → ${v}`)
                      .join(', ')}
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {mopDoc.steps.map((st) => (
                  <div
                    key={st.step_number}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100">
                        {st.step_number}. {st.phase}
                      </span>
                      <span className="text-[11px] text-emerald-400">{st.verification_metric}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{st.action}</p>
                    <div className="text-[11px] text-slate-400">
                      Stop / Rollback if: {st.rollback_trigger}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
