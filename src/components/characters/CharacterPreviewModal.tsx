import React from 'react';
import { Edit, MessageSquare, Sparkles, X } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { CharacterProfile } from '../../types';
import { ModalOverlay } from '../ui/ModalOverlay';
import { fillCardMacros, localizeCard } from '../../utils/cardI18n';
import { useAppStore } from '../../store/useAppStore';

/** Characters shipped with the app (`presets/characters`), recommended for a first chat. */
export const isStarterCharacter = (character: CharacterProfile) =>
  /[\\/]presets[\\/]characters[\\/]/.test(character.source_path ?? '');

interface CharacterPreviewModalProps {
  character: CharacterProfile;
  onClose: () => void;
  onChat: () => void;
  onEdit: () => void;
}

/** What a character is like before chatting: picture, description, personality, setting and greeting. */
export const CharacterPreviewModal: React.FC<CharacterPreviewModalProps> = ({ character, onClose, onChat, onEdit }) => {
  const { t } = useTranslation();
  const language = useAppStore((s) => s.appLanguage);
  const persona = useAppStore((s) => s.activePersona.name);
  const data = localizeCard(character.card.data, language);
  const fill = (text: string) => fillCardMacros(text, data.name, persona);
  const sections: { key: string; label: string; text: string }[] = [
    { key: 'description', label: t('characterPreview.description'), text: fill(data.description) },
    { key: 'personality', label: t('characterPreview.personality'), text: fill(data.personality) },
    { key: 'scenario', label: t('characterPreview.scenario'), text: fill(data.scenario) },
    { key: 'greeting', label: t('characterPreview.greeting'), text: fill(data.first_mes) },
  ].filter((section) => section.text.trim());

  return (
    <ModalOverlay
      onClose={onClose}
      closeOnBackdrop
      aria-labelledby="character-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col sm:flex-row overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" data-character-preview={character.id}>
        <div className="sm:w-64 shrink-0 bg-app">
          {character.avatar_data_url ? (
            <img src={character.avatar_data_url} alt={data.name} className="h-48 w-full object-cover sm:h-full" />
          ) : (
            <div className="flex h-48 items-center justify-center text-5xl font-bold text-slate-500 sm:h-full">{data.name.charAt(0)}</div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
            <div className="min-w-0">
              <h2 id="character-preview-title" className="text-lg font-bold text-slate-100">{data.name}</h2>
              <div className="mt-1 flex flex-wrap gap-1">
                {isStarterCharacter(character) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                    <Sparkles className="h-3 w-3" />
                    {t('characterPreview.starter')}
                  </span>
                )}
                {(data.tags ?? []).slice(0, 6).map((tag) => (
                  <span key={tag} className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-400">{tag}</span>
                ))}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
              <X className="h-4 w-4" />
            </button>
          </header>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
            {sections.length === 0 && <p className="text-slate-400">{t('library.noDescription')}</p>}
            {sections.map((section) => (
              <section key={section.key} className="space-y-1">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.label}</h3>
                <p className={`whitespace-pre-line text-slate-300 ${section.key === 'greeting' ? 'italic line-clamp-6' : 'line-clamp-[12]'}`}>{section.text}</p>
              </section>
            ))}
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-800 px-5 py-3">
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800">
              <Edit className="h-4 w-4" />
              {t('characterPreview.edit')}
            </button>
            <button type="button" onClick={onChat} className="inline-flex items-center gap-1.5 rounded-xl bg-accent-600 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-500">
              <MessageSquare className="h-4 w-4" />
              {t('characterPreview.chat')}
            </button>
          </footer>
        </div>
      </div>
    </ModalOverlay>
  );
};
