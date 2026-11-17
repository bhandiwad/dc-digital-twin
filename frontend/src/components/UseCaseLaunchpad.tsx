import React from 'react';
import {
  Activity,
  ArrowUpRight,
  Box,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Cpu,
  Flame,
  ShieldAlert,
  Sparkles,
  Zap,
} from 'lucide-react';
import { AgentWorkflowId, TwinStateSnapshot, WorkspaceTabId } from '../types';

export interface UseCaseCardMeta {
  id: Exclude<WorkspaceTabId, 'launchpad'>;
  shortTabLabel: string;
  numberTag: string;
  category: string;
  title: string;
  description: string;
  toolChain: string;
  outcomeMetric: string;
  icon: React.ElementType;
  accentClass: string;
}

export const USE_CASE_CATALOG: UseCaseCardMeta[] = [
  {
    id: 'twin_3d',
    shortTabLabel: '3D Digital Twin',
    numberTag: 'CORE PLATFORM',
    category: 'Live Spatial Operations & BMS Supervisory Control',
    title: 'Live 3D Colocation Twin & Staged BMS Control',
    description:
      'Interactive 32-bay hybrid air + liquid hall with colocation cages, ghost reservations, dark spare bays, central chiller COP/economiser coupling, 42U smart-PDU & manifold inspection, and Shadow → Advisory → Bounded ±2°C Auto-Trim.',
    toolChain: 'WebGL 3D Floor → Chiller + CDU Physics → 10k-GPU Planner → 24h DuckDB',
    outcomeMetric: 'Shadow → Advisory → Bounded Trim · Zero Server Agents',
    icon: Box,
    accentClass: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
  },
  {
    id: 'redteam_change',
    shortTabLabel: '01 · Change Red-Team',
    numberTag: 'AGENT 01',
    category: 'Maintenance & CAB Governance',
    title: 'Change-Window & Raw MOP "Red-Team" Agent',
    description:
      'Parses unstructured ServiceNow tickets & vendor MOP drafts, auto-pulls diurnal site wet-bulb weather, simulates N-1 demarcation temperatures, and flags missing MOP safety clauses.',
    toolChain: 'MOP NLP Parser → Weather API → N-1 Demarcation Sim → CAB Redlines',
    outcomeMetric: 'Catches MOP Gaps & Afternoon N-1 Traps',
    icon: ShieldAlert,
    accentClass: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  },
  {
    id: 'incident_commander',
    shortTabLabel: '02 · Incident & RCA',
    numberTag: 'AGENT 02',
    category: 'NOC War-Room Triage',
    title: '5-Minute Incident Commander & Auto-RCA',
    description:
      'Compresses multi-cage cold-aisle & differential-pressure alarms into 1 upstream mechanical root cause, calculates SLA thermal ride-through, stages EOP trims, and drafts tenant SLA advisories.',
    toolChain: 'Alarm Dedup → Ride-Through Math → EOP Sim → Colocation SLA RCA',
    outcomeMetric: 'Multi-Cage Alarm Dedup · Facility Boundary Only',
    icon: Flame,
    accentClass: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
  },
  {
    id: 'shift_handover',
    shortTabLabel: '03 · Shift & Silent Drift',
    numberTag: 'AGENT 03',
    category: 'Daily NOC & Sensor Hygiene',
    title: 'Silent-Drift, Sensor Hygiene & Shift Handover',
    description:
      'Audits 12h DuckDB sub-meter logs + outgoing operator notes to quarantine flatlined BMS probes (SAT-B04), catch chilled-water valve stiction, and compile the incoming walkdown brief.',
    toolChain: 'DuckDB 12h SQL → Sensor & Valve Hygiene → Shift Walkdown Packet',
    outcomeMetric: 'Quarantines Stuck Probes & Hunting Valves',
    icon: ClipboardCheck,
    accentClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  },
  {
    id: 'colo_deal_desk',
    shortTabLabel: '04 · Colo Deal-Desk',
    numberTag: 'AGENT 04',
    category: 'Commercial Quote-to-Cage',
    title: 'Colocation Deal-Desk & Broker RFP Agent',
    description:
      'Parses raw inbound broker/customer RFP emails, checks dark spare bays, row PDU NEC kW & liquid CDU headroom, flags missing customer specs, and drafts an engineering-gated quote.',
    toolChain: 'Broker Email Parser → Spare Bay & PDU Audit → Summer PUE Quote',
    outcomeMetric: 'Parses Raw RFP Emails + Flags Missing Specs',
    icon: Briefcase,
    accentClass: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/25',
  },
  {
    id: 'stranded_power',
    shortTabLabel: '05 · Stranded Power',
    numberTag: 'AGENT 05',
    category: 'Bottom-Up Capacity Monetization',
    title: 'Stranded Power & Bottom-Up Whip Recovery',
    description:
      'Sums real L1-L2 / L2-L3 / L3-L1 rack whips into 120° phasor amps, flags under-drawn ghost-reservation cages, and executes live rack whip phase rebalancing.',
    toolChain: 'Bottom-Up L1/L2/L3 Whip Phasors → Ghost Cage Scan → Live Rebalance',
    outcomeMetric: 'Live Rack Whip Balancing & Ghost-kW Audit',
    icon: Zap,
    accentClass: 'text-violet-400 bg-violet-500/10 border-violet-500/25',
  },
];

export interface UseCaseLaunchpadProps {
  snapshot: TwinStateSnapshot;
  openTabs: WorkspaceTabId[];
  onOpenUseCase: (id: Exclude<WorkspaceTabId, 'launchpad'>) => void;
}

export const UseCaseLaunchpad: React.FC<UseCaseLaunchpadProps> = ({
  snapshot,
  openTabs,
  onOpenUseCase,
}) => {
  const { facility, optimization, anomalies } = snapshot;
  const heroTwin = USE_CASE_CATALOG[0];
  const agentCards = USE_CASE_CATALOG.slice(1);
  const darkSpares = snapshot.racks.filter((r) => r.occupancy_status === 'dark_spare').length;
  const ghostBays = snapshot.racks.filter((r) => r.occupancy_status === 'ghost_reservation').length;
  const activeRacks = snapshot.racks.length - darkSpares;

  const isTabOpen = (id: WorkspaceTabId) => openTabs.includes(id);

  return (
    <div className="flex-1 overflow-y-auto bg-[#090d16]">
      <div className="max-w-6xl mx-auto px-6 py-5 space-y-5">
        {/* Clean Executive Hero Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-sky-400">
              <Cpu className="w-3.5 h-3.5" />
              <span>100% Facility-Demarcation Digital Twin &amp; Agentic Operations</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Select a Data Centre Use Case to Launch
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              Click any workspace below to open it in a dedicated tab above. Every workflow operates
              strictly on facility demarcation telemetry (cold-aisle inlets, liquid manifolds,
              smart-PDU L1/L2/L3 whips, and central chillers)—zero agents on customer servers.
            </p>
          </div>

          {/* Live Hall Pulse Strip */}
          <div className="grid grid-cols-3 gap-2.5 shrink-0 tabular-nums">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400">Hall Occupancy</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {activeRacks}/{snapshot.racks.length} Live Bays
              </div>
              <div className="text-[11px] text-slate-500">
                {ghostBays} Ghost · {darkSpares} Dark Spare
              </div>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400">Live PUE · Plant COP</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {facility.pue.toFixed(2)}
                {!optimization.auto_pilot_active && (
                  <span className="text-emerald-400 text-xs font-medium ml-1">
                    → {optimization.projected_pue.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                COP {(facility.chiller_cop ?? 4.6).toFixed(1)} ·{' '}
                {(facility.economizer_share_pct ?? 42).toFixed(0)}% Econ
              </div>
            </div>
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2.5">
              <div className="text-[11px] text-slate-400">Demarcation SLA</div>
              <div
                className={`text-sm font-semibold mt-0.5 ${
                  anomalies.length > 0 ? 'text-amber-400' : 'text-emerald-400'
                }`}
              >
                {anomalies.length > 0 ? `${anomalies.length} Alerts` : 'Nominal'}
              </div>
              <div className="text-[11px] text-slate-500">
                Inlet {facility.max_inlet_temp_c.toFixed(1)}°C (≤27°C)
              </div>
            </div>
          </div>
        </div>

        {/* Featured Full-Width Card: Live 3D Digital Twin */}
        <button
          type="button"
          onClick={() => onOpenUseCase('twin_3d')}
          className="w-full text-left group rounded-2xl bg-slate-900/65 hover:bg-slate-900 border border-slate-800 hover:border-sky-500/50 p-5 transition-all shadow-sm"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-3xl">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border text-sky-400 bg-sky-500/10 border-sky-500/25">
                  <Box className="w-3.5 h-3.5" />
                  {heroTwin.numberTag}
                </span>
                <span className="text-xs text-slate-400">{heroTwin.category}</span>
                {isTabOpen('twin_3d') && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Tab Open
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold text-white group-hover:text-sky-300 transition-colors">
                {heroTwin.title}
              </h2>

              <p className="text-sm text-slate-300 leading-relaxed">{heroTwin.description}</p>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {[
                  '3D Colocation Cages & 42U PDU Outlets',
                  'Shadow → Advisory → Bounded Auto-Trim',
                  'Central Chiller COP & 10k-GPU Planner',
                  '24h DuckDB Replay & Sensor Hygiene',
                ].map((pill) => (
                  <span
                    key={pill}
                    className="text-xs px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-slate-300"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex lg:flex-col items-center lg:items-end justify-between gap-3 shrink-0">
              <div className="text-right hidden lg:block">
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  BMS Posture: {(facility.bms_control_mode || 'shadow').replace('_', ' ')}
                </div>
                <div className="text-base font-semibold text-emerald-400 tabular-nums mt-0.5">
                  {optimization.auto_pilot_active
                    ? `Saving ${optimization.power_saved_kw.toFixed(0)} kW Active`
                    : `${optimization.power_saved_kw.toFixed(0)} kW Shadow Verified ($${Math.round(
                        optimization.annual_cost_savings_usd / 1000
                      )}k/yr)`}
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sky-500 group-hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors">
                <span>{isTabOpen('twin_3d') ? 'Switch to 3D Twin Tab' : 'Open 3D Twin Tab'}</span>
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </div>
          </div>
        </button>

        {/* Section Header: 5 Multi-Step Agentic Workflows */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                Autonomous Facility &amp; Colocation Agent Workflows (5)
              </h2>
            </div>
            <span className="text-xs text-slate-400 hidden sm:inline">
              Parses raw MOPs, broker RFPs &amp; shift logs against live facility physics
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentCards.map((card) => {
              const Icon = card.icon;
              const opened = isTabOpen(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => onOpenUseCase(card.id as AgentWorkflowId)}
                  className="text-left group rounded-2xl bg-slate-900/55 hover:bg-slate-900 border border-slate-800 hover:border-slate-600 p-5 flex flex-col justify-between gap-4 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${card.accentClass}`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {card.numberTag}
                      </span>
                      {opened ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" />
                          Open
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">{card.category}</span>
                      )}
                    </div>

                    <h3 className="text-base font-semibold text-white group-hover:text-sky-300 transition-colors leading-snug">
                      {card.title}
                    </h3>

                    <p className="text-xs text-slate-400 leading-relaxed">{card.description}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Activity className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{card.toolChain}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-emerald-400">
                        {card.outcomeMetric}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-400 group-hover:translate-x-0.5 transition-transform">
                        <span>{opened ? 'Switch Tab' : 'Open Tab'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subtle Footer Trust Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/60 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>
              100% Colocation Demarcation Safe · BACnet Priority 8 with Instant Priority 16 Local
              BMS Relinquish
            </span>
          </div>
          <span>BACnet/IP · Modbus TCP · Smart-PDU SNMP · DuckDB Historian</span>
        </div>
      </div>
    </div>
  );
};
