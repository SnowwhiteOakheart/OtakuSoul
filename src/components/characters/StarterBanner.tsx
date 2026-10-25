import { Sparkles } from 'lucide-react';
import { useTranslation } from '../../i18n';
import starterCover from '../../../presets/characters/cover.webp';

/** Cover above the characters shipped with the app (they come first in the library). */
export const StarterBanner = ({ count }: { count: number }) => {
  const { t, tPlural } = useTranslation();
  return (
    <section
      data-starter-banner
      aria-labelledby="starter-banner-title"
      className="mb-5 overflow-hidden rounded-2xl border border-slate-800 bg-linear-to-br from-accent-950/60 via-slate-900 to-slate-950 flex flex-col-reverse md:flex-row md:items-stretch"
    >
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
      <img src={starterCover} alt="" className="w-full md:w-[22rem] lg:w-[26rem] aspect-video object-cover shrink-0" />
    </section>
  );
};
