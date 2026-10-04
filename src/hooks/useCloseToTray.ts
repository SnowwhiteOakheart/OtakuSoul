import { useEffect } from 'react';
import { api } from '../services/api';
import { translate } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { confirmDialog, toast } from '../components/ui/feedback';
import { errorMessage } from '../utils/errors';

/**
 * The first time the window is closed while "keep running in the tray" is on, the backend asks
 * the interface to explain that first; the window hides only after the user confirms.
 */
export function useCloseToTray(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let isSubscribed = true;
    let unlisten: (() => void) | undefined;
    const onHint = async () => {
      const confirmed = await confirmDialog({
        title: translate('tray.hintTitle'),
        message: translate('tray.hintText'),
        confirmLabel: translate('tray.hintConfirm'),
      });
      if (!confirmed) return;
      try {
        await useAppStore.getState().confirmTrayHint();
        await api.hideMainWindow();
      } catch (e) {
        toast.error(errorMessage(e));
      }
    };
    api
      .onCloseToTrayHint(() => void onHint())
      .then((fn) => {
        if (isSubscribed) unlisten = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      isSubscribed = false;
      unlisten?.();
    };
  }, [enabled]);
}
