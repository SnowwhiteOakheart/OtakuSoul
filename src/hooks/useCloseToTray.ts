import { useEffect } from 'react';
import { api } from '../services/api';
import { translate } from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { choiceDialog, toast } from '../components/ui/feedback';
import { errorMessage } from '../utils/errors';

/**
 * Closing the window while "keep running in the tray" is on and no choice is remembered: the
 * backend asks the interface first. The dialog explains the tray and offers to quit instead;
 * "remember" stores the choice so later closes act directly.
 */
export function useCloseToTray(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    let isSubscribed = true;
    let unlisten: (() => void) | undefined;
    const onHint = async () => {
      const { choice, checked } = await choiceDialog({
        title: translate('tray.hintTitle'),
        message: translate('tray.hintText'),
        confirmLabel: translate('tray.hintConfirm'),
        cancelLabel: translate('tray.hintQuit'),
        checkboxLabel: translate('tray.hintRemember'),
      });
      if (choice === 'dismiss') return;
      const toTray = choice === 'confirm';
      try {
        // Saved before hiding or quitting: the next close reads the choice from settings.json.
        if (checked) await useAppStore.getState().rememberCloseChoice(toTray);
        if (toTray) await api.hideMainWindow();
        else await api.quitApp();
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
