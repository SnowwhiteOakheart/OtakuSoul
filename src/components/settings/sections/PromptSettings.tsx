import { useEffect, useState } from 'react';
import { Eye, FileText, RotateCcw, Save } from 'lucide-react';
import { useStoreFields } from '../../../store/useAppStore';
import { api } from '../../../services/api';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import type { AssembledPrompt, BuiltinPromptTemplate, PromptTemplate } from '../../../types';

const FIELDS: { key: keyof PromptTemplate; rows: number }[] = [
  { key: 'main', rows: 4 },
  { key: 'style', rows: 5 },
  { key: 'post_history', rows: 2 },
];

/** Editor for the chat system prompt: built-in templates, own wording, live preview. */
export const PromptSettings = () => {
  const { t, tOptional } = useTranslation();
  const { promptTemplate, setPromptTemplate, activeCharacter, activePersona, replyLanguage, serverConfig } =
    useStoreFields(
      'promptTemplate', 'setPromptTemplate', 'activeCharacter', 'activePersona', 'replyLanguage', 'serverConfig',
    );
  const [builtins, setBuiltins] = useState<BuiltinPromptTemplate[]>([]);
  const [draft, setDraft] = useState<PromptTemplate | null>(null);
  const [preview, setPreview] = useState<AssembledPrompt | null>(null);

  useEffect(() => {
    api.listPromptTemplates().then(setBuiltins).catch((e) => console.warn('Prompt templates:', e));
  }, []);

  const saved = promptTemplate ?? builtins[0]?.template ?? null;
  const current = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const activeBuiltin = builtins.find((b) => JSON.stringify(b.template) === JSON.stringify(current))?.id;
  const card = activeCharacter?.card.data;
  const cardOverrides = !!card?.system_prompt?.trim() || !!card?.post_history_instructions?.trim();

  const showPreview = async () => {
    if (!activeCharacter || !current) return;
    try {
      setPreview(
        await api.assemblePrompt({
          char_name: activeCharacter.card.data.name,
          user_name: activePersona.name,
          character: activeCharacter.card.data,
          active_lore: [],
          state_variables: [],
          reply_language: replyLanguage || 'Deutsch',
          allow_reasoning: serverConfig.reasoning_mode,
          template: current,
        }),
      );
    } catch (e) {
      console.warn('Prompt preview failed:', e);
    }
  };

  const save = () => {
    if (!draft) return;
    setPromptTemplate(draft);
    setDraft(null);
    toast.success(translate('promptSettings.saved'));
  };

  const reset = () => {
    setPromptTemplate(null);
    setDraft(null);
    setPreview(null);
  };

  if (!current) return null;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-400" />
            {t('promptSettings.title')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{t('promptSettings.intro')}</p>
        </div>

        <div role="group" aria-label={t('promptSettings.templates')} className="flex flex-wrap gap-2 pt-1">
          {builtins.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setDraft(b.template)}
              aria-pressed={activeBuiltin === b.id}
              title={tOptional(`promptTemplate.${b.id}.description`, '')}
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
                activeBuiltin === b.id
                  ? 'border-accent-500 bg-accent-500/20 text-accent-200'
                  : 'border-slate-800 bg-app/60 text-slate-400 hover:border-slate-700'
              }`}
            >
              {tOptional(`promptTemplate.${b.id}.name`, b.id)}
            </button>
          ))}
          {!activeBuiltin && (
            <span className="px-3 py-1.5 rounded-lg border border-accent-500/50 text-xs text-accent-300">
              {t('promptSettings.custom')}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        {FIELDS.map(({ key, rows }) => (
          <div key={key} className="space-y-1.5">
            <label htmlFor={`prompt-${key}`} className="text-xs font-medium text-slate-300">
              {t(`promptSettings.${key}Label`)}
            </label>
            <textarea
              id={`prompt-${key}`}
              value={current[key]}
              onChange={(e) => setDraft({ ...current, [key]: e.target.value })}
              rows={rows}
              spellCheck={false}
              className="w-full bg-app/80 border border-slate-700/80 rounded-xl p-3 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
              placeholder={key === 'post_history' ? t('promptSettings.postHistoryPlaceholder') : undefined}
            />
            <p className="text-xs text-slate-400">{t(`promptSettings.${key}Hint`)}</p>
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            disabled={!dirty}
            className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {t('promptSettings.save')}
          </button>
          <button
            onClick={reset}
            disabled={!promptTemplate && !draft}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('promptSettings.reset')}
          </button>
          <button
            onClick={showPreview}
            disabled={!activeCharacter}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            {t('promptSettings.preview', { name: activeCharacter?.card.data.name ?? '…' })}
          </button>
        </div>
        {cardOverrides && (
          <p className="text-xs text-amber-300">
            {t('promptSettings.cardOverrides', { name: card?.name ?? '' })}
          </p>
        )}
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-slate-300">{t('promptSettings.previewTitle')}</h3>
          <p className="text-xs text-slate-400">{t('promptSettings.previewHint')}</p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-app/80 border border-slate-800 p-3 text-xs text-slate-200 font-mono">
            {preview.system}
          </pre>
          {preview.post_history && (
            <>
              <h4 className="text-xs font-semibold text-slate-300">{t('promptSettings.postHistoryLabel')}</h4>
              <pre className="whitespace-pre-wrap rounded-lg bg-app/80 border border-slate-800 p-3 text-xs text-slate-200 font-mono">
                {preview.post_history}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
};
