// registerEditorSteps — adapt P4a editor adapters into EditorStep descriptors.
//
// T023 (P4b foundation). Each gallery and wizard panel adapter from
// editors/adapters/ becomes an EditorStep with a declared id, title,
// inputs, and writes. The manifest (manifest.ts) sources the actual
// ordered Steps from this list.
//
// Boundary: steps/ -> editors/ is allowed by the steps-layer depcruise rule.
// steps/ -> stores/ and steps/ -> lib/ are forbidden — this file imports neither.
//
// inputs/writes: galleries and panels are rich-editor surfaces that drive
// the working copy directly (carve deletions, mechanism assignments, touch
// assignments). The IRPath declarations here are the authoritative static
// declarations for the completeness graph; the actual writes happen in the
// store at runtime.
//
// Pool ↔ manifest reconciliation:
//   - scaffoldStep was declared here but never placed in the manifest. The
//     copy-track scaffold parameters (keyboardId, displayName) are collected
//     by ProjectNameStepAdapter and passed through its onComplete result — they
//     do not need a separate scaffold step. scaffoldStep is removed from this
//     pool so the pool matches the manifest exactly.

import { irPath } from "@keyboard-studio/contracts";
import type { EditorStep } from "./types.ts";
import { CARVE_WRITES, ADD_GALLERY_WRITES, TOUCH_WRITES } from "./editorMutate.ts";
import { CarveAdapter } from "../editors/adapters/carveAdapter.tsx";
import { AddPhysicalAdapter } from "../editors/adapters/addPhysicalAdapter.tsx";
import { AddTouchAdapter } from "../editors/adapters/addTouchAdapter.tsx";
import {
  TrackStepAdapter,
  ProjectNameStepAdapter,
  TrackOneIdentityPanelAdapter,
  BaseResolutionAdapter,
} from "../editors/adapters/panelAdapters.tsx";

// ---------------------------------------------------------------------------
// Panel steps (wizard panels — non-gallery)
// ---------------------------------------------------------------------------

/**
 * Identity step: the TrackOneIdentityPanel (continuous identity editor).
 * No back affordance — entry-point panel.
 */
export const identityStep: EditorStep = {
  kind: "editor-step",
  id: "identity",
  title: "Keyboard Identity",
  spine: true,
  component: TrackOneIdentityPanelAdapter,
  inputs: [],
  writes: [],
};

/**
 * Choose-base step: BaseResolution (keyboard base picker ONLY).
 * Track selection is a separate manifest step (trackStep).
 */
export const chooseBaseStep: EditorStep = {
  kind: "editor-step",
  id: "choose_base",
  title: "Choose Base Keyboard",
  spine: true,
  component: BaseResolutionAdapter,
  inputs: [],
  writes: [],
};

/**
 * Track step: TrackStep (copy vs adapt choice).
 * Spine:true — every author chooses a track.
 */
export const trackStep: EditorStep = {
  kind: "editor-step",
  id: "track",
  title: "Authoring Track",
  spine: true,
  component: TrackStepAdapter,
  // track reads the session-derived header.bcp47 (array) + the resolved base
  // display name (header.name) to frame the copy-vs-adapt choice.
  inputs: [irPath("header", "bcp47"), irPath("header", "name")],
  // DEC-D2 (Matt 2026-06-29): branch selection only (copy vs adapt) — no IR leaf
  // in Phase 1, so writes is []. Empty writes orphans no input and never reds C5.
  writes: [],
};

/**
 * Project name step: ProjectNameStep (copy-track only).
 * Declared spine:true here (the pool default); the manifest overrides it to
 * spine:false with joinTarget:"characters" to model the CYOA copy-only fork.
 * ProjectNameStepAdapter collects both displayName and keyboardId (the scaffold
 * params) — no separate scaffold step is needed.
 */
export const projectNameStep: EditorStep = {
  kind: "editor-step",
  id: "project_name",
  title: "Project Name",
  spine: true,
  component: ProjectNameStepAdapter,
  // project_name (copy-track fork) reads the session-derived header.bcp47 to
  // pre-fill, and collects the scaffold params displayName + keyboardId —
  // expressible as the existing header.name / header.keyboardId IR leaves.
  // NB: irPath('header','script') is intentionally NOT declared (it does not
  // exist in KeyboardIR — FR-004).
  inputs: [irPath("header", "bcp47")],
  writes: [irPath("header", "name"), irPath("header", "keyboardId")],
};

// ---------------------------------------------------------------------------
// Gallery steps (carve + add galleries)
// ---------------------------------------------------------------------------

/**
 * Carve step: CarveGallery (remove-mode, distinct from add galleries).
 */
export const carveStep: EditorStep = {
  kind: "editor-step",
  id: "carve",
  title: "Carve Keys",
  spine: true,
  component: CarveAdapter,
  // Carve's deletion overlay reads and rewrites the same groups[]/stores[]/raw[]
  // arrays (the surviving carve surface) — a self-read, not an upstream-producer
  // dependency. Declaring those coarse paths as manifest-graph INPUTS would form a
  // carve<->mechanisms<->touch C2 data cycle (all three read+write groups/stores
  // at array granularity), so inputs stays [] in P1: the base layout has no
  // distinct manifest producer to depend on, and C5 needs no producer for a path a
  // step also writes. The load-bearing FR-002 contract is the `writes` set below.
  inputs: [],
  // CARVE_WRITES (editorMutate.ts:42-46): groups[] / stores[] / raw[].
  writes: [...CARVE_WRITES],
};

/**
 * Mechanisms step: MechanismGallery (physical key assignment — Phase C).
 * The reducer fires lockDesktop() when this step completes.
 */
export const mechanismsStep: EditorStep = {
  kind: "editor-step",
  id: "mechanisms",
  title: "Assign Mechanisms",
  spine: true,
  component: AddPhysicalAdapter,
  surface: "physical",
  // Mechanisms assigns onto the base layout groups[]/stores[] it also writes — a
  // self-read. As with carve, declaring those coarse paths as inputs would form a
  // C2 data cycle, so inputs stays [] in P1; the FR-002 contract is the `writes`
  // set (ADD_GALLERY_WRITES, editorMutate.ts:203-206): groups[] / stores[].
  inputs: [],
  writes: [...ADD_GALLERY_WRITES],
};

/**
 * Touch seed source step: off-spine fork that lets the author choose how
 * the touch surface is seeded. Rejoins the spine at the touch carve+add step.
 * spine: false (FR-013, M4).
 */
export const touchSeedSourceStep: EditorStep = {
  kind: "editor-step",
  id: "touch_seed_source",
  title: "Touch Seed Source",
  spine: false,
  joinTarget: "touch",
  component: AddTouchAdapter,
  surface: "touch",
  inputs: [],
  writes: [],
};

/**
 * Touch step: TouchGallery (touch key assignment — Phase E).
 * The reducer fires the buildTouchLayoutJson block when this step completes.
 */
export const touchStep: EditorStep = {
  kind: "editor-step",
  id: "touch",
  title: "Touch Layout",
  spine: true,
  component: AddTouchAdapter,
  surface: "touch",
  // Touch seeds from the locked physical layout (groups[]/stores[]) that
  // carve/mechanisms produce; declaring those as inputs would form a C2 data
  // cycle with carve/mechanisms (which read+write the same arrays), so inputs
  // stays [] in P1. The FR-002 contract is the `writes` set below.
  inputs: [],
  // TOUCH_WRITES (editorMutate.ts:172): touchLayout.platforms[].layers[].rows[].keys[]
  // (+ touchLayout.nodeIds[]).
  writes: [...TOUCH_WRITES],
};

// ---------------------------------------------------------------------------
// Help step (Phase F — questions phase, but represented here as an editor step
// placeholder until the question-step version is wired from the registry).
// ---------------------------------------------------------------------------

/**
 * Help step: placeholder for the Help/Phase F question phase.
 * In P4b this is a spine-only descriptor; the actual content resolves
 * through the PhaseF survey runner in SurveyView (T028).
 */
export const helpStep: EditorStep = {
  kind: "editor-step",
  id: "help",
  title: "Help & Tips",
  spine: true,
  component: TrackOneIdentityPanelAdapter, // placeholder — wired in T028
  inputs: [],
  writes: [],
};

/**
 * Package step: reserved / out-of-scope for v1. Present as a spine placeholder
 * so the manifest spine is complete and the dashboard shows it as a future step.
 * The component is a stub that never advances (FR-012 "reserved").
 */
export const packageStep: EditorStep = {
  kind: "editor-step",
  id: "package",
  title: "Package (reserved)",
  spine: true,
  component: TrackOneIdentityPanelAdapter, // stub — out of scope for v1
  inputs: [],
  writes: [],
};

// ---------------------------------------------------------------------------
// Exported list (unordered pool — the manifest imposes the spine order)
//
// Pool ↔ manifest: every step here is referenced by the manifest, and every
// manifest step (by id) has an entry here. scaffoldStep was removed because
// scaffold params are collected by projectNameStep's adapter — no separate step.
// ---------------------------------------------------------------------------

/**
 * All editor steps as an unordered pool. The manifest picks entries by id
 * and assembles them into the spine order. This list is the canonical source
 * of editor-step descriptors.
 */
export const registeredEditorSteps: readonly EditorStep[] = [
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
];
