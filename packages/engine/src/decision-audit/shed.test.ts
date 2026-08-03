// Tests for shedDecisionDetail's candidate filter (specs/053-decision-audit).
//
// Regression target: the shed pass must only ever relabel a "captured" impact
// as shed (`impact: null`). A "none" or "unavailable" impact carries no diff
// detail to give up, so shedding one would make DecisionEntryRow and
// prSummary report "detail was dropped" about a decision that never had any —
// the exact bug this file locks against re-appearing.

import { describe, expect, it } from "vitest";
import { makeEmptyDecisionRecord, type DecisionEntry, type DecisionRecord } from "@keyboard-studio/contracts";
import { serializedRecordBytes, shedDecisionDetail } from "./shed.js";

function editorEntry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "d1",
    stepId: "carve",
    payload: {
      kind: "editor-action",
      actionType: "gallery_edit",
      summary: {
        keysRemoved: 4,
        keysAdded: 0,
        mechanismsAssigned: 0,
        touchKeysAffected: 0,
        sample: ["K_Q", "K_W"],
        sampleTruncated: true,
      },
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes: null,
    ...overrides,
  };
}

function recordOf(...entries: DecisionEntry[]): DecisionRecord {
  return { ...makeEmptyDecisionRecord("hausa_std"), entries };
}

describe("shedDecisionDetail — candidate filter", () => {
  it("never sheds a 'none' impact, even under an impossible budget", () => {
    const entry = editorEntry({ impact: { state: "none" } });
    const record = recordOf(entry);

    const shed = shedDecisionDetail(record, 1);

    expect(shed.entries).toHaveLength(1);
    expect(shed.entries[0]!.impact).toEqual({ state: "none" });
    expect(shed.truncated).toBeNull();
  });

  it("never sheds an 'unavailable' impact, even under an impossible budget", () => {
    const entry = editorEntry({
      impact: { state: "unavailable", reason: "lock-gate-dependency" },
    });
    const record = recordOf(entry);

    const shed = shedDecisionDetail(record, 1);

    expect(shed.entries).toHaveLength(1);
    expect(shed.entries[0]!.impact).toEqual({ state: "unavailable", reason: "lock-gate-dependency" });
    expect(shed.truncated).toBeNull();
  });

  it("leaves a mix of 'none'/'unavailable' entries untouched while shedding only the 'captured' one", () => {
    const noneEntry = editorEntry({ entryId: "n", recordedAt: 1, impact: { state: "none" } });
    const unavailableEntry = editorEntry({
      entryId: "u",
      recordedAt: 2,
      impact: { state: "unavailable", reason: "no-rederivable-write-path" },
    });
    const capturedEntry = editorEntry({
      entryId: "c",
      recordedAt: 3,
      impact: {
        state: "captured",
        files: [
          {
            path: "source/foo.kmn",
            hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [" a"] }],
            magnitude: { added: 0, removed: 0 },
          },
        ],
        magnitude: { added: 0, removed: 0 },
      },
    });
    const record = recordOf(noneEntry, unavailableEntry, capturedEntry);

    // A budget only the two untouchable impacts could possibly satisfy on
    // their own — forces the shed pass to exhaust every candidate it has.
    const shed = shedDecisionDetail(record, 1);

    expect(shed.entries).toHaveLength(3);
    expect(shed.entries.find((e) => e.entryId === "n")!.impact).toEqual({ state: "none" });
    expect(shed.entries.find((e) => e.entryId === "u")!.impact).toEqual({
      state: "unavailable",
      reason: "no-rederivable-write-path",
    });
    expect(shed.entries.find((e) => e.entryId === "c")!.impact).toBeNull();
    expect(shed.truncated).toEqual({ shedCount: 1 });
  });

  it("still sheds 'captured' impacts largest-first", () => {
    const small = editorEntry({
      entryId: "small",
      recordedAt: 10,
      impact: {
        state: "captured",
        files: [
          {
            path: "source/foo.kmn",
            hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [" a"] }],
            magnitude: { added: 0, removed: 0 },
          },
        ],
        magnitude: { added: 0, removed: 0 },
      },
    });
    const large = editorEntry({ entryId: "large", recordedAt: 20, impact: bigCapturedImpact() });
    const record = recordOf(small, large);

    const shed = shedDecisionDetail(record, 2_000);

    expect(shed.entries.find((e) => e.entryId === "large")!.impact).toBeNull();
    expect(shed.entries.find((e) => e.entryId === "small")!.impact).not.toBeNull();
    expect(shed.truncated).toEqual({ shedCount: 1 });
  });

  it("breaks a same-size tie by oldest recordedAt, deterministically", () => {
    const older = editorEntry({
      entryId: "older",
      recordedAt: 100,
      impact: {
        state: "captured",
        files: [
          {
            path: "source/foo.kmn",
            hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [" a"] }],
            magnitude: { added: 0, removed: 0 },
          },
        ],
        magnitude: { added: 0, removed: 0 },
      },
    });
    const newer = editorEntry({
      entryId: "newer",
      recordedAt: 200,
      impact: {
        state: "captured",
        files: [
          {
            path: "source/foo.kmn",
            hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [" a"] }],
            magnitude: { added: 0, removed: 0 },
          },
        ],
        magnitude: { added: 0, removed: 0 },
      },
    });
    // Equal-cost impacts (same shape/content), so the sort key falls through to
    // recordedAt. A budget that only needs ONE of the two shed isolates which
    // one the tie-break picked.
    const record = recordOf(older, newer);
    const bothSize = serializedRecordBytes(record);
    const shed = shedDecisionDetail(record, bothSize - 1);

    expect(shed.entries.find((e) => e.entryId === "older")!.impact).toBeNull();
    expect(shed.entries.find((e) => e.entryId === "newer")!.impact).not.toBeNull();
    expect(shed.truncated).toEqual({ shedCount: 1 });
  });

  it("never drops an entry, regardless of how many impacts are shed", () => {
    const entries = [
      editorEntry({ entryId: "n", recordedAt: 1, impact: { state: "none" } }),
      editorEntry({
        entryId: "u",
        recordedAt: 2,
        impact: { state: "unavailable", reason: "lock-gate-dependency" },
      }),
      editorEntry({ entryId: "c1", recordedAt: 3, impact: bigCapturedImpact() }),
      editorEntry({ entryId: "c2", recordedAt: 4, impact: bigCapturedImpact() }),
    ];
    const record = recordOf(...entries);

    const shed = shedDecisionDetail(record, 1);

    expect(shed.entries).toHaveLength(entries.length);
    expect(shed.entries.map((e) => e.entryId).sort()).toEqual(["c1", "c2", "n", "u"]);
    for (const entry of shed.entries) {
      const original = entries.find((e) => e.entryId === entry.entryId)!;
      expect(entry.entryId).toBe(original.entryId);
      expect(entry.payload).toEqual(original.payload);
      expect(entry.provenance).toEqual(original.provenance);
      expect(entry.supersedes).toBe(original.supersedes);
    }
  });
});

function bigCapturedImpact() {
  return {
    state: "captured" as const,
    files: [
      {
        path: "source/foo.kmn",
        hunks: [
          {
            oldStart: 1,
            oldLines: 200,
            newStart: 1,
            newLines: 200,
            lines: Array.from({ length: 200 }, (_, i) => `+line ${i} of a wide hunk payload`),
          },
        ],
        magnitude: { added: 200, removed: 0 },
      },
    ],
    magnitude: { added: 200, removed: 0 },
  };
}
