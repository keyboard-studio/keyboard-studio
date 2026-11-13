// layout-ops barrel export — spec 117 (Layout tab), Phase 2.
//
// Pure IR-to-IR edit operations recorded as `kmn-edits` decision entries, and
// their replay (contracts/layout-ops.md).

export { applyLayoutOp } from "./applyLayoutOp.js";
export type { ApplyLayoutOpResult } from "./applyLayoutOp.js";
export { replayKmnEdits, normaliseKmnEdits } from "./replayKmnEdits.js";
export type { ReplayResult, ReplayScope } from "./replayKmnEdits.js";
export { supersededChangeIndexes } from "./supersede.js";
export { clearKeyLive } from "./clearKeyLive.js";
export { invertEffect } from "./invertEffect.js";
export { sameRuleIdentity } from "./ruleMatch.js";
export type { KmnEditEffect, ReplayMiss } from "./types.js";
