import React from 'react';
import { CampaignClock } from '../../types';
import { Trash2 } from 'lucide-react';

interface ClockWidgetProps {
  clock: CampaignClock;
  onUpdateProgress: (clockId: string, progress: number) => void;
  onDelete: (clockId: string) => void;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({
  clock,
  onUpdateProgress,
  onDelete,
}) => {
  const { id, name, current, max, clock_type } = clock;
  const isComplete = current >= max;

  // Generate SVG pie segments
  const size = 110;
  const center = size / 2;
  const radius = 46;

  const getWedgePath = (index: number, total: number) => {
    const anglePerSegment = (2 * Math.PI) / total;
    // Start at top (-PI/2)
    const startAngle = -Math.PI / 2 + index * anglePerSegment;
    const endAngle = startAngle + anglePerSegment;

    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);

    // Large arc flag is 0 because segments are always < 180 deg
    return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
  };

  const getClockColor = (filled: boolean) => {
    if (!filled) return 'fill-slate-800/80 stroke-slate-700/60';
    if (clock_type === 'danger') {
      return isComplete
        ? 'fill-rose-500 stroke-rose-400'
        : 'fill-rose-500/80 stroke-rose-400/80';
    }
    if (clock_type === 'mystery') {
      return isComplete
        ? 'fill-accent-500 stroke-accent-400'
        : 'fill-accent-500/80 stroke-accent-400/80';
    }
    return isComplete
      ? 'fill-amber-500 stroke-amber-400'
      : 'fill-amber-500/80 stroke-amber-400/80';
  };

  const handleWedgeClick = (idx: number) => {
    // If clicked segment is current, toggle it down, otherwise set to clicked segment + 1
    const nextVal = current === idx + 1 ? idx : idx + 1;
    onUpdateProgress(id, nextVal);
  };

  return (
    <div
      className={`p-3.5 rounded-2xl border transition-all flex flex-col items-center relative group ${
        isComplete
          ? 'bg-rose-950/20 border-rose-500/50 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/30'
          : 'bg-slate-900/70 border-slate-800/80 hover:border-slate-700'
      }`}
    >
      <button
        onClick={() => onDelete(id)}
        title="Uhr löschen"
        className="absolute top-2.5 right-2.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition p-1"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="relative my-1 cursor-pointer">
        <svg width={size} height={size} className="overflow-visible">
          {/* Background circle outline */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            className="fill-app stroke-slate-700/50 stroke-2"
          />

          {/* Wedges */}
          {Array.from({ length: max }).map((_, idx) => {
            const filled = idx < current;
            return (
              <path
                key={idx}
                d={getWedgePath(idx, max)}
                onClick={() => handleWedgeClick(idx)}
                className={`cursor-pointer transition-all stroke-[1.5] ${getClockColor(
                  filled
                )} hover:opacity-90`}
              />
            );
          })}

          {/* Inner center hub */}
          <circle
            cx={center}
            cy={center}
            r={12}
            className="fill-app stroke-slate-700/80 stroke-2 pointer-events-none"
          />
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[11px] font-mono font-bold text-slate-200">
            {current}/{max}
          </span>
        </div>
      </div>

      <div className="text-center mt-1">
        <h4 className="text-xs font-semibold text-slate-200 line-clamp-1">{name}</h4>
        <span
          className={`text-[10px] font-mono uppercase tracking-wider ${
            isComplete
              ? 'text-rose-400 font-bold animate-pulse'
              : 'text-slate-400'
          }`}
        >
          {isComplete ? '⚠️ AUSGELÖST!' : `${clock_type}`}
        </span>
      </div>
    </div>
  );
};
