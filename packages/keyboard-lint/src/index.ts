// @keymanapp/keyboard-lint — Layer C DISCUS hygiene checks (section 18).
// Public API: the engine class, the lintWithContext helper, and individual check functions.

export { KeyboardLintEngine } from "./lintEngine.js";
export { lintWithContext } from "./lintContext.js";
export type { LintContext } from "./lintContext.js";

export { parseTouchLayout } from "./parsers/parseTouchLayout.js";

export { checkLongpress } from "./checks/check-18-1-longpress.js";
export { checkTouchRows } from "./checks/check-18-2-touch-rows.js";
export { checkKeysPerRow } from "./checks/check-18-3-keys-per-row.js";
export { checkControlKeyDrift } from "./checks/check-18-4-control-key-drift.js";
export { checkLayerSwitchReturn } from "./checks/check-18-5-layer-switch-return.js";
export { checkInventoryCoverage } from "./checks/check-18-6-inventory-coverage.js";
export { checkTouchCoverage } from "./checks/check-18-6-touch-coverage.js";
