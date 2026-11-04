// suggestionDispositions: accepted and declined suggested fixes, recorded in the
// spec 053 decision record so they are not offered again (spec 111 data-model
// "Suggested fix"; plan Article III: no new decision kind is added).
//
// A disposition is an ordinary `decision` entry whose id is
// `suggestion:<fix id>` and whose value is the status. Revisiting a
// suggestion supersedes its entry, as for any decision. Pending is never
// recorded: ignoring a suggestion changes nothing.

import type {
  DecisionEntry,
  DecisionProvenance,
  DecisionRecord,
} from "@keyboard-studio/contracts";

import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import type { SuggestedFix, SuggestedFixStatus } from "./consistencySuggestions.ts";

const PREFIX = "suggestion:";

/** The decision id a fix's disposition is recorded under. */
export function suggestionDecisionId(fixId: string): string {
  return `${PREFIX}${fixId}`;
}

/**
 * The recorded dispositions, keyed by fix id. A superseded entry is history;
 * the latest entry for an id wins.
 */
export function decidedSuggestions(
  record: Pick<DecisionRecord, "entries">,
): Map<string, Exclude<SuggestedFixStatus, "pending">> {
  const out = new Map<string, Exclude<SuggestedFixStatus, "pending">>();
  for (const entry of record.entries as readonly DecisionEntry[]) {
    const p = entry.payload;
    if (p.kind !== "decision" || !p.decisionId.startsWith(PREFIX)) continue;
    const status =
      typeof p.value === "object" && p.value !== null && !Array.isArray(p.value)
        ? p.value["status"]
        : undefined;
    if (status === "accepted" || status === "declined") {
      out.set(p.decisionId.slice(PREFIX.length), status);
    }
  }
  return out;
}

function provenanceFor(status: "accepted" | "declined"): DecisionProvenance {
  // Accepted: the stored value is the tool's proposal, unmodified. Declined:
  // the author overrode the offer, so it is theirs and the offer is kept.
  return status === "accepted"
    ? { agency: "tool-proposed", source: "analysis" }
    : { agency: "hand-set", proposed: { value: "accepted" } };
}

/** Record accept or skip for one fix. Returns false when nothing new was written. */
export function recordSuggestionDisposition(
  fix: Pick<SuggestedFix, "id" | "title">,
  status: "accepted" | "declined",
): boolean {
  const entryId = useDecisionLogStore.getState().append({
    stepId: "criteria",
    payload: {
      kind: "decision",
      decisionId: suggestionDecisionId(fix.id),
      value: { status },
      summary: `${status === "accepted" ? "Accepted" : "Skipped"}: ${fix.title}`.slice(0, 200),
    },
    provenance: provenanceFor(status),
  });
  return entryId !== null;
}
