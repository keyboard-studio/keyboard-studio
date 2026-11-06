// openIssuesOf: which kinds of problem the opened keyboard had at the baseline
// (spec 111 FR-032), recorded as the `open-issues` decision. Pure.

import type { OpenIssueKind, OpenIssuesValue } from "../decisions/openIssues.ts";
import type { OpenBaseline } from "./openRatchet.ts";
import { upgradePairFor } from "./upgradePairs.ts";

/** The lint rule 18.6 raises once per expected character the keyboard cannot type. */
export const MISSING_LETTERS_RULE = "KM_LINT_INVENTORY_UNCOVERED";

/** The rule id of a finding key (`${ruleId}:${file}...`). */
function ruleOf(key: string): string {
  const colon = key.indexOf(":");
  return colon === -1 ? key : key.slice(0, colon);
}

/**
 * The problem kinds present at the baseline. `docGaps` is the set of help
 * documents that were missing or failing as opened (lib/openHelpGaps.ts).
 */
export function openIssuesOf(baseline: OpenBaseline, docGaps: ReadonlySet<string>): OpenIssuesValue {
  const rules = baseline.failing.map(ruleOf);
  const kinds: OpenIssueKind[] = [];
  if (rules.includes(MISSING_LETTERS_RULE)) kinds.push("missing-letters");
  if (rules.some((r) => upgradePairFor(r) !== undefined)) kinds.push("upgrades");
  if (docGaps.size > 0) kinds.push("docs");
  return kinds;
}
