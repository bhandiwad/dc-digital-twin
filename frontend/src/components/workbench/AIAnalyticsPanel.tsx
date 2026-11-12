import React from 'react';
import { AlertTriangle, ShieldAlert, Sparkles } from 'lucide-react';
import { AnomalyEvent, OptimizationRecommendation } from '../../types';

export interface AIAnalyticsPanelProps {
  optimization: OptimizationRecommendation;
  anomalies: AnomalyEvent[];
  onApplyOptimization: () => void;
  onSelectRackAnomaly: (rackId: string) => void;
}

export const AIAnalyticsPanel: React.FC<AIAnalyticsPanelProps> = ({
  optimization,
  anomalies,
  onApplyOptimization,
  onSelectRackAnomaly,
}) => {
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 border border-cyan-500/40 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              AI Constrained Cooling Optimizer
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            -{optimization.power_saved_kw.toFixed(1)} kW Savings
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center font-mono">
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] text-slate-400">PUE Impact</div>
            <div className="text-sm font-bold text-emerald-400">
              {optimization.current_pue.toFixed(3)} → {optimization.projected_pue.toFixed(3)}
            </div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] text-slate-400">Annual Savings</div>
            <div className="text-sm font-bold text-cyan-300">
              ${optimization.annual_cost_savings_usd.toLocaleString()}
            </div>
          </div>
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
            <div className="text-[10px] text-slate-400">Carbon Cut</div>
            <div className="text-sm font-bold text-emerald-300">
              {optimization.annual_carbon_saved_tons.toFixed(0)} tCO₂/yr
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {optimization.actions.map((act, i) => (
            <div
              key={i}
              className="bg-slate-950/85 border border-slate-800/90 rounded-lg p-2.5 text-xs"
            >
              <div className="flex items-center justify-between font-mono">
                <span className="font-bold text-cyan-300">
                  {act.target_id} • {act.parameter}
                </span>
                <span className="text-emerald-400 font-bold">
                  {act.current_value}
                  {act.unit} → {act.recommended_value}
                  {act.unit}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{act.rationale}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onApplyOptimization}
          className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all"
        >
          Execute Recommended Setpoints & Enable AI Auto-Pilot
        </button>
      </div>

      {/* Anomaly Feed */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-400" /> Anomaly & Root-Cause Feed
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            IsolationForest + ΔT Residual
          </span>
        </div>

        {anomalies.length === 0 ? (
          <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 text-center text-xs text-slate-400">
            No active thermal or mechanical anomalies detected.
          </div>
        ) : (
          <div className="space-y-2.5">
            {anomalies.map((anom) => (
              <div
                key={anom.id}
                onClick={() => {
                  if (anom.component_type === 'rack') {
                    onSelectRackAnomaly(anom.component_id);
                  }
                }}
                className={`cursor-pointer p-3 rounded-lg border text-xs space-y-1.5 transition-all ${
                  anom.severity === 'critical'
                    ? 'bg-red-950/40 border-red-500/60 hover:border-red-400'
                    : 'bg-amber-950/35 border-amber-500/50 hover:border-amber-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    {anom.title}
                  </span>
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-amber-300">
                    Score {(anom.anomaly_score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-slate-300 text-[11px]">{anom.description}</p>
                <div className="text-[11px] text-slate-400">
                  <strong className="text-slate-200">Root Cause:</strong> {anom.root_cause}
                </div>
                <div className="text-[11px] text-cyan-300 font-medium">
                  <strong>Facility Action:</strong> {anom.recommended_action}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
