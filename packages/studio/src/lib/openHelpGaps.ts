// openHelpGaps: which help documents an opened keyboard is missing, or ships
// failing their criteria (spec 111 US7, FR-029). The help step on Open is asked
// only when this is non-empty; the answers prefill from the existing documents
// (the Phase F extracts in phaseFSeeds.ts). Pure: no store reads, no timers.

import { docMemberPath, type DocMemberId, type LintFinding } from "@keyboard-studio/contracts";

import { docMemberForPath } from "./collectDocLintInput.ts";

/**
 * The members the help step fills. LICENSE.md is excluded: the identity step
 * fills it, so a missing or failing LICENSE does not reopen the help step.
 */
export const HELP_FED_MEMBERS: readonly DocMemberId[] = [
  "readme-md",
  "readme-htm",
  "welcome-htm",
  "help-php",
  "history-md",
];

export interface OpenHelpGapsInput {
  vfs: { get(path: string): unknown };
  keyboardId: string;
  /** The findings the documents had as opened (the baseline), or null when not computed yet. */
  baselineFindings: readonly LintFinding[] | null;
}

/** Help documents that are absent from the working copy or fail a criterion at the baseline. */
export function deriveOpenHelpGaps(input: OpenHelpGapsInput): ReadonlySet<DocMemberId> {
  const gaps = new Set<DocMemberId>();
  for (const member of HELP_FED_MEMBERS) {
    if (input.vfs.get(docMemberPath(member, input.keyboardId)) === undefined) gaps.add(member);
  }
  for (const f of input.baselineFindings ?? []) {
    const member = docMemberForPath(f.location?.file, input.keyboardId);
    if (member !== undefined && HELP_FED_MEMBERS.includes(member)) gaps.add(member);
  }
  return gaps;
}
