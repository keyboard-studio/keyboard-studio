// Integration test: loadModularFlow() shape proof.
//
// Loads a minimal pilot YAML containing only [language_name_autonym] and asserts
// that the resulting FlowDef matches the question's module definition verbatim.
// This is the AC #1 "shape proof" for issue #410.

import { describe, it, expect } from "vitest";
import { loadModularFlow } from "./loadModularFlow.ts";
import { definition as languageNameAutonymDef } from "./questions/a/language_name_autonym.ts";

// ---------------------------------------------------------------------------
// Pilot thin YAML — single question
// ---------------------------------------------------------------------------

const PILOT_YAML = `
flow_id: phase_a_pilot
phase: A
questions:
  - language_name_autonym
`;

// ---------------------------------------------------------------------------
// Shape proof
// ---------------------------------------------------------------------------

describe("loadModularFlow — pilot: language_name_autonym", () => {
  it("returns a FlowDef with the correct flow_id", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.flow_id).toBe("phase_a_pilot");
  });

  it("returns a FlowDef with phase 'A'", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.phase).toBe("A");
  });

  it("returns exactly one question", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.questions).toHaveLength(1);
  });

  it("resolves language_name_autonym to the module's definition verbatim", () => {
    const flow = loadModularFlow(PILOT_YAML);
    // Deep equality: the FlowQuestion in the FlowDef must be the exact same
    // object shape as the module's definition export.
    expect(flow.questions[0]).toEqual(languageNameAutonymDef);
  });

  it("sets definition.id to 'language_name_autonym'", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.questions[0]?.id).toBe("language_name_autonym");
  });

  it("sets definition.type to 'text'", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.questions[0]?.type).toBe("text");
  });

  it("sets definition.required to true", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.questions[0]?.required).toBe(true);
  });

  it("sets definition.next to 'language_name_english' (routing in module)", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.questions[0]?.next).toBe("language_name_english");
  });

  it("returns no provenance_questions when omitted from YAML", () => {
    const flow = loadModularFlow(PILOT_YAML);
    expect(flow.provenance_questions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

describe("loadModularFlow — error paths", () => {
  it("throws when flow_id is missing", () => {
    const yaml = `phase: A\nquestions:\n  - language_name_autonym`;
    expect(() => loadModularFlow(yaml)).toThrowError(/missing or empty flow_id/);
  });

  it("throws when phase is missing", () => {
    const yaml = `flow_id: test\nquestions:\n  - language_name_autonym`;
    expect(() => loadModularFlow(yaml)).toThrowError(/missing or unknown phase/);
  });

  it("throws when phase is an unknown value", () => {
    const yaml = `flow_id: test\nphase: Z\nquestions:\n  - language_name_autonym`;
    expect(() => loadModularFlow(yaml)).toThrowError(/missing or unknown phase/);
  });

  it("throws when a question ID is not in the registry", () => {
    const yaml = `flow_id: test\nphase: A\nquestions:\n  - nonexistent_question_id`;
    expect(() => loadModularFlow(yaml)).toThrowError(/not found in registry/);
  });

  it("throws when questions is absent", () => {
    const yaml = `flow_id: test\nphase: A`;
    expect(() => loadModularFlow(yaml)).toThrowError(/questions must be an array/);
  });

  // An empty questions list is structurally meaningless; SurveyRunner behaviour on it
  // is undefined. Loader rejects it eagerly rather than producing a broken FlowDef.
  it("throws when questions is an empty list", () => {
    const yaml = `flow_id: test\nphase: A\nquestions: []`;
    expect(() => loadModularFlow(yaml)).toThrowError(/questions list must not be empty/);
  });
});

// ---------------------------------------------------------------------------
// provenance_questions
// ---------------------------------------------------------------------------

describe("loadModularFlow — provenance_questions", () => {
  it("resolves provenance_questions list into FlowDef.provenance_questions", () => {
    // Use language_name_autonym (the only registered question) as a stand-in
    // so the test doesn't depend on future registrations.
    const yaml = `
flow_id: test_provenance
phase: A
questions:
  - language_name_autonym
provenance_questions:
  - language_name_autonym
`;
    const flow = loadModularFlow(yaml);
    expect(flow.provenance_questions).toHaveLength(1);
    expect(flow.provenance_questions?.[0]).toEqual(languageNameAutonymDef);
  });
});
