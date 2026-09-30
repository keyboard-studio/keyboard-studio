// Haptics primitive: a guarded wrapper around navigator.vibrate.
//
// Haptics are for commit points only — the moment a gesture or press commits
// to an outcome (a sheet dismissing, a long-press firing) — and are always
// fired on the same frame as the matching visual feedback. This file is just
// the safe primitive; call sites decide WHEN a commit happened.

/**
 * Fire a vibration lasting `ms` milliseconds. A no-op when the Vibration API
 * is absent, and never throws — haptics are best-effort feedback and must
 * never break the interaction they accompany.
 */
export function buzz(ms: number): void {
  try {
    // lib.dom types vibrate as taking Iterable<number>; the platform also
    // accepts a single duration, which is all this primitive needs.
    type VibratingNavigator = Navigator & {
      vibrate?: (pattern: number) => boolean;
    };
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as VibratingNavigator)
        : undefined;
    const vibrate = nav?.vibrate;
    if (typeof vibrate === "function") {
      vibrate.call(nav, ms);
    }
  } catch {
    // Best-effort feedback only: swallow any failure from the platform API.
  }
}
