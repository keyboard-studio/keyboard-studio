// Tests for the pull-request decision block (specs/053-decision-audit FR-018,
// FR-022; SC-004; US2-AS4).
//
// The claim under test is SC-004: a reviewer with no access to the studio can
// work backwards from a characteristic of the keyboard to the decision that
// produced it. That is asserted structurally — every rendered row pairs a
// decision with its consequence — rather than by eyeballing one golden string,
// so a future edit that drops the effects column fails here.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { makeEmptyDecisionRecord } from "@keyboard-studio/contracts";
import type {
  DecisionEntry,
  DecisionImpact,
  DecisionRecord,
  EditorActionSummary,
  EditorActionType,
} from "@keyboard-studio/contracts";
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

// ---------------------------------------------------------------------------
// SC-007 / FR-015 — the two surfaces agree
//
// How the author-facing trail is generated here, given that an engine test may
// not import studio code (053 FR-016; the `engine-not-to-studio` rule in
// .dependency-cruiser.cjs):
//
//   * The trail's TEXT is the studio's own English catalogue, READ FROM DISK as
//     fixture data (no module edge, so no layering violation) and rendered by
//     the tiny ICU evaluator below. Reading the real file rather than pasting
//     the strings in is what keeps the fixture honest: the catalogue's stage
//     messages adopt `EDITOR_LABEL`'s wording by hand-copy
//     ([headline-spec.contract.md](../../../../specs/055-legible-decision-trail/contracts/headline-spec.contract.md) §5),
//     and a hand-copy is exactly the thing that rots. If either side is reworded,
//     these tests fail instead of the two surfaces quietly diverging. `msg()`
//     throws on a missing id, so a renamed message fails loudly rather than
//     comparing against `undefined`.
//
//   * The trail's SELECTION (which message, which dimensions) is derived here
//     from the record via the contract's §3 rules — deliberately NOT a copy of
//     `headline.ts`, which `packages/studio/src/decisions/headline.test.ts`
//     already locks against those same rules. So neither surface is ever
//     compared against a re-implementation of itself: each is compared against
//     the record's own ground truth, and thereby to each other.
//
// What "agree" means is decomposed into the three properties SC-007 names —
// stage naming, mentioned dimensions, counts — rather than raw string equality,
// because each surface stays responsible for its own text. Their no-change and
// not-measured wordings differ by design, and only the composed English
// editor-step sentence happens to coincide.
// ---------------------------------------------------------------------------

/** The four editor-step counts, in the fixed order the contract names (§3). */
type CountKind = "keysRemoved" | "keysAdded" | "mechanismsAssigned" | "touchKeysAffected";

const DIMENSION_ORDER: readonly CountKind[] = [
  "keysRemoved",
  "keysAdded",
  "mechanismsAssigned",
  "touchKeysAffected",
];

const STAGE_MESSAGE_ID: Record<EditorActionType, string> = {
  gallery_edit: "trail.entry.headline.stage.galleryEdit",
  mechanism_edit: "trail.entry.headline.stage.mechanismEdit",
  touch_edit: "trail.entry.headline.stage.touchEdit",
};

const DIMENSION_MESSAGE_ID: Record<CountKind, string> = {
  keysRemoved: "trail.entry.headline.dimension.keysRemoved",
  keysAdded: "trail.entry.headline.dimension.keysAdded",
  mechanismsAssigned: "trail.entry.headline.dimension.mechanismsAssigned",
  touchKeysAffected: "trail.entry.headline.dimension.touchKeysAffected",
};

/** The engine's own wording when nothing measured changed — engine-local text. */
const PR_NO_MEASURED_CHANGE = "no net change";
/** The engine's own wording when at least one category was never measured — engine-local text. */
const PR_NOT_MEASURED = "not measured";

const CATALOG_PATH = fileURLToPath(
  new URL("../../../studio/src/locales/en/messages.json", import.meta.url),
);
const CATALOG: Record<string, string> = JSON.parse(readFileSync(CATALOG_PATH, "utf8")) as Record<
  string,
  string
>;

/** Look a message up, failing loudly if the id was renamed or removed. */
function msg(id: string): string {
  const message = CATALOG[id];
  if (message === undefined) {
    throw new Error(`studio catalogue has no "${id}" (${CATALOG_PATH})`);
  }
  return message;
}

/**
 * Evaluate the one ICU form the trail's editor messages use: a single
 * `{name, plural, one {…} other {…}}`, or plain `{name}` interpolation.
 */
function renderIcu(message: string, values: Record<string, string | number>): string {
  const plural = /^\{(\w+), plural, one \{(.+?)\} other \{(.+?)\}\}$/.exec(message);
  if (plural !== null) {
    const count = Number(values[plural[1]!]);
    return (count === 1 ? plural[2]! : plural[3]!).replace(/#/g, String(count));
  }
  return message.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name]));
}

function summaryOf(counts: Partial<Record<CountKind, number>>): EditorActionSummary {
  return {
    ...(counts.keysRemoved !== undefined ? { keysRemoved: counts.keysRemoved } : {}),
    ...(counts.keysAdded !== undefined ? { keysAdded: counts.keysAdded } : {}),
    ...(counts.mechanismsAssigned !== undefined
      ? { mechanismsAssigned: counts.mechanismsAssigned }
      : {}),
    ...(counts.touchKeysAffected !== undefined
      ? { touchKeysAffected: counts.touchKeysAffected }
      : {}),
    sample: [],
    sampleTruncated: false,
  };
}

function editorEntry(
  entryId: string,
  stage: EditorActionType,
  counts: Partial<Record<CountKind, number>>,
): DecisionEntry {
  return answer({
    entryId,
    stepId: `step-${entryId}`,
    payload: { kind: "editor-action", actionType: stage, summary: summaryOf(counts) },
  });
}

/**
 * Ground truth from the record alone: the dimensions in which something
 * happened, in contract order. Present and non-zero — an absent count and a
 * present `0` are both absent from this list, for different reasons.
 */
function mentionedDimensions(
  counts: Partial<Record<CountKind, number>>,
): { kind: CountKind; count: number }[] {
  const mentioned: { kind: CountKind; count: number }[] = [];
  for (const kind of DIMENSION_ORDER) {
    const count = counts[kind];
    if (count !== undefined && count > 0) mentioned.push({ kind, count });
  }
  return mentioned;
}

/** Ground truth: was every dimension measured, or is at least one absent? */
function allMeasured(counts: Partial<Record<CountKind, number>>): boolean {
  return DIMENSION_ORDER.every((kind) => counts[kind] !== undefined);
}

/** The author-facing headline, composed from the studio catalogue (see the note above). */
function trailHeadline(
  stage: EditorActionType,
  counts: Partial<Record<CountKind, number>>,
): string {
  const stageName = msg(STAGE_MESSAGE_ID[stage]);
  const mentioned = mentionedDimensions(counts);

  if (mentioned.length > 0) {
    const dimensions = mentioned
      .map((dimension) =>
        renderIcu(msg(DIMENSION_MESSAGE_ID[dimension.kind]), { count: dimension.count }),
      )
      .join(", ");
    return renderIcu(msg("trail.entry.headline.editorStep.composed"), {
      stage: stageName,
      dimensions,
    });
  }

  return renderIcu(
    msg(
      allMeasured(counts)
        ? "trail.entry.headline.editorStep.noChange"
        : "trail.entry.headline.editorStep.unmeasured",
    ),
    { stage: stageName },
  );
}

/** The reviewer-facing Decision cell for a single-entry record. */
function prHeadline(stage: EditorActionType, counts: Partial<Record<CountKind, number>>): string {
  const block = buildDecisionSummaryBlock(recordOf([editorEntry("only", stage, counts)]));
  return cellsOf(tableRows(block)[0] ?? "")[2]?.trim() ?? "";
}

/** Split `Stage (clause, clause)` into its stage name and its clause list. */
function stageAndClauses(sentence: string): { stage: string; clauses: string[] } {
  const parsed = /^(.*) \((.*)\)$/.exec(sentence);
  if (parsed === null) throw new Error(`not a stage sentence: ${sentence}`);
  return { stage: parsed[1]!, clauses: parsed[2]!.split(", ") };
}

const ALL_STAGES: readonly EditorActionType[] = ["gallery_edit", "mechanism_edit", "touch_edit"];

describe("trail and PR summary agree (FR-015, SC-007)", () => {
  it("names each stage with the same words on both surfaces", () => {
    for (const stage of ALL_STAGES) {
      const counts = { keysRemoved: 4 };
      expect(stageAndClauses(prHeadline(stage, counts)).stage).toBe(
        stageAndClauses(trailHeadline(stage, counts)).stage,
      );
    }

    // The three stages are genuinely distinguished, so the test above cannot be
    // satisfied by a catalogue that gave every stage the same name.
    const names = ALL_STAGES.map((stage) => stageAndClauses(trailHeadline(stage, { keysRemoved: 4 })).stage);
    expect(new Set(names).size).toBe(3);
  });

  it("mentions exactly the dimensions in which something happened, with the same counts", () => {
    // One record, both surfaces. Zero and absent both present, in the same entry.
    const counts = { keysRemoved: 312, keysAdded: 0, mechanismsAssigned: 2 };
    const expected = ["312 keys removed", "2 mechanisms assigned"];

    // Ground truth from the record itself — neither surface's opinion.
    expect(mentionedDimensions(counts).map((d) => d.count)).toEqual([312, 2]);

    expect(stageAndClauses(prHeadline("gallery_edit", counts)).clauses).toEqual(expected);
    expect(stageAndClauses(trailHeadline("gallery_edit", counts)).clauses).toEqual(expected);
  });

  it("mentions a zero-valued dimension on neither surface", () => {
    const counts = { keysRemoved: 5, keysAdded: 0, mechanismsAssigned: 0, touchKeysAffected: 0 };

    for (const sentence of [prHeadline("gallery_edit", counts), trailHeadline("gallery_edit", counts)]) {
      expect(stageAndClauses(sentence).clauses).toEqual(["5 keys removed"]);
      expect(sentence).not.toContain("0 ");
    }
  });

  it("agrees on singular and plural for every dimension (FR-012)", () => {
    for (const kind of DIMENSION_ORDER) {
      for (const count of [1, 2]) {
        const counts = { [kind]: count } as Partial<Record<CountKind, number>>;
        const pr = stageAndClauses(prHeadline("touch_edit", counts)).clauses;
        const trail = stageAndClauses(trailHeadline("touch_edit", counts)).clauses;

        expect(pr).toEqual(trail);
        expect(pr).toHaveLength(1);
        // The count is the record's, on both surfaces — not a re-derived one.
        expect(pr[0]).toContain(String(count));
      }
    }

    // Singular really is a distinct form, so the equality above has teeth.
    expect(stageAndClauses(prHeadline("touch_edit", { keysAdded: 1 })).clauses).toEqual([
      "1 key added",
    ]);
  });

  it("agrees across a whole record, stage by stage", () => {
    const fixtures: { entryId: string; stage: EditorActionType; counts: Partial<Record<CountKind, number>> }[] = [
      { entryId: "a", stage: "gallery_edit", counts: { keysRemoved: 312, keysAdded: 1 } },
      { entryId: "b", stage: "mechanism_edit", counts: { mechanismsAssigned: 7, keysAdded: 0 } },
      { entryId: "c", stage: "touch_edit", counts: { touchKeysAffected: 1 } },
    ];

    const block = buildDecisionSummaryBlock(
      recordOf(fixtures.map((f) => editorEntry(f.entryId, f.stage, f.counts))),
    );
    const rows = tableRows(block);
    expect(rows).toHaveLength(fixtures.length);

    fixtures.forEach((fixture, index) => {
      const pr = stageAndClauses(cellsOf(rows[index] ?? "")[2]?.trim() ?? "");
      const trail = stageAndClauses(trailHeadline(fixture.stage, fixture.counts));
      const truth = mentionedDimensions(fixture.counts);

      expect(pr.stage).toBe(trail.stage);
      expect(pr.clauses).toEqual(trail.clauses);
      expect(pr.clauses).toHaveLength(truth.length);
      pr.clauses.forEach((clause, position) => {
        expect(clause).toContain(String(truth[position]!.count));
      });
    });
  });
});

// ---------------------------------------------------------------------------
// FR-005a — absent (not measured) is not a falsy zero
// ---------------------------------------------------------------------------

describe("absent counts are not zero (FR-005a, SC-011)", () => {
  const ABSENT: Partial<Record<CountKind, number>> = {};
  const MEASURED_ZERO: Partial<Record<CountKind, number>> = {
    keysRemoved: 0,
    keysAdded: 0,
    mechanismsAssigned: 0,
    touchKeysAffected: 0,
  };

  it("renders an absent count as a number on neither surface", () => {
    const partiallyMeasured = { keysRemoved: 3 };

    for (const sentence of [
      prHeadline("gallery_edit", ABSENT),
      trailHeadline("gallery_edit", ABSENT),
      prHeadline("gallery_edit", partiallyMeasured),
      trailHeadline("gallery_edit", partiallyMeasured),
    ]) {
      expect(sentence).not.toContain("undefined");
      expect(sentence).not.toContain("NaN");
      expect(sentence).not.toContain("0 ");
    }
  });

  it("says something different for not-measured than for measured-and-unchanged, on the trail", () => {
    const unmeasured = trailHeadline("gallery_edit", ABSENT);
    const unchanged = trailHeadline("gallery_edit", MEASURED_ZERO);

    expect(unmeasured).not.toBe(unchanged);
    // The difference is two distinct catalogue messages, not two renderings of
    // one — a catalogue that collapsed them would fail here.
    expect(msg("trail.entry.headline.editorStep.unmeasured")).not.toBe(
      msg("trail.entry.headline.editorStep.noChange"),
    );
    // Both are positive statements about the stage, and neither reports a count.
    const stageName = stageAndClauses(prHeadline("gallery_edit", { keysRemoved: 1 })).stage;
    expect(unmeasured).toContain(stageName);
    expect(unchanged).toContain(stageName);
    expect(unmeasured).not.toMatch(/\d/);
    expect(unchanged).not.toMatch(/\d/);
  });

  // Was a KNOWN DEFECT: `formatEditorSummary` used to drop an absent count and
  // a present `0` alike and then say "no net change" for both, so the
  // reviewer-facing surface lumped "not measured" in with "measured, and
  // nothing changed" — the one thing FR-005a forbids, and a disagreement with
  // the trail, which already distinguished them (the test above). Fixed per
  // headline-spec.contract.md §5: the engine side now says "not measured" when
  // at least one count is absent, distinct from "no net change" when all four
  // are present and zero.
  it("says something different for not-measured than for measured-and-unchanged, on the PR summary too", () => {
    expect(prHeadline("gallery_edit", ABSENT)).not.toBe(prHeadline("gallery_edit", MEASURED_ZERO));
  });

  it("uses its own engine-local wording for each outcome, agreeing in substance (not text) with the trail", () => {
    expect(prHeadline("gallery_edit", ABSENT)).toBe(
      `Edited the character gallery (${PR_NOT_MEASURED})`,
    );
    expect(prHeadline("gallery_edit", MEASURED_ZERO)).toBe(
      `Edited the character gallery (${PR_NO_MEASURED_CHANGE})`,
    );
  });
});
