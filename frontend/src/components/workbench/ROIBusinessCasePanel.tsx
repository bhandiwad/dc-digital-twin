import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Download, TrendingUp } from 'lucide-react';
import { ExecutiveROIReport } from '../../types';

export interface ROIBusinessCasePanelProps {
  livePue: number;
}

export const ROIBusinessCasePanel: React.FC<ROIBusinessCasePanelProps> = ({ livePue }) => {
  const [report, setReport] = useState<ExecutiveROIReport | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/roi-report')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ExecutiveROIReport | null) => {
        if (data) setReport(data);
      })
      .catch(console.error);
  }, [livePue]);

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
    a.download = `${report.report_id}_ROI_Summary.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!report) {
    return (
      <div className="py-10 text-center text-xs text-slate-400">
        Calculating facility financial & capacity summary...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header & Export Actions */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-white">ROI & Unlocked Capacity</h3>
              <p className="text-[11px] text-slate-400">{report.facility_name}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={copyMarkdown}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1 transition-colors"
            >
              {copied ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={downloadMarkdown}
              className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>.md</span>
            </button>
          </div>
        </div>

        {/* 2x2 Headline Metrics */}
        <div className="grid grid-cols-2 gap-2.5 tabular-nums">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Annual OpEx Savings</div>
            <div className="text-base font-semibold text-emerald-400 mt-0.5">
              ${report.annual_cost_savings_usd.toLocaleString()}/yr
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {report.annual_mwh_saved.toLocaleString()} MWh/yr (-{report.power_saved_kw.toFixed(0)} kW)
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">PUE Reduction</div>
            <div className="text-base font-semibold text-white mt-0.5">
              {report.baseline_pue.toFixed(2)}{' '}
              <span className="text-sky-400">→ {report.optimized_pue.toFixed(2)}</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-0.5">
              -{report.pue_reduction_pct}% cooling overhead
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Unlocked AI Capacity</div>
            <div className="text-base font-semibold text-sky-300 mt-0.5">
              +{report.additional_ai_gpus_supported} GPUs
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              +{report.stranded_capacity_unlocked_kw.toFixed(0)} kW reclaimed headroom
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
            <div className="text-[11px] text-slate-400">Carbon & Water Saved</div>
            <div className="text-base font-semibold text-emerald-300 mt-0.5">
              -{report.annual_carbon_saved_tons.toFixed(0)} tCO₂/yr
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              -{report.annual_water_saved_kl.toLocaleString()} kL/yr cooling water
            </div>
          </div>
        </div>

        {/* 3-Column Capital Efficiency Strip */}
        <div className="grid grid-cols-3 gap-2 tabular-nums text-xs">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">5-Year NPV</div>
            <div className="font-semibold text-emerald-400 mt-0.5">
              ${report.five_year_npv_usd.toLocaleString()}
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">Avoided CapEx</div>
            <div className="font-semibold text-white mt-0.5">
              ${report.capex_avoided_usd.toLocaleString()}
            </div>
          </div>
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5">
            <div className="text-[11px] text-slate-400">Payback</div>
            <div className="font-semibold text-sky-400 mt-0.5">{report.payback_months} mo</div>
          </div>
        </div>
      </div>

      {/* Savings Breakdown by Operational Lever */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2.5">
        <h4 className="text-xs font-semibold text-slate-200">Savings Breakdown by Lever</h4>
        <div className="space-y-2 tabular-nums">
          {report.optimization_breakdown.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-0.5">
                <div className="font-medium text-white">{item.lever}</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">{item.mechanism}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold text-emerald-400">
                  ${item.annual_usd.toLocaleString()}/yr
                </div>
                <div className="text-[11px] text-sky-400">-{item.kw_saved} kW</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
