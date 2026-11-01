import type { ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n';
import starterCover from '../../../presets/characters/cover.webp';

/**
 * Framed block for the characters shipped with the app: cover and intro on top, their cards
 * (`children`) inside the same frame, so the block reads as one group apart from the library.
 */
export const StarterBanner = ({ count, children }: { count: number; children: ReactNode }) => {
  const { t, tPlural } = useTranslation();
  return (
    <section
      data-starter-banner
      aria-labelledby="starter-banner-title"
      className="mb-8 overflow-hidden rounded-2xl border border-accent-500/25 bg-linear-to-br from-accent-950/50 via-slate-900/80 to-slate-950"
    >
      <div className="flex flex-col-reverse md:flex-row md:items-stretch border-b border-accent-500/15">
        <div className="flex-1 px-6 py-5 flex flex-col justify-center gap-1.5">
          <span className="self-start inline-flex items-center gap-1 rounded-full bg-accent-600/90 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Sparkles className="w-3 h-3" />
            {t('characterPreview.starter')}
          </span>
          <h2 id="starter-banner-title" className="text-xl font-bold text-slate-100">
            {t('library.starterTitle')}
          </h2>
          <p className="text-sm text-slate-300 max-w-xl">{tPlural('library.starterText', count)}</p>
        </div>
        <img src={starterCover} alt="" className="w-full md:w-[18rem] lg:w-[22rem] aspect-video md:aspect-auto md:h-auto max-h-48 object-cover shrink-0" />
      </div>
      <div className="p-4 md:p-5">{children}</div>
    </section>
  );
};
