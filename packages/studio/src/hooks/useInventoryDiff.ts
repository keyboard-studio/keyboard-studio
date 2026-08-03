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

import { useMemo } from "react";
import { augmentWithComposable, buildProducedSet } from "@keyboard-studio/contracts";
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

  return useMemo<InventoryDiff>(() => {
    if (baseIr === null) {
      return { lettersToAdd: lowercaseFirst(inventory), alreadyProduced: [] };
    }

    const lettersToAdd: string[] = [];
    const alreadyProduced: string[] = [];

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
      } else {
        lettersToAdd.push(raw);
      }
    }

    return { lettersToAdd: lowercaseFirst(lettersToAdd), alreadyProduced };
  }, [baseIr, producedSet, inventory]);
}
