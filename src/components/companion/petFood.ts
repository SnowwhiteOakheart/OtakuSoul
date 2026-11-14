/**
 * Feeding the pet: a food sticks to the pointer while it is over the pet window; held at the
 * figure's mouth for a moment (or clicked on it) the figure eats it. Pure helpers for that.
 */
export interface PetFood {
  id: 'apple' | 'cake' | 'onigiri' | 'tea';
  emoji: string;
}

export const PET_FOODS: PetFood[] = [
  { id: 'apple', emoji: '🍎' },
  { id: 'cake', emoji: '🍰' },
  { id: 'onigiri', emoji: '🍙' },
  { id: 'tea', emoji: '🍵' },
];

/** How long the food stays at the mouth before it is eaten. */
export const EAT_DWELL_MS = 350;
/** The food is put away after this long without being eaten. */
export const FEED_TIMEOUT_MS = 45_000;

/**
 * Whether a point (window pixels) is at the figure's mouth: the lower part of the head line
 * (`headEnd`, share of the window height from the top), around the middle of the window.
 */
export function atMouth(x: number, y: number, width: number, height: number, headEnd: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const share = y / height;
  return share >= headEnd * 0.55 && share <= headEnd * 1.05 && Math.abs(x - width / 2) <= width * 0.22;
}
