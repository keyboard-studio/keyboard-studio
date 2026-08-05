// stageText — the two pieces of trail prose that MUST read identically on the
// entry rows and on the stage roll-ups above them
// (specs/055-legible-decision-trail FR-008, SC-007).
//
// Both DecisionEntryRow (one entry's headline) and DecisionTrailView (a stage's
// one-line account) have to turn an `EditorActionType` into an author-facing
// stage name, and both have to join a list of already-localized clauses. Held
// here as one implementation each, because SC-007 depends on the two surfaces
// never disagreeing about what a stage is CALLED — and two switch statements
// over the same closed union in two files is precisely the shape that drifts
// when a fourth `EditorActionType` lands and only one of them is updated.
//
// Plain module, not a hook: `msg()` only DEFINES the descriptor and
// `resolveMessage` resolves it against the caller's `i18n`, the same
// convention existingMethodLabels.ts and publishManagedPRErrorMessage.ts
// already use for shared label composition outside a component. The message
// ids are unchanged from when these lived inline, so the catalog is untouched.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { EditorActionType } from "@keyboard-studio/contracts";
import { resolveMessage } from "../lib/i18nResolve.ts";

const STAGE_ACTION_MESSAGE: Record<EditorActionType, ReturnType<typeof msg>> = {
  gallery_edit: msg({
    id: "trail.entry.headline.stage.galleryEdit",
    message: "Edited the character gallery",
  }),
  mechanism_edit: msg({
    id: "trail.entry.headline.stage.mechanismEdit",
    message: "Assigned key mechanisms",
  }),
  touch_edit: msg({
    id: "trail.entry.headline.stage.touchEdit",
    message: "Edited the touch layout",
  }),
};

/**
 * An editor stage as author-facing prose.
 *
 * `EditorActionType` is a code (FR-008) and this is the ONE place it is ever
 * mapped to text — a raw `actionType` must never reach the author. A `Record`
 * over the closed union rather than a `switch`, so adding a fourth action type
 * is a compile error here instead of a silently missing case in one of two
 * files.
 */
export function stageActionLabel(actionType: EditorActionType, i18n?: I18n): string {
  return resolveMessage(i18n, STAGE_ACTION_MESSAGE[actionType]);
}

/**
 * Join already-localized clauses into one list, in the reader's locale.
 *
 * `Intl.ListFormat` rather than `join(", ")`: a hardcoded separator bakes an
 * English list convention into a string that has already been through the
 * catalog, with no seam a translator can reach — the same reason
 * `trail.entry.headline.baseContribution.joinTwo` exists for the two-item
 * case. Locale-correct for the conjunctions and separators other locales use
 * (e.g. Chinese "、", or an Oxford "and" before the last item in English).
 *
 * Falls back to a comma-space join when no `i18n` is in scope, matching
 * `resolveMessage`'s own "assert on the English source text" convention for
 * argument-less test calls.
 */
export function formatClauseList(items: readonly string[], i18n?: I18n): string {
  if (i18n === undefined) return items.join(", ");
  return new Intl.ListFormat(i18n.locale, { style: "long", type: "conjunction" }).format(items);
}
