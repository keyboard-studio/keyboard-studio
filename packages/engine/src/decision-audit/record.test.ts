// Tests for decision-record serialization, tolerant parsing, and shedding
// (specs/053 T011 — every row of contract §5, plus SC-009 in both directions).

import { describe, expect, it } from "vitest";
import {
  DECISION_RECORD_FORMAT,
  DECISION_RECORD_VERSION,
  makeEmptyDecisionRecord,
  type DecisionEntry,
  type DecisionRecord,
} from "@keyboard-studio/contracts";
import { parseDecisionRecord, serializeDecisionRecord } from "./record.js";
import { shedDecisionDetail } from "./shed.js";

function surveyEntry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "d1",
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId: "il_language_english",
      answerType: "text",
      value: "Hausa",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes: null,
    ...overrides,
  };
}

function editorEntry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "d2",
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
    recordedAt: 1_700_000_001_000,
    supersedes: null,
    impact: {
      state: "captured",
      files: [
        {
          path: "source/foo.kmn",
          hunks: [{ oldStart: 1, oldLines: 2, newStart: 1, newLines: 1, lines: [" a", "-b"] }],
          magnitude: { added: 0, removed: 1 },
        },
      ],
      magnitude: { added: 0, removed: 1 },
    },
    ...overrides,
  };
}

function recordOf(...entries: DecisionEntry[]): DecisionRecord {
  return { ...makeEmptyDecisionRecord("hausa_std"), entries };
}

describe("serializeDecisionRecord", () => {
  it("round-trips a record through serialize → parse", () => {
    const record = recordOf(surveyEntry(), editorEntry());
    const result = parseDecisionRecord(serializeDecisionRecord(record));
    expect(result.unreadable).toBe(false);
    expect(result.droppedCount).toBe(0);
    expect(result.record).toEqual(record);
  });

  it("is byte-identical for equal input regardless of key insertion order", () => {
    const a = recordOf(surveyEntry());
    // Same data, built with the object keys in a different order.
    const reordered: DecisionEntry = {
      supersedes: null,
      recordedAt: 1_700_000_000_000,
      provenance: { agency: "hand-set" },
      payload: {
        value: "Hausa",
        answerType: "text",
        questionId: "il_language_english",
        kind: "survey-answer",
      },
      stepId: "identity",
      entryId: "d1",
    };
    expect(serializeDecisionRecord(recordOf(reordered))).toBe(serializeDecisionRecord(a));
  });

  it("distinguishes never-captured from shed on the way out and back", () => {
    const never = surveyEntry({ entryId: "n1" });
    const shed = surveyEntry({ entryId: "s1", impact: null });
    const parsed = parseDecisionRecord(serializeDecisionRecord(recordOf(never, shed)));
    expect(parsed.record.entries[0]!.impact).toBeUndefined();
    expect(parsed.record.entries[1]!.impact).toBeNull();
  });
});

describe("parseDecisionRecord — contract §5 version tolerance", () => {
  it("row 1: absent or empty input is unreadable with an empty record", () => {
    for (const input of [null, undefined, "", "   "]) {
      const result = parseDecisionRecord(input);
      expect(result.unreadable).toBe(true);
      expect(result.record.entries).toEqual([]);
      expect(result.droppedCount).toBe(0);
    }
  });

  it("row 2: non-JSON, or JSON that is not an object, is unreadable", () => {
    for (const input of ["{not json", "[1,2,3]", '"a string"', "42", "null"]) {
      expect(parseDecisionRecord(input).unreadable).toBe(true);
    }
  });

  it("row 2 (extension): a foreign `format` is unreadable rather than half-read", () => {
    expect(parseDecisionRecord(JSON.stringify({ format: "something.else", entries: [] })).unreadable)
      .toBe(true);
  });

  it("row 3: an unrecognised version still reads the entries that validate", () => {
    const future = {
      format: DECISION_RECORD_FORMAT,
      version: 99,
      keyboardId: "hausa_std",
      entries: [surveyEntry(), { entryId: "bogus" }],
      truncated: null,
    };
    const result = parseDecisionRecord(JSON.stringify(future));
    expect(result.unreadable).toBe(false);
    expect(result.record.version).toBe(99);
    expect(result.record.entries).toHaveLength(1);
    expect(result.droppedCount).toBe(1);
  });

  it("row 4: invalid entries are dropped in place, valid ones keep their order", () => {
    const text = JSON.stringify({
      format: DECISION_RECORD_FORMAT,
      version: DECISION_RECORD_VERSION,
      keyboardId: null,
      entries: [
        surveyEntry({ entryId: "a" }),
        { entryId: "junk", stepId: 5 },
        surveyEntry({ entryId: "c" }),
      ],
      truncated: null,
    });
    const result = parseDecisionRecord(text);
    expect(result.record.entries.map((e) => e.entryId)).toEqual(["a", "c"]);
    expect(result.droppedCount).toBe(1);
  });

  it("row 4: a boolean question carrying a string value is a dropped entry", () => {
    // The per-answerType value discipline is enforced at runtime, not just in
    // the type — this is the case that would otherwise flow through silently.
    const text = JSON.stringify({
      format: DECISION_RECORD_FORMAT,
      version: DECISION_RECORD_VERSION,
      keyboardId: null,
      entries: [
        {
          ...surveyEntry(),
          payload: { kind: "survey-answer", questionId: "q", answerType: "boolean", value: "yes" },
        },
      ],
      truncated: null,
    });
    const result = parseDecisionRecord(text);
    expect(result.record.entries).toEqual([]);
    expect(result.droppedCount).toBe(1);
  });

  it("row 5: a dangling `supersedes` degrades to null and the entry is KEPT", () => {
    const text = JSON.stringify({
      format: DECISION_RECORD_FORMAT,
      version: DECISION_RECORD_VERSION,
      keyboardId: null,
      entries: [surveyEntry({ entryId: "later", supersedes: "vanished" })],
      truncated: null,
    });
    const result = parseDecisionRecord(text);
    expect(result.record.entries).toHaveLength(1);
    expect(result.record.entries[0]!.supersedes).toBeNull();
    expect(result.droppedCount).toBe(0);
  });

  it("row 6: a duplicate entryId is dropped and counted, first occurrence winning", () => {
    const text = JSON.stringify({
      format: DECISION_RECORD_FORMAT,
      version: DECISION_RECORD_VERSION,
      keyboardId: null,
      entries: [
        surveyEntry({ entryId: "dup", stepId: "first" }),
        surveyEntry({ entryId: "dup", stepId: "second" }),
      ],
      truncated: null,
    });
    const result = parseDecisionRecord(text);
    expect(result.record.entries).toHaveLength(1);
    expect(result.record.entries[0]!.stepId).toBe("first");
    expect(result.droppedCount).toBe(1);
  });

  it("carries `truncated` through so the trail can still say detail was dropped", () => {
    const record: DecisionRecord = { ...recordOf(surveyEntry()), truncated: { shedCount: 3 } };
    expect(parseDecisionRecord(serializeDecisionRecord(record)).record.truncated)
      .toEqual({ shedCount: 3 });
  });
});

describe("SC-009 — both directions of build compatibility", () => {
  it("a record this build writes is an ignorable unknown field for a build without the feature", () => {
    // The persisted shape is one optional field on the draft envelope. A build
    // that does not know the field reads the envelope by its own keys and never
    // touches this one — modelled here as a structural round-trip of the
    // envelope with an extra key present.
    const draftFromThisBuild = {
      version: 1,
      savedAt: 1,
      projectKey: "hausa_std",
      decisionRecord: recordOf(surveyEntry()),
    };
    const asOlderBuildSeesIt = JSON.parse(JSON.stringify(draftFromThisBuild)) as {
      version: number;
      projectKey: string;
    };
    expect(asOlderBuildSeesIt.version).toBe(1);
    expect(asOlderBuildSeesIt.projectKey).toBe("hausa_std");
  });

  it("a draft written without a decision record reads as an empty record here", () => {
    expect(parseDecisionRecord(undefined).record.entries).toEqual([]);
  });
});

describe("shedDecisionDetail", () => {
  it("returns the record unchanged when it already fits", () => {
    const record = recordOf(surveyEntry(), editorEntry());
    expect(shedDecisionDetail(record, 1_000_000)).toBe(record);
  });

  it("drops impact payloads largest-first and never drops an entry", () => {
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
    const large = editorEntry({
      entryId: "large",
      recordedAt: 20,
      impact: {
        state: "captured",
        files: [
          {
            path: "source/foo.kmn",
            hunks: [
              {
                oldStart: 1,
                oldLines: 200,
                newStart: 1,
                newLines: 200,
                lines: Array.from({ length: 400 }, (_, i) => `+line ${i} of a very wide hunk payload`),
              },
            ],
            magnitude: { added: 400, removed: 0 },
          },
        ],
        magnitude: { added: 400, removed: 0 },
      },
    });
    const record = recordOf(small, large);
    // A budget between the floor and the full size: the large impact alone must
    // be enough to get under it.
    const shed = shedDecisionDetail(record, 2_000);
    expect(shed.entries).toHaveLength(2);
    expect(shed.entries.find((e) => e.entryId === "large")!.impact).toBeNull();
    expect(shed.entries.find((e) => e.entryId === "small")!.impact).not.toBeNull();
    expect(shed.truncated).toEqual({ shedCount: 1 });
  });

  it("preserves entryId, payload, provenance, and supersedes on every shed entry", () => {
    const entry = editorEntry({ entryId: "keepme", supersedes: "earlier" });
    const shed = shedDecisionDetail(recordOf(surveyEntry({ entryId: "earlier" }), entry), 1);
    const after = shed.entries.find((e) => e.entryId === "keepme")!;
    expect(after.payload).toEqual(entry.payload);
    expect(after.provenance).toEqual(entry.provenance);
    expect(after.supersedes).toBe("earlier");
  });

  it("accumulates shedCount across successive sheds", () => {
    const first = shedDecisionDetail(recordOf(editorEntry({ entryId: "a" })), 1);
    expect(first.truncated).toEqual({ shedCount: 1 });
    const second = shedDecisionDetail(
      { ...first, entries: [...first.entries, editorEntry({ entryId: "b" })] },
      1,
    );
    expect(second.truncated).toEqual({ shedCount: 2 });
  });

  it("returns the record at its floor when nothing is left to shed", () => {
    const record = recordOf(surveyEntry());
    // No impact payloads at all ⇒ nothing to give up, so the record comes back
    // as-is rather than being mangled to meet an impossible budget.
    expect(shedDecisionDetail(record, 1)).toBe(record);
  });
});
