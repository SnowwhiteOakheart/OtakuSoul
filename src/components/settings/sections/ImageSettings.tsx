import { useState } from 'react';
import { Eye, EyeOff, Palette, Save } from 'lucide-react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { LocalImageSettings } from '../../integrations/tabs/LocalImageSettings';
import type { ImageGenConfig } from '../../../types';

/** Default endpoint per provider; `local` needs none. */
const PROVIDER_URLS: Record<string, string> = {
  automatic1111: 'http://127.0.0.1:7860',
  comfy_ui: 'http://127.0.0.1:8188',
};

const PROVIDER_OPTIONS = ['local', 'automatic1111', 'comfy_ui', 'dall_e_3', 'novel_ai'];
const normalized = (provider: string) => provider.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The option for a stored provider: older configurations write `Automatic1111` or `ComfyUI`. */
export const providerOption = (provider: string) =>
  PROVIDER_OPTIONS.find((option) => normalized(option) === normalized(provider)) ?? provider;

export const DEFAULT_IMG_CONFIG: ImageGenConfig = {
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

/**
 * Image generation backend: provider, local image models (sd.cpp, VRAM strategy, LoRAs) or a
 * remote endpoint. The studio and gallery stay under Integrations.
 */
export const ImageSettings = () => {
  const { t } = useTranslation();
  const { imageGenConfig, saveImageGenConfig } = useStoreFields('imageGenConfig', 'saveImageGenConfig');
  const [showImgApiKey, setShowImgApiKey] = useState(false);
  // Edits live in a draft; without one the form shows the saved configuration.
  const [draft, setLocalImgConfig] = useState<ImageGenConfig | null>(null);
  const localImgConfig = draft ?? imageGenConfig ?? DEFAULT_IMG_CONFIG;
  const provider = providerOption(localImgConfig.provider);
  const isLocal = provider === 'local';

  const handleSaveImgConfig = async () => {
    try {
      await saveImageGenConfig(localImgConfig);
      setLocalImgConfig(null);
      toast.success(t('int.imageSaved'));
    } catch (e) {
      toast.error(t('int.error', { error: errorMessage(e) }));
    }
  };

  return (
    <div id="setting-image-provider" className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
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
          {t('settings.imagePrefix')}
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
            value={provider}
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
  );
};
