import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Droplets,
  Flame,
  Gauge,
  RotateCcw,
  Server,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { RackElevationResponse, ServerNodeTelemetry } from '../types';

export const RackElevation42U: React.FC<{
  rackId: string;
  onSyncTwin?: () => void;
}> = ({ rackId, onSyncTwin }) => {
  const [elevation, setElevation] = useState<RackElevationResponse | null>(null);
  const [selectedNode, setSelectedNode] = useState<ServerNodeTelemetry | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const fetchElevation = async (targetRack: string) => {
    try {
      const res = await fetch(`/api/rack/${targetRack}/elevation`);
      if (res.ok) {
        const data: RackElevationResponse = await res.json();
        setElevation(data);
        setSelectedNode((prev) => {
          if (prev && prev.rack_id === targetRack) {
            return data.nodes.find((n) => n.node_id === prev.node_id) || data.nodes[2] || data.nodes[0];
          }
          return data.nodes[2] || data.nodes[0];
        });
      }
    } catch (e) {
      console.error('Failed to fetch 42U elevation:', e);
    }
  };

  useEffect(() => {
    fetchElevation(rackId);
    const timer = window.setInterval(() => fetchElevation(rackId), 2000);
    return () => clearInterval(timer);
  }, [rackId]);

  const triggerBladeAction = async (nodeId: string, action: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/rack/blade-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rack_id: rackId,
          node_id: nodeId,
          action,
        }),
      });
      if (res.ok) {
        const data: RackElevationResponse = await res.json();
        setElevation(data);
        const updated = data.nodes.find((n) => n.node_id === nodeId);
        if (updated) setSelectedNode(updated);
        if (onSyncTwin) onSyncTwin();
      }
    } finally {
      setLoading(false);
    }
  };

  if (!elevation) {
    return (
      <div className="p-4 text-xs font-mono text-slate-400">
        Loading 42U Chassis Elevation for {rackId}...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header Summary Card */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              42U Elevation Diagram
            </span>
            <span className="text-xs font-mono font-bold text-white">{elevation.rack.rack_id}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {elevation.occupied_u}/42U Populated • {elevation.total_blade_power_kw.toFixed(1)} kW Total • Peak Blade{' '}
            <span
              className={
                elevation.max_blade_temp_c >= 74 ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'
              }
            >
              {elevation.max_blade_temp_c.toFixed(1)}°C
            </span>
          </div>
        </div>
        {elevation.manifold_supply_c && (
          <div className="text-right font-mono text-[10px] bg-cyan-950/60 border border-cyan-500/40 rounded-lg px-2.5 py-1 text-cyan-200">
            <div>💧 Manifold Supply: {elevation.manifold_supply_c.toFixed(1)}°C</div>
            <div>Return: {elevation.manifold_return_c?.toFixed(1)}°C</div>
          </div>
        )}
      </div>

      {/* Visual 42U Rack Cabinet Stack */}
      <div className="bg-[#070d19] border-2 border-slate-700/90 rounded-xl p-2 shadow-inner space-y-1">
        <div className="flex justify-between items-center px-2 py-0.5 text-[9px] font-mono uppercase text-slate-400 border-b border-slate-800">
          <span>U-Slot</span>
          <span>Chassis / Server Blade</span>
          <span>Power / Peak Temp</span>
        </div>

        <div className="space-y-1 max-h-[290px] overflow-y-auto pr-1">
          {elevation.nodes.map((node) => {
            const isSelected = selectedNode?.node_id === node.node_id;
            const peakT = node.gpu_max_temp_c ?? node.cpu_temp_c;
            const uEnd = node.u_start + node.u_height - 1;

            let bgClass = 'bg-slate-900/90 border-slate-700/80 hover:border-cyan-500/60';
            if (node.status === 'critical') {
              bgClass = 'bg-red-950/75 border-red-500 animate-pulse';
            } else if (node.status === 'warning') {
              bgClass = 'bg-amber-950/70 border-amber-500/80';
            } else if (node.chassis_type === 'liquid_manifold') {
              bgClass = 'bg-cyan-950/75 border-cyan-500/70';
            } else if (node.chassis_type === 'nvlink_fabric' || node.chassis_type === 'tor_switch') {
              bgClass = 'bg-indigo-950/65 border-indigo-500/50';
            }

            return (
              <div
                key={node.node_id}
                onClick={() => setSelectedNode(node)}
                className={`cursor-pointer rounded-lg border px-2.5 py-1.5 transition-all flex items-center justify-between ${bgClass} ${
                  isSelected ? 'ring-2 ring-cyan-400 border-cyan-300' : ''
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-slate-400 w-12 shrink-0">
                    U{node.u_start.toString().padStart(2, '0')}–{uEnd.toString().padStart(2, '0')}
                  </span>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                      <span>{node.name}</span>
                      {node.fault_injected && (
                        <span className="text-[9px] font-mono px-1 rounded bg-red-500/30 text-red-200 border border-red-400">
                          FAULT
                        </span>
                      )}
                      {node.throttled && (
                        <span className="text-[9px] font-mono px-1 rounded bg-amber-500/30 text-amber-200 border border-amber-400">
                          CAP
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 flex items-center gap-2">
                      <span>{node.cooling_mode}</span>
                      {node.coolant_flow_lpm && (
                        <span className="text-cyan-300">💧 {node.coolant_flow_lpm.toFixed(1)} LPM</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right font-mono shrink-0 ml-2">
                  <div className="text-xs font-bold text-white">{node.power_kw.toFixed(1)} kW</div>
                  <div
                    className={`text-[10px] font-bold ${
                      peakT >= 75
                        ? 'text-red-400'
                        : peakT >= 68
                        ? 'text-amber-300'
                        : 'text-emerald-400'
                    }`}
                  >
                    {peakT.toFixed(1)}°C
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Blade Deep Inspector & Fault / Throttling Controls */}
      {selectedNode && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase text-cyan-400">
                Selected 42U Chassis • {selectedNode.node_id}
              </div>
              <h4 className="text-xs font-bold text-white">{selectedNode.name}</h4>
            </div>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                selectedNode.qd_valve_status.includes('RESTRICTED')
                  ? 'bg-red-950 text-red-300 border-red-500'
                  : 'bg-emerald-950/80 text-emerald-300 border-emerald-600/50'
              }`}
            >
              QD Valve: {selectedNode.qd_valve_status}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
              <div className="text-[10px] text-slate-400">Inlet / Exhaust</div>
              <div className="font-bold text-slate-200">
                {selectedNode.inlet_temp_c}° → {selectedNode.exhaust_temp_c}°C
              </div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
              <div className="text-[10px] text-slate-400">CPU / Peak GPU</div>
              <div className="font-bold text-cyan-300">
                {selectedNode.cpu_temp_c}° / {(selectedNode.gpu_max_temp_c ?? selectedNode.cpu_temp_c).toFixed(1)}°C
              </div>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2">
              <div className="text-[10px] text-slate-400">Fans / Util</div>
              <div className="font-bold text-white">
                {selectedNode.fan_rpm} RPM ({selectedNode.utilization_pct}%)
              </div>
            </div>
          </div>

          {/* Individual 8x GPU Cold-Plate Die Temperatures */}
          {selectedNode.gpu_temps_c.length > 0 && (
            <div>
              <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                {selectedNode.gpu_model} Per-Die Cold-Plate Temperatures:
              </div>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px]">
                {selectedNode.gpu_temps_c.map((gt, idx) => (
                  <div
                    key={idx}
                    className={`rounded px-2 py-1 border text-center ${
                      gt >= 75
                        ? 'bg-red-950/80 border-red-500 text-red-200 font-bold'
                        : gt >= 68
                        ? 'bg-amber-950/70 border-amber-500/70 text-amber-200'
                        : 'bg-slate-950 border-slate-800 text-cyan-300'
                    }`}
                  >
                    GPU{idx}: {gt.toFixed(1)}°C
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Blade-Level Fault Injection & Power Capping Controls */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] font-mono uppercase text-slate-400">
              Blade-Level Fault Injection & Mitigation:
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                disabled={loading}
                onClick={() => triggerBladeAction(selectedNode.node_id, 'inject_qd_restriction')}
                className="px-2.5 py-1.5 rounded-lg bg-red-950/70 hover:bg-red-900/80 border border-red-500/60 text-red-200 text-[11px] font-medium flex items-center justify-center gap-1"
              >
                <Droplets className="w-3.5 h-3.5" /> Restrict Liquid QD Valve
              </button>
              <button
                disabled={loading}
                onClick={() => triggerBladeAction(selectedNode.node_id, 'inject_workload_spike')}
                className="px-2.5 py-1.5 rounded-lg bg-amber-950/70 hover:bg-amber-900/80 border border-amber-500/60 text-amber-200 text-[11px] font-medium flex items-center justify-center gap-1"
              >
                <Flame className="w-3.5 h-3.5" /> 100% TDP Burn-In Spike
              </button>
              <button
                disabled={loading}
                onClick={() => triggerBladeAction(selectedNode.node_id, 'cap_power_80')}
                className="px-2.5 py-1.5 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-500/60 text-cyan-200 text-[11px] font-medium flex items-center justify-center gap-1"
              >
                <Zap className="w-3.5 h-3.5" /> Apply 80% DVFS Power Cap
              </button>
              <button
                disabled={loading}
                onClick={() => triggerBladeAction(selectedNode.node_id, 'clear_fault')}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restore Nominal Blade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
