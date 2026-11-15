import { useEffect, useState } from 'react';
import { Code2, FileUp, Plus, Trash2 } from 'lucide-react';
import { OptionHint } from './OptionHint';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { toast } from '../ui/feedback';
import { NEW_RULE, importSillyTavernScripts, isScriptRule, onScriptErrors, ruleError, scriptError, withDefaults } from '../../utils/replyFilters';
import type { ReplyReplacement } from '../../types';

/** What a new JavaScript rule starts with: the one function the sandbox calls. */
const SCRIPT_TEMPLATE = `// info.role: "user" | "assistant", info.stage: "save" | "prompt"
function transform(text, info) {
  return text;
}
`;

const FIELD =
  'w-full rounded-lg border border-slate-700 bg-app px-2.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500';

/**
 * Regex scripts (expert mode): find/replace rules for replies and the user's messages, each
 * changing the stored text, only the display or only what the model reads. SillyTavern regex
 * script files import into them.
 */
export const RegexScriptSettings = () => {
  const { t, tPlural } = useTranslation();
  const { replyReplacements, setReplyReplacements } = useStoreFields('replyReplacements', 'setReplyReplacements');
  // Text fields save when they lose focus, not on every key.
  const [rules, setRules] = useState<ReplyReplacement[]>(() => replyReplacements.map(withDefaults));
  const commitRules = (next: ReplyReplacement[] = rules) => {
    setRules(next);
    setReplyReplacements(next);
  };
  const editRule = (index: number, patch: Partial<ReplyReplacement>) =>
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  const changeRule = (index: number, patch: Partial<ReplyReplacement>) =>
    commitRules(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  // Errors of JavaScript rules come from the chat (the sandbox runs there): show the latest.
  const [, setErrorsSeen] = useState(0);
  useEffect(() => onScriptErrors(() => setErrorsSeen((n) => n + 1)), []);

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { rules: imported, skipped } = importSillyTavernScripts(JSON.parse(await file.text()));
      commitRules([...rules, ...imported]);
      const note = skipped > 0 ? tPlural('scripts.importSkipped', skipped) : '';
      // Nothing usable (e.g. a set of slash commands only): a hint, not a success.
      if (imported.length === 0) toast.info(note || t('scripts.importFailed'));
      else toast.success(`${tPlural('scripts.imported', imported.length)} ${note}`.trim());
    } catch {
      toast.error(t('scripts.importFailed'));
    }
  };

  return (
    <div id="setting-reply-replacements" className="space-y-2 border-t border-slate-800 pt-3">
      <p className="text-sm font-medium text-slate-200">{t('scripts.title')}</p>
      <OptionHint id="settings-replacements-hint">{t('scripts.hint')}</OptionHint>
      {rules.map((rule, index) => {
        const script = isScriptRule(rule);
        const error = script ? scriptError(rule.code) : ruleError(rule);
        return (
          <div key={index} className="space-y-1.5 rounded-lg border border-slate-800 p-2" data-replacement-rule>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-slate-300">
                <input type="checkbox" checked={!rule.disabled} onChange={(e) => changeRule(index, { disabled: !e.target.checked })} />
                {t('scripts.active')}
              </label>
              <input
                value={rule.name}
                onChange={(e) => editRule(index, { name: e.target.value })}
                onBlur={() => commitRules()}
                placeholder={t('scripts.name')}
                aria-label={t('scripts.name')}
                className={`${FIELD} flex-1 min-w-32`}
              />
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
            {script ? (
              <div className="space-y-1">
                <textarea
                  value={rule.code}
                  onChange={(e) => editRule(index, { code: e.target.value })}
                  onBlur={() => commitRules()}
                  rows={6}
                  spellCheck={false}
                  aria-label={t('scripts.code')}
                  aria-describedby="settings-scripts-sandbox"
                  aria-invalid={!!error}
                  className={`${FIELD} font-mono leading-relaxed`}
                  data-script-code
                />
              </div>
            ) : (
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
                <input type="checkbox" checked={rule.regex} onChange={(e) => changeRule(index, { regex: e.target.checked })} />
                RegEx
              </label>
            </div>
            )}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="text-slate-400">{t('scripts.appliesTo')}</span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={rule.on_output} onChange={(e) => changeRule(index, { on_output: e.target.checked })} />
                {t('scripts.onOutput')}
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={rule.on_input} onChange={(e) => changeRule(index, { on_input: e.target.checked })} />
                {t('scripts.onInput')}
              </label>
              <select
                value={rule.mode}
                onChange={(e) => changeRule(index, { mode: e.target.value })}
                aria-label={t('scripts.mode')}
                className="rounded-lg border border-slate-700 bg-app px-2 py-1 text-xs text-slate-200"
              >
                <option value="save">{t('scripts.modeSave')}</option>
                {/* Scripts run asynchronously: not on every render of the chat. */}
                {!script && <option value="display">{t('scripts.modeDisplay')}</option>}
                <option value="prompt">{t('scripts.modePrompt')}</option>
              </select>
            </div>
            {error && (
              <p role="alert" className="text-[11px] text-rose-300">
                {t(script ? 'scripts.scriptFailed' : 'settings.replaceInvalid', { error })}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setRules((current) => [...current, NEW_RULE])}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('settings.replaceAdd')}
        </button>
        <button
          type="button"
          onClick={() => setRules((current) => [...current, { ...NEW_RULE, name: t('scripts.newScriptName'), code: SCRIPT_TEMPLATE }])}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
          data-add-script
        >
          <Code2 className="w-3.5 h-3.5" />
          {t('scripts.addScript')}
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 focus-within:ring-2 focus-within:ring-accent-400">
          <FileUp className="w-3.5 h-3.5" />
          {t('scripts.import')}
          <input type="file" accept=".json" className="sr-only" onChange={(e) => void importFile(e)} data-scripts-import />
        </label>
      </div>
      {rules.some(isScriptRule) && (
        <p id="settings-scripts-sandbox" className="text-[11px] text-slate-400">
          {t('scripts.sandboxHint')}
        </p>
      )}
    </div>
  );
};
