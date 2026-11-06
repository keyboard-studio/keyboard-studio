// historyProposalSeed — build the engine's HistoryProposalSeed for the
// proposed first HISTORY.md entry (spec 080 T042, contracts/studio-surfaces.md §3).
//
// Two sources, neither a new change journal:
//
// - The DECISION RECORD (supersession-aware `effectiveEntries`) supplies the
//   facts it holds verbatim: the base's identity + version
//   (`recordStartContribution`, written once at `choose_base`) and the
//   mechanism assignment targets (`recordEditorStep`'s `mechanism_edit`
//   summary sample).
// - The WORKING-COPY MODEL supplies what the keyboard gained and lost
//   (`historyModelFacts`): characters now typed that the starting keyboard
//   did not, and the carved character count the README also states.
//
// Deviation from research R6, recorded here: R6 read "characters added" from
// every `char-list` survey answer. Those answers are not additions — the
// marks step records each mark's permitted host letters in that shape, so a
// hand test's HISTORY claimed "Added 46 characters: a, A, e, E, ..." for a
// keyboard that added two. Likewise the `gallery_edit` summary's
// `keysRemoved` counts rule nodes + store slots (481 in that test), not
// characters or keys a reader would recognise (103 characters).

import { buildProducedSet, type DecisionRecord, type KeyboardIR, type SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { HistoryProposalSeed } from "@keyboard-studio/engine";
import { snapshotDecisionRecord } from "./decisionLogStore.ts";

/** Cap mechanism-edit samples merged into HISTORY seed — large keyboards can record thousands of edits (#2469). */
const MECHANISM_SAMPLE_CAP = 200;

/** What the working copy gained and lost relative to its starting keyboard. */
export interface HistoryModelFacts {
  /** Characters the keyboard now types that the starting keyboard did not, in assignment order. */
  charactersAdded: string[];
  /** The carved characters of the starting keyboard (the README's "removed" count). */
  charactersRemoved: number;
}

/** The working-copy slices {@link historyModelFacts} reads. */
export interface HistoryModelInput {
  startIr: KeyboardIR | null;
  phaseResults: readonly SurveyPhaseResult[];
  carveChars: ReadonlySet<string>;
}

/**
 * Added = every individual-scope assignment target (physical or touch) the
 * starting keyboard did not already produce, once each, in assignment order.
 * Removed = the carved character set's size — the same number the README's
 * "N characters of <start> were removed" note states.
 */
export function historyModelFacts(input: HistoryModelInput): HistoryModelFacts {
  if (input.startIr === null) return { charactersAdded: [], charactersRemoved: 0 };
  const startProduced = buildProducedSet(input.startIr);
  const added: string[] = [];
  const seen = new Set<string>();
  for (const phase of input.phaseResults) {
    for (const assignment of phase.assignments ?? []) {
      if (assignment.scope !== "individual") continue;
      const ch = assignment.target;
      if (ch === "" || seen.has(ch) || startProduced.has(ch)) continue;
      seen.add(ch);
      added.push(ch);
    }
  }
  return { charactersAdded: added, charactersRemoved: input.carveChars.size };
}

/**
 * Build the seed `buildHistoryProposal` (engine, `@keyboard-studio/engine`)
 * turns into the proposed HISTORY.md bullets.
 *
 * `record` defaults to the LIVE decision log. `facts` is the caller's
 * {@link historyModelFacts} of the working copy — this layer may not read the
 * working-copy store itself, so the `pf_history_entry` call site supplies it.
 *
 * - `base`: the recorded `base-contribution` entry's `startId` and its
 *   `inheritedMetadata` "version" field, but ONLY when
 *   `instantiationMode === "adapt-existing"` (Track 2). Track 1 and a net-new
 *   build both yield `null` — the "Adapted from" bullet (FR-012) is an
 *   adaptation-only fact.
 * - `charactersAdded` / `charactersRemoved`: from {@link historyModelFacts}.
 * - `mechanismsAssigned`: the `mechanism_edit` editor-action's bounded
 *   `summary.sample` (assignment targets — a character or a character-class
 *   id), in application order, minus the characters already listed as added
 *   so one character is not stated twice.
 */
export function buildHistoryProposalSeed(
  facts: HistoryModelFacts,
  record: DecisionRecord = snapshotDecisionRecord(),
): HistoryProposalSeed {
  let base: HistoryProposalSeed["base"] = null;
  const mechanismsAssigned: string[] = [];
  const added = new Set(facts.charactersAdded);

  const superseded = new Set<string>();
  for (const entry of record.entries) {
    if (entry.supersedes !== null) superseded.add(entry.supersedes);
  }

  for (const entry of record.entries) {
    if (superseded.has(entry.entryId)) continue;

    const payload = entry.payload;

    if (payload.kind === "base-contribution") {
      if (payload.instantiationMode === "adapt-existing") {
        const version =
          payload.inheritedMetadata.find((m) => m.field === "version")?.value ?? "";
        base = { id: payload.startId, version };
      }
      continue;
    }

    if (payload.kind === "editor-action" && payload.actionType === "mechanism_edit") {
      for (const target of payload.summary.sample) {
        if (added.has(target)) continue;
        mechanismsAssigned.push(target);
        if (mechanismsAssigned.length >= MECHANISM_SAMPLE_CAP) break;
      }
    }
    if (mechanismsAssigned.length >= MECHANISM_SAMPLE_CAP) break;
  }

  return {
    base,
    charactersAdded: [...facts.charactersAdded],
    mechanismsAssigned,
    charactersRemoved: facts.charactersRemoved,
  };
}
