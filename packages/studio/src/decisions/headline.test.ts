// Tests for headline selection (specs/055-legible-decision-trail T018, FR-011
// through FR-014, contracts/headline-spec.contract.md).
//
// FR-013 is the point of this file: headline selection must be assertable
// with NO DOM, no React, no `@testing-library`, and no `t()`. Every case below
// calls `headlineOf` directly against a stub `HeadlineDeps` and asserts on the
// returned `HeadlineSpec` shape.

import { describe, expect, it } from "vitest";
import type { DecisionPayload, DecisionProvenance, EditorActionSummary } from "@keyboard-studio/contracts";
import { formatAnswerValue, headlineOf, type HeadlineDeps } from "./headline.ts";

// A stub lookup, injected per the contract (§1) — no catalog, no I18n, no DOM.
// Deliberately partial: "il_ghost_question" is absent so the FR-014 fallback
// has something real to trigger on.
const KNOWN_LABELS: Record<string, string> = {
  il_target_script: "Target script",
  il_language_english: "Language name",
};

const deps: HeadlineDeps = {
  lookupQuestionLabel: (questionId) => KNOWN_LABELS[questionId],
};

const HAND_SET: DecisionProvenance = { agency: "hand-set" };

function surveyAnswer(questionId: string, value: string): DecisionPayload {
  return { kind: "survey-answer", questionId, answerType: "select", value };
}

/** Build an editor-action payload from a partial summary, filling `sample`/`sampleTruncated`. */
function editorAction(
  actionType: "gallery_edit" | "mechanism_edit" | "touch_edit",
  counts: Partial<
    Pick<EditorActionSummary, "keysRemoved" | "keysAdded" | "mechanismsAssigned" | "touchKeysAffected">
  >,
): DecisionPayload {
  return {
    kind: "editor-action",
    actionType,
    summary: { ...counts, sample: [], sampleTruncated: false },
  };
}

describe("headlineOf — question naming (FR-009/FR-014)", () => {
  it("resolves a known question to { known: true, label }", () => {
    const spec = headlineOf(surveyAnswer("il_target_script", "Latn"), HAND_SET, deps);
    expect(spec).toMatchObject({ question: { known: true, label: "Target script" } });
  });

  it("falls back to { known: false } for a question the lookup cannot resolve, and carries no identifier", () => {
    const spec = headlineOf(surveyAnswer("il_ghost_question", "Latn"), HAND_SET, deps);
    expect(spec).toMatchObject({ question: { known: false } });
    // The FR-014 fallback must not smuggle the raw id back in anywhere in the
    // spec — that would be exactly the "identifier instead of prose" bug the
    // fallback exists to prevent.
    expect(JSON.stringify(spec)).not.toContain("il_ghost_question");
  });

  it("carries the label and not the identifier when the lookup DOES resolve", () => {
    // Contract §2: no variant carries a questionId. That holds on the resolved
    // path too, not only on the FR-014 fallback — the id must not ride along
    // beside the label as a second, renderable field.
    const spec = headlineOf(surveyAnswer("il_target_script", "Latn"), HAND_SET, deps);
    expect(spec).toMatchObject({ question: { known: true, label: "Target script" } });
    expect(JSON.stringify(spec)).not.toContain("il_target_script");
  });

  it("does not confuse an unresolved lookup with an empty-string label", () => {
    // A lookup that resolves to "" is a different (and arguably buggy) case from
    // one that resolves to undefined; only undefined selects the fallback.
    const localDeps: HeadlineDeps = { lookupQuestionLabel: () => "" };
    const spec = headlineOf(surveyAnswer("il_target_script", "Latn"), HAND_SET, localDeps);
    expect(spec).toMatchObject({ question: { known: true, label: "" } });
  });
});

describe("headlineOf — the three agency literals over one value", () => {
  const answer = surveyAnswer("il_target_script", "Latn");

  it("distinguishes hand-set from tool-proposed for the identical value", () => {
    const chosen = headlineOf(answer, { agency: "hand-set" }, deps);
    const accepted = headlineOf(answer, { agency: "tool-proposed", source: "langtags" }, deps);
    expect(chosen.id).toBe("chose");
    expect(accepted.id).toBe("acceptedSuggested");
    expect(chosen).toMatchObject({ value: "Latn" });
    expect(accepted).toMatchObject({ value: "Latn", source: "langtags" });
  });

  it("reports a base-derived value as carried from the base", () => {
    const spec = headlineOf(answer, { agency: "base-derived", source: "base" }, deps);
    expect(spec).toEqual({
      id: "fromBase",
      question: { known: true, label: "Target script" },
      value: "Latn",
    });
  });

  it("still produces a sentence for a proposal with no recorded source", () => {
    const spec = headlineOf(answer, { agency: "tool-proposed" }, deps);
    expect(spec).toMatchObject({ id: "acceptedSuggested", source: "the tool" });
  });
});

describe("headlineOf — dimension zero-and-absent suppression (FR-011)", () => {
  it("omits a dimension whose count is present and zero", () => {
    const spec = headlineOf(
      editorAction("mechanism_edit", {
        keysRemoved: 0,
        keysAdded: 0,
        mechanismsAssigned: 7,
        touchKeysAffected: 0,
      }),
      HAND_SET,
      deps,
    );
    expect(spec).toMatchObject({ id: "editorStep" });
    if (spec.id !== "editorStep") throw new Error("expected editorStep");
    expect(spec.dimensions).toEqual([{ kind: "mechanismsAssigned", count: 7 }]);
  });

  it("omits a dimension whose count is entirely absent, distinctly from a present zero", () => {
    // Same non-zero value, but this time the OTHER three counts are absent
    // rather than present-zero. The rendered dimensions list must be identical
    // to the present-zero case above...
    const spec = headlineOf(
      editorAction("mechanism_edit", { mechanismsAssigned: 7 }),
      HAND_SET,
      deps,
    );
    expect(spec).toMatchObject({ id: "editorStep" });
    if (spec.id !== "editorStep") throw new Error("expected editorStep");
    expect(spec.dimensions).toEqual([{ kind: "mechanismsAssigned", count: 7 }]);
  });

  it("mixed present-non-zero and absent counts yields editorStep, not editorStepUnmeasured", () => {
    // The case the task calls out explicitly: some dimensions present and
    // non-zero, some absent. This must NOT be treated as "unmeasured" just
    // because some counts are missing.
    const spec = headlineOf(
      editorAction("gallery_edit", { keysRemoved: 5, touchKeysAffected: 2 }),
      HAND_SET,
      deps,
    );
    expect(spec.id).toBe("editorStep");
    if (spec.id !== "editorStep") throw new Error("expected editorStep");
    expect(spec.dimensions).toEqual([
      { kind: "keysRemoved", count: 5 },
      { kind: "touchKeysAffected", count: 2 },
    ]);
  });

  it("emits all four present dimensions in the fixed contract order, not insertion order", () => {
    // Built with fields in a different order than the fixed order requires,
    // so an order bug (e.g. object key order or a Set) would fail this.
    const spec = headlineOf(
      editorAction("touch_edit", {
        touchKeysAffected: 4,
        mechanismsAssigned: 3,
        keysAdded: 2,
        keysRemoved: 1,
      }),
      HAND_SET,
      deps,
    );
    expect(spec.id).toBe("editorStep");
    if (spec.id !== "editorStep") throw new Error("expected editorStep");
    expect(spec.dimensions.map((d) => d.kind)).toEqual([
      "keysRemoved",
      "keysAdded",
      "mechanismsAssigned",
      "touchKeysAffected",
    ]);
  });
});

describe("headlineOf — plural agreement carries a faithful count of exactly one (FR-012)", () => {
  it("carries count: 1 unchanged into the dimension, rather than rounding or dropping it", () => {
    // The singular/plural WORDING choice itself lives in the ICU message in the
    // catalog (contract §4: "trail.entry.headline.dimension.keysRemoved" is an
    // "ICU plural" id) — headline.ts's job, and this test's job, is only to make
    // sure the count that message keys off is transmitted exactly, since a
    // count of 1 is exactly the boundary where singular/plural disagreement is
    // visible to a reader.
    const spec = headlineOf(editorAction("gallery_edit", { keysRemoved: 1 }), HAND_SET, deps);
    expect(spec.id).toBe("editorStep");
    if (spec.id !== "editorStep") throw new Error("expected editorStep");
    expect(spec.dimensions).toEqual([{ kind: "keysRemoved", count: 1 }]);
  });

  it("makes no singular/plural word choice of its own — a dimension carries only a code and a number", () => {
    // If the selection ever grew a pre-pluralized noun ("key" / "keys"), FR-012
    // would hold in English by coincidence and break in every locale with a
    // different plural rule. The dimension's key set is the guard: exactly
    // `kind` and `count`, nothing lexical.
    const spec = headlineOf(editorAction("gallery_edit", { keysRemoved: 1 }), HAND_SET, deps);
    if (spec.id !== "editorStep") throw new Error("expected editorStep");
    const [only] = spec.dimensions;
    if (only === undefined) throw new Error("expected one dimension");
    expect(Object.keys(only).sort()).toEqual(["count", "kind"]);
  });

  it("carries 1 and 2 through the same path, so the boundary is the catalog's to decide", () => {
    const one = headlineOf(editorAction("touch_edit", { touchKeysAffected: 1 }), HAND_SET, deps);
    const two = headlineOf(editorAction("touch_edit", { touchKeysAffected: 2 }), HAND_SET, deps);
    if (one.id !== "editorStep" || two.id !== "editorStep") {
      throw new Error("expected editorStep for both");
    }
    expect(one.dimensions).toEqual([{ kind: "touchKeysAffected", count: 1 }]);
    expect(two.dimensions).toEqual([{ kind: "touchKeysAffected", count: 2 }]);
  });
});

describe("headlineOf — stage stays a code, in every outcome (FR-008/FR-010)", () => {
  const stages = ["gallery_edit", "mechanism_edit", "touch_edit"] as const;

  it.each(stages)("passes %s through unchanged when the step measured a change", (stage) => {
    const spec = headlineOf(editorAction(stage, { keysAdded: 3 }), HAND_SET, deps);
    expect(spec).toEqual({
      id: "editorStep",
      stage,
      dimensions: [{ kind: "keysAdded", count: 3 }],
    });
  });

  it.each(stages)("passes %s through unchanged in the no-change outcome", (stage) => {
    const spec = headlineOf(
      editorAction(stage, {
        keysRemoved: 0,
        keysAdded: 0,
        mechanismsAssigned: 0,
        touchKeysAffected: 0,
      }),
      HAND_SET,
      deps,
    );
    expect(spec).toEqual({ id: "editorStepNoChange", stage });
  });

  it.each(stages)("passes %s through unchanged in the unmeasured outcome", (stage) => {
    const spec = headlineOf(editorAction(stage, {}), HAND_SET, deps);
    expect(spec).toEqual({ id: "editorStepUnmeasured", stage });
  });
});

describe("headlineOf — the three editor outcomes (contract §3 table)", () => {
  const cases: {
    name: string;
    counts: Partial<
      Pick<EditorActionSummary, "keysRemoved" | "keysAdded" | "mechanismsAssigned" | "touchKeysAffected">
    >;
    expectedId: "editorStep" | "editorStepNoChange" | "editorStepUnmeasured";
  }[] = [
    {
      name: "at least one present and non-zero -> editorStep",
      counts: { keysRemoved: 0, keysAdded: 3, mechanismsAssigned: 0, touchKeysAffected: 0 },
      expectedId: "editorStep",
    },
    {
      name: "all present, all zero -> editorStepNoChange",
      counts: { keysRemoved: 0, keysAdded: 0, mechanismsAssigned: 0, touchKeysAffected: 0 },
      expectedId: "editorStepNoChange",
    },
    {
      name: "all absent -> editorStepUnmeasured",
      counts: {},
      expectedId: "editorStepUnmeasured",
    },
    {
      // Not a row of contract §3's three-row table, which names only "all
      // absent" for the third outcome. The implemented rule is the weaker
      // "nothing non-zero AND at least one absent", which is the safe reading:
      // a stage cannot be reported as having changed nothing on the strength of
      // three zeros when the fourth dimension was never measured.
      name: "some present zeros, at least one absent -> editorStepUnmeasured, never noChange",
      counts: { keysRemoved: 0, keysAdded: 0, mechanismsAssigned: 0 },
      expectedId: "editorStepUnmeasured",
    },
    {
      name: "one present non-zero with the rest absent -> editorStep",
      counts: { mechanismsAssigned: 2 },
      expectedId: "editorStep",
    },
  ];

  it.each(cases)("$name", ({ counts, expectedId }) => {
    const spec = headlineOf(editorAction("gallery_edit", counts), HAND_SET, deps);
    expect(spec.id).toBe(expectedId);
    expect(spec).toMatchObject({ stage: "gallery_edit" });
  });

  it("a pre-feature record normalized to all-absent lands in editorStepUnmeasured, not editorStepNoChange", () => {
    // Guards against the exact regression the contract calls out in §3: a
    // record written before this feature, read back with every count
    // normalized to absent, must not be mistaken for "measured and zero".
    const spec = headlineOf(editorAction("touch_edit", {}), HAND_SET, deps);
    expect(spec.id).toBe("editorStepUnmeasured");
    expect(spec.id).not.toBe("editorStepNoChange");
  });

  it("editorStepNoChange and editorStepUnmeasured carry no dimensions field to render", () => {
    const noChange = headlineOf(
      editorAction("gallery_edit", {
        keysRemoved: 0,
        keysAdded: 0,
        mechanismsAssigned: 0,
        touchKeysAffected: 0,
      }),
      HAND_SET,
      deps,
    );
    const unmeasured = headlineOf(editorAction("gallery_edit", {}), HAND_SET, deps);
    expect(noChange).not.toHaveProperty("dimensions");
    expect(unmeasured).not.toHaveProperty("dimensions");
  });
});

describe("formatAnswerValue", () => {
  it("joins a char-list with spaces, not commas", () => {
    expect(formatAnswerValue(["ɓ", "ɗ", "ƙ"])).toBe("ɓ ɗ ƙ");
  });

  it("says so for an empty list and a blank string rather than rendering nothing", () => {
    expect(formatAnswerValue([])).toBe("(none)");
    expect(formatAnswerValue("")).toBe("(blank)");
  });

  it("renders booleans as words", () => {
    expect(formatAnswerValue(true)).toBe("yes");
    expect(formatAnswerValue(false)).toBe("no");
  });

  it("passes an ordinary string through unchanged", () => {
    expect(formatAnswerValue("Hausa")).toBe("Hausa");
  });
});
