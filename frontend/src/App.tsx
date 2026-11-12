import React, { useEffect, useState, useCallback } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  Cable,
  ChevronDown,
  Clock,
  Cpu,
  FlaskConical,
  LayoutDashboard,
  Moon,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Sliders,
  Sparkles,
  Sun,
  TrendingUp,
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
import { TimeSeriesReplayBar } from './components/TimeSeriesReplayBar';
import { DataConnectorsModal } from './components/DataConnectorsModal';
import { OverviewOptimizePanel } from './components/workbench/OverviewOptimizePanel';
import { ControlsInspectorPanel } from './components/workbench/ControlsInspectorPanel';
import { PlanSandboxPanel } from './components/workbench/PlanSandboxPanel';
import { SystemHealthPanel } from './components/workbench/SystemHealthPanel';
import { ROIBusinessCasePanel } from './components/workbench/ROIBusinessCasePanel';
import {
  AgentCopilotPanel,
  CopilotMessageItem,
} from './components/workbench/AgentCopilotPanel';
import { DISCOVERED_FEATURE_PLUGINS } from './components/workbench/featureTabs';

const SCENARIO_PRESETS = [
  { id: 'normal', label: 'Normal Operation', desc: 'Balanced air and liquid cooling baseline' },
  { id: 'gpu_burst_row_c', label: 'Liquid Row Surge', desc: '+145 kW sudden load increase in Row C' },
  { id: 'crac_2_fail', label: 'CRAC Blower Trip', desc: 'Perimeter air unit failure and zone spillover' },
  { id: 'cdu_1_fouling', label: 'CDU Strainer Fouling', desc: 'Gradual liquid heat-exchanger restriction' },
  { id: 'hot_aisle_recirc', label: 'Hot-Aisle Bypass', desc: 'Containment damper leak into cold aisle' },
  { id: 'heatwave', label: 'Summer Heatwave', desc: '28.5°C outdoor wet-bulb chiller stress' },
];

export const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<TwinStateSnapshot | null>(null);
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('inlet_temp');
  const [showPipes, setShowPipes] = useState<boolean>(true);
  const [showPlumes, setShowPlumes] = useState<boolean>(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'rack' | 'crac' | 'cdu' | 'pdu'>('rack');
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [bottomDock, setBottomDock] = useState<'none' | 'trends' | 'replay'>('none');
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState<boolean>(false);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
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
    name: '+160 kW High-Density Expansion in ROW-C',
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

  // Facility Copilot state
  const [copilotInput, setCopilotInput] = useState<string>('');
  const [copilotLoading, setCopilotLoading] = useState<boolean>(false);
  const [llmProvider, setLlmProvider] = useState<string>('openrouter');
  const [llmModel, setLlmModel] = useState<string>('anthropic/claude-3.7-sonnet');
  const [openRouterKey, setOpenRouterKey] = useState<string>('');
  const [llmKeyConfigured, setLlmKeyConfigured] = useState<boolean>(false);
  const [showLlmSettings, setShowLlmSettings] = useState<boolean>(false);
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessageItem[]>([
    {
      role: 'assistant',
      text: "Hi — I'm the Aether-DCTWIN facility assistant. I monitor rack inlet temperatures, CDU liquid loops, CRAC air units, and row PDUs without touching tenant servers.\n\nAsk me to check hot spots, test capacity changes, draft a maintenance checklist, or apply recommended cooling setpoints.",
      suggestions: [
        'Which racks have the warmest inlet temperatures right now?',
        'Check CDU heat-exchanger drift and fouling health',
        'Draft a maintenance checklist to service CDU-1 strainers',
        'Apply recommended cooling setpoints to lower PUE',
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
    setScenarioMenuOpen(false);
    try {
      const data = await triggerTwinScenario(scenarioId);
      setSnapshot(data);
      if (scenarioId !== 'normal') {
        setActiveTab('overview');
      }
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
      <div className="h-screen w-screen bg-[#090d16] flex flex-col items-center justify-center text-slate-300 gap-3">
        <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
        <div className="text-sm text-slate-400">Loading facility digital twin...</div>
      </div>
    );
  }

  const { facility, optimization, anomalies, forecasts } = snapshot;
  const activeScenarioObj =
    SCENARIO_PRESETS.find(
      (sc) => sc.id !== 'normal' && snapshot.active_scenarios.includes(sc.id)
    ) || null;

  const airRackCount = snapshot.racks.filter((r) => r.cooling_type === 'air').length;
  const liquidRackCount = snapshot.racks.filter((r) => r.cooling_type === 'hybrid_liquid').length;

  const coreTabs: Array<{
    id: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, badge: anomalies.length || undefined },
    { id: 'inspect', label: 'Inspect', icon: Sliders },
    { id: 'plan', label: 'Plan', icon: FlaskConical },
    { id: 'health', label: 'Health', icon: Activity },
    { id: 'roi', label: 'ROI', icon: TrendingUp },
    { id: 'copilot', label: 'Copilot', icon: Bot },
    ...DISCOVERED_FEATURE_PLUGINS.map((p) => ({ id: p.id, label: p.label, icon: Puzzle })),
  ];
  const activePlugin = DISCOVERED_FEATURE_PLUGINS.find((p) => p.id === activeTab);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090d16] text-slate-100 select-none overflow-hidden">
      <DataConnectorsModal
        isOpen={connectorsModalOpen}
        onClose={() => setConnectorsModalOpen(false)}
        onDatasetIngested={(dsId) => {
          refreshState();
          if (dsId) {
            setIngestedDatasetId(dsId);
            setBottomDock('replay');
          }
        }}
      />

      {/* Minimalist Top Bar */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-950/95 px-5 flex items-center justify-between shrink-0 z-30">
        {/* Brand & Live Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-semibold tracking-tight text-sm text-white">
              Pandita&apos;s Aether-DCTWIN
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-400 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  wsConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              {wsConnected ? 'Live' : 'Reconnecting'}
            </span>
          </div>
        </div>

        {/* Clean Borderless KPI Strip */}
        <div className="hidden xl:flex items-center gap-6 tabular-nums text-xs">
          <div>
            <span className="text-slate-400 mr-2">Power</span>
            <span className="font-semibold text-white">
              {facility.total_facility_power_kw.toFixed(0)} kW
            </span>
            <span className="text-slate-500 ml-1">
              ({facility.total_it_power_kw.toFixed(0)} IT)
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div>
            <span className="text-slate-400 mr-2">PUE</span>
            <span className="font-semibold text-white">{facility.pue.toFixed(2)}</span>
            {!optimization.auto_pilot_active && (
              <span className="text-emerald-400 font-medium ml-1.5">
                → {optimization.projected_pue.toFixed(2)}
              </span>
            )}
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <div>
            <span className="text-slate-400 mr-2">Peak Cold Inlet</span>
            <span
              className={`font-semibold ${
                facility.max_inlet_temp_c >= 27.0 ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {facility.max_inlet_temp_c.toFixed(1)}°C
            </span>
          </div>

          <div className="h-4 w-px bg-slate-800" />

          <button
            onClick={() => setActiveTab('overview')}
            className="flex items-center gap-1.5 hover:opacity-85 transition-opacity"
          >
            <span className="text-slate-400">Alerts</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                anomalies.length > 0
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {anomalies.length > 0 ? `${anomalies.length} Active` : 'Healthy'}
            </span>
          </button>
        </div>

        {/* Right Utility Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleUpdateControl({ auto_optimize: !optimization.auto_pilot_active })}
            title={
              optimization.auto_pilot_active
                ? 'Closed-loop BACnet Priority 8 active — click to relinquish back to Manual BMS (Priority 16)'
                : 'Manual BMS Mode (Priority 16) — click to enable closed-loop Auto-Pilot optimization'
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors tabular-nums ${
              optimization.auto_pilot_active
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
            }`}
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${
                optimization.auto_pilot_active ? 'text-emerald-400' : 'text-slate-400'
              }`}
            />
            <span>
              {optimization.auto_pilot_active
                ? `Auto-Pilot On (-${optimization.power_saved_kw.toFixed(0)} kW)`
                : 'Auto-Pilot Off'}
            </span>
          </button>

          <button
            onClick={() => setConnectorsModalOpen(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
          >
            <Cable className="w-3.5 h-3.5 text-slate-400" />
            <span>Data</span>
          </button>

          <button
            onClick={() => setLightMode(!lightMode)}
            title={lightMode ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
          >
            {lightMode ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Workspace Split */}
      <div className="flex-1 flex min-h-0">
        {/* Left: Spacious 3D Data Hall + Collapsible Bottom Dock */}
        <div className="flex-1 flex flex-col relative min-w-0">
          {/* Clean Floating Controls Above 3D Scene */}
          <div className="absolute top-3.5 left-4 right-4 z-20 flex items-center justify-between gap-3 pointer-events-none">
            {/* Layer Segmented Control + Subtle Pipe/Airflow Toggles */}
            <div className="flex items-center gap-1 bg-slate-950/85 border border-slate-800/90 rounded-xl p-1 backdrop-blur-md pointer-events-auto shadow-lg">
              {(
                [
                  ['inlet_temp', 'Inlet °C'],
                  ['power_kw', 'Rack kW'],
                  ['chip_temp', 'Thermal'],
                  ['cooling_type', 'Cooling'],
                  ['anomaly', 'Risk'],
                ] as [OverlayMode, string][]
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setOverlayMode(mode)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    overlayMode === mode
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {label}
                </button>
              ))}

              <div className="h-4 w-px bg-slate-800 mx-1" />

              <button
                onClick={() => setShowPipes(!showPipes)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  showPipes ? 'bg-slate-800 text-sky-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Loops
              </button>
              <button
                onClick={() => setShowPlumes(!showPlumes)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  showPlumes ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Airflow
              </button>
            </div>

            {/* Clean Scenario Dropdown + Active Scenario Reset Pill */}
            <div className="flex items-center gap-2 pointer-events-auto relative">
              {activeScenarioObj && (
                <div className="flex items-center gap-2 bg-amber-950/90 border border-amber-500/50 text-amber-200 px-3 py-1.5 rounded-xl text-xs font-medium backdrop-blur-md shadow-lg">
                  <span>Active: {activeScenarioObj.label}</span>
                  <button
                    onClick={() => handleScenario('normal')}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                </div>
              )}

              <button
                onClick={() => setScenarioMenuOpen(!scenarioMenuOpen)}
                className="flex items-center gap-1.5 bg-slate-950/85 hover:bg-slate-900 border border-slate-800/90 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md shadow-lg transition-colors"
              >
                <span>Simulate Event</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {scenarioMenuOpen && (
                <div className="absolute right-0 top-10 w-72 bg-slate-950/95 border border-slate-800 rounded-xl p-1.5 shadow-2xl backdrop-blur-md space-y-0.5 z-30">
                  {SCENARIO_PRESETS.map((sc) => {
                    const isActive = snapshot.active_scenarios.includes(sc.id);
                    return (
                      <button
                        key={sc.id}
                        onClick={() => handleScenario(sc.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                          isActive
                            ? 'bg-sky-500/15 text-sky-300'
                            : 'hover:bg-slate-900 text-slate-200'
                        }`}
                      >
                        <div className="text-xs font-medium flex items-center justify-between">
                          <span>{sc.label}</span>
                          {isActive && (
                            <span className="text-[10px] text-sky-400 font-semibold">Active</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{sc.desc}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 3D Viewport */}
          <div
            className="flex-1 min-h-0 relative"
            onClick={() => {
              if (scenarioMenuOpen) setScenarioMenuOpen(false);
            }}
          >
            <DataHall3D
              snapshot={snapshot}
              overlayMode={overlayMode}
              selectedId={selectedId}
              onSelectComponent={(id, type) => {
                setSelectedId(id);
                setSelectedType(type);
                setActiveTab('inspect');
              }}
              showPipes={showPipes}
              showPlumes={showPlumes}
              lightMode={lightMode}
            />
          </div>

          {/* Sleek Collapsible Bottom Dock for Trends & 24h Replay */}
          <div className="border-t border-slate-800/80 bg-slate-950/95 shrink-0 z-20">
            <div className="h-10 px-4 flex items-center justify-between text-xs">
              <div className="text-slate-400 tabular-nums">
                {snapshot.racks.length} Racks ({airRackCount} Air · {liquidRackCount} Liquid) ·{' '}
                <span className="text-slate-500">
                  Click any rack or cooling unit on the floor to inspect
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setBottomDock(bottomDock === 'trends' ? 'none' : 'trends')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    bottomDock === 'trends'
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Live Trends</span>
                </button>

                <button
                  onClick={() => setBottomDock(bottomDock === 'replay' ? 'none' : 'replay')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                    bottomDock === 'replay'
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>24h Replay</span>
                </button>
              </div>
            </div>

            {bottomDock === 'trends' && (
              <div className="px-4 pb-3 pt-1 border-t border-slate-800/60">
                <TelemetryCharts history={snapshot.history} forecasts={forecasts} />
              </div>
            )}

            {bottomDock === 'replay' && (
              <div className="px-4 pb-3 pt-2 border-t border-slate-800/60">
                <TimeSeriesReplayBar
                  onSnapshotUpdate={(snap) => setSnapshot(snap)}
                  externalDatasetId={ingestedDatasetId}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Clean Workbench Panel */}
        <aside className="w-[450px] border-l border-slate-800/80 bg-slate-950 flex flex-col shrink-0 z-20">
          {/* Clean Navigation Tabs */}
          <div className="flex items-center border-b border-slate-800/80 px-2 pt-1.5 gap-0.5 overflow-x-auto">
            {coreTabs.map((t) => {
              const Icon = t.icon;
              const isSelected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    if (t.id === 'plan' && !whatIfResult) {
                      handleRunWhatIf();
                    }
                  }}
                  className={`flex-1 py-2.5 px-1.5 text-xs font-medium flex items-center justify-center gap-1 border-b-2 transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'border-sky-400 text-white'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.label}</span>
                  {t.badge !== undefined && t.badge > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300">
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Tab Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'overview' && (
              <OverviewOptimizePanel
                optimization={optimization}
                anomalies={anomalies}
                onApplyOptimization={handleApplyOptimization}
                onToggleAutoPilot={(enable) => handleUpdateControl({ auto_optimize: enable })}
                onSelectRackAnomaly={(rackId) => {
                  setSelectedId(rackId);
                  setSelectedType('rack');
                  setActiveTab('inspect');
                }}
              />
            )}

            {activeTab === 'inspect' && (
              <ControlsInspectorPanel
                snapshot={snapshot}
                selectedId={selectedId}
                selectedType={selectedType}
                onSyncTwin={refreshState}
                onUpdateControl={handleUpdateControl}
              />
            )}

            {activeTab === 'plan' && (
              <PlanSandboxPanel
                snapshot={snapshot}
                whatIfReq={whatIfReq}
                whatIfResult={whatIfResult}
                whatIfLoading={whatIfLoading}
                onChangeReq={setWhatIfReq}
                onRunWhatIf={handleRunWhatIf}
              />
            )}

            {activeTab === 'health' && <SystemHealthPanel />}

            {activeTab === 'roi' && <ROIBusinessCasePanel livePue={facility.pue} />}

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
