import { startTransition, useActionState, useId, useState } from 'react';
import { CharacterProfile, CharacterCardV2 } from '../../types';
import { api } from '../../services/api';
import { useStoreFields } from '../../store/useAppStore';
import { X, Save, Image, Plus, Trash2, Sparkles, User, FileText, Settings2, BookOpen, Globe } from 'lucide-react';
import {
  assetAsBlobUrl,
  getPortraitExpressions,
  PORTRAIT_MOODS,
  PortraitMood,
  resolveCharacterImagePath,
  resolveCharacterImageSource,
} from '../../utils/characterPortraits';
import { ModalOverlay } from '../ui/ModalOverlay';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { fileToDataUrl, pickImageAsDataUrl } from '../../utils/imageFiles';
import { I18N_EXTENSION } from '../../utils/cardI18n';
import { CharacterTranslationsTab } from './CharacterTranslationsTab';

interface CharacterEditorModalProps {
  character: CharacterProfile | null; // null means create new
  onClose: () => void;
  onSaved: (savedProfile: CharacterProfile) => void;
}

export const CharacterEditorModal = ({
  character,
  onClose,
  onSaved,
}: CharacterEditorModalProps) => {
  const { t, tOptional } = useTranslation();
  const fieldId = useId();
  const { refreshCharacters, allLorebooks, scannedVrms, scannedLive2ds } = useStoreFields(
    'refreshCharacters', 'allLorebooks', 'scannedVrms', 'scannedLive2ds',
  );

  const [activeTab, setActiveTab] = useState<'basics' | 'expressions' | 'prompts' | 'greetings' | 'lorebooks' | 'i18n' | 'raw'>('basics');

  // Form State
  const [boundLorebooks, setBoundLorebooks] = useState<string[]>(character?.bound_lorebooks || []);
  const [vrmPath, setVrmPath] = useState<string>(
    (character?.card.data.extensions?.custom_vrm as string) ||
    (character?.card.data.extensions?.sow_vrm as string) ||
    ''
  );
  const [live2dModel, setLive2dModel] = useState<string>(
    (character?.card.data.extensions?.custom_live2d as string) ||
    (character?.card.data.extensions?.sow_live2d as string) ||
    ''
  );
  const [name, setName] = useState(character?.card.data.name || '');
  const [title, setTitle] = useState(
    (character?.card.data.extensions?.custom_title as string) ||
    (character?.card.data.extensions?.sow_title as string) ||
    character?.card.data.tags?.[0] ||
    ''
  );
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(character?.avatar_data_url || null);
  const [expressionImages, setExpressionImages] = useState<Record<string, string>>(
    () => ({ ...getPortraitExpressions(character) })
  );
  const [description, setDescription] = useState(character?.card.data.description || '');
  const [personality, setPersonality] = useState(character?.card.data.personality || '');
  const [scenario, setScenario] = useState(character?.card.data.scenario || '');
  const [firstMes, setFirstMes] = useState(character?.card.data.first_mes || '');
  const [mesExample, setMesExample] = useState(character?.card.data.mes_example || '');
  const [alternateGreetings, setAlternateGreetings] = useState<string[]>(
    character?.card.data.alternate_greetings || []
  );
  const [systemPrompt, setSystemPrompt] = useState(character?.card.data.system_prompt || '');
  const [creatorNotes, setCreatorNotes] = useState(character?.card.data.creator_notes || '');
  const [sourceLanguage, setSourceLanguage] = useState<string>(
    (character?.card.data.extensions?.[I18N_EXTENSION] as Record<string, unknown>)?.source_language as string || 'de'
  );
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>(
    (character?.card.data.extensions?.[I18N_EXTENSION] as Record<string, unknown>)?.translations as Record<string, Record<string, string>> || {}
  );
  const [tagsStr, setTagsStr] = useState(character?.card.data.tags?.join(', ') || '');
  // Soul Stage 5e: class template for scenes with the 5e rules (`extensions.otakusoul_5e`).
  const fiveE = (character?.card.data.extensions?.otakusoul_5e as Record<string, unknown> | undefined) ?? {};
  const [fiveEClass, setFiveEClass] = useState<string>(typeof fiveE.class === 'string' ? fiveE.class : '');
  const [newGreeting, setNewGreeting] = useState('');
  // Cards may carry translations (extensions.otakusoul_i18n); the editor changes the base language only.
  const i18n = character?.card.data.extensions?.[I18N_EXTENSION] as
    | { source_language?: string; translations?: Record<string, unknown> }
    | undefined;
  const translatedLanguages = Object.keys(i18n?.translations ?? {});
  const cardLanguages = translatedLanguages.length
    ? {
        source: (i18n?.source_language ?? '?').toUpperCase(),
        languages: translatedLanguages.map((code) => code.toUpperCase()).join(', '),
      }
    : null;

  const pickImage = async (): Promise<string | null> => {
    try {
      return await pickImageAsDataUrl();
    } catch (e) {
      console.error('Failed to pick character image:', e);
      return null;
    }
  };

  const handlePickAvatar = async () => {
    const image = await pickImage();
    if (image) setAvatarDataUrl(image);
  };

  const handlePickExpression = async (mood: PortraitMood) => {
    const image = await pickImage();
    if (image) {
      setExpressionImages((current) => ({ ...current, [mood]: image }));
    }
  };

  const handleRemoveExpression = (mood: PortraitMood) => {
    setExpressionImages((current) => {
      const next = { ...current };
      delete next[mood];
      return next;
    });
  };

  const handleAddGreeting = () => {
    if (!newGreeting.trim()) return;
    setAlternateGreetings([...alternateGreetings, newGreeting.trim()]);
    setNewGreeting('');
  };

  const handleRemoveGreeting = (index: number) => {
    setAlternateGreetings(alternateGreetings.filter((_, i) => i !== index));
  };

  // Pending and error state come from the action.
  const [errorMsg, saveCharacter, isSaving] = useActionState(async (): Promise<string | null> => {
    if (!name.trim()) return translate('editor.nameRequired');

    const tags = tagsStr
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const cleanedExpressionImages = Object.fromEntries(
      Object.entries(expressionImages).filter(([, value]) => Boolean(value))
    );

    // Relative preset paths would break after saving the card into the user directory.
    // Embed those images so an edited/exported character remains self-contained.
    try {
      for (const [mood, imageSource] of Object.entries(cleanedExpressionImages)) {
        const filePath = resolveCharacterImagePath(imageSource, character?.source_path);
        if (filePath) cleanedExpressionImages[mood] = await fileToDataUrl(filePath);
      }
    } catch (e) {
      return translate('editor.embedFailed', { error: errorMessage(e) });
    }

    const updatedCard: CharacterCardV2 = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: name.trim(),
        description: description.trim(),
        personality: personality.trim(),
        scenario: scenario.trim(),
        first_mes: firstMes.trim(),
        mes_example: mesExample.trim(),
        alternate_greetings: alternateGreetings,
        system_prompt: systemPrompt.trim() ? systemPrompt.trim() : undefined,
        creator_notes: creatorNotes.trim() ? creatorNotes.trim() : undefined,
        tags,
        extensions: (() => {
          const cleanExt = { ...(character?.card.data.extensions || {}) };
          delete cleanExt.sow_title;
          delete cleanExt.sow_vrm;
          delete cleanExt.sow_live2d;
          delete cleanExt.sow_expressions;
          return {
            ...cleanExt,
            custom_title: title.trim() || undefined,
            custom_vrm: vrmPath || undefined,
            custom_live2d: live2dModel || undefined,
            expressions: Object.keys(cleanedExpressionImages).length > 0
              ? cleanedExpressionImages
              : undefined,
            [I18N_EXTENSION]: Object.keys(translations).length > 0
              ? { source_language: sourceLanguage, translations }
              : undefined,
            otakusoul_5e: (() => {
              const { class: _old, ...rest } = fiveE;
              const next = fiveEClass ? { ...rest, class: fiveEClass } : rest;
              return Object.keys(next).length > 0 ? next : undefined;
            })(),
          };
        })(),
      },
    };

    const profileToSave: CharacterProfile = {
      id: character?.id || name.trim().toLowerCase().replace(/\s+/g, '_'),
      card: updatedCard,
      avatar_data_url: avatarDataUrl || undefined,
      source_path: character?.source_path,
      bound_lorebooks: boundLorebooks,
    };

    try {
      const saved = await api.saveCharacterCard(profileToSave);
      await refreshCharacters();
      onSaved(saved);
      onClose();
      return null;
    } catch (e) {
      console.error('Failed to save character card:', e);
      return translate('editor.saveFailed', { error: errorMessage(e) });
    }
  }, null);

  return (
    <ModalOverlay onClose={onClose} aria-labelledby="character-editor-title" className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-600/20 border border-accent-500/30 flex items-center justify-center text-accent-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="character-editor-title" className="text-base font-bold text-slate-100">
                {character ? t('editor.titleEdit', { name: character.card.data.name }) : t('editor.titleNew')}
              </h2>
              <p className="text-xs text-slate-400">{t('editor.subtitle')}</p>
              {cardLanguages && (
                <p className="text-xs text-amber-300/90 mt-0.5">
                  {t('editor.translationsHint', cardLanguages)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div role="tablist" aria-label={t('editor.tabs')} className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50 overflow-x-auto">
          <button
            role="tab"
            aria-selected={activeTab === 'basics'}
            onClick={() => setActiveTab('basics')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'basics'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>{t('editor.tabBasics')}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'expressions'}
            onClick={() => setActiveTab('expressions')}
            className={`flex shrink-0 items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'expressions'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Image className="w-3.5 h-3.5" />
            <span>{t('editor.tabEmotions', { count: Object.keys(expressionImages).length })}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'prompts'}
            onClick={() => setActiveTab('prompts')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'prompts'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('editor.tabPrompts')}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'greetings'}
            onClick={() => setActiveTab('greetings')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'greetings'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('editor.tabGreetings', { count: alternateGreetings.length + 1 })}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'lorebooks'}
            onClick={() => setActiveTab('lorebooks')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'lorebooks'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{t('editor.tabLorebooks', { count: boundLorebooks.length })}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'i18n'}
            onClick={() => setActiveTab('i18n')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'i18n'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{tOptional('editor.tabI18n', 'Übersetzungen')}</span>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'raw'}
            onClick={() => setActiveTab('raw')}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 text-xs font-semibold whitespace-nowrap transition-all outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 ${
              activeTab === 'raw'
                ? 'border-accent-500 text-accent-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{t('editor.tabRaw')}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs">
              {errorMsg}
            </div>
          )}

          {/* TAB 1: Basics & Avatar */}
          {activeTab === 'basics' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Avatar Column */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-44 h-44 rounded-2xl bg-app border-2 border-dashed border-slate-700/80 flex items-center justify-center overflow-hidden relative group">
                  {avatarDataUrl ? (
                    <img
                      src={avatarDataUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <Image className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <span className="text-xs text-slate-400">{t('editor.noAvatar')}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handlePickAvatar}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-medium text-white transition-opacity"
                  >
                    {t('editor.changeImage')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handlePickAvatar}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Image className="w-3.5 h-3.5" />
                  <span>{t('editor.chooseAvatar')}</span>
                </button>
                {avatarDataUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarDataUrl(null)}
                    className="text-xs text-rose-400 hover:underline"
                  >
                    {t('editor.removeAvatar')}
                  </button>
                )}
                
                <div className="w-full mt-2 space-y-1.5 px-2">
                  <label className="text-xs font-semibold text-slate-400">{t('editor.vrm')}</label>
                  <select
                    value={vrmPath}
                    onChange={(e) => setVrmPath(e.target.value)}
                    className="w-full bg-app border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-hidden focus:border-accent-500 transition-colors"
                  >
                    <option value="">{t('editor.vrmDefault')}</option>
                    {scannedVrms.map((vrm) => (
                      <option key={vrm.path} value={vrm.path}>
                        {vrm.name}{vrm.format === 'mmd' ? ' (MMD)' : vrm.format === 'gltf' ? ' (glTF)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full mt-2 space-y-1.5 px-2">
                  <label className="text-xs font-semibold text-slate-400">{t('editor.live2d')}</label>
                  <select
                    value={live2dModel}
                    onChange={(e) => setLive2dModel(e.target.value)}
                    className="w-full bg-app border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-hidden focus:border-accent-500 transition-colors"
                  >
                    <option value="">{t('editor.noLive2d')}</option>
                    {scannedLive2ds.map((l2d) => (
                      <option key={l2d.id} value={l2d.id}>
                        {l2d.name} ({l2d.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Basic Fields */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-name`}>
                    {t('editor.name')}
                  </label>
                  <input
                    id={`${fieldId}-name`}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('editor.namePlaceholder')}
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-title`}>
                    {t('editor.title')}
                  </label>
                  <input
                    id={`${fieldId}-title`}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('editor.titlePlaceholder')}
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-tags`}>
                    {t('editor.tags')}
                  </label>
                  <input
                    id={`${fieldId}-tags`}
                    type="text"
                    value={tagsStr}
                    onChange={(e) => setTagsStr(e.target.value)}
                    placeholder="Anime, Tsundere, Sci-Fi, Steins;Gate"
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-fiveEClass`}>
                    {t('editor.fiveEClass')}
                  </label>
                  <select
                    id={`${fieldId}-fiveEClass`}
                    value={fiveEClass}
                    onChange={(e) => setFiveEClass(e.target.value)}
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 focus:outline-hidden focus:border-accent-500"
                  >
                    <option value="">{t('editor.fiveEClassNone')}</option>
                    {(['fighter', 'wizard', 'rogue', 'cleric'] as const).map((id) => (
                      <option key={id} value={id}>{t(`sceneRules.class.${id}`)}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">{t('editor.fiveEClassHint')}</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-creatorNotes`}>
                    {t('editor.creatorNotes')}
                  </label>
                  <input
                    id={`${fieldId}-creatorNotes`}
                    type="text"
                    value={creatorNotes}
                    onChange={(e) => setCreatorNotes(e.target.value)}
                    placeholder={t('editor.creatorNotesPlaceholder')}
                    className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Optional 2D expression portraits */}
          {activeTab === 'expressions' && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl border border-accent-500/30 bg-accent-500/10 text-xs text-accent-100">
                {t('editor.emotionsIntro')}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PORTRAIT_MOODS.map((mood) => {
                  const storedImage = expressionImages[mood.key];
                  const previewImage = resolveCharacterImageSource(storedImage, character?.source_path);
                  const fallbackImage = mood.key === 'neutral' ? avatarDataUrl : null;

                  return (
                    <div
                      key={mood.key}
                      className="rounded-2xl border border-slate-800 bg-app/60 overflow-hidden"
                    >
                      <div className="relative aspect-[4/5] bg-slate-900 flex items-center justify-center overflow-hidden group">
                        {previewImage || fallbackImage ? (
                          <img
                            src={previewImage || fallbackImage || undefined}
                            alt={t('editor.moodAlt', { name: name || t('editor.defaultName'), mood: t(`portrait.${mood.key}`) })}
                            onError={(e) => {
                              const image = e.currentTarget;
                              // Under `tauri dev` asset files only show as blob URLs; a missing file shows the base picture.
                              if (!image.dataset.blobTried) {
                                image.dataset.blobTried = '1';
                                void assetAsBlobUrl(image.src)
                                  .then((url) => {
                                    image.src = url;
                                  })
                                  .catch(() => {
                                    if (fallbackImage && image.src !== fallbackImage) image.src = fallbackImage;
                                  });
                              } else if (fallbackImage && image.src !== fallbackImage) {
                                image.src = fallbackImage;
                              }
                            }}
                            className={`w-full h-full object-cover ${!previewImage ? 'opacity-60' : ''}`}
                          />
                        ) : (
                          <Image className="w-10 h-10 text-slate-600" />
                        )}
                        <button
                          type="button"
                          onClick={() => handlePickExpression(mood.key)}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs font-semibold text-white transition-opacity"
                        >
                          {storedImage ? t('editor.changeImage') : t('editor.chooseImage')}
                        </button>
                        {!previewImage && fallbackImage && (
                          <span className="absolute bottom-2 left-2 px-2 py-1 rounded-md bg-app/80 text-[11px] text-slate-300">
                            {t('editor.defaultAvatar')}
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <h3 className="text-xs font-bold text-slate-100">{t(`portrait.${mood.key}`)}</h3>
                            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                              {t(`portrait.${mood.key}Desc`)}
                            </p>
                          </div>
                          {storedImage && (
                            <button
                              type="button"
                              onClick={() => handleRemoveExpression(mood.key)}
                              className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title={t('editor.removeMoodImage', { mood: t(`portrait.${mood.key}`) })}
                              aria-label={t('editor.removeMoodImage', { mood: t(`portrait.${mood.key}`) })}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Prompts & Personality */}
          {activeTab === 'prompts' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-description`}>
                  {t('editor.description')}
                </label>
                <textarea
                  id={`${fieldId}-description`}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('editor.descriptionPlaceholder')}
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-personality`}>
                  {t('editor.personality')}
                </label>
                <textarea
                  id={`${fieldId}-personality`}
                  rows={3}
                  value={personality}
                  onChange={(e) => setPersonality(e.target.value)}
                  placeholder={t('editor.personalityPlaceholder')}
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-scenario`}>
                  {t('editor.scenario')}
                </label>
                <textarea
                  id={`${fieldId}-scenario`}
                  rows={2}
                  value={scenario}
                  onChange={(e) => setScenario(e.target.value)}
                  placeholder={t('editor.scenarioPlaceholder')}
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-examples`}>
                  {t('editor.examples')}
                </label>
                <textarea
                  id={`${fieldId}-examples`}
                  rows={4}
                  value={mesExample}
                  onChange={(e) => setMesExample(e.target.value)}
                  placeholder={t('editor.examplesPlaceholder')}
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 font-mono text-xs placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-systemPrompt`}>
                  {t('editor.systemPrompt')}
                </label>
                <textarea
                  id={`${fieldId}-systemPrompt`}
                  rows={2}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={t('editor.systemPromptPlaceholder')}
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 font-mono text-xs placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
                />
              </div>
            </div>
          )}

          {/* TAB 4: Greetings */}
          {activeTab === 'greetings' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1" htmlFor={`${fieldId}-firstMessage`}>
                  {t('editor.firstMessage')}
                </label>
                <textarea
                  id={`${fieldId}-firstMessage`}
                  rows={4}
                  value={firstMes}
                  onChange={(e) => setFirstMes(e.target.value)}
                  placeholder={t('editor.firstMessagePlaceholder')}
                  className="w-full px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  {t('editor.altGreetings', { count: alternateGreetings.length })}
                </label>
                <div className="space-y-2 mb-3">
                  {alternateGreetings.map((greeting, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-app border border-slate-800 rounded-xl flex items-start justify-between gap-3 text-xs"
                    >
                      <span className="text-slate-300 flex-1 whitespace-pre-wrap">{greeting}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGreeting(idx)}
                        title={t('editor.removeGreeting')}
                        aria-label={t('editor.removeGreeting')}
                        className="text-slate-400 hover:text-rose-400 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <textarea
                    rows={2}
                    aria-label={t('editor.altGreetingPlaceholder')}
                    value={newGreeting}
                    onChange={(e) => setNewGreeting(e.target.value)}
                    placeholder={t('editor.altGreetingPlaceholder')}
                    className="flex-1 px-3 py-2 bg-app border border-slate-800 rounded-xl text-slate-200 text-xs placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-y"
                  />
                  <button
                    type="button"
                    onClick={handleAddGreeting}
                    className="px-4 bg-accent-600/30 hover:bg-accent-600/50 text-accent-300 border border-accent-500/40 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('editor.add')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Lorebooks Binding */}
          {activeTab === 'lorebooks' && (
            <div className="space-y-4">
              <div className="p-3 bg-accent-500/10 border border-accent-500/30 rounded-xl text-xs text-accent-200 flex items-center justify-between">
                <div>
                  <span className="font-bold">{t('editor.lorebookBinding')}</span> {t('editor.lorebookBindingText')}
                </div>
                <span className="font-mono text-accent-300 font-bold">{boundLorebooks.length} gebunden</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {allLorebooks.map((lb) => {
                  const idOrPath = lb.id || lb.file_path || lb.name;
                  const isBound =
                    boundLorebooks.includes(idOrPath) ||
                    (lb.file_path ? boundLorebooks.includes(lb.file_path) : false) ||
                    (lb.id ? boundLorebooks.includes(lb.id) : false);

                  return (
                    <label
                      key={idOrPath}
                      className={`block p-3.5 rounded-xl border cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-500/60 ${
                        isBound
                          ? 'bg-accent-600/15 border-accent-500/60 shadow-sm'
                          : 'bg-app/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isBound}
                            onChange={() => {
                              if (isBound) {
                                setBoundLorebooks(
                                  boundLorebooks.filter(
                                    (x) => x !== lb.id && x !== lb.file_path && x !== idOrPath
                                  )
                                );
                              } else {
                                setBoundLorebooks([...boundLorebooks, lb.id || idOrPath]);
                              }
                            }}
                            className="rounded bg-slate-900 border-slate-700 text-accent-600 focus:ring-0"
                          />
                          <span className="text-xs font-bold text-slate-100">{lb.name}</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[11px] bg-slate-800 text-slate-400 font-mono border border-slate-700">
                          {t('editor.entryCount', { count: lb.entries.length })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {lb.description || t('editor.noDescription')}
                      </p>
                    </label>
                  );
                })}

                {allLorebooks.length === 0 && (
                  <div className="col-span-2 p-8 text-center text-xs text-slate-400">
                    {t('editor.noLorebooks')}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: Translations */}
          {activeTab === 'i18n' && (
            <CharacterTranslationsTab
              sourceLanguage={sourceLanguage}
              setSourceLanguage={setSourceLanguage}
              translations={translations}
              setTranslations={setTranslations}
            />
          )}

          {/* TAB 7: Raw JSON Preview */}
          {activeTab === 'raw' && (
            <div>
              <pre className="p-4 bg-app border border-slate-800 rounded-xl font-mono text-xs text-accent-300 max-h-96 overflow-y-auto">
                {JSON.stringify(
                  {
                    spec: 'chara_card_v2',
                    spec_version: '2.0',
                    data: {
                      name,
                      description,
                      personality,
                      scenario,
                      first_mes: firstMes,
                      mes_example: mesExample,
                      alternate_greetings: alternateGreetings,
                      system_prompt: systemPrompt || undefined,
                      creator_notes: creatorNotes || undefined,
                      tags: tagsStr.split(',').map((tag) => tag.trim()),
                      extensions: {
                        ...(character?.card.data.extensions || {}),
                        custom_title: title || undefined,
                        custom_vrm: vrmPath || undefined,
                        custom_live2d: live2dModel || undefined,
                        expressions: Object.keys(expressionImages).length > 0
                          ? expressionImages
                          : undefined,
                      },
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-app/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs font-medium"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => startTransition(saveCharacter)}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-accent-900/30 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? t('editor.saving') : t('editor.save')}</span>
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
