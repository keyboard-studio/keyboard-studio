// Check 18.13 — KM_WARN_TOUCH_REPLACE_SHADOWS_ALTERNATE
// Criteria: a character that stacks touch_key_replace with an additive method
// (longpress/flick/multitap) on the same host key must not have its primary
// tap output duplicate one of its own alternates — the primary then
// duplicates/defeats one of the alternates it should be sitting alongside.
// Non-blocking: this compiles as valid KMN, so it is warning-only.
//
// Local reimplementation note: .dependency-cruiser.cjs forbids
// packages/keyboard-lint/src from importing packages/engine/. The shadow
// predicate below mirrors isTouchSubKeyDuplicate() in
// engine/src/pattern-apply/touch-mechanism-shared.ts, and charToUnicodeKeyId()
// mirrors engine/src/shared/touch-ids.ts — reimplemented here, not imported.

import type { LintFinding } from "@keyboard-studio/contracts";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

/**
 * Convert a Unicode character to its Keyman touch-layout key id (U_<UPPERHEX>).
 * Mirrors engine/src/shared/touch-ids.ts charToUnicodeKeyId().
 */
function charToUnicodeKeyId(char: string): string {
  const cp = char.normalize("NFC").codePointAt(0);
  if (cp === undefined) return "U_FFFD";
  const hex = cp.toString(16).toUpperCase().padStart(4, "0");
  return `U_${hex}`;
}

/**
 * True if an alternate (sk / multitap / flick entry) duplicates a key's
 * primary tap output, by text/output or by derived U_ id. Mirrors
 * isTouchSubKeyDuplicate() in engine/src/pattern-apply/touch-mechanism-shared.ts.
 */
function shadowsPrimary(alternate: TouchKeyIR, primary: string): boolean {
  return (
    (alternate.text ?? alternate.output) === primary ||
    alternate.id === charToUnicodeKeyId(primary)
  );
}

/**
 * Check that a key's primary tap output does not shadow one of its own
 * longpress/multitap/flick alternates. One finding per offending key.
 *
 * @param ir - Parsed touch layout.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkTouchReplaceShadow(
  ir: TouchLayoutIR,
  touchLayoutPath: string
): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const platform of ir.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const primary = key.text;
          if (primary === undefined) continue;

          const alternates: TouchKeyIR[] = [
            ...(key.sk ?? []),
            ...(key.multitap ?? []),
            ...Object.values(key.flick ?? {}).filter(
              (alt): alt is TouchKeyIR => alt !== undefined
            ),
          ];

          const shadowed = alternates.some((alt) => shadowsPrimary(alt, primary));
          if (shadowed) {
            findings.push({
              code: "KM_WARN_TOUCH_REPLACE_SHADOWS_ALTERNATE",
              severity: "warning",
              layer: "C",
              message: `Key "${key.id}" replaces its primary tap output with "${primary}", which duplicates one of its own longpress/multitap/flick alternates.`,
              location: { file: touchLayoutPath, line: 1 },
              hint: `Change "${key.id}"'s primary output or the duplicated alternate so the alternate stays reachable and distinct.`,
            });
          }
        }
      }
    }
  }

  return findings;
}
