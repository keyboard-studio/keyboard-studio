// mechanismPlacement -- the mechanism step's placement decisions, as pure
// functions (spec 107 FR-040).
//
// Lifted out of MechanismGallery so a headless caller reads the same offers
// and applies the same writes as the Add-a-key card, the suggestion chips and
// the two banners. The component calls every function here; it holds no
// second copy. Nothing in this module reads a store or holds state: each
// function takes the render-time values the handler closed over and returns
// what the handler then did (record, raise a proposal) as data.
//
// Sequencing contract (the order the handlers ran in, unchanged):
//   companionBefore -> record assignment -> displacement -> companionAfter.
// Every proposal and displacement is derived from the PRE-record state
// (`sessionAssignments`, `slotOccupancy` as rendered), exactly as before.

import type {
  KeyboardIR,
  MechanismAssignment,
  MechanismRef,
  PlacementMap,
} from "@keyboard-studio/contracts";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import {
  buildCasePairRuleLines,
  buildShiftRuleLines,
  canonicalizeCombo,
  comboToKeySpec,
  isMnemonicLayout,
  type ModifierToken,
} from "@keyboard-studio/engine";
import {
  getRankedSuggestionsForChar,
  PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
  type PlacementSeedEntry,
} from "../../survey/placementSeeds.ts";
import {
  assignmentSlotKeys,
  displacedFor,
  isProducedOnOtherSlot,
  isStillNeeded,
  mechanismSlotEntries,
  orthographyTier,
  slotKeyFor,
  type DisplacementAction,
  type NeedSets,
  type SlotOccupant,
} from "../../survey/slotOccupancy.ts";
import { scoreCandidate, type ScoredCandidate } from "../../survey/placementRationale.ts";
import { collateInventory } from "../../survey/collation.ts";
import { nfcDedup } from "../../survey/charNormUtils.ts";
import {
  resolveCharInput,
  resolveKeyPickerSelection,
  resolvedVkeyOf,
  type ResolveCharInputOptions,
} from "../../lib/charInput.ts";
import { getProducerBadge } from "./parts/charMechanisms.ts";
import { orderVisibleSuggestions } from "./suggestionOrder.ts";
import {
  TRIGGER_KEY_RESOLVE_OPTIONS,
  assignmentFromSuggestion,
  buildDeadkeyAssignment,
  deadkeyPlacementFor,
  demotionAssignmentFor,
  swapAssignmentFor,
} from "./assignmentFromSuggestion.ts";
import { s02BaseClash } from "./deadkeyPurpose.ts";
import { hasSequenceForChar, partitionSequenceAssignment, type SequenceApplied } from "./sequenceApply.ts";
import type { CasePairProposal, CasePairProposalInput } from "./casePairCompanion.ts";
import type { DisplacementProposal, DisplacementProposalInput } from "./useDisplacementProposal.ts";
import {
  PATTERN_RALT,
  PATTERN_SEQUENCE,
  PATTERN_SWAP,
  isDeadkeyPatternId,
} from "./patternIds.ts";

// ---------------------------------------------------------------------------
// Walk list and covered view
// ---------------------------------------------------------------------------

/**
 * The characters the placement walk visits: the flat diff's letters to add
 * (NFC-deduped) intersected with the upstream placement set, collated. The
 * coverage denominator (the flat inventory) is never widened or narrowed by
 * this.
 */
export function placementWalkList(
  inventoryLettersToAdd: readonly string[],
  placementInventory: readonly string[],
  loanwordSet: ReadonlySet<string>,
): string[] {
  const deduped = nfcDedup([], [...inventoryLettersToAdd]);
  const placementSet = new Set(placementInventory.map((c) => c.normalize("NFC")));
  const filtered = deduped.filter((c) => placementSet.has(c.normalize("NFC")));
  return collateInventory(filtered, loanwordSet);
}

/**
 * Assignments with the sequence (S-03) dimension excluded: a sequence is
 * tracked separately from the other mechanisms, so an assignment made up
 * entirely of sequence mechanisms is dropped and a mixed one keeps just its
 * non-sequence mechanisms. The gallery's covered/applied view reads this.
 */
export function excludeSequenceMechanisms(assignments: MechanismAssignment[]): MechanismAssignment[] {
  const result: MechanismAssignment[] = [];
  for (const a of assignments) {
    if (a.scope !== "individual") {
      result.push(a);
      continue;
    }
    const nonSequence = a.mechanisms.filter((m) => m.patternId !== PATTERN_SEQUENCE);
    if (nonSequence.length === 0) continue;
    result.push(nonSequence.length === a.mechanisms.length ? a : { ...a, mechanisms: nonSequence });
  }
  return result;
}

/**
 * The PRISTINE base-only produced set (the badge's base-direct signal): no
 * session assignments folded in. Backspace-correction-only producers are
 * excluded, matching every other base-produced-set caller.
 */
export function baseOnlyProducedSetFor(startIr: KeyboardIR | null): Set<string> {
  return startIr !== null ? buildProducedSet(startIr, { excludeBackspaceCorrections: true }) : new Set<string>();
}

/** The need sets the occupancy rationale and the displacement check read. */
export function buildNeedSets(rawInventory: readonly string[], baseProducedSet: ReadonlySet<string>): NeedSets {
  return {
    confirmedInventory: new Set(rawInventory.map((c) => c.normalize("NFC"))),
    baseProducedSet,
  };
}

/**
 * Shift-layer targeting is disallowed for mnemonic keyboards (a SHIFT-flagged
 * rule would double-apply shift there); it also gates the case-pair companion
 * prompt on the physical mechanism.
 */
export function shiftLayerAllowedFor(workingIr: KeyboardIR | null): boolean {
  return workingIr !== null && !isMnemonicLayout(workingIr);
}

/**
 * The deadkey card's base-letter box options. Takes an optional i18n and
 * resolves via msg()/resolveMessage() rather than a bare `t` parameter —
 * Lingui's macro tracks the specific binding introduced by useLingui(), so a
 * re-bound `t` is a distinct binding the extractor does not follow (see
 * resolveMessage in lib/i18nResolve.ts). A headless caller passes no i18n.
 */
export function buildDeadkeyBaseLetterResolveOptions(
  i18n?: I18n,
): ResolveCharInputOptions {
  return {
    multiToken: true,
    singleGrapheme: true,
    blockDelimiters: true,
    singleGraphemeReason: resolveMessage(
      i18n,
      msg({
        id: "editor.assignLoop.deadkeySingleGraphemeReason",
        message:
          "Enter one base character. (Covering several base letters with one dead key is coming later.)",
      }),
    ),
  };
}

/**
 * The forward gate: an untouched character needs EITHER an explicit Apply OR
 * an explicit "Mark for later review" before Next/Done is enabled; revisiting
 * an already-covered or marked character always re-enables it. The walk
 * cannot advance forward past a character that is none of these.
 */
export function canGoNextFor(
  currentChar: string | null,
  mechanismAssignments: readonly MechanismAssignment[],
  sessionAssignments: MechanismAssignment[],
  markedForLater: ReadonlySet<string>,
): boolean {
  if (currentChar === null) return false;
  const applied = mechanismAssignments.filter((a) => a.scope === "individual" && a.target === currentChar).length;
  return applied > 0 || hasSequenceForChar(sessionAssignments, currentChar) || markedForLater.has(currentChar);
}

// ---------------------------------------------------------------------------
// The suggestion chip row
// ---------------------------------------------------------------------------

export const dismissedSuggestionEntryKey = (char: string, strategyId: string): string =>
  `${char}::${strategyId}`;

export interface PlacementOfferInputs {
  currentChar: string | null;
  placementMap: PlacementMap | undefined;
  /** The identity's BCP 47 tag; "" and undefined both mean "no locale". */
  bcp47: string | undefined;
  sessionAssignments: MechanismAssignment[];
  /** `sessionAssignments` through {@link excludeSequenceMechanisms}. */
  mechanismAssignments: MechanismAssignment[];
  /** `dismissedSuggestionEntryKey` entries for chips dismissed without recording. */
  dismissedEntries: ReadonlySet<string>;
  /** True once the whole row was Denied for `currentChar`. */
  rowDismissed: boolean;
  slotOccupancy: ReadonlyMap<string, SlotOccupant>;
  needSets: NeedSets;
  workingIr: KeyboardIR | null;
  baseOnlyProducedSet: ReadonlySet<string>;
  baseProducedSet: ReadonlySet<string>;
}

export interface PlacementOffer {
  /** Ranked entries, CAPS-carrying candidates removed. */
  suggestions: PlacementSeedEntry[];
  /** Entries neither recorded nor dismissed. */
  visibleSuggestions: PlacementSeedEntry[];
  suggestionScores: Map<PlacementSeedEntry, ScoredCandidate>;
  /** The chips in display order; the first is the top suggestion. */
  orderedVisibleSuggestions: PlacementSeedEntry[];
  /** The current character's 3-signal producer badge. */
  currentCharBadge: ReturnType<typeof getProducerBadge> | null;
  /** True when a recorded mechanism unrelated to the offered chips already covers the character. */
  hasUnrelatedRecordedMechanism: boolean;
  /** Whether the chip row is shown at all. */
  rowOffered: boolean;
}

/**
 * What the suggestion row offers for the current character: the ranked
 * corpus suggestions, which of them are still visible, their weighted score,
 * their display order, and whether the row is shown. Accepting one chip hides
 * only that chip; the row stays hidden only when the whole row was denied or
 * the character is covered by unrelated means.
 */
export function placementOffer(input: PlacementOfferInputs): PlacementOffer {
  const {
    currentChar,
    placementMap,
    bcp47,
    sessionAssignments,
    mechanismAssignments,
    dismissedEntries,
    rowDismissed,
    slotOccupancy,
    needSets,
    workingIr,
    baseOnlyProducedSet,
    baseProducedSet,
  } = input;

  const currentCharBadge =
    currentChar !== null
      ? getProducerBadge(currentChar, sessionAssignments, "physical", baseOnlyProducedSet, baseProducedSet)
      : null;

  // The "" tag is "no locale", not "the empty locale".
  const locale = bcp47 !== undefined && bcp47 !== "" ? bcp47 : undefined;
  let suggestions: PlacementSeedEntry[] = [];
  if (placementMap !== undefined && currentChar !== null) {
    // Never surface a CAPS-based placement as a suggestion: CAPS is a
    // case/state modifier, not a layer an author reaches for. It stays
    // available as a manual layer pick.
    suggestions = getRankedSuggestionsForChar(
      currentChar,
      placementMap,
      PLACEMENT_SEED_CONFIDENCE_THRESHOLD,
      locale,
    ).filter((entry) => !entry.topCandidate.modifiers.includes("CAPS"));
  }

  // Every strategyId already recorded as a non-sequence mechanism for the
  // character: those chips are hidden individually.
  const recordedStrategyIds = new Set<string>();
  if (currentChar !== null) {
    for (const a of mechanismAssignments) {
      if (a.scope !== "individual" || a.target !== currentChar) continue;
      for (const m of a.mechanisms) {
        if (m.strategyId !== undefined) recordedStrategyIds.add(m.strategyId);
      }
    }
  }

  const visibleSuggestions =
    currentChar === null
      ? []
      : suggestions.filter(
          (entry) =>
            !recordedStrategyIds.has(entry.strategyId) &&
            !dismissedEntries.has(dismissedSuggestionEntryKey(currentChar, entry.strategyId)),
        );

  // The weighted score orders the visible chips (the producer order stays the
  // stable tiebreak).
  const suggestionScores = new Map<PlacementSeedEntry, ScoredCandidate>();
  if (currentChar !== null) {
    for (const entry of suggestions) {
      suggestionScores.set(
        entry,
        scoreCandidate(entry.topCandidate, currentChar, {
          occupancy: slotOccupancy,
          ...needSets,
          occupancyVerified: workingIr !== null,
        }),
      );
    }
  }
  const orderedVisibleSuggestions = orderVisibleSuggestions(visibleSuggestions, suggestionScores);

  // Covered by UNRELATED means: a recorded mechanism whose strategyId is not
  // among those the chips offer. A recorded mechanism matching an offered chip
  // is handled per chip above and must not hide a sibling chip.
  let hasUnrelatedRecordedMechanism = false;
  if (currentChar !== null) {
    const offered = new Set(suggestions.map((entry) => entry.strategyId));
    scan: for (const a of mechanismAssignments) {
      if (a.scope !== "individual" || a.target !== currentChar) continue;
      for (const m of a.mechanisms) {
        if (m.strategyId === undefined || !offered.has(m.strategyId)) {
          hasUnrelatedRecordedMechanism = true;
          break scan;
        }
      }
    }
  }

  const rowOffered =
    visibleSuggestions.length > 0 &&
    !rowDismissed &&
    currentChar !== null &&
    !baseOnlyProducedSet.has(currentChar) &&
    !(currentCharBadge?.isComposable ?? false) &&
    !hasSequenceForChar(sessionAssignments, currentChar) &&
    !hasUnrelatedRecordedMechanism;

  return {
    suggestions,
    visibleSuggestions,
    suggestionScores,
    orderedVisibleSuggestions,
    currentCharBadge,
    hasUnrelatedRecordedMechanism,
    rowOffered,
  };
}

// ---------------------------------------------------------------------------
// Displacement (#2300, gate G3)
// ---------------------------------------------------------------------------

/**
 * The demotion proposal the just-recorded assignment raises, or null. Raised
 * when the assignment took a slot whose incumbent glyph is a DIFFERENT
 * character that is still needed and not otherwise produced. The slots are
 * derived from the recorded assignment itself, never from the candidate that
 * produced it. Reads the PRE-record ledger and assignments. Never blocks the
 * apply: the author chose the key; this only proposes the incumbent's new
 * home. Pass the result to the displacement hook's `propose`.
 */
export function displacementProposalFor(params: {
  assignment: MechanismAssignment;
  currentChar: string | null;
  slotOccupancy: ReadonlyMap<string, SlotOccupant>;
  needSets: NeedSets;
  sessionAssignments: MechanismAssignment[];
}): DisplacementProposalInput | null {
  const { assignment, currentChar, slotOccupancy, needSets, sessionAssignments } = params;
  if (currentChar === null) return null;
  // A deadkey's trigger slot is not handled here: its own character's
  // escapes (double-tap / space / AltGr) are the escape banner's job.
  for (const slot of assignmentSlotKeys(assignment)) {
    const displaced = displacedFor(slotOccupancy, slot.vkey, slot.modifiers, currentChar);
    if (displaced === null) continue;
    if (!isStillNeeded(displaced.char, needSets)) continue;
    const takenSlotKey = slot.key;
    // Still reachable elsewhere: another slot (the ledger check), or a
    // recorded assignment for the displaced glyph that does not live on the
    // slot just taken. Non-slot mechanisms (deadkey / sequence) always count
    // as another production.
    if (isProducedOnOtherSlot(slotOccupancy, displaced.char, takenSlotKey)) continue;
    const producedElsewhereByAssignment = sessionAssignments.some((a) => {
      if (a.target !== displaced.char.normalize("NFC")) return false;
      return a.mechanisms.some((m) => {
        if (m.patternId === PATTERN_RALT || m.patternId === PATTERN_SWAP) {
          // A parse failure yields NO slot entries and so counts as NOT
          // produced elsewhere: a spurious proposal is dismissable, a
          // suppressed one is a silent loss.
          return mechanismSlotEntries(m).some((e) => e.key !== takenSlotKey);
        }
        return true;
      });
    });
    if (producedElsewhereByAssignment) continue;
    // Demotion rank: RAlt on the SAME key first; deadkey only when the RAlt
    // slot is taken or IS the slot just taken.
    const raltSlotKey = slotKeyFor(slot.vkey, ["RALT"]);
    const demotionMethod: "ralt" | "deadkey" =
      raltSlotKey !== takenSlotKey && !slotOccupancy.has(raltSlotKey) ? "ralt" : "deadkey";
    // WHO gets demoted follows the orthography tier: both core -> neither by
    // default; core incumbent + non-core incoming -> the INCOMING char loses
    // the primary slot; otherwise the incumbent is demoted.
    const displacedTier = orthographyTier(displaced.char, needSets);
    const incomingTier = orthographyTier(currentChar, needSets);
    const direction =
      displacedTier === "core" && incomingTier === "core"
        ? ("both-core" as const)
        : displacedTier === "core"
          ? ("demote-incoming" as const)
          : ("demote-incumbent" as const);
    return {
      displacedChar: displaced.char,
      incomingChar: currentChar,
      vkey: slot.vkey,
      modifiers: [...slot.modifiers],
      demotionMethod,
      direction,
      baseAssignment: assignment,
      alreadyDemoted: () =>
        sessionAssignments.some(
          (a) =>
            a.target === displaced.char.normalize("NFC") &&
            a.mechanisms.some((m) => m.patternId === PATTERN_RALT),
        ),
    };
    // One proposal per apply: the hook holds a single pending proposal.
  }
  return null;
}

/**
 * The assignments after confirming a displacement proposal's demotion
 * ("Move it"), or null when nothing is recorded (stale proposal or an
 * unbuildable demotion). The caller clears the proposal either way.
 *   - demote-incumbent: record the demotion for the displaced glyph.
 *   - demote-incoming: record the demotion for the INCOMING character and
 *     remove its primary-slot assignment.
 * The stale guard mirrors the companion's: the displacing assignment must
 * still be present, by reference.
 */
export function displacementConfirmAssignments(
  proposal: DisplacementProposal,
  sessionAssignments: MechanismAssignment[],
  workingIr: KeyboardIR | null,
): MechanismAssignment[] | null {
  if (!sessionAssignments.includes(proposal.baseAssignment)) return null;
  const demotionFor = (targetChar: string): MechanismAssignment | null =>
    demotionAssignmentFor({
      targetChar,
      vkey: proposal.vkey,
      demotionMethod: proposal.demotionMethod,
      sessionAssignments,
      workingIr,
    });
  if (proposal.direction === "demote-incoming") {
    const demotion = demotionFor(proposal.incomingChar);
    if (demotion === null) return null;
    return [...sessionAssignments.filter((a) => a !== proposal.baseAssignment), demotion];
  }
  const demotion = demotionFor(proposal.displacedChar);
  if (demotion === null) return null;
  return [...sessionAssignments, demotion];
}

/**
 * Both-core explicit author override: demote the displaced core glyph anyway
 * (the banner's non-default choice). Null when nothing is recorded.
 */
export function bothCoreDemoteAssignments(
  proposal: DisplacementProposal,
  sessionAssignments: MechanismAssignment[],
  workingIr: KeyboardIR | null,
): MechanismAssignment[] | null {
  if (!sessionAssignments.includes(proposal.baseAssignment)) return null;
  const demotion = demotionAssignmentFor({
    targetChar: proposal.displacedChar,
    vkey: proposal.vkey,
    demotionMethod: proposal.demotionMethod,
    sessionAssignments,
    workingIr,
  });
  if (demotion === null) return null;
  return [...sessionAssignments, demotion];
}

/**
 * What one displacement banner action does (the action names come from
 * `displacementActions`): confirm-move and the both-core demotion override
 * record assignments (null when the proposal is stale or records nothing);
 * keep-both and leave are the recorded dismissal.
 */
export type DisplacementOutcome =
  | { kind: "record"; next: MechanismAssignment[] | null }
  | { kind: "dismiss" };

export function displacementOutcomeFor(
  action: DisplacementAction,
  proposal: DisplacementProposal,
  sessionAssignments: MechanismAssignment[],
  workingIr: KeyboardIR | null,
): DisplacementOutcome {
  switch (action) {
    case "confirm-move":
      return { kind: "record", next: displacementConfirmAssignments(proposal, sessionAssignments, workingIr) };
    case "demote-displaced":
      return { kind: "record", next: bothCoreDemoteAssignments(proposal, sessionAssignments, workingIr) };
    case "keep-both":
    case "leave":
      return { kind: "dismiss" };
  }
}

// ---------------------------------------------------------------------------
// Case-pair companion inputs and confirm
// ---------------------------------------------------------------------------

/** S-02 companion: the base letter and output case-shift; trigger, name and accent do not. */
export function deadkeyCompanionInput(params: {
  currentChar: string;
  combo: { triggerKey: string; deadkeyName: string; accentChar: string; baseLetter: string };
  assignment: MechanismAssignment;
  sessionAssignments: MechanismAssignment[];
}): CasePairProposalInput {
  const { currentChar, combo, assignment, sessionAssignments } = params;
  return {
    mechanism: "combo",
    originalChar: currentChar,
    combo: { kind: "deadkey", ...combo },
    baseAssignment: assignment,
    // "Counterpart already placed": redundant if the counterpart already has a
    // deadkey mechanism on this same trigger key.
    alreadyProduced: (counterpart) =>
      sessionAssignments.some(
        (a) =>
          a.target === counterpart &&
          a.mechanisms.some(
            (m) => isDeadkeyPatternId(m.patternId) && m.slotValues?.["triggerKey"] === combo.triggerKey,
          ),
      ),
  };
}

/** RAlt-layer companion: the same vkey with SHIFT added to the lowercase placement's modifiers. */
export function raltCompanionInput(params: {
  currentChar: string;
  vkey: string;
  baseModifiers: ModifierToken[];
  assignment: MechanismAssignment;
  sessionAssignments: MechanismAssignment[];
}): CasePairProposalInput {
  const { currentChar, vkey, baseModifiers, assignment, sessionAssignments } = params;
  return {
    mechanism: "ralt-layer",
    originalChar: currentChar,
    vkey,
    baseModifiers,
    baseAssignment: assignment,
    // Redundant if the counterpart already has a PATTERN_RALT mechanism whose
    // altgrKeyList names this same vkey.
    alreadyProduced: (counterpart) =>
      sessionAssignments.some(
        (a) =>
          a.target === counterpart &&
          a.mechanisms.some((m) => {
            const keyList = m.slotValues?.["altgrKeyList"];
            return (
              m.patternId === PATTERN_RALT &&
              typeof keyList === "string" &&
              new RegExp(`\\b${vkey}\\b`).test(keyList)
            );
          }),
      ),
  };
}

/** Physical companion: the counterpart's natural home is the shift layer of the SAME key. */
export function physicalCompanionInput(params: {
  currentChar: string;
  vkey: string;
  capsHandling: boolean;
  assignment: MechanismAssignment;
  sessionAssignments: MechanismAssignment[];
}): CasePairProposalInput {
  const { currentChar, vkey, capsHandling, assignment, sessionAssignments } = params;
  return {
    mechanism: "physical",
    originalChar: currentChar,
    vkey,
    capsHandling,
    // Object identity, not target/index: several mechanisms per character
    // are allowed, so confirm must find exactly the assignment this proposal
    // was raised for.
    baseAssignment: assignment,
    // `simple_swap` records already-emitted .kmn lines in `kmnRules`, so match
    // the counterpart target together with the vkey appearing (word boundary)
    // in that assignment's rules.
    alreadyProduced: (counterpart) =>
      sessionAssignments.some(
        (a) =>
          a.target === counterpart &&
          a.mechanisms.some((m) => {
            const rules = m.slotValues?.["kmnRules"];
            return typeof rules === "string" && new RegExp(`\\b${vkey}\\b`).test(rules);
          }),
      ),
  };
}

/** S-03 companion, raised from the sequence panel's `onApplied`. */
export function sequenceCompanionInput(params: {
  currentChar: string;
  applied: SequenceApplied;
  sessionAssignments: MechanismAssignment[];
}): CasePairProposalInput {
  const { currentChar, applied, sessionAssignments } = params;
  return {
    mechanism: "combo",
    originalChar: currentChar,
    combo: { kind: "sequence", content: applied.content, indicator: applied.indicator },
    baseAssignment: applied.assignment,
    // Checks the UNCHANGED physical component (the indicator key, which the
    // combo shift never touches) rather than re-deriving the case-shifted
    // content, which would need a second casing call.
    alreadyProduced: (counterpart) =>
      partitionSequenceAssignment(sessionAssignments, counterpart).mechs.some(
        (m) => m.slotValues?.["secondLetter"] === applied.indicator,
      ),
  };
}

/**
 * The assignments after confirming a case-pair companion, or null when
 * nothing is recorded (stale proposal, a no-op re-confirm, a touch proposal
 * -- the touch mechanism confirms in its own gallery). The caller clears the
 * proposal either way.
 */
export function companionConfirmAssignments(
  proposal: CasePairProposal,
  sessionAssignments: MechanismAssignment[],
): MechanismAssignment[] | null {
  if (proposal.mechanism === "touch") return null;
  // Stale-proposal guard: the assignment this was raised for must still be
  // present, by reference.
  const baseIdx = sessionAssignments.indexOf(proposal.baseAssignment);
  if (baseIdx === -1) return null;

  if (proposal.mechanism === "combo") {
    const { parallelCombo, counterpart } = proposal;
    if (parallelCombo.kind === "deadkey") {
      // Unchanged: the accent key is a selector, not a letter. Case-shifted:
      // the base letter in, the accented form out.
      return [
        ...sessionAssignments,
        buildDeadkeyAssignment({
          currentChar: counterpart,
          baseLetter: parallelCombo.baseLetter,
          triggerVkey: parallelCombo.triggerKey,
          deadkeyName: parallelCombo.deadkeyName,
          accentChar: parallelCombo.accentChar,
        }),
      ];
    }
    // The parallel sequence belongs in the counterpart's own sequence bucket;
    // the (firstLetterOut, secondLetter) dedup makes a re-confirm a no-op.
    const { mechs: existingMechs, rest } = partitionSequenceAssignment(sessionAssignments, counterpart);
    const alreadyRecorded = existingMechs.some(
      (m) =>
        m.slotValues?.["firstLetterOut"] === parallelCombo.content &&
        m.slotValues?.["secondLetter"] === parallelCombo.indicator,
    );
    if (alreadyRecorded) return null;
    const newRef: MechanismRef = {
      patternId: PATTERN_SEQUENCE,
      strategyId: "S-03",
      slotValues: {
        firstLetterOut: parallelCombo.content,
        // Unchanged: the indicator is a physical key by construction.
        secondLetter: parallelCombo.indicator,
        collapsedChar: counterpart,
      },
    };
    return [
      ...rest,
      {
        scope: "individual",
        target: counterpart,
        modality: "physical",
        mechanisms: [...existingMechs, newRef],
        source: "user",
      },
    ];
  }

  if (proposal.mechanism === "ralt-layer") {
    // The companion's modifiers are the lowercase placement's own with SHIFT
    // added. canonicalizeCombo only throws for a mutually-exclusive combo,
    // structurally unreachable here but guarded like the other write paths.
    let altgrKeyList: string;
    try {
      altgrKeyList = comboToKeySpec(canonicalizeCombo([...proposal.baseModifiers, "SHIFT"]), proposal.vkey);
    } catch {
      return null;
    }
    return [
      ...sessionAssignments,
      {
        scope: "individual",
        target: proposal.counterpart,
        modality: "physical",
        mechanisms: [
          {
            patternId: PATTERN_RALT,
            strategyId: "S-08",
            slotValues: { altgrKeyList, altgrOutputList: proposal.counterpart },
          },
        ],
        source: "user",
      },
    ];
  }

  if (proposal.capsHandling) {
    // CAPS-handling key: the base assignment already carries an explicit
    // NCAPS/CAPS pair, and a SEPARATE companion with its own [CAPS K_X] line
    // would conflict with it (Layer-A Check #10). REPLACE the base assignment
    // with one combined assignment carrying the full CAPS-as-case-inverter quad.
    const kmnRules = buildCasePairRuleLines(proposal.vkey, proposal.originalChar, proposal.counterpart, {
      capsHandling: true,
    }).join("\n");
    const combined: MechanismAssignment = {
      scope: "individual",
      target: proposal.originalChar,
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, strategyId: "S-01", slotValues: { kmnRules } }],
      source: "user",
    };
    return sessionAssignments.map((a, i) => (i === baseIdx ? combined : a));
  }

  // No CAPS handling: base (`[K_X]`) and shift (`[SHIFT K_X]`) target disjoint
  // contexts, so a separate companion assignment cannot conflict.
  const kmnRules = buildShiftRuleLines(proposal.vkey, proposal.counterpart, { capsHandling: false }).join("\n");
  return [
    ...sessionAssignments,
    {
      scope: "individual",
      target: proposal.counterpart,
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, strategyId: "S-01", slotValues: { kmnRules } }],
      source: "user",
    },
  ];
}

// ---------------------------------------------------------------------------
// What accepting a chip / pressing Apply does
// ---------------------------------------------------------------------------

/** A write the handlers make, plus the proposals it raises (see the module header for the order). */
export interface PlacementRecord {
  kind: "record";
  assignment: MechanismAssignment;
  /** Raised before the assignment is recorded. */
  companionBefore: CasePairProposalInput | null;
  /** The displacement proposal the recorded assignment raises. */
  displacement: DisplacementProposalInput | null;
  /** Raised after the displacement proposal. */
  companionAfter: CasePairProposalInput | null;
}

/** One step of a placement, in the order it runs. */
export type PlacementStep =
  | { kind: "propose-companion"; input: CasePairProposalInput }
  | { kind: "record"; assignment: MechanismAssignment; next: MechanismAssignment[] }
  | { kind: "propose-displacement"; input: DisplacementProposalInput };

/**
 * The ordered steps a recorded placement runs: companionBefore, the record
 * (the current assignments plus the new one), the displacement proposal, then
 * companionAfter. Absent proposals are skipped. Both write handlers and the
 * headless author run exactly this sequence.
 */
export function placementSequence(
  plan: PlacementRecord,
  sessionAssignments: MechanismAssignment[],
): PlacementStep[] {
  const steps: PlacementStep[] = [];
  if (plan.companionBefore !== null) steps.push({ kind: "propose-companion", input: plan.companionBefore });
  steps.push({ kind: "record", assignment: plan.assignment, next: [...sessionAssignments, plan.assignment] });
  if (plan.displacement !== null) steps.push({ kind: "propose-displacement", input: plan.displacement });
  if (plan.companionAfter !== null) steps.push({ kind: "propose-companion", input: plan.companionAfter });
  return steps;
}

export type SuggestionAcceptPlan =
  | PlacementRecord
  /** The chip cannot be recorded; dismiss THIS chip only. */
  | { kind: "dismiss"; reason: string }
  /** The trigger does not resolve, or its deadkey already maps this base letter: prefill the deadkey card. */
  | { kind: "prefill-deadkey"; triggerKey: string; baseLetter: string };

/**
 * What accepting one suggestion chip does: the assignment it records and the
 * case-pair and displacement proposals it raises. Uses the candidate's own
 * vkey / base letter directly.
 */
export function planSuggestionAccept(params: {
  entry: PlacementSeedEntry;
  currentChar: string;
  sessionAssignments: MechanismAssignment[];
  workingIr: KeyboardIR | null;
  slotOccupancy: ReadonlyMap<string, SlotOccupant>;
  needSets: NeedSets;
  triggerKey: string;
  triggerKeyCustomChar: string;
  proposedTriggerKey: string;
}): SuggestionAcceptPlan {
  const { entry, currentChar, sessionAssignments, workingIr, slotOccupancy, needSets } = params;
  const built = assignmentFromSuggestion({
    entry,
    currentChar,
    sessionAssignments,
    workingIr,
    slotOccupancy,
    triggerKey: params.triggerKey,
    triggerKeyCustomChar: params.triggerKeyCustomChar,
    proposedTriggerKey: params.proposedTriggerKey,
  });
  if (built.kind === "dismiss") return built;
  if (built.kind === "prefill-deadkey") {
    return { kind: "prefill-deadkey", triggerKey: built.triggerKey, baseLetter: built.baseLetter };
  }
  const { assignment, raltCompanionModifiers, deadkey } = built;
  return {
    kind: "record",
    assignment,
    // S-02 case-pair proposal: the same companion the manual deadkey Apply raises.
    companionBefore:
      deadkey !== null
        ? deadkeyCompanionInput({
            currentChar,
            combo: {
              triggerKey: deadkey.triggerVkey,
              deadkeyName: deadkey.deadkeyName,
              accentChar: deadkey.accentChar,
              baseLetter: deadkey.baseLetter,
            },
            assignment,
            sessionAssignments,
          })
        : null,
    // S-02 takes no slot (a deadkey composes on a base keystroke and shadows
    // nothing) and yields no slot entries there.
    displacement: displacementProposalFor({ assignment, currentChar, slotOccupancy, needSets, sessionAssignments }),
    companionAfter:
      raltCompanionModifiers !== null
        ? raltCompanionInput({
            currentChar,
            vkey: entry.topCandidate.vkey,
            baseModifiers: raltCompanionModifiers,
            assignment,
            sessionAssignments,
          })
        : null,
  };
}

/**
 * What Apply does on the deadkey card for `baseLetter` (as typed) under the
 * chosen trigger. Null when the card cannot apply: the base letter or trigger
 * does not resolve, or the trigger's deadkey already maps this base letter to
 * another character.
 */
export function planDeadkeyApply(params: {
  currentChar: string;
  /** The typed base letter, resolved here. */
  baseLetterInput: string;
  baseLetterOptions: ResolveCharInputOptions;
  triggerKey: string;
  triggerKeyCustomChar: string;
  workingIr: KeyboardIR | null;
  sessionAssignments: MechanismAssignment[];
  slotOccupancy: ReadonlyMap<string, SlotOccupant>;
  needSets: NeedSets;
}): PlacementRecord | null {
  const { currentChar, sessionAssignments, workingIr, slotOccupancy, needSets } = params;
  const base = resolveCharInput(params.baseLetterInput, params.baseLetterOptions);
  const triggerResolution = resolveKeyPickerSelection(
    params.triggerKey,
    params.triggerKeyCustomChar,
    TRIGGER_KEY_RESOLVE_OPTIONS,
  );
  const triggerVkey = resolvedVkeyOf(triggerResolution);
  if (!base.ok || triggerVkey === null) return null;
  if (s02BaseClash({ triggerKey: triggerVkey, baseLetter: base.value, currentChar, sessionAssignments }) !== null) {
    return null;
  }
  // The identity + assignment come from the shared S-02 seam, the same call
  // the S-02 suggestion accept makes, so the two write paths cannot drift.
  const placement = deadkeyPlacementFor({
    currentChar,
    baseLetter: base.value,
    triggerKey: params.triggerKey,
    triggerResolution,
    workingIr,
    sessionAssignments,
    slotOccupancy,
  });
  if (placement === null) return null;
  const { deadkeyName, accentChar, assignment } = placement;
  return {
    kind: "record",
    assignment,
    companionBefore: deadkeyCompanionInput({
      currentChar,
      combo: { triggerKey: triggerVkey, deadkeyName, accentChar, baseLetter: base.value },
      assignment,
      sessionAssignments,
    }),
    displacement: displacementProposalFor({ assignment, currentChar, slotOccupancy, needSets, sessionAssignments }),
    companionAfter: null,
  };
}

/**
 * What Apply does on the "Assign to a key" card: zero layers is a plain S-01
 * base-key assignment, a lone SHIFT the shift plane, anything else an S-08
 * combo. Null when the key does not resolve or the combo is mutually
 * exclusive. The case-pair companion is proposed from the base-layer apply
 * only (no reliable signal that a combo is a case-pair layer), and not for
 * mnemonic keyboards.
 */
export function planSwapApply(params: {
  currentChar: string;
  selectedKey: string;
  selectedKeyCustomChar: string;
  chosenTokens: readonly ModifierToken[];
  workingIr: KeyboardIR | null;
  sessionAssignments: MechanismAssignment[];
  slotOccupancy: ReadonlyMap<string, SlotOccupant>;
  needSets: NeedSets;
}): PlacementRecord | null {
  const { currentChar, chosenTokens, workingIr, sessionAssignments, slotOccupancy, needSets } = params;
  const vkey = resolvedVkeyOf(resolveKeyPickerSelection(params.selectedKey, params.selectedKeyCustomChar));
  if (vkey === null) return null;
  const swap = swapAssignmentFor({ currentChar, vkey, chosenTokens, workingIr });
  if (swap === null) return null;
  const { assignment, capsHandling } = swap;
  return {
    kind: "record",
    assignment,
    companionBefore:
      chosenTokens.length === 0 && shiftLayerAllowedFor(workingIr) && workingIr !== null
        ? physicalCompanionInput({ currentChar, vkey, capsHandling, assignment, sessionAssignments })
        : null,
    displacement: displacementProposalFor({ assignment, currentChar, slotOccupancy, needSets, sessionAssignments }),
    companionAfter: null,
  };
}
