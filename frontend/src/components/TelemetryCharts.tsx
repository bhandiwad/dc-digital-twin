import React from 'react';
import { FacilityMetrics, ForecastHorizonPoint } from '../types';

export const TelemetryCharts: React.FC<{
  history: FacilityMetrics[];
  forecasts: ForecastHorizonPoint[];
}> = ({ history, forecasts }) => {
  const recent = history.slice(-30);
  if (recent.length === 0) return null;

  const latest = recent[recent.length - 1];

  const pueValues = recent.map((h) => h.pue);
  const minPue = Math.min(1.08, ...pueValues);
  const maxPue = Math.max(1.45, ...pueValues);
  const puePoints = pueValues
    .map((v, i) => {
      const x = (i / Math.max(pueValues.length - 1, 1)) * 240;
      const y = 46 - ((v - minPue) / Math.max(maxPue - minPue, 0.05)) * 38;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const inletValues = recent.map((h) => h.max_inlet_temp_c);
  const minInlet = Math.min(18, ...inletValues);
  const maxInlet = Math.max(29, ...inletValues);
  const inletPoints = inletValues
    .map((v, i) => {
      const x = (i / Math.max(inletValues.length - 1, 1)) * 240;
      const y = 46 - ((v - minInlet) / Math.max(maxInlet - minInlet, 3)) * 38;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="grid grid-cols-3 gap-3 pt-1">
      {/* Chart 1: PUE */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400">Facility PUE Trend</span>
          <span className="font-semibold tabular-nums text-sky-400">{latest.pue.toFixed(2)}</span>
        </div>
        <svg viewBox="0 0 240 50" className="w-full h-11 overflow-visible my-1">
          <polyline fill="none" stroke="#0ea5e9" strokeWidth="2" points={puePoints} />
        </svg>
        <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
          <span>IT {latest.total_it_power_kw.toFixed(0)} kW</span>
          <span>Cooling {latest.total_cooling_power_kw.toFixed(0)} kW</span>
        </div>
      </div>

      {/* Chart 2: Cold-Aisle Inlet */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400">Peak Cold-Aisle Temp</span>
          <span
            className={`font-semibold tabular-nums ${
              latest.max_inlet_temp_c >= 27 ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {latest.max_inlet_temp_c.toFixed(1)}°C ({latest.max_inlet_rack_id})
          </span>
        </div>
        <svg viewBox="0 0 240 50" className="w-full h-11 overflow-visible my-1">
          <line x1="0" y1="10" x2="240" y2="10" stroke="#f59e0b" strokeWidth="0.8" strokeDasharray="3 3" />
          <polyline
            fill="none"
            stroke={latest.max_inlet_temp_c >= 27 ? '#f59e0b' : '#10b981'}
            strokeWidth="2"
            points={inletPoints}
          />
        </svg>
        <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
          <span>ASHRAE Limit: 27.0°C</span>
          <span>Liquid Share: {latest.liquid_cooling_share_pct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Chart 3: 30-Minute Forecast */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-400">30-Minute Forecast</span>
          {forecasts.length > 0 && (
            <span className="text-[11px] tabular-nums text-slate-300">
              Hotspot Risk: {forecasts[forecasts.length - 1].hotspot_risk_pct.toFixed(0)}%
            </span>
          )}
        </div>
        <div className="grid grid-cols-5 gap-1.5 my-1.5">
          {forecasts.map((f) => (
            <div
              key={f.horizon_min}
              className="bg-slate-950/70 border border-slate-800/80 rounded-lg py-1.5 px-1 text-center tabular-nums"
            >
              <div className="text-[10px] text-slate-400">+{f.horizon_min}m</div>
              <div
                className={`text-xs font-semibold mt-0.5 ${
                  f.predicted_max_inlet_c >= 27
                    ? 'text-amber-400'
                    : 'text-slate-100'
                }`}
              >
                {f.predicted_max_inlet_c.toFixed(1)}°
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[11px] tabular-nums text-slate-400">
          <span>Cold-aisle trajectory</span>
          <span>Next 30 mins</span>
        </div>
      </div>
    </div>
  );
};
