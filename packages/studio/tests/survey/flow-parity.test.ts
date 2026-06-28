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

import phaseAModularRaw from "../../../../content/flows/phase_a_identity.modular.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";
import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

// ---------------------------------------------------------------------------
// Author-visible field projection
// ---------------------------------------------------------------------------

function projectQuestion(q: FlowQuestion): {
  id: string;
  prompt: string | undefined;
  help_text: string | undefined;
  type: string;
  options: Array<{ value: string; label: string }> | undefined;
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
      "language_name_autonym",
      "language_name_english",
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
      "pf_welcome_paragraph",
      "pf_usage_tip_1",
      "pf_usage_tip_2",
      "pf_usage_tip_3",
      "pf_usage_tip_4",
      "pf_usage_tip_5",
      "pf_credits",
      "pf_contact_info",
    ]);
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

  it("has exactly 5 questions", () => {
    expect(modular.questions.length).toBe(5);
  });

  it("flow_id is identity_lite", () => {
    expect(modular.flow_id).toBe("identity_lite");
  });

  it("question IDs in order", () => {
    expect(modular.questions.map((q) => q.id)).toEqual([
      "il_language_autonym",
      "il_language_english",
      "il_language_code",
      "il_target_script",
      "il_script_not_supported",
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
