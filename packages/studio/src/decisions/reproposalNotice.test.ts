// reproposalNotice.test — the FR-016 notice's step-naming half (spec 079
// T064, journey-strip-contract.md §9), plus spec 093 T008's scenario-4
// tests for the recalculation rule's re-proposal behaviour (appended
// below): an `asked` decision that no longer fits is KEPT, flagged, and
// re-proposed beside the recomputed value — never overwritten. The
// wiring raises the notice through `reproposalNoticeStore`; the pure
// half pinned here is that the record keeps its value, gains the
// recomputed value as `offered`, and is reported in the result's
// `reproposed` list (the exact list the wiring notifies on).

import { describe, it, expect } from "vitest";
import type { WorkItem } from "../steps/workToDo.ts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { providerFromModules } from "./replayKeyboard.ts";
import { recalculate } from "./recalculate.ts";
import { affectedStepNames, noticeableWorkItems } from "./reproposalNotice.ts";

function reproposed(stepId: string, screenId: string): WorkItem {
  return {
    kind: "reproposed",
    stepId,
    screenId,
    answerId: `${screenId}.a1`,
    reason: { code: "evidence-added", subject: "x", sourceStepId: "characters" },
  };
}

describe("affectedStepNames — catalog labels only, never a raw step id", () => {
  it("names a single affected step by its catalog label", () => {
    expect(affectedStepNames([reproposed("marks", "ms_series_s1")])).toBe("Accents & marks");
  });

  it("never surfaces the raw step id", () => {
    // "touch_seed_source" has an underscore-joined raw id distinct from its
    // catalog label ("Touch seed") — a substring match here would only pass
    // by accident the way a same-cased word like "marks" could.
    const names = affectedStepNames([reproposed("touch_seed_source", "tss1")]);
    expect(names).toBe("Touch seed");
    expect(names).not.toContain("touch_seed_source");
    expect(names).not.toContain("_");
  });

  it("de-duplicates and lists more than one affected step, in first-appearance order", () => {
    const names = affectedStepNames([
      reproposed("marks", "ms_series_s1"),
      reproposed("punctuation", "p1"),
      reproposed("marks", "ms_series_s2"),
    ]);
    expect(names).toContain("Accents & marks");
    expect(names).toContain("Punctuation");
    // Not literally "marks, punctuation, marks" — de-duplicated.
    expect(names.match(/Accents & marks/g)?.length).toBe(1);
  });

  it("an empty delta names nothing (never throws)", () => {
    expect(affectedStepNames([])).toBe("");
  });
});

describe("noticeableWorkItems — only steps the author had reached before the Next", () => {
  const unassignedMechanisms: WorkItem = { kind: "unassigned", stepId: "mechanisms", count: 2 };

  it("drops work in a step not yet reached (first arrival at the mechanism gallery)", () => {
    const visitedAtClick = ["identity", "characters", "marks", "carve"];
    expect(noticeableWorkItems([unassignedMechanisms], visitedAtClick)).toEqual([]);
  });

  it("keeps work in steps already reached", () => {
    const item = reproposed("marks", "ms_series_s1");
    const visitedAtClick = ["identity", "characters", "marks", "carve", "mechanisms"];
    expect(noticeableWorkItems([item, unassignedMechanisms], visitedAtClick)).toEqual([
      item,
      unassignedMechanisms,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Spec 093 T008 — scenario 4: asked-no-longer-fits, via the recalculation
// rule (decisions/recalculate.ts).
// ---------------------------------------------------------------------------

const s4mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const s4rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

const S4_CTX = { ir: null, catalog: null } as ExtractContext;

// language-code drives author-name: the author's value "abc" only fits
// while the code is "en" (the input-sensitive validation the deps seam
// models — the landed module `validate` is value-only).
const s4CodeModule = s4mod({ id: "q_code_s4", provides: ["language-code"] });
const s4AuthorModule = s4mod({
  id: "q_author_s4",
  provides: ["author-name"],
  requires: ["language-code"],
});
const S4_MODULES = [s4CodeModule, s4AuthorModule];
const S4_ORDER: DecisionId[] = ["language-code", "author-name"];

function runScenario4(decisions: DecisionSet, freshValue: unknown) {
  return recalculate(
    {
      providerFor: providerFromModules(S4_MODULES),
      modules: S4_MODULES,
      extractContext: S4_CTX,
      validateValue: (_mod, value, newInputs) =>
        !(newInputs["language-code"] !== "en" && value === "abc"),
      recomputeValue: () => freshValue,
    },
    { decisions, changed: new Set<DecisionId>(["language-code"]), order: S4_ORDER },
  );
}

describe("recalculate — scenario 4: asked-no-longer-fits (spec 093)", () => {
  it("keeps the author's value, flags it, and re-proposes the recomputed value beside it", () => {
    const decisions: DecisionSet = {
      "language-code": s4rec({ id: "language-code", value: "fr", provenance: "asked" }),
      "author-name": s4rec({
        id: "author-name",
        value: "abc",
        provenance: "asked",
        inputs: { "language-code": "en" },
      }),
    };
    const out = runScenario4(decisions, "abd");
    expect(out.reproposed).toEqual(["author-name"]);
    const record = out.decisions["author-name"];
    // Kept — never overwritten by the recomputed value.
    expect(record?.value).toBe("abc");
    expect(record?.provenance).toBe("asked");
    // The recomputed value rides beside it as the proposal.
    expect(record?.offered).toBe("abd");
    // Not counted as recomputed: the author's record stands.
    expect(out.recomputed).toEqual([]);
  });

  it("still flags the record when no recomputed proposal can be produced", () => {
    const decisions: DecisionSet = {
      "language-code": s4rec({ id: "language-code", value: "fr", provenance: "asked" }),
      "author-name": s4rec({
        id: "author-name",
        value: "abc",
        provenance: "asked",
        inputs: { "language-code": "en" },
      }),
    };
    const out = runScenario4(decisions, undefined);
    expect(out.reproposed).toEqual(["author-name"]);
    expect(out.decisions["author-name"]?.value).toBe("abc");
    expect(out.decisions["author-name"]?.offered).toBeUndefined();
  });

  it("does not flag a record whose value still fits the new inputs", () => {
    const decisions: DecisionSet = {
      "language-code": s4rec({ id: "language-code", value: "fr", provenance: "asked" }),
      "author-name": s4rec({
        id: "author-name",
        value: "xyz",
        provenance: "asked",
        inputs: { "language-code": "en" },
      }),
    };
    const out = runScenario4(decisions, "abd");
    expect(out.reproposed).toEqual([]);
    expect(out.decisions["author-name"]).toBe(decisions["author-name"]);
  });
});
