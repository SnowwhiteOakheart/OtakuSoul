import React, { useState } from 'react';
import type { LorebookEntry } from '../../types';
import {
  Flame,
  X,
  Sliders,
  Layers,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { useTranslation } from '../../i18n';

interface EntryEditorModalProps {
  initialEntry: LorebookEntry;
  isNew: boolean;
  onSave: (entry: LorebookEntry) => void;
  onClose: () => void;
}

export const EntryEditorModal: React.FC<EntryEditorModalProps> = ({ initialEntry, isNew, onSave, onClose }) => {
  const { t } = useTranslation();
  const [entry, setEntry] = useState<LorebookEntry>({ ...initialEntry });
  const [primaryKeyInput, setPrimaryKeyInput] = useState((initialEntry.key || []).join(', '));
  const [secondaryKeyInput, setSecondaryKeyInput] = useState((initialEntry.secondary_keys || []).join(', '));
  const [excludeKeyInput, setExcludeKeyInput] = useState((initialEntry.exclude_key || []).join(', '));
  const [regexKeyInput, setRegexKeyInput] = useState((initialEntry.regex_keys || []).join(', '));
  const [chainActivatesInput, setChainActivatesInput] = useState((initialEntry.chain_activates || []).join(', '));
  const [chainRequiresInput, setChainRequiresInput] = useState((initialEntry.chain_requires || []).join(', '));

  const handleSave = () => {
    const parseList = (str: string) =>
      str
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    const updated: LorebookEntry = {
      ...entry,
      key: parseList(primaryKeyInput),
      secondary_keys: parseList(secondaryKeyInput),
      exclude_key: parseList(excludeKeyInput),
      regex_keys: parseList(regexKeyInput),
      chain_activates: parseList(chainActivatesInput),
      chain_requires: parseList(chainRequiresInput),
    };
    onSave(updated);
  };

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {isNew ? t('lore.editorNew') : t('lore.editorEdit', { name: entry.name })}
              </h2>
              <p className="text-[11px] text-slate-400">{t('lore.editorIntro')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-300">
          {/* Row 1: Name & Enabled */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('lore.entryName')}</label>
              <input
                type="text"
                value={entry.name}
                onChange={(e) => setEntry({ ...entry, name: e.target.value })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1 flex flex-col justify-end">
              <label className="flex items-center gap-2 p-2 bg-app border border-slate-800 rounded-lg cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={entry.enabled}
                  onChange={(e) => setEntry({ ...entry, enabled: e.target.checked })}
                  className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <span className="font-semibold text-slate-200">{t('lore.entryActive')}</span>
              </label>
            </div>
          </div>

          {/* Row 2: Injection Mode & Trigger Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 bg-app/60 rounded-xl border border-slate-800/80">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t('lore.injection')}</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEntry({ ...entry, injection_behavior: 'passive' })}
                  className={`px-3 py-2 rounded-lg border text-left transition-all ${
                    entry.injection_behavior === 'passive'
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-medium text-xs">{t('lore.passive')}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{t('lore.passiveHint')}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEntry({ ...entry, injection_behavior: 'active' })}
                  className={`px-3 py-2 rounded-lg border text-left transition-all ${
                    entry.injection_behavior === 'active' || entry.injection_behavior === 'directive'
                      ? 'bg-accent-600/20 border-accent-500 text-accent-200 font-semibold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-medium text-xs">{t('lore.activeDirective')}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{t('lore.activeHint')}</div>
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('lore.triggerType')}</span>
              </label>
              <select
                value={entry.trigger_type}
                onChange={(e) => setEntry({ ...entry, trigger_type: e.target.value })}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="keyword">{t('lore.triggerKeyword')}</option>
                <option value="regex">{t('lore.triggerRegex')}</option>
                <option value="always_on">{t('lore.triggerAlways')}</option>
                <option value="tension">{t('lore.triggerTension')}</option>
              </select>
            </div>
          </div>

          {/* Row 3: Keywords & Trigger Inputs */}
          {entry.trigger_type === 'keyword' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  {t('lore.primaryKeys')}
                </label>
                <input
                  type="text"
                  value={primaryKeyInput}
                  onChange={(e) => setPrimaryKeyInput(e.target.value)}
                  placeholder={t('lore.primaryKeysPlaceholder')}
                  className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-cyan-300">
                    {t('lore.secondaryKeys')}
                  </label>
                  <input
                    type="text"
                    value={secondaryKeyInput}
                    onChange={(e) => setSecondaryKeyInput(e.target.value)}
                    placeholder={t('lore.secondaryKeysPlaceholder')}
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-rose-300">
                    {t('lore.excludeKeys')}
                  </label>
                  <input
                    type="text"
                    value={excludeKeyInput}
                    onChange={(e) => setExcludeKeyInput(e.target.value)}
                    placeholder={t('lore.excludeKeysPlaceholder')}
                    className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {entry.trigger_type === 'regex' && (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('lore.regexKeys')}</label>
              <input
                type="text"
                value={regexKeyInput}
                onChange={(e) => setRegexKeyInput(e.target.value)}
                placeholder={t('lore.regexPlaceholder', { example: '\\b(Drache|Wyrm|Lindwurm)\\b' })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          )}

          {entry.trigger_type === 'tension' && (
            <div className="space-y-1 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
              <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                <span>{t('lore.tensionThreshold')}</span>
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={entry.tension_threshold || 60}
                onChange={(e) => setEntry({ ...entry, tension_threshold: parseInt(e.target.value) || 60 })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-hidden focus:border-amber-500"
              />
              <p className="text-[11px] text-amber-400/80">
                {t('lore.tensionThresholdHint')}
              </p>
            </div>
          )}

          {/* Row 4: Priority, Probability, Boundary Check */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('lore.priority')}</label>
              <input
                type="number"
                value={entry.priority ?? 10}
                onChange={(e) => setEntry({ ...entry, priority: parseInt(e.target.value) || 10 })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">{t('lore.probability')}</label>
              <input
                type="number"
                min={1}
                max={100}
                value={entry.probability ?? 100}
                onChange={(e) => setEntry({ ...entry, probability: parseInt(e.target.value) || 100 })}
                className="w-full bg-app border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div className="flex items-center gap-1.5 pt-5 cursor-pointer">
              <input
                type="checkbox"
                id="wholeWords"
                checked={entry.match_whole_words || false}
                onChange={(e) => setEntry({ ...entry, match_whole_words: e.target.checked })}
                className="rounded bg-app border-slate-700 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="wholeWords" className="text-xs text-slate-300 cursor-pointer">
                {t('lore.wholeWords')}
              </label>
            </div>

            <div className="flex items-center gap-1.5 pt-5 cursor-pointer">
              <input
                type="checkbox"
                id="caseSens"
                checked={entry.case_sensitive || false}
                onChange={(e) => setEntry({ ...entry, case_sensitive: e.target.checked })}
                className="rounded bg-app border-slate-700 text-indigo-600 focus:ring-0"
              />
              <label htmlFor="caseSens" className="text-xs text-slate-300 cursor-pointer">
                {t('lore.caseSensitive')}
              </label>
            </div>
          </div>

          {/* Row 5: Chain Dependencies */}
          <div className="p-3 bg-app/60 rounded-xl border border-slate-800 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t('lore.chains')}</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">{t('lore.chainRequires')}</label>
                <input
                  type="text"
                  value={chainRequiresInput}
                  onChange={(e) => setChainRequiresInput(e.target.value)}
                  placeholder={t('lore.chainPlaceholder')}
                  className="w-full bg-app border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">{t('lore.chainActivates')}</label>
                <input
                  type="text"
                  value={chainActivatesInput}
                  onChange={(e) => setChainActivatesInput(e.target.value)}
                  placeholder={t('lore.chainPlaceholder')}
                  className="w-full bg-app border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Row 6: Lore Content Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-200">
                {t('lore.content')}
              </label>
              <span className="text-[11px] text-slate-400 font-mono">
                {t('lore.supportsMacros', { macros: '{{char}} & {{user}}' })}
              </span>
            </div>
            <textarea
              rows={6}
              value={entry.content}
              onChange={(e) => setEntry({ ...entry, content: e.target.value })}
              placeholder={t('lore.contentPlaceholder')}
              className="w-full bg-app border border-slate-800 rounded-xl p-3 text-xs text-slate-100 font-mono focus:outline-hidden focus:border-indigo-500 leading-relaxed"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-app/60 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800 text-xs font-medium transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!entry.name.trim()}
            className="px-5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition-colors disabled:opacity-50"
          >
            {t('lore.saveEntry')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
