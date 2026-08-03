// Tests for the pull-request decision block (specs/053-decision-audit FR-018,
// FR-022; SC-004; US2-AS4).
//
// The claim under test is SC-004: a reviewer with no access to the studio can
// work backwards from a characteristic of the keyboard to the decision that
// produced it. That is asserted structurally — every rendered row pairs a
// decision with its consequence — rather than by eyeballing one golden string,
// so a future edit that drops the effects column fails here.

import { describe, it, expect } from "vitest";
import { makeEmptyDecisionRecord } from "@keyboard-studio/contracts";
import type { DecisionEntry, DecisionImpact, DecisionRecord } from "@keyboard-studio/contracts";
import { buildDecisionSummaryBlock, PR_SUMMARY_MAX_ENTRIES } from "./prSummary.js";
import { DECISION_RECORD_VFS_PATH } from "./sidecar.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPTURED: DecisionImpact = {
  state: "captured",
  files: [
    {
      path: "source/test_kb.kmn",
      hunks: [{ oldStart: 4, oldLines: 0, newStart: 5, newLines: 2, lines: ["+store(&X) 'y'", "+c"] }],
      magnitude: { added: 2, removed: 0 },
    },
  ],
  magnitude: { added: 2, removed: 0 },
};

function answer(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "e1",
    stepId: "identify-language",
    payload: {
      kind: "survey-answer",
      questionId: "il_language_english",
      answerType: "text",
      value: "Bambara",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes: null,
    ...overrides,
  } as DecisionEntry;
}

function recordOf(entries: readonly DecisionEntry[]): DecisionRecord {
  return { ...makeEmptyDecisionRecord("test_kb"), entries };
}

/** The `| … |` rows of the block's table, header and separator excluded. */
function tableRows(block: string): string[] {
  return block
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| # |") && !line.startsWith("|---"));
}

/**
 * Split a row into its cells the way a markdown renderer does — on pipes that
 * are NOT backslash-escaped. A naive `split("|")` would count an escaped pipe
 * inside an author's answer as a column boundary and so could never tell a
 * working escape from a broken one, which is exactly what one of these tests
 * is for.
 */
function cellsOf(row: string): string[] {
  return row.split(/(?<!\\)\|/).slice(1, -1);
}

// ---------------------------------------------------------------------------
// Shape and ordering
// ---------------------------------------------------------------------------

describe("buildDecisionSummaryBlock — shape", () => {
  it("opens with a markdown heading", () => {
    expect(buildDecisionSummaryBlock(recordOf([answer()]))).toMatch(/^## Authoring decisions\n/);
  });

  it("renders decisions in append order", () => {
    const block = buildDecisionSummaryBlock(
      recordOf([
        answer({ entryId: "a", stepId: "step-one" }),
        answer({ entryId: "b", stepId: "step-two" }),
        answer({ entryId: "c", stepId: "step-three" }),
      ]),
    );
    const rows = tableRows(block);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("step-one");
    expect(rows[1]).toContain("step-two");
    expect(rows[2]).toContain("step-three");
    expect(rows.map((r) => cellsOf(r)[0]?.trim())).toEqual(["1", "2", "3"]);
  });

  it("says so positively when there is nothing to report", () => {
    const block = buildDecisionSummaryBlock(makeEmptyDecisionRecord("test_kb"));
    expect(block).toContain("No decisions were recorded");
    expect(tableRows(block)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// SC-004 — decision paired with consequence
// ---------------------------------------------------------------------------

describe("buildDecisionSummaryBlock — decision to consequence (SC-004)", () => {
  it("pairs every rendered decision with an effect on source", () => {
    const block = buildDecisionSummaryBlock(
      recordOf([
        answer({ entryId: "a", impact: CAPTURED }),
        answer({ entryId: "b", impact: { state: "none" } }),
        answer({
          entryId: "c",
          impact: { state: "unavailable", reason: "no-rederivable-write-path" },
        }),
      ]),
    );

    // Four columns means the effect cell exists on every row — the pairing is
    // structural, not incidental to these three fixtures.
    for (const row of tableRows(block)) {
      const cells = cellsOf(row);
      expect(cells).toHaveLength(4);
      expect(cells[3]?.trim()).not.toBe("");
    }
  });

  it("names the file and the magnitude for a captured change", () => {
    const block = buildDecisionSummaryBlock(recordOf([answer({ impact: CAPTURED })]));
    expect(block).toContain("source/test_kb.kmn");
    expect(block).toContain("+2 / -0 lines");
  });

  it("states 'no source change' rather than leaving the cell blank", () => {
    const block = buildDecisionSummaryBlock(recordOf([answer({ impact: { state: "none" } })]));
    expect(block).toContain("no source change");
  });

  it("gives the reason when the change is not separately attributable", () => {
    const gated = buildDecisionSummaryBlock(
      recordOf([answer({ impact: { state: "unavailable", reason: "lock-gate-dependency" } })]),
    );
    const noPath = buildDecisionSummaryBlock(
      recordOf([answer({ impact: { state: "unavailable", reason: "no-rederivable-write-path" } })]),
    );

    expect(gated).toContain("not tracked separately");
    expect(gated).toContain("confirmed together");
    expect(noPath).toContain("not tracked separately");
    expect(noPath).toContain("isolate its exact change");
  });

  it("distinguishes never-captured from shed detail", () => {
    expect(buildDecisionSummaryBlock(recordOf([answer({ impact: undefined })]))).toContain(
      "not captured",
    );
    expect(buildDecisionSummaryBlock(recordOf([answer({ impact: null })]))).toContain(
      "omitted to keep the record within size limits",
    );
  });
});

// ---------------------------------------------------------------------------
// Readable without the studio
// ---------------------------------------------------------------------------

describe("buildDecisionSummaryBlock — readable without the studio", () => {
  it("distinguishes an accepted proposal from a hand-set value", () => {
    const block = buildDecisionSummaryBlock(
      recordOf([
        answer({ entryId: "a", provenance: { agency: "hand-set" } }),
        answer({ entryId: "b", provenance: { agency: "tool-proposed", source: "langtags" } }),
        answer({ entryId: "c", provenance: { agency: "base-derived", source: "base" } }),
      ]),
    );

    expect(block).toContain('Chose "Bambara"');
    expect(block).toContain('Accepted suggested "Bambara"');
    expect(block).toContain("from langtags");
    expect(block).toContain("from the base keyboard");
  });

  it("summarises an editor step by category counts, never by a key list", () => {
    const block = buildDecisionSummaryBlock(
      recordOf([
        answer({
          entryId: "a",
          stepId: "carve-gallery",
          payload: {
            kind: "editor-action",
            actionType: "gallery_edit",
            summary: {
              keysRemoved: 312,
              keysAdded: 0,
              mechanismsAssigned: 0,
              touchKeysAffected: 0,
              sample: ["K_A", "K_B"],
              sampleTruncated: true,
            },
          },
        }),
      ]),
    );

    expect(block).toContain("Edited the character gallery");
    expect(block).toContain("312 keys removed");
    expect(block).not.toContain("K_A");
    // Zero-valued categories are dropped rather than reported as considered.
    expect(block).not.toContain("0 keys added");
  });

  it("renders a boolean and a char-list answer as prose, not as JSON", () => {
    const block = buildDecisionSummaryBlock(
      recordOf([
        answer({
          entryId: "a",
          payload: { kind: "survey-answer", questionId: "q_bool", answerType: "boolean", value: true },
        }),
        answer({
          entryId: "b",
          payload: {
            kind: "survey-answer",
            questionId: "q_chars",
            answerType: "char-list",
            value: ["ɛ", "ɔ", "ɲ"],
          },
        }),
      ]),
    );

    expect(block).toContain('"yes"');
    expect(block).toContain('"ɛ ɔ ɲ"');
    expect(block).not.toContain("[");
  });

  it("escapes a pipe in an author-supplied value so the table survives it", () => {
    const block = buildDecisionSummaryBlock(
      recordOf([
        answer({
          payload: {
            kind: "survey-answer",
            questionId: "q_text",
            answerType: "text",
            value: "a | b",
          },
        }),
      ]),
    );

    expect(block).toContain("a \\| b");
    expect(cellsOf(tableRows(block)[0] ?? "")).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Bounds (FR-022, US2-AS4, contract §6)
// ---------------------------------------------------------------------------

describe("buildDecisionSummaryBlock — bounds", () => {
  function manyAnswers(count: number): DecisionEntry[] {
    return Array.from({ length: count }, (_, i) =>
      answer({ entryId: `e${i}`, stepId: `step-${i}` }),
    );
  }

  it("defaults to 25 entries", () => {
    expect(PR_SUMMARY_MAX_ENTRIES).toBe(25);
    const block = buildDecisionSummaryBlock(recordOf(manyAnswers(40)));
    expect(tableRows(block)).toHaveLength(25);
  });

  it("points at the packaged record when the bound bites", () => {
    const block = buildDecisionSummaryBlock(recordOf(manyAnswers(40)));
    expect(block).toContain("Showing the first 25 of 40 decisions");
    expect(block).toContain(DECISION_RECORD_VFS_PATH);
  });

  it("adds no pointer when everything fits", () => {
    const block = buildDecisionSummaryBlock(recordOf(manyAnswers(3)));
    expect(block).not.toContain("Showing the first");
    expect(block).not.toContain(DECISION_RECORD_VFS_PATH);
  });

  it("honours an explicit maxEntries", () => {
    const block = buildDecisionSummaryBlock(recordOf(manyAnswers(10)), { maxEntries: 4 });
    expect(tableRows(block)).toHaveLength(4);
    expect(block).toContain("Showing the first 4 of 10 decisions");
  });

  it("reports revised decisions as a count and lists only what shipped", () => {
    const block = buildDecisionSummaryBlock(
      recordOf([
        answer({ entryId: "first", payload: { kind: "survey-answer", questionId: "q", answerType: "text", value: "old" } }),
        answer({
          entryId: "second",
          supersedes: "first",
          payload: { kind: "survey-answer", questionId: "q", answerType: "text", value: "new" },
        }),
      ]),
    );

    expect(tableRows(block)).toHaveLength(1);
    expect(block).toContain('"new"');
    expect(block).not.toContain('"old"');
    expect(block).toContain("1 earlier decision was later revised");
  });

  it("states that detail was shed when the record is truncated", () => {
    const block = buildDecisionSummaryBlock({
      ...recordOf([answer({ impact: null })]),
      truncated: { shedCount: 7 },
    });

    expect(block).toContain("Change detail for 7 decisions was omitted");
  });
});
