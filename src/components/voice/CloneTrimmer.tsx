import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Scissors, Sparkles, Square } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { suggestClip, trimSamples, waveformPeaks, type ClipRange } from '../../utils/audioClip';

const BUCKETS = 160;
const MIN_SPAN_SECS = 1;

interface CloneTrimmerProps {
  source: Float32Array;
  rate: number;
  range: ClipRange;
  onRange: (range: ClipRange) => void;
}

/**
 * Picks the part of a longer recording that becomes the voice reference: waveform with the chosen
 * span, sliders for start and end, a suggestion for the best span and listening to the cut.
 */
export const CloneTrimmer = ({ source, rate, range, onRange }: CloneTrimmerProps) => {
  const { t } = useTranslation();
  const duration = source.length / rate;
  const peaks = useMemo(() => waveformPeaks(source, BUCKETS), [source]);
  const [playing, setPlaying] = useState(false);
  const player = useRef<{ context: AudioContext; node: AudioBufferSourceNode } | null>(null);

  const stop = () => {
    const current = player.current;
    player.current = null;
    if (current) {
      current.node.onended = null;
      try {
        current.node.stop();
      } catch {
        // Already finished.
      }
      void current.context.close();
    }
    setPlaying(false);
  };
  useEffect(() => stop, []);
  // A new recording or file stops the old preview.
  useEffect(() => stop, [source]);

  const play = () => {
    stop();
    const clip = trimSamples(source, rate, range);
    if (!clip.length) return;
    const context = new AudioContext();
    const buffer = context.createBuffer(1, clip.length, rate);
    buffer.copyToChannel(clip as Float32Array<ArrayBuffer>, 0);
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    node.onended = stop;
    node.start();
    player.current = { context, node };
    setPlaying(true);
  };

  const setStart = (value: number) => onRange({ start: Math.min(value, range.end - MIN_SPAN_SECS), end: range.end });
  const setEnd = (value: number) => onRange({ start: range.start, end: Math.max(value, range.start + MIN_SPAN_SECS) });
  const span = range.end - range.start;
  const left = (range.start / duration) * 100;
  const width = (span / duration) * 100;
  const sliderClass = 'w-full accent-accent-500';

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 space-y-2" data-clone-trim={`${range.start.toFixed(2)}-${range.end.toFixed(2)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-200 font-medium flex items-center gap-1.5">
          <Scissors className="w-3.5 h-3.5 text-accent-400" />
          {t('localTts.trimTitle')}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRange(suggestClip(source, rate))}
            className="px-2 py-1 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            {t('localTts.trimSuggest')}
          </button>
          <button
            type="button"
            onClick={() => (playing ? stop() : play())}
            className="px-2 py-1 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1"
          >
            {playing ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {playing ? t('localTts.trimStop') : t('localTts.trimPlay')}
          </button>
        </div>
      </div>
      <div className="relative h-14 rounded bg-app/60 overflow-hidden" aria-hidden>
        <div className="absolute inset-y-0 bg-accent-500/15 border-x border-accent-400" style={{ left: `${left}%`, width: `${width}%` }} />
        <svg viewBox={`0 0 ${BUCKETS} 100`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          {peaks.map((peak, i) => {
            const height = Math.max(1, Math.min(1, peak) * 96);
            const inside = (i + 0.5) / BUCKETS >= range.start / duration && (i + 0.5) / BUCKETS <= range.end / duration;
            return (
              <rect
                key={i}
                x={i + 0.15}
                y={50 - height / 2}
                width={0.7}
                height={height}
                className={inside ? 'fill-accent-300' : 'fill-slate-600'}
              />
            );
          })}
        </svg>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
        <label className="space-y-0.5">
          <span>{t('localTts.trimStart', { seconds: range.start.toFixed(1) })}</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={range.start}
            onChange={(e) => setStart(Number(e.target.value))}
            className={sliderClass}
          />
        </label>
        <label className="space-y-0.5">
          <span>{t('localTts.trimEnd', { seconds: range.end.toFixed(1) })}</span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={range.end}
            onChange={(e) => setEnd(Number(e.target.value))}
            className={sliderClass}
          />
        </label>
      </div>
      <p className="text-xs text-slate-500">{t('localTts.trimHint')}</p>
    </div>
  );
};
