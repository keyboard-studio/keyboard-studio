// facet-transform — house-target decision-table resolver (spec 039, Entity 4).
//
// `source.encoding`'s house target is CONDITIONAL (a decision-table, not a
// constant — design brief §6): a poorly-displaying script keeps `U+`-predominant
// spelling. Ordered, first-match-wins (the §7.2 PATTERN only, research D5 — NOT
// the locked §7.2 tree).
//
// D4 fixture-only guard: `orth.display-difficulty` is a spec-037 OUTPUT that has
// not landed yet. It is an INJECTED fixture input here (`inputs.displayDifficulty`),
// never read from a live `docs/keyboard-facet-index.json`.

import type { HouseTargetPolicyRow, HouseTargetResolution } from "./types.js";

/**
 * The default `source.encoding` house-style policy. Ordered, first-match-wins.
 *
 * Row 1 (non-default): a script flagged as hard-to-display keeps `u-notation`
 * so authors can see exactly which codepoints are produced (the chip explains
 * why). Row 2 (default): everything else normalizes to `quoted-literal`
 * ('a'-style) house spelling.
 */
export const DEFAULT_HOUSE_TARGET_POLICY: readonly HouseTargetPolicyRow[] = [
  {
    policyId: "source.encoding.output-spelling",
    order: 1,
    conditions: { displayDifficulty: "hard" },
    target: "u-notation",
    explanation:
      "kept U+ notation because this script renders poorly in system fonts — explicit codepoints stay legible.",
    isDefault: false,
  },
  {
    policyId: "source.encoding.output-spelling",
    order: 2,
    conditions: {},
    target: "quoted-literal",
    explanation: "normalized to 'a'-style house spelling (the default).",
    isDefault: true,
  },
];

/**
 * Resolve the house target for a `preset: 'house-style'` request.
 *
 * Evaluates `policy` in ascending `order`; the first row whose conditions all
 * match the given inputs wins. A row with empty conditions always matches (the
 * default fallback). Throws if no row matches — a policy MUST end with a default.
 */
export function resolveHouseTarget(
  policyId: string,
  inputs: { script?: string; displayDifficulty?: string },
  policy: readonly HouseTargetPolicyRow[] = DEFAULT_HOUSE_TARGET_POLICY,
): HouseTargetResolution {
  const rows = policy
    .filter((r) => r.policyId === policyId)
    .slice()
    .sort((a, b) => a.order - b.order);

  for (const row of rows) {
    const scriptOk =
      row.conditions.script === undefined || row.conditions.script === inputs.script;
    const diffOk =
      row.conditions.displayDifficulty === undefined ||
      row.conditions.displayDifficulty === inputs.displayDifficulty;
    if (scriptOk && diffOk) {
      const matchedInputs: { script?: string; displayDifficulty?: string } = {};
      if (inputs.script !== undefined) matchedInputs.script = inputs.script;
      if (inputs.displayDifficulty !== undefined)
        matchedInputs.displayDifficulty = inputs.displayDifficulty;
      return {
        policyId,
        matchedRowOrder: row.order,
        matchedInputs,
        target: row.target,
        explanation: row.explanation,
        isDefault: row.isDefault,
      };
    }
  }

  throw new Error(
    `resolveHouseTarget: no policy row matched for "${policyId}" and no default row is present.`,
  );
}
