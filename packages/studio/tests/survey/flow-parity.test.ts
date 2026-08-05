// Modular flow structural-integrity harness (T003 + T017).
//
// Previously compared loadModularFlow(<modular>?raw) against parseFlow(<legacy>?raw).
// The legacy parseFlow loader (loadFlow.ts) has been retired; parity was verified
// and confirmed in Phase 3a before deletion. This suite now asserts structural
// invariants directly on the modular loader output, covering the same author-visible
// fields that the parity comparison checked:
//   id, prompt, help_text, type, options (value + label, in order), required, next
//
// Both questions[] and provenance_questions[] are projected (Phase A only).

import { describe, it, expect } from "vitest";
import { loadModularFlow } from "../../src/survey/loadModularFlow.ts";
import type { FlowQuestion, FlowOption } from "../../src/survey/types.ts";

// ---------------------------------------------------------------------------
// ?raw YAML imports (Vite handles these; typed via src/vite-env.d.ts)
// ---------------------------------------------------------------------------

import phaseAModularRaw from "../../../../content/flows/proposed/phase_a_identity.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";
import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";
import trackModularRaw from "../../../../content/flows/track.modular.yaml?raw";
import projectNameModularRaw from "../../../../content/flows/project_name.modular.yaml?raw";

// ---------------------------------------------------------------------------
// Author-visible field projection
// ---------------------------------------------------------------------------

function projectQuestion(q: FlowQuestion): {
  id: string;
  prompt: string | undefined;
  help_text: string | undefined;
  type: string;
  options: Array<{ value: string; label: string }> | undefined;
  options_source: string | undefined;
  required: boolean | undefined;
  next: FlowQuestion["next"];
} {
  return {
    id: q.id,
    prompt: q.prompt,
    help_text: q.help_text,
    type: q.type,
    options: q.options
      ? q.options.map((o: FlowOption) => ({
          value: o.value,
          label: o.label,
        }))
      : undefined,
    options_source: q.options_source,
    required: q.required,
    next: q.next,
  };
}

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

  it("expected question IDs in order", () => {
    expect(modular.questions.map((q) => q.id)).toEqual([
      "desktop_first_notice",
      "language_name_english",
      "language_name_autonym",
      "iso_code",
      "region",
      "primary_script",
      "writing_direction",
      "script_not_supported_stub",
      "layout_family",
      "script_family",
      "pa_primary_target",
      "author_display_name",
      "author_contact_email",
      "pa_copyright_holder",
      "provenance_opt_in",
    ]);
  });

  it("all questions have id, type, and at least prompt or label", () => {
    for (const q of modular.questions) {
      expect(q.id, `question missing id`).toBeTruthy();
      expect(q.type, `question "${q.id}" missing type`).toBeTruthy();
      const hasText = q.prompt !== undefined || q.label !== undefined || q.body !== undefined;
      expect(hasText, `question "${q.id}" has neither prompt, label, nor body`).toBe(true);
    }
  });

  it("projected fields are stable (snapshot)", () => {
    const projected = modular.questions.map(projectQuestion);
    expect(projected).toMatchSnapshot("Phase A questions projected");
  });
});

describe("flow-parity: phase_a_identity — provenance_questions[]", () => {
  const modular = loadModularFlow(phaseAModularRaw);

  it("has provenance_questions", () => {
    expect(modular.provenance_questions).toBeDefined();
  });

  it("expected provenance question IDs in order", () => {
    expect(modular.provenance_questions?.map((q) => q.id)).toEqual([
      "provenance_requester_name",
      "provenance_requester_contact",
      "provenance_requester_affiliation",
      "provenance_requester_relation",
      "provenance_community_rep_name",
      "provenance_community_rep_role",
      "provenance_community_rep_email",
      "provenance_speaker_count",
      "provenance_regions",
      "provenance_language_status",
      "provenance_existing_tools",
      "provenance_orthography_url",
      "provenance_community_involvement",
      "provenance_casing_notes",
      "provenance_additional_notes",
    ]);
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

  it("expected question IDs in order", () => {
    expect(modular.questions.map((q) => q.id)).toEqual([
      // default path
      "pf_welcome_paragraph",
      "pf_usage_tip_1",
      "pf_more_detail_gate",
      // opt-in battery (gate = Yes)
      "pf_doc_language",
      "pf_font_guidance",
      "pf_usage_tip_2",
      "pf_scope_variety",
      "pf_provenance_basis",
      "pf_design_rationale",
      // non-roman branch only (ctx.routing_group)
      "pf_canonical_order",
      "pf_script_glossary",
      "pf_example_words",
      "pf_troubleshooting",
      "pf_related_keyboards",
      "pf_known_limitations",
      "pf_further_reading",
      "pf_project_url",
      // close — both paths
      "pf_credits",
      "pf_contact_info",
    ]);
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

  it("projected fields are stable (snapshot)", () => {
    const projected = modular.questions.map(projectQuestion);
    expect(projected).toMatchSnapshot("Phase F questions projected");
  });
});

// ---------------------------------------------------------------------------
// identity_lite structural integrity (T017)
// ---------------------------------------------------------------------------

describe("flow-parity: identity_lite — questions[]", () => {
  const modular = loadModularFlow(identityLiteModularRaw);

  // 6 -> 9: spec 037 US1 appends attribution capture (author name, email,
  // copyright holder) to the identity flow.
  it("has exactly 9 questions", () => {
    expect(modular.questions.length).toBe(9);
  });

  it("flow_id is identity_lite", () => {
    expect(modular.flow_id).toBe("identity_lite");
  });

  it("question IDs in order", () => {
    // spec 030 FR-009: English-name picker (il_language_english, @langtags_names)
    // first; autonym is a choice over the resolved local names; il_language_code
    // is a code CONFIRMATION seeded from the resolved entry. il_language_region
    // (US3) is a conditional step reached only when the picked language is
    // region-ambiguous; it sits in the membership after the English-name step.
    expect(modular.questions.map((q) => q.id)).toEqual([
      "il_language_english",
      "il_language_region",
      "il_language_autonym",
      "il_language_code",
      "il_target_script",
      "il_script_not_supported",
      // spec 037 US1 — attribution, reached from il_target_script's DEFAULT
      // branch. A gated script goes to il_script_not_supported instead and
      // terminates, so it never reaches these.
      "il_author_name",
      "il_author_email",
      "il_copyright_holder",
    ]);
  });

  it("no provenance_questions in identity_lite", () => {
    expect(modular.provenance_questions).toBeUndefined();
  });

  it("il_target_script is a gate question (has conditional next rules)", () => {
    const q = modular.questions.find((q) => q.id === "il_target_script");
    expect(q).toBeDefined();
    expect(Array.isArray(q?.next)).toBe(true);
  });

  // spec 037 US1: the supported path must reach attribution, and the gated path
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
    const q = modular.questions.find((q) => q.id === "il_script_not_supported");
    expect(q).toBeDefined();
    expect(q?.type).toBe("notice");
    // notice question has no outgoing next (it is terminal)
    expect(q?.next === undefined || q?.next === null).toBe(true);
  });

  it("il_target_script.next has a conditional branch to il_script_not_supported", () => {
    const q = modular.questions.find((q) => q.id === "il_target_script");
    const next = q?.next;
    expect(Array.isArray(next)).toBe(true);
    const rules = next as Array<{ condition?: string; goto?: string | null; default?: unknown }>;
    const hasNotSupportedBranch = rules.some(
      (r) => r.goto === "il_script_not_supported",
    );
    expect(hasNotSupportedBranch).toBe(true);
  });

  it("il_target_script has options (script choices)", () => {
    const q = modular.questions.find((q) => q.id === "il_target_script");
    expect(Array.isArray(q?.options)).toBe(true);
    expect((q?.options ?? []).length).toBeGreaterThan(0);
  });

  it("projected fields are stable (snapshot)", () => {
    const projected = modular.questions.map(projectQuestion);
    expect(projected).toMatchSnapshot("identity_lite questions projected");
  });
});

// ---------------------------------------------------------------------------
// Phase G — track selection (T003 coverage for new flow, task 6)
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
// Phase G — project name (T003 coverage for new flow, task 6)
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
