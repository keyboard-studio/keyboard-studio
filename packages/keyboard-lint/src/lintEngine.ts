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
import { lintWithContext } from "./lintContext.js";

/**
 * Concrete implementation of {@link LintEngineService} for Layer C DISCUS checks.
 * Runs the touch-layout checks (18.1–18.5) via the locked `lint()` contract.
 * For 18.6 (inventory coverage), use `lintWithContext()` directly.
 */
export class KeyboardLintEngine implements LintEngineService {
  async lint(fs: VirtualFS, keyboardId: string): Promise<LintFinding[]> {
    return lintWithContext(fs, keyboardId, {});
  }
}
