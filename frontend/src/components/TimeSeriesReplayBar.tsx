import React, { useEffect, useState } from 'react';
import { Clock, Pause, Play } from 'lucide-react';
import { DatasetInfo, ReplayTimelinePoint, TwinStateSnapshot } from '../types';

export const TimeSeriesReplayBar: React.FC<{
  onSnapshotUpdate: (snap: TwinStateSnapshot) => void;
  externalDatasetId?: string | null;
}> = ({ onSnapshotUpdate, externalDatasetId }) => {
  const [datasets, setDatasets] = useState<DatasetInfo[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('kaggle_green_ai_24h');
  const [timeline, setTimeline] = useState<ReplayTimelinePoint[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(170);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);

  const refreshDatasets = () => {
    fetch('/api/datasets')
      .then((r) => r.json())
      .then((list: DatasetInfo[]) => setDatasets(list))
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
      .then((points: ReplayTimelinePoint[]) => setTimeline(points))
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
    <div className="space-y-2.5 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <select
            value={selectedDatasetId}
            onChange={(e) => {
              setIsPlaying(false);
              setSelectedDatasetId(e.target.value);
            }}
            className="bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {datasets.map((ds) => (
              <option key={ds.dataset_id} value={ds.dataset_id}>
                {ds.name}
              </option>
            ))}
          </select>

          {activeDataset && activeDataset.notable_events.length > 0 && (
            <div className="hidden xl:flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Jump to:</span>
              {activeDataset.notable_events.map((ev, idx) => (
                <button
                  key={idx}
                  onClick={() => seekToStep(ev.step_index)}
                  className="px-2 py-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-amber-300 text-[11px] font-medium transition-colors"
                >
                  {ev.time_label} · {ev.event_tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentPoint && (
            <div className="flex items-center gap-2 text-xs tabular-nums text-slate-300 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded-lg">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold text-white">{currentPoint.hour_label}</span>
              <span className="text-slate-600">·</span>
              <span>PUE {currentPoint.pue.toFixed(2)}</span>
              <span className="text-slate-600">·</span>
              <span>Inlet {currentPoint.max_inlet_temp_c.toFixed(1)}°C</span>
            </div>
          )}

          <button
            onClick={() => {
              if (!isPlaying) seekToStep(currentStep);
              setIsPlaying(!isPlaying);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isPlaying
                ? 'bg-amber-500 text-slate-950'
                : 'bg-sky-500 hover:bg-sky-400 text-slate-950'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Play 24h'}</span>
          </button>

          <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {[1, 4, 8].map((spd) => (
              <button
                key={spd}
                onClick={() => setSpeedMultiplier(spd)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium tabular-nums transition-colors ${
                  speedMultiplier === spd
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {timeline.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-[11px] tabular-nums text-slate-500">00:00</span>
          <input
            type="range"
            min={0}
            max={timeline.length - 1}
            value={currentStep}
            onChange={(e) => seekToStep(parseInt(e.target.value, 10))}
            className="flex-1 accent-sky-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
          <span className="text-[11px] tabular-nums text-slate-500">23:55</span>
        </div>
      )}
    </div>
  );
};
