import React, { useEffect, useState } from 'react';
import {
  Clock,
  Database,
  FastForward,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { DatasetInfo, ReplayTimelinePoint, TwinStateSnapshot } from '../types';

export const TimeSeriesReplayBar: React.FC<{
  onSnapshotUpdate: (snap: TwinStateSnapshot) => void;
  externalDatasetId?: string | null;
}> = ({ onSnapshotUpdate, externalDatasetId }) => {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('kaggle_green_ai_24h');
  const [timeline, setTimeline] = useState<ReplayTimelinePoint[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(170); // Default around 14:10 afternoon peak
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [expanded, setExpanded] = useState<boolean>(false);

  const refreshDatasets = () => {
    fetch('/api/datasets')
      .then((r) => r.json())
      .then((list: DatasetInfo[]) => {
        setDatasets(list);
      })
      .catch(console.error);
  };

  useEffect(() => {
    refreshDatasets();
  }, []);

  useEffect(() => {
    if (externalDatasetId) {
      refreshDatasets();
      setSelectedDatasetId(externalDatasetId);
    }
  }, [externalDatasetId]);

  useEffect(() => {
    fetch(`/api/replay/${selectedDatasetId}`)
      .then((r) => r.json())
      .then((points: ReplayTimelinePoint[]) => {
        setTimeline(points);
      })
      .catch(console.error);
  }, [selectedDatasetId]);

  const seekToStep = async (stepIdx: number) => {
    setCurrentStep(stepIdx);
    try {
      const res = await fetch('/api/replay/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: selectedDatasetId,
          step_index: stepIdx,
          apply_to_live_twin: true,
        }),
      });
      if (res.ok) {
        const snap: TwinStateSnapshot = await res.json();
        onSnapshotUpdate(snap);
      }
    } catch (e) {
      console.error('Replay seek error:', e);
    }
  };

  useEffect(() => {
    if (!isPlaying || timeline.length === 0) return;
    const intervalMs = Math.max(250, Math.floor(1500 / speedMultiplier));
    const timer = window.setInterval(() => {
      setCurrentStep((prev) => {
        const next = (prev + 1) % timeline.length;
        seekToStep(next);
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isPlaying, speedMultiplier, timeline.length, selectedDatasetId]);

  const activeDataset = datasets.find((d) => d.dataset_id === selectedDatasetId);
  const currentPoint = timeline[currentStep];

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-xl px-3.5 py-2.5 backdrop-blur-md space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: DuckDB / Parquet Dataset Selector */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
            <Database className="w-3 h-3 text-indigo-400" /> DuckDB + Parquet 24h Replay
          </span>
          <select
            value={selectedDatasetId}
            onChange={(e) => {
              setIsPlaying(false);
              setSelectedDatasetId(e.target.value);
            }}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-medium text-white focus:outline-none focus:border-cyan-400"
          >
            {datasets.map((ds) => (
              <option key={ds.dataset_id} value={ds.dataset_id}>
                {ds.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-mono text-cyan-400 hover:underline px-1.5"
          >
            {expanded ? 'Hide Events ▲' : 'Notable Events & Citation ▼'}
          </button>
        </div>

        {/* Center/Right: Playback Controls & Current Historical Timestamp */}
        <div className="flex items-center gap-2">
          {currentPoint && (
            <div className="flex items-center gap-2 font-mono text-xs bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-white font-bold">{currentPoint.hour_label}</span>
              <span className="text-slate-400">|</span>
              <span className="text-cyan-300">PUE {currentPoint.pue.toFixed(3)}</span>
              <span className="text-slate-400">|</span>
              <span
                className={
                  currentPoint.max_chip_temp_c >= 72 ? 'text-red-400 font-bold' : 'text-emerald-400'
                }
              >
                Chip {currentPoint.max_chip_temp_c.toFixed(1)}°C
              </span>
              {currentPoint.event_tag && (
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px]">
                  {currentPoint.event_tag}
                </span>
              )}
            </div>
          )}

          <button
            onClick={() => {
              if (!isPlaying) seekToStep(currentStep);
              setIsPlaying(!isPlaying);
            }}
            className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
              isPlaying
                ? 'bg-amber-500 text-slate-950'
                : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause Replay' : 'Replay 24h'}</span>
          </button>

          {[1, 4, 8].map((spd) => (
            <button
              key={spd}
              onClick={() => setSpeedMultiplier(spd)}
              className={`px-2 py-1 rounded text-[10px] font-mono border ${
                speedMultiplier === spd
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-200 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      {/* 24-Hour Timeline Scrubber Slider (288 x 5-min steps) */}
      {timeline.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-slate-500">00:00</span>
          <input
            type="range"
            min={0}
            max={timeline.length - 1}
            value={currentStep}
            onChange={(e) => seekToStep(parseInt(e.target.value, 10))}
            className="flex-1 accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <span className="text-[10px] font-mono text-slate-500">23:55</span>
        </div>
      )}

      {/* Expandable Dataset Metadata & One-Click Event Jump Bookmarks */}
      {expanded && activeDataset && (
        <div className="pt-1 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="text-slate-400">
            <strong className="text-slate-200">{activeDataset.source_citation}:</strong>{' '}
            {activeDataset.description}{' '}
            <span className="font-mono text-[10px] text-indigo-300">
              ({activeDataset.parquet_path.split('/').pop()})
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono uppercase text-slate-400">Jump to Incident:</span>
            {activeDataset.notable_events.map((ev, idx) => (
              <button
                key={idx}
                onClick={() => seekToStep(ev.step_index)}
                className="px-2 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-200 font-mono text-[10px]"
              >
                {ev.time_label} • {ev.event_tag} ({ev.peak_chip_c.toFixed(1)}°C)
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
