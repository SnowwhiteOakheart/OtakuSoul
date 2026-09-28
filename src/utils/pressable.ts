import type React from 'react';

/**
 * Makes a non-button element (e.g. a card that contains its own buttons) behave like a
 * button: focusable, announced as a button and activated with Enter or Space. Clicks and key
 * presses inside nested controls are ignored so those keep their own behaviour.
 */
const NESTED_CONTROLS = 'button, a[href], input, select, textarea, [role="button"]';

export function pressable(onPress: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      // Clicks on nested controls belong to those controls.
      const interactive = (event.target as HTMLElement).closest(NESTED_CONTROLS);
      if (interactive && interactive !== event.currentTarget) return;
      onPress();
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPress();
      }
    },
  };
}
