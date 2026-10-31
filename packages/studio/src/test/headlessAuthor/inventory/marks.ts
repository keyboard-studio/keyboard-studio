// Inventory entries for the marks step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).

import type { InventoryEntry } from "./types.ts";

const SERIES_VALUE = "survey/marks/marksSeriesValue.ts";
const MARKS_VALUE = "survey/marks/marksValue.ts";
const PROPOSAL = "survey/marks/contextToleranceProposal.ts";
const SERIES_STEP = "survey/marks/MarksSeriesStep.tsx";

export const marksInventory: readonly InventoryEntry[] = [
  {
    // The whole default walk as one call: the step calls the same pieces one at a
    // time as the author reaches each station, so no production file names the
    // composite. The test renders the step and runs the driver on the same state.
    fn: "marksStationDefaults",
    module: SERIES_VALUE,
    callers: [],
    provenBy: "test/headlessAuthor/stepDrivers/marksParity.test.tsx",
  },
  { fn: "computeMarksGate", module: SERIES_VALUE, callers: [SERIES_STEP] },
  { fn: "assembleMarksSeries", module: SERIES_VALUE, callers: [SERIES_STEP] },
  { fn: "seriesResult", module: SERIES_VALUE, callers: [SERIES_STEP] },
  { fn: "startOfLineImportSeeded", module: SERIES_VALUE, callers: [SERIES_STEP] },
  { fn: "startOfLineSeed", module: SERIES_VALUE, callers: [SERIES_STEP] },
  { fn: "resolveToleranceDecision", module: SERIES_VALUE, callers: [SERIES_STEP] },
  { fn: "EMPTY_MARKS_VALUE", module: MARKS_VALUE, callers: [SERIES_STEP] },
  { fn: "getMarksTreatmentValue", module: MARKS_VALUE, callers: ["lib/contextToleranceCommit.ts"] },
  { fn: "recordMarksTreatmentValue", module: MARKS_VALUE, callers: ["lib/contextToleranceCommit.ts"] },
  { fn: "mirrorMarksCompletionToSession", module: "survey/marks/marksSessionMirror.ts", callers: ["survey/marks/MarksStepHost.tsx"] },
  { fn: "deriveSurveyContext", module: "decisions/identitySelectors.ts", callers: [SERIES_STEP] },
  // --- context tolerance ---
  { fn: "toleranceProposalFor", module: PROPOSAL, callers: [SERIES_STEP] },
  { fn: "toleranceStationShown", module: PROPOSAL, callers: [SERIES_STEP] },
  { fn: "decisionFromProposal", module: PROPOSAL, callers: ["survey/marks/ContextToleranceStation.tsx"] },
  { fn: "runContextToleranceAnalysis", module: "lib/contextToleranceRun.ts", callers: ["hooks/useKeyboardArtifact.ts"] },
  { fn: "applyToleranceDecision", module: "lib/contextToleranceCommit.ts", callers: ["hooks/useContextToleranceApply.ts"] },
  // The projected .kmn the analysis reads (the replay's installToleranceOverlay reads it the same way).
  { fn: "projectWorkingCopyForOutput", module: "lib/serializeWorkingCopy.ts", callers: ["components/ManagedPRSubmitPanel.tsx"] },
  { fn: "readVfsText", module: "lib/vfsText.ts", callers: ["components/KmnEditor.tsx"] },
  { fn: "parseKmn", module: "@keyboard-studio/engine", callers: ["lib/deadkeyOps.ts"] },
];
