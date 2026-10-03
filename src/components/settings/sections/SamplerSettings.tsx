import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { confirmDialog } from '../../ui/feedback';
import {
  Sliders,
  Trash2,
  Plus,
  Flame,
} from 'lucide-react';
import type { LlmPreset } from '../../../types';

export const SamplerSettings = () => {
  const { t, tOptional } = useTranslation();
  // Built-in presets are translated by id; user presets keep their own text.
  const presetText = (p: LlmPreset, field: 'name' | 'description') =>
    p.is_builtin ? tOptional(`preset.${p.id}.${field}`, p[field]) : p[field];
  const {
    llmPresets, activePresetId, applyLlmPreset, saveLlmPreset, deleteLlmPreset, sampling,
    setSampling, lorebookScanDepth, setLorebookScanDepth,
  } = useStoreFields(
    'llmPresets', 'activePresetId', 'applyLlmPreset', 'saveLlmPreset', 'deleteLlmPreset',
    'sampling', 'setSampling', 'lorebookScanDepth', 'setLorebookScanDepth',
  );

  // New preset modal state
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetDesc, setNewPresetDesc] = useState('');

  const handleSaveCustomPreset = async () => {
    if (!newPresetName.trim()) return;
    const presetId = `custom_${Date.now()}`;
    const newPreset: LlmPreset = {
      id: presetId,
      name: newPresetName.trim(),
      description: newPresetDesc.trim() || translate('settings.customPresetDesc'),
      is_builtin: false,
      sampling: { ...sampling },
    };
    await saveLlmPreset(newPreset);
    setIsCreatingPreset(false);
    setNewPresetName('');
    setNewPresetDesc('');
  };

  return (
    <div className="space-y-6">
      {/* Presets Manager Bar */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-accent-400" />
              {t('settings.presetsTitle')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{t('settings.presetsIntro')}</p>
          </div>

          <button
            onClick={() => setIsCreatingPreset(true)}
            className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">{t('settings.saveAsPreset')}</span>
          </button>
        </div>

        {/* Preset Selector Badges */}
        <div role="group" aria-label={t('settings.presetList')} className="flex flex-wrap gap-2 pt-1">
          {llmPresets.map((p) => {
            const isActive = activePresetId === p.id;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                  isActive
                    ? 'border-accent-500 bg-accent-500/20 text-accent-200'
                    : 'border-slate-800 bg-app/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <button
                  type="button"
                  onClick={() => applyLlmPreset(p.id)}
                  aria-pressed={isActive}
                  title={presetText(p, 'description')}
                  aria-label={t('settings.applyPreset', { name: presetText(p, 'name') })}
                  className="font-medium rounded outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                >
                  {presetText(p, 'name')}
                </button>
                {!p.is_builtin && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const confirmed = await confirmDialog({
                        title: translate('confirm.deletePresetTitle', { name: p.name }),
                        message: translate('confirm.cannotUndo'),
                        confirmLabel: translate('common.delete'),
                        tone: 'danger',
                      });
                      if (confirmed) deleteLlmPreset(p.id);
                    }}
                    title={t('settings.deletePreset', { name: p.name })}
                    aria-label={t('settings.deletePreset', { name: p.name })}
                    className="hover:text-rose-400 ml-1 rounded outline-hidden focus-visible:ring-2 focus-visible:ring-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Modal / Inline form to save custom preset */}
        {isCreatingPreset && (
          <div className="p-3 rounded-lg border border-accent-800/60 bg-accent-950/30 space-y-2 text-xs">
            <div className="font-semibold text-accent-200">{t('settings.newPreset')}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                placeholder={t('settings.presetName')}
                aria-label={t('settings.presetName')}
                autoFocus
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                className="bg-app border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
              />
              <input
                type="text"
                placeholder={t('settings.presetDesc')}
                aria-label={t('settings.presetDesc')}
                value={newPresetDesc}
                onChange={(e) => setNewPresetDesc(e.target.value)}
                className="bg-app border border-slate-800 rounded px-2.5 py-1.5 text-slate-200"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setIsCreatingPreset(false)}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveCustomPreset}
                disabled={!newPresetName.trim()}
                className="px-3 py-1 rounded bg-accent-600 text-white font-medium disabled:opacity-50"
              >
                {t('settings.save')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Standard Samplers */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
          <span>{t('settings.classicSampling')}</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Temperature */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">Temperature:</span>
              <span className="font-mono text-accent-300 font-bold">{sampling.temperature ?? 0.7}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.5"
              step="0.05"
              value={sampling.temperature ?? 0.7}
              onChange={(e) => setSampling({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-accent-500"
            />
            <div className="text-[11px] text-slate-400">{t('settings.temperatureHint')}</div>
          </div>

          {/* Min-P */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">Min-P Sampler:</span>
              <span className="font-mono text-cyan-300 font-bold">{sampling.min_p ?? 0.05}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.3"
              step="0.01"
              value={sampling.min_p ?? 0.05}
              onChange={(e) => setSampling({ min_p: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500"
            />
            <div className="text-[11px] text-slate-400">{t('settings.minPHint')}</div>
          </div>

          {/* Top-P */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">Top-P (Nucleus):</span>
              <span className="font-mono text-emerald-300 font-bold">{sampling.top_p ?? 0.9}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={sampling.top_p ?? 0.9}
              onChange={(e) => setSampling({ top_p: parseFloat(e.target.value) })}
              className="w-full accent-emerald-500"
            />
            <div className="text-[11px] text-slate-400">{t('settings.topPHint')}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Max Tokens */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">{t('settings.maxTokens')}</span>
              <span className="font-mono text-emerald-300 font-bold">{sampling.max_tokens ?? 2048}</span>
            </div>
            <input
              type="range"
              min="256"
              max="4096"
              step="256"
              value={sampling.max_tokens ?? 2048}
              onChange={(e) => setSampling({ max_tokens: parseInt(e.target.value) })}
              className="w-full accent-emerald-500"
            />
            <div className="text-[11px] text-slate-400">{t('settings.maxTokensHint')}</div>
          </div>

          {/* Repeat Penalty */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">Repeat Penalty:</span>
              <span className="font-mono text-amber-300 font-bold">{sampling.repeat_penalty ?? 1.1}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="1.5"
              step="0.02"
              value={sampling.repeat_penalty ?? 1.1}
              onChange={(e) => setSampling({ repeat_penalty: parseFloat(e.target.value) })}
              className="w-full accent-amber-500"
            />
            <div className="text-[11px] text-slate-400">{t('settings.repeatPenaltyHint')}</div>
          </div>

          {/* Top-K */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">Top-K:</span>
              <span className="font-mono text-indigo-300 font-bold">{sampling.top_k ?? 40}</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={sampling.top_k ?? 40}
              onChange={(e) => setSampling({ top_k: parseInt(e.target.value) })}
              className="w-full accent-indigo-500"
            />
            <div className="text-[11px] text-slate-400">{t('settings.topKHint')}</div>
          </div>
        </div>
      </div>

      {/* Advanced Samplers: DRY & XTC & Dynatemp */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Flame className="w-3.5 h-3.5 text-rose-400" />
          <span>{t('settings.advancedSamplers')}</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* DRY (Don't Repeat Yourself) Multiplier */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">DRY Multiplier:</span>
              <span className="font-mono text-rose-300 font-bold">{sampling.dry_multiplier ?? 0.8}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="2.0"
              step="0.05"
              value={sampling.dry_multiplier ?? 0.8}
              onChange={(e) => setSampling({ dry_multiplier: parseFloat(e.target.value) })}
              className="w-full accent-rose-500"
            />
            <div className="text-[11px] text-slate-400">
              {t('settings.dryHint')}
            </div>
          </div>

          {/* XTC (Exclude Top Choices) Threshold */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">XTC Threshold:</span>
              <span className="font-mono text-cyan-300 font-bold">{sampling.xtc_threshold ?? 0.1}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.5"
              step="0.02"
              value={sampling.xtc_threshold ?? 0.1}
              onChange={(e) => setSampling({ xtc_threshold: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500"
            />
            <div className="text-[11px] text-slate-400">
              {t('settings.xtcHint')}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Dynatemp Range */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-300 font-medium">Dynamic Temperature Range:</span>
              <span className="font-mono text-accent-300 font-bold">{sampling.dynatemp_range ?? 0.0}</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.8"
              step="0.05"
              value={sampling.dynatemp_range ?? 0.0}
              onChange={(e) => setSampling({ dynatemp_range: parseFloat(e.target.value) })}
              className="w-full accent-accent-500"
            />
            <div className="text-[11px] text-slate-400">
              {t('settings.dynatempHint')}
            </div>
          </div>

          {/* Reply Language & Lorebook Depth */}
          <div className="p-3 rounded-lg bg-app/40 border border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="settings-lore-depth" className="text-slate-300 font-medium">
                {t('settings.lorebookDepth')}
              </label>
              <input
                id="settings-lore-depth"
                type="number"
                min="1"
                max="30"
                value={lorebookScanDepth}
                onChange={(e) => setLorebookScanDepth(parseInt(e.target.value) || 5)}
                className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-slate-200 text-xs w-20 font-mono"
              />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
