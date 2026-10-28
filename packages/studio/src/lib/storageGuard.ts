// Shared localStorage-availability guard, plus the load/save pair built on
// it.
//
// i18n.ts (persisted locale choice), theme.ts (persisted theme choice),
// and firstVisit.ts (durable first-visit flag) all need to probe
// localStorage before touching it — SSR, private-mode browsing, and
// storage-disabled settings can all make `localStorage` throw or be
// unavailable. The three pairs shared the same shape (guard + try/catch +
// harmless fallback) and differed only in key and validity predicate, so
// that shape lives here once, parameterized by the predicate.

/** True when localStorage is usable (guards SSR / private-mode / disabled). */
export function storageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Load a persisted string value, accepted only when the caller's predicate
 * holds. Never throws: unavailable storage, a missing or invalid value, or
 * a storage error all yield null, and the caller's fallback applies.
 */
export function loadSavedValue<T extends string>(
  key: string,
  isValid: (value: string) => value is T,
): T | null {
  if (!storageAvailable()) return null;
  try {
    const v = localStorage.getItem(key);
    return v !== null && isValid(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Persist a string value. Never throws: unavailable storage or a storage
 * error is swallowed, and the caller's fallback (re-detecting, re-defaulting,
 * or re-showing) applies.
 */
export function saveSavedValue(key: string, value: string): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota / private-mode — the caller's fallback applies.
  }
}
