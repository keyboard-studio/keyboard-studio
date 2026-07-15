// Package-internal context type for lintWithContext().
// The locked LintEngineService.lint() interface does not carry inventory/keyboardIR
// because those are not available at all phase-exit gates. This module adds a
// package-internal function that accepts optional context so 18.6 can run when
// the compile gate provides both a KeyboardIR and a LinguistInventory.

import type { VirtualFS, LintFinding, KeyboardIR, LinguistInventory, TouchLayoutIR } from "@keyboard-studio/contracts";
import { parseTouchLayout, touchLayoutPath } from "./parsers/parseTouchLayout.js";
import { checkLongpress } from "./checks/check-18-1-longpress.js";
import { checkTouchRows } from "./checks/check-18-2-touch-rows.js";
import { checkKeysPerRow } from "./checks/check-18-3-keys-per-row.js";
import { checkControlKeyDrift } from "./checks/check-18-4-control-key-drift.js";
import { checkLayerSwitchReturn } from "./checks/check-18-5-layer-switch-return.js";
import { checkInventoryCoverage } from "./checks/check-18-6-inventory-coverage.js";
import { checkTouchCoverage } from "./checks/check-18-6-touch-coverage.js";

/**
 * Optional extra inputs for Layer C checks that need compiled artefacts.
 *
 * Gate -> check mapping:
 *   Phase E exit  -> 18.1, 18.2, 18.3, 18.4, 18.5 (touch-layout checks; no context needed)
 *   Compile gate  -> 18.6 desktop (inventory coverage; needs keyboardIR + inventory)
 *   Touch gallery -> 18.6 touch (KM_LINT_TOUCH_UNCOVERED; needs touchLayout + touchInventory —
 *                    spec 035 FR-008, contracts/simplification.md)
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
  }

  // 18.6 desktop: inventory coverage — only when both inputs are present
  if (ctx.keyboardIR && ctx.inventory) {
    findings.push(...checkInventoryCoverage(ctx.keyboardIR, ctx.inventory, kmnPath));
  }

  // 18.6 touch: coverage guard (spec 035 FR-008) — only when both inputs are present
  if (ctx.touchLayout && ctx.touchInventory) {
    findings.push(...checkTouchCoverage(ctx.touchLayout, ctx.touchInventory, tlPath));
  }

  return findings;
}
