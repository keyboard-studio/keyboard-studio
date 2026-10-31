// Inventory entries for the phaseF step drivers (spec 107 FR-010); combined into
// INVENTORY by ../driftGuard.ts. Each entry needs a production caller that
// value-imports it and an author file that does too (boundary.test.ts rule d).

import type { InventoryEntry } from "./types.ts";

export const phaseFInventory: readonly InventoryEntry[] = [
  // The Phase F flow's options record (PhaseFGate's factory component is built from it).
  { fn: "phaseFOptions", module: "editors/adapters/flowStepOptionRecords.ts", callers: ["editors/adapters/flowStepOptions.tsx"] },
  // The per-question findings projection the component hands the flow.
  { fn: "buildFindingsByQuestionId", module: "lint/lintToQuestion.ts", callers: ["hooks/useValidatorFindings.ts"] },
];
