// ldmlFindings: turns the engine's LDML classification into Layer C findings (spec 108
// FR-010 to FR-019). Pure and synchronous, so the hook that calls it stays a memo with no
// timer (decision D3, FR-014). Routing lives in lintToQuestion.ts, by code alone.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { LintCode, LintFinding } from "@keyboard-studio/contracts";
import type { CompatibilityItem, LdmlClassification, LdmlCode } from "@keyboard-studio/engine";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { LDML_CODE_COPY, LDML_CODE_PARAMS } from "./ldmlMessages.ts";

/** Every LDML finding code carries this prefix; surfaces use it to recognise them. */
export const LDML_LINT_CODE_PREFIX = "KM_LINT_LDML_";

export function isLdmlLintCode(code: string): boolean {
  return code.startsWith(LDML_LINT_CODE_PREFIX);
}

/** The translated group title for a code (the grouped summary's row heading). */
export function ldmlCodeTitle(code: string, i18n?: I18n): string {
  const copy = LDML_CODE_COPY[code as LdmlCode];
  return copy === undefined ? code : resolveMessage(i18n, copy.title);
}

function toFinding(item: CompatibilityItem & { code: LdmlCode }, i18n: I18n | undefined, keyboardId: string): LintFinding {
  const copy = LDML_CODE_COPY[item.code];
  // The item's params fill the message placeholders. A placeholder a site did not supply
  // renders empty rather than as raw braces.
  const values: Record<string, string> = {};
  for (const name of LDML_CODE_PARAMS[item.code] ?? []) values[name] = item.params[name] ?? "";
  let message = resolveMessage(i18n, { ...copy.message, values });
  // FR-017: with no line to point at, the message names the group and its owner instead.
  if (item.line === null && item.owner !== null) {
    const owner = item.owner;
    message = `${message} ${resolveMessage(i18n, msg({ id: "lint.ldml.owner", message: `Affects ${{ owner }}.` }))}`;
  }
  const finding: LintFinding = {
    code: item.code as LintCode,
    // The engine already demotes a non-rule site to a hint; an LDML finding is never an error.
    severity: item.severity === "warning" ? "warning" : "hint",
    layer: "C",
    message,
    hint: resolveMessage(i18n, copy.hint),
  };
  if (item.line !== null) finding.location = { file: `source/${keyboardId}.kmn`, line: item.line };
  return finding;
}

/**
 * One finding per classified item that carries a code (A, N and K items, and M items with a
 * hint such as the beep row). An M item without a code produces nothing (FR-011).
 */
export function buildLdmlFindings(
  classification: LdmlClassification,
  i18n: I18n | undefined,
  keyboardId: string,
): LintFinding[] {
  const out: LintFinding[] = [];
  for (const item of classification.items) {
    if (item.code === null) continue;
    out.push(toFinding({ ...item, code: item.code }, i18n, keyboardId));
  }
  return out;
}
