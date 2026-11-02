/**
 * What a key that is not in the keyboard does.
 *
 * - `"swallow"` — the key does nothing (silent on every computer).
 * - `"pass-through"` — the key falls through to the computer's own layout.
 */
export type Disposition = "swallow" | "pass-through";

/** The character class of what an unhandled key types on a base keyboard. */
export type LeakClass = "letters" | "digits" | "punctuation";

/**
 * The keyboard-wide fallback policy: one {@link Disposition} per
 * {@link LeakClass}; default all `"swallow"`. Lives in the studio
 * working-copy store, never in the IR or the emitted keyboard. The engine
 * expands it over the live carved combinations into per-combination
 * {@link CarveDisposition} records (the suppression compiler's internal
 * input); deadkey carves always suppress regardless of this value.
 *
 * @see specs/109-base-keyboard-fallback/data-model.md
 */
export interface FallbackPolicy {
  letters: Disposition;
  digits: Disposition;
  punctuation: Disposition;
}

/** The policy a working copy starts with, and the migration fallback. */
export const DEFAULT_FALLBACK_POLICY: Readonly<FallbackPolicy> = Object.freeze({
  letters: "swallow",
  digits: "swallow",
  punctuation: "swallow",
});

/** A policy with every class set to one disposition (also the legacy-value widening). */
export function uniformFallbackPolicy(disposition: Disposition): FallbackPolicy {
  return { letters: disposition, digits: disposition, punctuation: disposition };
}

/**
 * The single disposition the carve-suppression pipeline consumes until it is
 * made class-aware: `"pass-through"` only when every class passes through.
 */
export function collapseFallbackPolicy(policy: FallbackPolicy): Disposition {
  return policy.letters === "pass-through" &&
    policy.digits === "pass-through" &&
    policy.punctuation === "pass-through"
    ? "pass-through"
    : "swallow";
}
