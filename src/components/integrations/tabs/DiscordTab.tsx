import type React from 'react';
import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import {
  Play,
  Square,
  Save,
  Gamepad2,
  Bot,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { DiscordBotConfig } from '../../../types';

const DEFAULT_BOT_CONFIG: DiscordBotConfig = {
  enabled: false,
  bot_token: '',
  command_prefix: '!',
  allowed_channels: [],
  cooldown_secs: 2,
};

export const DiscordTab: React.FC = () => {
  const { t, tEmotion } = useTranslation();
  const {
    discordRpcEnabled, setDiscordRpcEnabled, discordBotConfig, discordBotStatus,
    saveDiscordBotConfig, startDiscordBot, stopDiscordBot, activeCharacter, currentEmotion,
  } = useStoreFields(
    'discordRpcEnabled', 'setDiscordRpcEnabled', 'discordBotConfig', 'discordBotStatus',
    'saveDiscordBotConfig', 'startDiscordBot', 'stopDiscordBot', 'activeCharacter',
    'currentEmotion',
  );

  const [showBotToken, setShowBotToken] = useState(false);
  // Edits live in a draft; without one the form shows the saved configuration.
  const [draft, setLocalBotConfig] = useState<DiscordBotConfig | null>(null);
  const localBotConfig = draft ?? discordBotConfig ?? DEFAULT_BOT_CONFIG;

  const handleSaveBotConfig = async () => {
    try {
      await saveDiscordBotConfig(localBotConfig);
      setLocalBotConfig(null);
      toast.success(t('int.botSaved'));
    } catch (e) {
      toast.error(t('int.error', { error: errorMessage(e) }));
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Col: Rich Presence (RPC) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">{t('int.rpcTitle')}</h2>
              <p className="text-xs text-slate-400">
                {t('int.rpcIntro')}
              </p>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={discordRpcEnabled}
              onChange={(e) => setDiscordRpcEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        {/* Status Preview Card */}
        <div className="bg-app border border-indigo-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 font-bold text-lg">
              {activeCharacter?.card.data.name?.charAt(0) || 'O'}
            </div>
            <div className="text-xs">
              <div className="font-bold text-slate-200">OtakuSoul</div>
              <div className="text-indigo-300">
                {t('int.discordPlaying', { name: activeCharacter?.card.data.name || t('int.discordSomeone') })}
              </div>
              <div className="text-slate-400 text-xs">
                {t('int.discordEmotion', { emotion: tEmotion(currentEmotion?.emotion || 'neutral') })}
              </div>
            </div>
          </div>
        </div>

        <div className="text-xs text-slate-400 space-y-2">
          <p className="leading-relaxed">
            {t('int.rpcText1')}<code className="font-mono text-xs text-slate-300">/run/user/$UID/discord-ipc-0</code> {t('int.rpcText2')}
          </p>
        </div>
      </div>

      {/* Right Col: Discord Gateway Bot */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-500/20 border border-accent-500/40 flex items-center justify-center text-accent-400">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">{t('int.botTitle')}</h2>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                    discordBotStatus?.is_running
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {discordBotStatus?.is_running ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {t('int.botIntro')}
              </p>
            </div>
          </div>

          <div>
            {discordBotStatus?.is_running ? (
              <button
                onClick={stopDiscordBot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow transition"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>{t('int.stop')}</span>
              </button>
            ) : (
              <button
                onClick={startDiscordBot}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-xs font-medium shadow transition"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{t('int.startBot')}</span>
              </button>
            )}
          </div>
        </div>

        {/* Bot Config */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {t('int.botToken')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type={showBotToken ? 'text' : 'password'}
                value={localBotConfig.bot_token}
                onChange={(e) =>
                  setLocalBotConfig({ ...localBotConfig, bot_token: e.target.value })
                }
                placeholder="MTAx..."
                className="flex-1 bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowBotToken(!showBotToken)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('int.prefix')}
              </label>
              <input
                type="text"
                value={localBotConfig.command_prefix}
                onChange={(e) =>
                  setLocalBotConfig({ ...localBotConfig, command_prefix: e.target.value })
                }
                className="w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t('int.cooldown')}
              </label>
              <input
                type="number"
                value={localBotConfig.cooldown_secs}
                onChange={(e) =>
                  setLocalBotConfig({ ...localBotConfig, cooldown_secs: parseInt(e.target.value) || 2 })
                }
                className="w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveBotConfig}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('int.saveBot')}</span>
            </button>
          </div>
        </div>

        {/* Bot Command Cheatsheet */}
        <div className="bg-app/60 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5">
          <span className="font-bold text-slate-300 block mb-1">{t('int.commands')}</span>
          <div className="font-mono text-xs text-accent-300 space-y-1">
            <div><span className="text-slate-200">!ask &lt;Text&gt;</span> {t('int.cmdAsk')}</div>
            <div><span className="text-slate-200">!character &lt;Name&gt;</span> {t('int.cmdCharacter')}</div>
            <div><span className="text-slate-200">!status</span> {t('int.cmdStatus')}</div>
            <div><span className="text-slate-200">!reset</span> {t('int.cmdReset')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
