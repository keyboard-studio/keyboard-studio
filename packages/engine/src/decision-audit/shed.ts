// shed — fit a decision record into a byte budget by dropping diff detail.
//
// The failure mode this exists to prevent: a long session's diff payloads push a
// draft past the cloud-sync ceiling, and the whole draft silently stops syncing.
// Shedding turns that into "less detail synced", which is recoverable, instead of
// "nothing synced", which is not (research D-09).
//
// What it will and will not give up is not negotiable:
//   - it drops `impact` payloads, largest first, ties broken by oldest;
//   - it NEVER drops an entry, and never touches `entryId`, `payload`,
//     `provenance`, or `supersedes`. Those are the decisions themselves. Losing
//     one would make the trail lie about what the author did; losing a diff only
//     makes it say less about what that did to the source.
//   - it records `truncated: { shedCount }`, so the trail states the loss rather
//     than presenting a thinned record as complete.
//
// @see specs/053-decision-audit/contracts/decision-record.contract.md §2, §6

import type { DecisionEntry, DecisionRecord } from "@keyboard-studio/contracts";
import { serializeDecisionRecord, serializedRecordBytes } from "./record.js";

/** One shed candidate: an entry with an `impact` payload worth its bytes. */
interface Candidate {
  index: number;
  /** Serialized size of this entry's impact, as the shed ordering key. */
  cost: number;
  recordedAt: number;
}

/**
 * Drop `impact` payloads until the serialized record fits `maxBytes`.
 *
 * Returns the record unchanged when it already fits (including its existing
 * `truncated`, which may be non-null from an earlier shed — that history is not
 * reset by a later save that happens to fit).
 *
 * A record whose entries have no impact left to give cannot be shrunk further;
 * it is returned at its floor size rather than mangled. The caller then decides
 * what to do about a record that is still too large — that judgement belongs to
 * the persistence layer's existing size check, not here.
 */
export function shedDecisionDetail(record: DecisionRecord, maxBytes: number): DecisionRecord {
  if (serializedRecordBytes(record) <= maxBytes) return record;

  const entries: DecisionEntry[] = [...record.entries];

  const candidates: Candidate[] = [];
  entries.forEach((entry, index) => {
    // Only a "captured" impact carries diff detail worth shedding. "none" and
    // "unavailable" already say everything they have to say in a few bytes;
    // setting them to `impact: null` would relabel "nothing to shed" as
    // "detail was dropped", which both DecisionEntryRow and prSummary read as
    // a lossy save when nothing was lost.
    if (entry.impact === undefined || entry.impact === null) return;
    if (entry.impact.state !== "captured") return;
    candidates.push({
      index,
      cost: new TextEncoder().encode(JSON.stringify(entry.impact)).length,
      recordedAt: entry.recordedAt,
    });
  });

  // Largest first; ties by oldest `recordedAt`. Both halves matter: largest-first
  // is what makes the shed terminate quickly, and the oldest tie-break is what
  // makes it DETERMINISTIC — two equal-sized impacts must always shed in the same
  // order or the same session could produce two different records.
  candidates.sort((a, b) => (b.cost - a.cost) || (a.recordedAt - b.recordedAt) || (a.index - b.index));

  let shedCount = 0;
  for (const candidate of candidates) {
    const entry = entries[candidate.index]!;
    // null, not absent: "captured then shed" is a distinct state from "never
    // captured", and the trail renders a shed notice for it (FR-011 spirit —
    // never a misleading empty change).
    entries[candidate.index] = { ...entry, impact: null };
    shedCount++;
    if (serializedRecordBytes({ ...record, entries }) <= maxBytes) break;
  }

  if (shedCount === 0) return record;

  return {
    ...record,
    entries,
    // Accumulated across saves: entries shed earlier already carry `impact: null`
    // and are not re-counted above, so adding to the prior count is what keeps
    // the total honest over a long session.
    truncated: { shedCount: (record.truncated?.shedCount ?? 0) + shedCount },
  };
}

/** Serialized size of a record, exposed so callers can check a budget without shedding. */
export { serializeDecisionRecord, serializedRecordBytes };
