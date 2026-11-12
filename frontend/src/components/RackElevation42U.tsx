import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Droplets, Flame, RotateCcw } from 'lucide-react';
import { RackElevationResponse, ServerNodeTelemetry } from '../types';

export const RackElevation42U: React.FC<{
  rackId: string;
  onSyncTwin?: () => void;
}> = ({ rackId, onSyncTwin }) => {
  const [elevation, setElevation] = useState<RackElevationResponse | null>(null);
  const [selectedNode, setSelectedNode] = useState<ServerNodeTelemetry | null>(null);
  const [showSimTools, setShowSimTools] = useState<boolean>(false);
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
    const timer = window.setInterval(() => fetchElevation(rackId), 2500);
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
      <div className="p-4 text-xs text-slate-400">Loading rack elevation for {rackId}...</div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Clean Rack Summary */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-0.5">
        <span>
          {elevation.occupied_u}/42U occupied ·{' '}
          <strong className="text-slate-200 tabular-nums">
            {elevation.total_blade_power_kw.toFixed(1)} kW
          </strong>
        </span>
        {elevation.manifold_supply_c && (
          <span className="text-sky-400 tabular-nums">
            Manifold {elevation.manifold_supply_c.toFixed(1)}°C → {elevation.manifold_return_c?.toFixed(1)}°C
          </span>
        )}
      </div>

      {/* Clean 42U Rack Slot List */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-2 space-y-1 max-h-[290px] overflow-y-auto">
        {elevation.nodes.map((node) => {
          const isSelected = selectedNode?.node_id === node.node_id;
          const peakT = node.gpu_max_temp_c ?? node.cpu_temp_c;
          const uEnd = node.u_start + node.u_height - 1;

          return (
            <div
              key={node.node_id}
              onClick={() => setSelectedNode(node)}
              className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors flex items-center justify-between ${
                node.status === 'critical'
                  ? 'bg-red-950/40 border-red-500/60'
                  : isSelected
                  ? 'bg-slate-800/90 border-sky-500/70'
                  : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] tabular-nums text-slate-500 w-12 shrink-0">
                  U{node.u_start.toString().padStart(2, '0')}–{uEnd.toString().padStart(2, '0')}
                </span>
                <div className="truncate">
                  <div className="text-xs font-medium text-slate-100 truncate flex items-center gap-1.5">
                    <span>{node.name}</span>
                    {node.fault_injected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-medium">
                        Fault
                      </span>
                    )}
                  </div>
                  {node.coolant_flow_lpm && (
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      Coolant flow: {node.coolant_flow_lpm.toFixed(1)} LPM
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right tabular-nums shrink-0 ml-2">
                <div className="text-xs font-semibold text-slate-100">{node.power_kw.toFixed(1)} kW</div>
                <div
                  className={`text-[11px] ${
                    peakT >= 75
                      ? 'text-red-400 font-semibold'
                      : peakT >= 68
                      ? 'text-amber-400'
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

      {/* Selected Slot Summary + Optional Fault Test Accordion */}
      {selectedNode && (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-slate-400">Selected Slot · {selectedNode.node_id}</div>
              <div className="text-xs font-semibold text-white">{selectedNode.name}</div>
            </div>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                selectedNode.qd_valve_status.includes('RESTRICTED')
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-emerald-500/15 text-emerald-300'
              }`}
            >
              Valve: {selectedNode.qd_valve_status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg px-2.5 py-2">
              <div className="text-[11px] text-slate-400">Air Inlet → Exhaust</div>
              <div className="font-semibold text-slate-100 mt-0.5">
                {selectedNode.inlet_temp_c}°C → {selectedNode.exhaust_temp_c}°C
              </div>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg px-2.5 py-2">
              <div className="text-[11px] text-slate-400">Thermal Proxy</div>
              <div className="font-semibold text-sky-400 mt-0.5">
                {(selectedNode.gpu_max_temp_c ?? selectedNode.cpu_temp_c).toFixed(1)}°C
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowSimTools(!showSimTools)}
            className="w-full flex items-center justify-between text-[11px] font-medium text-slate-400 hover:text-slate-200 pt-1"
          >
            <span>Simulate manifold / thermal fault on this slot</span>
            {showSimTools ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showSimTools && (
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                disabled={loading}
                onClick={() => triggerBladeAction(selectedNode.node_id, 'inject_qd_restriction')}
                className="px-2 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-red-300 text-[11px] font-medium flex items-center justify-center gap-1"
              >
                <Droplets className="w-3 h-3" /> Valve Clog
              </button>
              <button
                disabled={loading}
                onClick={() => triggerBladeAction(selectedNode.node_id, 'inject_workload_spike')}
                className="px-2 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-amber-300 text-[11px] font-medium flex items-center justify-center gap-1"
              >
                <Flame className="w-3 h-3" /> Heat Spike
              </button>
              <button
                disabled={loading}
                onClick={() => triggerBladeAction(selectedNode.node_id, 'clear_fault')}
                className="px-2 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
