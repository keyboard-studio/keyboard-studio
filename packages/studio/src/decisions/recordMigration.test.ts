// Tests for recordMigration (specs/055-legible-decision-trail research D-01,
// contract §5, SC-011).
//
// The v1 fixture below is shaped the way the SHIPPED v1 build actually wrote
// records: editor-action counts as plain (possibly-zero) numbers, and a
// captured impact as a single flat `path`/`hunks`/`magnitude`, both pre-055.
// SC-011's claim is that reading it through `normalizeDecisionRecord` never
// lets a stored count (including a real `0`) or the old impact shape leak
// through as if it had been measured/produced by this feature.

import { describe, expect, it } from "vitest";
import { DECISION_RECORD_FORMAT, type DecisionRecord } from "@keyboard-studio/contracts";
import { normalizeDecisionRecord, type PreMigrationDecisionRecord } from "./recordMigration.ts";

const V1_RECORD: PreMigrationDecisionRecord = {
  format: DECISION_RECORD_FORMAT,
  version: 1,
  keyboardId: "sil_bambara",
  entries: [
    {
      entryId: "e1",
      stepId: "carve",
      payload: {
        kind: "editor-action",
        actionType: "gallery_edit",
        summary: {
          // The ambiguous case this whole module exists for: a stored `0`
          // that the v1 build never actually measured, indistinguishable by
          // shape from a real "measured zero".
          keysRemoved: 0,
          keysAdded: 12,
          mechanismsAssigned: 3,
          touchKeysAffected: 1,
          sample: ["K_A", "K_B"],
          sampleTruncated: false,
        },
      },
      provenance: { agency: "hand-set" },
      recordedAt: 1_700_000_000_000,
      supersedes: null,
      impact: {
        state: "captured",
        // The pre-055 flat shape: one path, not a `files` array.
        path: "source/sil_bambara.kmn",
        hunks: [
          { oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [" a", "-b", "+c", "+d"] },
        ],
        magnitude: { added: 2, removed: 1 },
      },
    },
    {
      entryId: "e2",
      stepId: "il_target_script",
      payload: {
        kind: "survey-answer",
        questionId: "il_target_script",
        answerType: "select",
        value: "Latn",
      },
      provenance: { agency: "base-derived", source: "base" },
      recordedAt: 1_700_000_001_000,
      supersedes: null,
      // No `impact` at all — never captured.
    },
    {
      entryId: "e3",
      stepId: "mechanisms",
      payload: {
        kind: "editor-action",
        actionType: "mechanism_edit",
        summary: {
          keysRemoved: 0,
          keysAdded: 0,
          mechanismsAssigned: 0,
          touchKeysAffected: 0,
          sample: [],
          sampleTruncated: false,
        },
      },
      provenance: { agency: "hand-set" },
      recordedAt: 1_700_000_002_000,
      supersedes: null,
      // Shed after capture — `null`, not absent, and must stay `null`.
      impact: null,
    },
  ],
  truncated: null,
};

describe("normalizeDecisionRecord — v1 fixture (SC-011)", () => {
  it("reads every editor-action count as absent, never as the stored number", () => {
    const normalized = normalizeDecisionRecord(V1_RECORD);
    const entry = normalized.entries[0]!;
    if (entry.payload.kind !== "editor-action") throw new Error("expected editor-action");
    const summary = entry.payload.summary;

    // Explicit absence, not a falsiness check — a stored `0` is falsy too and
    // would pass a naive `!summary.keysRemoved` assertion.
    expect("keysRemoved" in summary).toBe(false);
    expect("keysAdded" in summary).toBe(false);
    expect("mechanismsAssigned" in summary).toBe(false);
    expect("touchKeysAffected" in summary).toBe(false);
    expect(summary.keysRemoved).toBeUndefined();
    expect(summary.keysAdded).toBeUndefined();
    expect(summary.mechanismsAssigned).toBeUndefined();
    expect(summary.touchKeysAffected).toBeUndefined();

    // What is NOT normalized away: the sample stays intact.
    expect(summary.sample).toEqual(["K_A", "K_B"]);
    expect(summary.sampleTruncated).toBe(false);
  });

  it("lifts a captured impact's flat path/hunks/magnitude into a one-element files array", () => {
    const normalized = normalizeDecisionRecord(V1_RECORD);
    const impact = normalized.entries[0]!.impact;
    if (impact === undefined || impact === null || impact.state !== "captured") {
      throw new Error("expected a captured impact");
    }
    expect(impact.files).toEqual([
      {
        path: "source/sil_bambara.kmn",
        hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, lines: [" a", "-b", "+c", "+d"] }],
        magnitude: { added: 2, removed: 1 },
      },
    ]);
    // The aggregate is preserved unchanged at the top level.
    expect(impact.magnitude).toEqual({ added: 2, removed: 1 });
  });

  it("leaves a survey-answer entry untouched", () => {
    const normalized = normalizeDecisionRecord(V1_RECORD);
    expect(normalized.entries[1]).toEqual(V1_RECORD.entries[1]);
  });

  it("keeps a shed impact as null, not absent", () => {
    const normalized = normalizeDecisionRecord(V1_RECORD);
    const entry = normalized.entries[2]!;
    expect("impact" in entry).toBe(true);
    expect(entry.impact).toBeNull();
  });

  it("treats a missing version field as v1", () => {
    const { version: _version, ...withoutVersion } = V1_RECORD;
    // A pre-055 build may not have written `version` at all — cast through
    // `unknown` because omitting a required field is exactly what is under
    // test, not a mistake to silence.
    const record = withoutVersion as unknown as PreMigrationDecisionRecord;
    const normalized = normalizeDecisionRecord(record);
    const entry = normalized.entries[0]!;
    if (entry.payload.kind !== "editor-action") throw new Error("expected editor-action");
    expect("keysAdded" in entry.payload.summary).toBe(false);
  });

  it("does not mutate the input record", () => {
    const before = structuredClone(V1_RECORD);
    normalizeDecisionRecord(V1_RECORD);
    expect(V1_RECORD).toEqual(before);
  });
});

describe("normalizeDecisionRecord — v2 identity", () => {
  const V2_RECORD: DecisionRecord = {
    format: DECISION_RECORD_FORMAT,
    version: 2,
    keyboardId: "sil_bambara",
    entries: [
      {
        entryId: "e1",
        stepId: "carve",
        payload: {
          kind: "editor-action",
          actionType: "gallery_edit",
          summary: {
            keysRemoved: 0,
            keysAdded: 12,
            sample: ["K_A"],
            sampleTruncated: false,
          },
        },
        provenance: { agency: "hand-set" },
        recordedAt: 1_700_000_000_000,
        supersedes: null,
        impact: {
          state: "captured",
          files: [
            {
              path: "source/sil_bambara.kmn",
              hunks: [],
              magnitude: { added: 0, removed: 0 },
            },
          ],
          magnitude: { added: 0, removed: 0 },
        },
      },
    ],
    truncated: null,
  };

  it("passes a version-2 record through unchanged, by reference", () => {
    expect(normalizeDecisionRecord(V2_RECORD)).toBe(V2_RECORD);
  });

  it("does not strip a v2 record's genuinely-measured absent counts", () => {
    // v2's `EditorActionSummary` already permits omitting a count that a
    // producer genuinely did not measure (unrelated to this migration) — the
    // identity pass-through must not disturb that either.
    const normalized = normalizeDecisionRecord(V2_RECORD);
    const entry = normalized.entries[0]!;
    if (entry.payload.kind !== "editor-action") throw new Error("expected editor-action");
    expect(entry.payload.summary.keysAdded).toBe(12);
    expect("mechanismsAssigned" in entry.payload.summary).toBe(false);
  });
});
