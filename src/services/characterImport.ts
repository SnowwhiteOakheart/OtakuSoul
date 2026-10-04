import { translate } from '../i18n';
import { errorCode } from '../utils/errors';
import { confirmDialog } from '../components/ui/feedback';

/**
 * Runs a character import. When a character of that name exists, the backend refuses with
 * `backend.characters.exists`; then the user decides whether it gets replaced.
 * Returns `null` when the user keeps the existing character.
 */
export async function importWithOverwrite<T>(run: (overwrite: boolean) => Promise<T>): Promise<T | null> {
  try {
    return await run(false);
  } catch (e) {
    const coded = errorCode(e);
    if (coded?.code !== 'backend.characters.exists') throw e;
    const confirmed = await confirmDialog({
      title: translate('library.overwriteTitle', { name: coded.params?.name ?? '' }),
      message: translate('library.overwriteText'),
      confirmLabel: translate('library.overwriteConfirm'),
      tone: 'danger',
    });
    return confirmed ? await run(true) : null;
  }
}
