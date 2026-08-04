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
// TWO produced sets, deliberately kept separate (shaped-bug fix, diacritic-
// implementability, see packages/engine/src/pattern-apply/sessionProducedSet.ts):
//
//   - `lettersToAdd`/`alreadyProduced` are computed from the STATIC, base-only
//     produced set (`buildProducedSet(baseIr, ...)`, unchanged from before this
//     fix) — this is the WALK's fixed denominator. It must NOT react to this
//     session's own assignments: MechanismGallery's `currentChar` is documented
//     as "does NOT auto-advance when a method is applied" and
//     `usePositionalCharNav`'s own doc guarantees Back/Next "never search for
//     the next uncovered/unconfigured character, so an already-handled
//     character is never silently skipped over". If `lettersToAdd` shrank the
//     INSTANT the author applied a mechanism to `currentChar`, that character
//     would vanish from the walk (or `usePositionalCharNav`'s `list` would
//     permanently lose it, breaking Back/Next for it) before the author could
//     review the case-pair companion banner or add a second mechanism — this
//     was caught by the existing companion-proposal test suite during this
//     fix's own regression pass.
//   - `producedSet` (the returned field) IS session-aware —
//     `buildSessionProducedSet(baseIr, sessionAssignments, getPatternByIdSync)`
//     augmented with composability — but is exposed ONLY for consumers that
//     need "is X reachable given everything this session has done" for
//     INFORMATIONAL or GATE purposes that don't drive walk membership:
//       - the criterion 18.6 completion gate (`unimplementedInventory.ts`'s
//         `unimplementedDesktopChars`/`inventoryCoverageGate`, wired via
//         `useInventoryCoverageGate`) — so the gate stops nagging for a
//         character (e.g. a precomposed "ӝ") that became typeable this
//         session via a DIFFERENT character's deadkey byproduct, without
//         ever needing its own recorded assignment.
//       - MechanismGallery's own `baseProducedSet` (composition-row feed,
//         read-only/informational, never touches lettersToAdd).
//       - TouchGallery's completion-gate re-check (`handleContinue`), NOT its
//         live `detectedChars`/`touchLettersToAdd` walk, for the identical
//         "must not reflow the walk mid-session" reason as above.
//
// Memoization:
//   - baseProducedSetForWalk is memoized on baseIr + inventory ONLY (object-
//     reference stable — the working-copy store never mutates baseIr in
//     place, it replaces the slot) — no dependency on session assignments, by
//     design (see above).
//   - producedSet (session-aware) is additionally memoized on this session's
//     physical assignments (selectDesktopAssignments(phaseResults)).
//   - Both are computed with `excludeBackspaceCorrections: true` so a char
//     reachable ONLY via a backspace-correction rule (e.g. a composed-char
//     store entry only reached by `+ [K_BKSP] > ...`) is not wrongly counted
//     as directly produced.
//   - NFC normalization: both produced sets are already NFC (buildProducedSet's
//     own contract); each confirmedInventory entry is NFC-normalized here
//     before lookup so a decomposed inventory entry (e.g. "é") correctly
//     matches the precomposed "é" the base might produce.
//   - Composability: each produced set is augmented via augmentWithComposable
//     (@keyboard-studio/contracts) so a precomposed inventory char (e.g.
//     U+00DB) is treated as already-produced when its base letter and
//     combining diacritic(s) are separately produced (canonical-NFD, one
//     level, no recursion — see that helper's doc comment).
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
import { buildSessionProducedSet } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { lowercaseFirst } from "../lib/caseOrder.ts";
import { selectDesktopAssignments } from "../lib/unimplementedInventory.ts";
import { getPatternByIdSync } from "../lib/services.ts";

export interface InventoryDiff {
  /**
   * Characters still needing mechanism assignment (coverage measured over
   * these) — stable-sorted lowercase-before-uppercase (see module doc and
   * lib/caseOrder.ts); the relative order of two entries of the same case (or
   * any non-letter entry) is unchanged from confirmedInventory. Computed from
   * the STATIC base-only produced set — see module doc for why this must not
   * react to this session's own assignments.
   */
  lettersToAdd: string[];
  /** Characters already produced by the base (informational display only). */
  alreadyProduced: string[];
  /**
   * The augmented, SESSION-AWARE produced-glyph set (NFC) — base .kmn PLUS
   * this session's physical assignments (see `buildSessionProducedSet`).
   * Informational/gate use ONLY — see module doc for why this must not be
   * used to compute `lettersToAdd`/`alreadyProduced`.
   */
  producedSet: ReadonlySet<string>;
  /**
   * The SESSION-AWARE produced-glyph set BEFORE composability augmentation —
   * i.e. the raw `buildSessionProducedSet(baseIr, sessionAssignments,
   * getPatternByIdSync)` result this hook already computes internally to
   * derive `producedSet`. Exposed so consumers that only need the
   * pre-augment set (MechanismGallery's `baseProducedSet` composition-row
   * feed, TouchGallery's `desktopDirectProducedSet`) don't re-run the same
   * expensive round-trip a second time per render — perf dedup, no behavior
   * change (same baseIr/sessionAssignments/getPatternByIdSync inputs as
   * before).
   */
  rawProducedSet: ReadonlySet<string>;
}

/**
 * Derives the §8 inventory diff against the base keyboard's produced-glyph set.
 *
 * Both sides are NFC-normalized before comparison:
 *   - `buildProducedSet()` already returns NFC codepoints.
 *   - Each entry in `confirmedInventory` is normalized to NFC here so that a
 *     decomposed inventory entry (e.g. "é") correctly matches the
 *     precomposed "é" the base produces.
 *
 * When `baseIr` is null the hook returns
 * `{ lettersToAdd: inventory, alreadyProduced: [], producedSet: empty set }`
 * — the caller sees no diff and the gallery works as before instantiation.
 */
export function useInventoryDiff(): InventoryDiff {
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const inventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);

  // This session's physical (desktop) assignments — the same selector
  // MechanismGallery/the coverage gate already use, so a mismatch between
  // "what this diff considers produced" and "what the gallery/gate consider
  // produced" can't arise from a different filter. Only feeds `producedSet`
  // (session-aware) below, never `baseProducedSetForWalk`.
  const sessionAssignments = useMemo(
    () => selectDesktopAssignments(phaseResults),
    [phaseResults],
  );

  // STATIC (base-only) — drives lettersToAdd/alreadyProduced. See module doc:
  // must NOT depend on sessionAssignments.
  const baseProducedSetForWalk = useMemo<Set<string>>(
    () =>
      baseIr !== null
        ? augmentWithComposable(
            buildProducedSet(baseIr, { excludeBackspaceCorrections: true }),
            inventory,
          )
        : new Set<string>(),
    [baseIr, inventory],
  );

  // SESSION-AWARE, PRE-AUGMENT — the raw round-trip, computed once and
  // exposed as `rawProducedSet` so other consumers (MechanismGallery's
  // `baseProducedSet`, TouchGallery's `desktopDirectProducedSet`) don't
  // redo it (perf dedup — km-synthesis).
  const rawProducedSet = useMemo<Set<string>>(
    () =>
      baseIr !== null
        ? buildSessionProducedSet(baseIr, sessionAssignments, getPatternByIdSync)
        : new Set<string>(),
    [baseIr, sessionAssignments],
  );

  // SESSION-AWARE, augmented — returned as `producedSet` for
  // informational/gate consumers only (see module doc).
  const producedSet = useMemo<Set<string>>(
    () => (baseIr !== null ? augmentWithComposable(rawProducedSet, inventory) : new Set<string>()),
    [baseIr, inventory, rawProducedSet],
  );

  return useMemo<InventoryDiff>(() => {
    if (baseIr === null) {
      return {
        lettersToAdd: lowercaseFirst(inventory),
        alreadyProduced: [],
        producedSet,
        rawProducedSet,
      };
    }

    const lettersToAdd: string[] = [];
    const alreadyProduced: string[] = [];

    for (const raw of inventory) {
      // NFC-normalize the inventory entry before lookup. producedSet is already
      // NFC, so a decomposed entry that NFC-rounds to a precomposed form will
      // correctly hit the set (e.g. "é" → "é" → hit if base produces "é").
      const nfc = raw.normalize("NFC");
      if (baseProducedSetForWalk.has(nfc)) {
        // Keep the raw (original) form in the result so callers can display the
        // inventory character as the author entered it, while the lookup used
        // the normalized form.
        alreadyProduced.push(raw);
      } else {
        lettersToAdd.push(raw);
      }
    }

    return {
      lettersToAdd: lowercaseFirst(lettersToAdd),
      alreadyProduced,
      producedSet,
      rawProducedSet,
    };
  }, [baseIr, baseProducedSetForWalk, producedSet, rawProducedSet, inventory]);
}
