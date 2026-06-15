// Unit tests for pure logic exported from SurveyRunner.tsx:
//   evalCondition, resolveNext, advanceThrough

import { describe, it, expect, vi } from "vitest";
import { evalCondition, resolveNext, advanceThrough } from "./SurveyRunner.tsx";
import type { FlowQuestion, SurveyContext } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function q(
  id: string,
  next: FlowQuestion["next"],
  engineResolved = false,
): FlowQuestion {
  return {
    id,
    type: "short_text",
    ...(engineResolved ? { engine_resolved: true } : {}),
    next,
  };
}

function idx(...questions: FlowQuestion[]): Map<string, FlowQuestion> {
  return new Map(questions.map((q) => [q.id, q]));
}

// ---------------------------------------------------------------------------
// evalCondition
// ---------------------------------------------------------------------------

describe("evalCondition — value == 'x'", () => {
  it("returns true when value matches", () => {
    expect(evalCondition("value == 'yes'", "yes", {})).toBe(true);
  });
  it("returns false when value does not match", () => {
    expect(evalCondition("value == 'yes'", "no", {})).toBe(false);
  });
  it("returns false when value is undefined", () => {
    expect(evalCondition("value == 'yes'", undefined, {})).toBe(false);
  });
});

describe("evalCondition — value != 'x'", () => {
  it("returns true when value differs", () => {
    expect(evalCondition("value != 'yes'", "no", {})).toBe(true);
  });
  it("returns false when value matches", () => {
    expect(evalCondition("value != 'yes'", "yes", {})).toBe(false);
  });
});

describe("evalCondition — ctx.field == 'x'", () => {
  it("returns true when ctx field matches", () => {
    expect(evalCondition("ctx.lang == 'French'", undefined, { lang: "French" })).toBe(true);
  });
  it("returns false when ctx field does not match", () => {
    expect(evalCondition("ctx.lang == 'French'", undefined, { lang: "German" })).toBe(false);
  });
  it("returns false when ctx field is missing (treats as empty string)", () => {
    expect(evalCondition("ctx.lang == 'French'", undefined, {})).toBe(false);
  });
  it("returns true when ctx field != missing field (empty != non-empty)", () => {
    expect(evalCondition("ctx.lang != 'French'", undefined, {})).toBe(true);
  });
});

describe("evalCondition — or operator", () => {
  it("returns true if first clause matches", () => {
    expect(evalCondition("value == 'a' or value == 'b'", "a", {})).toBe(true);
  });
  it("returns true if second clause matches", () => {
    expect(evalCondition("value == 'a' or value == 'b'", "b", {})).toBe(true);
  });
  it("returns false if no clause matches", () => {
    expect(evalCondition("value == 'a' or value == 'b'", "c", {})).toBe(false);
  });
});

describe("evalCondition — and operator", () => {
  it("returns true when both clauses match", () => {
    const ctx: SurveyContext = { group: "A" };
    expect(evalCondition("value == 'x' and ctx.group == 'A'", "x", ctx)).toBe(true);
  });
  it("returns false when second clause fails", () => {
    const ctx: SurveyContext = { group: "B" };
    expect(evalCondition("value == 'x' and ctx.group == 'A'", "x", ctx)).toBe(false);
  });
  it("returns false when first clause fails", () => {
    const ctx: SurveyContext = { group: "A" };
    expect(evalCondition("value == 'x' and ctx.group == 'A'", "y", ctx)).toBe(false);
  });
});

describe("evalCondition — unknown pattern", () => {
  it("returns false gracefully for unrecognised syntax", () => {
    expect(evalCondition("some garbage", "x", {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resolveNext
// ---------------------------------------------------------------------------

describe("resolveNext", () => {
  it("returns null when next is null", () => {
    expect(resolveNext(q("q1", null), undefined, {})).toBeNull();
  });
  it("returns null when next is undefined", () => {
    expect(resolveNext(q("q1", undefined), undefined, {})).toBeNull();
  });
  it("returns the string when next is a string", () => {
    expect(resolveNext(q("q1", "q2"), undefined, {})).toBe("q2");
  });
  it("returns the matching goto when a condition is satisfied", () => {
    const question: FlowQuestion = {
      id: "q1",
      type: "bool",
      next: [
        { condition: "value == 'true'", goto: "yes_branch" },
        { goto: "default_branch" },
      ],
    };
    expect(resolveNext(question, "true", {})).toBe("yes_branch");
  });
  it("returns the default branch when no condition matches", () => {
    const question: FlowQuestion = {
      id: "q1",
      type: "bool",
      next: [
        { condition: "value == 'true'", goto: "yes_branch" },
        { goto: "default_branch" },
      ],
    };
    expect(resolveNext(question, "false", {})).toBe("default_branch");
  });
  it("returns null when no condition matches and no default is present", () => {
    const question: FlowQuestion = {
      id: "q1",
      type: "bool",
      next: [{ condition: "value == 'true'", goto: "yes_branch" }],
    };
    expect(resolveNext(question, "false", {})).toBeNull();
  });

  // P1-D: both the bare-fallthrough form { goto: "..." } and the explicit
  // advisory form { default: true, goto: "..." } must behave identically.
  // resolveNext treats any rule without a `condition` field as the default
  // branch regardless of whether `default: true` is set.
  it("bare fallthrough { goto } and annotated { default: true, goto } are equivalent", () => {
    const bare: FlowQuestion = {
      id: "q1",
      type: "bool",
      next: [
        { condition: "value == 'true'", goto: "yes_branch" },
        { goto: "default_branch" },
      ],
    };
    const annotated: FlowQuestion = {
      id: "q1",
      type: "bool",
      next: [
        { condition: "value == 'true'", goto: "yes_branch" },
        { default: true, goto: "default_branch" },
      ],
    };
    // Both should hit the default branch when value is "false"
    expect(resolveNext(bare, "false", {})).toBe("default_branch");
    expect(resolveNext(annotated, "false", {})).toBe("default_branch");
    // Both should hit the conditional branch when value is "true"
    expect(resolveNext(bare, "true", {})).toBe("yes_branch");
    expect(resolveNext(annotated, "true", {})).toBe("yes_branch");
  });
});

// ---------------------------------------------------------------------------
// advanceThrough
// ---------------------------------------------------------------------------

describe("advanceThrough — end of flow", () => {
  it("returns null when the current question's next is null", () => {
    const q1 = q("q1", null);
    expect(advanceThrough(q1, undefined, {}, idx(q1))).toBeNull();
  });
});

describe("advanceThrough — non-engine_resolved next", () => {
  it("returns the next question id directly", () => {
    const q1 = q("q1", "q2");
    const q2 = q("q2", null);
    expect(advanceThrough(q1, undefined, {}, idx(q1, q2))).toBe("q2");
  });
});

describe("advanceThrough — engine_resolved skipping", () => {
  it("skips a single engine_resolved node and returns the next renderable id", () => {
    const q1 = q("q1", "q2er");
    const q2er = q("q2er", "q3", true);
    const q3 = q("q3", null);
    expect(advanceThrough(q1, undefined, {}, idx(q1, q2er, q3))).toBe("q3");
  });

  it("skips a chain of two engine_resolved nodes", () => {
    const q1 = q("q1", "q2er");
    const q2er = q("q2er", "q3er", true);
    const q3er = q("q3er", "q4", true);
    const q4 = q("q4", null);
    expect(advanceThrough(q1, undefined, {}, idx(q1, q2er, q3er, q4))).toBe("q4");
  });

  it("returns null when an engine_resolved chain terminates at next:null", () => {
    const q1 = q("q1", "q2er");
    const q2er = q("q2er", null, true);
    expect(advanceThrough(q1, undefined, {}, idx(q1, q2er))).toBeNull();
  });
});

describe("advanceThrough — unresolved goto target", () => {
  it("returns null and emits console.error for a missing index entry", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const q1 = q("q1", "missing");
    expect(advanceThrough(q1, undefined, {}, idx(q1))).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "SurveyRunner: unresolved goto target",
      "missing",
    );
    errorSpy.mockRestore();
  });
});

describe("advanceThrough — cycle detection", () => {
  it("returns null and emits console.error when engine_resolved nodes form a cycle", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = q("a", "b", true);
    const b = q("b", "a", true);
    const start = q("start", "a");
    expect(advanceThrough(start, undefined, {}, idx(start, a, b))).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "SurveyRunner: cycle detected in engine_resolved chain",
      expect.any(String),
    );
    errorSpy.mockRestore();
  });
});
