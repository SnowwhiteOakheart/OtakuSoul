import { translate, type TranslationKey } from '../i18n';
import type { ToastAction } from '../components/ui/feedback';
import type { SettingsSection } from '../store/helpers';
import { errorCode } from './errors';

/** The part of the app store a fix needs (passed in, so this file does not import the store). */
export interface FixContext {
  selectedBackend: 'local' | 'cloud';
  serverConfig: { model_path: string };
  openSettingsSection: (section: SettingsSection) => void;
  startServer: () => Promise<void>;
  reopenOnboarding: () => void;
}

export interface ErrorFix {
  label: TranslationKey;
  run: () => void;
}

/** HTTP status at the start of `backend.llm.server`'s status parameter ("401 Unauthorized"). */
const statusOf = (params?: Record<string, string>) => Number.parseInt(params?.status ?? '', 10);

/**
 * What the user can do about a common failure, as one button: check the key, pick a smaller
 * model, start the local AI … `null` when there is no single sensible step.
 */
export function errorFix(error: unknown, app: FixContext): ErrorFix | null {
  const coded = errorCode(error);
  const local = app.selectedBackend === 'local';
  const settings = (section: SettingsSection) => () => app.openSettingsSection(section);
  if (!coded) return null;
  // An AI error without a chosen local model: the setup is the fix, whatever the details.
  const aiError = coded.code.startsWith('backend.llm.') || coded.code.startsWith('backend.server.');
  if (aiError && local && !app.serverConfig.model_path) return { label: 'errorFix.setUpAi', run: app.reopenOnboarding };
  switch (coded.code) {
    case 'backend.llm.server': {
      const status = statusOf(coded.params);
      if (status === 401 || status === 403) return { label: 'errorFix.checkKey', run: settings('providers') };
      if (status === 404) return { label: 'errorFix.checkModel', run: settings(local ? 'server' : 'providers') };
      return null;
    }
    case 'backend.llm.connect':
    case 'backend.llm.timeout':
      return local
        ? { label: 'errorFix.startAi', run: () => void app.startServer() }
        : { label: 'errorFix.checkConnection', run: settings('providers') };
    case 'backend.server.notEnoughVram':
    case 'backend.server.vramCrash':
      return { label: 'errorFix.smallerModel', run: settings('server') };
    case 'backend.server.binaryMissing':
    case 'backend.server.prismRequired':
      return { label: 'errorFix.installRuntime', run: settings('server') };
    default:
      return null;
  }
}

/** The fix as a toast button, if there is one. */
export const errorFixAction = (error: unknown, app: FixContext): ToastAction | undefined => {
  const fix = errorFix(error, app);
  return fix ? { label: translate(fix.label), onClick: fix.run } : undefined;
};
