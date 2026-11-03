import React, { useEffect, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { AlertTriangle, CircleAlert, CircleCheck, Share2 } from 'lucide-react';
import { api } from '../../services/api';
import { useStoreFields } from '../../store/useAppStore';
import { translate, useTranslation, type TranslationKey } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { Button, Select } from '../ui';
import { ModalOverlay } from '../ui/ModalOverlay';
import { toast } from '../ui/feedback';
import type { CharacterProfile } from '../../types';
import type { Finding } from '../../types/generated/Finding';

/** What is contributed: a character card or a story (scene) of the Stage. */
export type ContributionTarget =
  | { kind: 'character'; profile: CharacterProfile }
  | { kind: 'story'; sceneId: string; title: string };

const LICENSES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-SA-4.0'] as const;

const targetTitle = (target: ContributionTarget) => (target.kind === 'character' ? target.profile.card.data.name : target.title);

const targetIsAdult = (target: ContributionTarget) =>
  target.kind === 'character' && (target.profile.card.data.extensions as Record<string, unknown> | null)?.otakusoul_nsfw === true;

/**
 * Contributing to the hub: checks what the hub needs, then writes a ZIP package in the data
 * repository's layout and opens a prefilled issue there, where the user attaches the ZIP.
 */
export const ContributeDialog: React.FC<{ target: ContributionTarget; onClose: () => void }> = ({ target, onClose }) => {
  const { t } = useTranslation();
  const { activePersona } = useStoreFields('activePersona');
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [author, setAuthor] = useState(activePersona?.name ?? '');
  const [license, setLicense] = useState<(typeof LICENSES)[number]>('CC0-1.0');
  const [adult, setAdult] = useState(targetIsAdult(target));
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const check =
      target.kind === 'character' ? api.checkCharacterContribution(target.profile) : api.checkStoryContribution(target.sceneId);
    check
      .then((result) => alive && setFindings(result))
      .catch((e: unknown) => {
        if (!alive) return;
        toast.error(translate('contribute.failed', { error: errorMessage(e) }));
        onClose();
      });
    return () => {
      alive = false;
    };
  }, [target, onClose]);

  const errors = (findings ?? []).filter((f) => f.error);
  const warnings = (findings ?? []).filter((f) => !f.error);
  const ready = findings !== null && errors.length === 0 && rights && author.trim().length > 0 && !busy;

  const submit = async (openIssue: boolean) => {
    const title = targetTitle(target);
    const slug = title.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_') || 'beitrag';
    const targetPath = await save({
      defaultPath: `${slug}_beitrag.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (!targetPath) return;
    setBusy(true);
    try {
      const info = { license, author: author.trim(), adult };
      const result =
        target.kind === 'character'
          ? await api.exportCharacterContribution(target.profile, info, targetPath)
          : await api.exportStoryContribution(target.sceneId, info, targetPath);
      if (openIssue) {
        await openUrl(result.issue_url);
        toast.success(t('contribute.done'));
      } else {
        toast.success(t('contribute.doneSaved', { path: targetPath }));
      }
      onClose();
    } catch (e) {
      toast.error(t('contribute.failed', { error: errorMessage(e) }));
    } finally {
      setBusy(false);
    }
  };

  const finding = (f: Finding) => (
    <li key={`${f.code}-${f.detail}`} className={`flex items-start gap-2 text-xs ${f.error ? 'text-rose-300' : 'text-amber-200'}`}>
      {f.error ? <CircleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
      <span>{t(`contribute.check.${f.code}` as TranslationKey, { detail: f.detail })}</span>
    </li>
  );

  return (
    <ModalOverlay onClose={onClose} aria-label={t('contribute.title')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-accent-400" />
          <h2 className="text-base font-bold text-slate-100">{t('contribute.title')}</h2>
        </div>
        <p className="text-xs text-slate-400">{t('contribute.intro', { title: targetTitle(target) })}</p>

        <section aria-label={t('contribute.checks')} className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('contribute.checks')}</h3>
          {findings === null ? (
            <p className="text-xs text-slate-500">{t('contribute.checking')}</p>
          ) : findings.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-emerald-300">
              <CircleCheck className="w-3.5 h-3.5" />
              {t('contribute.checksOk')}
            </p>
          ) : (
            <ul className="space-y-1">
              {errors.map(finding)}
              {warnings.map(finding)}
            </ul>
          )}
          {errors.length > 0 && <p className="text-xs text-rose-300">{t('contribute.errorsBlock')}</p>}
        </section>

        <div className="space-y-3">
          <label className="block space-y-1.5 text-sm text-slate-300">
            <span className="font-medium">{t('contribute.author')}</span>
            <input
              value={author}
              maxLength={80}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-app px-3 py-2 text-sm text-slate-100"
            />
          </label>
          <Select
            label={t('contribute.license')}
            value={license}
            onChange={(e) => setLicense(e.target.value as (typeof LICENSES)[number])}
            options={[
              { value: 'CC0-1.0', label: t('contribute.licenseCc0') },
              { value: 'CC-BY-4.0', label: t('contribute.licenseBy') },
              { value: 'CC-BY-SA-4.0', label: t('contribute.licenseBySa') },
            ]}
          />
          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5" />
            <span>{t('contribute.adult')}</span>
          </label>
          <label className="flex items-start gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" />
            <span>{t('contribute.rights')}</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" disabled={!ready} onClick={() => void submit(false)}>
            {t('contribute.saveOnly')}
          </Button>
          <Button disabled={!ready} loading={busy} onClick={() => void submit(true)}>
            {t('contribute.save')}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  );
};
