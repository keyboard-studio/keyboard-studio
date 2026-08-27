// Package-internal context type for lintWithContext().
// The locked LintEngineService.lint() interface does not carry inventory/keyboardIR
// because those are not available at all phase-exit gates. This module adds a
// package-internal function that accepts optional context so 18.6 can run when
// the compile gate provides both a KeyboardIR and a LinguistInventory.

import type { VirtualFS, LintFinding, KeyboardIR, LinguistInventory, ToleranceReport, TouchLayoutIR } from "@keyboard-studio/contracts";
import { parseTouchLayout, touchLayoutPath } from "./parsers/parseTouchLayout.js";
import { checkLongpress } from "./checks/check-18-1-longpress.js";
import { checkTouchRows } from "./checks/check-18-2-touch-rows.js";
import { checkKeysPerRow } from "./checks/check-18-3-keys-per-row.js";
import {
  checkControlKeyDrift,
  checkTouchDuplicateKeyId,
  checkTouchMissingRequiredKey,
} from "./checks/check-18-4-control-key-drift.js";
import {
  checkLayerSwitchReturn,
  checkTouchMissingLayer,
} from "./checks/check-18-5-layer-switch-return.js";
import { checkInventoryCoverage } from "./checks/check-18-6-inventory-coverage.js";
import {
  checkTouchCoverage,
  checkTouchKeyIdCase,
  checkTouchKeyNoRule,
  checkTouchRuleOrphan,
} from "./checks/check-18-6-touch-coverage.js";
import { checkContextTolerance } from "./checks/check-19-x-context-tolerance.js";
import { resolveJoinedCheckInputs } from "./checks/_shared.js";

/**
 * Optional extra inputs for Layer C checks that need compiled artefacts.
 *
 * Gate -> check mapping:
 *   Phase E exit  -> 18.1, 18.2, 18.3, 18.4, 18.5 (touch-layout checks; no context needed)
 *   Compile gate  -> 18.6 desktop (inventory coverage; needs keyboardIR + inventory)
 *   Touch gallery -> 18.6 touch (KM_LINT_TOUCH_UNCOVERED; needs touchLayout + touchInventory —
 *                    spec 035 FR-008, contracts/simplification.md)
 *   Compile gate  -> 19.x context tolerance (KM_WARN_CONTEXT_NOT_TOLERANT /
 *                    KM_HINT_CONTEXT_NOT_ANALYSED; needs a precomputed
 *                    `toleranceReport` — spec 062 US2. keyboard-lint never
 *                    computes the report itself, see check-19-x's module doc)
 *   Submit        -> all of the above
 *   18.7 (currency) -> DEFERRED; not implemented
 */
export interface LintContext {
  /** Keyboard IR from the compile step; required for 18.6 desktop. */
  keyboardIR?: KeyboardIR;
  /** Confirmed linguist inventory (structured); required for 18.6 desktop. */
  inventory?: LinguistInventory;
  /**
   * Derived/edited touch layout (the same one the touch gallery previews and
   * emits); required for the 18.6 touch check. Distinct from `keyboardIR` —
   * the touch coverage guard walks a TouchLayoutIR, not desktop rules.
   */
  touchLayout?: TouchLayoutIR;
  /**
   * Confirmed inventory characters, already flattened (matches the engine's
   * `touchCoverage(layout, inventory)` signature); required for the 18.6
   * touch check. Distinct from `inventory` (structured LinguistInventory)
   * because the touch stage works from an already-flattened char list.
   */
  touchInventory?: readonly string[];
  /**
   * Precomputed canonical-equivalence both-forms diagnostic (spec 062 US2),
   * produced engine-side by `validator/context-tolerance.ts`. Required for
   * the 19.x context-tolerance check; absent -> silently skipped, same as
   * `inventory`/`touchLayout` above.
   */
  toleranceReport?: ToleranceReport;
}

/**
 * Run all implemented Layer C section-18 checks.
 * The locked `lint()` on `LintEngineService` delegates to this with an empty context
 * so that 18.6 is silently skipped at the phase-exit gate.
 */
export async function lintWithContext(
  fs: VirtualFS,
  keyboardId: string,
  ctx: LintContext
): Promise<LintFinding[]> {
  const tlPath = touchLayoutPath(keyboardId);
  const kmnPath = `source/${keyboardId}.kmn`;

  const findings: LintFinding[] = [];

  // 18.1 – 18.5: touch-layout checks
  const ir = parseTouchLayout(fs, keyboardId);
  if (ir) {
    findings.push(...checkLongpress(ir, tlPath));
    findings.push(...checkTouchRows(ir, tlPath));
    findings.push(...checkKeysPerRow(ir, tlPath));
    findings.push(...checkControlKeyDrift(ir, tlPath));
    findings.push(...checkLayerSwitchReturn(ir, tlPath));
    // Spec 063: layout-only structural checks — no join needed, so they run
    // wherever 18.1-18.5 run.
    findings.push(...checkTouchDuplicateKeyId(ir, tlPath));
    findings.push(...checkTouchMissingRequiredKey(ir, tlPath));
    findings.push(...checkTouchMissingLayer(ir, tlPath));
  }

  // 18.6 desktop: inventory coverage — only when both inputs are present
  if (ctx.keyboardIR && ctx.inventory) {
    findings.push(...checkInventoryCoverage(ctx.keyboardIR, ctx.inventory, kmnPath));
  }

  // Spec 063: the JOINED checks need rules AND layout together. One resolver
  // states the layout precedence once (IR first, then context, then a VFS parse)
  // and gates on a keyboard IR being present, exactly as the desktop inventory
  // check above is gated. No new LintContext field is required.
  const joined = resolveJoinedCheckInputs(ctx.keyboardIR, ctx.touchLayout, ir ?? undefined);

  // 18.6 touch: coverage guard (spec 035 FR-008) — only when both inputs are
  // present. The rule index is threaded when available (spec 063 FR-007), so a
  // `T_*` key whose output lives in a rule is credited here too.
  if (ctx.touchLayout && ctx.touchInventory) {
    findings.push(
      ...checkTouchCoverage(ctx.touchLayout, ctx.touchInventory, tlPath, joined?.ruleIndex),
    );
  }

  if (joined) {
    findings.push(...checkTouchKeyNoRule(joined, tlPath));
    findings.push(...checkTouchRuleOrphan(joined, tlPath));
    findings.push(...checkTouchKeyIdCase(joined, tlPath));
  }

  // 19.x: canonical-equivalence context tolerance (spec 062 US2) — same
  // both-present gating shape as 18.6 desktop above. keyboard-lint never
  // computes the report itself; `checkContextTolerance`'s `ir` parameter is
  // unused today (every finding already carries its own location) but kept
  // for parity with the other compile-gate checks.
  if (ctx.keyboardIR && ctx.toleranceReport) {
    findings.push(...checkContextTolerance(ctx.keyboardIR, ctx.toleranceReport));
  }

  return findings;
}
