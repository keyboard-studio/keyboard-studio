// headline — the one plain-language line that describes a decision
// (specs/053-decision-audit FR-013, FR-016).
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

import type { DecisionEntry, DecisionPayload, DecisionProvenance } from "@keyboard-studio/contracts";

/** Which catalogue message a headline uses, and the values it interpolates. */
export type HeadlineSpec =
  | { id: "chose"; question: string; value: string }
  | { id: "acceptedSuggested"; question: string; value: string; source: string }
  | { id: "fromBase"; question: string; value: string }
  | {
      id: "editorStep";
      editor: string;
      // Optional per specs/055-legible-decision-trail FR-005/FR-005a: absent
      // means "not measured" and must render as words, never coerced to a
      // number. The component (not this selection function) is where that
      // rendering happens — see DecisionEntryRow.tsx.
      keysRemoved: number | undefined;
      keysAdded: number | undefined;
      mechanismsAssigned: number | undefined;
      touchKeysAffected: number | undefined;
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

/**
 * Choose the headline for one entry.
 *
 * The three survey forms map one-to-one onto {@link DecisionProvenance.agency},
 * which is the whole reason agency is a separate axis from source: "Accepted
 * suggested Latn from langtags" and "Chose Latn" are different claims about the
 * same value, and an author auditing their own keyboard needs to see which one
 * applies.
 */
export function headlineFor(entry: DecisionEntry): HeadlineSpec {
  return headlineOf(entry.payload, entry.provenance);
}

/** Payload/provenance form, so tests need not build a whole entry. */
export function headlineOf(
  payload: DecisionPayload,
  provenance: DecisionProvenance,
): HeadlineSpec {
  if (payload.kind === "editor-action") {
    return {
      id: "editorStep",
      editor: payload.actionType,
      keysRemoved: payload.summary.keysRemoved,
      keysAdded: payload.summary.keysAdded,
      mechanismsAssigned: payload.summary.mechanismsAssigned,
      touchKeysAffected: payload.summary.touchKeysAffected,
    };
  }

  if (payload.kind === "base-contribution") {
    // No producer writes this payload yet (recordBaseContribution.ts,
    // specs/055-legible-decision-trail D-11, is a separate not-yet-landed
    // task, as is this headline's own catalogue message). Falls back to the
    // existing "chose" shape so the trail renders something true rather than
    // an unhandled discriminant; the fallback is intentionally plain rather
    // than a designed sentence for this payload.
    return { id: "chose", question: payload.baseId, value: payload.baseDisplayName };
  }

  const question = payload.questionId;
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
