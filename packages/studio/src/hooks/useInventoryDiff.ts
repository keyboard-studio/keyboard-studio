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
//     produced set (`buildProducedSet(startIr, ...)`, unchanged from before this
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
//     `buildSessionProducedSet(startIr, sessionAssignments, getPatternByIdSync)`
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
//   - baseProducedSetForWalk is memoized on startIr + inventory ONLY (object-
//     reference stable — the working-copy store never mutates startIr in
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
// startIr-null fallback: when startIr is null (working copy not yet instantiated),
// lettersToAdd === inventory (full alphabet) and alreadyProduced === [] — the
// gallery behaves exactly as it did before the diff was wired.

// Spec 063 FR-011 — the third array, and why this hook is EXTENDED rather than
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
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { selectDesktopAssignments } from "../lib/unimplementedInventory.ts";
import {
  baseProducedSetForWalk as computeBaseProducedSetForWalk,
  orphanedProducedSet,
  rawSessionProducedSet,
  sessionProducedSet,
  splitInventory,
  type InventoryDiff,
} from "../lib/inventoryDiff.ts";

// The pure pieces live in lib/inventoryDiff.ts (spec 107 FR-040); this hook
// memoizes each one separately over its own store slices.
export type { InventoryDiff };

/**
 * Derives the §8 inventory diff against the base keyboard's produced-glyph set.
 *
 * Both sides are NFC-normalized before comparison:
 *   - `buildProducedSet()` already returns NFC codepoints.
 *   - Each entry in `confirmedInventory` is normalized to NFC here so that a
 *     decomposed inventory entry (e.g. "é") correctly matches the
 *     precomposed "é" the base produces.
 *
 * When `startIr` is null the hook returns
 * `{ lettersToAdd: inventory, alreadyProduced: [], producedSet: empty set }`
 * — the caller sees no diff and the gallery works as before instantiation.
 */
export function useInventoryDiff(): InventoryDiff {
  const startIr = useWorkingCopyStore((s) => s.startIr);
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
    () => computeBaseProducedSetForWalk(startIr, inventory),
    [startIr, inventory],
  );

  // The orphaned delta, memoized SEPARATELY so the frozen arithmetic above is
  // visibly independent of it. Same options as the plain call, so the two views
  // are asked the same question and differ only in reachability.
  const orphanedSet = useMemo<Set<string>>(() => orphanedProducedSet(startIr), [startIr]);

  // SESSION-AWARE, PRE-AUGMENT — the raw round-trip, computed once and
  // exposed as `rawProducedSet` so other consumers (MechanismGallery's
  // `baseProducedSet`, TouchGallery's `desktopDirectProducedSet`) don't
  // redo it (perf dedup — km-synthesis).
  const rawProducedSet = useMemo<Set<string>>(
    () => rawSessionProducedSet(startIr, sessionAssignments),
    [startIr, sessionAssignments],
  );

  // SESSION-AWARE, augmented — returned as `producedSet` for
  // informational/gate consumers only (see module doc).
  const producedSet = useMemo<Set<string>>(
    () => sessionProducedSet(startIr, rawProducedSet, inventory),
    [startIr, inventory, rawProducedSet],
  );

  return useMemo<InventoryDiff>(
    () => splitInventory(startIr, inventory, baseProducedSetForWalk, orphanedSet, producedSet, rawProducedSet),
    [startIr, baseProducedSetForWalk, orphanedSet, producedSet, rawProducedSet, inventory],
  );
}
