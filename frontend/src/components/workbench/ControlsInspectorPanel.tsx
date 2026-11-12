import React from 'react';
import { Wind } from 'lucide-react';
import { TwinStateSnapshot } from '../../types';

export interface ControlsInspectorPanelProps {
  snapshot: TwinStateSnapshot;
  selectedId: string;
  selectedType: 'rack' | 'crac' | 'cdu' | 'pdu';
  onOpenElevation42U: () => void;
  onUpdateControl: (payload: Record<string, unknown>) => void;
}

export const ControlsInspectorPanel: React.FC<ControlsInspectorPanelProps> = ({
  snapshot,
  selectedId,
  selectedType,
  onOpenElevation42U,
  onUpdateControl,
}) => {
  const selectedRack = snapshot.racks.find((r) => r.rack_id === selectedId) || snapshot.racks[0];
  const selectedCrac = snapshot.cracs.find((c) => c.crac_id === selectedId);
  const selectedCdu = snapshot.cdus.find((c) => c.cdu_id === selectedId);
  const selectedPdu = snapshot.pdus.find((p) => p.pdu_id === selectedId);

  return (
    <div className="space-y-4">
      {selectedType === 'rack' && selectedRack && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                {selectedRack.row_id} •{' '}
                {selectedRack.cooling_type === 'hybrid_liquid'
                  ? 'DIRECT-TO-CHIP LIQUID'
                  : 'AIR COOLED'}
              </span>
              <h2 className="text-base font-bold text-white mt-1">{selectedRack.name}</h2>
            </div>
            <button
              onClick={onOpenElevation42U}
              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 border border-cyan-500/50 text-xs font-mono text-cyan-300 hover:bg-cyan-500/30"
            >
              Open 42U View →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 mt-3">
            <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-400 uppercase">Electrical Power</div>
              <div className="text-base font-mono font-bold text-white">
                {selectedRack.power_kw.toFixed(1)} kW{' '}
                <span className="text-xs font-normal text-slate-400">
                  / {selectedRack.max_power_kw} kW
                </span>
              </div>
              <div className="text-[10px] font-mono text-cyan-400 mt-0.5">
                Branch Load: {selectedRack.it_utilization_pct.toFixed(1)}% ({selectedRack.gpu_count} GPUs)
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-400 uppercase">Thermal Proxy / Junction</div>
              <div
                className={`text-base font-mono font-bold ${
                  selectedRack.chip_temp_c >= 72 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {selectedRack.chip_temp_c.toFixed(1)}°C
              </div>
              <div className="text-[10px] font-mono text-purple-300 mt-0.5">
                AI +15m Forecast: {selectedRack.predicted_chip_15m_c.toFixed(1)}°C
              </div>
            </div>
          </div>
        </div>
      )}

      {(selectedType === 'crac' || selectedType === 'cdu' || selectedType === 'pdu') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 text-xs space-y-2">
          <div className="font-mono text-cyan-400 uppercase">Selected Infrastructure Node</div>
          <div className="text-base font-bold text-white">{selectedId}</div>
          {selectedCrac && (
            <div className="font-mono text-slate-300 space-y-1">
              <div>
                Supply Air: {selectedCrac.supply_air_temp_c.toFixed(1)}°C (Setpoint{' '}
                {selectedCrac.supply_air_setpoint_c.toFixed(1)}°C)
              </div>
              <div>
                Return Air: {selectedCrac.return_air_temp_c.toFixed(1)}°C | Airflow:{' '}
                {selectedCrac.airflow_cfm.toFixed(0)} CFM
              </div>
              <div>
                Thermal Load: {selectedCrac.thermal_load_kw.toFixed(1)} kW | Fan Draw:{' '}
                {selectedCrac.power_kw.toFixed(1)} kW
              </div>
            </div>
          )}
          {selectedCdu && (
            <div className="font-mono text-slate-300 space-y-1">
              <div>
                Coolant Supply: {selectedCdu.supply_temp_c.toFixed(1)}°C → Return:{' '}
                {selectedCdu.return_temp_c.toFixed(1)}°C
              </div>
              <div>
                Total Flow: {selectedCdu.total_flow_lpm.toFixed(0)} LPM | Diff Pressure:{' '}
                {selectedCdu.pressure_kpa.toFixed(0)} kPa
              </div>
              <div>Liquid Heat Rejected: {selectedCdu.thermal_load_kw.toFixed(1)} kW</div>
            </div>
          )}
          {selectedPdu && (
            <div className="font-mono text-slate-300 space-y-1">
              <div>
                Load: {selectedPdu.current_load_kw.toFixed(1)} kW /{' '}
                {selectedPdu.rated_capacity_kw} kW ({selectedPdu.load_pct}%)
              </div>
              <div>
                Upstream UPS: {selectedPdu.ups_id} | Loss: {selectedPdu.loss_kw.toFixed(1)} kW
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live Cooling Plant Controls */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Wind className="w-3.5 h-3.5 text-cyan-400" /> Live Cooling Plant Controls (BACnet Pri 8)
          </h3>
          <span className="text-[10px] font-mono text-slate-400">
            Wet-Bulb: {snapshot.facility.outdoor_wetbulb_c.toFixed(1)}°C
          </span>
        </div>

        {/* Liquid CDUs */}
        <div className="space-y-2">
          {snapshot.cdus.map((cdu) => (
            <div
              key={cdu.cdu_id}
              className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-cyan-300">{cdu.name}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {cdu.thermal_load_kw.toFixed(0)} kW | {cdu.total_flow_lpm.toFixed(0)} LPM
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="flex justify-between font-mono text-slate-400">
                    <span>Supply Setpoint</span>
                    <span className="text-white">{cdu.supply_temp_setpoint_c.toFixed(1)}°C</span>
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
                    className="w-full accent-cyan-400 mt-1"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-mono text-slate-400">
                    <span>Pump Speed</span>
                    <span className="text-white">{cdu.pump_speed_pct.toFixed(0)}%</span>
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
                    className="w-full accent-cyan-400 mt-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Perimeter Air CRACs */}
        <div className="space-y-2">
          {snapshot.cracs.map((crac) => (
            <div
              key={crac.crac_id}
              className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-blue-300">
                  {crac.crac_id} ({crac.served_rows.join('/')})
                </span>
                <button
                  onClick={() =>
                    onUpdateControl({
                      crac_id: crac.crac_id,
                      crac_enabled: !crac.enabled,
                      crac_fan_speed_pct: !crac.enabled ? 75 : 0,
                    })
                  }
                  className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    crac.enabled
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/50'
                      : 'bg-red-950 text-red-300 border border-red-600'
                  }`}
                >
                  {crac.enabled ? 'ONLINE' : 'OFFLINE'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <div className="flex justify-between font-mono text-slate-400">
                    <span>Air Setpoint</span>
                    <span className="text-white">{crac.supply_air_setpoint_c.toFixed(1)}°C</span>
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
                    className="w-full accent-blue-400 mt-1"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-mono text-slate-400">
                    <span>VFD Fan</span>
                    <span className="text-white">{crac.fan_speed_pct.toFixed(0)}%</span>
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
                    className="w-full accent-blue-400 mt-1"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
