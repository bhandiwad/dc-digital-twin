import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  AnomalyEvent,
  EnergyGridManagementState,
  OptimizationRecommendation,
} from '../../types';

export interface OverviewOptimizePanelProps {
  optimization: OptimizationRecommendation;
  anomalies: AnomalyEvent[];
  onApplyOptimization: () => void;
  onToggleAutoPilot: (enable: boolean) => void;
  onSelectRackAnomaly: (rackId: string) => void;
}

export const OverviewOptimizePanel: React.FC<OverviewOptimizePanelProps> = ({
  optimization,
  anomalies,
  onApplyOptimization,
  onToggleAutoPilot,
  onSelectRackAnomaly,
}) => {
  const [energyState, setEnergyState] = useState<EnergyGridManagementState | null>(null);
  const [bessEnabled, setBessEnabled] = useState<boolean>(true);
  const [precoolEnabled, setPrecoolEnabled] = useState<boolean>(true);
  const [drEvent, setDrEvent] = useState<boolean>(false);
  const [showActionsDetail, setShowActionsDetail] = useState<boolean>(false);
  const [showSchedule, setShowSchedule] = useState<boolean>(false);

  useEffect(() => {
    const loadGrid = async () => {
      try {
        const res = await fetch('/api/energy/grid');
        if (res.ok) setEnergyState(await res.json());
      } catch (e) {
        console.error(e);
      }
    };
    loadGrid();
    const timer = window.setInterval(loadGrid, 4000);
    return () => clearInterval(timer);
  }, []);

  const updateDispatch = async (nextBess: boolean, nextPrecool: boolean, nextDr: boolean) => {
    setBessEnabled(nextBess);
    setPrecoolEnabled(nextPrecool);
    setDrEvent(nextDr);
    try {
      const res = await fetch('/api/energy/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bess_peak_shaving_enabled: nextBess,
          thermal_precool_enabled: nextPrecool,
          simulate_grid_dr_event: nextDr,
          target_grid_cap_kw: 1220.0,
        }),
      });
      if (res.ok) setEnergyState(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const isAutoPilot = optimization.auto_pilot_active;

  return (
    <div className="space-y-4">
      {/* 1. Active Alerts (Calm when clear, prominent when active) */}
      {anomalies.length === 0 ? (
        <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3.5 py-2.5 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>All rows and cooling loops are operating within safe ASHRAE limits.</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-amber-400 flex items-center gap-1.5 px-0.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>
              {anomalies.length} Active Facility {anomalies.length === 1 ? 'Alert' : 'Alerts'}
            </span>
          </div>
          {anomalies.map((anom) => (
            <div
              key={anom.id}
              onClick={() => {
                if (anom.component_type === 'rack') onSelectRackAnomaly(anom.component_id);
              }}
              className={`cursor-pointer rounded-xl border p-3.5 space-y-1.5 transition-colors ${
                anom.severity === 'critical'
                  ? 'bg-red-950/35 border-red-500/50 hover:border-red-400'
                  : 'bg-amber-950/25 border-amber-500/40 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-white">{anom.title}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-900 text-amber-300 font-medium shrink-0">
                  {anom.component_id}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{anom.description}</p>
              <div className="text-xs text-sky-300 pt-0.5">
                <strong>Recommended fix:</strong> {anom.recommended_action}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Cooling Optimization & Closed-Loop Auto-Pilot Status */}
      <div
        className={`rounded-xl p-4 space-y-3.5 border transition-colors ${
          isAutoPilot
            ? 'bg-emerald-950/20 border-emerald-500/35'
            : 'bg-slate-900/60 border-slate-800'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Sparkles
              className={`w-4 h-4 mt-0.5 shrink-0 ${
                isAutoPilot ? 'text-emerald-400' : 'text-sky-400'
              }`}
            />
            <div>
              <h3 className="text-sm font-semibold text-white">
                {isAutoPilot ? 'Auto-Pilot Active (Closed-Loop)' : 'Cooling Optimization'}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isAutoPilot
                  ? 'BACnet Priority 8 supervisory control is actively trimming fans, pumps & supply temps.'
                  : 'Manual BMS Mode (Priority 16) — cooling units are running fixed conservative setpoints.'}
              </p>
            </div>
          </div>
          <span
            className={`text-xs font-semibold tabular-nums px-2.5 py-0.5 rounded-full shrink-0 ${
              isAutoPilot
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-sky-500/15 text-sky-300'
            }`}
          >
            {isAutoPilot
              ? `Saving ${optimization.power_saved_kw.toFixed(0)} kW`
              : `Save ${optimization.power_saved_kw.toFixed(0)} kW`}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2.5 tabular-nums">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">{isAutoPilot ? 'Active PUE' : 'PUE'}</div>
            <div className="text-sm font-semibold text-white mt-0.5">
              {isAutoPilot ? (
                <span className="text-emerald-400">{optimization.current_pue.toFixed(2)}</span>
              ) : (
                <>
                  {optimization.current_pue.toFixed(2)}{' '}
                  <span className="text-emerald-400">
                    → {optimization.projected_pue.toFixed(2)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">
              {isAutoPilot ? 'Run-Rate Saved' : 'Est. Savings'}
            </div>
            <div className="text-sm font-semibold text-sky-400 mt-0.5">
              ${optimization.annual_cost_savings_usd.toLocaleString()}/yr
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">Safety Margin</div>
            <div className="text-sm font-semibold text-emerald-400 mt-0.5">
              +{optimization.thermal_safety_margin_c.toFixed(1)}°C
            </div>
          </div>
        </div>

        {isAutoPilot ? (
          <button
            onClick={() => onToggleAutoPilot(false)}
            className="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            <span>Pause Auto-Pilot (Revert to Manual BMS)</span>
          </button>
        ) : (
          <button
            onClick={onApplyOptimization}
            className="w-full py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors"
          >
            Enable Auto-Pilot & Apply Setpoints ({optimization.actions.length})
          </button>
        )}

        {optimization.actions.length > 0 && (
          <div>
            <button
              onClick={() => setShowActionsDetail(!showActionsDetail)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 pt-0.5"
            >
              <span>
                {isAutoPilot
                  ? `View ${optimization.actions.length} active BACnet Priority 8 overrides`
                  : `View ${optimization.actions.length} proposed setpoint adjustments`}
              </span>
              {showActionsDetail ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showActionsDetail && (
              <div className="space-y-2 mt-2.5">
                {optimization.actions.map((act, i) => (
                  <div
                    key={i}
                    className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between tabular-nums">
                      <span className="font-medium text-slate-200">
                        {act.target_id} · {act.parameter}
                      </span>
                      <span className="font-semibold text-emerald-400">
                        {act.current_value}
                        {act.unit} → {act.recommended_value}
                        {act.unit}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{act.rationale}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Utility Rate & UPS Battery Peak Shaving */}
      {energyState && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BatteryCharging className="w-4 h-4 text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold text-white">Grid & Peak Shaving</h3>
                <div className="text-[11px] text-slate-400 tabular-nums">
                  {energyState.current_tariff_tier.replace(/_/g, ' ')} · $
                  {energyState.current_price_usd_per_kwh.toFixed(3)}/kWh
                </div>
              </div>
            </div>
            <div className="text-right tabular-nums">
              <div className="text-[11px] text-slate-400">Peak Shaved</div>
              <div className="text-sm font-semibold text-emerald-400">
                -{energyState.peak_demand_shaved_kw.toFixed(0)} kW
              </div>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <label className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 cursor-pointer">
              <div>
                <div className="font-medium text-slate-200">UPS Battery Peak Shaving</div>
                <div className="text-[11px] text-slate-400 tabular-nums">
                  Discharging {energyState.bess_dispatch_kw.toFixed(0)} kW · Battery{' '}
                  {energyState.ups_a_soc_pct}%
                </div>
              </div>
              <input
                type="checkbox"
                checked={bessEnabled}
                onChange={(e) => updateDispatch(e.target.checked, precoolEnabled, drEvent)}
                className="accent-sky-500 w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 cursor-pointer">
              <div>
                <div className="font-medium text-slate-200">Chilled-Water Pre-Cooling</div>
                <div className="text-[11px] text-slate-400 tabular-nums">
                  Pre-cools hall ahead of peak utility hours (Buffer{' '}
                  {energyState.chilled_water_buffer_soc_pct}%)
                </div>
              </div>
              <input
                type="checkbox"
                checked={precoolEnabled}
                onChange={(e) => updateDispatch(bessEnabled, e.target.checked, drEvent)}
                className="accent-sky-500 w-4 h-4"
              />
            </label>

            <label className="flex items-center justify-between bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 cursor-pointer">
              <div>
                <div className="font-medium text-slate-200">Simulate Utility Peak Event</div>
                <div className="text-[11px] text-slate-400">
                  Test critical-peak $0.285/kWh grid pricing
                </div>
              </div>
              <input
                type="checkbox"
                checked={drEvent}
                onChange={(e) => updateDispatch(bessEnabled, precoolEnabled, e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
            </label>
          </div>

          <button
            onClick={() => setShowSchedule(!showSchedule)}
            className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200"
          >
            <span>Power breakdown & 24h tariff schedule</span>
            {showSchedule ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showSchedule && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                {Object.entries(energyState.power_breakdown_kw).map(([label, kw]) => {
                  const pct = Math.min(
                    100,
                    (kw / Math.max(energyState.current_grid_import_kw, 1)) * 100
                  );
                  return (
                    <div key={label} className="space-y-1 text-xs tabular-nums">
                      <div className="flex justify-between text-slate-300">
                        <span>{label}</span>
                        <span className="font-medium text-white">{kw.toFixed(0)} kW</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="max-h-[150px] overflow-y-auto space-y-1 text-[11px] tabular-nums">
                {energyState.schedule_24h.map((slot) => (
                  <div
                    key={slot.hour_label}
                    className="flex items-center justify-between bg-slate-950/60 border border-slate-800/70 rounded-md px-2.5 py-1.5"
                  >
                    <span className="font-medium text-slate-200">{slot.hour_label}</span>
                    <span className="text-slate-400">${slot.price_usd_per_kwh.toFixed(3)}/kWh</span>
                    <span className="text-sky-400 font-medium">
                      {slot.baseline_grid_draw_kw.toFixed(0)} →{' '}
                      {slot.optimized_grid_draw_kw.toFixed(0)} kW
                    </span>
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
