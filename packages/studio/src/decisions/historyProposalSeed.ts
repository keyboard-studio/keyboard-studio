// historyProposalSeed — build the engine's HistoryProposalSeed from the
// decision record already recorded for this working copy (spec 076 T042,
// research R6, contracts/studio-surfaces.md §3).
//
// NO NEW CHANGE JOURNAL (spec assumption). Every fact this module reads
// already lives in the decision-audit record: `recordBaseContribution`
// (decisions/recordBaseContribution.ts) writes the base's identity + version
// once at `choose_base`; `recordEditorStep` (decisions/recordEditorStep.ts)
// writes the carve/mechanisms editor-action summaries; `recordSurveyAnswers`
// (decisions/recordSurveyAnswers.ts) writes one entry per char-list answer
// (characters, marks, punctuation, convenience all record this way — see
// that module's header on why the "characters" EDITOR step is deliberately
// NOT a source of "characters added": a declared inventory is an answer,
// not an edit).
//
// Reads only EFFECTIVE entries (`effectiveEntries` — supersession-aware): a
// step revisited several times leaves every entry in the append-only record,
// but only the entry nothing later replaces contributes to the seed, so a
// walked-back-and-redone carve is counted once, at its current total, never
// twice.

import { effectiveEntries, type DecisionRecord } from "@keyboard-studio/contracts";
import type { HistoryProposalSeed } from "@keyboard-studio/engine";
import { snapshotDecisionRecord } from "./decisionLogStore.ts";

/**
 * Build the seed `buildHistoryProposal` (engine, `@keyboard-studio/engine`)
 * turns into the proposed HISTORY.md bullets.
 *
 * `record` defaults to the LIVE decision log (`snapshotDecisionRecord()`) —
 * the production call site (the `pf_history_entry` question) calls this with
 * no argument; tests pass a hand-built `DecisionRecord` for determinism.
 *
 * Derivation, per field:
 * - `base`: the recorded `base-contribution` entry's `baseId` and its
 *   `inheritedMetadata` "version" field, but ONLY when
 *   `instantiationMode === "adapt-existing"` (Track 2). Track 1
 *   (`new-from-base`, a copy) and a net-new build with no such entry at all
 *   both yield `null` — the "Adapted from" bullet (FR-012) is an
 *   adaptation-only fact, and Track 1 carries no base prose forward (R9).
 * - `charactersAdded`: every `char-list` survey answer's characters, in
 *   record order, across whichever steps declared them (characters, marks,
 *   punctuation, convenience).
 * - `mechanismsAssigned`: the `mechanism_edit` editor-action's bounded
 *   `summary.sample` (the assignment targets — an individual character or a
 *   character-class id; the keyboard-default's empty-string target is
 *   already filtered out at the point `recordEditorStep.ts` builds `sample`),
 *   in application order. The record's own `summary.mechanismsAssigned`
 *   COUNT is not read here — `HistoryProposalSeed.mechanismsAssigned` wants
 *   human-readable identifiers, not a number.
 * - `keysRemoved`: the `gallery_edit` editor-action's `summary.keysRemoved`
 *   (absent is treated as 0, matching the record's own absence-is-unmeasured
 *   convention — carve always measures this dimension when it fires at all).
 */
export function buildHistoryProposalSeed(
  record: DecisionRecord = snapshotDecisionRecord(),
): HistoryProposalSeed {
  let base: HistoryProposalSeed["base"] = null;
  let keysRemoved = 0;
  const mechanismsAssigned: string[] = [];
  const charactersAdded: string[] = [];

  for (const entry of effectiveEntries(record.entries)) {
    const payload = entry.payload;

    if (payload.kind === "base-contribution") {
      if (payload.instantiationMode === "adapt-existing") {
        const version =
          payload.inheritedMetadata.find((m) => m.field === "version")?.value ?? "";
        base = { id: payload.baseId, version };
      }
      continue;
    }

    if (payload.kind === "editor-action") {
      if (payload.actionType === "gallery_edit") {
        keysRemoved += payload.summary.keysRemoved ?? 0;
      } else if (payload.actionType === "mechanism_edit") {
        mechanismsAssigned.push(...payload.summary.sample);
      }
      continue;
    }

    // What remains is a "survey-answer" payload (the DecisionPayload union's
    // third member) — only its char-list shape declares characters.
    if (payload.answerType === "char-list") {
      charactersAdded.push(...payload.value);
    }
  }

  return { base, charactersAdded, mechanismsAssigned, keysRemoved };
}
