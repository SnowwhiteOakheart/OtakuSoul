import React, { useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { useStoreFields } from '../../store/useAppStore';
import { useTranslation } from '../../i18n';
import { ModalOverlay } from '../ui/ModalOverlay';
import { toast } from '../ui/feedback';
import type { CampaignObjective, CharacterOverlay, InventoryItem, SceneState, StageLoreCard, StageRelationship, StoryArc } from '../../types';

/** The parts of a scene the world editor changes; everything else stays as the latest state has it. */
type CampaignDraft = Pick<SceneState, 'arcs' | 'objectives' | 'relationships' | 'inventory'> & {
  facts: [string, string][];
  overlays: CharacterOverlay[];
  lore_cards: StageLoreCard[];
};

/** Overlay facts are edited as `key: value` lines. */
const factsToText = (facts: Record<string, string>) => Object.entries(facts).map(([k, v]) => `${k}: ${v}`).join('\n');
const textToFacts = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split('\n')
      .map((line) => line.split(/:(.*)/s).map((part) => part.trim()))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key!, value!]),
  );

// Widths stay separate: a `w-full` in the shared class would win over a narrower one.
const field = 'bg-app border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-hidden focus:border-accent-500';
const input = `w-full ${field}`;
const numberInput = `w-20 ${field}`;
const newId = (prefix: string) => `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const Section: React.FC<{ title: string; onAdd?: () => void; addLabel: string; children: React.ReactNode }> = ({
  title,
  onAdd,
  addLabel,
  children,
}) => (
  <section className="space-y-2">
    <div className="flex items-center justify-between">
      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">{title}</h3>
      {onAdd && (
        <button type="button" onClick={onAdd} className="flex items-center gap-1 text-xs text-accent-300 hover:text-accent-200">
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </button>
      )}
    </div>
    {children}
  </section>
);

const RemoveButton: React.FC<{ onClick: () => void; label: string }> = ({ onClick, label }) => (
  <button type="button" onClick={onClick} aria-label={label} title={label} className="p-1.5 text-slate-400 hover:text-rose-400">
    <Trash2 className="w-3.5 h-3.5" />
  </button>
);

/**
 * Edit everything the game master tracks: key facts, story arcs (including hidden ones),
 * objectives, relationships and inventory.
 */
export const StageWorldEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const { stageState, saveStageScene, isProcessingStageTurn } = useStoreFields(
    'stageState', 'saveStageScene', 'isProcessingStageTurn',
  );
  const [draft, setDraft] = useState<CampaignDraft | null>(() =>
    stageState
      ? {
          facts: Object.entries(stageState.world.key_facts || {}),
          arcs: stageState.arcs.map((a) => ({ ...a })),
          objectives: stageState.objectives.map((o) => ({ ...o })),
          relationships: stageState.relationships.map((r) => ({ ...r })),
          inventory: stageState.inventory.map((i) => ({ ...i })),
          overlays: (stageState.overlays ?? []).map((o) => ({ ...o, facts: { ...o.facts } })),
          lore_cards: (stageState.lore_cards ?? []).map((c) => ({ ...c, keywords: [...c.keywords] })),
        }
      : null,
  );
  const [showHidden, setShowHidden] = useState(false);
  if (!stageState || !draft) return null;

  const update = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => setDraft({ ...draft, [key]: value });
  const patch = <T,>(list: T[], index: number, change: Partial<T>) => list.map((item, i) => (i === index ? { ...item, ...change } : item));

  const save = async () => {
    // Merge into the latest state so a turn that finished meanwhile isn't overwritten.
    const latest = stageState;
    const facts = Object.fromEntries(draft.facts.filter(([key]) => key.trim()).map(([key, value]) => [key.trim(), value]));
    await saveStageScene({
      ...latest,
      world: { ...latest.world, key_facts: facts },
      arcs: draft.arcs.map((arc) => ({ ...arc, stage: Math.min(arc.stage, arc.max_stage) })),
      objectives: draft.objectives,
      relationships: draft.relationships,
      inventory: draft.inventory.filter((item) => item.name.trim()),
      overlays: draft.overlays.filter((overlay) => overlay.name.trim()),
      lore_cards: draft.lore_cards.filter((card) => card.title.trim() && card.content.trim()),
    });
    toast.success(t('stageWorld.saved'));
    onClose();
  };

  const visibleArcs = draft.arcs.map((arc, index) => ({ arc, index })).filter(({ arc }) => showHidden || arc.is_revealed);

  return (
    <ModalOverlay onClose={onClose} aria-labelledby="stage-world-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 id="stage-world-title" className="text-base font-bold text-slate-100">{t('stageWorld.title')}</h2>
            <p className="text-xs text-slate-400">{t('stageWorld.intro')}</p>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <Section title={t('stageWorld.facts')} addLabel={t('stageWorld.add')} onAdd={() => update('facts', [...draft.facts, ['', '']])}>
            {draft.facts.map(([key, value], index) => (
              <div key={index} className="flex gap-2 items-center">
                <input aria-label={t('stageWorld.factKey')} className={`${input} max-w-48`} value={key} placeholder={t('stageWorld.factKey')}
                  onChange={(e) => update('facts', draft.facts.map((f, i) => (i === index ? [e.target.value, f[1]] : f)))} />
                <input aria-label={t('stageWorld.factValue')} className={input} value={value} placeholder={t('stageWorld.factValue')}
                  onChange={(e) => update('facts', draft.facts.map((f, i) => (i === index ? [f[0], e.target.value] : f)))} />
                <RemoveButton label={t('common.delete')} onClick={() => update('facts', draft.facts.filter((_, i) => i !== index))} />
              </div>
            ))}
          </Section>

          <Section
            title={t('stageWorld.arcs')}
            addLabel={t('stageWorld.add')}
            onAdd={() => update('arcs', [...draft.arcs, { id: newId('arc'), title: '', description: '', stage: 0, max_stage: 3, is_revealed: true, is_resolved: false } as StoryArc])}
          >
            <label className="flex items-center gap-2 text-xs text-amber-300">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
              {t('stageWorld.showHidden')}
            </label>
            {visibleArcs.map(({ arc, index }) => (
              <div key={arc.id} className="p-3 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                <div className="flex gap-2 items-center">
                  <input aria-label={t('stageWorld.arcTitle')} className={input} value={arc.title} placeholder={t('stageWorld.arcTitle')}
                    onChange={(e) => update('arcs', patch(draft.arcs, index, { title: e.target.value }))} />
                  <RemoveButton label={t('common.delete')} onClick={() => update('arcs', draft.arcs.filter((_, i) => i !== index))} />
                </div>
                <textarea aria-label={t('stageWorld.description')} className={input} rows={2} value={arc.description}
                  onChange={(e) => update('arcs', patch(draft.arcs, index, { description: e.target.value }))} />
                <div className="flex flex-wrap gap-3 items-center text-xs text-slate-300">
                  <label className="flex items-center gap-1.5">{t('stageWorld.progress')}
                    <input type="number" min={0} className={numberInput} value={arc.stage}
                      onChange={(e) => update('arcs', patch(draft.arcs, index, { stage: Math.max(0, Number(e.target.value)) }))} />
                    / <input type="number" min={1} className={numberInput} value={arc.max_stage}
                      onChange={(e) => update('arcs', patch(draft.arcs, index, { max_stage: Math.max(1, Number(e.target.value)) }))} />
                  </label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={arc.is_revealed}
                    onChange={(e) => update('arcs', patch(draft.arcs, index, { is_revealed: e.target.checked }))} />{t('stageWorld.revealed')}</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={arc.is_resolved}
                    onChange={(e) => update('arcs', patch(draft.arcs, index, { is_resolved: e.target.checked }))} />{t('stageWorld.resolved')}</label>
                </div>
              </div>
            ))}
          </Section>

          <Section
            title={t('stageWorld.objectives')}
            addLabel={t('stageWorld.add')}
            onAdd={() => update('objectives', [...draft.objectives, { id: newId('objective'), title: '', description: '', current: 0, max: 1, status: 'active' } as CampaignObjective])}
          >
            {draft.objectives.map((objective, index) => (
              <div key={objective.id} className="p-3 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                <div className="flex gap-2 items-center">
                  <input aria-label={t('stageWorld.objectiveTitle')} className={input} value={objective.title} placeholder={t('stageWorld.objectiveTitle')}
                    onChange={(e) => update('objectives', patch(draft.objectives, index, { title: e.target.value }))} />
                  <select aria-label={t('stageWorld.status')} className={`w-36 ${field}`} value={objective.status}
                    onChange={(e) => update('objectives', patch(draft.objectives, index, { status: e.target.value }))}>
                    {(['active', 'completed', 'failed'] as const).map((status) => <option key={status} value={status}>{t(`stageWorld.status.${status}`)}</option>)}
                  </select>
                  <RemoveButton label={t('common.delete')} onClick={() => update('objectives', draft.objectives.filter((_, i) => i !== index))} />
                </div>
                <div className="flex gap-2 items-center text-xs text-slate-300">
                  <input aria-label={t('stageWorld.description')} className={input} value={objective.description}
                    onChange={(e) => update('objectives', patch(draft.objectives, index, { description: e.target.value }))} />
                  <input type="number" min={0} aria-label={t('stageWorld.progress')} className={numberInput} value={objective.current}
                    onChange={(e) => update('objectives', patch(draft.objectives, index, { current: Math.max(0, Number(e.target.value)) }))} />
                  / <input type="number" min={1} aria-label={t('stageWorld.max')} className={numberInput} value={objective.max}
                    onChange={(e) => update('objectives', patch(draft.objectives, index, { max: Math.max(1, Number(e.target.value)) }))} />
                </div>
              </div>
            ))}
          </Section>

          <Section title={t('stageWorld.relationships')} addLabel={t('stageWorld.add')}>
            {draft.relationships.map((relationship: StageRelationship, index) => (
              <div key={`${relationship.subject}-${relationship.target}`} className="flex flex-wrap gap-2 items-center text-xs text-slate-300">
                <span className="min-w-40 font-semibold text-slate-200">{relationship.subject} → {relationship.target}</span>
                <input type="number" min={-100} max={100} aria-label={t('stageWorld.affinity')} className={numberInput} value={relationship.affinity}
                  onChange={(e) => update('relationships', patch(draft.relationships, index, { affinity: Math.max(-100, Math.min(100, Number(e.target.value))) }))} />
                <input aria-label={t('stageWorld.roleView')} className={`${input} flex-1 min-w-40`} value={relationship.role_view} placeholder={t('stageWorld.roleView')}
                  onChange={(e) => update('relationships', patch(draft.relationships, index, { role_view: e.target.value }))} />
                <RemoveButton label={t('common.delete')} onClick={() => update('relationships', draft.relationships.filter((_, i) => i !== index))} />
              </div>
            ))}
          </Section>

          <Section
            title={t('stageWorld.inventory')}
            addLabel={t('stageWorld.add')}
            onAdd={() => update('inventory', [...draft.inventory, { id: newId('item'), name: '', description: '', quantity: 1, item_type: 'key', hp_restore: 0, stress_restore: 0, clears_condition: null } as InventoryItem])}
          >
            {draft.inventory.map((item, index) => (
              <div key={item.id} className="flex flex-wrap gap-2 items-center">
                <input aria-label={t('stageWorld.itemName')} className={`${input} max-w-48`} value={item.name} placeholder={t('stageWorld.itemName')}
                  onChange={(e) => update('inventory', patch(draft.inventory, index, { name: e.target.value }))} />
                <input aria-label={t('stageWorld.description')} className={`${input} flex-1 min-w-40`} value={item.description}
                  onChange={(e) => update('inventory', patch(draft.inventory, index, { description: e.target.value }))} />
                <input type="number" min={1} aria-label={t('stageWorld.quantity')} className={numberInput} value={item.quantity}
                  onChange={(e) => update('inventory', patch(draft.inventory, index, { quantity: Math.max(1, Number(e.target.value)) }))} />
                <select aria-label={t('stageWorld.itemType')} className={`w-32 ${field}`} value={item.item_type}
                  onChange={(e) => update('inventory', patch(draft.inventory, index, { item_type: e.target.value }))}>
                  {(['consumable', 'key', 'equipment'] as const).map((type) => <option key={type} value={type}>{t(`stageWorld.itemType.${type}`)}</option>)}
                </select>
                <RemoveButton label={t('common.delete')} onClick={() => update('inventory', draft.inventory.filter((_, i) => i !== index))} />
              </div>
            ))}
          </Section>

          <Section
            title={t('stageWorld.overlays')}
            addLabel={t('stageWorld.add')}
            onAdd={() => update('overlays', [...draft.overlays, { name: '', current_role: '', arc_stage: '', facts: {} }])}
          >
            <p className="text-xs text-slate-400">{t('stageWorld.overlaysHint')}</p>
            {draft.overlays.map((overlay, index) => (
              <div key={index} className="p-3 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                <div className="flex gap-2 items-center">
                  <input aria-label={t('stageWorld.overlayName')} className={`${input} max-w-48`} value={overlay.name} placeholder={t('stageWorld.overlayName')}
                    onChange={(e) => update('overlays', patch(draft.overlays, index, { name: e.target.value }))} />
                  <input aria-label={t('stageWorld.overlayRole')} className={input} value={overlay.current_role} placeholder={t('stageWorld.overlayRole')}
                    onChange={(e) => update('overlays', patch(draft.overlays, index, { current_role: e.target.value }))} />
                  <RemoveButton label={t('common.delete')} onClick={() => update('overlays', draft.overlays.filter((_, i) => i !== index))} />
                </div>
                <input aria-label={t('stageWorld.overlayArc')} className={input} value={overlay.arc_stage} placeholder={t('stageWorld.overlayArc')}
                  onChange={(e) => update('overlays', patch(draft.overlays, index, { arc_stage: e.target.value }))} />
                <textarea aria-label={t('stageWorld.overlayFacts')} className={input} rows={2} defaultValue={factsToText(overlay.facts)}
                  placeholder={t('stageWorld.overlayFactsPlaceholder')}
                  onChange={(e) => update('overlays', patch(draft.overlays, index, { facts: textToFacts(e.target.value) }))} />
              </div>
            ))}
          </Section>

          <Section
            title={t('stageWorld.loreCards')}
            addLabel={t('stageWorld.add')}
            onAdd={() => update('lore_cards', [...draft.lore_cards, { id: newId('lore'), title: '', content: '', keywords: [], audience: 'party' }])}
          >
            <p className="text-xs text-slate-400">{t('stageWorld.loreCardsHint')}</p>
            {draft.lore_cards.map((card, index) => (
              <div key={card.id} className="p-3 rounded-xl bg-app/60 border border-slate-800 space-y-2">
                <div className="flex gap-2 items-center">
                  <input aria-label={t('stageWorld.loreTitle')} className={input} value={card.title} placeholder={t('stageWorld.loreTitle')}
                    onChange={(e) => update('lore_cards', patch(draft.lore_cards, index, { title: e.target.value }))} />
                  <select aria-label={t('stageWorld.loreAudience')} className={`w-44 ${field}`} value={card.audience}
                    onChange={(e) => update('lore_cards', patch(draft.lore_cards, index, { audience: e.target.value }))}>
                    <option value="party">{t('stageWorld.loreAudience.party')}</option>
                    <option value="gm">{t('stageWorld.loreAudience.gm')}</option>
                  </select>
                  <RemoveButton label={t('common.delete')} onClick={() => update('lore_cards', draft.lore_cards.filter((_, i) => i !== index))} />
                </div>
                <textarea aria-label={t('stageWorld.loreContent')} className={input} rows={2} value={card.content}
                  onChange={(e) => update('lore_cards', patch(draft.lore_cards, index, { content: e.target.value }))} />
                <input aria-label={t('stageWorld.loreKeywords')} className={input} defaultValue={card.keywords.join(', ')}
                  placeholder={t('stageWorld.loreKeywordsPlaceholder')}
                  onChange={(e) => update('lore_cards', patch(draft.lore_cards, index, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) }))} />
              </div>
            ))}
          </Section>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-800">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold">{t('common.cancel')}</button>
          <button
            onClick={() => void save()}
            disabled={isProcessingStageTurn}
            title={isProcessingStageTurn ? t('stageWorld.busy') : undefined}
            className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" /> {t('stageWorld.save')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
