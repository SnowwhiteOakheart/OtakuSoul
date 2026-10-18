import React, { useState } from 'react';
import { BookA, ExternalLink, Footprints, Search, X } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useTranslation, type TranslationKey } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { ModalOverlay } from './ui/ModalOverlay';

/** Terms of the glossary (`glossary.<id>.term` / `.text`), in the order they are shown. */
export const GLOSSARY_TERMS = [
  'ai_model', 'local_cloud', 'api_key', 'context', 'token', 'gguf', 'quantization', 'vram', 'runtime',
  'reply_style', 'prompt', 'persona', 'macros', 'group_chat', 'lorebook', 'stage', 'hub', 'tts', 'voice_clone', 'lora',
] as const;

/** Steps of the beginner's guide (`help.step.<n>.title` / `.text`). */
export const GUIDE_STEPS = [1, 2, 3, 4, 5, 6] as const;

const GUIDE_URL = 'https://github.com/SnowwhiteOakheart/OtakuSoul/blob/main/docs/guide-getting-started';

/** Help for beginners: the first steps through the app and a searchable glossary of its terms. */
export const HelpDialog: React.FC<{ onClose: () => void; initialTab?: 'guide' | 'glossary' }> = ({ onClose, initialTab = 'guide' }) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'guide' | 'glossary'>(initialTab);
  const [query, setQuery] = useState('');
  const language = useAppStore((s) => s.appLanguage);
  const guideUrl = `${GUIDE_URL}${language === 'en' ? '' : `.${language}`}.md`;
  const q = query.trim().toLowerCase();
  const terms = GLOSSARY_TERMS.filter((id) => {
    if (!q) return true;
    return `${t(`glossary.${id}.term` as TranslationKey)} ${t(`glossary.${id}.text` as TranslationKey)}`.toLowerCase().includes(q);
  });

  return (
    <ModalOverlay
      onClose={onClose}
      closeOnBackdrop
      aria-labelledby="help-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" data-help={tab}>
        <header className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <h2 id="help-title" className="text-lg font-bold text-slate-100">{t('help.title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div role="tablist" aria-label={t('help.title')} className="flex gap-1 border-b border-slate-800 px-5">
          {([
            ['guide', Footprints, 'help.tabGuide'],
            ['glossary', BookA, 'help.tabGlossary'],
          ] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${tab === id ? 'border-accent-400 text-accent-200' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
            >
              <Icon className="h-4 w-4" />
              {t(label)}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'guide' ? (
            <ol className="space-y-4">
              {GUIDE_STEPS.map((n) => (
                <li key={n} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-600/30 text-sm font-bold text-accent-200">{n}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{t(`help.step.${n}.title` as TranslationKey)}</p>
                    <p className="text-sm text-slate-400">{t(`help.step.${n}.text` as TranslationKey)}</p>
                  </div>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => void openUrl(guideUrl)} className="inline-flex items-center gap-1.5 text-sm text-accent-300 hover:text-accent-200">
                  <ExternalLink className="h-4 w-4" />
                  {t('help.fullGuide')}
                </button>
              </li>
            </ol>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-app px-3 py-2">
                <Search className="h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('help.searchGlossary')}
                  aria-label={t('help.searchGlossary')}
                  className="flex-1 bg-transparent text-sm text-slate-100 outline-hidden"
                />
              </label>
              <dl className="space-y-3">
                {terms.map((id) => (
                  <div key={id} data-glossary={id}>
                    <dt className="text-sm font-semibold text-slate-100">{t(`glossary.${id}.term` as TranslationKey)}</dt>
                    <dd className="text-sm text-slate-400">{t(`glossary.${id}.text` as TranslationKey)}</dd>
                  </div>
                ))}
                {terms.length === 0 && <p className="text-sm text-slate-500">{t('help.noTerms')}</p>}
              </dl>
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
};
