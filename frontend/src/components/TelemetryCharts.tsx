import React from 'react';
import { FacilityMetrics, ForecastHorizonPoint } from '../types';

export const TelemetryCharts: React.FC<{
  history: FacilityMetrics[];
  forecasts: ForecastHorizonPoint[];
}> = ({ history, forecasts }) => {
  const recent = history.slice(-30);
  if (recent.length === 0) return null;

  // Sparkline helper for PUE history
  const pueValues = recent.map((h) => h.pue);
  const minPue = Math.min(1.08, ...pueValues);
  const maxPue = Math.max(1.45, ...pueValues);
  const puePoints = pueValues
    .map((v, i) => {
      const x = (i / Math.max(pueValues.length - 1, 1)) * 240;
      const y = 52 - ((v - minPue) / Math.max(maxPue - minPue, 0.05)) * 44;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  // Power & Thermal history points
  const chipValues = recent.map((h) => h.max_chip_temp_c);
  const minChip = Math.min(48, ...chipValues);
  const maxChip = Math.max(82, ...chipValues);
  const chipPoints = chipValues
    .map((v, i) => {
      const x = (i / Math.max(chipValues.length - 1, 1)) * 240;
      const y = 52 - ((v - minChip) / Math.max(maxChip - minChip, 5)) * 44;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="grid grid-cols-3 gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 backdrop-blur-md">
      {/* Chart 1: Live PUE Trajectory */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Live PUE Trajectory
          </span>
          <span className="text-xs font-mono font-bold text-cyan-400">
            {recent[recent.length - 1].pue.toFixed(3)}
          </span>
        </div>
        <svg viewBox="0 0 240 58" className="w-full h-14 overflow-visible mt-1">
          <line x1="0" y1="48" x2="240" y2="48" stroke="#1e293b" strokeDasharray="3 3" />
          <polyline
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2.2"
            points={puePoints}
          />
        </svg>
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>IT: {recent[recent.length - 1].total_it_power_kw.toFixed(0)} kW</span>
          <span>Cooling: {recent[recent.length - 1].total_cooling_power_kw.toFixed(0)} kW</span>
        </div>
      </div>

      {/* Chart 2: Peak GPU Junction Thermal Trend */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Peak GPU Junction (°C)
          </span>
          <span
            className={`text-xs font-mono font-bold ${
              recent[recent.length - 1].max_chip_temp_c >= 72
                ? 'text-red-400'
                : 'text-emerald-400'
            }`}
          >
            {recent[recent.length - 1].max_chip_temp_c.toFixed(1)}°C ({recent[recent.length - 1].max_chip_rack_id})
          </span>
        </div>
        <svg viewBox="0 0 240 58" className="w-full h-14 overflow-visible mt-1">
          {/* 75C throttle warning line */}
          <line x1="0" y1="12" x2="240" y2="12" stroke="#ef4444" strokeWidth="0.8" strokeDasharray="3 3" />
          <polyline
            fill="none"
            stroke={recent[recent.length - 1].max_chip_temp_c >= 72 ? '#f97316' : '#10b981'}
            strokeWidth="2.2"
            points={chipPoints}
          />
        </svg>
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>Max Inlet: {recent[recent.length - 1].max_inlet_temp_c.toFixed(1)}°C</span>
          <span>DLC Share: {recent[recent.length - 1].liquid_cooling_share_pct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Chart 3: AI 30-Minute Multi-Horizon Forecast */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-300">
            AI Thermal Forecast (+30m)
          </span>
          {forecasts.length > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-700/60">
              Risk: {forecasts[forecasts.length - 1].hotspot_risk_pct.toFixed(0)}%
            </span>
          )}
        </div>
        <div className="grid grid-cols-5 gap-1 my-1">
          {forecasts.map((f) => (
            <div
              key={f.horizon_min}
              className="bg-slate-900/90 border border-slate-800 rounded px-1.5 py-1 text-center"
            >
              <div className="text-[9px] font-mono text-slate-400">+{f.horizon_min}m</div>
              <div
                className={`text-[11px] font-mono font-bold ${
                  f.predicted_max_chip_c >= 74
                    ? 'text-red-400'
                    : f.predicted_max_chip_c >= 68
                    ? 'text-amber-400'
                    : 'text-cyan-300'
                }`}
              >
                {f.predicted_max_chip_c.toFixed(1)}°
              </div>
              <div className="text-[9px] font-mono text-slate-500">
                PUE {f.predicted_pue.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500">
          <span>PINN State-Space Surrogate</span>
          <span>95% CI: ±{forecasts[2] ? (forecasts[2].upper_bound_chip_c - forecasts[2].predicted_max_chip_c).toFixed(1) : '1.8'}°C</span>
        </div>
      </div>
    </div>
  );
};
