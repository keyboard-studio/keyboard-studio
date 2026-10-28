/**
 * The keyboard-wide fallback policy: what a key that is not in the keyboard
 * does.
 *
 * - `"swallow"` — the key does nothing (silent on every computer).
 * - `"pass-through"` — the key falls through to the computer's own layout.
 *
 * One value per working copy; default `"swallow"`. Lives in the studio
 * working-copy store, never in the IR or the emitted keyboard. The engine
 * expands it over the live carved combinations into per-combination
 * {@link CarveDisposition} records (the suppression compiler's internal
 * input); deadkey carves always suppress regardless of this value.
 *
 * @see specs/076-rule-behaviours/fallback-surface-design.md
 */
export type FallbackPolicy = "swallow" | "pass-through";

/** The policy a working copy starts with, and the migration fallback. */
export const DEFAULT_FALLBACK_POLICY: FallbackPolicy = "swallow";
