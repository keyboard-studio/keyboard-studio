// recordMigration — pure read-time normalization of a pre-feature (v1)
// decision record (specs/055-legible-decision-trail research D-01, contract
// §5, SC-011).
//
// FR-005 makes absence mean "not measured". A record written by the shipped
// v1 build stores a PRESENT `0` (or any other number) for editor-action
// counts that were never actually measured, and absence cannot disambiguate
// that retroactively — the whole reason `DECISION_RECORD_VERSION` was bumped
// to 2. The record's own `version` field is already contracted as "a reader
// reads what it can" (decisionRecord.ts), so the version bump is the
// mechanism the format already has for exactly this: a record whose
// `version < 2` has its editor-action counts read as absent regardless of
// what is stored, and a captured impact's pre-widening flat
// `path`/`hunks`/`magnitude` lifted into the v2 one-element `files` array.
//
// THIS IS NOT RETROACTIVE ENRICHMENT (out of scope). Nothing is written back
// to storage, nothing is rewritten, and no activity is claimed that the v1
// build did not measure — the opposite: activity is UN-claimed. Every
// function here is pure: no I/O, no mutation of its input, a new value out.
//
// Lives beside `record.ts` (not in `packages/studio/src/decisions/`, where it
// was first drafted) because the seam that needs it is `parseDecisionRecord`
// itself (specs/055 T008): the strict v2 `DecisionEntrySchema` rejects a v1
// captured impact's flat shape outright (no `files` array), so a v1 entry
// must be normalized to the v2 shape BEFORE schema validation or it is
// dropped before this module ever sees it — normalizing downstream of
// validation would be a no-op for exactly the records this module exists to
// rescue. `record.ts` calls `normalizeDecisionRecord` per candidate entry,
// ahead of `DecisionEntrySchema.safeParse`. The engine cannot depend on the
// studio (`engine-not-to-studio`, .dependency-cruiser.cjs), which is the
// other reason this lives here: `decisionLogStore.ts`'s `hydrate` also calls
// it, defensively, on whatever a caller hands in — but by the time a record
// reaches `hydrate` via the studio's own read path it has already been
// normalized once by `parseDecisionRecord`, so that second call is a no-op
// for every record this build itself produces.

import {
  DECISION_RECORD_VERSION,
  type DecisionEntry,
  type DecisionImpact,
  type DecisionPayload,
  type DecisionRecord,
  type DiffHunk,
} from "@keyboard-studio/contracts";

/**
 * A captured impact exactly as the shipped v1 build wrote it: one file's
 * worth of change flattened onto the impact itself (contract §3 migration
 * note), rather than the v2 `files` array. Never appears on a `version >= 2`
 * record.
 */
interface LegacyCapturedImpact {
  state: "captured";
  path: string;
  hunks: readonly DiffHunk[];
  magnitude: { added: number; removed: number };
  sharedWith?: readonly string[];
}

/** An impact as it may be found on any record this module accepts. */
type PreMigrationImpact = DecisionImpact | LegacyCapturedImpact;

/** An entry as it may be found on any record this module accepts. */
export interface PreMigrationEntry extends Omit<DecisionEntry, "impact"> {
  impact?: PreMigrationImpact | null;
}

/**
 * A record as it may be found on disk or in a restored draft: a `version >= 2`
 * record is exactly {@link DecisionRecord}; a `version < 2` record may still
 * carry the pre-055 flat impact shape this module lifts on read.
 */
export interface PreMigrationDecisionRecord extends Omit<DecisionRecord, "entries"> {
  entries: readonly PreMigrationEntry[];
}

function isLegacyCaptured(impact: PreMigrationImpact): impact is LegacyCapturedImpact {
  return impact.state === "captured" && "path" in impact;
}

/**
 * Normalize one entry's `impact` for a `version < 2` record.
 *
 * A v1 captured impact carried a single flat `path`/`hunks`/`magnitude`;
 * lifted here into the one-element `files` array the v2 shape expects, with
 * the aggregate `magnitude` preserved unchanged at the top level (contract
 * §3). `"none"`, `"unavailable"`, `null`, and an already-v2-shaped capture
 * all pass through untouched.
 */
function normalizeImpact(impact: PreMigrationImpact | null): DecisionImpact | null {
  if (impact === null) return null;
  if (!isLegacyCaptured(impact)) return impact;
  return {
    state: "captured",
    files: [{ path: impact.path, hunks: impact.hunks, magnitude: impact.magnitude }],
    magnitude: impact.magnitude,
    ...(impact.sharedWith !== undefined ? { sharedWith: impact.sharedWith } : {}),
  };
}

/**
 * Normalize one entry's `payload` for a `version < 2` record.
 *
 * Every {@link EditorActionSummary} count reads as absent regardless of what
 * is stored — a stored `0` is exactly the ambiguous case this normalizer
 * exists to resolve (research D-01), so all four counts are OMITTED from the
 * returned summary rather than carried over, even as `0` or unchanged. Any
 * payload that is not an editor action passes through untouched.
 */
function normalizePayload(payload: DecisionPayload): DecisionPayload {
  if (payload.kind !== "editor-action") return payload;
  return {
    kind: payload.kind,
    actionType: payload.actionType,
    summary: {
      sample: payload.summary.sample,
      sampleTruncated: payload.summary.sampleTruncated,
    },
  };
}

function normalizeEntry(entry: PreMigrationEntry): DecisionEntry {
  const payload = normalizePayload(entry.payload);
  if (entry.impact === undefined) {
    const { impact: _droppedImpact, ...rest } = entry;
    return { ...rest, payload };
  }
  return { ...entry, payload, impact: normalizeImpact(entry.impact) };
}

/**
 * Normalize a record on read.
 *
 * A `version >= 2` record is returned as-is (the same reference — there is
 * nothing to normalize). A `version < 2` record — including one with no
 * `version` at all, which a pre-055 build may not have written — is
 * normalized entry by entry per {@link normalizeEntry}. Never mutates
 * `record` and never writes anything back; the caller decides what to do
 * with the returned value.
 *
 * THE RETURNED RECORD IS TAGGED `version: DECISION_RECORD_VERSION`, because it
 * is a v2-shaped record: every entry has been through {@link normalizeEntry}.
 * Carrying the input's stale `1` forward would be a lie about the value handed
 * back, and a load-bearing one — a caller that stores the returned record
 * (decisionLogStore's `hydrate`, whose state `draftPersistence` snapshots)
 * would keep the v1 tag for the rest of the session, so the NEXT read would
 * re-run this migration over every entry appended in between and strip the
 * counts those entries genuinely measured. That is FR-005a's "absence must
 * never be fabricated" failure, relocated to the version boundary.
 */
export function normalizeDecisionRecord(record: PreMigrationDecisionRecord): DecisionRecord {
  const version = typeof record.version === "number" ? record.version : 1;
  if (version >= DECISION_RECORD_VERSION) return record as DecisionRecord;
  return {
    format: record.format,
    version: DECISION_RECORD_VERSION,
    keyboardId: record.keyboardId,
    entries: record.entries.map(normalizeEntry),
    truncated: record.truncated,
  };
}
