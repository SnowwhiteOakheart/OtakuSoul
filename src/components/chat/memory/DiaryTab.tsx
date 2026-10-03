import { useState } from 'react';
import { useStoreFields } from '../../../store/useAppStore';
import { translate, useTranslation } from '../../../i18n';
import { toast } from '../../ui/feedback';
import { errorMessage } from '../../../utils/errors';
import { BookHeart, Sparkles } from 'lucide-react';

export const DiaryTab = () => {
  const { t } = useTranslation();
  const {
    activeCharacter, cognitiveOverview, addManualDiary, generateManualDiary,
  } = useStoreFields(
    'activeCharacter', 'cognitiveOverview', 'addManualDiary', 'generateManualDiary',
  );

  const charName = activeCharacter?.card.data.name ?? '';
  const [newDiaryTitle, setNewDiaryTitle] = useState('');
  const [newDiaryText, setNewDiaryText] = useState('');
  const [newDiaryMood, setNewDiaryMood] = useState('Reflective');
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAddDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiaryTitle.trim() || !newDiaryText.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await addManualDiary(newDiaryTitle.trim(), newDiaryText.trim(), newDiaryMood);
      setNewDiaryTitle('');
      setNewDiaryText('');
      toast.success(translate('memory.diarySaved'));
    } catch (e) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(e) }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateDiary = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    try {
      const entry = await generateManualDiary();
      if (entry) toast.success(translate('memory.diaryGenerated'));
    } catch (e) {
      toast.error(translate('memory.saveFailed', { error: errorMessage(e) }));
    } finally {
      setIsGenerating(false);
    }
  };

  return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-xl bg-accent2-950/20 border border-accent2-900/40">
          <div className="text-xs text-accent2-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-accent2-400" />
            {t('memory.diaryIntro')}
          </div>
          <button
            onClick={handleGenerateDiary}
            disabled={isGenerating}
            className="px-3 py-1 rounded-lg bg-accent2-600 hover:bg-accent2-500 text-white text-xs font-semibold transition"
          >
            {t('memory.generateDiary')}
          </button>
        </div>

        <form
          onSubmit={handleAddDiary}
          className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 space-y-2.5"
        >
          <fieldset disabled={isSaving} className="space-y-2.5">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <BookHeart className="w-3.5 h-3.5 text-accent2-400" />
              {t('memory.writeDiary')}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDiaryTitle}
                onChange={(e) => setNewDiaryTitle(e.target.value)}
                placeholder={t('memory.diaryTitlePlaceholder')}
                aria-label={t('memory.diaryTitlePlaceholder')}
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
              />
              <select
                aria-label={t('memory.mood')}
                value={newDiaryMood}
                onChange={(e) => setNewDiaryMood(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1.5 focus:outline-hidden"
              >
                {(['Reflective', 'Happy', 'Melancholy', 'Flustered', 'Excited'] as const).map((mood) => (
                  <option key={mood} value={mood}>
                    {t(`memory.mood.${mood}`)}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={2}
              value={newDiaryText}
              onChange={(e) => setNewDiaryText(e.target.value)}
              placeholder={t('memory.diaryTextPlaceholder', { name: charName })}
              aria-label={t('memory.writeDiary')}
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-accent-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-accent2-600 hover:bg-accent2-500 text-white text-xs font-semibold"
            >
              {isSaving ? t('common.saving') : t('memory.saveDiary')}
            </button>
          </fieldset>
        </form>

        <div className="space-y-3">
          {cognitiveOverview?.recent_diary.map((entry) => (
            <div
              key={entry.id}
              className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-700/60 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-200">{entry.title}</h4>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent2-900/40 text-accent2-300 border border-accent2-500/30">
                  {entry.mood}
                </span>
              </div>
              <p className="text-xs text-slate-300 italic leading-relaxed whitespace-pre-wrap">
                "{entry.entry_text}"
              </p>
            </div>
          ))}

          {(!cognitiveOverview?.recent_diary ||
            cognitiveOverview.recent_diary.length === 0) && (
            <div className="p-8 text-center text-xs text-slate-400 italic">
              {t('memory.diaryEmpty')}
            </div>
          )}
        </div>
      </div>
  );
};
