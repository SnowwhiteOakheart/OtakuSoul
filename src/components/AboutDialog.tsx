import { createPortal } from 'react-dom';
import { BrainCircuit, Dice5, HeartHandshake, ShieldCheck, Sparkles, X } from 'lucide-react';
import logoUrl from '../assets/brand/otakusoul-logo-wide.webp';
import { APP_NAME } from '../constants/branding';
import { ModalOverlay } from './ui/ModalOverlay';
import { useTranslation, type TranslationKey } from '../i18n';

interface AboutDialogProps {
  onClose: () => void;
}

const highlights: { icon: typeof BrainCircuit; label: TranslationKey }[] = [
  { icon: BrainCircuit, label: 'about.localCloudAi' },
  { icon: HeartHandshake, label: 'about.soulMemory' },
  { icon: Sparkles, label: 'about.avatars' },
  { icon: Dice5, label: 'about.stage' },
];

export function AboutDialog({ onClose }: AboutDialogProps) {
  const { t } = useTranslation();
  if (typeof document === 'undefined') return null;

  return createPortal(
    <ModalOverlay
      onClose={onClose}
      closeOnBackdrop
      aria-labelledby="about-title"
      className="fixed inset-0 z-[9999] grid place-items-center overflow-y-auto bg-app/85 p-5 backdrop-blur-md"
    >
      <section className="relative max-h-[calc(100vh-2.5rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-accent-400/25 bg-app shadow-2xl shadow-accent-950/60">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-app/70 p-2 text-slate-300 backdrop-blur transition hover:border-accent-400/40 hover:text-white"
          aria-label={t('about.close')}
        >
          <X className="h-4 w-4" />
        </button>

        <img
          src={logoUrl}
          alt={`${APP_NAME} – Infinite Worlds`}
          className="aspect-video w-full object-cover"
        />

        <div className="relative space-y-5 p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-accent-400/70 to-transparent" />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 id="about-title" className="text-2xl font-semibold tracking-wide text-white">
                {APP_NAME}
              </h2>
              <span className="rounded-full border border-accent-400/30 bg-accent-500/10 px-2.5 py-1 font-mono text-xs text-accent-200">
                {t('header.version')}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              {t('about.text')}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {highlights.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2.5 text-xs text-slate-200"
              >
                <Icon className="h-4 w-4 text-accent-300" />
                <span>{t(label)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-800 pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>{t('about.developedBy', { author: 'SnowwhiteOakheart' })}</span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Open Source · GPLv3
            </span>
          </div>
        </div>
      </section>
    </ModalOverlay>,
    document.body
  );
}
