// Flow-output parity harness (T003 + T017).
//
// Per-phase golden compare: asserts that loadModularFlow(<modular>?raw) produces
// a FlowDef whose author-visible question fields are deeply equal to those
// produced by parseFlow(<legacy>?raw).
//
// Author-visible fields checked (per contracts/flow-output-parity.md):
//   id, prompt, help_text, type, options (value + label, in order),
//   required, next
//
// Both questions[] and provenance_questions[] are projected (Phase A only).
//
// CRITICAL: This suite MUST pass for a phase before part (b) deletes that
// phase's legacy YAML (FR-006). The suite is the deletion's safety baseline.

import { describe, it, expect } from "vitest";
import { parseFlow } from "../../src/survey/loadFlow.ts";
import { loadModularFlow } from "../../src/survey/loadModularFlow.ts";
import type { FlowQuestion, FlowOption, FlowGotoRule } from "../../src/survey/types.ts";

// ---------------------------------------------------------------------------
// ?raw YAML imports (Vite handles these; typed via src/vite-env.d.ts)
// ---------------------------------------------------------------------------

import phaseALegacyRaw from "../../../../content/flows/phase_a_identity.yaml?raw";
import phaseAModularRaw from "../../../../content/flows/phase_a_identity.modular.yaml?raw";

import phaseFLegacyRaw from "../../../../content/flows/phase_f_helpdocs.yaml?raw";
import phaseFModularRaw from "../../../../content/flows/phase_f_helpdocs.modular.yaml?raw";

import identityLiteLegacyRaw from "../../../../content/flows/identity_lite.yaml?raw";
import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";

// ---------------------------------------------------------------------------
// Encoding-artifact normalizations
//
// Legacy YAML files are being retired; the modular TS form is the surviving
// truth. Before comparison we normalize two encoding differences that are NOT
// content bugs — they arise purely from how each loader serializes the data.
// ---------------------------------------------------------------------------

/**
 * Normalization 1 — trailing whitespace.
 * Legacy YAML folded scalars (">") append a trailing "\n" to string fields.
 * TS modules use plain string literals without it.
 * We trim both sides so the comparison is content-only.
 * (Encoding artifact, not a content difference — legacy YAML being retired.)
 */
function normStr(s: string | undefined): string | undefined {
  return s === undefined ? undefined : s.trimEnd();
}

/**
 * Normalization 2 — `next` default-rule shape.
 * parseFlow emits: { default: null }  (no `goto` key; `default` holds the target)
 * loadModularFlow emits: { default: true, goto: null }  (`goto` holds the target)
 *
 * These express identical routing semantics in different object shapes.
 * Canonical form: conditional rule → { condition, target }
 *                 default rule    → { default: true, target: <destination> }
 *                 string/null next stays as-is.
 * (Encoding artifact, not a content difference — legacy YAML being retired.)
 */
type NormalizedRule =
  | { condition: string; target: string | null }
  | { default: true; target: string | null };

function normalizeNext(
  next: FlowQuestion["next"],
): string | null | NormalizedRule[] | undefined {
  if (!Array.isArray(next)) return next; // string, null, or undefined — unchanged

  return next.map((rule: FlowGotoRule): NormalizedRule => {
    if (rule.condition !== undefined) {
      // Conditional branch: { condition, goto }
      return { condition: rule.condition, target: rule.goto };
    }
    // Default branch.
    // parseFlow shape:      { default: null }    → default key IS the target
    // modular shape:        { default: true, goto: null } → goto IS the target
    let target: string | null;
    if (rule.default === true) {
      // Modular form: goto holds the routing target.
      target = rule.goto;
    } else {
      // parseFlow form: default itself holds the routing target (string or null).
      // Guard against unexpected shapes that would silently produce wrong routing.
      if (typeof rule.default !== "string" && rule.default !== null) {
        throw new Error(
          "unexpected parseFlow default shape: " + JSON.stringify(rule.default),
        );
      }
      target = rule.default;
    }
    return { default: true, target };
  });
}

// ---------------------------------------------------------------------------
// Author-visible field projection
// ---------------------------------------------------------------------------

/**
 * Project a single FlowQuestion to only the author-visible fields.
 * Internal-implementation details (validation closures, etc.) are excluded.
 * This is the canonical projection per contracts/flow-output-parity.md.
 * Both encoding-artifact normalizations are applied here so the comparison
 * is purely over content.
 */
function projectQuestion(q: FlowQuestion): {
  id: string;
  prompt: string | undefined;
  help_text: string | undefined;
  type: string;
  options: Array<{ value: string; label: string }> | undefined;
  required: boolean | undefined;
  next: unknown;
} {
  return {
    id: q.id,
    prompt: normStr(q.prompt),
    help_text: normStr(q.help_text),
    type: q.type,
    options: q.options
      ? q.options.map((o: FlowOption) => ({
          value: o.value,
          label: normStr(o.label)!,
        }))
      : undefined,
    required: q.required,
    next: normalizeNext(q.next),
  };
}

function projectQuestions(
  questions: FlowQuestion[],
): ReturnType<typeof projectQuestion>[] {
  return questions.map(projectQuestion);
}

// ---------------------------------------------------------------------------
// Phase A parity
// ---------------------------------------------------------------------------

describe("flow-parity: phase_a_identity — questions[]", () => {
  const legacy = parseFlow(phaseALegacyRaw);
  const modular = loadModularFlow(phaseAModularRaw);

  it("same number of questions", () => {
    expect(modular.questions.length).toBe(legacy.questions.length);
  });

  it("same question IDs in order", () => {
    expect(modular.questions.map((q) => q.id)).toEqual(
      legacy.questions.map((q) => q.id),
    );
  });

  it("deep equality on all author-visible fields", () => {
    const legacyProjected = projectQuestions(legacy.questions);
    const modularProjected = projectQuestions(modular.questions);
    expect(modularProjected).toEqual(legacyProjected);
  });
});

describe("flow-parity: phase_a_identity — provenance_questions[]", () => {
  const legacy = parseFlow(phaseALegacyRaw);
  const modular = loadModularFlow(phaseAModularRaw);

  it("both have provenance_questions", () => {
    expect(legacy.provenance_questions).toBeDefined();
    expect(modular.provenance_questions).toBeDefined();
  });

  it("same number of provenance_questions", () => {
    expect(modular.provenance_questions?.length).toBe(
      legacy.provenance_questions?.length,
    );
  });

  it("same provenance question IDs in order", () => {
    expect(modular.provenance_questions?.map((q) => q.id)).toEqual(
      legacy.provenance_questions?.map((q) => q.id),
    );
  });

  it("deep equality on all author-visible provenance fields", () => {
    const legacyProjected = projectQuestions(legacy.provenance_questions ?? []);
    const modularProjected = projectQuestions(
      modular.provenance_questions ?? [],
    );
    expect(modularProjected).toEqual(legacyProjected);
  });
});

// ---------------------------------------------------------------------------
// Phase F parity
// ---------------------------------------------------------------------------

describe("flow-parity: phase_f_helpdocs — questions[]", () => {
  const legacy = parseFlow(phaseFLegacyRaw);
  const modular = loadModularFlow(phaseFModularRaw);

  it("same number of questions", () => {
    expect(modular.questions.length).toBe(legacy.questions.length);
  });

  it("same question IDs in order", () => {
    expect(modular.questions.map((q) => q.id)).toEqual(
      legacy.questions.map((q) => q.id),
    );
  });

  it("deep equality on all author-visible fields", () => {
    const legacyProjected = projectQuestions(legacy.questions);
    const modularProjected = projectQuestions(modular.questions);
    expect(modularProjected).toEqual(legacyProjected);
  });

  it("no provenance_questions in Phase F", () => {
    expect(legacy.provenance_questions).toBeUndefined();
    expect(modular.provenance_questions).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// identity_lite parity (T017)
//
// il_target_script.next encoding:
//   Legacy YAML: `- default: null`  --> parseFlow produces { default: null }
//   Module:      { default: true, goto: null }
//
// Lead decision: encoding artifact, not a content bug. normalizeNext()
// canonicalizes both to { default: true, target: null } before comparison.
// A genuine routing difference (different target) still fails.
// ---------------------------------------------------------------------------

describe("flow-parity: identity_lite — questions[]", () => {
  const legacy = parseFlow(identityLiteLegacyRaw);
  const modular = loadModularFlow(identityLiteModularRaw);

  it("same number of questions", () => {
    expect(modular.questions.length).toBe(legacy.questions.length);
  });

  it("same question IDs in order", () => {
    expect(modular.questions.map((q) => q.id)).toEqual(
      legacy.questions.map((q) => q.id),
    );
  });

  it("no provenance_questions in identity_lite", () => {
    expect(legacy.provenance_questions).toBeUndefined();
    expect(modular.provenance_questions).toBeUndefined();
  });

  // Per-question author-visible field checks — individual assertions so
  // the failing test names the exact question when it breaks.
  it("il_language_autonym: author-visible fields equal", () => {
    const legacyQ = legacy.questions.find((q) => q.id === "il_language_autonym");
    const modularQ = modular.questions.find((q) => q.id === "il_language_autonym");
    expect(legacyQ).toBeDefined();
    expect(modularQ).toBeDefined();
    expect(projectQuestion(modularQ!)).toEqual(projectQuestion(legacyQ!));
  });

  it("il_language_english: author-visible fields equal", () => {
    const legacyQ = legacy.questions.find((q) => q.id === "il_language_english");
    const modularQ = modular.questions.find((q) => q.id === "il_language_english");
    expect(legacyQ).toBeDefined();
    expect(modularQ).toBeDefined();
    expect(projectQuestion(modularQ!)).toEqual(projectQuestion(legacyQ!));
  });

  it("il_language_code: author-visible fields equal", () => {
    const legacyQ = legacy.questions.find((q) => q.id === "il_language_code");
    const modularQ = modular.questions.find((q) => q.id === "il_language_code");
    expect(legacyQ).toBeDefined();
    expect(modularQ).toBeDefined();
    expect(projectQuestion(modularQ!)).toEqual(projectQuestion(legacyQ!));
  });

  // ASSERTION: il_target_script.next
  //
  // Legacy YAML `- default: null` parses as { default: null } (no goto key).
  // Module declares { default: true, goto: null }.
  // Lead decision: this is an encoding artifact (not a content bug) — both
  // express "route to null (terminal) by default". normalizeNext() canonicalizes
  // both shapes to { default: true, target: null } before comparison.
  it("il_target_script: author-visible fields equal (including .next default-branch shape)", () => {
    const legacyQ = legacy.questions.find((q) => q.id === "il_target_script");
    const modularQ = modular.questions.find((q) => q.id === "il_target_script");
    expect(legacyQ).toBeDefined();
    expect(modularQ).toBeDefined();
    // Named assertion so the diff is immediately visible in the failure output:
    const legacyProjected = projectQuestion(legacyQ!);
    const modularProjected = projectQuestion(modularQ!);
    expect(modularProjected).toEqual(legacyProjected);
  });

  // Verify the normalized default-branch resolves to the same target on both sides.
  // Raw shapes differ ({ default: null } vs { default: true, goto: null }) but
  // normalizeNext() must produce identical { default: true, target: null } for both.
  it("il_target_script.next default-branch: normalizes to same target on both sides", () => {
    const legacyQ = legacy.questions.find((q) => q.id === "il_target_script");
    const modularQ = modular.questions.find((q) => q.id === "il_target_script");
    const legacyNorm = normalizeNext(legacyQ?.next);
    const modularNorm = normalizeNext(modularQ?.next);
    // Both must normalize to arrays
    expect(Array.isArray(legacyNorm)).toBe(true);
    expect(Array.isArray(modularNorm)).toBe(true);
    // The normalized default-branch (last entry) must be identical
    const legacyDefault = (legacyNorm as unknown[])[(legacyNorm as unknown[]).length - 1];
    const modularDefault = (modularNorm as unknown[])[(modularNorm as unknown[]).length - 1];
    expect(modularDefault).toEqual(legacyDefault);
  });

  it("il_script_not_supported: author-visible fields equal", () => {
    const legacyQ = legacy.questions.find(
      (q) => q.id === "il_script_not_supported",
    );
    const modularQ = modular.questions.find(
      (q) => q.id === "il_script_not_supported",
    );
    expect(legacyQ).toBeDefined();
    expect(modularQ).toBeDefined();
    expect(projectQuestion(modularQ!)).toEqual(projectQuestion(legacyQ!));
  });

  // Full deep-equality across all 5 questions (the catch-all assertion).
  it("deep equality on all 5 author-visible question fields", () => {
    const legacyProjected = projectQuestions(legacy.questions);
    const modularProjected = projectQuestions(modular.questions);
    expect(modularProjected).toEqual(legacyProjected);
  });
});
