import { createPortal } from 'react-dom';
import {
  BrainCircuit,
  Dice5,
  Sparkles,
  Bot,
  Cpu,
  Globe,
  Heart,
  GitFork,
  Code2,
  ExternalLink,
  ShieldCheck,
  X,
} from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import logoUrl from '../assets/brand/otakusoul-logo-wide.webp';
import { APP_NAME } from '../constants/branding';
import { ModalOverlay } from './ui/ModalOverlay';
import { useTranslation, type TranslationKey } from '../i18n';

interface AboutDialogProps {
  onClose: () => void;
}

interface HighlightItem {
  icon: typeof BrainCircuit;
  titleKey: TranslationKey;
  descKey: TranslationKey;
}

const highlights: HighlightItem[] = [
  {
    icon: BrainCircuit,
    titleKey: 'about.soulMemory',
    descKey: 'about.highlights.memoryDesc',
  },
  {
    icon: Dice5,
    titleKey: 'about.stage',
    descKey: 'about.highlights.stageDesc',
  },
  {
    icon: Sparkles,
    titleKey: 'about.avatars',
    descKey: 'about.highlights.avatarsDesc',
  },
  {
    icon: Bot,
    titleKey: 'about.companion',
    descKey: 'about.highlights.companionDesc',
  },
  {
    icon: Cpu,
    titleKey: 'about.localCloudAi',
    descKey: 'about.highlights.aiDesc',
  },
  {
    icon: Globe,
    titleKey: 'about.hub',
    descKey: 'about.highlights.hubDesc',
  },
];

export function AboutDialog({ onClose }: AboutDialogProps) {
  const { t } = useTranslation();
  if (typeof document === 'undefined') return null;

  const handleOpenUrl = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return createPortal(
    <ModalOverlay
      onClose={onClose}
      closeOnBackdrop
      aria-labelledby="about-title"
      className="fixed inset-0 z-[9999] grid place-items-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-md sm:p-6"
    >
      <section className="relative max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-accent-400/25 bg-app shadow-2xl shadow-accent-950/70 sm:max-h-[calc(100vh-3rem)]">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-slate-950/70 p-2 text-slate-300 backdrop-blur-md transition hover:border-accent-400/40 hover:text-white"
          aria-label={t('about.close')}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Hero Banner with seamless vignette gradient */}
        <div className="relative overflow-hidden rounded-t-3xl border-b border-accent-400/20 bg-slate-950">
          <img
            src={logoUrl}
            alt={`${APP_NAME} – Infinite Worlds`}
            className="h-44 w-full object-cover object-center sm:h-52"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-app via-app/40 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-app/60 via-transparent to-app/60" />
        </div>

        {/* Content body */}
        <div className="relative space-y-6 p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-400/70 to-transparent" />

          {/* Header & Badges */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 id="about-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {APP_NAME}
              </h2>
              <span className="rounded-full border border-accent-400/40 bg-accent-500/10 px-2.5 py-0.5 font-mono text-xs font-medium text-accent-200">
                {t('header.version')}
              </span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                {t('about.badge.localFirst')}
              </span>
            </div>
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-300">
              {t('about.text')}
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {highlights.map(({ icon: Icon, titleKey, descKey }) => (
              <div
                key={titleKey}
                className="group flex flex-col justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5 transition hover:border-accent-500/30 hover:bg-slate-900/90"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-accent-400/25 bg-accent-500/10 text-accent-300 transition group-hover:scale-105 group-hover:border-accent-400/40">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-100">{t(titleKey)}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{t(descKey)}</p>
              </div>
            ))}
          </div>

          {/* Inspiration, Credits & GPLv3 Compliance Box */}
          <div className="relative overflow-hidden rounded-2xl border border-accent-500/30 bg-gradient-to-br from-accent-950/30 via-slate-900/70 to-slate-950/90 p-5 shadow-lg">
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-300">
                <Heart className="h-5 w-5 fill-rose-500/20" />
              </div>
              <div className="min-w-0 flex-1 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tracking-wide text-slate-100">
                    {t('about.credits.title')}
                  </h3>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {t('about.license')}
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-slate-300">
                  {t('about.credits.text', { appName: APP_NAME })}
                </p>

                <p className="text-[11px] leading-relaxed text-slate-400">
                  {t('about.credits.licenseNotice')}
                </p>

                {/* SRD 5.1 attribution (CC-BY-4.0) for the 5e-compatible Soul Stage rules. */}
                <div data-testid="srd-attribution" className="space-y-1 text-[11px] leading-relaxed text-slate-400">
                  <p>{t('about.credits.srd')}</p>
                  <p lang="en" className="italic text-slate-500">
                    This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the
                    Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is
                    licensed under the Creative Commons Attribution 4.0 International License available at
                    https://creativecommons.org/licenses/by/4.0/legalcode.
                  </p>
                </div>

                {/* External Links */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenUrl('https://github.com/jofizcd/Soul-of-Waifu')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-accent-500/40 bg-accent-500/15 px-3 py-1.5 text-xs font-medium text-accent-200 transition hover:border-accent-400 hover:bg-accent-500/25 hover:text-white"
                  >
                    <GitFork className="h-3.5 w-3.5" />
                    <span>{t('about.credits.visitSow')}</span>
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenUrl('https://github.com/SnowwhiteOakheart/OtakuSoul')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 hover:text-white"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>{t('about.credits.visitRepo', { appName: APP_NAME })}</span>
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-3 border-t border-slate-800/80 pt-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span>{t('about.developedBy', { author: 'SnowwhiteOakheart' })}</span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-slate-400">{t('about.badge.stack')}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded-xl border border-slate-700/80 bg-slate-800/80 px-4 py-1.5 font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-700 hover:text-white sm:self-auto"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </section>
    </ModalOverlay>,
    document.body
  );
}
