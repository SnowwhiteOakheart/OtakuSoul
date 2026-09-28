import React, { useEffect, useLayoutEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last. Only the top one reacts to Escape and traps Tab. */
const dialogStack: HTMLElement[] = [];

interface ModalOverlayProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Called on Escape (and on backdrop click if enabled). Omit for dialogs that must not be dismissed. */
  onClose?: () => void;
  /** Close when the dimmed backdrop itself is clicked. Off by default to protect unsaved input. */
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}

/**
 * Accessible replacement for the `fixed inset-0` overlay wrappers: sets dialog semantics,
 * moves focus into the dialog, keeps Tab inside it, closes on Escape and restores focus on close.
 * Styling stays with the caller via `className`.
 */
export const ModalOverlay: React.FC<ModalOverlayProps> = ({
  onClose,
  closeOnBackdrop = false,
  children,
  onMouseDown,
  className,
  ...rest
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogStack.push(dialog);

    const initial =
      dialog.querySelector<HTMLElement>('[data-autofocus], [autofocus]') ??
      dialog.querySelector<HTMLElement>(FOCUSABLE);
    (initial ?? dialog).focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== dialog) return;
      if (event.key === 'Escape' && onCloseRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      const index = dialogStack.lastIndexOf(dialog);
      if (index !== -1) dialogStack.splice(index, 1);
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, []);

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- backdrop click closes the dialog; keyboard users have Escape
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className={`outline-hidden ${className ?? ''}`}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current?.();
        onMouseDown?.(event);
      }}
      {...rest}
    >
      {children}
    </div>
  );
};
