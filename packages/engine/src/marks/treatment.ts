// Mark treatment — the S2 answer type (spec 052, FR-001/FR-004/FR-009).
//
// Replaces `MentalModelAnswer` ("own-letter" | "letter-plus-mark"), whose
// vocabulary asserted orthographic unithood: "is a marked letter its own letter
// of the alphabet?" is a collation and literacy-teaching question, and a
// category error for Devanagari dependent vowel signs, Arabic harakat, and
// Hebrew niqqud — all of which reach this station. The values here name the
// MECHANISM instead, so no value name can be read as a claim about unithood
// (FR-007).
//
// The answer is three independently-settable parts recorded at one station
// (FR-003): per-mark treatment, a set of promoted composed characters, and the
// keyboard-level input order folded in from the retired S3 station (FR-004).
// A single mutually-exclusive enum could not carry any two of those at once,
// which is the defect this type exists to fix — an orthography may legitimately
// want a productive mark on its own key AND two or three prominent composed
// characters on dedicated keys (Cameroonian tone orthographies are the
// motivating case).

import type { MarkInputOrder } from "@keyboard-studio/contracts";
import type { MarkClass } from "./mark-classes.js";

/**
 * Does this mark receive a key of its own?
 *
 * - `own-key` — the mark earns a dedicated key (or deadkey) and combines with
 *   any letter it may attach to. Produces one `MarkUnit` carrying the
 *   keyboard's `inputOrder`.
 * - `composed` — the mark has no key of its own; each reachable base+mark pair
 *   is produced as a whole unit and enters `ownLetterUnits`.
 */
export type MarkTreatment = "own-key" | "composed";

/** A base+mark combination elected onto a dedicated key. NFC-normalised. */
export type PromotedComposedCharacter = string;

/**
 * The complete S2 answer. One per keyboard.
 *
 * Treatment keeps the existing class-then-override two-map shape rather than
 * reinventing it: `classTreatment` carries the class-level answer seeded from
 * the prefill, `markTreatment` carries per-mark overrides only. A class may be
 * internally MIXED (some marks `own-key`, some `composed`) — that is legal and
 * load-bearing, so nothing downstream may assume one treatment per class.
 */
export interface MarkTreatmentAnswer {
  /** Class-level treatment, seeded from the prefill. Keyed by MarkClass.id. */
  classTreatment: Record<string, MarkTreatment>;
  /** Per-mark overrides only. An absent mark inherits its class's answer. */
  markTreatment: Record<string, MarkTreatment>;
  /** Promoted composed characters. Independent of treatment (FR-003). */
  promoted: PromotedComposedCharacter[];
  /** One value per keyboard, folded in from the retired S3 station (FR-004). */
  inputOrder: MarkInputOrder;
}

/** How the base keyboard produces marked letters, when detectable. */
export type BaseMarkMechanism = "combining-keystroke" | "precomposed";

/**
 * The prefill each class's answer starts from (FR-009: never an open choice).
 *
 * Declared here beside the answer type rather than in `treatment-prefill.ts`,
 * where it is computed, because `treatmentFor` resolves *through* it — a mark
 * with neither an override nor a class answer falls back to its class's
 * recommendation. Putting it in the computing module made the vocabulary module
 * import the computing module and the computing module import the vocabulary
 * module (via `promotion.ts`), a dependency cycle the architecture rules
 * correctly reject. The contract's own layout agrees: the prefill is documented
 * as part of the answer contract, not as a separate one.
 */
export interface MarkTreatmentPrefill {
  classId: string;
  recommended: MarkTreatment;
  /** Composed characters proposed for promotion, already budget-filtered. */
  promotionProposal: PromotedComposedCharacter[];
  /** The proposal signals (shown to the designer, amended spec 071 FR-011). */
  signals: {
    /** Widest attested base count among the class's marks. */
    productivitySpread: number;
    /** The base keyboard's own mechanism, when detectable. */
    baseMechanism: BaseMarkMechanism | null;
    /** False when the key budget cannot seat the promoted keys (FR-015). */
    promotionAffordable: boolean;
    /** Plain-language reason, present iff promotionAffordable is false. */
    unaffordableReason?: string;
  };
}

/** An empty answer with the given input order — every mark falls to its prefill. */
export function makeMarkTreatmentAnswer(
  inputOrder: MarkInputOrder = "postfix",
): MarkTreatmentAnswer {
  return { classTreatment: {}, markTreatment: {}, promoted: [], inputOrder };
}

/**
 * Resolve one mark's effective treatment: its own override, else its class's
 * answer, else the class's prefill recommendation. There is no unanswered
 * state — FR-009 forbids one, so the resolution chain always terminates
 * (`"composed"` is the final floor, reached only when a mark belongs to no
 * class and has no prefill: the mechanism that needs no key of its own).
 */
export function treatmentFor(
  mark: string,
  answer: MarkTreatmentAnswer,
  classes: MarkClass[],
  prefills: MarkTreatmentPrefill[],
): MarkTreatment {
  const override = answer.markTreatment[mark];
  if (override !== undefined) return override;

  const markClass = classes.find((c) => c.marks.includes(mark));
  if (markClass === undefined) return "composed";

  const classAnswer = answer.classTreatment[markClass.id];
  if (classAnswer !== undefined) return classAnswer;

  return prefills.find((p) => p.classId === markClass.id)?.recommended ?? "composed";
}

/**
 * Drop per-mark overrides whose mark is no longer in the alphabet (FR-020: an
 * override key that is not in `alphabet.marks` is dropped on re-proposal, not
 * carried). Returns a new record; the input is not mutated.
 */
export function pruneMarkOverrides(
  markTreatment: Record<string, MarkTreatment>,
  marks: readonly string[],
): Record<string, MarkTreatment> {
  const present = new Set(marks);
  const out: Record<string, MarkTreatment> = {};
  for (const [mark, treatment] of Object.entries(markTreatment)) {
    if (present.has(mark)) out[mark] = treatment;
  }
  return out;
}

/**
 * The class's dominant treatment — what an internally-mixed class contributes
 * to a class-level derivation (spec 052 mixed-class edge case). Ties go to
 * `own-key`: a class with any productive mark behaves productively for the
 * purpose of the class-level axis.
 */
export function dominantTreatment(
  markClass: MarkClass,
  answer: MarkTreatmentAnswer,
  classes: MarkClass[],
  prefills: MarkTreatmentPrefill[],
): MarkTreatment {
  let ownKey = 0;
  let composed = 0;
  for (const mark of markClass.marks) {
    if (treatmentFor(mark, answer, classes, prefills) === "own-key") ownKey++;
    else composed++;
  }
  return ownKey >= composed && ownKey > 0 ? "own-key" : "composed";
}

/** True when the class's marks do not all resolve to the same treatment. */
export function isClassMixed(
  markClass: MarkClass,
  answer: MarkTreatmentAnswer,
  classes: MarkClass[],
  prefills: MarkTreatmentPrefill[],
): boolean {
  const seen = new Set(
    markClass.marks.map((m) => treatmentFor(m, answer, classes, prefills)),
  );
  return seen.size > 1;
}
