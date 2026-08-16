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
//
// The ONE ordered array that remains is Phase F's default-path traversal, and it is
// a different animal from the membership arrays removed above: it asserts where the
// router GOES when the depth gate is answered No, not what order the YAML happens to
// list. Adding a question to the opt-in battery does not change it — which is the
// whole point, since "the default path stays short" is the contract Phase F exists
// to keep. It fails only when routing actually changes, so it is not churn.

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

  // The minimum-questions contract. Anything that needs research (which font
  // covers the repertoire, canonical mark order) or support experience the
  // author does not have yet must stay OFF this path.
  it("purpose is the ONLY required question in Phase F", () => {
    const required = modular.questions
      .filter((q) => q.required === true)
      .map((q) => q.id);
    // pf_more_detail_gate is a single click, not content the author must author.
    expect(required).toEqual(["pf_welcome_paragraph", "pf_more_detail_gate"]);
  });

  it("the default path (gate = No) is 5 screens", () => {
    const index = new Map(modular.questions.map((q) => [q.id, q]));
    const path: string[] = [];
    let cur: string | null = modular.questions[0]!.id;
    while (cur !== null) {
      path.push(cur);
      const q = index.get(cur);
      expect(q, `unresolved step ${cur}`).toBeDefined();
      const next = q!.next;
      if (typeof next === "string") {
        cur = next;
      } else if (Array.isArray(next)) {
        // Answer the gate with No — the minimum-friction default.
        const fallthrough = next.find((r) => r.default === true);
        cur = fallthrough?.goto ?? null;
      } else {
        cur = null;
      }
    }
    expect(path).toEqual([
      "pf_welcome_paragraph",
      "pf_usage_tip_1",
      "pf_more_detail_gate",
      "pf_credits",
      "pf_contact_info",
    ]);
  });

  // Phase F documentation revision: five fixed tip slots fit neither end of the
  // shipped corpus, so tips 3-5 are demoted out of the live membership. They stay
  // registered + on disk + test-covered (see phaseFDemotion.test.ts).
  it("demoted tips 3-5 are absent from the live membership", () => {
    const ids = modular.questions.map((q) => q.id);
    expect(ids).not.toContain("pf_usage_tip_3");
    expect(ids).not.toContain("pf_usage_tip_4");
    expect(ids).not.toContain("pf_usage_tip_5");
  });

  it("pf_more_detail_gate and pf_design_rationale are gate questions (conditional next)", () => {
    for (const id of ["pf_more_detail_gate", "pf_design_rationale"]) {
      const q = modular.questions.find((q) => q.id === id);
      expect(q, `${id} missing from Phase F`).toBeDefined();
      expect(Array.isArray(q?.next), `${id}.next should be conditional rules`).toBe(true);
    }
  });

  it("every non-terminal next target resolves inside the flow", () => {
    const ids = new Set(modular.questions.map((q) => q.id));
    for (const q of modular.questions) {
      const targets =
        typeof q.next === "string"
          ? [q.next]
          : Array.isArray(q.next)
            ? q.next.map((r) => r.goto)
            : [];
      for (const t of targets) {
        if (t === null) continue;
        expect(ids.has(t), `"${q.id}".next -> "${t}" is not in the Phase F flow`).toBe(true);
      }
    }
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

  // spec 064 US1: the supported path must reach attribution, and the gated path
  // must NOT — an author who cannot make a keyboard is never asked who owns it.
  it("il_target_script's default branch continues into attribution", () => {
    const q = modular.questions.find((q) => q.id === "il_target_script");
    const rules = q?.next as Array<{ condition?: string; goto?: string | null; default?: unknown }>;
    const fallthrough = rules.find((r) => r.default === true);
    expect(fallthrough?.goto).toBe("il_author_name");
  });

  it("attribution chains to a terminal copyright-holder question", () => {
    const byId = new Map(modular.questions.map((q) => [q.id, q]));
    expect(byId.get("il_author_name")?.next).toBe("il_author_email");
    expect(byId.get("il_author_email")?.next).toBe("il_copyright_holder");
    expect(byId.get("il_copyright_holder")?.next).toBeNull();
  });

  it("only the author NAME is required — holder defaults to it, email may be private", () => {
    const byId = new Map(modular.questions.map((q) => [q.id, q]));
    expect(byId.get("il_author_name")?.required).toBe(true);
    expect(byId.get("il_author_email")?.required).toBe(false);
    expect(byId.get("il_copyright_holder")?.required).toBe(false);
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
