import type React from 'react';
import { useEffect, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { api } from '../../../services/api';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import {
  RefreshCw,
  Image as ImageIcon,
  Settings,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { LocalImageStatus, ScannedModel } from '../../../types';
import { DEFAULT_IMG_CONFIG, providerOption } from '../../settings/sections/ImageSettings';

export const ImageGenTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    imageGenConfig, generateImageAction, generatedImages, fetchGeneratedImages,
    activeCharacter, currentEmotion, openSettingsSection,
  } = useStoreFields(
    'imageGenConfig', 'generateImageAction', 'generatedImages',
    'fetchGeneratedImages', 'activeCharacter', 'currentEmotion', 'openSettingsSection',
  );

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  // The backend is configured in the settings (Image); the studio uses what is saved there.
  const localImgConfig = imageGenConfig ?? DEFAULT_IMG_CONFIG;
  const [testPrompt, setTestPrompt] = useState('');
  const [negativeDraft, setTestNegative] = useState<string | null>(null);
  const testNegative = negativeDraft ?? (imageGenConfig?.negative_prompt || DEFAULT_IMG_CONFIG.negative_prompt);
  const [localStatus, setLocalStatus] = useState<LocalImageStatus | null>(null);
  const [loras, setLoras] = useState<ScannedModel[]>([]);

  useEffect(() => {
    api.scanLoras().then(setLoras).catch(() => {});
  }, []);

  const provider = providerOption(localImgConfig.provider);
  const isLocal = provider === 'local';

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    api
      .onLocalImageStatus(setLocalStatus)
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const handleBuildPromptFromContext = async () => {
    if (!activeCharacter) {
      toast.info(t('int.noCharacter'));
      return;
    }
    try {
      const p = await api.buildCharacterImagePrompt(
        activeCharacter.card.data.name,
        activeCharacter.card.data.description,
        currentEmotion?.emotion,
        'portrait, looking at viewer, masterpiece, anime style',
        testPrompt || undefined
      );
      setTestPrompt(p);
      toast.success(t('int.promptBuilt'));
    } catch (e) {
      toast.error(t('int.error', { error: errorMessage(e) }));
    }
  };

  const handleGenerateImage = async () => {
    if (!testPrompt.trim()) {
      toast.info(t('int.enterPrompt'));
      return;
    }
    setIsGeneratingImage(true);
    setLocalStatus(null);
    try {
      const res = await generateImageAction(testPrompt, testNegative || undefined, localImgConfig);
      if (res) {
        toast.success(t('int.imageDone', { file: res.file_name }));
      } else {
        toast.success(t('int.imageFinished'));
      }
    } catch (e) {
      toast.error(t('int.imageFailed', { error: errorMessage(e) }));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Which backend draws: configured in the settings. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <p className="text-xs text-slate-400">
          {t('int.imageBackend', { provider: isLocal ? t('int.providerLocal') : localImgConfig.provider })}
        </p>
        <button
          type="button"
          onClick={() => openSettingsSection('image')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
        >
          <Settings className="w-3.5 h-3.5" />
          {t('int.imageOpenSettings')}
        </button>
      </div>

      {/* Studio */}
      <div className="grid grid-cols-1 gap-6">
        {/* Live Generator Studio */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wand2 className="w-4 h-4 text-accent-400" />
              <h2 className="text-sm font-bold text-slate-100">{t('int.studio')}</h2>
            </div>

            <button
              onClick={handleBuildPromptFromContext}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-accent-600/20 hover:bg-accent-600/30 text-accent-300 text-xs border border-accent-500/40 transition"
              title={t('int.promptFromCharHint')}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{t('int.promptFromChar')}</span>
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {t('int.positive')}
            </label>
            <textarea
              rows={4}
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="1girl, anime masterpiece, silver hair, cyber jacket, smiling..."
              className="w-full bg-app border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-hidden focus:border-accent-500 resize-none font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {t('int.negative')}
            </label>
            <textarea
              rows={2}
              value={testNegative}
              onChange={(e) => setTestNegative(e.target.value)}
              placeholder="low quality, bad hands, blurry..."
              className="w-full bg-app border border-slate-700 rounded-xl p-2.5 text-xs text-slate-300 focus:outline-hidden focus:border-accent-500 resize-none font-mono"
            />
          </div>

          {/* sd-server ignores `<lora:…>` tags; local LoRAs are chosen in the local settings. */}
          {!isLocal && loras.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {t('int.loraInsert')}
              </label>
              <div className="flex flex-wrap gap-2">
                {loras.map((lora) => (
                  <button
                    key={lora.path}
                    onClick={() => setTestPrompt((prompt) => (prompt ? `${prompt}, <lora:${lora.name}:1.0>` : `<lora:${lora.name}:1.0>`))}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs transition"
                  >
                    {lora.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleGenerateImage}
            disabled={isGeneratingImage || !testPrompt.trim()}
            className="w-full py-2.5 rounded-xl bg-linear-to-r from-accent-600 to-indigo-600 hover:from-accent-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-accent-600/30 disabled:opacity-50 flex items-center justify-center gap-2 transition"
          >
            {isGeneratingImage ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>
                  {isLocal && localStatus && localStatus.phase !== 'done' && localStatus.phase !== 'failed'
                    ? t(`localImage.phase.${localStatus.phase}` as 'localImage.phase.generating')
                    : t('int.generating')}
                </span>
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                <span>{t('int.generate')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bottom Gallery Feed */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-accent-400" />
            <h3 className="text-sm font-bold text-slate-100">
              {t('int.galleryTitle', { count: generatedImages.length })}
            </h3>
          </div>

          <button
            onClick={fetchGeneratedImages}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
            title={t('int.refreshGallery')}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {generatedImages.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            {t('int.noImages')}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {generatedImages.map((img, idx) => (
              <div
                key={idx}
                className="group relative bg-app border border-slate-800 rounded-xl overflow-hidden shadow-md flex flex-col p-3 space-y-2"
              >
                <img
                  src={convertFileSrc(img.file_path)}
                  alt={img.file_name}
                  loading="lazy"
                  className="w-full aspect-[2/3] object-cover bg-slate-900 rounded-lg border border-slate-800"
                />
                <div className="text-xs font-mono text-slate-200 truncate">
                  {img.file_name}
                </div>
                <div className="text-[11px] text-slate-400">
                  {(img.size_bytes / 1024).toFixed(1)} KB · {img.created_at}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
