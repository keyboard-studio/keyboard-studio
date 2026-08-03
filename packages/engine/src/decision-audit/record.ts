// record — serialize and (tolerantly) parse a decision record.
//
// Two asymmetric jobs:
//
//   serializeDecisionRecord is STRICT and byte-stable. Keys are written in a
//   fixed order rather than whatever order the in-memory object happens to
//   carry, so equal records serialize to equal bytes. The shed pass measures
//   against this output and the sidecar ships it, so "stable" here is what makes
//   both of those comparable at all.
//
//   parseDecisionRecord is TOLERANT and never throws. It is reading a draft
//   written by an older build, or a `.studio/decision-record.json` out of a
//   downloaded package, and the required outcome is always "show what is
//   readable and say what was not" — never "refuse the keyboard". Every row of
//   the contract's version-tolerance table is implemented below and named in a
//   comment where it happens.
//
// @see specs/053-decision-audit/contracts/decision-record.contract.md §2, §5
// @see specs/053-decision-audit/spec.md — SC-009

import {
  DECISION_RECORD_FORMAT,
  DECISION_RECORD_VERSION,
  DecisionEntrySchema,
  makeEmptyDecisionRecord,
  type DecisionEntry,
  type DecisionFileChange,
  type DecisionImpact,
  type DecisionRecord,
  type DiffHunk,
} from "@keyboard-studio/contracts";

/** Outcome of a tolerant read. */
export interface ParseDecisionRecordResult {
  record: DecisionRecord;
  /** Entries dropped because they failed validation. Non-zero means a partial read. */
  droppedCount: number;
  /** True when the input was absent, empty, or unparseable — `record` is then empty. */
  unreadable: boolean;
}

// ---------------------------------------------------------------------------
// Serialization — explicit key order
// ---------------------------------------------------------------------------

// `JSON.stringify` preserves the insertion order of string keys, so building
// each object with its fields assigned in a fixed order IS the stable-key-order
// mechanism. A sort-based canonicaliser would also be stable but would order the
// sidecar's fields alphabetically, which reads far worse for the human who opens
// it — and this file is read by reviewers, not only by machines.

function serializeHunk(hunk: DiffHunk): unknown {
  return {
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: [...hunk.lines],
  };
}

function serializeFileChange(change: DecisionFileChange): unknown {
  return {
    path: change.path,
    hunks: change.hunks.map(serializeHunk),
    magnitude: { added: change.magnitude.added, removed: change.magnitude.removed },
  };
}

function serializeImpact(impact: DecisionImpact): unknown {
  switch (impact.state) {
    case "captured":
      return {
        state: impact.state,
        files: impact.files.map(serializeFileChange),
        magnitude: { added: impact.magnitude.added, removed: impact.magnitude.removed },
        // Written only when present, same convention as `provenance.source`
        // below: absent and "solely responsible" are the same fact.
        ...(impact.sharedWith !== undefined ? { sharedWith: [...impact.sharedWith] } : {}),
      };
    case "none":
      return { state: impact.state };
    case "unavailable":
      return { state: impact.state, reason: impact.reason };
    default: {
      const _exhaustive: never = impact;
      return _exhaustive;
    }
  }
}

function serializeEntry(entry: DecisionEntry): unknown {
  const payload =
    entry.payload.kind === "survey-answer"
      ? {
          kind: entry.payload.kind,
          questionId: entry.payload.questionId,
          answerType: entry.payload.answerType,
          value: Array.isArray(entry.payload.value) ? [...entry.payload.value] : entry.payload.value,
        }
      : entry.payload.kind === "editor-action"
        ? {
            kind: entry.payload.kind,
            actionType: entry.payload.actionType,
            summary: {
              // Optional per specs/055 FR-005a: written only when the producer
              // actually measured the dimension. `JSON.stringify` drops an
              // `undefined`-valued property on its own, so an unmeasured count
              // is simply absent from the serialized form, never a written `0`.
              keysRemoved: entry.payload.summary.keysRemoved,
              keysAdded: entry.payload.summary.keysAdded,
              mechanismsAssigned: entry.payload.summary.mechanismsAssigned,
              touchKeysAffected: entry.payload.summary.touchKeysAffected,
              sample: [...entry.payload.summary.sample],
              sampleTruncated: entry.payload.summary.sampleTruncated,
            },
          }
        : {
            // base-contribution (specs/055-legible-decision-trail D-11). No
            // producer writes this payload yet (recordBaseContribution.ts is a
            // separate task); this branch only has to serialize the shape when
            // one eventually does.
            kind: entry.payload.kind,
            baseId: entry.payload.baseId,
            baseDisplayName: entry.payload.baseDisplayName,
            startingKeyCount: entry.payload.startingKeyCount,
            derivedAxes: [...entry.payload.derivedAxes],
            inheritedMetadata: entry.payload.inheritedMetadata.map((m) => ({
              field: m.field,
              value: m.value,
            })),
            instantiationMode: entry.payload.instantiationMode,
          };

  return {
    entryId: entry.entryId,
    stepId: entry.stepId,
    payload,
    provenance: {
      agency: entry.provenance.agency,
      // Written only when present: absent and "no proposal source" are the same
      // fact, and emitting `null` would make them look different on the way back.
      ...(entry.provenance.source !== undefined ? { source: entry.provenance.source } : {}),
    },
    recordedAt: entry.recordedAt,
    supersedes: entry.supersedes,
    // `impact` distinguishes three states and all three must survive a
    // round-trip: absent (never captured), null (captured then shed), and a
    // value. Only the first is omitted.
    ...(entry.impact === undefined
      ? {}
      : { impact: entry.impact === null ? null : serializeImpact(entry.impact) }),
  };
}

/**
 * Serialize for the package sidecar and for size measurement.
 *
 * Byte-identical for equal input. Indented for the reviewer who opens the file;
 * the indentation is part of the stable output, so the shed pass measures the
 * bytes that actually ship.
 */
export function serializeDecisionRecord(record: DecisionRecord): string {
  return JSON.stringify(
    {
      format: record.format,
      version: record.version,
      keyboardId: record.keyboardId,
      entries: record.entries.map(serializeEntry),
      truncated:
        record.truncated === null ? null : { shedCount: record.truncated.shedCount },
    },
    null,
    2,
  );
}

/** Byte length of the serialized record, for the shed budget. */
export function serializedRecordBytes(record: DecisionRecord): number {
  return new TextEncoder().encode(serializeDecisionRecord(record)).length;
}

// ---------------------------------------------------------------------------
// Tolerant parse
// ---------------------------------------------------------------------------

function unreadable(): ParseDecisionRecordResult {
  return { record: makeEmptyDecisionRecord(), droppedCount: 0, unreadable: true };
}

/**
 * Read a decision record, salvaging whatever validates.
 *
 * Never throws. Never rejects a record for having an unfamiliar `version`: a
 * future build's record is read entry by entry, and the entries that do not
 * validate against THIS build's schema are counted in `droppedCount` so the
 * trail can say the read was partial (contract §5).
 */
export function parseDecisionRecord(text: string | null | undefined): ParseDecisionRecordResult {
  // Row 1 — absent / empty.
  if (text === null || text === undefined || text.trim() === "") return unreadable();

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // Row 2 — not JSON.
    return unreadable();
  }
  // Row 2 — not an object (arrays included: a record is never an array).
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return unreadable();

  const obj = raw as Record<string, unknown>;

  // Not one of ours. The contract's table starts from "valid shape", and a
  // foreign `format` is the same class of input as "not an object": there is
  // nothing here to salvage, and guessing would invent entries.
  if (obj["format"] !== DECISION_RECORD_FORMAT) return unreadable();

  const rawEntries = obj["entries"];
  if (!Array.isArray(rawEntries)) return unreadable();

  const version = typeof obj["version"] === "number" ? obj["version"] : DECISION_RECORD_VERSION;
  const keyboardId = typeof obj["keyboardId"] === "string" ? obj["keyboardId"] : null;

  // Row 4 — validate entry by entry, keeping order. Row 6 — a duplicate
  // `entryId` is dropped and counted; the FIRST occurrence wins, so a
  // later-appended duplicate cannot displace the entry others already reference.
  const entries: DecisionEntry[] = [];
  const seenIds = new Set<string>();
  let droppedCount = 0;
  for (const candidate of rawEntries) {
    const parsed = DecisionEntrySchema.safeParse(candidate);
    if (!parsed.success) {
      droppedCount++;
      continue;
    }
    const entry = parsed.data as DecisionEntry;
    if (seenIds.has(entry.entryId)) {
      droppedCount++;
      continue;
    }
    seenIds.add(entry.entryId);
    entries.push(entry);
  }

  // Row 5 — a `supersedes` naming an id that is not in the surviving set is
  // degraded to null and the ENTRY IS KEPT. Dropping it instead would lose a
  // real decision because a different entry failed to validate; a broken link
  // costs only the "replaces" marker.
  const repaired = entries.map((entry) =>
    entry.supersedes !== null && !seenIds.has(entry.supersedes)
      ? { ...entry, supersedes: null }
      : entry,
  );

  const truncatedRaw = obj["truncated"];
  const truncated =
    typeof truncatedRaw === "object" &&
    truncatedRaw !== null &&
    typeof (truncatedRaw as { shedCount?: unknown }).shedCount === "number"
      ? { shedCount: (truncatedRaw as { shedCount: number }).shedCount }
      : null;

  return {
    record: {
      format: DECISION_RECORD_FORMAT,
      version,
      keyboardId,
      entries: repaired,
      truncated,
    },
    droppedCount,
    unreadable: false,
  };
}
