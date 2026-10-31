import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Award,
  Bot,
  Cable,
  CheckCircle2,
  Cpu,
  Gauge,
  Layers,
  Moon,
  Play,
  RefreshCw,
  Send,
  Server,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  Terminal,
  Wind,
} from 'lucide-react';
import {
  TwinStateSnapshot,
  OverlayMode,
  WhatIfRequest,
  WhatIfResponse,
  AgentToolCallTrace,
  AgentCopilotResponse,
} from './types';
import { DataHall3D } from './components/DataHall3D';
import { TelemetryCharts } from './components/TelemetryCharts';
import { RackElevation42U } from './components/RackElevation42U';
import { TimeSeriesReplayBar } from './components/TimeSeriesReplayBar';
import { ExecutiveROIModal } from './components/ExecutiveROIModal';
import { DataConnectorsModal } from './components/DataConnectorsModal';
import { FacilityMLSuitePanel } from './components/FacilityMLSuitePanel';

const SCENARIO_PRESETS = [
  { id: 'normal', label: 'Baseline Healthy', icon: '🟢', desc: 'Nominal AI + Cloud load' },
  { id: 'gpu_burst_row_c', label: 'Row C LLM Surge', icon: '🔥', desc: '+145 kW GPU Training Burst' },
  { id: 'crac_2_fail', label: 'CRAC-2 Blower Trip', icon: '⚠️', desc: 'Air unit failure & spillover' },
  { id: 'cdu_1_fouling', label: 'CDU-1 Loop Fouling', icon: '💧', desc: 'Liquid heat-exchanger degradation' },
  { id: 'hot_aisle_recirc', label: 'Aisle Recirculation', icon: '🌀', desc: 'Containment damper bypass' },
  { id: 'heatwave', label: 'Ambient Heatwave', icon: '☀️', desc: '28.5°C Wet-Bulb Chiller Stress' },
];

export const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<TwinStateSnapshot | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('inlet_temp');
  const [showPipes, setShowPipes] = useState<boolean>(true);
  const [showPlumes, setShowPlumes] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string>('R-C04');
  const [selectedType, setSelectedType] = useState<'rack' | 'crac' | 'cdu' | 'pdu'>('rack');
  const [activeTab, setActiveTab] = useState<
    'elevation_42u' | 'ml_suite' | 'inspector' | 'ai_analytics' | 'what_if' | 'copilot'
  >('ml_suite');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [roiModalOpen, setRoiModalOpen] = useState<boolean>(false);
  const [connectorsModalOpen, setConnectorsModalOpen] = useState<boolean>(false);
  const [ingestedDatasetId, setIngestedDatasetId] = useState<string | null>(null);
  const [lightMode, setLightMode] = useState<boolean>(false);

  useEffect(() => {
    const root = document.documentElement;
    if (lightMode) {
      root.classList.add('light-theme');
    } else {
      root.classList.remove('light-theme');
    }
  }, [lightMode]);

  // What-If Sandbox state
  const [whatIfReq, setWhatIfReq] = useState<WhatIfRequest>({
    name: 'Add +160 kW Blackwell GPU Cluster in Row C',
    target_row: 'ROW-C',
    add_gpu_load_kw: 160,
    convert_air_to_liquid: false,
    crac_failure_id: null,
    cdu_pump_degradation_pct: 0,
    chiller_supply_delta_c: 0,
    crac_setpoint_c: null,
    cdu_setpoint_c: 22.0,
    ambient_wetbulb_c: null,
    workload_rebalance: false,
  });
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResponse | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState<boolean>(false);

  // Tool-Calling Agent Copilot Chat state
  const [copilotInput, setCopilotInput] = useState<string>('');
  const [copilotLoading, setCopilotLoading] = useState<boolean>(false);
  const [llmProvider, setLlmProvider] = useState<string>('openrouter');
  const [llmModel, setLlmModel] = useState<string>('anthropic/claude-3.7-sonnet');
  const [openRouterKey, setOpenRouterKey] = useState<string>('');
  const [llmKeyConfigured, setLlmKeyConfigured] = useState<boolean>(false);
  const [showLlmSettings, setShowLlmSettings] = useState<boolean>(true);
  const [copilotMessages, setCopilotMessages] = useState<
    Array<{
      role: 'user' | 'assistant';
      text: string;
      providerUsed?: string;
      modelUsed?: string;
      toolCalls?: AgentToolCallTrace[];
      actionsTaken?: string[];
      suggestions?: string[];
    }>
  >([
    {
      role: 'assistant',
      text: "Welcome to **Pandita's Aether-DCTWIN Autonomous Tool-Calling Agent**. I have direct execution access to:\n• `inspect_facility_telemetry` & `inspect_rack_42u_elevation`\n• `query_duckdb_24h_history` (Parquet/DuckDB SQL)\n• `run_counterfactual_whatif` (Cloned physics sandbox)\n• `execute_cooling_setpoints` (Closed-loop CRAC/CDU actuation)",
      suggestions: [
        'Run OpenDT RLS self-calibration and check CDU fouling drift',
        'Generate a GraphRAG MOP checklist to isolate CDU-1 for strainer maintenance',
        'Solve 30-min Constrained MPC lookahead trajectory with safety barriers',
        'Execute remediation and optimize setpoints now',
      ],
    },
  ]);

  const fetchInitialState = useCallback(async () => {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data: TwinStateSnapshot = await res.json();
        setSnapshot(data);
      }
    } catch (err) {
      console.error('Failed to fetch initial twin state:', err);
    }
  }, []);

  useEffect(() => {
    fetchInitialState();
    fetch('/api/llm/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg.active_provider) setLlmProvider(cfg.active_provider);
        if (cfg.active_model) setLlmModel(cfg.active_model);
        setLlmKeyConfigured(Boolean(cfg.live_llm_ready));
      })
      .catch(console.error);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;

    const connectWs = () => {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsConnected(true);
      ws.onmessage = (event) => {
        try {
          const data: TwinStateSnapshot = JSON.parse(event.data);
          setSnapshot(data);
        } catch (e) {
          console.error('WS parse error', e);
        }
      };
      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimer = window.setTimeout(connectWs, 2000);
      };
    };

    connectWs();
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [fetchInitialState]);

  const triggerScenario = async (scenarioId: string) => {
    try {
      const res = await fetch('/api/scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
        if (scenarioId !== 'normal') {
          setActiveTab('ai_analytics');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const applyAiOptimization = async () => {
    try {
      const res = await fetch('/api/apply-optimization', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateControl = async (payload: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/controls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSnapshot(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const runWhatIf = async (customReq?: WhatIfRequest) => {
    const payload = customReq || whatIfReq;
    setWhatIfLoading(true);
    try {
      const res = await fetch('/api/what-if', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setWhatIfResult(await res.json());
      }
    } finally {
      setWhatIfLoading(false);
    }
  };

  const saveLlmConfig = async () => {
    try {
      const res = await fetch('/api/llm/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: llmProvider,
          model: llmModel,
          api_key: openRouterKey.trim() || undefined,
        }),
      });
      if (res.ok) {
        const cfg = await res.json();
        setLlmKeyConfigured(Boolean(cfg.live_llm_ready));
        if (openRouterKey.trim()) {
          setShowLlmSettings(false);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const sendCopilotQuery = async (qText?: string) => {
    const query = (qText ?? copilotInput).trim();
    if (!query) return;
    setCopilotInput('');
    setCopilotMessages((prev) => [...prev, { role: 'user', text: query }]);
    setCopilotLoading(true);
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          auto_execute_tools: true,
          llm_provider: llmProvider,
          llm_model: llmModel,
          api_key: openRouterKey.trim() || undefined,
        }),
      });
      if (res.ok) {
        const data: AgentCopilotResponse = await res.json();
        if (openRouterKey.trim()) setLlmKeyConfigured(true);
        setCopilotMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            text: data.answer,
            providerUsed: data.llm_provider_used,
            modelUsed: data.llm_model_used,
            toolCalls: data.tool_calls,
            actionsTaken: data.actions_taken,
            suggestions: data.follow_up_suggestions,
          },
        ]);
        if (data.actions_taken && data.actions_taken.length > 0) {
          fetchInitialState();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCopilotLoading(false);
    }
  };

  if (!snapshot) {
    return (
      <div className="h-screen w-screen bg-[#060a12] flex flex-col items-center justify-center text-slate-300 gap-3">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <div className="font-mono text-sm tracking-widest uppercase">
          Initializing Physics-Informed Data Hall Digital Twin...
        </div>
      </div>
    );
  }

  const { facility, optimization, anomalies, forecasts } = snapshot;
  const selectedRack = snapshot.racks.find((r) => r.rack_id === selectedId) || snapshot.racks[0];
  const selectedCrac = snapshot.cracs.find((c) => c.crac_id === selectedId);
  const selectedCdu = snapshot.cdus.find((c) => c.cdu_id === selectedId);
  const selectedPdu = snapshot.pdus.find((p) => p.pdu_id === selectedId);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#060a12] text-slate-100 select-none overflow-hidden">
      {/* Executive ROI Business Case Modal */}
      <ExecutiveROIModal isOpen={roiModalOpen} onClose={() => setRoiModalOpen(false)} />

      {/* Enterprise Data Connectors & BYOD Ingestion Hub Modal */}
      <DataConnectorsModal
        isOpen={connectorsModalOpen}
        onClose={() => setConnectorsModalOpen(false)}
        onDatasetIngested={(dsId) => {
          fetchInitialState();
          if (dsId) setIngestedDatasetId(dsId);
        }}
      />

      {/* Top Executive Telemetry Ribbon */}
      <header className="h-14 border-b border-slate-800/90 bg-slate-950/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Cpu className="w-5 h-5 text-slate-950 stroke-[2.3]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-sm text-white">Pandita's Aether-DCTWIN</span>
              <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                Hall-01 AI Factory
              </span>
              <span
                className={`flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  wsConnected
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                    : 'bg-amber-950 text-amber-300'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                LIVE 1.5s
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              32 Racks (42U Drill-Down) • DuckDB 24h Replay • Autonomous Tool-Calling AI Agent
            </p>
          </div>
        </div>

        {/* Key Facility KPIs + ROI Report Trigger */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Facility Power</div>
            <div className="text-sm font-mono font-bold text-white">
              {facility.total_facility_power_kw.toFixed(0)}{' '}
              <span className="text-xs font-normal text-slate-400">
                kW ({facility.total_it_power_kw.toFixed(0)} IT)
              </span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Live PUE / Opt</div>
            <div className="text-sm font-mono font-bold text-cyan-400">
              {facility.pue.toFixed(3)}{' '}
              <span className="text-xs text-emerald-400">→ {optimization.projected_pue.toFixed(3)}</span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Peak Cold Inlet</div>
            <div
              className={`text-sm font-mono font-bold ${
                facility.max_inlet_temp_c >= 27.0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {facility.max_inlet_temp_c.toFixed(1)}°C{' '}
              <span className="text-xs text-slate-400">({facility.max_inlet_rack_id})</span>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 px-2.5 py-1 rounded-lg">
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Peak GPU Junction</div>
            <div
              className={`text-sm font-mono font-bold ${
                facility.max_chip_temp_c >= 73.0 ? 'text-red-400' : 'text-cyan-300'
              }`}
            >
              {facility.max_chip_temp_c.toFixed(1)}°C{' '}
              <span className="text-xs text-slate-400">({facility.max_chip_rack_id})</span>
            </div>
          </div>

          <button
            onClick={() => updateControl({ auto_optimize: !optimization.auto_pilot_active })}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              optimization.auto_pilot_active
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-lg shadow-emerald-500/10'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Auto-Pilot: {optimization.auto_pilot_active ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setLightMode(!lightMode)}
            title="Toggle Light / Dark Theme"
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 transition-all"
          >
            {lightMode ? (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dark</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </>
            )}
          </button>

          <button
            onClick={() => setConnectorsModalOpen(true)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/60 text-indigo-200 transition-all"
          >
            <Cable className="w-3.5 h-3.5 text-indigo-300" />
            BYOD & Connectors
          </button>

          <button
            onClick={() => setRoiModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-emerald-400 hover:from-cyan-400 hover:to-emerald-300 text-slate-950 shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Award className="w-3.5 h-3.5" />
            Executive ROI Report
          </button>
        </div>
      </header>

      {/* Main Content Split */}
      <div className="flex-1 flex min-h-0">
        {/* Left Interactive 3D Viewport + 24h DuckDB Scrubber + Bottom Charts */}
        <div className="flex-1 flex flex-col relative min-w-0">
          {/* Top Floating Overlay & Scenario Bar inside 3D Viewport */}
          <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded-xl p-1 backdrop-blur-md pointer-events-auto shadow-xl">
              <span className="text-[10px] font-mono uppercase text-slate-400 px-2 flex items-center gap-1">
                <Layers className="w-3 h-3 text-cyan-400" /> 3D Layer:
              </span>
              {(
                [
                  ['inlet_temp', 'Inlet Temp'],
                  ['chip_temp', 'GPU Junction'],
                  ['power_kw', 'Rack Power'],
                  ['anomaly', 'AI Anomaly Risk'],
                  ['cooling_type', 'Cooling Topology'],
                ] as [OverlayMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setOverlayMode(mode)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    overlayMode === mode
                      ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowPipes(!showPipes)}
                className={`ml-1 px-2 py-1 rounded-lg text-[11px] font-mono border ${
                  showPipes
                    ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
              >
                Loops {showPipes ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setShowPlumes(!showPlumes)}
                className={`px-2 py-1 rounded-lg text-[11px] font-mono border ${
                  showPlumes
                    ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-500'
                }`}
              >
                CFD Plumes {showPlumes ? 'ON' : 'OFF'}
              </button>
            </div>

            {/* Scenario Fault / Stress Injection Bar */}
            <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded-xl p-1 backdrop-blur-md pointer-events-auto shadow-xl">
              <span className="text-[10px] font-mono uppercase text-slate-400 px-2">Inject Scenario:</span>
              {SCENARIO_PRESETS.map((sc) => {
                const isActive = snapshot.active_scenarios.includes(sc.id);
                return (
                  <button
                    key={sc.id}
                    onClick={() => triggerScenario(sc.id)}
                    title={sc.desc}
                    className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                      isActive
                        ? sc.id === 'normal'
                          ? 'bg-emerald-500/25 text-emerald-200 border border-emerald-500/60'
                          : 'bg-red-500/30 text-red-200 border border-red-500/70 shadow-sm'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>{sc.icon}</span>
                    <span>{sc.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3D Canvas */}
          <div className="flex-1 min-h-0 relative">
            <DataHall3D
              snapshot={snapshot}
              overlayMode={overlayMode}
              selectedId={selectedId}
              onSelectComponent={(id, type) => {
                setSelectedId(id);
                setSelectedType(type);
                if (type === 'rack' && activeTab !== 'elevation_42u') {
                  setActiveTab('elevation_42u');
                } else if (type !== 'rack') {
                  setActiveTab('inspector');
                }
              }}
              showPipes={showPipes}
              showPlumes={showPlumes}
              lightMode={lightMode}
            />

            <div className="absolute bottom-3 left-3 bg-slate-950/85 border border-slate-800/90 rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-300 flex items-center gap-4 backdrop-blur-md">
              <span className="text-slate-400">ROWS A & B: Air-Cooled Compute (18-22kW/rack)</span>
              <span className="text-cyan-400">ROWS C & D: Direct-to-Chip Liquid AI (65-85kW/rack)</span>
              <span className="text-amber-300">Click any rack to inspect 42U blades</span>
            </div>
          </div>

          {/* Bottom 24-Hour DuckDB Time-Travel Scrubber + Live Charts */}
          <div className="p-3 pt-0 space-y-2 shrink-0">
            <TimeSeriesReplayBar
              onSnapshotUpdate={(snap) => setSnapshot(snap)}
              externalDatasetId={ingestedDatasetId}
            />
            <TelemetryCharts history={snapshot.history} forecasts={forecasts} />
          </div>
        </div>

        {/* Right 6-Tab AI, ML Suite, 42U Elevation & Control Workbench Drawer */}
        <aside className="w-[485px] border-l border-slate-800/90 bg-slate-950/95 flex flex-col shrink-0 z-10">
          {/* Navigation Tabs */}
          <div className="grid grid-cols-6 border-b border-slate-800 bg-slate-900/60 p-1 gap-1">
            {[
              { id: 'ml_suite', label: 'ML / MOP', icon: Gauge },
              { id: 'elevation_42u', label: '42U Rack', icon: Server },
              { id: 'inspector', label: 'Controls', icon: Sliders },
              { id: 'ai_analytics', label: `AI (${anomalies.length})`, icon: Sparkles },
              { id: 'what_if', label: 'What-If', icon: Play },
              { id: 'copilot', label: 'Agent', icon: Bot },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id as typeof activeTab);
                    if (t.id === 'what_if' && !whatIfResult) {
                      runWhatIf();
                    }
                  }}
                  className={`py-2 px-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
                    activeTab === t.id
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {/* TAB 0: OPENDT SELF-CALIBRATION, CONSTRAINED MPC & GRAPHRAG MOP SUITE */}
            {activeTab === 'ml_suite' && <FacilityMLSuitePanel />}

            {/* TAB 1: 42U SERVER-LEVEL RACK ELEVATION DRILL-DOWN */}
            {activeTab === 'elevation_42u' && (
              <RackElevation42U
                rackId={selectedRack.rack_id}
                onSyncTwin={fetchInitialState}
              />
            )}

            {/* TAB 2: DIGITAL TWIN COMPONENT INSPECTOR & BMS CONTROLS */}
            {activeTab === 'inspector' && (
              <>
                {selectedType === 'rack' && selectedRack && (
                  <div className="space-y-4">
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
                          onClick={() => setActiveTab('elevation_42u')}
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
                            Compute Util: {selectedRack.it_utilization_pct.toFixed(1)}% ({selectedRack.gpu_count} GPUs)
                          </div>
                        </div>

                        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2.5">
                          <div className="text-[10px] text-slate-400 uppercase">GPU / CPU Junction</div>
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
                      <Wind className="w-3.5 h-3.5 text-cyan-400" /> Live Cooling Plant Controls
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">
                      Wet-Bulb: {facility.outdoor_wetbulb_c.toFixed(1)}°C
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
                                updateControl({
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
                                updateControl({
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
                              updateControl({
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
                                updateControl({
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
                                updateControl({
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
              </>
            )}

            {/* TAB 3: AI OPTIMIZER & MULTIVARIATE ANOMALY DETECTION */}
            {activeTab === 'ai_analytics' && (
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
                    onClick={applyAiOptimization}
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
                              setSelectedId(anom.component_id);
                              setSelectedType('rack');
                              setActiveTab('elevation_42u');
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
                            <strong>AI Action:</strong> {anom.recommended_action}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: COUNTERFACTUAL "WHAT-IF" SCENARIO SIMULATOR */}
            {activeTab === 'what_if' && (
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
                          name: '+160 kW Blackwell GPU Expansion in Row C',
                          target_row: 'ROW-C',
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
                        setWhatIfReq(preset);
                        runWhatIf(preset);
                      }}
                      className="text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-cyan-300 font-medium"
                    >
                      🚀 +160kW GPU Load (Row C)
                    </button>
                    <button
                      onClick={() => {
                        const preset: WhatIfRequest = {
                          name: 'Retrofit Row B Air Racks to Direct-to-Chip Liquid',
                          target_row: 'ROW-B',
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
                        setWhatIfReq(preset);
                        runWhatIf(preset);
                      }}
                      className="text-left p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-emerald-300 font-medium"
                    >
                      💧 Retrofit Row B to Liquid +80kW
                    </button>
                  </div>

                  <div className="space-y-2.5 text-xs pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Target Row</span>
                      <select
                        value={whatIfReq.target_row}
                        onChange={(e) => setWhatIfReq({ ...whatIfReq, target_row: e.target.value })}
                        className="bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs text-white"
                      >
                        <option value="ROW-A">ROW-A (Air Compute)</option>
                        <option value="ROW-B">ROW-B (Air Storage)</option>
                        <option value="ROW-C">ROW-C (Liquid AI Training)</option>
                        <option value="ROW-D">ROW-D (Liquid AI Inference)</option>
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
                          setWhatIfReq({ ...whatIfReq, add_gpu_load_kw: parseFloat(e.target.value) })
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
                          setWhatIfReq({ ...whatIfReq, cdu_setpoint_c: parseFloat(e.target.value) })
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
                            setWhatIfReq({ ...whatIfReq, convert_air_to_liquid: e.target.checked })
                          }
                          className="accent-cyan-400"
                        />
                        <span>Convert Target Row to Direct Liquid Cooling</span>
                      </label>
                    </div>

                    <button
                      onClick={() => runWhatIf()}
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
            )}

            {/* TAB 5: AUTONOMOUS TOOL-CALLING AI AGENT */}
            {activeTab === 'copilot' && (
              <div className="flex flex-col h-full min-h-[500px] justify-between space-y-3">
                {/* Live OpenRouter / LLM API Key & Model Configurator */}
                <div className="bg-slate-900/95 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                          llmKeyConfigured
                            ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60'
                            : 'bg-amber-950/90 text-amber-300 border-amber-500/60'
                        }`}
                      >
                        {llmKeyConfigured
                          ? `LIVE LLM: ${llmModel.split('/').pop()}`
                          : 'OPENROUTER KEY READY TO CONNECT'}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowLlmSettings(!showLlmSettings)}
                      className="text-[11px] font-mono text-cyan-400 hover:underline"
                    >
                      {showLlmSettings ? 'Hide LLM Key ▲' : 'Configure OpenRouter / Model ▼'}
                    </button>
                  </div>

                  {showLlmSettings && (
                    <div className="space-y-2 pt-1 border-t border-slate-800 text-xs">
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10px] font-mono uppercase text-slate-400">
                            Provider
                          </label>
                          <select
                            value={llmProvider}
                            onChange={(e) => setLlmProvider(e.target.value)}
                            className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-[11px] text-white"
                          >
                            <option value="openrouter">OpenRouter</option>
                            <option value="openai">OpenAI Direct</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-mono uppercase text-slate-400">
                            OpenRouter Model ID (Tool-Calling)
                          </label>
                          <input
                            type="text"
                            list="openrouter-models"
                            value={llmModel}
                            onChange={(e) => setLlmModel(e.target.value)}
                            className="w-full mt-0.5 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-[11px] text-white"
                          />
                          <datalist id="openrouter-models">
                            <option value="anthropic/claude-3.7-sonnet" />
                            <option value="google/gemini-2.5-pro-preview" />
                            <option value="google/gemini-2.5-flash" />
                            <option value="openai/gpt-4o" />
                            <option value="openai/gpt-4o-mini" />
                            <option value="deepseek/deepseek-chat-v3-0324" />
                            <option value="meta-llama/llama-3.3-70b-instruct" />
                          </datalist>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={openRouterKey}
                          onChange={(e) => setOpenRouterKey(e.target.value)}
                          placeholder="Paste OpenRouter API Key (sk-or-v1-...)"
                          className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 font-mono text-[11px] text-white focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={saveLlmConfig}
                          className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shrink-0"
                        >
                          Save Key
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {copilotMessages.map((m, idx) => (
                    <div key={idx} className="space-y-2">
                      {/* Render Structured Tool Call Execution Traces */}
                      {m.toolCalls && m.toolCalls.length > 0 && (
                        <div className="bg-slate-950/90 border border-indigo-500/40 rounded-xl p-2.5 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-indigo-300 font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Terminal className="w-3 h-3 text-indigo-400" />
                              Agent Tool Trace ({m.toolCalls.length} tools)
                            </span>
                            {m.modelUsed && (
                              <span className="text-cyan-300">{m.modelUsed}</span>
                            )}
                          </div>
                          {m.toolCalls.map((tc) => (
                            <div
                              key={tc.step}
                              className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 text-[10px] font-mono space-y-0.5"
                            >
                              <div className="flex items-center justify-between text-cyan-300">
                                <span className="font-bold">
                                  #{tc.step} {tc.tool_name}({JSON.stringify(tc.arguments)})
                                </span>
                                <span className="text-slate-500">{tc.duration_ms}ms</span>
                              </div>
                              <div className="text-emerald-300 flex items-start gap-1">
                                <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5 text-emerald-400" />
                                <span>{tc.result_summary}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div
                        className={`p-3 rounded-xl text-xs leading-relaxed whitespace-pre-line ${
                          m.role === 'user'
                            ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-100 ml-6'
                            : 'bg-slate-900/95 border border-slate-800 text-slate-200'
                        }`}
                      >
                        {m.text}
                      </div>

                      {m.suggestions && m.suggestions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {m.suggestions.map((sug, sIdx) => (
                            <button
                              key={sIdx}
                              onClick={() => sendCopilotQuery(sug)}
                              className="text-left text-[10px] px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 transition-all"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {copilotLoading && (
                    <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs font-mono text-cyan-300 animate-pulse">
                      Executing agent tool calls against live Digital Twin & DuckDB...
                    </div>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendCopilotQuery();
                  }}
                  className="flex items-center gap-2 pt-2 border-t border-slate-800"
                >
                  <input
                    type="text"
                    value={copilotInput}
                    onChange={(e) => setCopilotInput(e.target.value)}
                    placeholder="Ask Agent to inspect 42U blades, query DuckDB, or execute fixes..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    disabled={copilotLoading}
                    className="p-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;
