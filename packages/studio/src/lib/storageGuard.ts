// Shared localStorage-availability guard.
//
// Both i18n.ts (persisted locale choice) and firstVisit.ts (durable
// first-visit flag) need to probe localStorage before touching it — SSR,
// private-mode browsing, and storage-disabled settings can all make
// `localStorage` throw or be unavailable. This is that single check.

/** True when localStorage is usable (guards SSR / private-mode / disabled). */
export function storageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}
