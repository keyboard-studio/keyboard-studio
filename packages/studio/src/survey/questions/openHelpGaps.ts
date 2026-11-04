// The documents an opened keyboard is missing or fails the criteria for (spec
// 111 FR-029). The help step's gate reads this: on Open it asks only when some
// document needs it. Gates receive only the decision set, so the studio shell
// publishes the derived set here (lib/openHelpGaps.ts computes it). Null means
// not known yet, which keeps the help step asked.

let gaps: ReadonlySet<string> | null = null;

export function setOpenHelpGaps(next: ReadonlySet<string> | null): void {
  gaps = next;
}

export function getOpenHelpGaps(): ReadonlySet<string> | null {
  return gaps;
}

/** The help step's Open gate: asked unless every help document is present and passing. */
export function openHelpStepWanted(): boolean {
  return gaps === null || gaps.size > 0;
}
