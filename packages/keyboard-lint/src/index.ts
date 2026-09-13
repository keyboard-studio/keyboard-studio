// @keymanapp/keyboard-lint — Layer C DISCUS hygiene checks (section 18).
// Public API: the engine class, the lintWithContext helper, and individual check functions.

export { KeyboardLintEngine } from "./lintEngine.js";
export { lintWithContext, runDocChecks } from "./lintContext.js";
export type { LintContext } from "./lintContext.js";

export { parseTouchLayout } from "./parsers/parseTouchLayout.js";

export { checkLongpress } from "./checks/check-18-1-longpress.js";
export { checkTouchRows } from "./checks/check-18-2-touch-rows.js";
export { checkKeysPerRow } from "./checks/check-18-3-keys-per-row.js";
export { checkControlKeyDrift } from "./checks/check-18-4-control-key-drift.js";
export { checkLayerSwitchReturn } from "./checks/check-18-5-layer-switch-return.js";
export { checkInventoryCoverage } from "./checks/check-18-6-inventory-coverage.js";
export { checkTouchCoverage } from "./checks/check-18-6-touch-coverage.js";
// Spec 063 — the six joined/structural touch-layout codes. Each is hosted by an
// existing 18.x check module (no new criteria.json rows); see each module's header.
export {
  checkTouchDuplicateKeyId,
  checkTouchMissingRequiredKey,
} from "./checks/check-18-4-control-key-drift.js";
export { checkTouchMissingLayer } from "./checks/check-18-5-layer-switch-return.js";
export {
  checkTouchKeyIdCase,
  checkTouchKeyNoRule,
  checkTouchRuleOrphan,
} from "./checks/check-18-6-touch-coverage.js";
export { resolveJoinedCheckInputs } from "./checks/_shared.js";
export type { JoinedCheckInputs } from "./checks/_shared.js";

// spec 076 US7/FR-019 — the twelve documentation check modules (thirteen
// codes; 3.6/7.1 share one module) and their shared helpers.
export { checkHistoryOrder } from "./checks/docs/check-3-3-history-order.js";
export { checkHistoryCumulative } from "./checks/docs/check-3-4-history-cumulative.js";
export { checkHistoryEntryFormat } from "./checks/docs/check-3-5-history-entry-format.js";
export { checkHistoryVersionMatch } from "./checks/docs/check-3-6-7-1-version-match.js";
export { checkHistoryStaleFileRefs } from "./checks/docs/check-3-7-history-stale-refs.js";
export { checkCopyrightHolder } from "./checks/docs/check-4-7-copyright-holder.js";
export { checkReadmeTargets } from "./checks/docs/check-5-7-readme-targets.js";
export { checkHtmlWellFormed } from "./checks/docs/check-11-5-html-wellformed.js";
export { checkDataStatesComplete } from "./checks/docs/check-11-6-data-states.js";
export { checkPagenameFormat } from "./checks/docs/check-11-7-pagename-format.js";
export { checkBodyParity } from "./checks/docs/check-11-9-body-parity.js";
export { checkStyleParity } from "./checks/docs/check-11-10-style-parity.js";
export {
  docMemberPath,
  parseHistoryEntries,
  compareVersions,
  parseReadmePlatforms,
  parsePagename,
  expectedPagename,
  extractDataStatesLayers,
  stripPhpHeader,
  stripKeyboardLayoutSection,
  normalizeDocBody,
  extractInlineStyles,
  arraysEqual,
  findUnbalancedTags,
  VOID_ELEMENTS,
} from "./checks/docs/_shared.js";
export type { HistoryEntry, UnbalancedTag } from "./checks/docs/_shared.js";
