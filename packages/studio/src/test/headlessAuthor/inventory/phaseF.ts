// Inventory entries for the phaseF step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).

import type { InventoryEntry } from "./types.ts";

export const phaseFInventory: readonly InventoryEntry[] = [
  // The Phase F flow's options record (PhaseFGate's factory component is built from it).
  { fn: "phaseFOptions", module: "editors/adapters/flowStepOptionRecords.ts", callers: ["editors/adapters/flowStepOptions.tsx"] },
  // The per-question findings projection the component hands the flow.
  { fn: "buildFindingsByQuestionId", module: "lint/lintToQuestion.ts", callers: ["hooks/useValidatorFindings.ts"] },
  // The live phase_f_helpdocs walk's question ids, derived from flowModules
  // in flowModules.ts and published through the question registry — the help
  // driver scopes its findings projection to exactly these (#2469).
  { fn: "PHASE_F_HELPDOCS_QUESTION_IDS", module: "survey/questions/flowModules.ts", callers: ["survey/questions/registry.ts"] },
  // The icon codec the IconEditor's load + Continue path calls, lifted by the icon step driver.
  // (decodeIco / resample are lifted too: the driver mirrors the UI's Keep
  // path, which decodes the source .ico and resamples it to 48px.)
  { fn: "decodeIco", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "resample", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "encodeIco", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "icoToBase64", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "createBlankIcon", module: "editors/assignLoop/iconTools.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "ICON_SIZE", module: "editors/assignLoop/iconTools.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  // The trial driver's "Make test build" press (spec 113): the same
  // DOM-free pieces the TestBuildPanel's handler calls through
  // usePreviewArtifact — build the numbered .kmp, fingerprint the working
  // copy, record the build. ReformatConsentRequiredError is the guard's
  // signal: the driver retries consented, as the dialog's Agree does.
  { fn: "buildTestBuildKmp", module: "lib/buildOutputBundle.ts", callers: ["hooks/usePreviewArtifact.ts"] },
  { fn: "computeWorkingCopyFingerprint", module: "lib/workingCopyFingerprint.ts", callers: ["hooks/usePreviewArtifact.ts"] },
  { fn: "resolveTestBuildVersion", module: "@keyboard-studio/engine", callers: ["hooks/usePreviewArtifact.ts"] },
  { fn: "changedSectionsSince", module: "stores/testingStore.ts", callers: ["hooks/usePreviewArtifact.ts"] },
  { fn: "ReformatConsentRequiredError", module: "lib/reformatConsentError.ts", callers: ["hooks/useReformatConsent.ts"] },
];