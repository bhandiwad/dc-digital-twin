import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Gauge,
  GitBranch,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  OpenDTCalibrationReport,
  MPCPolicyState,
  MOPDocumentResponse,
} from '../types';

export const FacilityMLSuitePanel: React.FC = () => {
  const [subTab, setSubTab] = useState<'opendt_rls' | 'mpc_lookahead' | 'graphrag_mop'>('opendt_rls');
  const [calibration, setCalibration] = useState<OpenDTCalibrationReport | null>(null);
  const [mpcState, setMpcState] = useState<MPCPolicyState | null>(null);
  const [mopDoc, setMopDoc] = useState<MOPDocumentResponse | null>(null);
  const [mopTarget, setMopTarget] = useState<string>('CDU-1');
  const [mopType, setMopType] = useState<string>('strainer_swap');
  const [mopLoading, setMopLoading] = useState<boolean>(false);
  const [copiedMop, setCopiedMop] = useState<boolean>(false);

  const fetchSuiteData = async () => {
    try {
      const [calRes, mpcRes] = await Promise.all([
        fetch('/api/opendt/calibration'),
        fetch('/api/mpc/policy'),
      ]);
      if (calRes.ok) setCalibration(await calRes.json());
      if (mpcRes.ok) setMpcState(await mpcRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const generateMop = async (targetId: string, procType: string) => {
    setMopLoading(true);
    try {
      const res = await fetch('/api/graphrag/mop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_component_id: targetId,
          procedure_type: procType,
          duration_minutes: 20,
        }),
      });
      if (res.ok) {
        setMopDoc(await res.json());
      }
    } finally {
      setMopLoading(false);
    }
  };

  useEffect(() => {
    fetchSuiteData();
    generateMop(mopTarget, mopType);
    const timer = window.setInterval(fetchSuiteData, 3000);
    return () => clearInterval(timer);
  }, []);

  const copyMopMarkdown = () => {
    if (!mopDoc) return;
    navigator.clipboard.writeText(mopDoc.markdown_document);
    setCopiedMop(true);
    setTimeout(() => setCopiedMop(false), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Sub-Navigation Pills for the 3 Facility-First AI Modules */}
      <div className="grid grid-cols-3 gap-1 bg-slate-900/90 border border-slate-800 rounded-xl p-1">
        <button
          onClick={() => setSubTab('opendt_rls')}
          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
            subTab === 'opendt_rls'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          1. OpenDT RLS Calibration
        </button>
        <button
          onClick={() => setSubTab('mpc_lookahead')}
          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
            subTab === 'mpc_lookahead'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          2. Constrained MPC / RL
        </button>
        <button
          onClick={() => setSubTab('graphrag_mop')}
          className={`py-1.5 px-2 rounded-lg text-[11px] font-bold transition-all ${
            subTab === 'graphrag_mop'
              ? 'bg-cyan-500 text-slate-950 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          3. GraphRAG SOP / MOP
        </button>
      </div>

      {/* MODULE 1: OpenDT Online Self-Calibration (Recursive Least Squares + Extended Kalman Filter) */}
      {subTab === 'opendt_rls' && calibration && (
        <div className="space-y-3">
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  Zero Server Access • Facility Sensors Only
                </span>
                <h3 className="text-xs font-bold text-white mt-1">
                  OpenDT Online Parameter Estimator (RLS + Kalman Filter)
                </h3>
              </div>
              <div className="text-right font-mono">
                <div className="text-[10px] text-slate-400">Convergence</div>
                <div className="text-sm font-bold text-emerald-400">{calibration.convergence_pct}%</div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Continuously learns zone thermal resistance (<code className="text-cyan-300">R_th</code>) and thermal capacitance (<code className="text-cyan-300">C_th</code>) from PDU kW and CDU/CRAC supply-return ΔT—eliminating manual CFD re-calibration and catching heat-exchanger fouling early.
            </p>

            {/* Headline Error Convergence Cards */}
            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="bg-slate-950/85 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400">Uncalibrated RMSE</div>
                <div className="text-sm font-bold text-amber-400">
                  ±{calibration.overall_uncalibrated_rmse_c.toFixed(2)}°C
                </div>
              </div>
              <div className="bg-slate-950/85 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400">OpenDT RLS RMSE</div>
                <div className="text-sm font-bold text-emerald-400">
                  ±{calibration.overall_calibrated_rmse_c.toFixed(2)}°C
                </div>
              </div>
              <div className="bg-slate-950/85 border border-slate-800 rounded-lg p-2">
                <div className="text-[10px] text-slate-400">Thermal MAPE</div>
                <div className="text-sm font-bold text-cyan-300">{calibration.overall_mape_pct}%</div>
              </div>
            </div>

            {/* Per-Zone Learned R_th & UA Fouling Drift Table */}
            <div className="space-y-2 pt-1">
              {calibration.zones.map((z) => (
                <div
                  key={z.zone_id}
                  className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{z.zone_name}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                        z.fouling_status === 'MAINTENANCE_REQUIRED'
                          ? 'bg-red-950 text-red-300 border border-red-500/60'
                          : z.fouling_status === 'EARLY_DRIFT'
                          ? 'bg-amber-950 text-amber-300 border border-amber-500/60'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-500/50'
                      }`}
                    >
                      {z.fouling_status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 font-mono text-[10px] text-slate-300">
                    <div>
                      <span className="text-slate-500 block">Learned R_th (Nominal)</span>
                      <span className="text-cyan-300 font-bold">
                        {z.learned_r_th_c_per_kw} ({z.nominal_r_th_c_per_kw}) °C/kW
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Learned C_th</span>
                      <span>{z.learned_c_th_kj_per_c} kJ/°C</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">UA Drift / RMSE</span>
                      <span className={z.ua_degradation_pct > 10 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                        -{z.ua_degradation_pct}% (±{z.calibrated_rmse_c}°C)
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Predictive Maintenance Alerts */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 space-y-1">
              <div className="text-[10px] font-mono uppercase text-amber-300 font-semibold">
                Predictive Maintenance & Fouling Drift Diagnostics:
              </div>
              {calibration.predictive_maintenance_alerts.map((al, i) => (
                <div key={i} className="text-[11px] text-slate-300">
                  • {al}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODULE 2: Constrained MPC / Safe-RL Lookahead Cooling Controller */}
      {subTab === 'mpc_lookahead' && mpcState && (
        <div className="space-y-3">
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {mpcState.controller_status}
                </span>
                <h3 className="text-xs font-bold text-white mt-1">
                  30-Min Lookahead MPC + Control Barrier Functions (CBF)
                </h3>
              </div>
              <div className="text-right font-mono text-[10px] text-slate-400">
                <div>Solve: {mpcState.solve_time_ms}ms</div>
                <div className="text-emerald-400 font-bold">
                  Anti-Hunting: -{mpcState.anti_hunting_savings_kw} kW
                </div>
              </div>
            </div>

            {/* Active Hard Mathematical Safety Barriers */}
            <div className="bg-slate-950/90 border border-emerald-500/40 rounded-lg p-2.5 space-y-1">
              <div className="text-[10px] font-mono uppercase text-emerald-300 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Active Control Barrier Function (CBF) Guarantees:
              </div>
              {mpcState.active_safety_barriers.map((b, i) => (
                <div key={i} className="text-[11px] font-mono text-slate-300">
                  ✓ {b}
                </div>
              ))}
            </div>

            {/* 30-Minute Lookahead Trajectory Table (PID Uncontrolled vs Constrained MPC) */}
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                Lookahead Trajectory: Reactive PID vs. Constrained MPC Pre-Cooling
              </div>
              <div className="space-y-1 font-mono text-[10px]">
                <div className="grid grid-cols-5 text-slate-400 px-2 py-1 border-b border-slate-800">
                  <span>Horizon</span>
                  <span>PID Inlet</span>
                  <span>MPC Inlet</span>
                  <span>CDU Setpoint</span>
                  <span>Proj PUE</span>
                </div>
                {mpcState.lookahead_trajectory.map((step) => (
                  <div
                    key={step.step_min}
                    className="grid grid-cols-5 items-center bg-slate-950/85 border border-slate-800/80 rounded px-2 py-1.5"
                  >
                    <span className="font-bold text-white">+{step.step_min}m</span>
                    <span
                      className={
                        step.uncontrolled_inlet_c >= 26.5 ? 'text-red-400 font-bold' : 'text-amber-300'
                      }
                    >
                      {step.uncontrolled_inlet_c.toFixed(1)}°C
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {step.mpc_controlled_inlet_c.toFixed(1)}°C
                    </span>
                    <span className="text-cyan-300">
                      {step.optimal_cdu_setpoint_c.toFixed(1)}°C ({step.optimal_cdu_pump_pct.toFixed(0)}%)
                    </span>
                    <span className="text-white font-bold">{step.projected_pue.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODULE 3: Topology-Grounded GraphRAG + Standard Operating Procedure (SOP / MOP) Generator */}
      {subTab === 'graphrag_mop' && (
        <div className="space-y-3">
          <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  NetworkX Blast Radius + ASHRAE / Vendor SOPs
                </span>
                <h3 className="text-xs font-bold text-white mt-1">
                  Automated Method of Procedure (MOP) Generator
                </h3>
              </div>
              {mopDoc && (
                <button
                  onClick={copyMopMarkdown}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-[11px] font-mono text-cyan-300 flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedMop ? 'Copied MOP!' : 'Copy MOP (.md)'}</span>
                </button>
              )}
            </div>

            {/* Target Asset & Maintenance Procedure Selector */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400">
                  Target Facility Asset
                </label>
                <select
                  value={mopTarget}
                  onChange={(e) => {
                    setMopTarget(e.target.value);
                    generateMop(e.target.value, mopType);
                  }}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-xs text-white"
                >
                  <option value="CDU-1">CDU-1 (Row C Liquid AI Cooling)</option>
                  <option value="CDU-2">CDU-2 (Row D Liquid AI Cooling)</option>
                  <option value="CRAC-2">CRAC-2 (North-East Air Handler)</option>
                  <option value="CRAC-3">CRAC-3 (South-West Air Handler)</option>
                  <option value="PDU-C">PDU-C (Row C 800kW Power Bus)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-mono uppercase text-slate-400">
                  Maintenance Procedure
                </label>
                <select
                  value={mopType}
                  onChange={(e) => {
                    setMopType(e.target.value);
                    generateMop(mopTarget, e.target.value);
                  }}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-xs text-white"
                >
                  <option value="strainer_swap">Duplex Strainer Clean & Pump Switchover</option>
                  <option value="vfd_replacement">VFD Inverter LOTO Replacement</option>
                  <option value="breaker_thermography">Concurrent Breaker Transfer & IR Scan</option>
                </select>
              </div>
            </div>

            {mopLoading || !mopDoc ? (
              <div className="p-4 text-center font-mono text-xs text-slate-400">
                Traversing NetworkX topology & synthesizing MOP checklist...
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Blast Radius Summary Box */}
                <div className="bg-slate-950/90 border border-indigo-500/40 rounded-lg p-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between font-mono">
                    <span className="text-indigo-300 font-bold">
                      GraphRAG Blast Radius: {mopDoc.blast_radius_racks.length} Racks ({mopDoc.total_affected_kw} kW)
                    </span>
                    <span className="text-amber-300 text-[10px]">{mopDoc.mop_id}</span>
                  </div>
                  <div className="text-[11px] text-slate-300">
                    <strong>Affected Rows:</strong> {mopDoc.blast_radius_rows.join(', ')} (
                    {mopDoc.blast_radius_racks[0]} ..{' '}
                    {mopDoc.blast_radius_racks[mopDoc.blast_radius_racks.length - 1]})
                  </div>
                  <div className="text-[10px] font-mono text-cyan-300 pt-0.5">
                    Required T-15m Pre-Cool:{' '}
                    {Object.entries(mopDoc.required_precool_setpoints)
                      .map(([k, v]) => `${k} → ${v}`)
                      .join(' | ')}
                  </div>
                </div>

                {/* Step-by-Step LOTO & Execution Checklist */}
                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {mopDoc.steps.map((st) => (
                    <div
                      key={st.step_number}
                      className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-cyan-300">
                          Step {st.step_number}: {st.phase}
                        </span>
                        <span className="text-[10px] text-emerald-400">Verify: {st.verification_metric}</span>
                      </div>
                      <p className="text-slate-200 leading-relaxed">{st.action}</p>
                      <div className="text-[10px] font-mono text-amber-300/90">
                        Rollback Trigger: {st.rollback_trigger}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
