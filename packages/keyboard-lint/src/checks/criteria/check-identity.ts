// Checks 1.6 / 7.7a — keyboard identity strings (spec 084 Batch 1).
//
//   1.6  KM_LINT_ID_CONTAINS_KEYBOARD    — the keyboard ID, folder name,
//        and display name do not contain the word "keyboard"
//   7.7a KM_LINT_DISPLAY_NAME_UNDERSCORE — the display name contains no
//        literal underscore characters
//
// Sources: the keyboard id (which is also the folder name in both the
// authored output bundle and the keyboards repository) and the display
// name — IR header.name (&NAME) first, the .kps display name as a
// second surface when the assembly supplies one and it differs.

import type { KeyboardIR, LintFinding } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

/** Display names to judge: the IR's &NAME plus a differing .kps name. */
function displayNames(ir: KeyboardIR, kpsDisplayName?: string): string[] {
  const names = [ir.header.name];
  if (kpsDisplayName !== undefined && kpsDisplayName !== ir.header.name) {
    names.push(kpsDisplayName);
  }
  return names.filter((n) => n.trim() !== "");
}

/** 1.6 — neither the id/folder nor the display name contains "keyboard". */
export function checkIdContainsKeyboard(
  ir: KeyboardIR,
  kpsDisplayName?: string,
): CheckResult {
  const code = "KM_LINT_ID_CONTAINS_KEYBOARD";
  const checked: string[] = [];
  const offenderFindings: LintFinding[] = [];
  const id = ir.header.keyboardId;
  checked.push(`ID: ${id}`);
  if (/keyboard/i.test(id)) {
    offenderFindings.push(
      criteriaFinding({
        code: "KM_LINT_ID_CONTAINS_KEYBOARD",
        file: kmnPath(id),
        message: `Keyboard ID (and folder name) "${id}" contains the word "keyboard".`,
        hint: 'Rename the keyboard so its ID does not contain the word "keyboard".',
      }),
    );
  }
  for (const name of displayNames(ir, kpsDisplayName)) {
    checked.push(`display name: "${name}"`);
    if (/keyboard/i.test(name)) {
      offenderFindings.push(
        criteriaFinding({
          code: "KM_LINT_ID_CONTAINS_KEYBOARD",
          file: kmnPath(id),
          message: `Display name "${name}" contains the word "keyboard".`,
          hint: 'Remove the word "keyboard" from the display name — the name already names a keyboard.',
        }),
      );
    }
  }
  if (offenderFindings.length > 0) return checkFailed(code, offenderFindings);
  return checkPassed(code, [`Checked ${checked.join("; ")}: no "keyboard".`]);
}

/** 7.7a — the display name contains no literal underscore characters. */
export function checkDisplayNameUnderscore(
  ir: KeyboardIR,
  kpsDisplayName?: string,
): CheckResult {
  const code = "KM_LINT_DISPLAY_NAME_UNDERSCORE";
  const names = displayNames(ir, kpsDisplayName);
  if (names.length === 0)
    return checkPassed(code, ["No display name declared to check."]);
  const offenders = names.filter((name) => name.includes("_"));
  if (offenders.length > 0)
    return checkFailed(
      code,
      offenders.map((name) =>
        criteriaFinding({
          code: "KM_LINT_DISPLAY_NAME_UNDERSCORE",
          file: kmnPath(ir.header.keyboardId),
          message: `Display name "${name}" contains a literal underscore.`,
          hint: "Use spaces instead of underscores in the display name.",
        }),
      ),
    );
  return checkPassed(code, [
    `Checked display name(s): ${names.map((n) => `"${n}"`).join(", ")} — no underscores.`,
  ]);
}
