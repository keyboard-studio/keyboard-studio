// The FR-010 product-function inventory (spec 107 research R2), read by both
// driftGuard.test.ts (FR-011) and boundary.test.ts (FR-014).
//
// Each entry names a product function the author calls, the module that
// defines it, and the production caller(s) -- the component, hook or store
// the UI calls it from. The inventory is two-sided: an entry must be imported
// by its production caller(s) AND by at least one headlessAuthor/ file, so a
// proposal pasted into the author in place of its import fails even when the
// copy is verbatim.
//
// Paths are relative to packages/studio/src (studio modules) or are a package
// specifier (`@keyboard-studio/engine`, `@keyboard-studio/contracts`).

import { flowStepsInventory } from "./inventory/flowSteps.ts";
import { inventoryStepsInventory } from "./inventory/inventorySteps.ts";
import { marksInventory } from "./inventory/marks.ts";
import { carveInventory } from "./inventory/carve.ts";
import { mechanismInventory } from "./inventory/mechanism.ts";
import { phaseFInventory } from "./inventory/phaseF.ts";
import { touchSeedInventory } from "./inventory/touchSeed.ts";

export type { InventoryEntry } from "./inventory/types.ts";
import type { InventoryEntry } from "./inventory/types.ts";

/**
 * The step drivers' product functions (inventory/*.ts): proposals, rankings and
 * the lifted handler functions. Only stepDrivers/ may import these
 * (driftGuard.test.ts); the rest of the author is case input, the loop and
 * reporting.
 */
export const PROPOSAL_INVENTORY: readonly InventoryEntry[] = [
  ...flowStepsInventory,
  ...inventoryStepsInventory,
  ...marksInventory,
  ...carveInventory,
  ...mechanismInventory,
  ...phaseFInventory,
  ...touchSeedInventory,
];

export const INVENTORY: readonly InventoryEntry[] = [
  {
    // The three-group routing's CJK/Ethiopic stub test (eligibility.ts).
    fn: "isExcludedScript",
    module: "lib/excludedScriptFamilies.ts",
    callers: ["components/OSKFrame.tsx", "survey/rules/RulesStep.tsx"],
  },
  {
    // The product's .kps reader, the source of a keyboard's script (eligibility.ts).
    fn: "parseKps",
    module: "@keyboard-studio/engine",
    callers: ["criteria/assembleLintContext.ts"],
  },
  // --- The step loop: the completion path and reducer deps the UI runs ---
  { fn: "completeStep", module: "lib/completeStep.ts", callers: ["components/StepHost.tsx"] },
  { fn: "createStudioReducerDeps", module: "lib/studioReducerDeps.ts", callers: ["StudioShell.tsx"] },
  { fn: "completeOskStep", module: "lib/oskStepCompletion.ts", callers: ["editors/adapters/oskAdapter.tsx"] },
  { fn: "completeFallbackPolicyStep", module: "lib/fallbackPolicyStepCompletion.ts", callers: ["editors/adapters/fallbackPolicyAdapter.tsx"] },
  { fn: "oskContinueResult", module: "@keyboard-studio/engine", callers: ["editors/assignLoop/OskEditor.tsx"] },
  { fn: "generateKvksFromIR", module: "@keyboard-studio/engine", callers: ["editors/assignLoop/OskEditor.tsx"] },
  { fn: "createStudioRecordDecision", module: "lib/studioReducerDeps.ts", callers: ["StudioShell.tsx"] },
  { fn: "createStudioSnapshotter", module: "lib/studioReducerDeps.ts", callers: ["StudioShell.tsx"] },
  { fn: "clearTouchSeedChoice", module: "lib/studioReducerDeps.ts", callers: ["StudioShell.tsx"] },
  { fn: "manifest", module: "steps/manifest.ts", callers: ["StudioShell.tsx"] },
  { fn: "bindManifest", module: "stores/workingCopyStore.ts", callers: ["StudioShell.tsx"] },
  { fn: "useWorkingCopyStore", module: "stores/workingCopyStore.ts", callers: ["StudioShell.tsx", "components/StepHost.tsx"] },
  { fn: "useSurveySessionStore", module: "stores/surveySessionStore.ts", callers: ["StudioShell.tsx", "components/StepHost.tsx"] },
  {
    // The decision log the trial driver reads for the test build's cursor
    // (spec 113) — a store hook like the two above, so it lives in the main
    // inventory, not the step-proposal inventory: the per-case reset file
    // imports it too (FR-011's "only stepDrivers import proposals" rule).
    fn: "useDecisionLogStore",
    module: "decisions/decisionLogStore.ts",
    callers: ["components/OutputSectionList.tsx"],
  },
  {
    // The testing store the Trial step driver records a test build into
    // (spec 113) — a store hook, so it lives in the main inventory, not the
    // step-proposal inventory: the per-case reset file imports it too
    // (FR-011's "only stepDrivers import proposals" rule).
    fn: "useTestingStore",
    module: "stores/testingStore.ts",
    callers: ["hooks/usePreviewArtifact.ts"],
  },
  { fn: "getDecisionSnapshot", module: "stores/decisionStore.ts", callers: ["StudioShell.tsx", "lib/completeStep.ts"] },
  {
    // The start screen's act of recording the track (New = copy, Open =
    // adapt), now the track question is gone — the headless author records
    // the case's track the same way before its first step (FR-040).
    fn: "recordAuthoringTrack",
    module: "lib/recordAuthoringTrack.ts",
    callers: ["components/StartScreen.tsx", "components/OpenKeyboardEntry.tsx"],
  },
  { fn: "useSurveyAnswerStore", module: "stores/surveyAnswerStore.ts", callers: ["survey/CharactersStep.tsx", "survey/punctuation/PunctuationStep.tsx"] },
  {
    // The Phase F hard gate StepHost reads through useInventoryCoverageGate.
    fn: "deriveInventoryCoverageGate",
    module: "lib/inventoryDiff.ts",
    callers: [],
    provenBy: "lib/inventoryDiff.test.ts",
  },
  // --- The decision record (053), as the zip and draft paths read it ---
  { fn: "snapshotDecisionRecord", module: "decisions/decisionLogStore.ts", callers: ["lib/serializeWorkingCopy.ts", "lib/draftPersistence.ts"] },
  { fn: "parseDecisionRecord", module: "@keyboard-studio/engine", callers: ["lib/draftPersistence.ts"] },
  // --- Parity normalisation (parity.ts, research R8) ---
  { fn: "effectiveEntries", module: "@keyboard-studio/contracts", callers: ["decisions/progressDots.ts"] },
  { fn: "suggestionFingerprintOf", module: "survey/carve/carveValue.ts", callers: ["editors/carve/CarveGalleryV2.tsx"] },
  ...PROPOSAL_INVENTORY,
];

/**
 * Spec 106 replay modules in src/test/ the author may import without an
 * inventory entry (FR-014): they are the replay, not product proposals.
 */
export const REPLAY_MODULES: readonly string[] = [
  "test/decisionPointFixture.ts",
  "test/consistencyGates.ts",
  "test/decisionPointBases.ts",
  "test/recordToDecisionSet.ts",
  "test/sc004Harness.ts",
  "test/decisionPointKnownGaps.fixture.ts",
];

/**
 * The single direct store write the author may make: the per-case reset
 * (contract guarantee 4), allow-listed by file and function name.
 */
export const STORE_RESET_ALLOW: { file: string; fn: string } = {
  file: "test/headlessAuthor/resetStores.ts",
  fn: "resetAuthorStores",
};
