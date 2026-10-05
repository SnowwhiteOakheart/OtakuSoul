import { useCallback, useState } from 'react';

const read = (key: string, fallback: boolean) => {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === 'true';
  } catch {
    return fallback;
  }
};

/**
 * A view preference of this device (compact chat, folded HUD …), kept in localStorage.
 * Falls back to the default when storage is unavailable.
 */
export const usePersistentFlag = (key: string, fallback: boolean): [boolean, (value: boolean) => void] => {
  const [value, setValue] = useState(() => read(key, fallback));
  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch (error) {
        console.warn('Ansicht konnte nicht gespeichert werden:', error);
      }
    },
    [key],
  );
  return [value, update];
};
