import React, { useState } from 'react';
import { Plus, Trash2, Globe } from 'lucide-react';
import { useTranslation } from '../../i18n';

interface TranslationsTabProps {
  sourceLanguage: string;
  setSourceLanguage: (lang: string) => void;
  translations: Record<string, Record<string, string>>;
  setTranslations: (t: Record<string, Record<string, string>>) => void;
}

export const CharacterTranslationsTab: React.FC<TranslationsTabProps> = ({
  sourceLanguage,
  setSourceLanguage,
  translations,
  setTranslations,
}) => {
  const { tOptional } = useTranslation();
  const langs = Object.keys(translations);
  const [activeLang, setActiveLang] = useState<string>(langs[0] || '');
  const [newLang, setNewLang] = useState('');

  const handleAddLang = () => {
    const lang = newLang.trim().toLowerCase();
    if (!lang || translations[lang]) return;
    setTranslations({ ...translations, [lang]: {} });
    setActiveLang(lang);
    setNewLang('');
  };

  const handleRemoveLang = (lang: string) => {
    const next = { ...translations };
    delete next[lang];
    setTranslations(next);
    if (activeLang === lang) {
      setActiveLang(Object.keys(next)[0] || '');
    }
  };

  const updateTranslation = (field: string, value: string) => {
    if (!activeLang) return;
    setTranslations({
      ...translations,
      [activeLang]: { ...translations[activeLang], [field]: value },
    });
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-app/50 border border-slate-800 rounded-xl space-y-3">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Globe className="w-4 h-4 text-accent-400" />
          {tOptional('editor.i18nTitle', 'Mehrsprachigkeit & Lokalisierung')}
        </h3>
        <p className="text-xs text-slate-400">
          {tOptional('editor.i18nDesc', 'Hier kannst Du Übersetzungen für die Karte hinterlegen. Hat der Nutzer in der Chat-Stage eine dieser Sprachen ausgewählt, wird die entsprechende Übersetzung verwendet.')}
        </p>

        <div className="flex items-center gap-3 mt-2">
          <label className="text-xs font-semibold text-slate-300 w-32">{tOptional('editor.sourceLang', 'Originalsprache')}:</label>
          <input
            type="text"
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
            className="w-24 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs focus:outline-hidden focus:border-accent-500 text-slate-100"
            placeholder="de"
          />
        </div>
      </div>

      <div className="flex gap-4 items-stretch h-[550px]">
        {/* Language Sidebar */}
        <div className="w-48 flex flex-col gap-2 bg-app/50 border border-slate-800 p-3 rounded-xl">
          <div className="font-semibold text-xs text-slate-400 uppercase mb-2">{tOptional('editor.languages', 'Sprachen')}</div>
          {langs.map((lang) => (
            <button type="button" key={lang} className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${activeLang === lang ? 'bg-accent-600 text-white shadow-md' : 'hover:bg-slate-800 text-slate-300 border border-transparent hover:border-slate-700'}`} onClick={() => setActiveLang(lang)}>
              <span className="font-bold text-sm uppercase">{lang}</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); handleRemoveLang(lang); }} className="p-1 hover:text-rose-400" title={tOptional('common.delete', 'Löschen')}>
                <Trash2 className="w-4 h-4" />
              </button>
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-slate-800 flex flex-col gap-2">
            <input
              type="text"
              value={newLang}
              onChange={(e) => setNewLang(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLang()}
              placeholder={tOptional('editor.langPlaceholder', 'z.B. en, ru, ja')}
              className="px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs focus:outline-hidden focus:border-accent-500 text-slate-100"
            />
            <button onClick={handleAddLang} disabled={!newLang.trim()} className="w-full px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs flex items-center justify-center gap-2 border border-slate-700 transition disabled:opacity-50">
              <Plus className="w-4 h-4" /> {tOptional('editor.addLanguage', 'Hinzufügen')}
            </button>
          </div>
        </div>

        {/* Translation Form */}
        <div className="flex-1 bg-app/50 border border-slate-800 p-4 rounded-xl overflow-y-auto space-y-4">
          {!activeLang ? (
            <div className="h-full flex items-center justify-center text-slate-400 text-sm">
              {tOptional('editor.noLanguageSelected', 'Keine Sprache ausgewählt')}
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">sow_title</label>
                <input
                  type="text"
                  value={translations[activeLang]?.sow_title || ''}
                  onChange={(e) => updateTranslation('sow_title', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">description</label>
                <textarea
                  rows={4}
                  value={translations[activeLang]?.description || ''}
                  onChange={(e) => updateTranslation('description', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">personality</label>
                <textarea
                  rows={3}
                  value={translations[activeLang]?.personality || ''}
                  onChange={(e) => updateTranslation('personality', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">scenario</label>
                <textarea
                  rows={3}
                  value={translations[activeLang]?.scenario || ''}
                  onChange={(e) => updateTranslation('scenario', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">first_mes</label>
                <textarea
                  rows={4}
                  value={translations[activeLang]?.first_mes || ''}
                  onChange={(e) => updateTranslation('first_mes', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">mes_example</label>
                <textarea
                  rows={4}
                  value={translations[activeLang]?.mes_example || ''}
                  onChange={(e) => updateTranslation('mes_example', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">system_prompt</label>
                <textarea
                  rows={3}
                  value={translations[activeLang]?.system_prompt || ''}
                  onChange={(e) => updateTranslation('system_prompt', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">post_history_instructions</label>
                <textarea
                  rows={3}
                  value={translations[activeLang]?.post_history_instructions || ''}
                  onChange={(e) => updateTranslation('post_history_instructions', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono focus:outline-hidden focus:border-accent-500 text-slate-100"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
