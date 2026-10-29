/** Night hours (local time) in which the pet is sleepier, calmer and quieter. */
export const isNightHour = (hour: number) => hour >= 23 || hour < 6;

/** Share of its volume the pet's voice keeps at night. */
export const NIGHT_VOLUME = 0.5;
