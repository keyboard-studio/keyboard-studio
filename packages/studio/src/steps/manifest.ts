// manifest — the survey steps, in DERIVED order (not a hand-ordered list).
//
// The decision registry is the single source of order (spec 087 Q3, SC-003).
// Each step below is a declaration — component, inputs, writes, persistence —
// held in an unordered pool. Its provides / requires / gatedBy come from
// steps/stepDependencies.ts, and `manifest` is the pool sorted by the same
// sort that orders questions (steps/stepOrder.ts → decisions/orderDecisions.ts).
// Nothing in this file says what comes before what.
//
// The runtime (T028) and the dashboard (T031) both read `manifest`. Editing a
// step's declarations changes the step structure in both places
// simultaneously — "map == runtime by construction" (FR-010).
//
// Side trails are DERIVED: a step with a `gatedBy` is a side trail and rejoins
// at the next ungated step (project_name -> characters, touch_seed_source ->
// touch). The resulting main line is pinned, as frozen literals, by
// stepOrder.parity.test.ts.
//
// S-03 sequences build inline in MechanismGallery's method chooser (the
// right-hand preview pane swaps for a one-character sequence builder while
// that method is selected) — there is no separate "sequences" step.
//
// Boundary: steps/ -> editors/ and steps/ -> survey/ are allowed.
// steps/ -> stores/, lib/, components/ are forbidden.

import { irPath } from "@keyboard-studio/contracts";
import type { Step } from "./types.ts";
import { galleryModules } from "../survey/questions/registry.ts";
import type { QuestionModule } from "../survey/types.ts";
import { CharactersStepHost } from "../survey/CharactersStepHost.tsx";
import { MarksStepHost } from "../survey/marks/MarksStepHost.tsx";
import { CONTEXT_TOLERANCE_WRITES } from "./contextToleranceWrites.ts";
import { stepDependencies } from "./stepDependencies.ts";
import { STEP_ORDER, STEP_TRAILS } from "./stepOrder.ts";
import { PunctuationStepHost } from "../survey/punctuation/PunctuationStepHost.tsx";
import { InvisiblesStepHost } from "../survey/invisibles/InvisiblesStepHost.tsx";
import { ConvenienceStepHost } from "../survey/convenience/ConvenienceStepHost.tsx";
import {
  identityStep,
  layoutStep,
  chooseBaseStep,
  trackStep,
  projectNameStep,
  carveStep,
  deadkeysStep,
  rulesStep,
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

/** Placeholder step for the Phase A/B character-inventory question battery. */
const charactersStep: Step = {
  kind: "editor-step",
  id: "characters",
  ...stepDependencies("characters"),
  title: "Characters",
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
  // CharactersStepHost — the gallery host around CharactersStep, the
  // character-inventory module's renderer (spec 090 T021); the component
  // itself remains the self-contained prefill/PhaseB substage adapter
  // (spec 027 Stage 4; first runtime use of step.component).
  component: CharactersStepHost,
  // phase_b_characters runs inside the characters step (spec 024, Stage 1);
  // its flowRefs come from stepDependencies.
  // Right pane swaps from the live OSK preview to the interactive character
  // map for the Phase B build-list screen only (SurveyView further gates this
  // on discoveryMethod === "build-list" — the manual step-by-step path and the
  // IntroChooser keep the OSK preview).
  rightPane: "character-map",
  specRef: ["§8", "specs/027-qu-characters-step"],
  evidence: {
    inputs: ["language tag", "script", "variant", "base keyboard"],
    keyFn: "alphabet",
  },
  persistence: "decision-store", // the alphabet (character-inventory decision, spec 090); its sub-screen position and manual-path answers live in the answer store (spec 079 evidence layer, D-090-29)
} as const;

// ---------------------------------------------------------------------------
// Step declarations: an UNORDERED pool (FR-008)
//
// Nothing here says what comes before what. Order, side-trail membership and
// join targets are derived from provides/requires/gatedBy
// (steps/stepDependencies.ts -> steps/stepOrder.ts). The comments on individual
// steps describe WHY a step needs what it needs, not where it sits.
//
// Rules still validated on the derived order (validateManifestShape):
//   M3 — exactly one lock:"physical" and one lock:"touch", in that order.
//   M5 — unique ids.
//   plus: the pool and the dependency table name exactly the same steps.
// ---------------------------------------------------------------------------

const stepPool: readonly Step[] = [
  // --- Identity panel ---
  identityStep,

  // --- Community keyboard layout (spec 076 A4) ---
  // Which Windows layout the community's typists use. Proposed from the
  // identity language tag and confirmed by the author; feeds the FR-023
  // likely-host resolution that carve, the rules demo and mechanisms read.
  layoutStep,

  // --- Base selection (base picker only) ---
  chooseBaseStep,

  // --- Track selection (copy vs adapt) ---
  trackStep,

  // --- Project name (copy-track only) ---
  // Gated side trail (stepDependencies): copy-track takes this step, adapt-track
  // bypasses it, and both reconverge at the next ungated step.
  projectNameStep,

  // --- Character inventory (Phase A / Phase B question battery) ---
  charactersStep,

  // --- Marks series (spec 071: S0-S5 accent/mark question series) ---
  // Needs the confirmed alphabet, and carve needs its answer: how the author
  // thinks of the combined letters must be known before any key work begins.
  // S0 is a computed gate INSIDE the step component: a marks-free alphabet
  // completes the step immediately (no render), so the hop is invisible
  // for the no-diacritic majority case (FR-005). Emits the PlacementWorklist
  // the mechanism gallery consumes (session.marksWorklist).
  {
    kind: "editor-step",
    id: "marks",
    ...stepDependencies("marks"),
    title: "Accents & marks",
    inputs: [],
    // spec 078: the step's own write is the context-tolerance decision; these
    // are the paths the separate apply effect commits the accepted rules to.
    writes: [...CONTEXT_TOLERANCE_WRITES],
    component: MarksStepHost,
    specRef: ["specs/071-marks-question-series", "specs/052-marks-treatment-question"],
    evidence: {
      inputs: ["the confirmed alphabet: its bases, marks and attested combinations"],
      keyFn: "marks",
    },
    // The marks-treatment decision (spec 090); the per-toggle evidence
    // answers and the step-status slot live in the answer store (spec 079
    // evidence layer, kept by D-090-29).
    persistence: "decision-store",
  } satisfies Step,

  // --- Punctuation (clone of the Phase B build-list, scoped to punctuation) ---
  // Runs after the marks series, before the convenience question: the page the
  // character map's letters/numerals/marks fold points at (the alphabet map
  // deliberately withholds punctuation — see CharacterMapPane.tsx). Same
  // build-list anatomy as Phase B — suggestions, type-in, right-pane character
  // map (scope "punctuation") — all toggling the shared Phase B/C draft (the
  // character-inventory decision value since spec 090). Emits its picks as confirmedInventory on a phase:"C" result (see
  // PunctuationStep.tsx for why not "B"), which the merged session unions in,
  // shielding them from carve and placing any the base cannot type.
  {
    kind: "editor-step",
    id: "punctuation",
    ...stepDependencies("punctuation"),
    title: "Punctuation",
    inputs: [],
    writes: [],
    component: PunctuationStepHost,
    // Right pane swaps to the interactive character map, as on the Phase B
    // build-list screen — but unconditionally: this step has no
    // discoveryMethod fork (SurveyView's gate special-cases "characters" only).
    rightPane: "character-map",
    specRef: ["§8", "specs/020-qu-wire-buildlist", "specs/075-punctuation-defaults"],
    evidence: { inputs: ["resolved language tag", "base keyboard"], keyFn: "punctuation" },
    // The punctuation-inventory decision (spec 090); its one evidence
    // answer lives in the answer store (spec 079 evidence layer, D-090-29).
    persistence: "decision-store",
  } satisfies Step,

  // --- Invisible characters (spec 075 US3) ---
  // Format characters — ZWJ, ZWNJ, ZWSP, SOFT HYPHEN, WORD JOINER and the
  // bidi controls — have no glyph, so no character map can show them and no
  // exemplar tier attests them. This step offers each BY NAME with a need
  // statement; the author's yes/no per character is a recorded decision.
  // ALWAYS renders (FR-020): no computed gate, no null return, unlike the
  // marks series and the convenience question on either side of it. Declares
  // inputs/writes empty (spec 066 FR-006): confirming an inventory is a survey
  // result, not an IR write. Emits its accepted characters on the SAME
  // phase:"C" confirmedInventory union the punctuation step emits (see
  // survey/phaseCInventory.ts), so the two never clobber each other.
  {
    kind: "editor-step",
    id: "invisibles",
    ...stepDependencies("invisibles"),
    title: "Invisible characters",
    inputs: [],
    writes: [],
    component: InvisiblesStepHost,
    specRef: ["specs/075-punctuation-defaults"],
    evidence: { inputs: ["the invisible-character candidates offered"], keyFn: "invisibles" },
    // The invisibles-inventory decision (spec 090); no answer-store
    // residue — this step's answer writes were retired in full (T022).
    persistence: "decision-store",
  } satisfies Step,

  // --- Convenience characters (pre-carve keep question) ---
  // Runs immediately before carve: the gallery is about to propose removing
  // every base character the orthography does not use, so the "but I still
  // need A-Z for borrowed words, email addresses, and web addresses" answer
  // has to exist BEFORE the recommendations are computed. Like the marks
  // series' S0, the gate is computed INSIDE the step component: a base with no
  // surplus basic-Latin letters completes immediately (no render), so the
  // hop is invisible whenever there is nothing to ask. Emits the retained list
  // the carve gallery shields (session.retainedConvenienceChars).
  {
    kind: "editor-step",
    id: "convenience",
    ...stepDependencies("convenience"),
    title: "Convenience letters",
    inputs: [],
    writes: [],
    component: ConvenienceStepHost,
    specRef: "specs/051-carve-orthography-trim",
    evidence: {
      inputs: ["surplus basic-Latin candidates on the base", "whether the orthography signal is known"],
      keyFn: "convenience",
    },
    // The retained-convenience-chars decision (spec 090); the step-status
    // slot lives in the answer store, whose legacy booleans the adoption
    // shim still reads from older drafts (D-090-17, kept by D-090-29).
    persistence: "decision-store",
  } satisfies Step,

  // --- Carve (Phase D: remove unwanted base keys) ---
  carveStep,

  // --- Deadkeys (spec 083: deadkey lifecycle, beside carve) ---
  // The deadkeys surface is the trim track's deadkey companion (define
  // deadkeys for carve-retained keys, manage existing/imported ones); physical
  // mechanism assignment (Phase C) consumes deadkeys via the accented-char flow.
  deadkeysStep,

  // --- Rules (Phase E: before/after rule demo + rule list/builder) ---
  // The demo pane + rule builder show what the working copy's rules do,
  // including the deadkeys just defined, before the author assigns mechanisms.
  rulesStep,

  // --- Mechanisms (Phase C: physical key assignment) ---
  // The reducer fires lockDesktop() when this step completes (R1).
  {
    ...mechanismsStep,
    lock: "physical",
  } satisfies Step,

  // --- Touch seed source (gated side-trail fork, FR-013) ---
  // Lets the author choose the touch seed while no choice is recorded; both
  // branches converge on the same touch carve/add shell.
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
];

/**
 * The steps in derived order: the pool sorted by STEP_ORDER (which is derived
 * from each step's provides/requires, never listed by hand). A pool/table
 * mismatch is a hard error at module load.
 */
export const manifest: readonly Step[] = ((): readonly Step[] => {
  if (stepPool.length !== STEP_ORDER.length) {
    throw new Error(
      `[manifest] ${stepPool.length} steps declared but ${STEP_ORDER.length} in stepDependencies`,
    );
  }
  return STEP_ORDER.map((id) => {
  const found = stepPool.find((s) => s.id === id);
  if (found === undefined) {
    throw new Error(`[manifest] step "${id}" is declared in stepDependencies but has no step`);
  }
  return found;
  });
})();

/**
 * Gallery-hosted steps (spec 090 T005): step id → the gallery module that
 * settles the step's gallery decision. Derived, not listed: a step appears
 * here exactly when one of the decisions in its `provides` (the step's
 * `settles`, spread from stepDependencies) is provided by a registered
 * gallery module. Step wrappers and StepHost resolve their module through
 * this map and render it via the gallery host (steps/galleryHost.tsx);
 * per-step adapters retire per story (US1–US5), not here. A step settling
 * two gallery decisions would be ambiguous — the coverage test
 * (decisions/galleryModules.coverage.test.ts) pins one provider per
 * settles id, and no step settles more than one.
 */
export const galleryModuleByStep: ReadonlyMap<string, QuestionModule> = new Map(
  manifest.flatMap((step) => {
    const mod = galleryModules.find((m) =>
      (m.provides ?? []).some((id) => (step.provides ?? []).includes(id)),
    );
    return mod === undefined ? [] : [[step.id, mod] as const];
  }),
);

// ---------------------------------------------------------------------------
// validateManifestShape — throw-on-mismatch structural guard (M3, M5, layout).
//
// The ONE structural invariant check over the manifest. Called once at module
// load by StudioShell (a misshapen manifest is a hard error, not a logged
// warning — fail fast so CI catches it before any render occurs). Exported so
// the invariant is directly unit-testable (spec 034 T003 / SR-1, SR-2, SR-5)
// without importing the whole SPA shell; it depends only on `manifest`, so it
// stays boundary-clean here in steps/.
//
// The order itself is not asserted here: it is derived, and stepOrder.parity
// .test.ts pins the derivation against a frozen literal. What stays here are
// validations ON the derived order.
// ---------------------------------------------------------------------------

export function validateManifestShape(): void {
  const ids = manifest.map((s) => s.id);

  // The array is the derived order, and every derived side trail can rejoin.
  if (ids.length !== STEP_ORDER.length || ids.some((id, i) => id !== STEP_ORDER[i])) {
    throw new Error(`[manifest] manifest order is not the derived STEP_ORDER`);
  }
  for (const [id, trail] of STEP_TRAILS) {
    if (!trail.spine && trail.joinTarget === undefined) {
      throw new Error(`[manifest] gated step "${id}" has no ungated successor to rejoin at`);
    }
  }

  // M3 — exactly one lock:physical and one lock:touch, in that (derived) order.
  const locks = manifest.filter((s) => s.lock !== undefined).map((s) => s.lock);
  if (locks[0] !== "physical" || locks[1] !== "touch" || locks.length !== 2) {
    throw new Error(
      `[manifest] locks expected ["physical","touch"], got [${locks.join(",")}]`,
    );
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
  // EXACTLY {carve, deadkeys, rules, mechanisms, touch, touch_seed_source}
  // must declare layout:"full"; all others must be "pane" or omit layout. A
  // mismatched layout would silently change the chrome. touch_seed_source
  // joined this set in the P0 fix for the panel's inline live OSK preview
  // (spec 035 R4b follow-up) — without full-screen, StudioShell's persistent
  // right-pane OSKFrame co-mounted alongside the panel's own OSK.
  // deadkeys joined as a full-screen tabbed editor like carve (spec 083) —
  // its own Back/Continue nav renders inside.
  // rules joined in spec 082: the demo pane + rule builder need the full
  // width, same as the carve and mechanisms galleries it sits between.
  const FULL_LAYOUT_IDS = new Set(["carve", "deadkeys", "rules", "mechanisms", "touch", "touch_seed_source"]);
  for (const step of manifest) {
    if (step.layout === "full") {
      if (!FULL_LAYOUT_IDS.has(step.id)) {
        throw new Error(
          `[manifest] unexpected layout:"full" on step "${step.id}" — only carve/deadkeys/rules/mechanisms/touch/touch_seed_source may be full-screen (spec 024 Stage 0)`,
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
