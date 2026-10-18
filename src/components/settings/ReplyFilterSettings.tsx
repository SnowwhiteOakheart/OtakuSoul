import { useState } from 'react';
import { Plus, Trash2, TextQuote } from 'lucide-react';
import { OptionHint } from './OptionHint';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { ruleError } from '../../utils/replyFilters';
import type { ReplyReplacement } from '../../types';

const FIELD =
  'w-full rounded-lg border border-slate-700 bg-app px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500';

/**
 * Words and phrases the AI should leave out (asked for in the prompt) and, in expert mode,
 * find/replace rules applied to every reply.
 */
export const ReplyFilterSettings = () => {
  const { t } = useTranslation();
  const { avoidPhrases, setAvoidPhrases, replyReplacements, setReplyReplacements, expertMode } = useStoreFields(
    'avoidPhrases', 'setAvoidPhrases', 'replyReplacements', 'setReplyReplacements', 'expertMode',
  );
  // Text fields save when they lose focus, not on every key.
  const [phrases, setPhrases] = useState(avoidPhrases.join('\n'));
  const [rules, setRules] = useState<ReplyReplacement[]>(replyReplacements);
  const commitRules = (next: ReplyReplacement[] = rules) => {
    setRules(next);
    setReplyReplacements(next);
  };
  const editRule = (index: number, patch: Partial<ReplyReplacement>) =>
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

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

      {expertMode && (
        <div id="setting-reply-replacements" className="space-y-2 border-t border-slate-800 pt-3">
          <p className="text-sm font-medium text-slate-200">{t('settings.replyReplacements')}</p>
          <OptionHint id="settings-replacements-hint">{t('settings.replyReplacementsHint')}</OptionHint>
          {rules.map((rule, index) => {
            const error = ruleError(rule);
            return (
              <div key={index} className="space-y-1" data-replacement-rule>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={rule.find}
                    onChange={(e) => editRule(index, { find: e.target.value })}
                    onBlur={() => commitRules()}
                    placeholder={t('settings.replaceFind')}
                    aria-label={t('settings.replaceFind')}
                    aria-describedby="settings-replacements-hint"
                    aria-invalid={!!error}
                    className={`${FIELD} flex-1 min-w-32 font-mono`}
                  />
                  <span aria-hidden="true" className="text-slate-500">→</span>
                  <input
                    value={rule.replace}
                    onChange={(e) => editRule(index, { replace: e.target.value })}
                    onBlur={() => commitRules()}
                    placeholder={t('settings.replaceWith')}
                    aria-label={t('settings.replaceWith')}
                    aria-describedby="settings-replacements-hint"
                    className={`${FIELD} flex-1 min-w-32 font-mono`}
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-300" title={t('settings.replaceRegexHint')}>
                    <input
                      type="checkbox"
                      checked={rule.regex}
                      onChange={(e) => commitRules(rules.map((r, i) => (i === index ? { ...r, regex: e.target.checked } : r)))}
                      aria-describedby="settings-replacements-hint"
                    />
                    RegEx
                  </label>
                  <button
                    type="button"
                    onClick={() => commitRules(rules.filter((_, i) => i !== index))}
                    className="p-1.5 text-slate-400 hover:text-rose-400"
                    aria-label={t('settings.replaceRemove')}
                    title={t('settings.replaceRemove')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {error && <p role="alert" className="text-[11px] text-rose-300">{t('settings.replaceInvalid', { error })}</p>}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setRules((current) => [...current, { find: '', replace: '', regex: false }])}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('settings.replaceAdd')}
          </button>
        </div>
      )}
    </div>
  );
};
