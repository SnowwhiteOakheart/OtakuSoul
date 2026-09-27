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

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface FeedbackState {
  pendingConfirm: (ConfirmOptions & { resolve: (confirmed: boolean) => void }) | null;
  toasts: ToastItem[];
}

const useFeedbackStore = create<FeedbackState>(() => ({ pendingConfirm: null, toasts: [] }));

/** Styled, translatable replacement for `window.confirm`. Resolves `true` when confirmed. */
export const confirmDialog = (options: ConfirmOptions): Promise<boolean> =>
  new Promise((resolve) => {
    useFeedbackStore.getState().pendingConfirm?.resolve(false);
    useFeedbackStore.setState({ pendingConfirm: { ...options, resolve } });
  });

const settleConfirm = (confirmed: boolean) => {
  const pending = useFeedbackStore.getState().pendingConfirm;
  useFeedbackStore.setState({ pendingConfirm: null });
  pending?.resolve(confirmed);
};

let nextToastId = 1;

const dismissToast = (id: number) =>
  useFeedbackStore.setState((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));

const pushToast = (kind: ToastKind, message: string) => {
  const id = nextToastId++;
  useFeedbackStore.setState((state) => ({ toasts: [...state.toasts.slice(-4), { id, kind, message }] }));
  window.setTimeout(() => dismissToast(id), kind === 'error' ? 8000 : 4000);
};

/** Non-blocking notifications; replaces `window.alert`. */
export const toast = {
  success: (message: string) => pushToast('success', message),
  error: (message: string) => pushToast('error', message),
  info: (message: string) => pushToast('info', message),
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

  return (
    <>
      {pendingConfirm && (
        <ModalOverlay
          onClose={() => settleConfirm(false)}
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
            <div className="flex justify-end gap-2">
              <button
                onClick={() => settleConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-accent-400 outline-none"
              >
                {pendingConfirm.cancelLabel ?? t('common.cancel')}
              </button>
              <button
                data-autofocus
                onClick={() => settleConfirm(true)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 outline-none ${
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
              <p className="flex-1 select-text break-words">{item.message}</p>
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
