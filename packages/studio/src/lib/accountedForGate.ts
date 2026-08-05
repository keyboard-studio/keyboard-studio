// accountedForGate — mark-aware relaxation of InventoryCoverageGate.
//
// CRITICAL INVARIANT this module exists to enforce by construction: marks
// ("mark for later review", surveySessionStore.markedForLaterDesktop /
// markedForLaterTouch) relax ONLY the gallery Done affordance and the NavBar
// "still to account for" indicator. They must NEVER relax the Phase F hard
// gate (steps/advance.ts's `allCharactersImplemented`, fed by
// hooks/useInventoryCoverageGate.ts) or the output-nav / download gate
// (StudioShell's `outputNavBlocked`, usePreviewArtifact's canDownload).
//
// This is a SEPARATE derivation layered ON TOP of `InventoryCoverageGate`
// (lib/unimplementedInventory.ts) — it never mutates or re-derives that
// gate's own fields, so a caller that (correctly) keeps reading
// `InventoryCoverageGate.blocked`/`blockedOnDesktop`/`blockedOnTouch` for the
// Phase F / export path is unaffected by anything in this file. A caller that
// wants the mark-aware "accounted for" view composes it via
// `accountedForGate(gate, markedDesktop, markedTouch)` (or the
// `useAccountedForGate()` hook, ../hooks/useAccountedForGate.ts) — it does
// NOT thread marks into `inventoryCoverageGate()` itself.
//
// Marks are per-surface (desktop vs touch) — see surveySessionStore's own
// docstring for why a combined single set would be wrong (a character can be
// implemented on one surface and only deferred on the other).

import type { InventoryCoverageGate } from "./unimplementedInventory.ts";

/**
 * Result of {@link accountedForGate} — the mark-aware counterpart of
 * `InventoryCoverageGate`. "Unaccounted" means neither implemented nor
 * marked-for-later-review; every gallery Done-button / NavBar-indicator
 * consumer should read THESE fields, never `InventoryCoverageGate`'s raw
 * `unimplementedDesktop`/`unimplementedTouch` directly, once marks exist.
 */
export interface AccountedForGate {
  /** `gate.unimplementedDesktop` minus any character in `markedDesktop`. */
  readonly unaccountedDesktop: string[];
  /**
   * `gate.unimplementedTouch` minus any character in `markedTouch` — EXCEPT
   * when `gate.touchLayoutCorrupted` is true, in which case marks are
   * deliberately ignored and the full (fail-closed) uncovered set passes
   * through unchanged. A corrupted touch layout means the tool cannot
   * actually tell which characters are reachable, so a stale mark recorded
   * against a DIFFERENT (pre-corruption) layout must not be trusted to wave
   * the corrupted state through.
   */
  readonly unaccountedTouch: string[];
  readonly blockedOnDesktop: boolean;
  readonly blockedOnTouch: boolean;
  readonly blocked: boolean;
}

/**
 * Relax a list of not-yet-implemented characters by the author's per-surface
 * marks — `chars` minus anything present in `marked`. Pure, order-preserving.
 * Shared by {@link accountedForGate} and the two gallery components' own
 * local (mechanism/uncovered-scoped) mark-aware lists, so the "subtract
 * marks" rule has exactly one implementation.
 */
export function subtractMarked(chars: readonly string[], marked: ReadonlySet<string>): string[] {
  return chars.filter((c) => !marked.has(c));
}

/**
 * Compose an `InventoryCoverageGate` (the implemented-only truth — see that
 * module; UNCHANGED by this function) with the author's per-surface marks
 * into the "implemented-or-marked" view the gallery Done button and the
 * NavBar indicator need. Pure — no store reads.
 */
export function accountedForGate(
  gate: InventoryCoverageGate,
  markedDesktop: ReadonlySet<string>,
  markedTouch: ReadonlySet<string>,
): AccountedForGate {
  const unaccountedDesktop = subtractMarked(gate.unimplementedDesktop, markedDesktop);
  const unaccountedTouch = gate.touchLayoutCorrupted
    ? gate.unimplementedTouch
    : subtractMarked(gate.unimplementedTouch, markedTouch);
  const blockedOnDesktop = unaccountedDesktop.length > 0;
  const blockedOnTouch = gate.blockedOnTouch && unaccountedTouch.length > 0;
  return {
    unaccountedDesktop,
    unaccountedTouch,
    blockedOnDesktop,
    blockedOnTouch,
    blocked: blockedOnDesktop || blockedOnTouch,
  };
}
