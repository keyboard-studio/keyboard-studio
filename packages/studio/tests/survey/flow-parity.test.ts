// Modular flow structural-integrity harness (T003 + T017).
//
// Asserts structural invariants directly on the modular loader output — the
// author-visible fields the retired legacy-parity comparison used to check:
//   flow_id, phase, per-question field integrity (id / type / prompt|label|body),
//   provenance-block presence or absence, and identity_lite's gate/terminal/branch
//   routing shape.
//
// Deliberately NOT asserted here — removed as churn that protects no functionality:
//   - Hardcoded question-ID order arrays (`.map(q => q.id)).toEqual([...])`). Order
//     that actually matters is covered insertion-tolerantly by indexOf assertions in
//     IdentityLite.us1.test.ts and by buildStepGraph reachability; a pinned array
//     breaks on every legitimate reorder or insertion without catching a real defect.
//   - `toMatchSnapshot` projections (a 621-line snapshot that churned on any field
//     edit). Question presence/reachability is enforced by the per-question registry
//     tests + buildStepGraph, not a frozen projection.

import { describe, it, expect } from "vitest";
import { loadModularFlow } from "../../src/survey/loadModularFlow.ts";

// ---------------------------------------------------------------------------
// ?raw YAML imports (Vite handles these; typed via src/vite-env.d.ts)
// ---------------------------------------------------------------------------

import phaseAModularRaw from "../../../../content/flows/proposed/phase_a_identity.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";
import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";
import trackModularRaw from "../../../../content/flows/track.modular.yaml?raw";
import projectNameModularRaw from "../../../../content/flows/project_name.modular.yaml?raw";

// ---------------------------------------------------------------------------
// Phase A structural integrity
// ---------------------------------------------------------------------------

describe("flow-parity: phase_a_identity — questions[]", () => {
  const modular = loadModularFlow(phaseAModularRaw);

  it("has questions", () => {
    expect(modular.questions.length).toBeGreaterThan(0);
  });

  it("flow_id is phase_a_identity", () => {
    expect(modular.flow_id).toBe("phase_a_identity");
  });

  it("phase is A", () => {
    expect(modular.phase).toBe("A");
  });

  it("all questions have id, type, and at least prompt or label", () => {
    for (const q of modular.questions) {
      expect(q.id, `question missing id`).toBeTruthy();
      expect(q.type, `question "${q.id}" missing type`).toBeTruthy();
      const hasText = q.prompt !== undefined || q.label !== undefined || q.body !== undefined;
      expect(hasText, `question "${q.id}" has neither prompt, label, nor body`).toBe(true);
    }
  });
});

describe("flow-parity: phase_a_identity — provenance_questions[]", () => {
  const modular = loadModularFlow(phaseAModularRaw);

  it("has provenance_questions", () => {
    expect(modular.provenance_questions).toBeDefined();
  });

  it("all provenance questions have id, type, and at least prompt or label", () => {
    for (const q of modular.provenance_questions ?? []) {
      expect(q.id).toBeTruthy();
      expect(q.type).toBeTruthy();
      const hasText = q.prompt !== undefined || q.label !== undefined;
      expect(hasText, `provenance question "${q.id}" has neither prompt nor label`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase F structural integrity
// ---------------------------------------------------------------------------

describe("flow-parity: phase_f_helpdocs — questions[]", () => {
  const modular = loadModularFlow(phaseFModularRaw);

  it("has questions", () => {
    expect(modular.questions.length).toBeGreaterThan(0);
  });

  it("flow_id is phase_f_helpdocs", () => {
    expect(modular.flow_id).toBe("phase_f_helpdocs");
  });

  it("no provenance_questions in Phase F", () => {
    expect(modular.provenance_questions).toBeUndefined();
  });

  it("all questions have id, type, and at least prompt or label", () => {
    for (const q of modular.questions) {
      expect(q.id).toBeTruthy();
      expect(q.type).toBeTruthy();
      const hasText = q.prompt !== undefined || q.label !== undefined || q.body !== undefined;
      expect(hasText, `question "${q.id}" has neither prompt, label, nor body`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// identity_lite structural integrity (T017)
// Order + derivation are covered insertion-tolerantly in IdentityLite.us1.test.ts;
// here we keep the routing-shape invariants (gate / terminal / branch / options)
// that are unique to this harness.
// ---------------------------------------------------------------------------

describe("flow-parity: identity_lite — routing shape", () => {
  const modular = loadModularFlow(identityLiteModularRaw);

  it("flow_id is identity_lite", () => {
    expect(modular.flow_id).toBe("identity_lite");
  });

  it("no provenance_questions in identity_lite", () => {
    expect(modular.provenance_questions).toBeUndefined();
  });

  it("il_target_script is a gate question (has conditional next rules)", () => {
    const q = modular.questions.find((x) => x.id === "il_target_script");
    expect(q).toBeDefined();
    expect(Array.isArray(q?.next)).toBe(true);
  });

  it("il_script_not_supported is a terminal notice question", () => {
    const q = modular.questions.find((x) => x.id === "il_script_not_supported");
    expect(q).toBeDefined();
    expect(q?.type).toBe("notice");
    // notice question has no outgoing next (it is terminal)
    expect(q?.next === undefined || q?.next === null).toBe(true);
  });

  it("il_target_script.next has a conditional branch to il_script_not_supported", () => {
    const q = modular.questions.find((x) => x.id === "il_target_script");
    const next = q?.next;
    expect(Array.isArray(next)).toBe(true);
    const rules = next as Array<{ condition?: string; goto?: string | null; default?: unknown }>;
    const hasNotSupportedBranch = rules.some((r) => r.goto === "il_script_not_supported");
    expect(hasNotSupportedBranch).toBe(true);
  });

  it("il_target_script has options (script choices)", () => {
    const q = modular.questions.find((x) => x.id === "il_target_script");
    expect(Array.isArray(q?.options)).toBe(true);
    expect((q?.options ?? []).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Phase G — track selection (T003 coverage for new flow)
// ---------------------------------------------------------------------------

describe("flow-parity: track — questions[]", () => {
  const modular = loadModularFlow(trackModularRaw);

  it("has questions", () => {
    expect(modular.questions.length).toBeGreaterThan(0);
  });

  it("flow_id is track", () => {
    expect(modular.flow_id).toBe("track");
  });

  it("phase is G", () => {
    expect(modular.phase).toBe("G");
  });

  it("contains track_choice question", () => {
    expect(modular.questions.map((q) => q.id)).toContain("track_choice");
  });

  it("no provenance_questions in track flow", () => {
    expect(modular.provenance_questions).toBeUndefined();
  });

  it("all questions have id, type, and at least prompt or label", () => {
    for (const q of modular.questions) {
      expect(q.id, "question missing id").toBeTruthy();
      expect(q.type, `question "${q.id}" missing type`).toBeTruthy();
      const hasText = q.prompt !== undefined || q.label !== undefined || q.body !== undefined;
      expect(hasText, `question "${q.id}" has neither prompt, label, nor body`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase G — project name (T003 coverage for new flow)
// ---------------------------------------------------------------------------

describe("flow-parity: project_name — questions[]", () => {
  const modular = loadModularFlow(projectNameModularRaw);

  it("has questions", () => {
    expect(modular.questions.length).toBeGreaterThan(0);
  });

  it("flow_id is project_name", () => {
    expect(modular.flow_id).toBe("project_name");
  });

  it("phase is G", () => {
    expect(modular.phase).toBe("G");
  });

  it("contains project_display_name and project_keyboard_id questions", () => {
    const ids = modular.questions.map((q) => q.id);
    expect(ids).toContain("project_display_name");
    expect(ids).toContain("project_keyboard_id");
  });

  it("no provenance_questions in project_name flow", () => {
    expect(modular.provenance_questions).toBeUndefined();
  });

  it("all questions have id, type, and at least prompt or label", () => {
    for (const q of modular.questions) {
      expect(q.id, "question missing id").toBeTruthy();
      expect(q.type, `question "${q.id}" missing type`).toBeTruthy();
      const hasText = q.prompt !== undefined || q.label !== undefined || q.body !== undefined;
      expect(hasText, `question "${q.id}" has neither prompt, label, nor body`).toBe(true);
    }
  });
});
