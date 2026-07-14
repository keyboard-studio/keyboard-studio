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

import { irPath } from "@keyboard-studio/contracts";
import type { Step } from "./types.ts";
import { CharactersStep } from "../survey/CharactersStep.tsx";
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
  // DEC-D1 (subsumption, Matt 2026-06-29): the opaque charactersStep subsumes the
  // Phase A/B questions, including iso_code (iso_code.ts:80) which writes
  // header.bcp47. Declaring that write here makes the producer visible within the
  // single manifest graph, so manifest-level C5 (checkInputsSatisfiable) finds a
  // writer for prefill's session-derived header.bcp47 input and stays GREEN — no
  // separate question-writer C5, no cross-graph exemption. This declared write is
  // exactly what Phase 2 makes real when iso_code executes inside the decomposed
  // step. (The session-level ScriptPrefill is a non-IR signal — not an irPath —
  // so it carries no C5 obligation; irPath('header','script') does not exist.)
  writes: [irPath("header", "bcp47")],
  // CharactersStep component — self-contained prefill/PhaseB substage adapter
  // (spec 027 Stage 4; first runtime use of step.component).
  component: CharactersStep,
  // phase_b_characters runs inside the characters step (spec 024, Stage 1).
  flowRefs: ["phase_b_characters"],
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

// ---------------------------------------------------------------------------
// validateManifestShape — throw-on-mismatch structural guard (M2, M3, M4, M4b, M5).
//
// The ONE structural invariant check over the manifest. Called once at module
// load by StudioShell (a misshapen manifest is a hard error, not a logged
// warning — fail fast so CI catches it before any render occurs). Exported so
// the invariant is directly unit-testable (spec 034 T003 / SR-1, SR-2, SR-5)
// without importing the whole SPA shell; it depends only on `manifest`, so it
// stays boundary-clean here in steps/.
// ---------------------------------------------------------------------------

export function validateManifestShape(): void {
  const ids = manifest.map((s) => s.id);
  const spineIds = manifest.filter((s) => s.spine !== false).map((s) => s.id);

  // M2 — spine order.
  const expectedSpine = [
    "identity", "choose_base", "track", "characters",
    "carve", "mechanisms", "touch", "help", "package",
  ];
  for (let i = 0; i < expectedSpine.length; i++) {
    const expected = expectedSpine[i];
    if (expected === undefined) break;
    const actual = spineIds[i];
    if (actual !== expected) {
      throw new Error(
        `[manifest] spine[${i}] expected "${expected}", got "${actual ?? "(none)"}"`,
      );
    }
  }

  // M3 — exactly one lock:physical and one lock:touch, in that order.
  const locks = manifest.filter((s) => s.lock !== undefined).map((s) => s.lock);
  if (locks[0] !== "physical" || locks[1] !== "touch" || locks.length !== 2) {
    throw new Error(
      `[manifest] locks expected ["physical","touch"], got [${locks.join(",")}]`,
    );
  }

  // M4 — touch_seed_source is spine:false with joinTarget "touch".
  const seedSource = manifest.find((s) => s.id === "touch_seed_source");
  if (seedSource === undefined || seedSource.spine !== false || seedSource.joinTarget !== "touch") {
    throw new Error(`[manifest] touch_seed_source missing or misconfigured`);
  }

  // M4b — project_name is spine:false with joinTarget "characters".
  const projName = manifest.find((s) => s.id === "project_name");
  if (projName === undefined || projName.spine !== false || projName.joinTarget !== "characters") {
    throw new Error(`[manifest] project_name missing or misconfigured (must be spine:false, joinTarget:"characters")`);
  }

  // M5 — unique ids.
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`[manifest] duplicate step id: "${id}"`);
    }
    seen.add(id);
  }

  // Layout guard (spec 028 Stage 5, T016): layout:"full" is LOAD-BEARING —
  // StepHost reads step.layout to select full-screen vs two-pane chrome (R4).
  // EXACTLY {carve, mechanisms, touch} must declare layout:"full"; all others
  // must be "pane" or omit layout. A mismatched layout would silently change
  // the chrome.
  const FULL_LAYOUT_IDS = new Set(["carve", "mechanisms", "touch"]);
  for (const step of manifest) {
    if (step.layout === "full") {
      if (!FULL_LAYOUT_IDS.has(step.id)) {
        throw new Error(
          `[manifest] unexpected layout:"full" on step "${step.id}" — only carve/mechanisms/touch may be full-screen (spec 024 Stage 0)`,
        );
      }
    }
  }
  for (const expectedId of FULL_LAYOUT_IDS) {
    const step = manifest.find((s) => s.id === expectedId);
    if (step?.layout !== "full") {
      throw new Error(
        `[manifest] step "${expectedId}" must declare layout:"full" (spec 024 Stage 0)`,
      );
    }
  }
}
