import { useState } from 'react';
import { useStoreFields } from '../../store/useAppStore';
import type { UserPersona } from '../../types';
import { X, UserPlus, Check, Trash2, User, Pencil, ImagePlus } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { translate, useTranslation } from '../../i18n';
import { errorMessage } from '../../utils/errors';
import { pickImageAsDataUrl } from '../../utils/imageFiles';
import { confirmDialog } from '../ui/feedback';
import { PersonaAvatar } from './PersonaAvatar';

/** Persona pictures are stored inline in personas.json, so keep them small. */
const PERSONA_AVATAR_SIZE = 256;

interface PersonaDraft {
  /** null while creating a new persona. */
  id: string | null;
  name: string;
  description: string;
  avatar: string | null;
}

const draftFrom = (persona: UserPersona): PersonaDraft => ({
  id: persona.id,
  name: persona.name,
  description: persona.description,
  avatar: persona.avatar_data_url ?? null,
});

/** Create, edit, activate and delete the user's roleplay identities (the {{user}} macro). */
export const PersonaManagerModal = ({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation();
  const { personas, activePersona, selectPersona, savePersona, deletePersona } = useStoreFields(
    'personas', 'activePersona', 'selectPersona', 'savePersona', 'deletePersona',
  );

  const [draft, setDraft] = useState<PersonaDraft | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const startCreate = () => {
    setErrorMsg(null);
    setDraft({ id: null, name: '', description: '', avatar: null });
  };

  const startEdit = (persona: UserPersona) => {
    setErrorMsg(null);
    setDraft(draftFrom(persona));
  };

  const handlePickAvatar = async () => {
    try {
      const image = await pickImageAsDataUrl({ maxSize: PERSONA_AVATAR_SIZE });
      if (image) setDraft((current) => (current ? { ...current, avatar: image } : current));
    } catch (e) {
      setErrorMsg(translate('persona.avatarFailed', { error: errorMessage(e) }));
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setErrorMsg(t('persona.nameRequired'));
      return;
    }
    const persona: UserPersona = {
      id: draft.id ?? `persona_${Date.now()}`,
      name: draft.name.trim(),
      description: draft.description.trim() || t('persona.defaultDesc'),
      avatar_data_url: draft.avatar,
    };
    setIsSaving(true);
    try {
      await savePersona(persona);
      if (!draft.id) selectPersona(persona);
      setDraft(null);
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg(translate('persona.saveFailed', { error: errorMessage(e) }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-manager-title"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-app/60">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h2 id="persona-manager-title" className="text-sm font-bold text-slate-100">{t('persona.title')}</h2>
              <p className="text-xs text-slate-400">{t('persona.intro', { macro: '{{user}}' })}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {errorMsg && (
            <div role="alert" className="p-2.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300">
              {errorMsg}
            </div>
          )}

          <div className="space-y-2">
            <div className="font-semibold text-slate-300 mb-1">{t('persona.available', { count: personas.length })}</div>
            {personas.map((persona) => {
              const isActive = activePersona.id === persona.id;
              return (
                <div
                  key={persona.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                    isActive
                      ? 'bg-accent-900/20 border-accent-500/50 shadow-sm'
                      : 'bg-app/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PersonaAvatar persona={persona} className="w-10 h-10 text-sm" />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-100 flex items-center gap-2">
                        <span className="truncate">{persona.name}</span>
                        {isActive && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-accent-500/30 text-accent-300 border border-accent-500/40">
                            {t('persona.active')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 line-clamp-1">{persona.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => selectPersona(persona)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      >
                        {t('persona.activate')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(persona)}
                      aria-label={t('persona.edit', { name: persona.name })}
                      title={t('persona.edit', { name: persona.name })}
                      className="p-1 rounded text-slate-500 hover:text-accent-300 hover:bg-slate-800 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {personas.length > 1 && (
                      <button
                        type="button"
                        onClick={async () => {
                          const confirmed = await confirmDialog({
                            title: translate('confirm.deletePersonaTitle', { name: persona.name }),
                            confirmLabel: translate('common.delete'),
                            tone: 'danger',
                          });
                          if (confirmed) {
                            if (draft?.id === persona.id) setDraft(null);
                            void deletePersona(persona.id);
                          }
                        }}
                        aria-label={t('persona.delete')}
                        title={t('persona.delete')}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!draft ? (
            <button
              type="button"
              onClick={startCreate}
              className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-accent-500 text-slate-400 hover:text-accent-300 flex items-center justify-center gap-2 transition-colors font-medium"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t('persona.create')}</span>
            </button>
          ) : (
            <div className="p-4 bg-app border border-slate-800 rounded-xl space-y-3">
              <div className="font-semibold text-slate-200">
                {draft.id ? t('persona.editTitle') : t('persona.createTitle')}
              </div>
              <div className="flex items-center gap-3">
                <PersonaAvatar
                  persona={{ id: draft.id ?? 'draft', name: draft.name, description: '', avatar_data_url: draft.avatar }}
                  className="w-16 h-16 text-xl"
                />
                <div className="flex flex-col items-start gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handlePickAvatar()}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 border border-slate-700"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>{draft.avatar ? t('persona.changeAvatar') : t('persona.chooseAvatar')}</span>
                  </button>
                  {draft.avatar && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, avatar: null })}
                      className="text-xs text-rose-400 hover:underline"
                    >
                      {t('persona.removeAvatar')}
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label htmlFor="persona-name" className="block text-xs text-slate-400 mb-1">{t('persona.name')}</label>
                <input
                  id="persona-name"
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder={t('persona.namePlaceholder')}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500"
                />
              </div>
              <div>
                <label htmlFor="persona-description" className="block text-xs text-slate-400 mb-1">{t('persona.description')}</label>
                <textarea
                  id="persona-description"
                  rows={3}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder={t('persona.descPlaceholder')}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-accent-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="px-3 py-1 text-slate-400 hover:text-slate-200 rounded"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="px-3.5 py-1 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white rounded-lg font-medium flex items-center gap-1.5 shadow-sm"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{draft.id ? t('common.save') : t('persona.createButton')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-800 bg-app/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            {t('persona.done')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
