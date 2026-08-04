// useInventoryDiff — §8 inventory diff: alphabet minus base-produced glyphs.
//
// Computes the diff between the author's confirmed inventory and the set of
// glyphs the base keyboard already produces. The mechanism gallery should only
// need to handle letters the base does NOT already output.
//
// Spec reference: §8 "Inventory — character discovery, diffed against the base
// output set." The coverage indicator (criterion 18.6) must denominate over
// lettersToAdd, not the full confirmedInventory — otherwise the author is
// evaluated on re-handling letters the base already types.
//
// Memoization:
//   - producedSet is memoized on baseIr + inventory (object-reference stable
//     because the working-copy store never mutates baseIr in place — it
//     replaces the slot). Computed with `excludeBackspaceCorrections: true` so
//     a char reachable ONLY via a backspace-correction rule (e.g. a
//     composed-char store entry only reached by `+ [K_BKSP] > ...`) is not
//     wrongly counted as directly produced — this lets MechanismGallery's
//     `collectCompositionMethod` synthesize the real composition path for
//     such a char instead of falling through to a generic floor.
//   - lettersToAdd / alreadyProduced are memoized on producedSet + inventory.
//   - NFC normalization: producedSet from buildProducedSet() is already NFC;
//     each confirmedInventory entry is NFC-normalized here before lookup so that
//     a decomposed inventory entry (e.g. "é") correctly matches the
//     precomposed "é" (U+00E9) the base might produce.
//   - Composability: producedSet is augmented via augmentWithComposable
//     (@keyboard-studio/contracts) so a precomposed inventory char (e.g.
//     U+00DB) is treated as already-produced when its base letter and
//     combining diacritic(s) are separately produced (canonical-NFD, one
//     level, no recursion — see that helper's doc comment). This both greens
//     the badge and removes the char from lettersToAdd, so the completion
//     gate no longer nags for a char the keyboard can already type.
//   - Lowercase-first ordering: lettersToAdd is stable-sorted so every
//     lowercase letter (`\p{Ll}`) walks before any uppercase letter
//     (`\p{Lu}`) — Array.prototype.sort is spec-stable (ES2019+), so ties
//     (same rank — two lowercase letters, two uppercase letters, or any
//     non-letter entry) keep their original confirmedInventory order. This is
//     purely a walk-order concern: it is NOT a second casing-derivation path
//     (the engine's `caseCounterpart` is untouched — this only asks "is this
//     one \p{Lu}?", never derives a counterpart) and does not change set
//     membership. It exists so that when a lowercase letter and its uppercase
//     counterpart are both in lettersToAdd, the lowercase is always
//     implemented first — the precondition the case-pair companion
//     (casePairCompanion.ts) needs to have something to propose a shift-layer
//     placement for (see that module's doc; the companion only ever proposes
//     lower->upper, never the reverse).
//
// baseIr-null fallback: when baseIr is null (working copy not yet instantiated),
// lettersToAdd === inventory (full alphabet) and alreadyProduced === [] — the
// gallery behaves exactly as it did before the diff was wired.

// Spec 058 FR-011 — the third array, and why this hook is EXTENDED rather than
// switched to the reachability-aware view.
//
// `buildReachableProducedSet` would move a character produced only by an
// unreachable rule out of `alreadyProduced` and into `lettersToAdd`. That is
// arguably "more correct", and it is still the wrong change to make here: it
// would silently increase author workload on the ~205 corpus bases that carry an
// orphan rule, and it would move the §18.6 coverage denominator underneath a
// figure authors and tests both read. So `lettersToAdd` / `alreadyProduced`
// arithmetic is UNTOUCHED, and the honest delta is surfaced as a third array the
// UI can explain in its own words: "the base declares a rule for X but no key
// reaches it."

import { useMemo } from "react";
import {
  augmentWithComposable,
  buildProducedSet,
  buildReachableProducedSet,
} from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { lowercaseFirst } from "../lib/caseOrder.ts";

export interface InventoryDiff {
  /**
   * Characters still needing mechanism assignment (coverage measured over
   * these) — stable-sorted lowercase-before-uppercase (see module doc and
   * lib/caseOrder.ts); the relative order of two entries of the same case (or
   * any non-letter entry) is unchanged from confirmedInventory.
   */
  lettersToAdd: string[];
  /** Characters already produced by the base (informational display only). */
  alreadyProduced: string[];
  /**
   * Inventory characters the base's RULES produce but that no reachable key can
   * actually type (spec 058 FR-011) — the honest delta between the two
   * producibility views.
   *
   * A strict SUBSET of `alreadyProduced`: these characters still count as
   * produced for every existing arithmetic, deliberately, so adding this array
   * moved no author's workload and no coverage denominator. It exists so the UI
   * can say what is true — the base declares a rule for this character but no
   * key reaches it — instead of the author discovering it at compile time.
   *
   * Empty when the base has no touch layout, because then nothing is
   * layout-unreachable.
   */
  producedButUnreachable: string[];
}

/**
 * Derives the §8 inventory diff against the base keyboard's produced-glyph set.
 *
 * Both sides are NFC-normalized before comparison:
 *   - `buildProducedSet()` already returns NFC codepoints.
 *   - Each entry in `confirmedInventory` is normalized to NFC here so that a
 *     decomposed inventory entry (e.g. "é") correctly matches the
 *     precomposed "é" the base produces.
 *
 * When `baseIr` is null the hook returns `{ lettersToAdd: inventory, alreadyProduced: [] }`
 * — the caller sees no diff and the gallery works as before instantiation.
 */
export function useInventoryDiff(): InventoryDiff {
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);

  const producedSet = useMemo<Set<string>>(
    () =>
      baseIr !== null
        ? augmentWithComposable(
            buildProducedSet(baseIr, { excludeBackspaceCorrections: true }),
            inventory,
          )
        : new Set<string>(),
    [baseIr, inventory],
  );

  // The orphaned delta, memoized SEPARATELY so the frozen arithmetic above is
  // visibly independent of it. Same options as the plain call, so the two views
  // are asked the same question and differ only in reachability.
  const orphanedSet = useMemo<Set<string>>(
    () =>
      baseIr !== null
        ? buildReachableProducedSet(baseIr, { excludeBackspaceCorrections: true }).orphaned
        : new Set<string>(),
    [baseIr],
  );

  return useMemo<InventoryDiff>(() => {
    if (baseIr === null) {
      // The baseIr-null fallback must return ALL THREE arrays (FR-011): a caller
      // destructuring `producedButUnreachable` here would otherwise read
      // `undefined` before instantiation and throw on `.length`.
      return {
        lettersToAdd: lowercaseFirst(inventory),
        alreadyProduced: [],
        producedButUnreachable: [],
      };
    }

    const lettersToAdd: string[] = [];
    const alreadyProduced: string[] = [];
    const producedButUnreachable: string[] = [];

    for (const raw of inventory) {
      // NFC-normalize the inventory entry before lookup. producedSet is already
      // NFC, so a decomposed entry that NFC-rounds to a precomposed form will
      // correctly hit the set (e.g. "é" → "é" → hit if base produces "é").
      const nfc = raw.normalize("NFC");
      if (producedSet.has(nfc)) {
        // Keep the raw (original) form in the result so callers can display the
        // inventory character as the author entered it, while the lookup used
        // the normalized form.
        alreadyProduced.push(raw);
        // ADDITIVE: also reported as unreachable when the ONLY thing producing it
        // is an unreachable-key rule. Note this does NOT remove it from
        // `alreadyProduced` — that is precisely the point of extending rather
        // than switching (see the note at the top of this file).
        if (orphanedSet.has(nfc)) producedButUnreachable.push(raw);
      } else {
        lettersToAdd.push(raw);
      }
    }

    return {
      lettersToAdd: lowercaseFirst(lettersToAdd),
      alreadyProduced,
      producedButUnreachable,
    };
  }, [baseIr, producedSet, orphanedSet, inventory]);
}
