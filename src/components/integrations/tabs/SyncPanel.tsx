import { useCallback, useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Clock, CloudUpload, FolderOpen, Laptop, Loader2, PlugZap, RefreshCw, Save, Share2, Trash2 } from 'lucide-react';
import { api } from '../../../services/api';
import { translate, useTranslation, type TranslationKey } from '../../../i18n';
import { backendMessage, errorMessage } from '../../../utils/errors';
import { confirmDialog, toast } from '../../ui/feedback';
import { BACKUP_GROUPS } from './backupGroups';
import type { SyncConfig, SyncSnapshot, SyncTargetKind } from '../../../types';

const KINDS: SyncTargetKind[] = ['off', 'folder', 'webdav'];
const INPUT = 'w-full bg-app border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100';
const BUTTON = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50';

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/** The parts of the config that the target and its states depend on. */
const targetOf = (config: SyncConfig) =>
  JSON.stringify([config.kind, config.folder, config.webdav_url, config.webdav_user, config.webdav_password]);

interface SyncPanelProps {
  /** A state was restored (the local backup list changed: safety snapshot). */
  onRestored: () => void | Promise<void>;
}

/**
 * Sync between devices without an own server: states (backups of the chosen groups) go into a
 * shared folder or onto a WebDAV server; other devices list and restore them.
 */
export const SyncPanel = ({ onRestored }: SyncPanelProps) => {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<SyncConfig | null>(null);
  const [draft, setDraft] = useState<SyncConfig | null>(null);
  const [snapshots, setSnapshots] = useState<SyncSnapshot[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'save' | 'test' | 'upload' | 'list' | string>(null);

  const refresh = useCallback(async (config: SyncConfig | null) => {
    if (!config || config.kind === 'off') {
      setSnapshots(null);
      setListError(null);
      return;
    }
    setBusy('list');
    try {
      setSnapshots(await api.listSyncSnapshots());
      setListError(null);
    } catch (error) {
      setSnapshots(null);
      setListError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void api
      .getSyncConfig()
      .then((config) => {
        setSaved(config);
        setDraft(config);
        void refresh(config);
      })
      .catch((error: unknown) => toast.error(errorMessage(error)));
  }, [refresh]);

  if (!draft || !saved) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      </div>
    );
  }

  const update = (patch: Partial<SyncConfig>) => setDraft({ ...draft, ...patch });
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  // Uploading and the list use the saved target.
  const targetReady = saved.kind !== 'off' && targetOf(saved) === targetOf(draft);
  const lastSync = saved.last_sync_at;
  const newest = snapshots?.find((s) => !s.own);
  const newer = newest && (!lastSync || newest.created_at > lastSync) ? newest : null;

  const chooseFolder = async () => {
    const picked = await open({ directory: true, multiple: false, title: t('sync.chooseFolder') });
    if (typeof picked === 'string') update({ folder: picked });
  };

  const save = async () => {
    setBusy('save');
    try {
      const stored = await api.saveSyncConfig(draft);
      setSaved(stored);
      setDraft(stored);
      toast.success(t('sync.saved'));
      setBusy(null);
      await refresh(stored);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const count = await api.testSyncTarget(draft);
      toast.success(t('sync.testOk', { count }));
    } catch (error) {
      toast.error(t('sync.testFailed', { error: errorMessage(error) }));
    } finally {
      setBusy(null);
    }
  };

  const upload = async () => {
    setBusy('upload');
    try {
      const snapshot = await api.uploadSyncSnapshot();
      toast.success(t('sync.uploaded', { date: formatDate(snapshot.created_at) }));
      const config = await api.getSyncConfig();
      setSaved(config);
      setDraft((current) => (current ? { ...current, last_sync_at: config.last_sync_at } : config));
      setBusy(null);
      await refresh(config);
    } catch (error) {
      toast.error(t('sync.uploadFailed', { error: errorMessage(error) }));
      setBusy(null);
    }
  };

  const restore = async (snapshot: SyncSnapshot) => {
    const confirmed = await confirmDialog({
      title: translate('sync.restoreTitle', { device: snapshot.device_name, date: formatDate(snapshot.created_at) }),
      message: translate('sync.restoreText'),
      confirmLabel: translate('confirm.restore'),
    });
    if (!confirmed) return;
    setBusy(snapshot.filename);
    try {
      const message = await api.restoreSyncSnapshot(snapshot.device_id, snapshot.filename);
      toast.success(message ? backendMessage(message) : t('int.restored'));
      const config = await api.getSyncConfig();
      setSaved(config);
      setDraft((current) => (current ? { ...current, last_sync_at: config.last_sync_at } : config));
      await onRestored();
    } catch (error) {
      toast.error(t('int.restoreFailed', { error: errorMessage(error) }));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (snapshot: SyncSnapshot) => {
    const confirmed = await confirmDialog({
      title: translate('sync.deleteTitle', { device: snapshot.device_name, date: formatDate(snapshot.created_at) }),
      message: translate('confirm.cannotUndo'),
      confirmLabel: translate('common.delete'),
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusy(snapshot.filename);
    try {
      await api.deleteSyncSnapshot(snapshot.device_id, snapshot.filename);
      setBusy(null);
      await refresh(saved);
    } catch (error) {
      toast.error(t('int.deleteFailed', { error: errorMessage(error) }));
      setBusy(null);
    }
  };

  return (
    <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5" data-testid="sync-panel">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300">
          <Share2 className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-100">{t('sync.title')}</h2>
          <p className="text-xs text-slate-400">{t('sync.intro')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div role="radiogroup" aria-label={t('sync.target')} className="flex flex-wrap gap-2">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={draft.kind === kind}
                onClick={() => update({ kind })}
                className={`px-3 py-1.5 rounded-lg text-xs border ${
                  draft.kind === kind ? 'border-sky-400 bg-sky-500/15 text-sky-100' : 'border-slate-700 text-slate-400 hover:border-slate-500'
                }`}
              >
                {t(`sync.kind.${kind}` as TranslationKey)}
              </button>
            ))}
          </div>

          {draft.kind === 'folder' && (
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-300">{t('sync.folder')}</span>
              <div className="flex gap-2">
                <input
                  value={draft.folder}
                  onChange={(e) => update({ folder: e.target.value })}
                  aria-label={t('sync.folder')}
                  placeholder={t('sync.folderPlaceholder')}
                  className={INPUT}
                />
                <button type="button" onClick={() => void chooseFolder()} className={`${BUTTON} border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700`}>
                  <FolderOpen className="w-3.5 h-3.5" />
                  {t('sync.chooseFolder')}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">{t('sync.folderHint')}</p>
            </div>
          )}

          {draft.kind === 'webdav' && (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="block text-xs font-semibold text-slate-300">{t('sync.webdavUrl')}</span>
                <input
                  value={draft.webdav_url}
                  onChange={(e) => update({ webdav_url: e.target.value })}
                  placeholder="https://cloud.example.org/remote.php/dav/files/name/"
                  className={INPUT}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-300">{t('sync.webdavUser')}</span>
                  <input value={draft.webdav_user} onChange={(e) => update({ webdav_user: e.target.value })} autoComplete="username" className={INPUT} />
                </label>
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-300">{t('sync.webdavPassword')}</span>
                  <input
                    type="password"
                    value={draft.webdav_password}
                    onChange={(e) => update({ webdav_password: e.target.value })}
                    autoComplete="current-password"
                    className={INPUT}
                  />
                </label>
              </div>
              <p className="text-[11px] text-slate-500">{t('sync.webdavHint')}</p>
            </div>
          )}

          {draft.kind !== 'off' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-300">{t('sync.deviceName')}</span>
                  <input value={draft.device_name} onChange={(e) => update({ device_name: e.target.value })} className={INPUT} />
                </label>
                <label className="block space-y-1.5">
                  <span className="block text-xs font-semibold text-slate-300">{t('sync.keep')}</span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={draft.keep}
                    onChange={(e) => update({ keep: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
                    className={INPUT}
                  />
                </label>
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-xs font-semibold text-slate-300 mb-1.5">{t('sync.groups')}</legend>
                <div className="grid grid-cols-2 gap-1.5">
                  {BACKUP_GROUPS.map((item) => (
                    <label key={item.key} className="flex items-center gap-2 text-xs text-slate-300 select-none">
                      <input
                        type="checkbox"
                        checked={draft.groups[item.key]}
                        onChange={(e) => update({ groups: { ...draft.groups, [item.key]: e.target.checked } })}
                        className="rounded bg-app border-slate-700"
                      />
                      <item.icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      {t(item.label)}
                    </label>
                  ))}
                </div>
                {draft.groups.settings && <p className="text-[11px] text-amber-300/90">{t('sync.settingsWarning')}</p>}
              </fieldset>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!dirty || busy !== null}
              onClick={() => void save()}
              className={`${BUTTON} border-sky-500/50 bg-sky-600 text-white hover:bg-sky-500`}
            >
              {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t('sync.save')}
            </button>
            {draft.kind !== 'off' && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void test()}
                className={`${BUTTON} border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700`}
              >
                {busy === 'test' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
                {t('sync.test')}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {saved.kind === 'off' ? (
            <p className="py-8 text-center text-xs text-slate-400">{t('sync.offHint')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  {lastSync ? t('sync.lastSync', { date: formatDate(lastSync) }) : t('sync.neverSynced')}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!targetReady || busy !== null}
                    onClick={() => void upload()}
                    className={`${BUTTON} border-emerald-500/50 bg-emerald-600 text-white hover:bg-emerald-500`}
                  >
                    {busy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                    {busy === 'upload' ? t('sync.uploading') : t('sync.upload')}
                  </button>
                  <button
                    type="button"
                    disabled={!targetReady || busy !== null}
                    onClick={() => void refresh(saved)}
                    aria-label={t('int.refreshList')}
                    className={`${BUTTON} border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700`}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${busy === 'list' ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>
              {!targetReady && <p className="text-[11px] text-amber-300/90">{t('sync.saveFirst')}</p>}

              {newer && (
                <div role="status" data-testid="sync-newer" className="rounded-xl border border-sky-500/40 bg-sky-950/30 p-3 text-xs text-sky-100">
                  {t('sync.newer', { device: newer.device_name, date: formatDate(newer.created_at) })}
                </div>
              )}
              {listError && <p role="alert" className="text-xs text-rose-300">{listError}</p>}

              {snapshots && snapshots.length === 0 && <p className="py-6 text-center text-xs text-slate-400">{t('sync.empty')}</p>}
              <ul className="space-y-2">
                {snapshots?.map((snapshot) => (
                  <li
                    key={`${snapshot.device_id}/${snapshot.filename}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-slate-800 bg-app p-3"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <Laptop className="w-3.5 h-3.5 text-slate-400" />
                        <span className="truncate">{snapshot.device_name}</span>
                        {snapshot.own && (
                          <span className="rounded-full border border-slate-600 px-1.5 text-[10px] font-normal text-slate-400">{t('sync.thisDevice')}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatDate(snapshot.created_at)} · {(snapshot.size_bytes / 1024 ** 2).toFixed(1)} MB
                        {snapshot.app_version && ` · ${t('sync.version', { version: snapshot.app_version })}`}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {BACKUP_GROUPS.filter((g) => snapshot.groups[g.key]).map((g) => t(g.label)).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void restore(snapshot)}
                        className={`${BUTTON} border-emerald-500/40 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30`}
                      >
                        {busy === snapshot.filename ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {t('int.restore')}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void remove(snapshot)}
                        aria-label={t('sync.delete')}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-slate-700 transition disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
};
