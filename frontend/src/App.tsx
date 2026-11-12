import React, { useEffect, useState, useCallback } from 'react';
import {
  Award,
  Bot,
  Cable,
  Cpu,
  Gauge,
  Layers,
  Moon,
  Play,
  Puzzle,
  RefreshCw,
  Server,
  Sliders,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  TwinStateSnapshot,
  OverlayMode,
  WhatIfRequest,
  WhatIfResponse,
} from './types';
import {
  applyOptimizationSetpoints,
  fetchLlmConfig,
  fetchTwinState,
  postCoolingControl,
  postCopilotQuery,
  runCounterfactualWhatIf,
  triggerTwinScenario,
  updateLlmConfig,
} from './api/client';
import { DataHall3D } from './components/DataHall3D';
import { TelemetryCharts } from './components/TelemetryCharts';
import { RackElevation42U } from './components/RackElevation42U';
import { TimeSeriesReplayBar } from './components/TimeSeriesReplayBar';
import { ExecutiveROIModal } from './components/ExecutiveROIModal';
import { DataConnectorsModal } from './components/DataConnectorsModal';
import { FacilityMLSuitePanel } from './components/FacilityMLSuitePanel';
import { ControlsInspectorPanel } from './components/workbench/ControlsInspectorPanel';
import { AIAnalyticsPanel } from './components/workbench/AIAnalyticsPanel';
import { WhatIfPanel } from './components/workbench/WhatIfPanel';
import {
  AgentCopilotPanel,
  CopilotMessageItem,
} from './components/workbench/AgentCopilotPanel';
import { DISCOVERED_FEATURE_PLUGINS } from './components/workbench/featureTabs';

const SCENARIO_PRESETS = [
  { id: 'normal', label: 'Baseline Healthy', icon: '🟢', desc: 'Nominal AI + Cloud load' },
  { id: 'gpu_burst_row_c', label: 'Liquid Row Surge', icon: '🔥', desc: '+145 kW AI Cluster Burst' },
  { id: 'crac_2_fail', label: 'CRAC Blower Trip', icon: '⚠️', desc: 'Air unit failure & spillover' },
  { id: 'cdu_1_fouling', label: 'CDU Loop Fouling', icon: '💧', desc: 'Liquid heat-exchanger degradation' },
  { id: 'hot_aisle_recirc', label: 'Aisle Recirculation', icon: '🌀', desc: 'Containment damper bypass' },
  { id: 'heatwave', label: 'Ambient Heatwave', icon: '☀️', desc: '28.5°C Wet-Bulb Chiller Stress' },
];

export const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<TwinStateSnapshot | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('inlet_temp');
  const [showPipes, setShowPipes] = useState<boolean>(true);
  const [showPlumes, setShowPlumes] = useState<boolean>(true);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'rack' | 'crac' | 'cdu' | 'pdu'>('rack');
  const [activeTab, setActiveTab] = useState<string>('ml_suite');
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
    name: 'Add +160 kW High-Density AI Cluster',
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
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessageItem[]>([
    {
      role: 'assistant',
      text: "Welcome to **Pandita's Aether-DCTWIN Autonomous Tool-Calling Agent**. I operate strictly within the Critical Facilities boundary (`BACnet/IP`, `Modbus CDU`, `SNMP EPMS`) with direct execution access to:\n• `inspect_facility_telemetry` & `inspect_rack_42u_elevation`\n• `query_duckdb_24h_history` (Parquet/DuckDB SQL)\n• `run_counterfactual_whatif` (Cloned physics sandbox)\n• `execute_cooling_setpoints` (Closed-loop CRAC/CDU Priority 8 actuation)",
      suggestions: [
        'Run OpenDT RLS self-calibration and check CDU fouling drift',
        'Generate a GraphRAG MOP checklist to isolate CDU-1 for strainer maintenance',
        'Solve 30-min Constrained MPC lookahead trajectory with safety barriers',
        'Execute remediation and optimize setpoints now',
      ],
    },
  ]);

  const refreshState = useCallback(async () => {
    try {
      const data = await fetchTwinState();
      setSnapshot(data);
      setSelectedId((prev) => prev || data.racks[0]?.rack_id || '');
    } catch (err) {
      console.error('Failed to fetch initial twin state:', err);
    }
  }, []);

  useEffect(() => {
    refreshState();
    fetchLlmConfig()
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
          setSelectedId((prev) => prev || data.racks[0]?.rack_id || '');
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
  }, [refreshState]);

  const handleScenario = async (scenarioId: string) => {
    try {
      const data = await triggerTwinScenario(scenarioId);
      setSnapshot(data);
      if (scenarioId !== 'normal') setActiveTab('ai_analytics');
    } catch (e) {
      console.error(e);
    }
  };

  const handleApplyOptimization = async () => {
    try {
      setSnapshot(await applyOptimizationSetpoints());
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateControl = async (payload: Record<string, unknown>) => {
    try {
      setSnapshot(await postCoolingControl(payload));
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunWhatIf = async (customReq?: WhatIfRequest) => {
    const payload = customReq || whatIfReq;
    setWhatIfLoading(true);
    try {
      setWhatIfResult(await runCounterfactualWhatIf(payload));
    } catch (e) {
      console.error(e);
    } finally {
      setWhatIfLoading(false);
    }
  };

  const handleSaveLlmConfig = async () => {
    try {
      const cfg = await updateLlmConfig({
        provider: llmProvider,
        model: llmModel,
        api_key: openRouterKey.trim() || undefined,
      });
      setLlmKeyConfigured(Boolean(cfg.live_llm_ready));
      if (openRouterKey.trim()) setShowLlmSettings(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendCopilotQuery = async (qText?: string) => {
    const query = (qText ?? copilotInput).trim();
    if (!query) return;
    setCopilotInput('');
    setCopilotMessages((prev) => [...prev, { role: 'user', text: query }]);
    setCopilotLoading(true);
    try {
      const data = await postCopilotQuery({
        question: query,
        llm_provider: llmProvider,
        llm_model: llmModel,
        api_key: openRouterKey.trim() || undefined,
      });
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
        refreshState();
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
  const coreTabs = [
    { id: 'ml_suite', label: 'ML / MOP', icon: Gauge },
    { id: 'elevation_42u', label: '42U Rack', icon: Server },
    { id: 'inspector', label: 'Controls', icon: Sliders },
    { id: 'ai_analytics', label: `AI (${anomalies.length})`, icon: Sparkles },
    { id: 'what_if', label: 'What-If', icon: Play },
    { id: 'copilot', label: 'Agent', icon: Bot },
    ...DISCOVERED_FEATURE_PLUGINS.map((p) => ({ id: p.id, label: p.label, icon: Puzzle })),
  ];
  const activePlugin = DISCOVERED_FEATURE_PLUGINS.find((p) => p.id === activeTab);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#060a12] text-slate-100 select-none overflow-hidden">
      <ExecutiveROIModal isOpen={roiModalOpen} onClose={() => setRoiModalOpen(false)} />

      <DataConnectorsModal
        isOpen={connectorsModalOpen}
        onClose={() => setConnectorsModalOpen(false)}
        onDatasetIngested={(dsId) => {
          refreshState();
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
                Facility Operations
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
              {snapshot.racks.length} Racks ({snapshot.cdus.length} CDU / {snapshot.cracs.length} CRAC) • DuckDB 24h Replay • Autonomous Facility Agent
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
            <div className="text-[10px] uppercase tracking-wider text-slate-400">Peak Thermal Proxy</div>
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
            onClick={() => handleUpdateControl({ auto_optimize: !optimization.auto_pilot_active })}
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
          <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded-xl p-1 backdrop-blur-md pointer-events-auto shadow-xl">
              <span className="text-[10px] font-mono uppercase text-slate-400 px-2 flex items-center gap-1">
                <Layers className="w-3 h-3 text-cyan-400" /> 3D Layer:
              </span>
              {(
                [
                  ['inlet_temp', 'Inlet Temp'],
                  ['chip_temp', 'Thermal Load'],
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

            <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded-xl p-1 backdrop-blur-md pointer-events-auto shadow-xl">
              <span className="text-[10px] font-mono uppercase text-slate-400 px-2">Inject Scenario:</span>
              {SCENARIO_PRESETS.map((sc) => {
                const isActive = snapshot.active_scenarios.includes(sc.id);
                return (
                  <button
                    key={sc.id}
                    onClick={() => handleScenario(sc.id)}
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
              <span className="text-slate-400">
                Air Racks: {snapshot.racks.filter((r) => r.cooling_type === 'air').length}
              </span>
              <span className="text-cyan-400">
                Direct-Liquid Racks: {snapshot.racks.filter((r) => r.cooling_type === 'hybrid_liquid').length}
              </span>
              <span className="text-amber-300">Click any rack or plant unit to inspect</span>
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

        {/* Right Modular Workbench Drawer */}
        <aside className="w-[485px] border-l border-slate-800/90 bg-slate-950/95 flex flex-col shrink-0 z-10">
          <div className="flex flex-wrap border-b border-slate-800 bg-slate-900/60 p-1 gap-1">
            {coreTabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    if (t.id === 'what_if' && !whatIfResult) {
                      handleRunWhatIf();
                    }
                  }}
                  className={`flex-1 min-w-[70px] py-2 px-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all ${
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

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {activeTab === 'ml_suite' && <FacilityMLSuitePanel />}

            {activeTab === 'elevation_42u' && selectedRack && (
              <RackElevation42U rackId={selectedRack.rack_id} onSyncTwin={refreshState} />
            )}

            {activeTab === 'inspector' && (
              <ControlsInspectorPanel
                snapshot={snapshot}
                selectedId={selectedId}
                selectedType={selectedType}
                onOpenElevation42U={() => setActiveTab('elevation_42u')}
                onUpdateControl={handleUpdateControl}
              />
            )}

            {activeTab === 'ai_analytics' && (
              <AIAnalyticsPanel
                optimization={optimization}
                anomalies={anomalies}
                onApplyOptimization={handleApplyOptimization}
                onSelectRackAnomaly={(rackId) => {
                  setSelectedId(rackId);
                  setSelectedType('rack');
                  setActiveTab('elevation_42u');
                }}
              />
            )}

            {activeTab === 'what_if' && (
              <WhatIfPanel
                racks={snapshot.racks}
                whatIfReq={whatIfReq}
                whatIfResult={whatIfResult}
                whatIfLoading={whatIfLoading}
                onChangeReq={setWhatIfReq}
                onRunWhatIf={handleRunWhatIf}
              />
            )}

            {activeTab === 'copilot' && (
              <AgentCopilotPanel
                messages={copilotMessages}
                copilotInput={copilotInput}
                copilotLoading={copilotLoading}
                llmProvider={llmProvider}
                llmModel={llmModel}
                openRouterKey={openRouterKey}
                llmKeyConfigured={llmKeyConfigured}
                showLlmSettings={showLlmSettings}
                onToggleLlmSettings={() => setShowLlmSettings(!showLlmSettings)}
                onChangeProvider={setLlmProvider}
                onChangeModel={setLlmModel}
                onChangeApiKey={setOpenRouterKey}
                onSaveLlmConfig={handleSaveLlmConfig}
                onChangeInput={setCopilotInput}
                onSendQuery={handleSendCopilotQuery}
              />
            )}

            {activePlugin && (
              <activePlugin.Component snapshot={snapshot} onRefresh={refreshState} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default App;
