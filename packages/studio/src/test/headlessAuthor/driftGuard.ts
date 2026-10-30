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

export interface InventoryEntry {
  /** The exported function's name. */
  fn: string;
  /** Defining module: a studio src-relative path, or a package specifier. */
  module: string;
  /** Production files (studio src-relative) that import `fn`; at least one unless `provenBy` is set. */
  callers: readonly string[];
  /**
   * For a composite no production file calls by name (a hook memoizes its
   * pieces separately): the studio src-relative test that imports `fn` and
   * proves it equal to the hook the UI calls. Only with an empty `callers`.
   */
  provenBy?: string;
}

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
  { fn: "createStudioRecordDecision", module: "lib/studioReducerDeps.ts", callers: ["StudioShell.tsx"] },
  { fn: "createStudioSnapshotter", module: "lib/studioReducerDeps.ts", callers: ["StudioShell.tsx"] },
  { fn: "clearTouchSeedChoice", module: "lib/studioReducerDeps.ts", callers: ["StudioShell.tsx"] },
  { fn: "manifest", module: "steps/manifest.ts", callers: ["StudioShell.tsx"] },
  { fn: "bindManifest", module: "stores/workingCopyStore.ts", callers: ["StudioShell.tsx"] },
  { fn: "useWorkingCopyStore", module: "stores/workingCopyStore.ts", callers: ["StudioShell.tsx", "components/StepHost.tsx"] },
  { fn: "useSurveySessionStore", module: "stores/surveySessionStore.ts", callers: ["StudioShell.tsx", "components/StepHost.tsx"] },
  { fn: "getDecisionSnapshot", module: "stores/decisionStore.ts", callers: ["StudioShell.tsx", "lib/completeStep.ts"] },
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
  "test/decisionPointKnownGaps.ts",
];

/**
 * The single direct store write the author may make: the per-case reset
 * (contract guarantee 4), allow-listed by file and function name.
 */
export const STORE_RESET_ALLOW: { file: string; fn: string } = {
  file: "test/headlessAuthor/resetStores.ts",
  fn: "resetAuthorStores",
};
