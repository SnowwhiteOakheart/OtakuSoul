import { FileUp } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { translate, useTranslation } from '../../i18n';
import { confirmDialog, toast } from '../ui/feedback';
import { api } from '../../services/api';
import { importSillyTavernPreset, type ImportedPreset } from '../../utils/sillyTavernPresets';

/** The summary shown before anything is taken over. */
function summary(preset: ImportedPreset): string {
  const lines: string[] = [];
  const samplers = Object.keys(preset.sampling);
  if (samplers.length > 0) lines.push(translate('stPreset.samplers', { names: samplers.join(', ') }));
  if (preset.main) lines.push(translate('stPreset.main'));
  if (preset.postHistory) lines.push(translate('stPreset.postHistory'));
  for (const part of preset.ignored) lines.push(translate(`stPreset.ignored.${part}`));
  return lines.map((line) => `• ${line}`).join('\n');
}

/**
 * Imports a SillyTavern preset file (chat or text completion preset, system prompt, instruct or
 * context template, master export): sampler values go into the current settings, prompts into
 * the prompt template. A summary asks first; what has no counterpart is named there.
 */
export const SillyTavernPresetImport = () => {
  const { t } = useTranslation();

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let preset: ImportedPreset;
    try {
      preset = importSillyTavernPreset(JSON.parse(await file.text()));
    } catch {
      toast.error(t('stPreset.failed'));
      return;
    }
    const usable = Object.keys(preset.sampling).length > 0 || !!preset.main || !!preset.postHistory;
    if (!usable) {
      toast.info(`${t('stPreset.nothing')}\n${summary(preset)}`);
      return;
    }
    const confirmed = await confirmDialog({
      title: t('stPreset.confirmTitle', { name: file.name }),
      message: summary(preset),
      confirmLabel: t('stPreset.confirm'),
    });
    if (!confirmed) return;
    const state = useAppStore.getState();
    if (Object.keys(preset.sampling).length > 0) state.setSampling(preset.sampling);
    if (preset.main || preset.postHistory) {
      try {
        const base = state.promptTemplate ?? (await api.listPromptTemplates())[0]!.template;
        state.setPromptTemplate({
          ...base,
          ...(preset.main ? { main: preset.main } : {}),
          ...(preset.postHistory ? { post_history: preset.postHistory } : {}),
        });
      } catch (error) {
        console.warn('Prompt template for the preset:', error);
        toast.error(t('stPreset.promptFailed'));
        return;
      }
    }
    toast.success(t('stPreset.done'));
  };

  return (
    <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 focus-within:ring-2 focus-within:ring-accent-400">
      <FileUp className="w-3.5 h-3.5" />
      <span className="whitespace-nowrap">{t('stPreset.import')}</span>
      <input type="file" accept=".json" className="sr-only" onChange={(e) => void importFile(e)} data-st-preset-import />
    </label>
  );
};
