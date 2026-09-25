import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Heart, Zap, Smile, Users, ChevronDown, BookOpen, Brain } from 'lucide-react';
import { CognitiveMemoryDrawer } from './CognitiveMemoryDrawer';

export const AdaptiveHud = () => {
  const {
    activeCharacter,
    availableCharacters,
    selectCharacter,
    stateVariables,
    activeLorebooks,
  } = useAppStore();

  const [showSelector, setShowSelector] = useState(false);
  const [showMemoryDrawer, setShowMemoryDrawer] = useState(false);

  if (!activeCharacter) {
    return null;
  }

  const { data } = activeCharacter.card;
  const title = (data.extensions?.sow_title as string) || data.tags?.[0] || 'AI Companion';

  return (
    <div className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur px-4 py-2.5 flex items-center justify-between gap-4 z-40">
      {/* Left: Character Info & Quick Switcher */}
      <div className="flex items-center gap-3 relative">
        <div
          onClick={() => setShowSelector(!showSelector)}
          className="cursor-pointer relative group"
        >
          {activeCharacter.avatar_data_url ? (
            <img
              src={activeCharacter.avatar_data_url}
              alt={data.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-purple-500/60 shadow-md group-hover:border-purple-400 transition-colors"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold border-2 border-purple-500/60 shadow-md">
              {data.name.charAt(0)}
            </div>
          )}
          <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
        </div>

        <div>
          <button
            onClick={() => setShowSelector(!showSelector)}
            className="flex items-center gap-1.5 font-bold text-sm text-slate-100 hover:text-purple-300 transition-colors group"
          >
            <span>{data.name}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-300 transition-transform" />
          </button>
          <div className="text-[11px] text-slate-400 line-clamp-1">{title}</div>
        </div>

        {/* Character Switcher Popover */}
        {showSelector && (
          <div className="absolute top-12 left-0 w-72 rounded-xl bg-slate-900/95 border border-slate-700 shadow-2xl p-2 z-50 backdrop-blur space-y-1">
            <div className="text-[11px] font-semibold text-slate-400 px-2 py-1 flex items-center gap-1 border-b border-slate-800">
              <Users className="w-3.5 h-3.5" />
              <span>Verfügbare Charaktere</span>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {availableCharacters.map((char) => (
                <div
                  key={char.id}
                  onClick={() => {
                    selectCharacter(char);
                    setShowSelector(false);
                  }}
                  className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                    activeCharacter.id === char.id
                      ? 'bg-purple-600/30 text-purple-200 border border-purple-500/40'
                      : 'hover:bg-slate-800/80 text-slate-300'
                  }`}
                >
                  {char.avatar_data_url ? (
                    <img
                      src={char.avatar_data_url}
                      alt={char.card.data.name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center text-xs font-bold">
                      {char.card.data.name.charAt(0)}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <div className="text-xs font-semibold truncate">{char.card.data.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {char.card.data.personality || 'Keine Beschreibung'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Middle/Right: Adaptive State Variables HUD */}
      <div className="flex items-center gap-4 text-xs font-mono">
        {/* Lorebook Badge */}
        {activeLorebooks.length > 0 && (
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-slate-300 text-[11px]">
            <BookOpen className="w-3 h-3 text-amber-400" />
            <span>Lorebook Aktiv</span>
          </div>
        )}

        {/* State Variables */}
        {stateVariables.map((v, i) => {
          if (v.var_type === 'progress') {
            const val = parseInt(v.value) || 0;
            const max = v.max_value || 100;
            const percent = Math.min(100, Math.round((val / max) * 100));

            return (
              <div
                key={i}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60"
              >
                {v.name === 'Zuneigung' ? (
                  <Heart className="w-3.5 h-3.5 text-pink-400 fill-pink-400/40" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span className="text-slate-300 text-[11px] font-sans">{v.name}:</span>
                <div className="w-16 bg-slate-950 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      v.name === 'Zuneigung'
                        ? 'bg-gradient-to-r from-pink-500 to-rose-400'
                        : 'bg-gradient-to-r from-cyan-500 to-indigo-400'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-slate-200">
                  {val}/{max}
                </span>
              </div>
            );
          }

          return (
            <div
              key={i}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-[11px]"
            >
              <Smile className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-slate-400 font-sans">{v.name}:</span>
              <span className="text-purple-200 font-medium">{v.value}</span>
            </div>
          );
        })}

        {/* Cognitive Soul Memory Drawer Trigger */}
        <button
          onClick={() => setShowMemoryDrawer(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-950/50 border border-purple-500/40 text-purple-300 hover:bg-purple-900/60 hover:text-purple-200 transition text-[11px] font-medium shadow-sm cursor-pointer"
          title="Kognitiven Seelenspeicher öffnen"
        >
          <Brain className="w-3.5 h-3.5 text-purple-400" />
          <span>Seelenspeicher</span>
        </button>
      </div>

      <CognitiveMemoryDrawer
        isOpen={showMemoryDrawer}
        onClose={() => setShowMemoryDrawer(false)}
      />
    </div>
  );
};

