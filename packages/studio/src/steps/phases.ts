// phases — the ONE mapping from the wizard's real step ids (steps/manifest.ts)
// onto the six DISPLAY phases (A-F) a phase-stepper UI renders.
//
// This mapping is FIXED by the product owner (design handoff) — do not
// re-derive or "improve" it here. It is display-only: "Discard" is the label
// shown for the real `carve` step, "Enable" for `mechanisms` /
// `touch_seed_source` / `touch`, "Finalize" for `help`. No step id, route
// token, or state id is renamed by this file.
//
// `package` is a reserved stub that never advances (FR-012, see
// registerEditorSteps.ts's packageStep) and deliberately gets NO pill — it is
// listed in UNPHASED_STEP_IDS rather than silently missing from every phase.
//
// -----------------------------------------------------------------------
// THIS IS NOT survey/constants.ts's VALID_PHASES.
//
// survey/constants.ts defines a DIFFERENT, older, flow-YAML-scoped A-G
// letter scheme consumed by loadModularFlow.ts's per-question `phase` field
// (see survey/questions/g/*.ts, "Phase G — Authoring Track" / "Phase G —
// Project Name"). In THAT scheme:
//   - `track` and `project_name` are phase "G", not part of this file's B.
//   - "C-prime" is an empty reserved slot for a future Reorder question,
//     with no analogue here.
// The two schemes share some letters (A, B, C, F) but do not share meaning,
// membership, or count (that scheme has 8 letters — A, B, C, C-prime, D, E,
// F, G; this one has exactly 6 — A-F). Do not cross-reference the two, and
// do not let a future edit collapse them into one — they answer different
// questions ("which flow-YAML phase does this question belong to" vs. "which
// stepper pill does this manifest step light up").
// -----------------------------------------------------------------------

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { manifest } from "./manifest.ts";

// ---------------------------------------------------------------------------
// StepId — local literal mirror of the real manifest step ids.
//
// Mirrors stores/surveySessionStore.ActiveStepId, minus the two terminal
// states ("done" / "unsupported") that are not manifest steps and so can
// never carry a phase. Defined locally (not imported) because steps/ -> stores/
// is a forbidden boundary (see manifest.ts's header comment); steps/advance.ts
// already establishes this exact "local type mirror, kept in sync by hand"
// idiom for the same reason. Any manifest step id rename must be reflected
// here in the same change, or `validatePhaseMap()` throws at module load
// (the runtime half of this guard) — the type union itself cannot detect a
// rename made only in registerEditorSteps.ts, since Step.id is a plain
// `string` there (types.ts StepBase.id), not a literal.
// ---------------------------------------------------------------------------

export type StepId =
  | "identity"
  | "choose_base"
  | "track"
  | "project_name"
  | "characters"
  | "marks"
  | "punctuation"
  | "convenience"
  | "carve"
  | "mechanisms"
  | "touch_seed_source"
  | "touch"
  | "help"
  | "package";

// ---------------------------------------------------------------------------
// PhaseLetter / PhaseDef
// ---------------------------------------------------------------------------

export type PhaseLetter = "A" | "B" | "C" | "D" | "E" | "F";

export interface PhaseDef {
  letter: PhaseLetter;
  /** Display label only — never a step id, route token, or state id. */
  label: MessageDescriptor;
  stepIds: readonly StepId[];
}

// ---------------------------------------------------------------------------
// PHASES — the fixed A-F mapping (product owner handoff). Order matters:
// this is also the pill-display order.
// ---------------------------------------------------------------------------

export const PHASES: readonly PhaseDef[] = [
  {
    letter: "A",
    label: msg({ id: "phaseStepper.phase.a", message: "Survey" }),
    stepIds: ["identity"],
  },
  {
    letter: "B",
    label: msg({ id: "phaseStepper.phase.b", message: "Base keyboard" }),
    stepIds: ["choose_base", "track", "project_name"],
  },
  {
    letter: "C",
    label: msg({ id: "phaseStepper.phase.c", message: "Characters" }),
    // punctuation added post-rebase (main's f75ede1c "punctuation survey
    // step"): it sits between marks and convenience on the manifest spine
    // and emits its picks on a phase:"C" SurveyPhaseResult (see its own
    // header comment in manifest.ts) — same C-phase membership as the other
    // three, added here because validatePhaseMap() throws at module load
    // for any manifest step with no phase (this is that guard doing its job).
    stepIds: ["characters", "marks", "punctuation", "convenience"],
  },
  {
    letter: "D",
    label: msg({ id: "phaseStepper.phase.d", message: "Discard" }),
    stepIds: ["carve"],
  },
  {
    letter: "E",
    label: msg({ id: "phaseStepper.phase.e", message: "Enable" }),
    stepIds: ["mechanisms", "touch_seed_source", "touch"],
  },
  {
    letter: "F",
    label: msg({ id: "phaseStepper.phase.f", message: "Finalize" }),
    stepIds: ["help"],
  },
] as const;

/**
 * Reserved stub steps that never advance (FR-012) and so get no pill.
 * `package` is the only member today — see registerEditorSteps.ts's
 * packageStep docstring ("reserved / out-of-scope for v1").
 */
export const UNPHASED_STEP_IDS: readonly StepId[] = ["package"];

// ---------------------------------------------------------------------------
// phaseOfStep — the phase a given step id belongs to, or null (unphased /
// unknown).
// ---------------------------------------------------------------------------

export function phaseOfStep(id: StepId): PhaseDef | null {
  for (const phase of PHASES) {
    if (phase.stepIds.includes(id)) return phase;
  }
  return null;
}

// ---------------------------------------------------------------------------
// validatePhaseMap — throw-on-mismatch structural guard, mirroring
// manifest.ts's validateManifestShape().
//
// Invariants:
//   1. Every id in PHASES is a real manifest step id.
//   2. Every manifest step id appears in exactly one phase OR in
//      UNPHASED_STEP_IDS — none missing, none duplicated.
//   3. The flattened PHASES step order is a subsequence of the manifest's
//      declared order (so the pills can never render out of order).
//   4. PHASES letters are exactly A-F, in order, no gaps.
// ---------------------------------------------------------------------------

const EXPECTED_LETTERS: readonly PhaseLetter[] = ["A", "B", "C", "D", "E", "F"];

export function validatePhaseMap(): void {
  const manifestIds = manifest.map((s) => s.id);
  const manifestIdSet = new Set(manifestIds);

  const flattenedPhaseIds: StepId[] = [];
  const seenInPhase = new Map<StepId, PhaseLetter>();

  // Invariant 1 + collect for invariant 2.
  for (const phase of PHASES) {
    for (const id of phase.stepIds) {
      if (!manifestIdSet.has(id)) {
        throw new Error(
          `[phases] phase "${phase.letter}" references step id "${id}", which is not in the manifest`,
        );
      }
      const existing = seenInPhase.get(id);
      if (existing !== undefined) {
        throw new Error(
          `[phases] step id "${id}" appears in more than one phase ("${existing}" and "${phase.letter}")`,
        );
      }
      seenInPhase.set(id, phase.letter);
      flattenedPhaseIds.push(id);
    }
  }

  // Invariant 2 — every manifest step id is covered exactly once, either by a
  // phase or by UNPHASED_STEP_IDS.
  const unphasedSet = new Set(UNPHASED_STEP_IDS);
  for (const id of manifestIds) {
    const inPhase = seenInPhase.has(id as StepId);
    const inUnphased = unphasedSet.has(id as StepId);
    if (!inPhase && !inUnphased) {
      throw new Error(
        `[phases] manifest step id "${id}" is not assigned to any phase and is not in UNPHASED_STEP_IDS`,
      );
    }
    if (inPhase && inUnphased) {
      throw new Error(
        `[phases] manifest step id "${id}" is BOTH in a phase and in UNPHASED_STEP_IDS`,
      );
    }
  }
  for (const id of UNPHASED_STEP_IDS) {
    if (!manifestIdSet.has(id)) {
      throw new Error(
        `[phases] UNPHASED_STEP_IDS entry "${id}" is not a real manifest step id`,
      );
    }
  }

  // Invariant 3 — flattened PHASES order is a subsequence of manifest order.
  let manifestCursor = 0;
  for (const id of flattenedPhaseIds) {
    const idx = manifestIds.indexOf(id, manifestCursor);
    if (idx === -1) {
      throw new Error(
        `[phases] step id "${id}" is out of order relative to the manifest — the flattened phase order must be a subsequence of the manifest's declared order`,
      );
    }
    manifestCursor = idx + 1;
  }

  // Invariant 4 — letters are exactly A-F, in order, no gaps.
  const letters = PHASES.map((p) => p.letter);
  if (letters.length !== EXPECTED_LETTERS.length) {
    throw new Error(
      `[phases] expected exactly ${EXPECTED_LETTERS.length} phases (A-F), got ${letters.length}`,
    );
  }
  for (let i = 0; i < EXPECTED_LETTERS.length; i++) {
    const expected = EXPECTED_LETTERS[i];
    const actual = letters[i];
    if (actual !== expected) {
      throw new Error(
        `[phases] phase[${i}] expected letter "${expected}", got "${actual ?? "(none)"}"`,
      );
    }
  }
}
