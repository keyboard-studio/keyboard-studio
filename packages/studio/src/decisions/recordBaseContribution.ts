// recordBaseContribution — record what the working copy inherited at
// `choose_base` completion, as the baseline every later stage's counts are
// read against (specs/055-legible-decision-trail FR-030..FR-035, research
// D-11).
//
// ONE ENTRY, ONCE, FROM THE INSTANTIATED STORE — never a re-read of the base
// keyboard's source (FR-035). Every input arrives through an injected getter
// over the same `useWorkingCopyStore` state `CarveGallery` already reads
// (`baseKeyboard`, `baseIr`, `irAxes`, `instantiationMode`,
// `removalCapabilities`): describing the base's *source* would describe the
// base, not what the author actually started from, and the two can diverge
// once a track (adapt-existing vs. new-from-base) has applied.
//
// NO FABRICATED ZERO (research D-11). If the store shows no instantiated
// working copy at this instant — `baseKeyboard`, `baseIr`, or
// `instantiationMode` still at its pre-instantiation `null` — this writes NO
// ENTRY. A zero-key baseline would read as a real measurement of an empty
// keyboard; omission is the honest state.
//
// UNIT MATCH (FR-034). `startingKeyCount` is derived from `toRailNodes(baseIr,
// removalCapabilities)` in the same `nodes + items` unit `recordEditorStep`'s
// `keysRemoved` already reports (see that module's `DeletionCounts`), so a
// stage's removal count divides into this baseline. Deriving it any other way
// (e.g. `buildProducedSet` cardinality) would give a denominator the numerator
// can't be read against.

import type {
  BaseKeyboard,
  DiscoveryAxisVector,
  KeyboardIR,
  RemovalCapability,
} from "@keyboard-studio/contracts";
import { toRailNodes } from "../lib/irToCarveNodes.ts";
import type { DecisionEntryInput } from "./decisionLogStore.ts";

/**
 * The two literals `workingCopyStore`'s `InstantiationMode` can hold once
 * instantiation has happened (its `null` pre-instantiation state is handled
 * separately below — see {@link recordBaseContribution}).
 */
export type InstantiatedMode = "new-from-base" | "adapt-existing";

export interface RecordBaseContributionDeps {
  append: (input: DecisionEntryInput) => string | null;
  /** The chosen base, or `null` before instantiation. */
  getBaseKeyboard: () => BaseKeyboard | null;
  /** The base IR as instantiated, or `null` before instantiation. */
  getBaseIr: () => KeyboardIR | null;
  /** Axes the studio has derived onto the working copy so far. */
  getIrAxes: () => Partial<DiscoveryAxisVector>;
  /** `null` before instantiation; one of the two literals once instantiated. */
  getInstantiationMode: () => InstantiatedMode | null;
  /**
   * Same map `CarveGallery` reads to build its own rail (`toRailNodes`'s
   * second argument) — read here rather than defaulted, so a starting count
   * taken before capability analysis has run cannot silently disagree with
   * the one the carve gallery renders moments later.
   */
  getRemovalCapabilities: () => Map<string, RemovalCapability>;
}

/**
 * Total toggleable units in a base's starting layout, in the same
 * `nodes + items` unit `recordEditorStep`'s `keysRemoved` reports (FR-034).
 *
 * Mirrors `CarveGallery`'s own kept/total tally: every pattern/group
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
 * `baseId`/`baseDisplayName` are already their own `BaseContribution` fields
 * and are not repeated here; `id`/`path`/`sourceUrl`/`packageId` describe
 * where the base came from rather than what it left in the working copy, so
 * they stay out of this list.
 */
function inheritedMetadataOf(base: BaseKeyboard): { field: string; value: string }[] {
  return [
    { field: "script", value: base.script },
    { field: "targets", value: base.targets.join(", ") },
    { field: "version", value: base.version },
  ];
}

/**
 * Record the base's contribution at `choose_base` completion, once.
 *
 * @returns the new `entryId`, or `null` when the store shows no instantiated
 *   working copy yet (research D-11) — never a fabricated zero baseline.
 */
export function recordBaseContribution(deps: RecordBaseContributionDeps): string | null {
  const baseKeyboard = deps.getBaseKeyboard();
  const baseIr = deps.getBaseIr();
  const instantiationMode = deps.getInstantiationMode();

  // No instantiated working copy at this instant -> no entry, never a
  // fabricated zero (research D-11).
  if (baseKeyboard === null || baseIr === null || instantiationMode === null) {
    return null;
  }

  const startingKeyCount = countStartingKeys(baseIr, deps.getRemovalCapabilities());
  const derivedAxes = Object.keys(deps.getIrAxes());

  return deps.append({
    stepId: "choose_base",
    payload: {
      kind: "base-contribution",
      baseId: baseKeyboard.id,
      baseDisplayName: baseKeyboard.displayName,
      startingKeyCount,
      derivedAxes,
      inheritedMetadata: inheritedMetadataOf(baseKeyboard),
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
