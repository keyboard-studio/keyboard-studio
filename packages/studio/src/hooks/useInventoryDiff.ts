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
//   - producedSet is memoized on baseIr (object-reference stable because the
//     working-copy store never mutates baseIr in place — it replaces the slot).
//   - lettersToAdd / alreadyProduced are memoized on producedSet + inventory.
//   - NFC normalization: producedSet from buildProducedSet() is already NFC;
//     each confirmedInventory entry is NFC-normalized here before lookup so that
//     a decomposed inventory entry (e.g. "é") correctly matches the
//     precomposed "é" (U+00E9) the base might produce.
//
// baseIr-null fallback: when baseIr is null (working copy not yet instantiated),
// lettersToAdd === inventory (full alphabet) and alreadyProduced === [] — the
// gallery behaves exactly as it did before the diff was wired.

import { useMemo } from "react";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

export interface InventoryDiff {
  /** Characters still needing mechanism assignment (coverage measured over these). */
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
    () => (baseIr !== null ? buildProducedSet(baseIr) : new Set<string>()),
    [baseIr],
  );

  return useMemo<InventoryDiff>(() => {
    if (baseIr === null) {
      return { lettersToAdd: inventory, alreadyProduced: [] };
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

    return { lettersToAdd, alreadyProduced };
  }, [baseIr, producedSet, inventory]);
}
