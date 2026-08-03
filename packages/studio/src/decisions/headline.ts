// headline — the one plain-language line that describes a decision
// (specs/053-decision-audit FR-013, FR-016; specs/055-legible-decision-trail
// FR-008 through FR-014).
//
// Composed in the STUDIO from the entry's structured payload and provenance —
// never from a string the engine pre-rendered. That split is what makes FR-016
// hold: the engine ships codes and counts, the studio ships the localized
// sentence. An engine that produced English prose would make the trail
// permanently monolingual no matter how good the catalogues were.
//
// This module returns the SHAPE of the headline (which message, with which
// values); the component turns it into text via the message catalogue. Keeping the
// selection here rather than in JSX is what lets FR-013's central claim — that the
// same value reads differently depending on who chose it — be unit-tested without
// rendering anything.
//
// Per specs/055-legible-decision-trail contracts/headline-spec.contract.md §1:
// question labels are resolved through an INJECTED `lookupQuestionLabel`, never
// imported here — that is what keeps this module testable with a stub map and no
// catalogue, no `I18n`, and no DOM (FR-008/FR-009). No variant below may carry a
// raw `questionId`, an action-type string used as prose, a `stepId`, a message id,
// or a field name; `stage`/`kind` values are codes the component maps to text.

import type {
  DecisionEntry,
  DecisionPayload,
  DecisionProvenance,
  EditorActionType,
} from "@keyboard-studio/contracts";

/** Author-facing question naming, injected so this module never imports a label store. */
export interface HeadlineDeps {
  /** Author-facing name for a question, or undefined when none is resolvable. */
  lookupQuestionLabel: (questionId: string) => string | undefined;
}

/**
 * A question's display name, or the FR-014 "unknown" case.
 *
 * `known: false` selects a fallback message that reads as prose — never a
 * blank, never the raw identifier.
 */
export type QuestionName = { known: true; label: string } | { known: false };

/**
 * The four editor-step counts, in the fixed order the contract names
 * (§3): `keysRemoved`, `keysAdded`, `mechanismsAssigned`, `touchKeysAffected`.
 */
export type HeadlineDimensionKind =
  | "keysRemoved"
  | "keysAdded"
  | "mechanismsAssigned"
  | "touchKeysAffected";

/** One dimension that something happened in — always present and non-zero (FR-011). */
export interface HeadlineDimension {
  kind: HeadlineDimensionKind;
  count: number;
}

/** Which catalogue message a headline uses, and the values it interpolates. */
export type HeadlineSpec =
  | { id: "chose"; question: QuestionName; value: string }
  | { id: "acceptedSuggested"; question: QuestionName; value: string; source: string }
  | { id: "fromBase"; question: QuestionName; value: string }
  | { id: "editorStep"; stage: EditorActionType; dimensions: readonly HeadlineDimension[] }
  | { id: "editorStepNoChange"; stage: EditorActionType }
  | { id: "editorStepUnmeasured"; stage: EditorActionType }
  | {
      id: "baseContribution";
      /** Author-facing base name (contract §2) — never `baseId`, the internal identifier. */
      baseName: string;
      /**
       * Omitted (not `0`) when the working copy's starting inventory could not
       * be measured — a genuinely empty base is a real `0` and IS mentioned
       * (recordBaseContribution.ts's absence convention).
       */
      startingKeyCount?: number;
      /**
       * Omitted when nothing was derived — mirrors the FR-011 dimension rule:
       * a present-but-empty contribution is not something that happened, so it
       * is not mentioned (never a fabricated "deriving 0 properties").
       */
      derivedAxisCount?: number;
      /** Omitted when nothing was inherited, by the same rule as {@link derivedAxisCount}. */
      inheritedFieldCount?: number;
    };

/**
 * Render a recorded answer value for display.
 *
 * A char-list joins with a space rather than a comma — the values are characters,
 * and commas read as though they were part of the alphabet. An empty list says so
 * in the value slot rather than rendering as a blank, since "the author chose
 * nothing here" is a real and different answer from "this is missing".
 */
export function formatAnswerValue(value: string | readonly string[] | boolean): string {
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "string") return value === "" ? "(blank)" : value;
  return value.length === 0 ? "(none)" : value.join(" ");
}

/** Resolve a question id to a {@link QuestionName} through the injected lookup (FR-009/FR-014). */
function resolveQuestion(questionId: string, deps: HeadlineDeps): QuestionName {
  const label = deps.lookupQuestionLabel(questionId);
  return label === undefined ? { known: false } : { known: true, label };
}

/** The fixed dimension order the contract names in §3. */
const DIMENSION_ORDER: readonly HeadlineDimensionKind[] = [
  "keysRemoved",
  "keysAdded",
  "mechanismsAssigned",
  "touchKeysAffected",
];

/**
 * Choose the headline for one entry.
 *
 * The three survey forms map one-to-one onto {@link DecisionProvenance.agency},
 * which is the whole reason agency is a separate axis from source: "Accepted
 * suggested Latn from langtags" and "Chose Latn" are different claims about the
 * same value, and an author auditing their own keyboard needs to see which one
 * applies.
 */
export function headlineFor(entry: DecisionEntry, deps: HeadlineDeps): HeadlineSpec {
  return headlineOf(entry.payload, entry.provenance, deps);
}

/** Payload/provenance form, so tests need not build a whole entry. */
export function headlineOf(
  payload: DecisionPayload,
  provenance: DecisionProvenance,
  deps: HeadlineDeps,
): HeadlineSpec {
  if (payload.kind === "editor-action") {
    const summary = payload.summary;
    const counts: Record<HeadlineDimensionKind, number | undefined> = {
      keysRemoved: summary.keysRemoved,
      keysAdded: summary.keysAdded,
      mechanismsAssigned: summary.mechanismsAssigned,
      touchKeysAffected: summary.touchKeysAffected,
    };

    // Present AND non-zero, in the fixed order (FR-011, SC-004). Absence and a
    // present 0 are both omitted here — they're distinguished below instead.
    const dimensions: HeadlineDimension[] = [];
    for (const kind of DIMENSION_ORDER) {
      const count = counts[kind];
      if (count !== undefined && count > 0) {
        dimensions.push({ kind, count });
      }
    }

    if (dimensions.length > 0) {
      return { id: "editorStep", stage: payload.actionType, dimensions };
    }

    // Nothing non-zero. Distinguish "measured, and every count was zero" from
    // "not measured" (FR-005a, SC-011) — never coerce undefined to 0 to decide.
    const allMeasured = DIMENSION_ORDER.every((kind) => counts[kind] !== undefined);
    if (allMeasured) {
      return { id: "editorStepNoChange", stage: payload.actionType };
    }
    return { id: "editorStepUnmeasured", stage: payload.actionType };
  }

  if (payload.kind === "base-contribution") {
    // baseName carries the author-facing display name; `payload.baseId` (the
    // internal identifier) never rides along in any variant field (FR-008).
    //
    // The two derived counts are lengths of the payload's own code lists
    // (`derivedAxes`, `inheritedMetadata`), always computable — unlike
    // `startingKeyCount`, which the payload itself may leave absent when the
    // inventory could not be measured. Per-code prose ("deriving cluster
    // handling and mark input order") is not this module's job: the codes
    // themselves stay on `payload.derivedAxes`/`payload.inheritedMetadata`,
    // which the component reads directly to resolve each one through the
    // `trail.entry.headline.axis.<id>` / `.field.<code>` catalogue with the
    // `.unknown` fallback (contract §2) — this selection only carries the
    // one-line summary's counts.
    const derivedAxisCount = payload.derivedAxes.length;
    const inheritedFieldCount = payload.inheritedMetadata.length;

    return {
      id: "baseContribution",
      baseName: payload.baseDisplayName,
      ...(payload.startingKeyCount !== undefined
        ? { startingKeyCount: payload.startingKeyCount }
        : {}),
      ...(derivedAxisCount > 0 ? { derivedAxisCount } : {}),
      ...(inheritedFieldCount > 0 ? { inheritedFieldCount } : {}),
    };
  }

  const question = resolveQuestion(payload.questionId, deps);
  const value = formatAnswerValue(payload.value);

  switch (provenance.agency) {
    case "tool-proposed":
      return {
        id: "acceptedSuggested",
        question,
        value,
        // A proposal always has a source in practice, but the type allows it to be
        // absent, and the headline must still be a sentence. "the tool" is the
        // truthful fallback: something proposed it, and we do not know what.
        source: provenance.source ?? "the tool",
      };
    case "base-derived":
      return { id: "fromBase", question, value };
    case "hand-set":
      return { id: "chose", question, value };
    default: {
      const _exhaustive: never = provenance.agency;
      return { id: "chose", question, value: String(_exhaustive) };
    }
  }
}
