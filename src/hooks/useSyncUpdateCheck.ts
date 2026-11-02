import { useEffect } from 'react';
import { api } from '../services/api';
import { translate } from '../i18n';
import { toast } from '../components/ui/feedback';
import { useAppStore } from '../store/useAppStore';

/** Time after the start before the check, so it doesn't compete with loading the app. */
export const SYNC_CHECK_DELAY_MS = 8000;

/**
 * Once after the start: tells the user when another device uploaded a newer state (sync between
 * devices), with a way to the backup tab. Silent while sync is off or the target is unreachable.
 */
export function useSyncUpdateCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      api
        .checkSyncUpdates()
        .then((newer) => {
          if (!newer) return;
          toast.info(
            translate('sync.newerToast', { device: newer.device_name, date: new Date(newer.created_at).toLocaleString() }),
            {
              label: translate('sync.openBackup'),
              onClick: () => {
                const { setIntegrationsTab, setActiveTab } = useAppStore.getState();
                setIntegrationsTab('backup');
                setActiveTab('integrations');
              },
            },
          );
        })
        .catch((error: unknown) => console.warn('Sync check failed:', error));
    }, SYNC_CHECK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled]);
}
