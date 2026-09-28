import React, { useEffect, useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import {
  Heart,
  Zap,
  Flame,
  Moon,
  Camera,
  Clipboard,
  MessageSquare,
  X,
  Eye,
  Smile,
} from 'lucide-react';
import { useTranslation } from '../../i18n';

export const FloatingCompanionOverlay: React.FC = () => {
  const { t, tEmotion } = useTranslation();
  const {
    companionState,
    fetchCompanionState,
    applyHormoneInteraction,
    requestToolCall,
    toggleCompanionOverlay,
    activeCharacter,
  } = useStoreFields(
    'companionState', 'fetchCompanionState', 'applyHormoneInteraction', 'requestToolCall',
    'toggleCompanionOverlay', 'activeCharacter',
  );

  const [clickThrough, setClickThrough] = useState(false);
  const [bubbleText, setBubbleText] = useState<string>('Hallo! Ich begleite dich bei deiner Arbeit.');

  useEffect(() => {
    fetchCompanionState();
    const interval = setInterval(() => {
      fetchCompanionState();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchCompanionState]);

  const hormones = companionState?.hormones;
  const emotion = companionState?.emotion?.current || 'warm';
  const recentThought = companionState?.scratchpad?.[0]?.thought;

  const handlePet = async () => {
    await applyHormoneInteraction('compliment');
    setBubbleText('Das tut gut! Ich bin gerne an deiner Seite. ✨');
  };

  const handleAskScreen = async () => {
    setBubbleText('Ich werfe einen Blick auf deinen Bildschirm...');
    const res = await requestToolCall('take_screenshot', {});
    if (res) {
      setBubbleText('Screenshot erfasst! Dein Arbeitsplatz sieht produktiv aus.');
    }
  };

  const handleReadClipboard = async () => {
    const res = await requestToolCall('read_clipboard', {});
    if (res) {
      setBubbleText('Ich habe deine Zwischenablage im Blick.');
    }
  };

  const toggleClickThrough = async () => {
    const next = !clickThrough;
    setClickThrough(next);
    await toggleCompanionOverlay(true, next);
  };

  const handleClose = async () => {
    await toggleCompanionOverlay(false);
  };

  return (
    <div className="w-screen h-screen bg-transparent flex flex-col justify-end items-end p-4 select-none pointer-events-auto">
      {/* Floating Container */}
      <div className="w-80 rounded-3xl bg-app/85 backdrop-blur-xl border border-cyan-500/30 shadow-2xl p-4 flex flex-col gap-3 text-slate-100 relative group animate-in fade-in zoom-in-95 duration-300">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold font-mono text-cyan-300">
              {activeCharacter?.card?.data?.name || 'Soul Companion'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleClickThrough}
              title={clickThrough ? 'Click-Through aktiv' : 'Click-Through umschalten'}
              className={`p-1 rounded-lg border text-xs transition ${
                clickThrough
                  ? 'bg-amber-950/80 border-amber-500/60 text-amber-300'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleClose}
              title={t('overlay.close')}
              aria-label={t('overlay.close')}
              className="p-1 rounded-lg bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/50 text-slate-400 hover:text-rose-300 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Speech Bubble */}
        <div className="p-3 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-100/90 leading-relaxed shadow-inner">
          <div className="flex items-center gap-1.5 text-[11px] text-cyan-400 font-mono mb-1">
            <MessageSquare className="w-3 h-3" />
            <span>
              {t('overlay.feeling')} <strong>{tEmotion(emotion)}</strong> • {hormones?.mood_label || t('overlay.active')}
            </span>
          </div>
          <p className="italic">"{bubbleText}"</p>
          {recentThought && (
            <div className="mt-2 pt-1.5 border-t border-cyan-500/10 text-[11px] text-slate-400">
              💭 <em>{recentThought}</em>
            </div>
          )}
        </div>

        {/* Hormone Mini Gauges */}
        {hormones && (
          <div className="grid grid-cols-4 gap-1.5 text-[11px] font-mono">
            <div className="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col items-center">
              <Zap className="w-3 h-3 text-amber-400 mb-0.5" />
              <span className="text-amber-300">{Math.round(hormones.dopamine)}%</span>
            </div>
            <div className="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col items-center">
              <Flame className="w-3 h-3 text-rose-400 mb-0.5" />
              <span className="text-rose-300">{Math.round(hormones.cortisol)}%</span>
            </div>
            <div className="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col items-center">
              <Heart className="w-3 h-3 text-accent2-400 fill-accent2-400/40 mb-0.5" />
              <span className="text-accent2-300">{Math.round(hormones.oxytocin)}%</span>
            </div>
            <div className="p-1.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col items-center">
              <Moon className="w-3 h-3 text-indigo-400 mb-0.5" />
              <span className="text-indigo-300">{Math.round(hormones.fatigue)}%</span>
            </div>
          </div>
        )}

        {/* Quick Action Dock */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            onClick={handlePet}
            className="py-1.5 px-2 rounded-xl bg-accent2-950/40 hover:bg-accent2-900/50 border border-accent2-500/30 text-accent2-300 text-xs font-medium flex items-center justify-center gap-1 transition active:scale-95"
          >
            <Smile className="w-3 h-3" />
            <span>Kraulen</span>
          </button>
          <button
            onClick={handleAskScreen}
            className="py-1.5 px-2 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-cyan-300 text-xs font-medium flex items-center justify-center gap-1 transition active:scale-95"
          >
            <Camera className="w-3 h-3" />
            <span>Screen</span>
          </button>
          <button
            onClick={handleReadClipboard}
            className="py-1.5 px-2 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 text-indigo-300 text-xs font-medium flex items-center justify-center gap-1 transition active:scale-95"
          >
            <Clipboard className="w-3 h-3" />
            <span>Clip</span>
          </button>
        </div>
      </div>
    </div>
  );
};
