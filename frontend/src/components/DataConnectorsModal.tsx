import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Cable,
  Database,
  Download,
  FileSpreadsheet,
  Play,
  Radio,
  RefreshCw,
  Server,
  Upload,
  X,
} from 'lucide-react';
import {
  ConnectorSpec,
  ConnectorTestResponse,
  BYODIngestResponse,
} from '../types';

export const DataConnectorsModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onDatasetIngested: (datasetId: string) => void;
}> = ({ isOpen, onClose, onDatasetIngested }) => {
  const [activeMode, setActiveMode] = useState<'byod_upload' | 'live_connectors'>('byod_upload');
  const [connectors, setConnectors] = useState<ConnectorSpec[]>([]);
  const [selectedConnector, setSelectedConnector] = useState<ConnectorSpec | null>(null);
  const [testResult, setTestResult] = useState<ConnectorTestResponse | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // BYOD CSV Upload State
  const [datasetName, setDatasetName] = useState<string>('Operator Hall-02 BMS Export');
  const [vendorProfile, setVendorProfile] = useState<string>('schneider_bms');
  const [csvContent, setCsvContent] = useState<string>('');
  const [ingesting, setIngesting] = useState<boolean>(false);
  const [ingestResult, setIngestResult] = useState<BYODIngestResponse | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/connectors')
      .then((r) => r.json())
      .then((list: ConnectorSpec[]) => {
        setConnectors(list);
        if (list.length > 0 && !selectedConnector) {
          setSelectedConnector(list[0]);
        }
      })
      .catch(console.error);

    // Preload a sample CSV so the user can test 1-click ingestion immediately
    if (!csvContent) {
      loadSampleCsv('schneider_bms', 'Schneider EcoStruxure Customer Trace');
    }
  }, [isOpen]);

  const loadSampleCsv = async (profile: string, defaultTitle: string) => {
    setVendorProfile(profile);
    setDatasetName(defaultTitle);
    try {
      const res = await fetch(`/api/connectors/sample-csv/${profile}`);
      if (res.ok) {
        const text = await res.text();
        setCsvContent(text);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDatasetName(file.name.replace(/\.(csv|txt)$/i, ''));
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setCsvContent(ev.target.result);
      }
    };
    reader.readAsText(file);
  };

  const runByodIngest = async () => {
    if (!csvContent.trim()) return;
    setIngesting(true);
    try {
      const res = await fetch('/api/connectors/ingest-byod', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_name: datasetName,
          vendor_profile: vendorProfile,
          csv_content: csvContent,
          apply_immediately: true,
        }),
      });
      if (res.ok) {
        const data: BYODIngestResponse = await res.json();
        setIngestResult(data);
        onDatasetIngested(data.dataset_id);
      }
    } finally {
      setIngesting(false);
    }
  };

  const testProtocolConnector = async (connId: string) => {
    setTestingId(connId);
    try {
      const res = await fetch('/api/connectors/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connector_id: connId,
          sync_to_live_twin: true,
        }),
      });
      if (res.ok) {
        const data: ConnectorTestResponse = await res.json();
        setTestResult(data);
        onDatasetIngested('');
      }
    } finally {
      setTestingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-[#080f1d] border border-indigo-500/40 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl shadow-indigo-500/10 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-slate-950 font-bold">
              <Cable className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Enterprise BMS / DCIM / GPU Connectors & "Bring Your Own Data" (BYOD) Hub
              </h2>
              <p className="text-xs text-slate-400">
                Ingest customer CSV/Parquet historian exports with AI fuzzy column mapping or connect live BACnet/IP, Modbus, Redfish & NVIDIA DCGM streams
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <button
                onClick={() => setActiveMode('byod_upload')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  activeMode === 'byod_upload'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                1. BYOD CSV / Historian Ingest
              </button>
              <button
                onClick={() => setActiveMode('live_connectors')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  activeMode === 'live_connectors'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                2. Live Protocol Bridges (BACnet / DCGM / Redfish)
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {activeMode === 'byod_upload' ? (
            <div className="grid grid-cols-12 gap-5">
              {/* Left 6 Cols: Upload / Template Picker / Raw CSV Preview */}
              <div className="col-span-6 space-y-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4" /> Load Vendor Template or Upload Customer CSV
                    </span>
                    <a
                      href={`/api/connectors/sample-csv/${vendorProfile}`}
                      download
                      className="text-[11px] font-mono text-indigo-300 hover:underline flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> Download .CSV
                    </a>
                  </div>

                  {/* 3 One-Click Vendor Presets */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        id: 'schneider_bms',
                        title: 'Schneider EcoStruxure',
                        sub: 'BMS + Liebert CRAC/CDU',
                      },
                      {
                        id: 'nvidia_dcgm',
                        title: 'NVIDIA DCGM Export',
                        sub: 'Prometheus GPU Telemetry',
                      },
                      {
                        id: 'sunbird_dcim',
                        title: 'Sunbird / OSIsoft PI',
                        sub: 'DCIM Power & ASHRAE',
                      },
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => loadSampleCsv(preset.id, `${preset.title} Customer Trace`)}
                        className={`text-left p-2.5 rounded-lg border transition-all ${
                          vendorProfile === preset.id
                            ? 'bg-cyan-950/70 border-cyan-400 text-cyan-100'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-xs font-bold">{preset.title}</div>
                        <div className="text-[10px] text-slate-400">{preset.sub}</div>
                      </button>
                    ))}
                  </div>

                  {/* Custom File Upload Input & Dataset Title */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">
                        Customer Facility / Dataset Name
                      </label>
                      <input
                        type="text"
                        value={datasetName}
                        onChange={(e) => setDatasetName(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400">
                        Or Upload Operator .CSV File
                      </label>
                      <label className="mt-1 w-full flex items-center justify-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-dashed border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-xs text-cyan-300 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Choose Local CSV File...</span>
                        <input
                          type="file"
                          accept=".csv,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Editable CSV Preview Box */}
                  <div>
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>Raw Vendor Telemetry Preview (Editable CSV):</span>
                      <span>{csvContent.split('\n').length - 1} rows</span>
                    </div>
                    <textarea
                      value={csvContent}
                      onChange={(e) => setCsvContent(e.target.value)}
                      rows={8}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 font-mono text-[10px] text-slate-300 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <button
                    onClick={runByodIngest}
                    disabled={ingesting}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2"
                  >
                    <Database className="w-4 h-4" />
                    <span>
                      {ingesting
                        ? 'Auto-Mapping Schema & Calibrating 3D Digital Twin...'
                        : 'Ingest into DuckDB/Parquet & Calibrate 3D Digital Twin'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Right 6 Cols: AI Schema Mapping & Calibration Results */}
              <div className="col-span-6 space-y-4">
                {!ingestResult ? (
                  <div className="h-full bg-slate-900/60 border border-slate-800 rounded-xl p-6 flex flex-col justify-center space-y-3 text-xs text-slate-300">
                    <div className="text-sm font-bold text-white">
                      How Operator BYOD Calibration Works:
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      1. **Fuzzy Vendor Header Recognition**: Automatically maps Schneider EcoStruxure, Siemens, Vertiv, Sunbird, or NVIDIA DCGM column names (`Schneider_IT_Load_kW`, `dcgm_fi_dev_gpu_temp`, `Ambient_WetBulb_DegC`) to Aether-DCTWIN's canonical physics schema.
                    </p>
                    <p className="text-slate-400 leading-relaxed">
                      2. **Unit Normalization & DuckDB Parquet Storage**: Converts `W → kW`, validates PUE and cooling power balance, and writes a permanent `.parquet` file into the 24-hour Time-Series Scrubber.
                    </p>
                    <p className="text-slate-400 leading-relaxed">
                      3. **Live 3D Twin Calibration**: Synchronizes the 32-rack 3D scene to the customer's peak thermal interval so you can immediately open the **Executive ROI Report** and show their exact dollar and PUE savings.
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-900/95 border border-emerald-500/50 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        Customer Telemetry Ingested & Calibrated
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                        {ingestResult.rows_ingested} Intervals → Parquet
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed">{ingestResult.summary}</p>

                    <div className="grid grid-cols-3 gap-2 font-mono text-center">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                        <div className="text-[10px] text-slate-400">Customer Baseline PUE</div>
                        <div className="text-sm font-bold text-cyan-300">
                          {ingestResult.calibrated_baseline_pue.toFixed(3)}
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                        <div className="text-[10px] text-slate-400">Peak IT Load</div>
                        <div className="text-sm font-bold text-white">
                          {ingestResult.calibrated_peak_it_kw.toFixed(0)} kW
                        </div>
                      </div>
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
                        <div className="text-[10px] text-slate-400">Peak GPU Temp</div>
                        <div className="text-sm font-bold text-amber-300">
                          {ingestResult.calibrated_peak_chip_c.toFixed(1)}°C
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-mono uppercase text-slate-400 mb-1.5">
                        AI Schema Auto-Mapper ({ingestResult.columns_mapped.length} Columns Matched):
                      </div>
                      <div className="max-h-[210px] overflow-y-auto space-y-1 pr-1">
                        {ingestResult.columns_mapped.map((cm, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-slate-950 border border-slate-800/90 rounded px-2.5 py-1 text-[11px] font-mono"
                          >
                            <span className="text-slate-300">{cm.source_column}</span>
                            <span className="text-cyan-400">→ {cm.canonical_field}</span>
                            <span className="text-emerald-400 text-[10px]">
                              {(cm.confidence * 100).toFixed(0)}% ({cm.unit_detected})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Mode 2: Live Industrial Protocol Connectors (BACnet, Modbus, Redfish, NVIDIA DCGM, MQTT) */
            <div className="grid grid-cols-12 gap-5">
              <div className="col-span-5 space-y-2.5">
                {connectors.map((c) => {
                  const isSel = selectedConnector?.connector_id === c.connector_id;
                  return (
                    <div
                      key={c.connector_id}
                      onClick={() => setSelectedConnector(c)}
                      className={`cursor-pointer p-3 rounded-xl border transition-all space-y-1 ${
                        isSel
                          ? 'bg-slate-900 border-cyan-400 ring-1 ring-cyan-400/40'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{c.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/40">
                          {c.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">{c.vendor_examples}</div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-cyan-300 pt-1">
                        <span>{c.points_mapped} Telemetry Points</span>
                        <span>Latency: {c.last_sync_ms}ms</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="col-span-7">
                {selectedConnector && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-cyan-400">
                          {selectedConnector.target_layer}
                        </span>
                        <h3 className="text-sm font-bold text-white">{selectedConnector.name}</h3>
                      </div>
                      <button
                        onClick={() => testProtocolConnector(selectedConnector.connector_id)}
                        disabled={testingId === selectedConnector.connector_id}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                      >
                        <Radio className="w-3.5 h-3.5" />
                        <span>
                          {testingId === selectedConnector.connector_id
                            ? 'Polling Registers...'
                            : 'Test Handshake & Poll Live Frame'}
                        </span>
                      </button>
                    </div>

                    <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-xs text-slate-300 flex items-center justify-between">
                      <span>Endpoint: {selectedConnector.endpoint_url}</span>
                      <span className="text-emerald-400">Poll: {selectedConnector.polling_interval_sec}s</span>
                    </div>

                    <div>
                      <div className="text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Register / OpenMetrics Mapping Table:
                      </div>
                      <div className="space-y-1">
                        {selectedConnector.register_or_metric_map.map((m, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-slate-950/90 border border-slate-800 rounded px-2.5 py-1 text-[11px] font-mono"
                          >
                            <span className="text-indigo-300">{m.source}</span>
                            <span className="text-cyan-300">→ {m.target}</span>
                            <span className="text-slate-400">{m.unit}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {testResult && testResult.connector_id === selectedConnector.connector_id && (
                      <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-mono text-emerald-300">
                          <span>✓ LIVE FRAME POLLED ({testResult.records_polled} points)</span>
                          <span>RTT: {testResult.latency_ms}ms</span>
                        </div>
                        <p className="text-[11px] text-slate-200">{testResult.calibration_summary}</p>
                        <pre className="bg-slate-950 p-2 rounded border border-slate-800 text-[10px] font-mono text-cyan-200 overflow-x-auto">
                          {JSON.stringify(testResult.raw_frame_sample, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
