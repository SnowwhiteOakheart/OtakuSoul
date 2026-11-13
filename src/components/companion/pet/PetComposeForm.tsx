import type React from 'react';
import { Send, X } from 'lucide-react';
import type { TranslationKey } from '../../../i18n';

interface PetComposeFormProps {
  characterName: string;
  draft: string;
  thinking: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

export const PetComposeForm: React.FC<PetComposeFormProps> = ({
  characterName,
  draft,
  thinking,
  onDraftChange,
  onSubmit,
  onClose,
  t,
}) => (
  <form
    data-pet-solid
    className="absolute top-2 inset-x-2 flex items-end gap-1.5 rounded-2xl bg-app/95 border border-accent-500/40 p-2 shadow-xl"
    onPointerDown={(e) => e.stopPropagation()}
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit();
    }}
  >
    <textarea
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened on purpose to type right away
      autoFocus
      rows={2}
      value={draft}
      onChange={(e) => onDraftChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onSubmit();
        }
      }}
      placeholder={t('pet.composePlaceholder', { name: characterName })}
      aria-label={t('pet.compose')}
      className="flex-1 resize-none rounded-xl bg-slate-900/90 border border-slate-700 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-hidden focus:border-accent-500"
    />
    <div className="flex flex-col gap-1">
      <button
        type="submit"
        title={t('pet.send')}
        aria-label={t('pet.send')}
        disabled={!draft.trim() || thinking}
        className="p-1.5 rounded-lg bg-accent-600 text-white disabled:opacity-40"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        title={t('common.close')}
        aria-label={t('common.close')}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  </form>
);
