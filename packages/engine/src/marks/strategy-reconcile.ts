// Strategy reconciliation (spec 052 US4, FR-024/FR-025/FR-027; closes the
// silent-disagreement defect the marks station has carried since spec 071).
//
// The marks series produces the richest statement the survey has about how marks
// behave — and until this module it went nowhere near strategy selection. The
// series emitted `{phase:"C", answers:[], marksWorklist, marksOutputForm}` and
// simply omitted `computedAxes`, so `selectStrategy` never saw the author's
// answer. A keyboard could therefore be built on two contradictory premises at
// once, with nothing detecting it.
//
// Two halves:
//
//   1. DERIVE (FR-027). Project the recorded treatment onto the diacritic-
//      behaviour axis A4 and the mark-input-order sub-axis A3a. `computedAxes`
//      already exists as an additive optional field on `SurveyPhaseResult` and
//      is merged into `session.axes` by `mergePhaseResults`, so emitting it is
//      all that is needed — no contract change. Precedence comes for free:
//      `defaultFillAxes` structurally never overwrites an axis already present,
//      so a recorded answer beats a default-filled prior. That precedence is
//      nonetheless STATED in specs/007-strategy-selection §7.2 rather than left
//      implicit in behaviour (FR-025).
//
//   2. SURFACE (FR-024). Where the recorded answer and the strategy actually
//      selected imply different mechanisms for the same mark, say so rather than
//      building it. The check deliberately runs on the SELECTED STRATEGY, after
//      `selectStrategy` — not on the raw axis. A base keyboard whose own
//      behaviour the author knowingly chose against is a legitimate override,
//      not a disagreement; only a contradiction with the selection counts.
//
// The direction of derivation is treatment → A4, never the reverse: A4 is
// coarser (four values covering stacking/cycling/multi-family) and cannot
// express per-mark treatment or promotions, so deriving the other way would lose
// information — and the author's explicit answer is the better authority anyway.

import type {
  ConfirmedAlphabet,
  DiacriticBehavior,
  MarkInputOrder,
  StrategyRecommendation,
} from "@keyboard-studio/contracts";
import type { MarkClass } from "./mark-classes.js";
import { dominantTreatment, isClassMixed, treatmentFor } from "./treatment.js";
import type { MarkTreatmentAnswer } from "./treatment.js";
import type { MarkTreatmentPrefill } from "./treatment-prefill.js";

export interface MarksReconcileInputs {
  alphabet: ConfirmedAlphabet;
  classes: MarkClass[];
  prefills: MarkTreatmentPrefill[];
  treatment: MarkTreatmentAnswer;
}

export interface MarksComputedAxes {
  /** A4, derived from the recorded treatments. */
  diacriticBehavior: DiacriticBehavior;
  /** A3a, the recorded order — carried verbatim. */
  markInputOrder: MarkInputOrder;
  /**
   * Classes whose members do not all resolve to the same treatment. A mixed
   * class contributes its DOMINANT treatment to the class-level axis, and the
   * mix is reported here rather than silently flattened (spec 052 mixed-class
   * edge case).
   */
  mixedClassIds: string[];
}

/**
 * Mark families, approximated the same way `mark-classes.ts` buckets marks: two
 * marks are in different families when they sit differently relative to the
 * base. This is the coarsest signal that distinguishes "one family of stacking
 * marks" from "multiple mark families" — the two A4 values this station can
 * actually justify.
 *
 * A mark class is the unit here: `groupMarkClasses` already clusters by function
 * bucket first, so a class id's bucket prefix IS its family.
 *
 * KNOWN LIMITATION (inherited from `mark-classes.ts`'s documented v1
 * approximation, and now load-bearing for the first time — before this module the
 * bucket only backed the §7.5 fixture table, which supplies its own axis vector).
 * Attachment position is a *glyph* signal, not a linguistic one. A single
 * functional mark system that happens to span positions — a tone orthography
 * using above-marks plus one below-mark, in the style of some Southeast Asian and
 * West African orthographies — derives `"multi-family"` from glyph geometry
 * alone, and A4=multi-family plus A1=large fires §7.2 rule 6 (S-06 two-tier
 * chained deadkeys) where a single-family S-02 would have served. The failure
 * mode is a *more elaborate* mechanism than needed, never a broken one, and the
 * author can still override the axis downstream — so it is recorded as a caveat
 * rather than guessed around. `strategy-reconcile.test.ts` pins the behaviour so
 * a future functional-family signal changes it deliberately.
 *
 * Fixing it properly needs a functional-family signal the survey does not yet
 * elicit (which marks belong to one system, independent of where they sit).
 */
function familyOf(markClass: MarkClass): string {
  const [bucket] = markClass.id.split("-");
  return bucket ?? markClass.id;
}

/**
 * Project the recorded treatment onto A4 and A3a (FR-027).
 *
 * A4 derivation:
 *
 * | Recorded state | `diacriticBehavior` |
 * |---|---|
 * | every mark `composed` | `"none"` |
 * | ≥1 `own-key`, one mark family | `"stacking-combining"` |
 * | ≥1 `own-key`, two or more mark families | `"multi-family"` |
 *
 * `"replacing-cycling"` is **never** derived here. It describes a distinct
 * behaviour (a key that cycles a base through its marked forms, Vietnamese-Telex
 * style) which this station does not elicit at all — deriving it from an absence
 * of evidence would be a guess wearing a measurement's clothes.
 */
export function deriveMarksComputedAxes(inputs: MarksReconcileInputs): MarksComputedAxes {
  const { alphabet, classes, prefills, treatment } = inputs;

  const productiveFamilies = new Set<string>();
  const mixedClassIds: string[] = [];

  for (const markClass of classes) {
    if (isClassMixed(markClass, treatment, classes, prefills)) {
      mixedClassIds.push(markClass.id);
    }
    // A mixed class contributes its dominant treatment (edge case).
    if (dominantTreatment(markClass, treatment, classes, prefills) === "own-key") {
      productiveFamilies.add(familyOf(markClass));
    }
  }

  // A mark belonging to no class still counts if it resolves to own-key — the
  // classes are a grouping convenience, not the authority on what was recorded.
  for (const mark of alphabet.marks) {
    const inAClass = classes.some((c) => c.marks.includes(mark));
    if (!inAClass && treatmentFor(mark, treatment, classes, prefills) === "own-key") {
      productiveFamilies.add("other");
    }
  }

  const diacriticBehavior: DiacriticBehavior =
    productiveFamilies.size === 0
      ? "none"
      : productiveFamilies.size === 1
        ? "stacking-combining"
        : "multi-family";

  return {
    diacriticBehavior,
    markInputOrder: treatment.inputOrder,
    mixedClassIds,
  };
}

/**
 * Strategies that produce a marked character by composing it as you type — i.e.
 * the marked form is never on a key of its own; it is built from a sequence.
 *
 * All five §7.3 cards that structurally qualify are listed, not just the obvious
 * three: an omission here is a silent pass, which is exactly the failure mode
 * this module exists to close.
 *
 *   - S-02 Deadkey composition — trigger then base.
 *   - S-03 Sequence replace — base then ASCII suffix.
 *   - S-05 Mnemonic spelling — a spelling expands to the marked char.
 *   - S-06 Chained deadkeys (two-tier) — `dk(family)+any(base)>index(...)`; the
 *     second tier IS the base key, so the marked form is composed, not keyed.
 *   - S-07 Diacritic cycle — a cycle key rewrites the preceding base into its
 *     marked forms; the marked char is still produced by a key sequence.
 *
 * Not listed: S-01 (direct substitution) and S-08 (modifier plane) place the
 * marked character on a key, which is what a `composed` treatment asks for;
 * S-09/S-11/S-13 are structural wrappers or cluster-shaping rules that do not by
 * themselves decide how a mark reaches the page.
 */
const COMPOSE_AS_YOU_TYPE_STRATEGIES = new Set(["S-02", "S-03", "S-05", "S-06", "S-07"]);

export interface DisagreementInputs extends MarksReconcileInputs {
  /** The recommendation `selectStrategy` actually returned. */
  selection: StrategyRecommendation;
}

/**
 * Report contradictions between the recorded mark treatment and the strategy
 * actually selected (FR-024). Empty = they agree.
 *
 * This runs AFTER `selectStrategy`, on the selection — not on the raw axis
 * vector. That placement is load-bearing: the base keyboard's own mechanism is
 * one of the station's proposal signals, so an author may knowingly choose
 * against it, and that is a legitimate override rather than a contradiction to
 * surface. Only a recorded answer that the *selected mechanism* cannot honour
 * counts (SC-011).
 *
 * The surfacing half is NOT made redundant by the derivation: §7.2 rule 5 fires
 * on `A3=strong AND A1 ∈ {medium, large}` alone, so a keyboard can select a
 * compose-as-you-type primary on phonetic-intuition grounds even when the
 * derived A4 is `"none"`. That is precisely the contradiction FR-024 exists to
 * catch, and no amount of deriving A4 correctly would prevent it.
 *
 * The messages are designer-facing: plain language, no production jargon.
 */
export function surfaceStrategyDisagreement(inputs: DisagreementInputs): string[] {
  const { alphabet, classes, prefills, treatment, selection } = inputs;
  const problems: string[] = [];

  const anyOwnKey = alphabet.marks.some(
    (mark) => treatmentFor(mark, treatment, classes, prefills) === "own-key",
  );
  const everyComposed = alphabet.marks.length > 0 && !anyOwnKey;

  const primaryComposes = COMPOSE_AS_YOU_TYPE_STRATEGIES.has(selection.primary);

  if (everyComposed && primaryComposes) {
    problems.push(
      "You chose to give each marked character a key of its own, but the mechanism " +
        "selected for this keyboard builds marked characters up as you type. One of " +
        "the two has to change before the keyboard is built.",
    );
  }

  return problems;
}
