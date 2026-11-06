// Inventory entries for the phaseF step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).

import type { InventoryEntry } from "./types.ts";

export const phaseFInventory: readonly InventoryEntry[] = [
  // The Phase F flow's options record (PhaseFGate's factory component is built from it).
  { fn: "phaseFOptions", module: "editors/adapters/flowStepOptionRecords.ts", callers: ["editors/adapters/flowStepOptions.tsx"] },
  // The per-question findings projection the component hands the flow.
  { fn: "buildFindingsByQuestionId", module: "lint/lintToQuestion.ts", callers: ["hooks/useValidatorFindings.ts"] },
  // The icon codec the IconEditor's Continue path calls, lifted by the icon step driver.
  // (decodeIco / resample are lifted too: the driver mirrors the UI's Keep
  // path, which decodes the source .ico and resamples it to 48px.)
  { fn: "decodeIco", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "resample", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "encodeIco", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "icoToBase64", module: "editors/assignLoop/icoCodec.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "createBlankIcon", module: "editors/assignLoop/iconTools.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
  { fn: "ICON_SIZE", module: "editors/assignLoop/iconTools.ts", callers: ["editors/assignLoop/IconEditor.tsx"] },
];
