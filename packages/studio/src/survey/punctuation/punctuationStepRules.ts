// punctuationStepRules -- the punctuation step's seeding and completion as
// plain functions, so the UI (PunctuationStep) and a headless caller (spec
// 107's scripted author) take the same path.
//
//   SEED      `seedPunctuationTier` and `seedPunctuationBase`: the CLDR/SLDR
//             tier and the base group, each once per evidence key (the two
//             effects the step runs when the exemplar lookup settles).
//   COMPLETE  `completePunctuation`: records what the inventory was confirmed
//             FOR and reports the phase-C result.

import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import {
  buildPunctuationProposal,
  glyphCategory,
  startPunctuationCoverage,
} from "@keyboard-studio/engine";
import type { ExemplarInventory } from "../../lib/services.ts";
import { charactersInTier } from "../../lib/services.ts";
import type { SavedAnswer } from "../../steps/answerTypes.ts";
import { getCharacterInventoryValue } from "../useInventoryDraft.ts";
import type { DraftProvenance } from "../phaseBDraftOps.ts";
import { phaseCConfirmedInventory } from "../phaseCInventory.ts";

/** Manifest step id -- matches steps/manifest.ts's "punctuation" entry. */
export const PUNCTUATION_STEP_ID = "punctuation";

/**
 * The saved answer that carries the evidence key the confirmed inventory was
 * built on (spec 079 R-07, FR-022): what it was confirmed FOR, so the FR-023
 * guard can tell "confirmed here" from "confirmed for another language or base".
 */
export const PUNCTUATION_INVENTORY_ANSWER_ID = "punctuation.inventory";

/** True for the one category this page collects. */
export function isPunctuationChar(c: string): boolean {
  return glyphCategory(c) === "punctuation";
}

/** The exemplar source's punctuation tier, NFC-normalised (empty with no offer). */
export function punctuationTier(inventory: ExemplarInventory | null): string[] {
  return inventory === null ? [] : charactersInTier(inventory, "punctuation").map((c) => c.normalize("NFC"));
}

/** What the working copy already types, or null with no working copy. */
export type PunctuationBaseCoverage = ReturnType<typeof startPunctuationCoverage>;

/** What the working copy already types; null with no working copy (the step's `baseCoverage`). */
export function baseCoverageOf(ir: Parameters<typeof startPunctuationCoverage>[0] | null): PunctuationBaseCoverage | null {
  return ir === null ? null : startPunctuationCoverage(ir);
}

/**
 * FR-023: a phase-C confirmedInventory already on the session means the author
 * confirmed this step; their decision stands, but only for the evidence it was
 * confirmed on (a confirmation with no recorded key predates spec 079).
 */
export function isPunctuationAlreadyConfirmed(args: {
  phaseResults: readonly SurveyPhaseResult[];
  confirmedForKey: string | null | undefined;
  evidenceKey: string;
}): boolean {
  return (
    args.phaseResults.some((p) => p.phase === "C" && p.confirmedInventory !== undefined) &&
    (args.confirmedForKey === undefined ||
      args.confirmedForKey === null ||
      args.confirmedForKey === args.evidenceKey)
  );
}

/** Seed-key prefixes the punctuation step records (see the two seed halves below). */
export const PUNCTUATION_TIER_SEED_PREFIX = "punctuation:";
export const PUNCTUATION_BASE_SEED_PREFIX = "punctuation-base:";

/**
 * Seed the CLDR/SLDR tier ONCE per resolved locale when the lookup settles
 * (FR-001). `seedProposals` is a no-op on a repeated key, honours the author's
 * rejections (FR-022) and never downgrades an author pick (FR-005). Under the
 * FR-023 guard the key is still recorded, with nothing to seed, so the guard
 * is evaluated once rather than on every visit. A no-op without an inventory.
 */
export function seedPunctuationTier(args: {
  inventory: ExemplarInventory | null;
  alreadyConfirmed: boolean;
  seedProposals: (chars: readonly string[], source: DraftProvenance, seedKey: string) => void;
}): void {
  const { inventory, alreadyConfirmed, seedProposals } = args;
  if (inventory === null) return;
  const seedKey = PUNCTUATION_TIER_SEED_PREFIX + inventory.resolvedTag;
  seedProposals(alreadyConfirmed ? [] : punctuationTier(inventory), inventory.source, seedKey);
}

/**
 * Seed the base group ONCE per base keyboard, after the exemplar lookup has
 * settled so the group already excludes the CLDR tier (FR-006). The two
 * proposed groups are disjoint by construction: the base group is what the
 * base produces MINUS the CLDR group, the rejections and the author's own
 * picks (FR-010), derived from the inventory rather than the seeded draft so
 * it is the same whichever seed fires first. One-way floor rule
 * (FR-007..FR-009): the builder substitutes the ASCII floor when the base's
 * output is not fully known, and the provenance says which it was. The
 * rejection ledger and the author's picks are read from the decision record
 * WHEN this runs rather than subscribed to. A no-op without base coverage.
 */
export function seedPunctuationBase(args: {
  inventory: ExemplarInventory | null;
  baseCoverage: PunctuationBaseCoverage | null;
  startKeyboardId: string | undefined;
  alreadyConfirmed: boolean;
  seedProposals: (chars: readonly string[], source: DraftProvenance, seedKey: string) => void;
}): void {
  const { inventory, baseCoverage, alreadyConfirmed, seedProposals } = args;
  if (baseCoverage === null) return;
  const seedKey = PUNCTUATION_BASE_SEED_PREFIX + (args.startKeyboardId ?? "working-copy");
  const currentDraft = getCharacterInventoryValue();
  const proposal = buildPunctuationProposal({
    exemplars: inventory,
    baseCoverage,
    rejected: new Set(currentDraft.rejected),
    authorChosen: new Set(
      Object.keys(currentDraft.provenance).filter((c) => currentDraft.provenance[c] === "author"),
    ),
  });
  // This page collects Unicode PUNCTUATION only, so the floor's nine symbol
  // members ($ + < = > ^ ` | ~) are not proposed here: they would land in the
  // draft's unrendered `symbols` bucket and reach the alphabet result unseen
  // (FR-025). Symbols stay shielded by carve's always-keep rule.
  seedProposals(
    alreadyConfirmed ? [] : proposal.baseGroup.filter(isPunctuationChar),
    proposal.baseCoverageIncomplete ? "ascii-floor" : "base",
    seedKey,
  );
}

/** The step's phase result: the shared phase-C union (`[]` records "asked, chose none"). */
export function punctuationResult(): SurveyPhaseResult {
  return { phase: "C", answers: [], confirmedInventory: phaseCConfirmedInventory() };
}

/** Done: record the evidence key the inventory was confirmed for, and report the result. */
export function completePunctuation(args: {
  evidenceKey: string;
  saveAnswer: (stepId: string, answerId: string, answer: Omit<SavedAnswer, "savedAt">) => void;
}): SurveyPhaseResult {
  const result = punctuationResult();
  args.saveAnswer(PUNCTUATION_STEP_ID, PUNCTUATION_INVENTORY_ANSWER_ID, {
    value: result.confirmedInventory ?? [],
    answerType: "char-list",
    origin: "confirmed",
    stage: "confirmed",
    evidenceKey: args.evidenceKey,
    screenId: PUNCTUATION_STEP_ID,
  });
  return result;
}
