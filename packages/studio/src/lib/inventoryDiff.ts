// inventoryDiff — the pure pieces of the §8 inventory diff (alphabet minus
// base-produced glyphs), lifted out of hooks/useInventoryDiff.ts (spec 107
// FR-040) so the hook and the headless author compute it with the same code.
// The hook memoizes each piece separately; deriveInventoryDiff composes them
// for a one-shot read. See the hook's module doc for why there are TWO
// produced sets and which feeds what.

import type { KeyboardIR, MechanismAssignment, SurveyPhaseResult } from "@keyboard-studio/contracts";
import {
  augmentWithComposable,
  buildProducedSet,
  buildReachableProducedSet,
} from "@keyboard-studio/contracts";
import { buildSessionProducedSet } from "@keyboard-studio/engine";
import { lowercaseFirst } from "./caseOrder.ts";
import {
  inventoryCoverageGate,
  selectDesktopAssignments,
  type InventoryCoverageGate,
  type InventoryCoverageInputs,
} from "./unimplementedInventory.ts";
import { getPatternByIdSync } from "./services.ts";

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
   * Inventory characters the base's RULES produce but that no reachable key can
   * actually type (spec 063 FR-011) — the honest delta between the two
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
  /**
   * The augmented, SESSION-AWARE produced-glyph set (NFC) — base .kmn PLUS
   * this session's physical assignments (see `buildSessionProducedSet`).
   * Informational/gate use ONLY — see module doc for why this must not be
   * used to compute `lettersToAdd`/`alreadyProduced`.
   */
  producedSet: ReadonlySet<string>;
  /**
   * The SESSION-AWARE produced-glyph set BEFORE composability augmentation —
   * i.e. the raw `buildSessionProducedSet(startIr, sessionAssignments,
   * getPatternByIdSync)` result this hook already computes internally to
   * derive `producedSet`. Exposed so consumers that only need the
   * pre-augment set (MechanismGallery's `baseProducedSet` composition-row
   * feed, TouchGallery's `desktopDirectProducedSet`) don't re-run the same
   * expensive round-trip a second time per render — perf dedup, no behavior
   * change (same startIr/sessionAssignments/getPatternByIdSync inputs as
   * before).
   */
  rawProducedSet: ReadonlySet<string>;
}

/** STATIC (base-only) — drives lettersToAdd/alreadyProduced; never session-aware. */
export function baseProducedSetForWalk(startIr: KeyboardIR | null, inventory: readonly string[]): Set<string> {
  return startIr !== null
    ? augmentWithComposable(buildProducedSet(startIr, { excludeBackspaceCorrections: true }), inventory)
    : new Set<string>();
}

/**
 * The orphaned delta (spec 063 FR-011). Same options as the plain produced
 * set, so the two views are asked the same question and differ only in
 * reachability.
 */
export function orphanedProducedSet(startIr: KeyboardIR | null): Set<string> {
  return startIr !== null
    ? buildReachableProducedSet(startIr, { excludeBackspaceCorrections: true }).orphaned
    : new Set<string>();
}

/** SESSION-AWARE, PRE-AUGMENT: the base .kmn plus this session's physical assignments. */
export function rawSessionProducedSet(
  startIr: KeyboardIR | null,
  sessionAssignments: readonly MechanismAssignment[],
): Set<string> {
  return startIr !== null
    ? buildSessionProducedSet(startIr, sessionAssignments, getPatternByIdSync)
    : new Set<string>();
}

/** SESSION-AWARE, augmented — for informational/gate consumers only. */
export function sessionProducedSet(
  startIr: KeyboardIR | null,
  rawProducedSet: Set<string>,
  inventory: readonly string[],
): Set<string> {
  return startIr !== null ? augmentWithComposable(rawProducedSet, inventory) : new Set<string>();
}

/** Split the inventory against the base-only produced set (NFC lookup, raw form kept). */
export function splitInventory(
  startIr: KeyboardIR | null,
  inventory: readonly string[],
  baseProduced: ReadonlySet<string>,
  orphaned: ReadonlySet<string>,
  producedSet: ReadonlySet<string>,
  rawProducedSet: ReadonlySet<string>,
): InventoryDiff {
  if (startIr === null) {
    // The startIr-null fallback must return ALL THREE arrays (FR-011): a caller
    // destructuring `producedButUnreachable` here would otherwise read
    // `undefined` before instantiation and throw on `.length`.
    return {
      lettersToAdd: lowercaseFirst(inventory),
      alreadyProduced: [],
      producedButUnreachable: [],
      producedSet,
      rawProducedSet,
    };
  }

  const lettersToAdd: string[] = [];
  const alreadyProduced: string[] = [];
  const producedButUnreachable: string[] = [];

  for (const raw of inventory) {
    // NFC-normalize the inventory entry before lookup. producedSet is already
    // NFC, so a decomposed entry that NFC-rounds to a precomposed form will
    // correctly hit the set (e.g. "é" → "é" → hit if base produces "é").
    const nfc = raw.normalize("NFC");
    if (baseProduced.has(nfc)) {
      // Keep the raw (original) form in the result so callers can display the
      // inventory character as the author entered it, while the lookup used
      // the normalized form.
      alreadyProduced.push(raw);
      // ADDITIVE: also reported as unreachable when the ONLY thing producing it
      // is an unreachable-key rule. Note this does NOT remove it from
      // `alreadyProduced` — that is precisely the point of extending rather
      // than switching (see the hook's module doc).
      if (orphaned.has(nfc)) producedButUnreachable.push(raw);
    } else {
      lettersToAdd.push(raw);
    }
  }

  return {
    lettersToAdd: lowercaseFirst(lettersToAdd),
    alreadyProduced,
    producedButUnreachable,
    producedSet,
    rawProducedSet,
  };
}

/** The whole diff in one call, composed from the same pieces the hook memoizes. */
export function deriveInventoryDiff(inputs: {
  startIr: KeyboardIR | null;
  inventory: readonly string[];
  phaseResults: readonly SurveyPhaseResult[];
}): InventoryDiff {
  const { startIr, inventory } = inputs;
  const raw = rawSessionProducedSet(startIr, selectDesktopAssignments(inputs.phaseResults));
  return splitInventory(
    startIr,
    inventory,
    baseProducedSetForWalk(startIr, inventory),
    orphanedProducedSet(startIr),
    sessionProducedSet(startIr, raw, inventory),
    raw,
  );
}

/** The working-copy slices the Phase F coverage gate reads. */
export interface CoverageGateSlices {
  touchLayoutJson: string | null;
  confirmedInventory: readonly string[];
  alphabet?: InventoryCoverageInputs["alphabet"];
  marksWorklist?: InventoryCoverageInputs["marksWorklist"];
}

/**
 * The Phase F coverage gate over a computed diff: the composition
 * hooks/useInventoryCoverageGate memoizes, lifted (spec 107 FR-040).
 */
export function coverageGateFrom(
  desktopAssignments: readonly MechanismAssignment[],
  diff: Pick<InventoryDiff, "lettersToAdd" | "producedSet">,
  slices: CoverageGateSlices,
): InventoryCoverageGate {
  return inventoryCoverageGate({
    desktopAssignments,
    lettersToAdd: diff.lettersToAdd,
    touchLayoutJson: slices.touchLayoutJson,
    confirmedInventory: slices.confirmedInventory,
    desktopProducedSet: diff.producedSet,
    ...(slices.alphabet !== undefined ? { alphabet: slices.alphabet } : {}),
    ...(slices.marksWorklist !== undefined ? { marksWorklist: slices.marksWorklist } : {}),
  });
}

/** The whole coverage gate in one call over a working-copy state snapshot. */
export function deriveInventoryCoverageGate(state: {
  startIr: KeyboardIR | null;
  phaseResults: readonly SurveyPhaseResult[];
  touchLayoutJson: string | null;
  session: Omit<CoverageGateSlices, "touchLayoutJson">;
}): InventoryCoverageGate {
  const diff = deriveInventoryDiff({
    startIr: state.startIr,
    inventory: state.session.confirmedInventory,
    phaseResults: state.phaseResults,
  });
  return coverageGateFrom(selectDesktopAssignments(state.phaseResults), diff, {
    touchLayoutJson: state.touchLayoutJson,
    confirmedInventory: state.session.confirmedInventory,
    ...(state.session.alphabet !== undefined ? { alphabet: state.session.alphabet } : {}),
    ...(state.session.marksWorklist !== undefined ? { marksWorklist: state.session.marksWorklist } : {}),
  });
}
