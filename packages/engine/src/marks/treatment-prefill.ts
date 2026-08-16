// Mark-treatment prefill (spec 052, FR-009/FR-015; amends spec 071 FR-011):
// the recommended answer each mark-class's S2 confirmation starts from. FR-009
// forbids an unanswered open choice, so every class arrives with a
// recommendation already selected and its signals shown.
//
// Supersedes `mental-model-prefill.ts`. Three signals produce the
// recommendation; the third is the one spec 052 US3 exists to fix:
//
//   1. productivity spread — how many different base letters the class's marks
//      actually attach to in the confirmed alphabet (widely attached suggests
//      the community treats the mark as a productive modifier, so it earns its
//      own key);
//   2. the base keyboard's own mechanism — whether the keyboard this one derives
//      from already treats marks as a keystroke that combines with a letter
//      (deadkey or direct combining output) or ships whole precomposed letters;
//   3. the KEY BUDGET — whether the base keyboard has room for the additional
//      dedicated keys promotion would need. When it does not, promotion is
//      reported as UNAVAILABLE with the reason stated in plain language
//      (FR-015), and the option is never silently offered on a base that cannot
//      honour it.
//
// Signal 3 gates PROMOTION ONLY, never treatment (FR-017): `composed` needs no
// spare key, so at least one option is always selectable regardless of budget.
//
// Thresholds ship as named constants, calibrated later (spec assumption).

import type { ConfirmedAlphabet, KeyboardIR } from "@keyboard-studio/contracts";
import { isCombiningMarkChar } from "../character-discovery/characterMap.js";
import type { MarkClass } from "./mark-classes.js";
import { attestedBasesOf } from "./mark-classes.js";
import type { AttachmentProposal } from "./attachment-proposals.js";
import type {
  BaseMarkMechanism,
  MarkTreatment,
  MarkTreatmentPrefill,
} from "./treatment.js";
import { promotableCharacters } from "./promotion.js";

// `MarkTreatmentPrefill` and `BaseMarkMechanism` are declared in treatment.ts —
// see the JSDoc there for why. Re-exported so this module stays the single
// import site for everything prefill-related.
export type { BaseMarkMechanism, MarkTreatmentPrefill };

/** Attested-base spread at or above this suggests the mark earns its own key. */
export const PRODUCTIVITY_SPREAD_THRESHOLD = 3;

/**
 * Sibling detector to `detectMarkInputOrderFromImport`: does the base keyboard
 * emit combining marks as their own output (a keystroke that combines —
 * deadkey-resolved or direct), or only whole precomposed letters? Returns null
 * when the IR shows no mark-bearing output at all.
 */
export function detectBaseMarkMechanism(ir: KeyboardIR): BaseMarkMechanism | null {
  let sawPrecomposed = false;
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.output) {
        if (el.kind !== "char") continue;
        if (isCombiningMarkChar(el.value)) return "combining-keystroke";
        if (el.value.normalize("NFD").length > el.value.length) sawPrecomposed = true;
      }
    }
  }
  return sawPrecomposed ? "precomposed" : null;
}

/**
 * How much room the base keyboard has for additional dedicated keys.
 *
 * The structural slice of `@keyboard-studio/contracts`' `KeyBudget` this module
 * consumes, so the prefill depends on the *number* rather than on how the
 * measurement is made. Callers pass the canonical determination itself —
 * `measureKeyBudget(baseIr)`, which satisfies this shape.
 */
export interface KeyBudgetSignal {
  spareKeys: number;
}

export interface MarkTreatmentPrefillOptions {
  /** The keyboard this one derives from (null on a from-scratch track). */
  baseIr?: KeyboardIR | null;
  /**
   * The measured key budget, or `null` when it could not be measured (an empty
   * or opaque-only base — `measureKeyBudget` returns `null` there rather than
   * silently reporting "many").
   *
   * `undefined` and `null` are treated alike: the budget is unknown, so
   * promotion is not gated on it. That is the honest reading — an unmeasured
   * base is not evidence of no room — and it is why the parameter is explicit
   * rather than hidden inside a `null` check. What it must never again be is
   * *unsupplied by every caller*, which is the defect spec 052 US3 fixes: the
   * old prefill took a `spareKeys` parameter the studio never passed, so a
   * fully-booked base was always reported affordable.
   */
  keyBudget?: KeyBudgetSignal | null;
  /**
   * The confirmed attachment map, used to derive each class's promotion
   * proposal. Absent (the from-scratch / pre-S1 case) means no proposal is
   * derived and `promotionProposal` is empty — promotion is then ABSENT, not
   * unavailable.
   */
  attachments?: Record<string, Record<string, boolean>>;
  /** Locale tag for the case fold applied to promotable bases (spec 049). */
  bcp47?: string;
}

/**
 * Compute the S2 prefill for every mark-class: the recommended treatment, the
 * budget-filtered promotion proposal, and the signals that produced them.
 */
export function computeMarkTreatmentPrefills(
  alphabet: ConfirmedAlphabet,
  classes: MarkClass[],
  proposals: AttachmentProposal[],
  opts: MarkTreatmentPrefillOptions = {},
): MarkTreatmentPrefill[] {
  const attested = attestedBasesOf(alphabet);
  const baseMechanism = opts.baseIr != null ? detectBaseMarkMechanism(opts.baseIr) : null;
  const spareKeys = opts.keyBudget?.spareKeys ?? null;
  const attachments = opts.attachments;

  return classes.map((markClass) => {
    const spread = Math.max(
      0,
      ...markClass.marks.map((m) => (attested.get(m) ?? new Set()).size),
    );

    // What the author could promote, before the budget has a say. Derived from
    // the confirmed attachment map when there is one; otherwise nothing is
    // proposed and promotion is absent rather than unavailable.
    const promotable =
      attachments !== undefined
        ? promotableCharacters(alphabet, markClass, attachments, opts.bcp47)
        : [];

    // FR-015: the budget must seat one additional dedicated key per promoted
    // character. An unmeasured budget does not gate (see the options JSDoc).
    const promotionAffordable =
      spareKeys === null || promotable.length === 0 || promotable.length <= spareKeys;

    // FR-017: the budget gates PROMOTION only. Treatment is recommended from the
    // productivity and mechanism signals alone, so `composed` — which needs no
    // spare key — is always selectable.
    const recommended: MarkTreatment =
      spread >= PRODUCTIVITY_SPREAD_THRESHOLD || baseMechanism === "combining-keystroke"
        ? "own-key"
        : "composed";

    return {
      classId: markClass.id,
      recommended,
      promotionProposal: promotionAffordable ? promotable : [],
      signals: {
        productivitySpread: spread,
        baseMechanism,
        promotionAffordable,
        ...(promotionAffordable
          ? {}
          : {
              unaffordableReason: unaffordableReasonFor(promotable.length, spareKeys ?? 0),
            }),
      },
    };
  });
}

/**
 * The plain-language reason shown when promotion cannot be seated (FR-015,
 * SC-004). No production jargon: no deadkey, no encoding, no normalisation.
 */
export function unaffordableReasonFor(wanted: number, freeKeys: number): string {
  const keys = freeKeys === 1 ? "1 free key" : `${freeKeys} free keys`;
  return (
    `Giving ${wanted} of these letters a key of its own needs more keys than ` +
    `the keyboard you started from has spare (${keys}).`
  );
}
