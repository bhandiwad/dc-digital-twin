import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Copy, FlaskConical } from 'lucide-react';
import {
  MOPDocumentResponse,
  TwinStateSnapshot,
  WhatIfRequest,
  WhatIfResponse,
} from '../../types';
import { WhatIfPanel } from './WhatIfPanel';

export interface PlanSandboxPanelProps {
  snapshot: TwinStateSnapshot;
  whatIfReq: WhatIfRequest;
  whatIfResult: WhatIfResponse | null;
  whatIfLoading: boolean;
  onChangeReq: (next: WhatIfRequest) => void;
  onRunWhatIf: (overrideReq?: WhatIfRequest) => void;
}

export const PlanSandboxPanel: React.FC<PlanSandboxPanelProps> = ({
  snapshot,
  whatIfReq,
  whatIfResult,
  whatIfLoading,
  onChangeReq,
  onRunWhatIf,
}) => {
  const [subMode, setSubMode] = useState<'what_if' | 'mop'>('what_if');

  const assetOptions = [
    ...snapshot.cdus.map((c) => ({ id: c.cdu_id, label: `${c.cdu_id} · Liquid CDU` })),
    ...snapshot.cracs.map((c) => ({ id: c.crac_id, label: `${c.crac_id} · Air CRAC` })),
    ...snapshot.pdus.map((p) => ({ id: p.pdu_id, label: `${p.pdu_id} · Row PDU` })),
  ];

  const [mopTarget, setMopTarget] = useState<string>(assetOptions[0]?.id || 'CDU-1');
  const [mopType, setMopType] = useState<string>('strainer_swap');
  const [mopDoc, setMopDoc] = useState<MOPDocumentResponse | null>(null);
  const [mopLoading, setMopLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const generateMop = async (targetId: string, procType: string) => {
    setMopLoading(true);
    try {
      const res = await fetch('/api/graphrag/mop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_component_id: targetId,
          procedure_type: procType,
          maintenance_window_minutes: 30,
        }),
      });
      if (res.ok) setMopDoc(await res.json());
    } finally {
      setMopLoading(false);
    }
  };

  useEffect(() => {
    if (subMode === 'mop' && !mopDoc && mopTarget) {
      generateMop(mopTarget, mopType);
    }
  }, [subMode]);

  const copyMarkdown = () => {
    if (!mopDoc) return;
    navigator.clipboard.writeText(mopDoc.markdown_document);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 bg-slate-900/80 border border-slate-800 rounded-lg p-1 gap-1">
        <button
          onClick={() => setSubMode('what_if')}
          className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            subMode === 'what_if'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Capacity What-If</span>
        </button>
        <button
          onClick={() => setSubMode('mop')}
          className={`py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            subMode === 'mop'
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>Maintenance Checklist</span>
        </button>
      </div>

      {subMode === 'what_if' ? (
        <WhatIfPanel
          racks={snapshot.racks}
          whatIfReq={whatIfReq}
          whatIfResult={whatIfResult}
          whatIfLoading={whatIfLoading}
          onChangeReq={onChangeReq}
          onRunWhatIf={onRunWhatIf}
        />
      ) : (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Maintenance Checklist (MOP)</h3>
              <p className="text-[11px] text-slate-400">
                Checks downstream racks and generates safe pre-cooling & isolation steps.
              </p>
            </div>
            {mopDoc && (
              <button
                onClick={copyMarkdown}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-[11px] text-slate-400">Equipment</label>
              <select
                value={mopTarget}
                onChange={(e) => {
                  setMopTarget(e.target.value);
                  generateMop(e.target.value, mopType);
                }}
                className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                {assetOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-400">Work Type</label>
              <select
                value={mopType}
                onChange={(e) => {
                  setMopType(e.target.value);
                  generateMop(mopTarget, e.target.value);
                }}
                className="w-full mt-1 bg-slate-950 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="strainer_swap">Strainer / Filter Service</option>
                <option value="vfd_replacement">Fan / Pump Drive Swap</option>
                <option value="breaker_thermography">Breaker Transfer & Scan</option>
              </select>
            </div>
          </div>

          {mopLoading || !mopDoc ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Checking affected racks & building checklist...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    Affected Scope: {mopDoc.blast_radius_racks.length} Racks ({mopDoc.total_affected_kw} kW)
                  </span>
                  <span className="text-[11px] text-amber-300">{mopDoc.risk_classification}</span>
                </div>
                <div className="text-slate-400">
                  Rows: {mopDoc.blast_radius_rows.join(', ')}
                </div>
                {Object.keys(mopDoc.required_precool_setpoints).length > 0 && (
                  <div className="text-sky-400 pt-0.5">
                    Pre-cool 15m before work:{' '}
                    {Object.entries(mopDoc.required_precool_setpoints)
                      .map(([k, v]) => `${k} → ${v}`)
                      .join(', ')}
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {mopDoc.steps.map((st) => (
                  <div
                    key={st.step_number}
                    className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100">
                        {st.step_number}. {st.phase}
                      </span>
                      <span className="text-[11px] text-emerald-400">{st.verification_metric}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{st.action}</p>
                    <div className="text-[11px] text-slate-400">
                      Stop / Rollback if: {st.rollback_trigger}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
