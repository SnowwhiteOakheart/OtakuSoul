import type React from 'react';

/**
 * Keyboard of an ARIA radio group: the arrow keys move the choice (and the focus) to the next or
 * previous option, Tab leaves the group. Options carry `data-radio-value`.
 */
export function radioGroupKeyDown<T extends string>(
  event: React.KeyboardEvent<HTMLElement>,
  values: readonly T[],
  current: T | undefined,
  select: (value: T) => void,
) {
  const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key];
  if (!step || values.length === 0) return;
  event.preventDefault();
  const index = current === undefined ? -1 : values.indexOf(current);
  const next = values[(index + step + values.length) % values.length]!;
  select(next);
  event.currentTarget.querySelector<HTMLElement>(`[data-radio-value="${next}"]`)?.focus();
}

/** Only the chosen option (or the first, when none is chosen) is a Tab stop. */
export const radioTabIndex = <T extends string>(value: T, values: readonly T[], current: T | undefined) =>
  value === current || (!values.includes(current as T) && value === values[0]) ? 0 : -1;
