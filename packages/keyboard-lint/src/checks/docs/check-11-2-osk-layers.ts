// Check 11.2 — KM_LINT_PHP_OSK_LAYERS_INCOMPLETE
// Criteria (criteria.json "11.2-php-osk-all-layers"): "If using OSK
// syntax, all desktop and mobile layers are listed in `data-states`."
// The exact complement of 11.6: 11.6 flags layers named in data-states
// that do not exist; 11.2 flags real layers missing from the list.
// Silent when the help page does not use OSK syntax at all (no
// data-states attribute) — the criterion is conditional on using it.

import type { DocLintInput } from "@keyboard-studio/contracts";
import { docMemberPath, extractDataStatesLayers } from "./_shared.js";
import { checkFailed, checkPassed, type CheckResult } from "../criteria/_shared.js";

/**
 * Check that every real layer of the keyboard is listed in the help
 * page's `data-states` attribute(s).
 *
 * @param input - Documentation check input (uses `members["help-php"]`
 *   and `layerIds`).
 */
export function checkOskLayersListed(input: DocLintInput): CheckResult {
  const code = "KM_LINT_PHP_OSK_LAYERS_INCOMPLETE";
  const text = input.members["help-php"];
  if (text === undefined) return checkPassed(code, ["No help.php to check."]);

  const named = extractDataStatesLayers(text);
  if (named.length === 0)
    return checkPassed(code, [
      "File: " + docMemberPath("help-php", input.keyboardId),
      "No data-states attribute — OSK syntax not used.",
    ]);

  const namedSet = new Set(named);
  const missing = input.layerIds.filter((l) => !namedSet.has(l));
  const path = docMemberPath("help-php", input.keyboardId);
  if (missing.length === 0)
    return checkPassed(code, [
      "File: " + path,
      `All ${input.layerIds.length} layer${input.layerIds.length === 1 ? "" : "s"} listed in data-states.`,
    ]);

  return checkFailed(code, [
    {
      code: "KM_LINT_PHP_OSK_LAYERS_INCOMPLETE",
      severity: "warning",
      layer: "C",
      message: `${path}'s data-states attribute does not list layer(s): ${missing.join(", ")}.`,
      location: { file: path, line: 1 },
      hint: `Add ${missing.join(", ")} to data-states so every layer is listed.`,
    },
  ]);
}
