// Inventory entries for the flowSteps step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).

import type { InventoryEntry } from "./types.ts";

const FLOW_WALK = "survey/flowWalk.ts";
const RUNNER = "survey/SurveyRunner.tsx";
const FLOW_DEPS = "editors/adapters/flowStepDeps.ts";
const FLOW_FACTORY = "editors/adapters/makeFlowStepComponent.tsx";
const OPTION_RECORDS = "editors/adapters/flowStepOptionRecords.ts";
const FLOW_OPTIONS = "editors/adapters/flowStepOptions.tsx";
const LAYOUT_HOST = "survey/layout/LayoutStepHost.tsx";

export const flowStepsInventory: readonly InventoryEntry[] = [
  // --- The runner's walk (lifted out of SurveyRunner): flowStep.ts ---
  { fn: "indexFlow", module: FLOW_WALK, callers: [RUNNER] },
  { fn: "seedProposal", module: FLOW_WALK, callers: [RUNNER] },
  { fn: "canAdvanceFrom", module: FLOW_WALK, callers: [RUNNER] },
  { fn: "advanceThrough", module: FLOW_WALK, callers: [RUNNER] },
  { fn: "buildSavedAnswers", module: FLOW_WALK, callers: [RUNNER] },
  { fn: "toSurveyAnswer", module: FLOW_WALK, callers: [RUNNER] },
  { fn: "assembleFlowResult", module: FLOW_WALK, callers: [RUNNER] },
  { fn: "publishSavedAnswers", module: FLOW_WALK, callers: [RUNNER] },
  // --- A YAML flow step's host (makeFlowStepComponent) ---
  { fn: "buildFlowStepDeps", module: FLOW_DEPS, callers: [FLOW_FACTORY] },
  { fn: "flowStepCompletion", module: FLOW_DEPS, callers: [FLOW_FACTORY] },
  { fn: "flowSources", module: "steps/flowSources.ts", callers: [FLOW_FACTORY] },
  { fn: "loadFlowSourceDef", module: "steps/flowSources.ts", callers: [FLOW_FACTORY] },
  // --- The per-flow options records the factory components are built from ---
  { fn: "trackOptions", module: OPTION_RECORDS, callers: [FLOW_OPTIONS] },
  { fn: "attributionOptions", module: OPTION_RECORDS, callers: [FLOW_OPTIONS] },
  { fn: "projectNameOptions", module: OPTION_RECORDS, callers: [FLOW_OPTIONS] },
  // --- Identity (IdentityLite and the name picker) ---
  { fn: "createIdentityResolution", module: "survey/identityResolution.ts", callers: ["survey/IdentityLite.tsx"] },
  { fn: "resolveTypedLanguage", module: "survey/resolveTypedLanguage.ts", callers: ["survey/QuestionField.tsx"] },
  { fn: "languageResultsFor", module: "survey/resolveTypedLanguage.ts", callers: ["survey/QuestionField.tsx"] },
  { fn: "loadLangtags", module: "lib/langtagsDefaults.ts", callers: ["survey/QuestionField.tsx"] },
  { fn: "deriveSurveyContext", module: "decisions/identitySelectors.ts", callers: ["editors/adapters/panelAdapters.tsx"] },
  // --- Windows layout ---
  { fn: "proposeWindowsLayout", module: "lib/windowsLayouts.ts", callers: [LAYOUT_HOST, "survey/layout/LayoutStep.tsx"] },
  { fn: "buildGalleryHostDeps", module: "lib/galleryHostDeps.ts", callers: [LAYOUT_HOST] },
  { fn: "confirmWindowsLayout", module: "survey/layout/confirmWindowsLayout.ts", callers: [LAYOUT_HOST] },
  // --- Starting keyboard ---
  { fn: "confirmStartKeyboard", module: "survey/chooseStart/confirmStartKeyboard.ts", callers: ["survey/chooseStart/StartKeyboardRenderer.tsx"] },
  { fn: "default", module: "survey/questions/gallery/baseKeyboard.ts", callers: ["editors/adapters/panelAdapters.tsx"] },
  // The setup decision's instantiation (StudioShell's doCommit): the choose_base
  // completion with the previewed keyboard, once the base and the track are both
  // decided; the start keyboard is the catalog record the browser lists.
  { fn: "applyStepCompletion", module: "steps/reducer.ts", callers: ["StudioShell.tsx", "lib/completeStep.ts"] },
  { fn: "selectTrack", module: "stores/decisionStore.ts", callers: ["StudioShell.tsx", "lib/completeStep.ts"] },
  { fn: "readCatalogEntry", module: "../vite-plugins/keyboardCatalog.ts", callers: ["../vite-plugins/localKeyboards.ts"] },
  // The live extraction pass StudioShell runs after the instantiation (and the
  // runner re-runs at question-push time).
  { fn: "runLiveExtractionFromStores", module: "decisions/liveExtraction.ts", callers: ["StudioShell.tsx", FLOW_WALK] },
];
