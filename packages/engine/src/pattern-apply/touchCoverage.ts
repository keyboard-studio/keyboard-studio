/**
 * touchCoverage — thin engine-facing wrapper over the canonical
 * `computeTouchCoverage` traversal in @keyboard-studio/contracts (spec 035
 * FR-008/SC-003, review-gate item 1). The traversal itself — including
 * `U_<HEX>[_<HEX>]*` id decoding, reachable-layer BFS, and per-key char
 * collection (text/output/sk/flick/multitap, star-label exclusion) — lives in
 * contracts so the touch gallery (via this wrapper) and the
 * `KM_LINT_TOUCH_UNCOVERED` lint check (`@keymanapp/keyboard-lint`, which
 * cannot import this package) share one implementation.
 *
 * Preserves the pre-extraction public signature (`touchCoverage(layout,
 * inventory): TouchCoverageResult`) so existing engine consumers are unaffected.
 *
 * Unicode-composability augmentation
 * -----------------------------------
 * Applied HERE (the studio-facing engine wrapper), not inside
 * `computeTouchCoverage` itself: a precomposed inventory char (e.g. "Û") is
 * folded out of `uncovered` when its canonical-NFD components (base letter +
 * combining diacritic(s)) are all separately reachable on the touch layout —
 * see `augmentWithComposable` (@keyboard-studio/contracts). Both the
 * TouchGallery badge (`detectedChars`) and the FR-008 completion gate
 * (`handleContinue`) call this one wrapper, so they stay consistent. The
 * shared `computeTouchCoverage` traversal — and therefore the
 * `KM_LINT_TOUCH_UNCOVERED` Layer C lint check, which imports it directly and
 * cannot import this engine package (dependency-cruiser's
 * `lint-not-to-engine` rule) — is untouched and keeps its pre-existing
 * "directly reachable only" semantics.
 *
 * Session-produced components (shaped-bug fix, diacritic-implementability)
 * -------------------------------------------------------------------------
 * `additionalProduced` (optional) folds in glyphs this session's DESKTOP
 * physical assignments already produce (see `buildSessionProducedSet`) BEFORE
 * the composability augmentation above, so a touch inventory char that is
 * only composable because its combining-mark component was assigned a
 * desktop deadkey THIS session (e.g. "ж" + a session-assigned diaeresis
 * deadkey composing "ӝ") is folded out of `uncovered` too — not just the
 * pre-existing base-keyboard producers. Callers that have no session-aware
 * produced set (e.g. `KM_LINT_TOUCH_UNCOVERED`, which never reaches this
 * wrapper anyway) simply omit the parameter and get the prior behavior.
 *
 * @see specs/035-mobile-touch-derivation/contracts/simplification.md
 */

import type { TouchLayoutIR, TouchCoverageResult } from "@keyboard-studio/contracts";
import { augmentWithComposable, computeTouchCoverage } from "@keyboard-studio/contracts";

export type { TouchCoverageResult } from "@keyboard-studio/contracts";

/**
 * Compute inventory characters with no reachable touch-layout producer —
 * directly reachable OR composable (canonical-NFD, one level, no recursion)
 * from chars that are directly reachable OR in `additionalProduced`.
 *
 * @param additionalProduced - Optional session-produced-glyph set (NFC),
 *   e.g. from `buildSessionProducedSet` over this session's desktop physical
 *   assignments — folded into `covered` before the composability check. See
 *   the module doc comment.
 *
 * Pure: no mutation of `layout`/`inventory`/`additionalProduced`, no I/O.
 */
export function touchCoverage(
  layout: TouchLayoutIR,
  inventory: readonly string[],
  additionalProduced?: ReadonlySet<string>,
): TouchCoverageResult {
  const { uncovered } = computeTouchCoverage(layout, inventory);
  const uncoveredSet = new Set(uncovered);

  // Directly-covered chars, NFC-normalized — matches the NFC form
  // computeTouchCoverage itself compares against internally.
  const covered = new Set<string>(
    inventory.filter((ch) => !uncoveredSet.has(ch)).map((ch) => ch.normalize("NFC")),
  );
  if (additionalProduced !== undefined) {
    for (const ch of additionalProduced) covered.add(ch);
  }

  const augmented = augmentWithComposable(covered, inventory);

  const stillUncovered = inventory.filter((ch) => !augmented.has(ch.normalize("NFC")));

  return { uncovered: stillUncovered };
}
