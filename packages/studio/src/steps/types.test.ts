// Unit tests for steps/types.ts — Phase 4a (P4a).
// Covers:
//   G1 — kind discriminated union narrows to exactly QuestionStep or EditorStep.
//   G4 — assertUniqueIds helper (reusable by manifest.test.ts).
//   G5 — IRPath reuse: bogus path produces compile error (fixture comment only —
//        the type-error can only be asserted at compile time, not at runtime).

import { describe, it, expect } from "vitest";
import type { Step, QuestionStep, EditorStep, StepKind } from "./types.ts";

// ---------------------------------------------------------------------------
// G4 — reusable uniqueness helper (manifest and other test files import this)
// ---------------------------------------------------------------------------

/** Asserts that every step id in the list is unique; throws if any duplicate exists. */
export function assertUniqueIds(steps: readonly { id: string }[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) {
      throw new Error(`Duplicate step id: "${step.id}"`);
    }
    seen.add(step.id);
  }
}

// ---------------------------------------------------------------------------
// G1 — kind narrows to exactly two variants
// ---------------------------------------------------------------------------

describe("StepKind", () => {
  it("accepts 'question-step' and 'editor-step' as valid StepKind values", () => {
    const a: StepKind = "question-step";
    const b: StepKind = "editor-step";
    expect(a).toBe("question-step");
    expect(b).toBe("editor-step");
  });

  it("discriminates QuestionStep vs EditorStep by kind field", () => {
    // Narrow by kind — TypeScript guarantees the discriminant.
    function classify(step: Step): "q" | "e" {
      if (step.kind === "question-step") {
        // TypeScript narrows to QuestionStep here — questionId is available.
        const _q: QuestionStep = step;
        void _q;
        return "q";
      }
      // TypeScript narrows to EditorStep here — component is available.
      const _e: EditorStep = step;
      void _e;
      return "e";
    }

    const qStep: QuestionStep = {
      kind: "question-step",
      id: "test-q",
      title: "Test question",
      questionId: "some_question_id",
      inputs: [],
      writes: [],
    };

    const eStep: EditorStep = {
      kind: "editor-step",
      id: "test-e",
      title: "Test editor",
      component: () => null,
      inputs: [],
      writes: [],
    };

    expect(classify(qStep)).toBe("q");
    expect(classify(eStep)).toBe("e");
  });

  it("Step union contains exactly QuestionStep and EditorStep (exhaustive check)", () => {
    // If a third kind were added, this exhaustive switch would fail to compile.
    function exhaustive(step: Step): boolean {
      switch (step.kind) {
        case "question-step": return true;
        case "editor-step": return true;
        // No default — TypeScript would error if Step had a third kind.
      }
    }
    const q: QuestionStep = { kind: "question-step", id: "q", title: "Q", questionId: "qid", inputs: [], writes: [] };
    expect(exhaustive(q)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// G4 — assertUniqueIds
// ---------------------------------------------------------------------------

describe("assertUniqueIds", () => {
  it("passes when all ids are unique", () => {
    expect(() => assertUniqueIds([
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ])).not.toThrow();
  });

  it("throws on the first duplicate id", () => {
    expect(() => assertUniqueIds([
      { id: "a" },
      { id: "b" },
      { id: "a" },
    ])).toThrow('Duplicate step id: "a"');
  });

  it("passes on an empty list", () => {
    expect(() => assertUniqueIds([])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// G5 — IRPath reuse (compile-time fixture comment)
//
// The following would be a TYPE ERROR if uncommented — IRPath is a branded string
// from @keyboard-studio/contracts; a plain string cannot be assigned to it.
//
// import { irPath } from "@keyboard-studio/contracts";
// const badStep: QuestionStep = {
//   kind: "question-step",
//   id: "x",
//   title: "Bad",
//   questionId: "q",
//   inputs: ["not/a/valid/ir/path"],  // ERROR: Type 'string' is not assignable to type 'IRPath'
//   writes: [],
// };
//
// This guard is enforced by the TypeScript compiler (strict mode + branded type).
// It cannot be asserted at runtime; the compile-time check is the guarantee.
// ---------------------------------------------------------------------------
