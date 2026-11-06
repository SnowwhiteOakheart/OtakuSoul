import React, { useState } from 'react';
import { create } from 'zustand';
import { Layers } from 'lucide-react';
import { ModalOverlay } from '../ui/ModalOverlay';
import { useTranslation } from '../../i18n';
import { radioGroupKeyDown, radioTabIndex } from '../../utils/radioGroup';
import type { Live2dZipCandidate } from '../../types';

interface PendingPick {
  fileName: string;
  candidates: Live2dZipCandidate[];
  resolve: (selectedEntryPaths: string[] | null) => void;
}

interface PickerState {
  pending: PendingPick | null;
}

const usePickerStore = create<PickerState>(() => ({ pending: null }));

/**
 * Opens a modal letting the user pick one (or all) Live2D models when a ZIP archive contains
 * multiple `.model3.json` / `.model.json` definitions. Resolves `null` if cancelled.
 */
export const pickLive2dZipModels = (
  fileName: string,
  candidates: Live2dZipCandidate[],
): Promise<string[] | null> =>
  new Promise((resolve) => {
    usePickerStore.getState().pending?.resolve(null);
    usePickerStore.setState({ pending: { fileName, candidates, resolve } });
  });

const settlePick = (result: string[] | null) => {
  const pending = usePickerStore.getState().pending;
  usePickerStore.setState({ pending: null });
  pending?.resolve(result);
};

export const Live2dZipPickerHost: React.FC = () => {
  const { t } = useTranslation();
  const pending = usePickerStore((s) => s.pending);
  const [selection, setSelection] = useState<{ pick: PendingPick | null; index: number }>({
    pick: null,
    index: 0,
  });

  if (!pending || pending.candidates.length === 0) return null;

  const selectedIdx =
    selection.pick === pending && selection.index < pending.candidates.length ? selection.index : 0;
  const setSelectedIdx = (index: number) => setSelection({ pick: pending, index });
  const values = pending.candidates.map((_, idx) => String(idx));
  const chosen = pending.candidates[selectedIdx] ?? pending.candidates[0]!;

  return (
    <ModalOverlay
      onClose={() => settlePick(null)}
      closeOnBackdrop
      aria-labelledby="live2d-zip-picker-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div
        data-live2d-zip-picker
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-accent-600/20 p-2 text-accent-400">
            <Layers className="w-5 h-5" />
          </div>
          <div className="space-y-1 min-w-0">
            <h2 id="live2d-zip-picker-title" className="text-base font-semibold text-slate-100">
              {t('avatars.live2dZipPickTitle')}
            </h2>
            <p className="text-sm text-slate-400 break-words">
              {t('avatars.live2dZipPickMessage', {
                file: pending.fileName,
                count: pending.candidates.length,
              })}
            </p>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-labelledby="live2d-zip-picker-title"
          tabIndex={-1}
          onKeyDown={(e) =>
            radioGroupKeyDown(e, values, String(selectedIdx), (val) => setSelectedIdx(Number(val)))
          }
          className="max-h-72 overflow-y-auto space-y-2 pr-1"
        >
          {pending.candidates.map((candidate, idx) => {
            const val = String(idx);
            const isSelected = idx === selectedIdx;
            return (
              <button
                key={candidate.entry_path}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-radio-value={val}
                data-autofocus={idx === 0 ? true : undefined}
                tabIndex={radioTabIndex(val, values, String(selectedIdx))}
                onClick={() => setSelectedIdx(idx)}
                onDoubleClick={() => settlePick([candidate.entry_path])}
                className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400 flex items-start gap-3 ${
                  isSelected
                    ? 'border-accent-500 bg-accent-600/15 text-slate-100'
                    : 'border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1 h-4 w-4 shrink-0 rounded-full border flex items-center justify-center ${
                    isSelected ? 'border-accent-400' : 'border-slate-500'
                  }`}
                >
                  {isSelected && <span className="h-2 w-2 rounded-full bg-accent-400" />}
                </span>
                <span className="flex-1 min-w-0 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-100">{candidate.name}</span>
                    <span className="rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                      {candidate.version === 'cubism2' ? 'Cubism 2' : 'Cubism 3/4'}
                    </span>
                    {candidate.motion_count > 0 && (
                      <span className="text-xs text-slate-400">
                        {t('avatars.live2dZipMotions', { count: candidate.motion_count })}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs font-mono text-slate-400 break-all">
                    {candidate.entry_path}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => settlePick(null)}
            className="px-3.5 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-accent-400 outline-hidden"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            data-live2d-zip-import-all
            onClick={() => settlePick(pending.candidates.map((c) => c.entry_path))}
            className="px-3.5 py-2 rounded-xl text-sm font-medium border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100 focus-visible:ring-2 focus-visible:ring-accent-400 outline-hidden"
          >
            {t('avatars.live2dZipImportAll', { count: pending.candidates.length })}
          </button>
          <button
            type="button"
            data-live2d-zip-import-selected
            onClick={() => settlePick([chosen.entry_path])}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-accent-600 hover:bg-accent-500 text-white focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-hidden"
          >
            {t('avatars.live2dZipImportSelected')}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
