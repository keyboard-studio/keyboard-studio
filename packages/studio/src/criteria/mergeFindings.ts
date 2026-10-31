// mergeFindings — merge lint finding groups, deduped by (code, message).
//
// Split out of hooks/useCriteriaFindings.ts so the worker-safe foreign
// assembly (criteria/judgeForeign.ts) can use it without importing that
// hook module (which pulls React and the decisions machinery into the
// worker bundle). useCriteriaFindings re-exports it; existing importers
// are unaffected.

import type { LintFinding } from "@keyboard-studio/contracts";

export function mergeLintFindings(
  ...groups: readonly (readonly LintFinding[])[]
): LintFinding[] {
  const seen = new Set<string>();
  const merged: LintFinding[] = [];
  for (const group of groups) {
    for (const finding of group) {
      const key = `${finding.code}\0${finding.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(finding);
    }
  }
  return merged;
}
