import React, { useEffect, useState } from 'react';
import { Server, Sliders } from 'lucide-react';
import { TwinStateSnapshot } from '../../types';
import { RackElevation42U } from '../RackElevation42U';

export interface ControlsInspectorPanelProps {
  snapshot: TwinStateSnapshot;
  selectedId: string;
  selectedType: 'rack' | 'crac' | 'cdu' | 'pdu';
  onSyncTwin: () => void;
  onUpdateControl: (payload: Record<string, unknown>) => void;
}

export const ControlsInspectorPanel: React.FC<ControlsInspectorPanelProps> = ({
  snapshot,
  selectedId,
  selectedType,
  onSyncTwin,
  onUpdateControl,
}) => {
  const [mode, setMode] = useState<'asset' | 'controls'>(
    selectedType === 'rack' ? 'asset' : 'controls'
  );

  useEffect(() => {
    setMode(selectedType === 'rack' ? 'asset' : 'controls');
  }, [selectedId, selectedType]);

  const selectedRack = snapshot.racks.find((r) => r.rack_id === selectedId) || snapshot.racks[0];
  const selectedCrac = snapshot.cracs.find((c) => c.crac_id === selectedId);
  const selectedCdu = snapshot.cdus.find((c) => c.cdu_id === selectedId);
  const selectedPdu = snapshot.pdus.find((p) => p.pdu_id === selectedId);

  return (
    <div className="space-y-4">
      {/* Clean 2-Way Segmented Switch */}
      <div className="grid grid-cols-2 bg-slate-900/80 border border-slate-800 rounded-lg p-1 gap-1">
        <button
          onClick={() => setMode('asset')}
          className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            mode === 'asset'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          <span>Rack 42U View ({selectedRack?.rack_id})</span>
        </button>
        <button
          onClick={() => setMode('controls')}
          className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            mode === 'controls'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Cooling Setpoints</span>
        </button>
      </div>

      {mode === 'asset' && selectedRack ? (
        <div className="space-y-3.5">
          {/* Selected Rack Clean Header */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-slate-400">
                  {selectedRack.row_id} ·{' '}
                  {selectedRack.cooling_type === 'hybrid_liquid' ? 'Liquid Cooled' : 'Air Cooled'}
                </div>
                <h3 className="text-sm font-semibold text-white mt-0.5">{selectedRack.name}</h3>
              </div>
              <span
                className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium capitalize ${
                  selectedRack.status === 'critical'
                    ? 'bg-red-500/15 text-red-300'
                    : selectedRack.status === 'warning'
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'bg-emerald-500/15 text-emerald-300'
                }`}
              >
                {selectedRack.status}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 tabular-nums">
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-slate-400">Rack Power</div>
                <div className="text-sm font-semibold text-white mt-0.5">
                  {selectedRack.power_kw.toFixed(1)} kW
                </div>
              </div>
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-slate-400">Cold Inlet</div>
                <div
                  className={`text-sm font-semibold mt-0.5 ${
                    selectedRack.inlet_temp_c >= 27 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                >
                  {selectedRack.inlet_temp_c.toFixed(1)}°C
                </div>
              </div>
              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
                <div className="text-[11px] text-slate-400">15m Forecast</div>
                <div className="text-sm font-semibold text-sky-400 mt-0.5">
                  {selectedRack.predicted_inlet_15m_c.toFixed(1)}°C
                </div>
              </div>
            </div>
          </div>

          <RackElevation42U rackId={selectedRack.rack_id} onSyncTwin={onSyncTwin} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Highlighted Plant Unit Card if a CRAC/CDU/PDU was clicked in 3D */}
          {(selectedCrac || selectedCdu || selectedPdu) && (
            <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3.5 text-xs space-y-1.5 tabular-nums">
              <div className="text-[11px] font-medium text-sky-400">Selected on Floor</div>
              <div className="text-sm font-semibold text-white">{selectedId}</div>
              {selectedCrac && (
                <div className="text-slate-300">
                  Supply {selectedCrac.supply_air_temp_c.toFixed(1)}°C · Return{' '}
                  {selectedCrac.return_air_temp_c.toFixed(1)}°C · {selectedCrac.airflow_cfm.toFixed(0)} CFM
                </div>
              )}
              {selectedCdu && (
                <div className="text-slate-300">
                  Supply {selectedCdu.supply_temp_c.toFixed(1)}°C → Return{' '}
                  {selectedCdu.return_temp_c.toFixed(1)}°C · {selectedCdu.total_flow_lpm.toFixed(0)} LPM
                </div>
              )}
              {selectedPdu && (
                <div className="text-slate-300">
                  Load {selectedPdu.current_load_kw.toFixed(1)} / {selectedPdu.rated_capacity_kw} kW (
                  {selectedPdu.load_pct}%) · Fed by {selectedPdu.ups_id}
                </div>
              )}
            </div>
          )}

          {/* Liquid CDUs */}
          {snapshot.cdus.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs px-0.5">
                <span className="font-semibold text-slate-200">Liquid Cooling Units (CDU)</span>
                <span className="text-slate-400 tabular-nums">
                  Outdoor Wet-Bulb: {snapshot.facility.outdoor_wetbulb_c.toFixed(1)}°C
                </span>
              </div>
              {snapshot.cdus.map((cdu) => (
                <div
                  key={cdu.cdu_id}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">{cdu.name}</span>
                    <span className="text-slate-400 tabular-nums">
                      {cdu.thermal_load_kw.toFixed(0)} kW · {cdu.total_flow_lpm.toFixed(0)} LPM
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Supply Temp</span>
                        <span className="font-medium text-white">
                          {cdu.supply_temp_setpoint_c.toFixed(1)}°C
                        </span>
                      </div>
                      <input
                        type="range"
                        min={19}
                        max={28}
                        step={0.5}
                        value={cdu.supply_temp_setpoint_c}
                        onChange={(e) =>
                          onUpdateControl({
                            cdu_id: cdu.cdu_id,
                            cdu_supply_temp_c: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1">
                        <span>Pump Speed</span>
                        <span className="font-medium text-white">{cdu.pump_speed_pct.toFixed(0)}%</span>
                      </div>
                      <input
                        type="range"
                        min={40}
                        max={100}
                        step={2}
                        value={cdu.pump_speed_pct}
                        onChange={(e) =>
                          onUpdateControl({
                            cdu_id: cdu.cdu_id,
                            cdu_pump_speed_pct: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-sky-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Air CRACs */}
          <div className="space-y-2.5">
            <div className="text-xs font-semibold text-slate-200 px-0.5">
              Perimeter Air Units (CRAC)
            </div>
            {snapshot.cracs.map((crac) => (
              <div
                key={crac.crac_id}
                className="bg-slate-900/60 border border-slate-800 rounded-xl p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white">
                    {crac.crac_id}{' '}
                    <span className="font-normal text-slate-400">
                      ({crac.served_rows.join(', ')})
                    </span>
                  </span>
                  <button
                    onClick={() =>
                      onUpdateControl({
                        crac_id: crac.crac_id,
                        crac_enabled: !crac.enabled,
                        crac_fan_speed_pct: !crac.enabled ? 75 : 0,
                      })
                    }
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                      crac.enabled
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-red-500/15 text-red-300'
                    }`}
                  >
                    {crac.enabled ? 'Online' : 'Offline'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs tabular-nums">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Air Setpoint</span>
                      <span className="font-medium text-white">
                        {crac.supply_air_setpoint_c.toFixed(1)}°C
                      </span>
                    </div>
                    <input
                      type="range"
                      min={15}
                      max={22}
                      step={0.5}
                      value={crac.supply_air_setpoint_c}
                      onChange={(e) =>
                        onUpdateControl({
                          crac_id: crac.crac_id,
                          crac_supply_temp_c: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>Fan Speed</span>
                      <span className="font-medium text-white">{crac.fan_speed_pct.toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={35}
                      max={100}
                      step={5}
                      value={crac.fan_speed_pct}
                      onChange={(e) =>
                        onUpdateControl({
                          crac_id: crac.crac_id,
                          crac_fan_speed_pct: parseFloat(e.target.value),
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
