// Check 7.26 — KM_LINT_CAPS_NCAPS_INCONSISTENT.
//
// Every rule referencing a given key must be consistent in CAPS/NCAPS
// handling (kmc KM020AD WARN_KeyShouldIncludeNCaps): if any rule for a key
// tests CAPS or NCAPS, no rule for that key may omit the modifier. A bare
// `[K_A]` matches in every caps state, so it silently overlaps the
// caps-specific rules — e.g. #4185 (indonesia: CAPS rules removed for
// internal consistency), #4150 (remington_gail: numpad rule → NCAPS).
//
// Walks the parsed IR (vkey context elements carry their modifiers), so
// strings, comments and deadkey spellings cannot confuse it.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { ruleKeystrokeLoose } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

/** 7.26 — one finding per key with mixed CAPS/NCAPS handling. */
export function checkCapsNcapsConsistent(
  ir: KeyboardIR,
  keyboardId: string,
): CheckResult {
  // Key name (uppercased) -> rule counts with / without caps handling.
  const byKey = new Map<string, { withCaps: number; withoutCaps: number }>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const el = ruleKeystrokeLoose(rule);
      if (el?.kind !== "vkey") continue;
      const name = el.name.toUpperCase();
      const hasCaps = el.modifiers.some(
        (m) => m === "CAPS" || m === "NCAPS",
      );
      const entry = byKey.get(name) ?? { withCaps: 0, withoutCaps: 0 };
      if (hasCaps) entry.withCaps += 1;
      else entry.withoutCaps += 1;
      byKey.set(name, entry);
    }
  }
  const offenders = [...byKey.entries()].filter(
    ([, c]) => c.withCaps > 0 && c.withoutCaps > 0,
  );
  if (offenders.length > 0) {
    return checkFailed("KM_LINT_CAPS_NCAPS_INCONSISTENT", [
      criteriaFinding({
        code: "KM_LINT_CAPS_NCAPS_INCONSISTENT",
        file: kmnPath(keyboardId),
        message: `Key(s) with inconsistent CAPS/NCAPS handling (some rules test CAPS/NCAPS, others omit it): ${offenders
          .map(([name]) => name)
          .join(", ")}.`,
        hint: "Add the NCAPS modifier to the rules that omit it, so the key behaves consistently with Caps Lock on and off.",
      }),
    ]);
  }
  const keyCount = byKey.size;
  return checkPassed("KM_LINT_CAPS_NCAPS_INCONSISTENT", [
    `Checked ${keyCount} referenced key(s): CAPS/NCAPS handling is consistent per key.`,
  ]);
}
