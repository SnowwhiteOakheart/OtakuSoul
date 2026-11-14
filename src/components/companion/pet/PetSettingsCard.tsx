import { useEffect, useRef } from 'react';
import type React from 'react';
import { AppWindow, ArrowLeft, EyeOff, Plus, X } from 'lucide-react';
import type { TranslationKey } from '../../../i18n';
import type { PetMenuModel, PetSetting } from './petMenuModel';

interface PetSettingsCardProps {
  model: PetMenuModel;
  /** Where the card stands (logical px in the window): centred on the figure, as wide as it may be. */
  left: number;
  width: number;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  /** Back to the ring. */
  onBack: () => void;
  onClose: () => void;
}

const chip = (active: boolean, on = true) =>
  `rounded-lg border px-2 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    active
      ? 'border-accent-400 bg-accent-600/80 text-white'
      : on
        ? 'border-slate-700 bg-slate-900/80 text-slate-300 hover:border-accent-500/60'
        : 'border-slate-800 bg-slate-900/60 text-slate-500'
  }`;

function SettingRow({ setting }: { setting: PetSetting }) {
  if (setting.kind === 'toggle') {
    const on = setting.enabled !== false;
    return (
      <button
        type="button"
        role="switch"
        aria-checked={setting.checked}
        disabled={!on}
        onClick={() => setting.set(!setting.checked)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-1.5 py-1 text-left hover:bg-slate-800/60 focus-visible:outline-2 focus-visible:outline-accent-400 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span className="min-w-0 text-slate-200">{setting.label}</span>
        <span
          aria-hidden
          className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors ${
            setting.checked ? 'border-accent-400 bg-accent-600' : 'border-slate-600 bg-slate-800'
          }`}
        >
          <span
            className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-transform ${
              setting.checked ? 'translate-x-3.5' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
    );
  }
  return (
    <div className="space-y-1 px-1.5 py-1">
      <p className="text-slate-300">{setting.label}</p>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={setting.label}>
        {setting.options.map((option) => {
          const on = option.enabled !== false;
          const active = setting.value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!on}
              onClick={() => setting.set(option.value)}
              className={chip(active, on)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The pet's switches, grouped (motion, reactions, display and power), with the ignored programs
 * and the model's parts: what used to be one long native menu. Opens from "More" in the ring.
 */
export const PetSettingsCard: React.FC<PetSettingsCardProps> = ({ model, left, width, t, onBack, onClose }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  const { apps, parts } = model;
  const canIgnoreLast = !!apps.lastApp && !apps.ignored.includes(apps.lastApp);

  // Focus for the keys; Escape goes back to the ring. Presses stay on the card (the figure
  // below would take them as a pat), its right click opens no other menu.
  useEffect(() => {
    const root = rootRef.current;
    root?.focus({ preventScroll: true });
    if (!root) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onBackRef.current();
    };
    const stop = (e: Event) => e.stopPropagation();
    const noMenu = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    root.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', stop);
    root.addEventListener('contextmenu', noMenu);
    return () => {
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('pointerdown', stop);
      root.removeEventListener('contextmenu', noMenu);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-pet-solid
      role="dialog"
      aria-label={t('pet.settingsCard')}
      tabIndex={-1}
      className="pet-radial-in absolute top-2 bottom-2 z-30 flex flex-col rounded-2xl bg-app/95 border border-accent-500/40 text-xs shadow-xl outline-hidden"
      style={{ left, width }}
    >
      <div className="flex items-center gap-1 border-b border-slate-800 px-2 py-1.5">
        <button
          type="button"
          onClick={onBack}
          title={t('pet.backToMenu')}
          aria-label={t('pet.backToMenu')}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate font-semibold text-accent-300">{t('pet.settingsCard')}</span>
        <button
          type="button"
          onClick={onClose}
          title={t('pet.closeMenu')}
          aria-label={t('pet.closeMenu')}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-1.5 py-2">
        {model.settings.map((group) => (
          <section key={group.id} aria-labelledby={`pet-settings-${group.id}`} className="space-y-0.5">
            <h3
              id={`pet-settings-${group.id}`}
              className="px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
            >
              {group.title}
            </h3>
            {group.items.map((setting) => (
              <SettingRow key={setting.id} setting={setting} />
            ))}
          </section>
        ))}

        <section aria-labelledby="pet-settings-apps" className="space-y-1 px-1.5">
          <h3 id="pet-settings-apps" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t('pet.ignoredApps')}
          </h3>
          <button
            type="button"
            disabled={!canIgnoreLast}
            onClick={() => apps.ignore(apps.lastApp)}
            className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-slate-200 hover:bg-slate-800/60 disabled:cursor-not-allowed disabled:text-slate-500 disabled:hover:bg-transparent"
          >
            <Plus className="h-3 w-3 shrink-0" aria-hidden />
            <span className="min-w-0 truncate">
              {canIgnoreLast ? t('pet.ignoreLastApp', { name: apps.lastApp }) : t('pet.ignoreNoApp')}
            </span>
          </button>
          {apps.ignored.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {apps.ignored.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => apps.allow(name)}
                  title={t('pet.ignoreRemove', { name })}
                  aria-label={t('pet.ignoreRemove', { name })}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/80 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-rose-500/60"
                >
                  {name}
                  <X className="h-2.5 w-2.5" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </section>

        {parts.names.length > 1 && (
          <section aria-labelledby="pet-settings-parts" className="space-y-1 px-1.5">
            <h3 id="pet-settings-parts" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t('pet.parts')}
            </h3>
            <div className="flex flex-wrap gap-1">
              {parts.names.map((name) => {
                const shown = !parts.hidden.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={shown}
                    onClick={() => parts.toggle(name)}
                    className={chip(shown)}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 border-t border-slate-800 p-1.5">
        <button
          type="button"
          onClick={model.openApp}
          className="flex items-center justify-center gap-1 rounded-xl border border-accent-500/30 bg-accent-950/40 py-1.5 text-accent-300 hover:bg-accent-900/50"
        >
          <AppWindow className="h-3 w-3" aria-hidden />
          <span className="truncate">{t('pet.openApp')}</span>
        </button>
        <button
          type="button"
          onClick={model.hide}
          className="flex items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-900/60 py-1.5 text-slate-300 hover:bg-slate-800"
        >
          <EyeOff className="h-3 w-3" aria-hidden />
          <span className="truncate">{t('pet.hide')}</span>
        </button>
      </div>
    </div>
  );
};
