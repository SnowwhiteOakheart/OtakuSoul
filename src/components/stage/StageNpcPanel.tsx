import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Users, UserPlus, X, Sparkles } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation, type TranslationKey } from '../../i18n';
import { Button } from '../ui/Button';
import { ModalOverlay } from '../ui/ModalOverlay';
import { toast } from '../ui/feedback';
import { errorMessage } from '../../utils/errors';

export const NPC_ARCHETYPES = ['citizen', 'innkeeper', 'guard', 'merchant', 'villain', 'creature', 'sage', 'noble'] as const;
export const npcAvatarUrl = (archetype: string) => `/npc/${NPC_ARCHETYPES.find((key) => key === archetype) ?? 'citizen'}.png`;
const archetypeLabel = (archetype: string): TranslationKey => `stage.npcArchetype.${NPC_ARCHETYPES.find((key) => key === archetype) ?? 'citizen'}`;

export function StageNpcPanel() {
  const { t } = useTranslation();
  const { stageState, isProcessingStageTurn, upsertStageNpc, setStageNpcActive, promoteStageNpc } = useStoreFields(
    'stageState', 'isProcessingStageTurn', 'upsertStageNpc', 'setStageNpcActive', 'promoteStageNpc',
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [archetype, setArchetype] = useState<string>('citizen');
  const [personality, setPersonality] = useState('');
  const npcs = stageState?.npcs ?? [];

  const act = async (operation: () => Promise<void>, success?: TranslationKey) => {
    setBusy(true);
    try {
      await operation();
      if (success) toast.success(t(success));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Button variant="secondary" size="sm" disabled={isProcessingStageTurn} onClick={() => setOpen(true)}>
      <Users className="w-3.5 h-3.5" />{t('stage.npcs')} ({npcs.filter((npc) => npc.active).length})
    </Button>
    {open && createPortal(<ModalOverlay onClose={busy ? undefined : () => setOpen(false)} aria-labelledby="stage-npc-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id="stage-npc-title" className="text-lg font-bold text-slate-100">{t('stage.npcs')}</h2>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)} aria-label={t('common.close')}><X className="w-4 h-4" /></Button>
        </div>
        <p className="text-sm text-slate-400">{t('stage.npcIntro')}</p>
        <div className="space-y-3">
          {npcs.length === 0 && <p className="text-sm text-slate-400">{t('stage.npcEmpty')}</p>}
          {npcs.map((npc) => <section key={npc.id} className="rounded-xl border border-slate-700 bg-app/50 p-3 space-y-2">
            <div className="flex gap-3 items-center">
              <img src={npcAvatarUrl(npc.archetype)} alt="" className="w-12 h-12 rounded-xl" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-100 break-words">{npc.name}</h3>
                <p className="text-xs text-slate-400">{t(archetypeLabel(npc.archetype))} · {t(npc.promoted_character_id ? 'stage.npcPromoted' : npc.active ? 'stage.npcPresent' : 'stage.npcAbsent')}</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{npc.personality}</p>
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer focus-visible:ring-2 focus-visible:ring-accent-400">{t('stage.npcMemories', { count: npc.memories.length })}</summary>
              <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto list-disc pl-5">
                {[...npc.memories].reverse().map((memory) => <li key={memory.message_id} className="whitespace-pre-wrap">{memory.text}</li>)}
              </ul>
            </details>
            {!npc.promoted_character_id && <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={busy || isProcessingStageTurn} onClick={() => void act(() => setStageNpcActive(npc.id, !npc.active))}>{t(npc.active ? 'stage.npcDismiss' : 'stage.npcReturn')}</Button>
              <Button variant="ghost" size="sm" disabled={busy || isProcessingStageTurn} onClick={() => { setName(npc.name); setArchetype(npc.archetype); setPersonality(npc.personality); }}>{t('common.edit')}</Button>
              <Button size="sm" disabled={busy || isProcessingStageTurn} onClick={() => void act(() => promoteStageNpc(npc.id), 'stage.npcPromotionDone')}><Sparkles className="w-3.5 h-3.5" />{t('stage.npcPromote')}</Button>
            </div>}
          </section>)}
        </div>
        <form className="border-t border-slate-700 pt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault();
          void act(async () => { await upsertStageNpc({ name, archetype, personality }); setName(''); setPersonality(''); }, 'stage.npcSaved');
        }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-300 space-y-1">{t('stage.npcName')}<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required className="block w-full rounded-lg border border-slate-600 bg-app p-2 text-sm" /></label>
            <label className="text-xs text-slate-300 space-y-1">{t('stage.npcArchetype')}<select value={archetype} onChange={(event) => setArchetype(event.target.value)} className="block w-full rounded-lg border border-slate-600 bg-app p-2 text-sm">{NPC_ARCHETYPES.map((key) => <option key={key} value={key}>{t(archetypeLabel(key))}</option>)}</select></label>
          </div>
          <label className="block text-xs text-slate-300 space-y-1">{t('stage.npcPersonality')}<textarea value={personality} onChange={(event) => setPersonality(event.target.value)} rows={2} maxLength={4000} className="block w-full rounded-lg border border-slate-600 bg-app p-2 text-sm" /></label>
          <Button type="submit" size="sm" disabled={busy || isProcessingStageTurn || !name.trim()}><UserPlus className="w-3.5 h-3.5" />{t('stage.npcSave')}</Button>
        </form>
      </div>
    </ModalOverlay>, document.body)}
  </>;
}
