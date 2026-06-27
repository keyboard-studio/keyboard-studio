// manifest — the single ordered list of all survey steps.
//
// T024 (P4b foundation). This is the ONE source of survey ordering (FR-008,
// FR-012). The runtime (T028) and the dashboard (T031) both read this array.
// Editing this file changes the order in both places simultaneously —
// "map == runtime by construction" (FR-010).
//
// SPINE ORDER (FR-012, M2):
//   Identity → choose base → Track → [project_name (spine:false)] →
//   Characters (Phase A/B questions) → Carve → Mechanisms → [lock: "physical"] →
//   touch_seed_source (spine:false) → touch → [lock: "touch"] → Help → Package (reserved)
//
// Side-trail steps (spine:false) in position order:
//   project_name — copy-track only; joinTarget: "characters"
//   touch_seed_source — touch-seed fork; joinTarget: "touch"
//
// Boundary: steps/ -> editors/ and steps/ -> survey/ are allowed.
// steps/ -> stores/, lib/, components/ are forbidden.

import type { Step } from "./types.ts";
import {
  identityStep,
  chooseBaseStep,
  trackStep,
  projectNameStep,
  carveStep,
  mechanismsStep,
  touchSeedSourceStep,
  touchStep,
  helpStep,
  packageStep,
} from "./registerEditorSteps.ts";

// ---------------------------------------------------------------------------
// "Characters" phase — the Phase A/B question battery.
//
// Represented as a single manifest placeholder. The actual question ordering
// within Phase A/B is handled by the SurveyRunner (FlowDef routing) rather
// than expanded step-by-step in the manifest (the SurveyRunner is the
// intra-phase router; the manifest is the inter-phase router).
//
// SurveyView delegates to the existing Phase A/B SurveyRunner (prefill → B)
// for its internal routing — these are legitimately intra-phase screens.
// ---------------------------------------------------------------------------

/** Spine placeholder for the Phase A/B character-inventory question battery. */
const charactersStep: Step = {
  kind: "editor-step",
  id: "characters",
  title: "Characters",
  spine: true,
  inputs: [],
  writes: [],
  // Temporary stub component — wired in T028 via SurveyView's internal runner.
  component: () => null,
} as const;

// ---------------------------------------------------------------------------
// Manifest: the ordered Step[] (FR-008, FR-012)
//
// Rules encoded here:
//   M2 — spine order: Identity → choose_base → track → Characters → Carve →
//         Mechanisms → (lock physical) → touch → (lock touch) → Help → Package
//   M3 — exactly one lock:"physical" and one lock:"touch", in that order.
//   M4 — touch_seed_source is spine:false with joinTarget resolving to "touch".
//   M4b — project_name is spine:false with joinTarget:"characters" (copy-track fork).
// ---------------------------------------------------------------------------

export const manifest: readonly Step[] = [
  // --- Identity panel ---
  identityStep,

  // --- Base selection (base picker only) ---
  chooseBaseStep,

  // --- Track selection (copy vs adapt) ---
  trackStep,

  // --- Project name (off-spine, copy-track only; adapt-track skips to characters) ---
  // spine:false — CYOA fork: copy-track takes this step, adapt-track bypasses it.
  // joinTarget: "characters" — both branches reconverge at the characters spine step.
  {
    ...projectNameStep,
    spine: false,
    joinTarget: "characters",
  } satisfies Step,

  // --- Character inventory (Phase A / Phase B question battery) ---
  charactersStep,

  // --- Carve (Phase D: remove unwanted base keys) ---
  carveStep,

  // --- Mechanisms (Phase C: physical key assignment) ---
  // The reducer fires lockDesktop() when this step completes (R1).
  {
    ...mechanismsStep,
    lock: "physical",
  } satisfies Step,

  // --- Touch seed source (off-spine fork, FR-013, M4) ---
  // spine:false — side trail that lets the author choose the touch seed.
  // joinTarget: "touch" — rejoins the spine at the touch carve+add step.
  // Both branches converge on the same touch carve/add shell.
  touchSeedSourceStep,

  // --- Touch carve+add (Phase E: touch key assignment) ---
  // The reducer fires buildTouchLayoutJson when this step completes (R2).
  {
    ...touchStep,
    lock: "touch",
  } satisfies Step,

  // --- Help (Phase F: usage tips and credits) ---
  helpStep,

  // --- Package (reserved, out of scope for v1) ---
  packageStep,
] as const;
