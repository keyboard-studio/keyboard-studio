// outputBlockers — why Output can't emit right now, in one place (spec 094
// research R5, contracts C6).
//
// Before this helper each reason lived in its own banner condition, the
// download aria-label ternary, and the PR panel's `outputBlockedReason`, and
// the three drifted: the PR panel reported "compile not complete" when the real
// blocker was attribution or the licence. Every Output surface now reads the
// same ordered list.
//
// Pure: no store reads. Callers pass the gates they already hold.

import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

export type OutputBlockerKind =
  | "touchStale"
  | "coverage"
  | "license"
  | "attribution"
  | "notReady"
  | "versionUnsupported";

export interface OutputBlocker {
  kind: OutputBlockerKind;
  /**
   * The step that fixes it, opened from Output with the return-to-Output seam.
   * Absent where the fix lives elsewhere: coverage keeps its gallery button,
   * the licence is confirmed in its own banner, and no step edits the version.
   */
  stepId?: string;
  /** "Download unavailable — …", the download and test-build buttons' accessible name. */
  downloadAria: MessageDescriptor;
  /**
   * A short clause naming the problem: the PR panel puts it after "Submit
   * unavailable — ". Absent for `notReady`, which the panel already explains
   * with its own "compile not complete" text.
   */
  reason?: MessageDescriptor;
}

export interface OutputBlockersInput {
  touchStale: boolean;
  coverageBlocked: boolean;
  licenseUnparseable: boolean;
  attributionMissing: boolean;
  /** Compile is ready and the working copy is instantiated. */
  stageReady: boolean;
  /** Set only by the test-build path: true when no test version fits (research R1). */
  testVersionUnsupported?: boolean;
}

export interface OutputBlockersResult {
  /** True when the normal downloads and submission are blocked. */
  blocked: boolean;
  /** True when "Make a test build" is blocked: everything above, plus an unsupported version. */
  testBuildBlocked: boolean;
  /** In priority order; the first is the one to announce. */
  blockers: OutputBlocker[];
}

const TOUCH_STALE: OutputBlocker = {
  kind: "touchStale",
  stepId: "touch",
  downloadAria: msg({
    id: "output.download.aria.touchStale",
    message:
      "Download unavailable — the touch layout is out of date. Return to the Touch step and re-complete it before downloading.",
  }),
  reason: msg({
    id: "output.submit.outputBlockedReason.touchStale",
    message: "the touch layout is out of date — return to the Touch step and re-complete it",
  }),
};

const COVERAGE: OutputBlocker = {
  kind: "coverage",
  downloadAria: msg({
    id: "output.download.aria.coverageBlocked",
    message:
      "Download unavailable — finish every inventory character before downloading. See the banner below for details.",
  }),
  reason: msg({
    id: "output.submit.outputBlockedReason.coverageBlocked",
    message: "some inventory characters still need an implementation — see the banner above",
  }),
};

// spec 064 D5 before D6: an unreadable base notice is the more specific
// problem, and its banner is the one carrying the control that fixes it.
const LICENSE: OutputBlocker = {
  kind: "license",
  downloadAria: msg({
    id: "output.download.aria.licenseUnreadable",
    // Names the field the author is being sent to ("Original copyright
    // holder" in the banner) rather than paraphrasing it, so the
    // announcement and the control it points at use the same words.
    message:
      "Download unavailable — the base keyboard's original copyright holder could not be read. Confirm it in the banner below.",
  }),
  reason: msg({
    id: "output.submit.outputBlockedReason.licenseUnreadable",
    message: "the base keyboard's original copyright holder could not be read — confirm it in the banner above",
  }),
};

const ATTRIBUTION: OutputBlocker = {
  kind: "attribution",
  stepId: "identity",
  downloadAria: msg({
    id: "output.download.aria.attributionMissing",
    message: "Download unavailable — the keyboard needs an author and a copyright holder.",
  }),
  reason: msg({
    id: "output.submit.outputBlockedReason.attributionMissing",
    message: "the keyboard needs an author and a copyright holder — add them on the language step",
  }),
};

const NOT_READY: OutputBlocker = {
  kind: "notReady",
  downloadAria: msg({
    id: "output.download.aria.notReady",
    message: "Download unavailable until compile completes",
  }),
};

const VERSION_UNSUPPORTED: OutputBlocker = {
  kind: "versionUnsupported",
  downloadAria: msg({
    id: "output.testing.aria.versionUnsupported",
    message:
      "Test build unavailable — this keyboard's version leaves no room for a test version below the version it will be published at.",
  }),
  reason: msg({
    id: "output.testing.versionUnsupported",
    message: "this keyboard's version leaves no room for a test version",
  }),
};

export function outputBlockers(input: OutputBlockersInput): OutputBlockersResult {
  const blockers: OutputBlocker[] = [];
  if (input.touchStale) blockers.push(TOUCH_STALE);
  if (input.coverageBlocked) blockers.push(COVERAGE);
  if (input.licenseUnparseable) blockers.push(LICENSE);
  if (input.attributionMissing) blockers.push(ATTRIBUTION);
  if (!input.stageReady) blockers.push(NOT_READY);
  const blocked = blockers.length > 0;
  if (input.testVersionUnsupported === true) blockers.push(VERSION_UNSUPPORTED);
  return { blocked, testBuildBlocked: blockers.length > 0, blockers };
}
