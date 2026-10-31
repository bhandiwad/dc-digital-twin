import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
  Leaf,
  Server,
  Sparkles,
  TrendingDown,
  X,
  Zap,
} from 'lucide-react';
import { ExecutiveROIReport } from '../types';

export const ExecutiveROIModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
}> = ({ isOpen, onClose }) => {
  const [report, setReport] = useState<ExecutiveROIReport | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/roi-report')
      .then((r) => r.json())
      .then((data: ExecutiveROIReport) => setReport(data))
      .catch(console.error);
  }, [isOpen]);

  if (!isOpen) return null;

  const copyMarkdown = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.markdown_export);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadMarkdown = () => {
    if (!report) return;
    const blob = new Blob([report.markdown_export], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.report_id}_Executive_ROI_Report.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-[#080f1d] border border-cyan-500/40 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-cyan-500/10 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-slate-950 font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Executive ROI, Capacity & Sustainability Business Case
                </h2>
                {report && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {report.report_id}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Quantified financial, PUE, carbon, and unlocked AI GPU capacity impact for {report?.facility_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyMarkdown}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5"
            >
              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied Markdown' : 'Copy Markdown'}</span>
            </button>
            <button
              onClick={downloadMarkdown}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Report (.md)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {!report ? (
          <div className="p-12 text-center font-mono text-sm text-slate-400">
            Computing facility-wide thermodynamic & financial ROI model...
          </div>
        ) : (
          <div className="p-6 overflow-y-auto space-y-6">
            {/* Top 4 Headline KPI Cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>PUE Reduction</span>
                  <TrendingDown className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-xl font-mono font-bold text-white mt-1">
                  {report.baseline_pue.toFixed(3)} →{' '}
                  <span className="text-cyan-400">{report.optimized_pue.toFixed(3)}</span>
                </div>
                <div className="text-[11px] font-mono text-emerald-400 mt-1">
                  -{report.pue_reduction_pct}% Cooling Overhead Cut
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Annual OpEx Savings</span>
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                  ${report.annual_cost_savings_usd.toLocaleString()}/yr
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  {report.annual_mwh_saved.toLocaleString()} MWh/yr (-{report.power_saved_kw.toFixed(0)} kW)
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Unlocked AI Capacity</span>
                  <Server className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-xl font-mono font-bold text-purple-300 mt-1">
                  +{report.additional_ai_gpus_supported} GPUs
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  +{report.stranded_capacity_unlocked_kw.toFixed(0)} kW Reclaimed Power
                </div>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>ESG Carbon & Water</span>
                  <Leaf className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xl font-mono font-bold text-emerald-300 mt-1">
                  -{report.annual_carbon_saved_tons.toFixed(0)} tCO₂/yr
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-1">
                  -{report.annual_water_saved_kl.toLocaleString()} kL/yr Evaporative Water
                </div>
              </div>
            </div>

            {/* Engineering Value Levers Breakdown */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                AI Optimization Value Levers Breakdown
              </h3>
              <div className="space-y-2.5">
                {report.optimization_breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-950/90 border border-slate-800 rounded-lg p-3 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-white">{item.lever}</div>
                      <div className="text-[11px] text-slate-400">{item.mechanism}</div>
                    </div>
                    <div className="text-right font-mono shrink-0">
                      <div className="text-sm font-bold text-emerald-400">
                        ${item.annual_usd.toLocaleString()}/yr
                      </div>
                      <div className="text-xs text-cyan-300">-{item.kw_saved} kW</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CapEx Avoidance & 5-Year NPV */}
            <div className="grid grid-cols-3 gap-3 font-mono">
              <div className="bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-500/40 rounded-xl p-3.5">
                <div className="text-[11px] text-indigo-300">Avoided Tier-III CapEx</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  ${report.capex_avoided_usd.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400">
                  Value of reclaimed power at $8,500/kW build cost
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-900 to-cyan-950/40 border border-cyan-500/40 rounded-xl p-3.5">
                <div className="text-[11px] text-cyan-300">Deployment Payback</div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {report.payback_months} Months
                </div>
                <div className="text-[10px] text-slate-400">
                  Software-only BMS + CDU closed-loop integration
                </div>
              </div>

              <div className="bg-gradient-to-br from-slate-900 to-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5">
                <div className="text-[11px] text-emerald-300">5-Year Net Present Value</div>
                <div className="text-lg font-bold text-emerald-400 mt-0.5">
                  ${report.five_year_npv_usd.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400">
                  Combined OpEx + Stranded AI Compute Value
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
