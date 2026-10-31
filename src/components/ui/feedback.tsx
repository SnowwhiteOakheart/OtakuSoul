import React from 'react';
import { create } from 'zustand';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ModalOverlay } from './ModalOverlay';
import { useTranslation } from '../../i18n';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` styles the confirm button for destructive actions. */
  tone?: 'default' | 'danger';
}

interface ChoiceOptions extends ConfirmOptions {
  /** Shows a checkbox (e.g. "remember my choice") whose state comes back with the answer. */
  checkboxLabel?: string;
}

/** `dismiss` = closed via Escape or the backdrop, without picking either button. */
export interface ChoiceResult {
  choice: 'confirm' | 'cancel' | 'dismiss';
  checked: boolean;
}

type ToastKind = 'success' | 'error' | 'info';

/** Optional follow-up for a toast, e.g. "Open in chat" after an import. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface FeedbackState {
  pendingConfirm: (ChoiceOptions & { resolve: (result: ChoiceResult) => void }) | null;
  toasts: ToastItem[];
}

const useFeedbackStore = create<FeedbackState>(() => ({ pendingConfirm: null, toasts: [] }));

/** Styled, translatable replacement for `window.confirm`. Resolves `true` when confirmed. */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  choiceDialog(options).then((result) => result.choice === 'confirm');

/** Like `confirmDialog`, but tells the cancel button apart from dismissing and can show a checkbox. */
export const choiceDialog = (options: ChoiceOptions): Promise<ChoiceResult> =>
  new Promise((resolve) => {
    useFeedbackStore.getState().pendingConfirm?.resolve({ choice: 'dismiss', checked: false });
    useFeedbackStore.setState({ pendingConfirm: { ...options, resolve } });
  });

const settleConfirm = (choice: ChoiceResult['choice'], checked = false) => {
  const pending = useFeedbackStore.getState().pendingConfirm;
  useFeedbackStore.setState({ pendingConfirm: null });
  pending?.resolve({ choice, checked });
};

let nextToastId = 1;

const dismissToast = (id: number) =>
  useFeedbackStore.setState((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));

const pushToast = (kind: ToastKind, message: string, action?: ToastAction) => {
  const id = nextToastId++;
  useFeedbackStore.setState((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind, message, action }] }));
  // Errors and toasts with a follow-up action stay longer so there is time to read or act.
  window.setTimeout(() => dismissToast(id), kind === 'error' || action ? 8000 : 4000);
};

/** Non-blocking notifications; replaces `window.alert`. */
export const toast = {
  success: (message: string, action?: ToastAction) => pushToast('success', message, action),
  error: (message: string, action?: ToastAction) => pushToast('error', message, action),
  info: (message: string, action?: ToastAction) => pushToast('info', message, action),
};

const TOAST_STYLES: Record<ToastKind, { icon: React.ElementType; className: string }> = {
  success: { icon: CheckCircle2, className: 'border-emerald-500/40 text-emerald-200' },
  error: { icon: XCircle, className: 'border-rose-500/40 text-rose-200' },
  info: { icon: Info, className: 'border-accent-500/40 text-slate-200' },
};

/** Renders the confirm dialog and the toast stack; mounted once in `App`. */
export const FeedbackHost: React.FC = () => {
  const { t } = useTranslation();
  const pendingConfirm = useFeedbackStore((state) => state.pendingConfirm);
  const toasts = useFeedbackStore((state) => state.toasts);
  // The dialog the checkbox was ticked in: every new dialog starts with it cleared.
  const [checkedIn, setCheckedIn] = React.useState<typeof pendingConfirm>(null);
  const checked = !!pendingConfirm && checkedIn === pendingConfirm;

  return (
    <>
      {pendingConfirm && (
        <ModalOverlay
          onClose={() => settleConfirm('dismiss')}
          closeOnBackdrop
          aria-labelledby="confirm-dialog-title"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              {pendingConfirm.tone === 'danger' && (
                <div className="shrink-0 rounded-xl bg-rose-500/15 p-2 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              )}
              <div className="space-y-1.5">
                <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-100">
                  {pendingConfirm.title}
                </h2>
                {pendingConfirm.message && (
                  <p className="text-sm text-slate-400 whitespace-pre-line">{pendingConfirm.message}</p>
                )}
              </div>
            </div>
            {pendingConfirm.checkboxLabel && (
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => setCheckedIn(e.target.checked ? pendingConfirm : null)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-accent-500"
                />
                {pendingConfirm.checkboxLabel}
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => settleConfirm('cancel', checked)}
                className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-accent-400 outline-hidden"
              >
                {pendingConfirm.cancelLabel ?? t('common.cancel')}
              </button>
              <button
                data-autofocus
                onClick={() => settleConfirm('confirm', checked)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-hidden ${
                  pendingConfirm.tone === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-400'
                    : 'bg-accent-600 hover:bg-accent-500 focus-visible:ring-accent-400'
                }`}
              >
                {pendingConfirm.confirmLabel ?? t('common.confirm')}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[10001] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((item) => {
          const { icon: Icon, className } = TOAST_STYLES[item.kind];
          return (
            <div
              key={item.id}
              role={item.kind === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-slate-900/95 px-3.5 py-3 text-sm shadow-xl backdrop-blur ${className}`}
            >
              <Icon className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="select-text break-words">{item.message}</p>
                {item.action && (
                  <button
                    onClick={() => {
                      dismissToast(item.id);
                      item.action?.onClick();
                    }}
                    className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20 outline-hidden focus-visible:ring-2 focus-visible:ring-accent-400"
                  >
                    {item.action.label} →
                  </button>
                )}
              </div>
              <button
                onClick={() => dismissToast(item.id)}
                aria-label={t('common.close')}
                className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
};
