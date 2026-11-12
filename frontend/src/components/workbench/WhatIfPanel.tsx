import React from 'react';
import { Play } from 'lucide-react';
import { RackTelemetry, WhatIfRequest, WhatIfResponse } from '../../types';

export interface WhatIfPanelProps {
  racks: RackTelemetry[];
  whatIfReq: WhatIfRequest;
  whatIfResult: WhatIfResponse | null;
  whatIfLoading: boolean;
  onChangeReq: (next: WhatIfRequest) => void;
  onRunWhatIf: (overrideReq?: WhatIfRequest) => void;
}

export const WhatIfPanel: React.FC<WhatIfPanelProps> = ({
  racks,
  whatIfReq,
  whatIfResult,
  whatIfLoading,
  onChangeReq,
  onRunWhatIf,
}) => {
  const rowIds = Array.from(new Set(racks.map((r) => r.row_id))).sort();
  const liquidRow =
    racks.find((r) => r.cooling_type === 'hybrid_liquid')?.row_id || rowIds[rowIds.length - 1] || 'ROW-A';
  const airRow = racks.find((r) => r.cooling_type === 'air')?.row_id || rowIds[0] || 'ROW-A';

  return (
    <div className="space-y-4">
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
            <Play className="w-3.5 h-3.5 text-cyan-400" /> Counterfactual "What-If" Sandbox
          </h3>
          <span className="text-[10px] font-mono text-slate-400">Non-destructive clone</span>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => {
              const preset: WhatIfRequest = {
                name: `+160 kW High-Density AI Expansion in ${liquidRow}`,
                target_row: liquidRow,
                add_gpu_load_kw: 160,
                convert_air_to_liquid: false,
                crac_failure_id: null,
                cdu_pump_degradation_pct: 0,
                chiller_supply_delta_c: 0,
                crac_setpoint_c: null,
                cdu_setpoint_c: 22.0,
                ambient_wetbulb_c: null,
                workload_rebalance: false,
              };
              onChangeReq(preset);
              onRunWhatIf(preset);
            }}
            className="text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-cyan-300 font-medium"
          >
            🚀 +160kW AI Load ({liquidRow})
          </button>
          <button
            onClick={() => {
              const preset: WhatIfRequest = {
                name: `Retrofit ${airRow} Air Racks to Direct-to-Chip Liquid`,
                target_row: airRow,
                add_gpu_load_kw: 80,
                convert_air_to_liquid: true,
                crac_failure_id: null,
                cdu_pump_degradation_pct: 0,
                chiller_supply_delta_c: 0,
                crac_setpoint_c: 20.5,
                cdu_setpoint_c: 25.0,
                ambient_wetbulb_c: null,
                workload_rebalance: false,
              };
              onChangeReq(preset);
              onRunWhatIf(preset);
            }}
            className="text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-emerald-300 font-medium"
          >
            💧 Retrofit {airRow} to Liquid +80kW
          </button>
        </div>

        <div className="space-y-2.5 text-xs pt-1">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Target Row</span>
            <select
              value={whatIfReq.target_row}
              onChange={(e) => onChangeReq({ ...whatIfReq, target_row: e.target.value })}
              className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white"
            >
              {rowIds.map((rid) => {
                const sampleRack = racks.find((r) => r.row_id === rid);
                const modeLabel = sampleRack?.cooling_type === 'hybrid_liquid' ? 'Liquid' : 'Air';
                return (
                  <option key={rid} value={rid}>
                    {rid} ({modeLabel})
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <div className="flex justify-between font-mono text-[11px]">
              <span className="text-slate-400">Add / Remove Row IT Load</span>
              <span className="text-cyan-300 font-bold">
                {whatIfReq.add_gpu_load_kw >= 0
                  ? `+${whatIfReq.add_gpu_load_kw}`
                  : whatIfReq.add_gpu_load_kw}{' '}
                kW
              </span>
            </div>
            <input
              type="range"
              min={-80}
              max={240}
              step={20}
              value={whatIfReq.add_gpu_load_kw}
              onChange={(e) =>
                onChangeReq({ ...whatIfReq, add_gpu_load_kw: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 mt-1"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono text-[11px]">
              <span className="text-slate-400">CDU Liquid Supply Setpoint</span>
              <span className="text-white">{(whatIfReq.cdu_setpoint_c ?? 24).toFixed(1)}°C</span>
            </div>
            <input
              type="range"
              min={19}
              max={28}
              step={0.5}
              value={whatIfReq.cdu_setpoint_c ?? 24}
              onChange={(e) =>
                onChangeReq({ ...whatIfReq, cdu_setpoint_c: parseFloat(e.target.value) })
              }
              className="w-full accent-cyan-400 mt-1"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={whatIfReq.convert_air_to_liquid}
                onChange={(e) =>
                  onChangeReq({ ...whatIfReq, convert_air_to_liquid: e.target.checked })
                }
                className="accent-cyan-400"
              />
              <span>Convert Target Row to Direct Liquid Cooling</span>
            </label>
          </div>

          <button
            onClick={() => onRunWhatIf()}
            disabled={whatIfLoading}
            className="w-full py-2 mt-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all"
          >
            {whatIfLoading
              ? 'Solving Coupled Electro-Thermal State...'
              : 'Run Counterfactual Simulation'}
          </button>
        </div>
      </div>

      {whatIfResult && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white">{whatIfResult.scenario_name}</span>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold ${
                whatIfResult.risk_level === 'critical'
                  ? 'bg-red-950 text-red-300 border border-red-500/60'
                  : whatIfResult.risk_level === 'warning'
                  ? 'bg-amber-950 text-amber-300 border border-amber-500/60'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-500/60'
              }`}
            >
              Risk: {whatIfResult.risk_level}
            </span>
          </div>

          <p className="text-[11px] text-slate-300 leading-relaxed">{whatIfResult.summary}</p>

          <div className="space-y-1.5">
            {whatIfResult.metrics_comparison.map((mc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs font-mono bg-slate-950/75 px-2.5 py-1.5 rounded border border-slate-800/80"
              >
                <span className="text-slate-400 font-sans">{mc.metric}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{mc.baseline}</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-white font-bold">
                    {mc.projected} {mc.unit === 'ratio' ? '' : mc.unit}
                  </span>
                  <span
                    className={`text-[10px] px-1 rounded ${
                      mc.delta === 0
                        ? 'text-slate-500'
                        : (mc.better_when === 'lower' && mc.delta < 0) ||
                          (mc.better_when === 'higher' && mc.delta > 0)
                        ? 'bg-emerald-950 text-emerald-300'
                        : 'bg-amber-950 text-amber-300'
                    }`}
                  >
                    {mc.delta > 0 ? `+${mc.delta}` : mc.delta}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
