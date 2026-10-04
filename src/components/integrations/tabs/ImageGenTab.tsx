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
  Save,
  Image as ImageIcon,
  Palette,
  Sparkles,
  Eye,
  EyeOff,
  Wand2,
} from 'lucide-react';
import type { ImageGenConfig, LocalImageStatus, ScannedModel } from '../../../types';
import { LocalImageSettings } from './LocalImageSettings';

/** Default endpoint per provider; `local` needs none. */
const PROVIDER_URLS: Record<string, string> = {
  automatic1111: 'http://127.0.0.1:7860',
  comfy_ui: 'http://127.0.0.1:8188',
};

const DEFAULT_IMG_CONFIG: ImageGenConfig = {
  provider: 'automatic1111',
  api_url: 'http://127.0.0.1:7860',
  api_key: null,
  positive_prompt_prefix: '',
  negative_prompt: 'low quality, bad hands, blurry',
  width: 512,
  height: 768,
  steps: 28,
  cfg_scale: 7.0,
  sampler_name: 'Euler a',
  seed: -1,
  local_model_id: null,
  vram_strategy: 'auto',
};

export const ImageGenTab: React.FC = () => {
  const { t } = useTranslation();
  const {
    imageGenConfig, saveImageGenConfig, generateImageAction, generatedImages, fetchGeneratedImages,
    activeCharacter, currentEmotion,
  } = useStoreFields(
    'imageGenConfig', 'saveImageGenConfig', 'generateImageAction', 'generatedImages',
    'fetchGeneratedImages', 'activeCharacter', 'currentEmotion',
  );

  const [showImgApiKey, setShowImgApiKey] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  // Edits live in a draft; without one the form shows the saved configuration.
  const [draft, setLocalImgConfig] = useState<ImageGenConfig | null>(null);
  const localImgConfig = draft ?? imageGenConfig ?? DEFAULT_IMG_CONFIG;
  const [testPrompt, setTestPrompt] = useState('');
  const [negativeDraft, setTestNegative] = useState<string | null>(null);
  const testNegative = negativeDraft ?? (imageGenConfig?.negative_prompt || DEFAULT_IMG_CONFIG.negative_prompt);
  const [localStatus, setLocalStatus] = useState<LocalImageStatus | null>(null);
  const [loras, setLoras] = useState<ScannedModel[]>([]);

  useEffect(() => {
    api.scanLoras().then(setLoras).catch(() => {});
  }, []);

  const provider = localImgConfig.provider.toLowerCase();
  const isLocal = provider === 'local';

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    api
      .onLocalImageStatus(setLocalStatus)
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  const handleSaveImgConfig = async () => {
    try {
      await saveImageGenConfig(localImgConfig);
      setLocalImgConfig(null);
      toast.success(t('int.imageSaved'));
    } catch (e) {
      toast.error(t('int.error', { error: errorMessage(e) }));
    }
  };

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
      {/* Top Configuration & Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Provider Config */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent-500/20 border border-accent-500/40 flex items-center justify-center text-accent-400">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-100">{t('int.imageTitle')}</h2>
                <p className="text-xs text-slate-400">{t('int.imageProviders')}</p>
              </div>
            </div>

            <button
              onClick={handleSaveImgConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('int.save')}</span>
            </button>
          </div>


          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Globaler Stil / Prefix (wird an jeden Prompt angehängt)
            </label>
            <textarea
              rows={2}
              value={localImgConfig.positive_prompt_prefix}
              onChange={(e) => setLocalImgConfig({ ...localImgConfig, positive_prompt_prefix: e.target.value })}
              placeholder="masterpiece, best quality..."
              className="w-full bg-app border border-slate-700 rounded-xl p-3 text-xs text-slate-100 focus:outline-hidden focus:border-accent-500 resize-none font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('int.provider')}
              </label>
              <select
                value={localImgConfig.provider}
                onChange={(e) =>
                  setLocalImgConfig({
                    ...localImgConfig,
                    provider: e.target.value,
                    api_url: PROVIDER_URLS[e.target.value] ?? localImgConfig.api_url,
                  })
                }
                aria-label={t('int.provider')}
                className="w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100"
              >
                <option value="local">{t('int.providerLocal')}</option>
                <option value="automatic1111">Automatic1111 (SD WebUI)</option>
                <option value="comfy_ui">ComfyUI</option>
                <option value="dall_e_3">OpenAI DALL-E 3</option>
                <option value="novel_ai">NovelAI Image Gen</option>
              </select>
            </div>

            {!isLocal && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('int.resolution')}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={localImgConfig.width}
                  onChange={(e) =>
                    setLocalImgConfig({
                      ...localImgConfig,
                      width: parseInt(e.target.value) || 512,
                    })
                  }
                  className="bg-app border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-100 font-mono text-center"
                  placeholder={t('int.width')}
                />
                <input
                  type="number"
                  value={localImgConfig.height}
                  onChange={(e) =>
                    setLocalImgConfig({
                      ...localImgConfig,
                      height: parseInt(e.target.value) || 768,
                    })
                  }
                  className="bg-app border border-slate-700 rounded-xl px-2 py-2 text-xs text-slate-100 font-mono text-center"
                  placeholder={t('int.height')}
                />
              </div>
            </div>
            )}
          </div>

          {isLocal && <LocalImageSettings config={localImgConfig} onChange={setLocalImgConfig} />}

          {!isLocal && (
          <>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {t('int.endpoint')}
            </label>
            <input
              type="text"
              value={localImgConfig.api_url}
              onChange={(e) =>
                setLocalImgConfig({ ...localImgConfig, api_url: e.target.value })
              }
              placeholder="http://127.0.0.1:7860"
              className="w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {t('int.apiKey')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showImgApiKey ? 'text' : 'password'}
                value={localImgConfig.api_key || ''}
                onChange={(e) =>
                  setLocalImgConfig({
                    ...localImgConfig,
                    api_key: e.target.value || undefined,
                  })
                }
                placeholder="sk-..."
                className="flex-1 bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowImgApiKey(!showImgApiKey)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                {showImgApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Steps ({localImgConfig.steps})
              </label>
              <input
                type="range"
                min={10}
                max={60}
                value={localImgConfig.steps}
                onChange={(e) =>
                  setLocalImgConfig({
                    ...localImgConfig,
                    steps: parseInt(e.target.value) || 28,
                  })
                }
                className="w-full accent-accent-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                CFG Scale ({localImgConfig.cfg_scale})
              </label>
              <input
                type="range"
                min={1}
                max={20}
                step={0.5}
                value={localImgConfig.cfg_scale}
                onChange={(e) =>
                  setLocalImgConfig({
                    ...localImgConfig,
                    cfg_scale: parseFloat(e.target.value) || 7.0,
                  })
                }
                className="w-full accent-accent-500"
              />
            </div>
          </div>
          </>
          )}
        </div>

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
                    onClick={() => setLocalImgConfig({ ...localImgConfig, positive_prompt_prefix: localImgConfig.positive_prompt_prefix ? `${localImgConfig.positive_prompt_prefix}, <lora:${lora.name}:1.0>` : `<lora:${lora.name}:1.0>` })}
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
