// Deadkeys, rules and mechanism placement: the lifted completion records, then the placement walk
// (placementOffer, planSuggestionAccept, planSwapApply, the lifted chip order and banner confirms).
//
// Deadkeys and rules complete with their state untouched (Continue with
// nothing changed). Mechanisms walks the characters the gallery walks, in its
// order, and for each one the gallery would ask about: a case override first
// ("Assign to a key"), else the top suggestion chip, else the pre-selected
// deadkey card, else the zzq placeholder typed into the sequence builder. Case
// pair and displacement banners are resolved by their first action, companion
// banner first (the order the gallery renders them). It completes as the
// adapter's Done does.

import type { Case } from "../caseTypes.ts";
import type { DriverContext, StepDrivers } from "./types.ts";
import { StepFailure } from "../stepFailure.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import { placeholderClash, placeholderFor } from "../placeholder.ts";
import { resolveDisplacement } from "./displacement.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import {
  completeDeadkeysStep,
  completePhysicalLayoutStep,
  completeRulesStep,
} from "../../../lib/mechanismStepCompletion.ts";
import { loadPlacementMap } from "../../../lib/placementMapLoader.ts";
import { deriveInventoryDiff } from "../../../lib/inventoryDiff.ts";
import { derivePlacementInventory, loanwordSetOf } from "../../../lib/placementInventory.ts";
import { selectDesktopAssignments } from "../../../lib/unimplementedInventory.ts";
import { buildSlotOccupancy } from "../../../survey/slotOccupancy.ts";
import type { PlacementSeedEntry } from "../../../survey/placementSeeds.ts";
import { preselectMethod } from "../../../editors/assignLoop/suggestionOrder.ts";
import {
  baseOnlyProducedSetFor,
  buildDeadkeyBaseLetterResolveOptions,
  buildNeedSets,
  canGoNextFor,
  companionConfirmAssignments,
  dismissedSuggestionEntryKey,
  excludeSequenceMechanisms,
  placementOffer,
  placementSequence,
  placementWalkList,
  planDeadkeyApply,
  planSuggestionAccept,
  planSwapApply,
  sequenceCompanionInput,
  type PlacementRecord,
  type PlacementStep,
} from "../../../editors/assignLoop/mechanismPlacement.ts";
import { sequenceApplyFor } from "../../../editors/assignLoop/sequenceApply.ts";
import {
  acceptCasePairCompanion,
  type CasePairProposal,
  type CasePairProposalInput,
} from "../../../editors/assignLoop/casePairCompanion.ts";
import {
  acceptDisplacementProposal,
  type DisplacementProposal,
  type DisplacementProposalInput,
} from "../../../editors/assignLoop/useDisplacementProposal.ts";

const DECISION_ID = "physical-layout";

/** What the author does for one character: the options the policy picks among. */
type Click =
  | { kind: "override"; key: string }
  | { kind: "suggestion"; entry: PlacementSeedEntry }
  | { kind: "preselected-deadkey" }
  | { kind: "placeholder"; sequence: string; indicator: string };

/** The case-pair banner's two buttons, in banner order: confirm is the default. */
const COMPANION_BANNER_ACTIONS = ["confirm", "dismiss"] as const;

type PlacementMap = Awaited<ReturnType<typeof loadPlacementMap>>;

function store() {
  return useWorkingCopyStore.getState();
}

/** Click the case-pair banner's first action. */
function resolveCompanion(ctx: DriverContext, proposal: CasePairProposal): void {
  const choice = chooseByPolicy({
    decisionId: "case-pair-companion",
    suggestions: COMPANION_BANNER_ACTIONS,
    proposalSource: "acceptCasePairCompanion",
  });
  ctx.report.addStep({
    decisionId: choice.decisionId,
    rule: choice.rule,
    value: { action: choice.value, original: proposal.originalChar, counterpart: proposal.counterpart },
    ...(choice.proposalSource !== undefined ? { proposalSource: choice.proposalSource } : {}),
  });
  if (choice.value !== "confirm") return;
  const next = companionConfirmAssignments(proposal, selectDesktopAssignments(store().phaseResults));
  if (next !== null) store().recordAssignments(next);
}

/**
 * The proposals left pending once the steps ran, as the hooks' propose leaves
 * them: each slot holds one proposal, a later accepted one replaces an earlier
 * one, and a proposal that is not accepted leaves the slot as it was.
 */
function pendingProposalsAfter(
  steps: readonly PlacementStep[],
  accept: {
    companion: (input: CasePairProposalInput) => CasePairProposal | null;
    displacement: (input: DisplacementProposalInput) => DisplacementProposal | null;
  },
): { companion: CasePairProposal | null; displacement: DisplacementProposal | null } {
  let companion: CasePairProposal | null = null;
  let displacement: DisplacementProposal | null = null;
  for (const step of steps) {
    if (step.kind === "propose-companion") companion = accept.companion(step.input) ?? companion;
    else if (step.kind === "propose-displacement") displacement = accept.displacement(step.input) ?? displacement;
  }
  return { companion, displacement };
}

/** The gallery's lifted placement sequence (placementSequence); then both banners. */
function applyRecord(ctx: DriverContext, rec: PlacementRecord): void {
  const before = store();
  const bcp47 = before.identity?.bcp47;
  const steps = placementSequence(rec, selectDesktopAssignments(before.phaseResults));
  for (const step of steps) {
    if (step.kind === "record") before.recordAssignments(step.next);
  }
  const { companion, displacement } = pendingProposalsAfter(steps, {
    companion: (input) => acceptCasePairCompanion(input, bcp47),
    displacement: (input) => acceptDisplacementProposal(input, before.displacedDeclined),
  });
  if (companion !== null) resolveCompanion(ctx, companion);
  if (displacement !== null) resolveDisplacement(ctx, displacement);
}

/**
 * Walk one character. Loops only when a chip is dismissed without recording
 * (the next chip, else the default, else the placeholder is then offered).
 */
function placeCharacter(ctx: DriverContext, char: string, placementMap: PlacementMap, dismissed: Set<string>): void {
  for (let attempt = 0; attempt < 8; attempt++) {
    const st = store();
    const sessionAssignments = selectDesktopAssignments(st.phaseResults);
    const mechanismAssignments = excludeSequenceMechanisms(sessionAssignments);
    // An already-covered character needs no action: Next is enabled as it stands.
    if (canGoNextFor(char, mechanismAssignments, sessionAssignments, new Set<string>())) return;

    const diff = deriveInventoryDiff({
      startIr: st.startIr,
      inventory: st.session.confirmedInventory,
      phaseResults: st.phaseResults,
    });
    const workingIr = st.ir ?? st.startIr;
    const slotOccupancy = buildSlotOccupancy(workingIr, sessionAssignments);
    const needSets = buildNeedSets(st.session.confirmedInventory, diff.rawProducedSet);
    const offer = placementOffer({
      currentChar: char,
      placementMap,
      bcp47: st.identity?.bcp47,
      sessionAssignments,
      mechanismAssignments,
      dismissedEntries: dismissed,
      rowDismissed: false,
      slotOccupancy,
      needSets,
      workingIr,
      baseOnlyProducedSet: baseOnlyProducedSetFor(st.startIr),
      baseProducedSet: diff.rawProducedSet,
    });
    const pre = preselectMethod({
      currentChar: char,
      scriptClass: st.session.axes.scriptClass,
      sessionAssignments,
      workingIr,
    });

    const override = ctx.case.overrides.find((o) => o.kind === "overwrite" && o.char === char);
    const placeholder = placeholderFor(char);
    const choice = chooseByPolicy<Click>({
      decisionId: DECISION_ID,
      ...(override !== undefined ? { override: { kind: "override", key: override.key } as Click } : {}),
      suggestions: offer.rowOffered
        ? offer.orderedVisibleSuggestions.map((entry): Click => ({ kind: "suggestion", entry }))
        : [],
      ...(pre.method === "deadkey" ? { defaultValue: { kind: "preselected-deadkey" } as Click } : {}),
      placeholder: () => ({ kind: "placeholder", ...placeholder }),
      proposalSource: offer.rowOffered ? "getRankedSuggestionsForChar" : "preselectMethod",
    });
    const click = choice.value;
    ctx.report.addStep({
      decisionId: choice.decisionId,
      rule: choice.rule,
      value:
        click.kind === "suggestion"
          ? { char, kind: click.kind, strategyId: click.entry.strategyId, vkey: click.entry.topCandidate.vkey }
          : { char, ...click },
      ...(choice.proposalSource !== undefined ? { proposalSource: choice.proposalSource } : {}),
    });

    if (click.kind === "override") {
      const rec = planSwapApply({
        currentChar: char,
        selectedKey: click.key,
        selectedKeyCustomChar: "",
        chosenTokens: [],
        workingIr,
        sessionAssignments,
        slotOccupancy,
        needSets,
      });
      if (rec === null) throw new Error(`override: "Assign to a key" did not apply for ${char} on ${click.key}`);
      applyRecord(ctx, rec);
      return;
    }

    if (click.kind === "suggestion") {
      const plan = planSuggestionAccept({
        entry: click.entry,
        currentChar: char,
        sessionAssignments,
        workingIr,
        slotOccupancy,
        needSets,
        triggerKey: pre.proposedTriggerKey,
        triggerKeyCustomChar: "",
        proposedTriggerKey: pre.proposedTriggerKey,
      });
      if (plan.kind === "record") {
        applyRecord(ctx, plan);
        return;
      }
      // The chip cannot be recorded (dismissed, or it only prefills the deadkey card):
      // it is hidden and the walk takes whatever is offered next.
      dismissed.add(dismissedSuggestionEntryKey(char, click.entry.strategyId));
      continue;
    }

    if (click.kind === "preselected-deadkey") {
      const rec = planDeadkeyApply({
        currentChar: char,
        baseLetterInput: pre.deadkeyBaseLetter,
        baseLetterOptions: buildDeadkeyBaseLetterResolveOptions(),
        triggerKey: pre.proposedTriggerKey,
        triggerKeyCustomChar: "",
        workingIr,
        sessionAssignments,
        slotOccupancy,
        needSets,
      });
      if (rec === null) throw new Error(`the pre-selected deadkey card cannot apply for ${char}`);
      applyRecord(ctx, rec);
      return;
    }

    // Nothing offered: type the placeholder into the sequence builder.
    if (placeholderClash(click.sequence, ctx.startIr)) {
      throw new StepFailure({
        step: "mechanisms",
        kind: "placeholder-clash",
        detail: `${click.sequence} already typed in the copied keyboard (${char})`,
      });
    }
    const outcome = sequenceApplyFor({ char, content: click.sequence, indicator: click.indicator, sessionAssignments });
    if (outcome.kind !== "record") throw new Error(`the placeholder did not apply for ${char} (${outcome.kind})`);
    st.recordAssignments(outcome.next);
    ctx.report.addPlaceholder({ char, sequence: click.sequence, decisionId: DECISION_ID });
    const companion = acceptCasePairCompanion(
      sequenceCompanionInput({ currentChar: char, applied: outcome.applied, sessionAssignments }),
      st.identity?.bcp47,
    );
    if (companion !== null) resolveCompanion(ctx, companion);
    return;
  }
  throw new Error(`no placement was recorded for ${char} after every offered chip was dismissed`);
}

/** The walk list the gallery visits: the flat diff's letters to add inside the placement set, collated. */
function walkList(): string[] {
  const st = store();
  const diff = deriveInventoryDiff({
    startIr: st.startIr,
    inventory: st.session.confirmedInventory,
    phaseResults: st.phaseResults,
  });
  const placementInventory = derivePlacementInventory(
    st.session.confirmedInventory,
    st.session.alphabet,
    st.session.marksWorklist,
  );
  return placementWalkList(diff.lettersToAdd, placementInventory, loanwordSetOf(st.session.loanwordChars));
}

function overridesNotWalked(c: Case, list: readonly string[]): string[] {
  return c.overrides.filter((o) => !list.includes(o.char)).map((o) => o.char);
}

export const mechanismDrivers: StepDrivers = {
  deadkeys: () => {
    completeDeadkeysStep();
    return undefined;
  },
  rules: () => {
    completeRulesStep();
    return undefined;
  },
  mechanisms: async (ctx) => {
    const placementMap = await loadPlacementMap();
    const list = walkList();
    const dismissed = new Set<string>();
    for (const char of list) placeCharacter(ctx, char, placementMap, dismissed);
    for (const char of overridesNotWalked(ctx.case, list)) {
      ctx.report.addSkippedStep({ step: "mechanisms", reason: `override for ${char} not walked: not in the placement walk` });
    }
    completePhysicalLayoutStep();
    return undefined;
  },
};
