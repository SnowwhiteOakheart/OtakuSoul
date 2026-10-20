import { useState } from 'react';
import { TextQuote } from 'lucide-react';
import { OptionHint } from './OptionHint';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { RegexScriptSettings } from './RegexScriptSettings';

const FIELD =
  'w-full rounded-lg border border-slate-700 bg-app px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500';

/**
 * Words and phrases the AI should leave out (asked for in the prompt) and, in expert mode,
 * regex scripts for replies and the user's messages.
 */
export const ReplyFilterSettings = () => {
  const { t } = useTranslation();
  const { avoidPhrases, setAvoidPhrases, expertMode } = useStoreFields('avoidPhrases', 'setAvoidPhrases', 'expertMode');
  // Text fields save when they lose focus, not on every key.
  const [phrases, setPhrases] = useState(avoidPhrases.join('\n'));
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <TextQuote className="w-4 h-4 text-accent-400" />
        {t('settings.replyFilterTitle')}
      </h2>
      <div id="setting-avoid-phrases" className="space-y-1">
        <label htmlFor="settings-avoid-phrases" className="block text-sm font-medium text-slate-200">
          {t('settings.avoidPhrases')}
        </label>
        <textarea
          id="settings-avoid-phrases"
          rows={3}
          value={phrases}
          onChange={(e) => setPhrases(e.target.value)}
          onBlur={() => setAvoidPhrases(phrases.split('\n'))}
          placeholder={t('settings.avoidPhrasesPlaceholder')}
          aria-describedby="settings-avoid-phrases-hint"
          className={`${FIELD} resize-y`}
        />
        <OptionHint id="settings-avoid-phrases-hint">{t('settings.avoidPhrasesHint')}</OptionHint>
      </div>

      {expertMode && <RegexScriptSettings />}
    </div>
  );
};
