// Layer C lint engine — implements LintEngineService from @keyboard-studio/contracts.
//
// Gate -> check mapping (section-18 DISCUS checks):
//   Phase E exit  -> 18.1 KM_WARN_LONGPRESS_OVERSIZE
//                    18.2 KM_WARN_TOUCH_ROW_COUNT
//                    18.3 KM_WARN_TOUCH_KEYS_PER_ROW
//                    18.4 KM_WARN_CONTROL_KEY_DRIFT
//                    18.5 KM_WARN_LAYER_SWITCH_NO_RETURN
//   Compile gate  -> 18.6 KM_LINT_INVENTORY_UNCOVERED (also needs keyboardIR + inventory — use lintWithContext)
//   Submit        -> all of the above
//   18.7 KM_LINT_MANDATED_CHAR_MISSING -> DEFERRED; not implemented
//
// The locked LintEngineService.lint() interface runs 18.1–18.5 only (no compiled artefacts
// needed). Callers that have a KeyboardIR + LinguistInventory (e.g. the compile gate)
// should call lintWithContext() directly from lintContext.ts.

import type { VirtualFS, LintFinding } from "@keyboard-studio/contracts";
import type { LintEngineService } from "@keyboard-studio/contracts";
import { lintWithContext, type LintContext } from "./lintContext.js";

/**
 * Concrete implementation of {@link LintEngineService} for Layer C DISCUS checks.
 * Runs the touch-layout checks (18.1–18.5) via the locked `lint()` contract.
 * For 18.6 (desktop or touch inventory coverage), use `lintWithContext()` method
 * below (or the standalone function of the same name).
 */
export class KeyboardLintEngine implements LintEngineService {
  async lint(fs: VirtualFS, keyboardId: string): Promise<LintFinding[]> {
    return lintWithContext(fs, keyboardId, {});
  }

  /**
   * Run 18.1–18.5 plus any context-dependent checks whose inputs are present
   * in `ctx` (18.6 desktop and/or 18.6 touch — see LintContext). Exposed as an
   * engine method so callers holding a single engine instance (e.g.
   * useTouchLint) can route through it without importing the standalone
   * `lintWithContext` function directly.
   */
  async lintWithContext(fs: VirtualFS, keyboardId: string, ctx: LintContext): Promise<LintFinding[]> {
    return lintWithContext(fs, keyboardId, ctx);
  }
}
