import { useState } from 'react';
import { Loader2, LogIn, X } from 'lucide-react';
import { api } from '../../services/api';
import { useAppStore } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';
import type { OpenRouterLogin } from '../../types/generated/OpenRouterLogin';

/**
 * "Sign in with OpenRouter": the browser opens, the user signs in there and the app receives a
 * key of their own account – no copying. An account without credit gets a free model. `onDone`
 * lets a form with its own drafts (first-run wizard) take over key and model.
 */
export const OpenRouterLoginButton = ({ onDone }: { onDone?: (login: OpenRouterLogin) => void }) => {
  const { t, currentLanguage } = useTranslation();
  const [waiting, setWaiting] = useState(false);

  const signIn = async () => {
    setWaiting(true);
    try {
      const login = await api.openRouterLogin(currentLanguage);
      const store = useAppStore.getState();
      if (store.cloudProvider !== 'open_router') store.setCloudProvider('open_router');
      store.setCloudApiKey(login.key);
      if (login.model) store.setCloudModel(login.model);
      onDone?.(login);
      toast.success(login.model ? t('openrouter.doneFree', { model: login.model }) : t('openrouter.done'));
    } catch (e) {
      // Closing the wait on purpose is no failure.
      const message = errorMessage(e);
      if (!String(e).includes('backend.openrouter.cancelled')) toast.error(message);
    } finally {
      setWaiting(false);
    }
  };

  if (waiting) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-2 text-xs text-slate-300" data-openrouter-waiting>
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        {t('openrouter.waiting')}
        <button
          type="button"
          onClick={() => void api.openRouterLoginCancel()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
        >
          <X className="h-3 w-3" />
          {t('common.cancel')}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void signIn()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-500"
      data-openrouter-login
    >
      <LogIn className="h-3.5 w-3.5" />
      {t('openrouter.signIn')}
    </button>
  );
};
