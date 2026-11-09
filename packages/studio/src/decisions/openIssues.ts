// openIssues: the `open-issues` decision's value and the gates that read it
// (spec 111 FR-032). It records which kinds of problem the opened keyboard had
// when the baseline was taken, so the Open walk's conditional pages (Missing
// letters, Upgrades, Documentation) derive from a recorded decision and from
// nothing else.
//
// Until the baseline lands there is no decision, and every gate below answers
// false: the walk skips those pages rather than guessing. The Languages step
// comes first and the baseline normally lands while the author is on it. Pure:
// no store reads, no timers.

import type { DecisionSet } from "./decisionTypes.ts";

/** A kind of problem the walk has a page for. */
export type OpenIssueKind = "missing-letters" | "upgrades" | "docs";

/** The recorded value of the `open-issues` decision. */
export type OpenIssuesValue = readonly OpenIssueKind[];

/** True when the baseline recorded that the keyboard has `kind` of problem. */
export function hasOpenIssue(decisions: DecisionSet, kind: OpenIssueKind): boolean {
  const value = decisions["open-issues"]?.value;
  return Array.isArray(value) && value.includes(kind);
}

/** True when the keyboard is being opened for update (the internal track value is "adapt"). */
function isOpen(decisions: DecisionSet): boolean {
  return decisions["authoring-track"]?.value === "adapt";
}

/**
 * True when the opened keyboard is a basic keyboard (lib/basicKeyboard.ts), recorded
 * when the keyboard is opened. Absent counts as not basic.
 */
export function isOpenBasicKeyboard(decisions: DecisionSet): boolean {
  return decisions["open-basic-keyboard"]?.value === true;
}

/**
 * The Letters page: always walked on Open for a keyboard that is not basic (its
 * author may add characters, or letters, beyond the base set); for a basic keyboard,
 * only when the baseline found letters its languages need that it cannot type.
 */
export function openLettersGate(decisions: DecisionSet): boolean {
  if (!isOpen(decisions)) return false;
  return !isOpenBasicKeyboard(decisions) || hasOpenIssue(decisions, "missing-letters");
}

/**
 * The Mechanisms gallery on Open: walked for a keyboard that is not basic. A basic
 * keyboard's physical layout never changes, so its added characters can only go on touch.
 */
export function openMechanismsGate(decisions: DecisionSet): boolean {
  return !isOpen(decisions) || !isOpenBasicKeyboard(decisions);
}

/** The gate of a walk page that shows on Open only, and only when the baseline found `kind`. */
export function openIssueGate(kind: OpenIssueKind): (decisions: DecisionSet) => boolean {
  return (decisions) => isOpen(decisions) && hasOpenIssue(decisions, kind);
}
