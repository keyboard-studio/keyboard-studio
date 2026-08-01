// decision-audit — the engine's half of the per-keyboard decision record
// (specs/053-decision-audit).
//
// What lives here is only what is PURE and shared: the line differ, the
// stable serializer, the tolerant reader, the save-budget shed pass, and the
// two shippable-evidence surfaces (the pull-request block and the packaged
// sidecar). The recording itself — which decisions get made, and when — is a
// studio concern (packages/studio/src/decisions/), because it hangs off the
// survey's own step-completion seam.
//
// The canonical types are in `@keyboard-studio/contracts`; nothing is redeclared
// here.

export { diffLines, diffMagnitude } from "./lineDiff.js";
export {
  parseDecisionRecord,
  serializeDecisionRecord,
  serializedRecordBytes,
} from "./record.js";
export type { ParseDecisionRecordResult } from "./record.js";
export { shedDecisionDetail } from "./shed.js";
export { buildDecisionSummaryBlock, PR_SUMMARY_MAX_ENTRIES } from "./prSummary.js";
export type { DecisionSummaryOptions } from "./prSummary.js";
export {
  addDecisionRecordSidecar,
  DECISION_RECORD_VFS_PATH,
  STUDIO_METADATA_PREFIX,
} from "./sidecar.js";
