// Check 18.3 — KM_WARN_TOUCH_KEYS_PER_ROW
// Criteria: Touch layout uses at most 10 keys per row on phone and 13 on tablet.
// One finding per offending row.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  countInteractiveRowKeys,
  platformMaxKeysPerRow,
} from "@keyboard-studio/contracts";
import { makeLocation } from "./_shared.js";

/**
 * Check that each row does not exceed the platform key-count maximum.
 *
 * **The thresholds moved, the behaviour did not (spec 061 T022, research D6).**
 * This check's own `MAX_KEYS` table was the original and the calibrated one, and
 * it had since been copied into the studio's remove-key dialog with a comment
 * asking a future reader to keep the two in sync by hand. Spec 061 adds a third
 * consumer — the edit-time `TOUCH_KEY_ROW_CROWDED` finding — so the table now
 * lives once, in [contracts' row-metrics.ts](../../../contracts/src/row-metrics.ts),
 * and all three read it from there. Contracts rather than engine because
 * `.dependency-cruiser.cjs`'s `lint-not-to-engine` rule forbids this package
 * importing engine at all.
 *
 * The code, severity, layer, location, per-row granularity and message wording
 * are unchanged, and so is the interactive-key count — `countInteractiveRowKeys`
 * is the same `isSpacerKeyClass` filter this file already applied, moved next to
 * the numbers it is counted against. See that module's doc for the sp:8/sp:9
 * recount this check's own comment used to carry.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkKeysPerRow(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const platform of ir.platforms) {
    const maxKeys = platformMaxKeysPerRow(platform.id);
    if (maxKeys === undefined) continue;

    for (const layer of platform.layers) {
      layer.rows.forEach((row, rowIdx) => {
        const keyCount = countInteractiveRowKeys(row.keys);
        if (keyCount > maxKeys) {
          findings.push({
            code: "KM_WARN_TOUCH_KEYS_PER_ROW",
            severity: "warning",
            layer: "C",
            message: `Platform "${platform.id}" layer "${layer.id}" row ${rowIdx + 1} has ${keyCount} key(s); maximum is ${maxKeys}.`,
            location: makeLocation(touchLayoutPath),
            hint: `Remove keys from row ${rowIdx + 1} of layer "${layer.id}" on ${platform.id} until it has ${maxKeys} or fewer to avoid crowding on small screens.`,
          });
        }
      });
    }
  }

  return findings;
}
