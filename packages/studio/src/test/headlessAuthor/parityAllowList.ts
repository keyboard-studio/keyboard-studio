// Reviewed explanations of parity differences (spec 107 FR-021, FR-022).
//
// Each entry needs a case id, the decision id, the reason, and the product
// change (commit or PR) or record age (`record-age:<build>`) that explains it.
// The records under lib/__fixtures__/decision-points/records/ are never edited
// to make parity pass. An entry whose difference no longer occurs is reported
// as stale and must be removed.
//
// The fix for a difference is never author logic (FR-017): make the author
// call the product as the UI does, lift the rule, or list it Playwright-only.
// Only a product change or an old record earns an entry here.

import type { ParityAllowEntry } from "./caseTypes.ts";

export const PARITY_ALLOW_LIST: readonly ParityAllowEntry[] = [
  {
    caseId: "p4-unwrap-bafut-camqwerty",
    decisionId: "carved-layout",
    reason:
      "The product now proposes 571 derived removals, marked until Continue, and the author keeps them (tool-proposed). " +
      "The record predates marked-until-Continue: it has no removals and legacy bulk-default allow-host dispositions (hand-set).",
    explainedBy: "record-age:origin/main 2698f774 (round 3)",
  },
  {
    caseId: "p4-unwrap-ewondo-camazerty",
    decisionId: "carved-layout",
    reason:
      "The product now proposes 642 derived removals, marked until Continue, and the author keeps them (tool-proposed). " +
      "The record predates marked-until-Continue: it has no removals and legacy bulk-default allow-host dispositions (hand-set).",
    explainedBy: "record-age:origin/main 2698f774 (round 3)",
  },
  {
    caseId: "p4-unwrap-bafut-camqwerty",
    decisionId: "marks-treatment",
    reason:
      "contextTolerance only: the author accepts the station's pre-accepted normalization; the record has null because " +
      "the walker pressed Continue before the analysis arrived. The accepted overlay goes stale by output (the dropped-decision bug). " +
      "Also the retired guard question: see the p1-whole-bafut-kbdus entry.",
    explainedBy: "record-age:origin/main 2698f774 (round 3)",
  },
  {
    caseId: "p1-whole-bafut-kbdus",
    decisionId: "marks-treatment",
    reason:
      "The guard question was retired for the per-mark start-of-line box (main 874b44b1), so the author records no " +
      "marks.marks_guard.behaviour answer; the record still carries the walker's hand-set guard answer.",
    explainedBy: "record-age:origin/main 874b44b1 (start-of-line box)",
  },
  {
    caseId: "p1-whole-ewondo-kbdfr",
    decisionId: "marks-treatment",
    reason:
      "The guard question was retired for the per-mark start-of-line box (main 874b44b1), so the author records no " +
      "marks.marks_guard.behaviour answer; the record still carries the walker's hand-set guard answer.",
    explainedBy: "record-age:origin/main 874b44b1 (start-of-line box)",
  },
  {
    caseId: "p4-unwrap-ewondo-camazerty",
    decisionId: "marks-treatment",
    reason:
      "The guard question was retired for the per-mark start-of-line box (main 874b44b1), so the author records no " +
      "marks.marks_guard.behaviour answer; the record still carries the walker's hand-set guard answer.",
    explainedBy: "record-age:origin/main 874b44b1 (start-of-line box)",
  },
  {
    caseId: "p1-whole-bafut-kbdus",
    decisionId: "track_choice",
    reason:
      "The track_choice question was retired (PR #2568): the track now defaults to copy and is never asked, " +
      "so the author records no track_choice survey answer; the record still carries the tool-proposed " +
      "track_choice answer from the old walk. Agency-only difference: the authoring-track values still match, " +
      "so compareParity sees no value difference for this entry.",
    explainedBy: "PR #2568 (track_choice removal)",
  },
  {
    caseId: "p4-unwrap-bafut-camqwerty",
    decisionId: "track_choice",
    reason:
      "The track_choice question was retired (PR #2568): the track now defaults to copy and is never asked, " +
      "so the author records no track_choice survey answer; the record still carries the tool-proposed " +
      "track_choice answer from the old walk. Agency-only difference: the authoring-track values still match, " +
      "so compareParity sees no value difference for this entry.",
    explainedBy: "PR #2568 (track_choice removal)",
  },
  {
    caseId: "p1-whole-ewondo-kbdfr",
    decisionId: "track_choice",
    reason:
      "The track_choice question was retired (PR #2568): the track now defaults to copy and is never asked, " +
      "so the author records no track_choice survey answer; the record still carries the tool-proposed " +
      "track_choice answer from the old walk. Agency-only difference: the authoring-track values still match, " +
      "so compareParity sees no value difference for this entry.",
    explainedBy: "PR #2568 (track_choice removal)",
  },
  {
    caseId: "p4-unwrap-ewondo-camazerty",
    decisionId: "track_choice",
    reason:
      "The track_choice question was retired (PR #2568): the track now defaults to copy and is never asked, " +
      "so the author records no track_choice survey answer; the record still carries the tool-proposed " +
      "track_choice answer from the old walk. Agency-only difference: the authoring-track values still match, " +
      "so compareParity sees no value difference for this entry.",
    explainedBy: "PR #2568 (track_choice removal)",
  },
];
