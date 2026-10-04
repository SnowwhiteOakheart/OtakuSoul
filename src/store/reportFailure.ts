import { translate } from '../i18n';
import { toast } from '../components/ui/feedback';
import { errorMessage } from '../utils/errors';

/**
 * An action the user started failed and its button gives no other feedback: log it and say so.
 * Actions whose caller shows its own error (and success) throw instead; background fetches only log.
 */
export const reportFailure = (what: string, error: unknown) => {
  console.error(what, error);
  toast.error(translate('common.actionFailed', { error: errorMessage(error) }));
};
