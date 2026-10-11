// recordStartContribution — record what the working copy inherited at
// `choose_base` completion, as the baseline every later stage's counts are
// read against (specs/055-legible-decision-trail FR-030..FR-035, research
// D-11).
//
// ONE ENTRY, ONCE, FROM THE INSTANTIATED STORE — never a re-read of the base
// keyboard's source (FR-035). Every input arrives through an injected getter
// over the same `useWorkingCopyStore` state the carve gallery already reads
// (`startKeyboard`, `startIr`, `irAxes`, `instantiationMode`,
// `removalCapabilities`): describing the base's *source* would describe the
// base, not what the author actually started from, and the two can diverge
// once a track (adapt-existing vs. new-from-base) has applied.
//
// NO FABRICATED ZERO (research D-11). If the store shows no instantiated
// working copy at this instant — `startKeyboard`, `startIr`, or
// `instantiationMode` still at its pre-instantiation `null` — this writes NO
// ENTRY. A zero-key baseline would read as a real measurement of an empty
// keyboard; omission is the honest state.
//
// UNIT MATCH (FR-034). `startingKeyCount` is derived from `toRailNodes(startIr,
// removalCapabilities)` in the same `nodes + items` unit `recordEditorStep`'s
// `keysRemoved` already reports (see that module's `DeletionCounts`), so a
// stage's removal count divides into this baseline. Deriving it any other way
// (e.g. `buildProducedSet` cardinality) would give a denominator the numerator
// can't be read against.

import type {
  StartKeyboard,
  DiscoveryAxisVector,
  KeyboardIR,
  RemovalCapability,
} from "@keyboard-studio/contracts";
import { toRailNodes } from "../lib/irToCarveNodes.ts";
import type { DecisionEntryInput } from "./decisionLogStore.ts";

/**
 * The two literals `workingCopyStore`'s `InstantiationMode` can hold once
 * instantiation has happened (its `null` pre-instantiation state is handled
 * separately below — see {@link recordStartContribution}).
 */
export type InstantiatedMode = "new-from-base" | "adapt-existing";

export interface RecordStartContributionDeps {
  append: (input: DecisionEntryInput) => string | null;
  /** The chosen base, or `null` before instantiation. */
  getStartKeyboard: () => StartKeyboard | null;
  /** The base IR as instantiated, or `null` before instantiation. */
  getStartIr: () => KeyboardIR | null;
  /** Axes the studio has derived onto the working copy so far. */
  getIrAxes: () => Partial<DiscoveryAxisVector>;
  /** `null` before instantiation; one of the two literals once instantiated. */
  getInstantiationMode: () => InstantiatedMode | null;
  /**
   * Same map the carve gallery reads to build its rail nodes (`toRailNodes`'s
   * second argument, via irToCharacterView) — read here rather than defaulted, so a starting count
   * taken before capability analysis has run cannot silently disagree with
   * the one the carve gallery renders moments later.
   */
  getRemovalCapabilities: () => Map<string, RemovalCapability>;
}

/**
 * Total toggleable units in a base's starting layout, in the same
 * `nodes + items` unit `recordEditorStep`'s `keysRemoved` reports (FR-034).
 *
 * Mirrors the rule/node carve gallery's kept/total tally: every pattern/group
 * `CarveNode`'s `glyphs` entry is one toggleable unit, whether its `gid`
 * addresses a whole rule node or one fan-out store item — the same flat count
 * `deletedNodeIds.size + deletedItemIds.size` accumulates from the deletion
 * side. Store nodes' `storeChips` surface the SAME underlying items a second
 * time (their chip ids coincide with the output-store fan-out glyph gids by
 * contract — see irToCarveNodes.ts's gid-contract comment), so they are
 * deliberately not added again here; doing so would double-count every output
 * store.
 */
function countStartingKeys(
  ir: KeyboardIR,
  capabilities: Map<string, RemovalCapability>,
): number {
  let total = 0;
  for (const node of toRailNodes(ir, capabilities)) {
    total += node.glyphs?.length ?? 0;
  }
  return total;
}

/**
 * The base's own properties carried onto the working copy as-is, coded for
 * catalog rendering rather than as prose here (FR-008).
 *
 * `startId`/`baseDisplayName` are already their own `StartContribution` fields
 * and are not repeated here; `id`/`path`/`sourceUrl`/`packageId` describe
 * where the base came from rather than what it left in the working copy, so
 * they stay out of this list.
 */
function inheritedMetadataOf(base: StartKeyboard): { field: string; value: string }[] {
  return [
    { field: "script", value: base.script },
    { field: "targets", value: base.targets.join(", ") },
    { field: "version", value: base.version },
  ];
}

/**
 * Record the base's contribution, once per instantiation. Fired by
 * StudioShell's doCommit (via the recorder's `recordStartContributionNow`)
 * immediately after instantiation produces the working copy — NOT at
 * `choose_base` completion, which precedes instantiation on the live
 * flow (spec 093 final pass; the completion-time fire read an empty
 * store and wrote nothing).
 *
 * @returns the new `entryId`, or `null` when the store shows no instantiated
 *   working copy yet (research D-11) — never a fabricated zero baseline.
 */
export function recordStartContribution(deps: RecordStartContributionDeps): string | null {
  const startKeyboard = deps.getStartKeyboard();
  const startIr = deps.getStartIr();
  const instantiationMode = deps.getInstantiationMode();

  // No instantiated working copy at this instant -> no entry, never a
  // fabricated zero (research D-11).
  if (startKeyboard === null || startIr === null || instantiationMode === null) {
    return null;
  }

  const startingKeyCount = countStartingKeys(startIr, deps.getRemovalCapabilities());
  const derivedAxes = Object.keys(deps.getIrAxes());

  return deps.append({
    stepId: "choose_base",
    payload: {
      kind: "base-contribution",
      startId: startKeyboard.id,
      baseDisplayName: startKeyboard.displayName,
      startingKeyCount,
      derivedAxes,
      inheritedMetadata: inheritedMetadataOf(startKeyboard),
      instantiationMode,
    },
    // Every value in this payload literally comes from the base, not the
    // author, so "base-derived" is the accurate agency here — the same
    // agency/source pair (`"base-derived"` + `source: "base"`) FR-032 wires
    // `recordSurveyAnswers`'s `resolveProposal` seam to reach for an answer
    // carried from the base. Distinct entities (research D-11's provenance
    // section), same vocabulary.
    provenance: { agency: "base-derived", source: "base" },
  });
}
