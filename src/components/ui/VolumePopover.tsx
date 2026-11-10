import React, { useEffect, useRef, useState } from 'react';
import { Dices, Mic, Music, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { audioPlayer } from '../../services/audioPlayer';
import { stageMusic } from '../../services/stageMusic';
import { soundFx } from '../../services/soundFx';
import { Slider } from './Slider';

interface VolumePopoverProps {
  /** Optional class for the trigger button */
  triggerClassName?: string;
  /** Alignment of the popover relative to the trigger */
  align?: 'left' | 'right';
  /** Popover placement above or below trigger */
  placement?: 'bottom' | 'top';
  /** Whether to show sound effects slider (e.g. for Stage adventure) */
  showSoundFx?: boolean;
  /** Show text label next to volume icon in trigger button */
  showLabel?: boolean;
  /** Label breakpoint, e.g. 'hidden xl:inline' or 'hidden md:inline' */
  labelClassName?: string;
  className?: string;
}

export const VolumePopover: React.FC<VolumePopoverProps> = ({
  triggerClassName = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition bg-slate-800/60 text-slate-400 border-slate-700/60 hover:text-slate-200',
  align = 'right',
  placement = 'bottom',
  showSoundFx = false,
  showLabel = true,
  labelClassName = 'hidden xl:inline',
  className = '',
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [musicVol, setMusicVol] = useState(() => Math.round(stageMusic.getVolume() * 100));
  const [ttsVol, setTtsVol] = useState(() => Math.round(audioPlayer.getVolume() * 100));
  const [fxVol, setFxVol] = useState(() => Math.round(soundFx.getVolume() * 100));
  const [isFxMuted, setIsFxMuted] = useState(() => soundFx.getIsMuted());

  const prevMusicVolRef = useRef(musicVol > 0 ? musicVol : 60);
  const prevTtsVolRef = useRef(ttsVol > 0 ? ttsVol : 100);

  // Sync with service volume updates (e.g. from StageMusicModal or settings)
  useEffect(() => {
    const unsubMusic = stageMusic.onVolume((vol) => {
      setMusicVol(Math.round(vol * 100));
      if (vol > 0) prevMusicVolRef.current = Math.round(vol * 100);
    });
    const unsubTts = audioPlayer.onVolume((vol) => {
      setTtsVol(Math.round(vol * 100));
      if (vol > 0) prevTtsVolRef.current = Math.round(vol * 100);
    });
    return () => {
      unsubMusic();
      unsubTts();
    };
  }, []);

  // Close on click outside or Escape
  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleMusicMute = () => {
    if (musicVol > 0) {
      prevMusicVolRef.current = musicVol;
      setMusicVol(0);
      stageMusic.setVolume(0);
    } else {
      const restore = prevMusicVolRef.current > 0 ? prevMusicVolRef.current : 60;
      setMusicVol(restore);
      stageMusic.setVolume(restore / 100);
    }
  };

  const toggleTtsMute = () => {
    if (ttsVol > 0) {
      prevTtsVolRef.current = ttsVol;
      setTtsVol(0);
      audioPlayer.setVolume(0);
    } else {
      const restore = prevTtsVolRef.current > 0 ? prevTtsVolRef.current : 100;
      setTtsVol(restore);
      audioPlayer.setVolume(restore / 100);
    }
  };

  const toggleFxMute = () => {
    const nextMute = !isFxMuted;
    soundFx.setMuted(nextMute);
    setIsFxMuted(nextMute);
  };

  const isAllMuted = musicVol === 0 && ttsVol === 0;

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={t('audio.volumeHint')}
        aria-label={t('audio.volume')}
        className={`${triggerClassName} ${
          open ? 'bg-slate-700/80 text-white border-slate-600' : ''
        }`}
      >
        {isAllMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
        {showLabel && <span className={labelClassName}>{t('audio.volume')}</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('audio.volume')}
          className={`absolute z-50 w-72 rounded-2xl border border-slate-700 bg-slate-900/95 p-4 text-xs text-slate-200 shadow-2xl backdrop-blur-md space-y-4 animate-in fade-in zoom-in-95 duration-100 ${
            placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
          } ${align === 'left' ? 'left-0' : 'right-0'}`}
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Volume2 className="w-4 h-4 text-accent-400" />
              {t('audio.volume')}
            </span>
          </div>

          {/* Musik-Lautstärke */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <Music className="w-3.5 h-3.5 text-accent-400" />
                {t('audio.musicVolume')}
              </span>
              <button
                type="button"
                onClick={toggleMusicMute}
                title={musicVol === 0 ? t('stage.unmute') : t('stage.mute')}
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                {musicVol === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Slider
              label=""
              min={0}
              max={100}
              step={5}
              value={musicVol}
              valueLabel={`${musicVol} %`}
              onValueChange={(val) => {
                setMusicVol(val);
                stageMusic.setVolume(val / 100);
                if (val > 0) prevMusicVolRef.current = val;
              }}
            />
          </div>

          {/* Stimmen-Lautstärke (TTS) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium text-slate-300">
                <Mic className="w-3.5 h-3.5 text-accent-400" />
                {t('audio.voiceVolume')}
              </span>
              <button
                type="button"
                onClick={toggleTtsMute}
                title={ttsVol === 0 ? t('stage.unmute') : t('stage.mute')}
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
              >
                {ttsVol === 0 ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
            <Slider
              label=""
              min={0}
              max={100}
              step={5}
              value={ttsVol}
              valueLabel={`${ttsVol} %`}
              onValueChange={(val) => {
                setTtsVol(val);
                audioPlayer.setVolume(val / 100);
                if (val > 0) prevTtsVolRef.current = val;
              }}
            />
          </div>

          {/* Soundeffekte (optional in Stage) */}
          {showSoundFx && (
            <div className="space-y-1.5 border-t border-slate-800/80 pt-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Dices className="w-3.5 h-3.5 text-accent-400" />
                  {t('audio.soundFxVolume')}
                </span>
                <button
                  type="button"
                  onClick={toggleFxMute}
                  title={isFxMuted ? t('stage.unmute') : t('stage.mute')}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                >
                  {isFxMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5" />}
                </button>
              </div>
              <Slider
                label=""
                min={0}
                max={100}
                step={5}
                disabled={isFxMuted}
                value={isFxMuted ? 0 : fxVol}
                valueLabel={isFxMuted ? '0 %' : `${fxVol} %`}
                onValueChange={(val) => {
                  setFxVol(val);
                  soundFx.setVolume(val / 100);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
