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
//     by ProjectNameStepFactoryComponent and passed through its onComplete result —
//     no separate scaffold step needed. scaffoldStep removed from the pool.

import { irPath } from "@keyboard-studio/contracts";
import type { EditorStep } from "./types.ts";
import { CARVE_WRITES, ADD_GALLERY_WRITES, TOUCH_WRITES } from "./editorMutate.ts";
import { CarveAdapter } from "../editors/adapters/carveAdapter.tsx";
import { AddPhysicalAdapter } from "../editors/adapters/addPhysicalAdapter.tsx";
import { AddTouchAdapter } from "../editors/adapters/addTouchAdapter.tsx";
import { TouchSeedSourcePanel } from "../editors/touchSeedSource/TouchSeedSourcePanel.tsx";
import { SequencesAdapter } from "../editors/adapters/sequencesAdapter.tsx";
import {
  BaseResolutionAdapter,
  IdentityLiteAdapter,
} from "../editors/adapters/panelAdapters.tsx";
import {
  TrackStepFactoryComponent,
  ProjectNameStepFactoryComponent,
  PhaseFStepFactoryComponent,
} from "../editors/adapters/flowStepOptions.tsx";

// ---------------------------------------------------------------------------
// Helper for common step structure
// ---------------------------------------------------------------------------

/** Creates an EditorStep with common defaults, reducing boilerplate. */
function step(
  base: Pick<EditorStep, "id" | "title" | "component"> &
    Partial<Omit<EditorStep, "kind" | "id" | "title" | "component">>,
): EditorStep {
  return {
    kind: "editor-step",
    spine: true,
    inputs: [],
    writes: [],
    ...base,
  };
}

// ---------------------------------------------------------------------------
// Panel steps (wizard panels — non-gallery)
// ---------------------------------------------------------------------------

/**
 * Identity step: IdentityLiteAdapter (continuous identity editor).
 * No back affordance — entry-point panel.
 * T011 (spec 028 Stage 5): real IdentityLiteAdapter replaces the
 * TrackOneIdentityPanelAdapter placeholder.
 */
export const identityStep: EditorStep = step({
  id: "identity",
  title: "Keyboard Identity",
  component: IdentityLiteAdapter,
  flowRefs: ["identity_lite"],
});

/**
 * Choose-base step: BaseResolution (keyboard base picker ONLY).
 * Track selection is a separate manifest step (trackStep).
 */
export const chooseBaseStep: EditorStep = step({
  id: "choose_base",
  title: "Choose Base Keyboard",
  component: BaseResolutionAdapter,
});

/**
 * Track step: TrackStep (copy vs adapt choice).
 * Every author chooses a track.
 * Reads session-derived header.bcp47 + resolved base display name (header.name).
 * DEC-D2: branch selection only — no IR leaf in Phase 1, so writes is [].
 */
export const trackStep: EditorStep = step({
  id: "track",
  title: "Authoring Track",
  component: TrackStepFactoryComponent,
  inputs: [irPath("header", "bcp47"), irPath("header", "name")],
  flowRefs: ["track"],
});

/**
 * Project name step: ProjectNameStep (copy-track only).
 * Declared spine:true here; manifest overrides to spine:false with
 * joinTarget:"characters" for the CYOA copy-only fork.
 * Collects scaffold params displayName + keyboardId — no separate scaffold step.
 * FR-004: header.script is intentionally NOT declared (does not exist in KeyboardIR).
 */
export const projectNameStep: EditorStep = step({
  id: "project_name",
  title: "Project Name",
  component: ProjectNameStepFactoryComponent,
  inputs: [irPath("header", "bcp47")],
  writes: [irPath("header", "name"), irPath("header", "keyboardId")],
  flowRefs: ["project_name"],
});

// ---------------------------------------------------------------------------
// Gallery steps (carve + add galleries)
// ---------------------------------------------------------------------------

/**
 * Carve step: CarveGallery (remove-mode, distinct from add galleries).
 * Self-read: reads and rewrites groups[]/stores[]/raw[] without upstream producer.
 * inputs stays [] to avoid C2 data cycle with mechanisms/touch (FR-002).
 * CARVE_WRITES: groups[] / stores[] / raw[] (editorMutate.ts).
 */
export const carveStep: EditorStep = step({
  id: "carve",
  title: "Carve Keys",
  layout: "full",
  component: CarveAdapter,
  writes: [...CARVE_WRITES],
});

/**
 * Mechanisms step: MechanismGallery (physical key assignment — Phase C).
 * The reducer fires lockDesktop() when this step completes.
 * Self-read: assigns onto groups[]/stores[] without upstream producer.
 * inputs stays [] to avoid C2 data cycle (FR-002).
 * ADD_GALLERY_WRITES: groups[] / stores[] (editorMutate.ts).
 */
export const mechanismsStep: EditorStep = step({
  id: "mechanisms",
  title: "Assign Mechanisms",
  layout: "full",
  component: AddPhysicalAdapter,
  surface: "physical",
  writes: [...ADD_GALLERY_WRITES],
});

/**
 * Sequences step: placeholder for the upcoming Sequence Gallery (S-03
 * multi-key sequences), positioned after Mechanisms and before the touch
 * fork. Not yet implemented — the component is a stub that renders a
 * "coming soon" panel and advances without writing anything. Carries no
 * lock (only "physical" and "touch" locks exist, M3).
 * inputs stays [] (step() default): the placeholder writes nothing and has
 * no upstream dependency, so it carries no completeness-graph edges.
 */
export const sequencesStep: EditorStep = step({
  id: "sequences",
  title: "Sequences",
  layout: "full",
  component: SequencesAdapter,
});

/**
 * Touch seed source step: off-spine fork for choosing touch surface seed.
 * Rejoins the spine at the touch carve+add step (FR-013, M4).
 * Renders TouchSeedSourcePanel (T014, spec 035 contracts/seed-source-fork.md) —
 * a bespoke chooser panel, NOT the surface-parameterized carve/add shell, so
 * `surface` is omitted (that field only describes the AddPhysicalAdapter /
 * AddTouchAdapter shell pattern the touch step below still uses).
 */
export const touchSeedSourceStep: EditorStep = step({
  id: "touch_seed_source",
  title: "Touch Seed Source",
  spine: false,
  joinTarget: "touch",
  component: TouchSeedSourcePanel,
});

/**
 * Touch step: TouchGallery (touch key assignment — Phase E).
 * The reducer fires buildTouchLayoutJson when this step completes.
 * Seeds from locked physical layout; inputs stays [] to avoid C2 cycle (FR-002).
 * TOUCH_WRITES: touchLayout...keys[] + touchLayout.nodeIds[] (editorMutate.ts).
 */
export const touchStep: EditorStep = step({
  id: "touch",
  title: "Touch Layout",
  layout: "full",
  component: AddTouchAdapter,
  surface: "touch",
  writes: [...TOUCH_WRITES],
});

// ---------------------------------------------------------------------------
// Help step (Phase F)
// ---------------------------------------------------------------------------

/**
 * Help step: Phase F question phase (Help & Tips).
 * Spine descriptor; content resolves through PhaseF survey runner (T028).
 * spec 029: PhaseFStepFactoryComponent matches mounted component (SC-005).
 */
export const helpStep: EditorStep = step({
  id: "help",
  title: "Help & Tips",
  component: PhaseFStepFactoryComponent,
  flowRefs: ["phase_f_helpdocs"],
});

/**
 * Package step: reserved / out-of-scope for v1.
 * Spine placeholder for completeness; stub component never advances (FR-012).
 */
export const packageStep: EditorStep = step({
  id: "package",
  title: "Package (reserved)",
  component: PhaseFStepFactoryComponent,
});

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
  sequencesStep,
  touchSeedSourceStep,
  touchStep,
  helpStep,
  packageStep,
];
