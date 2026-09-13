// Check 11.6 — KM_LINT_PHP_DATA_STATES_INCOMPLETE
// Criteria (criteria.json "11.6-php-osk-data-states-all-layers"): "`.php`
// `data-states` attribute lists every layer defined in the `.kmn` and touch
// layout ... 11.6 catches `data-states` values naming layers that don't exist
// — phantom layers" (complementary to 11.2, which is not implemented here).

import type { DocLintInput, LintFinding } from "@keyboard-studio/contracts";
import { docMemberPath, extractDataStatesLayers } from "./_shared.js";

/**
 * Check that every layer named in the help page's `data-states` attribute(s)
 * is a real layer of the keyboard.
 *
 * @param input - Documentation check input (uses `members["help-php"]`
 *   and `layerIds`).
 */
export function checkDataStatesComplete(input: DocLintInput): LintFinding[] {
  const text = input.members["help-php"];
  if (text === undefined) return [];

  const named = extractDataStatesLayers(text);
  if (named.length === 0) return [];

  const known = new Set(input.layerIds);
  const phantom = named.filter((l) => !known.has(l));
  if (phantom.length === 0) return [];

  const path = docMemberPath("help-php", input.keyboardId);
  return [
    {
      code: "KM_LINT_PHP_DATA_STATES_INCOMPLETE",
      severity: "warning",
      layer: "C",
      message: `${path}'s data-states attribute names layer(s) that do not exist: ${phantom.join(", ")}.`,
      location: { file: path, line: 1 },
      hint: `Remove ${phantom.join(", ")} from data-states, or add the missing layer(s) to the keyboard.`,
    },
  ];
}
