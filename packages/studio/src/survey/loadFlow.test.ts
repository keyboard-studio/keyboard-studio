// Unit tests for parseFlow() in loadFlow.ts.
// All YAML is constructed inline — no file I/O.

import { describe, it, expect } from "vitest";
import { parseFlow } from "./loadFlow.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid YAML with one question. */
function minimalYaml(overrides: {
  flow_id?: string;
  phase?: string;
  questions?: string;
} = {}): string {
  const flowId = overrides.flow_id ?? "test_flow";
  const phase = overrides.phase !== undefined ? `phase: ${overrides.phase}` : "phase: A";
  const questions =
    overrides.questions !== undefined
      ? overrides.questions
      : `questions:
  - id: q1
    type: short_text
    prompt: "What is your language name?"
    required: true
    next: null`;
  return `flow_id: ${flowId}\n${phase}\n${questions}`;
}

// ---------------------------------------------------------------------------
// Valid YAML — happy path
// ---------------------------------------------------------------------------

describe("parseFlow — valid minimal YAML", () => {
  it("returns a FlowDef with the expected flow_id", () => {
    const result = parseFlow(minimalYaml());
    expect(result.flow_id).toBe("test_flow");
  });

  it("returns a FlowDef with phase 'A'", () => {
    const result = parseFlow(minimalYaml());
    expect(result.phase).toBe("A");
  });

  it("returns a questions array with one entry", () => {
    const result = parseFlow(minimalYaml());
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions).toHaveLength(1);
  });

  it("parses the question id correctly", () => {
    const result = parseFlow(minimalYaml());
    expect(result.questions[0]?.id).toBe("q1");
  });

  it("parses all valid phase tokens without throwing", () => {
    const validPhases = ["A", "B", "C", "C-prime", "D", "E", "F", "G"];
    for (const phase of validPhases) {
      expect(() => parseFlow(minimalYaml({ phase }))).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe("parseFlow — missing or unknown phase", () => {
  it("throws when phase field is absent", () => {
    // Build YAML without a phase line at all.
    const yaml = `flow_id: test_flow\nquestions:\n  - id: q1\n    type: short_text\n    next: null`;
    expect(() => parseFlow(yaml)).toThrowError(/missing or unknown phase/);
  });

  it("throws when phase is an unknown value", () => {
    expect(() => parseFlow(minimalYaml({ phase: "Z" }))).toThrowError(
      /missing or unknown phase/,
    );
  });

  it("throws when phase is an empty string", () => {
    // Produce `phase: ""` — YAML parser will give empty string.
    const yaml = `flow_id: test_flow\nphase: ""\nquestions:\n  - id: q1\n    type: short_text\n    next: null`;
    expect(() => parseFlow(yaml)).toThrowError(/missing or unknown phase/);
  });
});

describe("parseFlow — missing questions field", () => {
  it("throws when questions field is absent", () => {
    const yaml = `flow_id: test_flow\nphase: A`;
    expect(() => parseFlow(yaml)).toThrowError(/missing flow_id or questions/);
  });
});

describe("parseFlow — missing flow_id field", () => {
  it("throws when flow_id field is absent", () => {
    const yaml = `phase: A\nquestions:\n  - id: q1\n    type: short_text\n    next: null`;
    expect(() => parseFlow(yaml)).toThrowError(/missing flow_id or questions/);
  });
});

describe("parseFlow — empty questions array", () => {
  it("parses successfully with an empty questions array", () => {
    const yaml = `flow_id: test_flow\nphase: A\nquestions: []`;
    const result = parseFlow(yaml);
    expect(result.questions).toHaveLength(0);
  });
});
