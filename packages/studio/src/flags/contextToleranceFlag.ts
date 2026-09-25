// contextToleranceFlag — gates author exposure of the context-tolerance
// analysis (spec 078, FR-011).
//
// The finding, the marks-series station and the apply effect all stay dark
// until the corpus harness gate (FR-012) is green. Same convention as
// mutateFlag.ts: one build/deploy-time `import.meta.env` read through the
// shared `readEnvFlag` helper, OFF unless `VITE_KM_CONTEXT_TOLERANCE` is
// exactly "1". Not a live in-session toggle.

import { readEnvFlag } from "../lib/envFlag.ts";

/** Whether the context-tolerance finding and fix are shown to the author. */
export function isContextToleranceEnabled(): boolean {
  return readEnvFlag("VITE_KM_CONTEXT_TOLERANCE");
}
