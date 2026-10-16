import { translate } from '../i18n';
import { toast } from '../components/ui/feedback';
import { errorMessage } from '../utils/errors';
import { errorFixAction } from '../utils/errorFixes';
import { useAppStore } from './useAppStore';

/**
 * An action the user started failed and its button gives no other feedback: log it and say so.
 * Actions whose caller shows its own error (and success) throw instead; background fetches only log.
 */
export const reportFailure = (what: string, error: unknown) => {
  console.error(what, error);
  // A known cause gets a button that leads to the fix (settings, setup, starting the AI).
  const message = translate('common.actionFailed', { error: errorMessage(error) });
  const fix = errorFixAction(error, useAppStore.getState());
  if (fix) toast.error(message, fix);
  else toast.error(message);
};
