import type React from 'react';

/**
 * Makes a non-button element (e.g. a card that contains its own buttons) behave like a
 * button: focusable, announced as a button and activated with Enter or Space. Key presses
 * inside nested controls are ignored so those keep their own behaviour.
 */
export function pressable(onPress: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: onPress,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onPress();
      }
    },
  };
}
