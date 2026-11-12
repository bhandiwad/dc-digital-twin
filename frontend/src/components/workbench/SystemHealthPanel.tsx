import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { MPCPolicyState, OpenDTCalibrationReport } from '../../types';

export const SystemHealthPanel: React.FC = () => {
  const [calibration, setCalibration] = useState<OpenDTCalibrationReport | null>(null);
  const [mpcState, setMpcState] = useState<MPCPolicyState | null>(null);

  useEffect(() => {
    const loadHealth = async () => {
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
    loadHealth();
    const timer = window.setInterval(loadHealth, 3500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-4">
      {/* 1. Zone Calibration & Fouling Health */}
      {calibration && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Zone Calibration & Fouling</h3>
                <p className="text-[11px] text-slate-400">
                  Tracks heat-exchanger drift from standard facility meters
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold tabular-nums text-emerald-400">
              ±{calibration.overall_calibrated_rmse_c.toFixed(2)}°C accuracy
            </span>
          </div>

          <div className="space-y-2">
            {calibration.zones.map((z) => {
              const statusLabel =
                z.fouling_status === 'MAINTENANCE_REQUIRED'
                  ? 'Service Needed'
                  : z.fouling_status === 'EARLY_DRIFT'
                  ? 'Early Drift'
                  : 'Healthy';

              return (
                <div
                  key={z.zone_id}
                  className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-100">{z.zone_name}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                      Efficiency loss: {z.ua_degradation_pct.toFixed(1)}% · Error ±{z.calibrated_rmse_c}°C
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                      z.fouling_status === 'MAINTENANCE_REQUIRED'
                        ? 'bg-red-500/15 text-red-300'
                        : z.fouling_status === 'EARLY_DRIFT'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-300'
                    }`}
                  >
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>

          {calibration.predictive_maintenance_alerts.length > 0 && (
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 space-y-1 text-xs text-slate-300">
              <div className="text-[11px] font-medium text-amber-400">Maintenance Notes</div>
              {calibration.predictive_maintenance_alerts.map((al, i) => (
                <div key={i}>· {al}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. 30-Minute Lookahead & Safety Guardrails */}
      {mpcState && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">30-Minute Safety Lookahead</h3>
                <p className="text-[11px] text-slate-400">
                  Compares legacy BMS response against pre-cooled trajectory
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold tabular-nums text-emerald-400">
              -{mpcState.anti_hunting_savings_kw} kW saved
            </span>
          </div>

          <div className="space-y-1.5 text-xs tabular-nums">
            <div className="grid grid-cols-4 text-[11px] text-slate-400 px-2.5 pb-1">
              <span>Time</span>
              <span>Standard BMS</span>
              <span>Smart Control</span>
              <span className="text-right">Proj. PUE</span>
            </div>
            {mpcState.lookahead_trajectory.map((step) => (
              <div
                key={step.step_min}
                className="grid grid-cols-4 items-center bg-slate-950/70 border border-slate-800/80 rounded-lg px-2.5 py-2"
              >
                <span className="font-medium text-slate-200">+{step.step_min}m</span>
                <span
                  className={
                    step.uncontrolled_inlet_c >= 26.5 ? 'text-red-400 font-semibold' : 'text-slate-300'
                  }
                >
                  {step.uncontrolled_inlet_c.toFixed(1)}°C
                </span>
                <span className="text-emerald-400 font-semibold">
                  {step.mpc_controlled_inlet_c.toFixed(1)}°C
                </span>
                <span className="text-right text-slate-200 font-medium">
                  {step.projected_pue.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5 space-y-1">
            <div className="text-[11px] font-semibold text-emerald-300">Active Hardware Guardrails</div>
            {mpcState.active_safety_barriers.map((b, i) => (
              <div key={i} className="text-[11px] text-slate-300">
                ✓ {b}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
