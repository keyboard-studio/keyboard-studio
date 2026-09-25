// marksViews.test.ts — spec 079 US3 item 4 (attachment-prefill parity).
//
// `reconciledAttachmentChecked` is the ONE place that reconciles a mark's
// attachment answers against the confirmed alphabet: `MarksSeriesStep.tsx`
// renders from it, and `hooks/useWorkToDo.ts` computes the badge-feeding
// `treatmentPrefills` from it. Before this fix the hook used
// `initialAttachmentChecked` (the raw proposal default) instead, so a class
// whose attachments the author had actually overturned fed the wrong
// attachment map into `computeMarkTreatmentPrefills` for badge purposes.

import { describe, it, expect } from "vitest";
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { groupMarkClasses, proposeAttachments } from "@keyboard-studio/engine";
import type { SavedAnswer } from "../../steps/answerTypes.ts";
import { reconciledAttachmentChecked, initialAttachmentChecked, deriveMarksFlags } from "./marksViews.ts";
import { marksAttachmentKey } from "../../steps/evidence.ts";

const ACUTE = "́";

const ALPHABET: ConfirmedAlphabet = {
  bases: ["e", "a"],
  marks: [ACUTE],
  attestedStacks: [{ base: "e", marks: [ACUTE] }],
  declaredRoles: {},
};

function savedAnswer(value: boolean, evidenceKey: string): SavedAnswer {
  return {
    value,
    answerType: "boolean",
    origin: "overturned",
    stage: "confirmed",
    evidenceKey,
    screenId: "marks_attachment",
    savedAt: 0,
  };
}

describe("reconciledAttachmentChecked (spec 079 US3 item 4)", () => {
  it("reflects a saved OVERTURNED value rather than the raw proposal default", () => {
    const classes = groupMarkClasses(ALPHABET);
    const proposals = proposeAttachments(ALPHABET, classes);
    // e+ACUTE is attested (attached by default); overturn it to unchecked.
    const key = marksAttachmentKey(ALPHABET, ACUTE, "e");
    const savedAnswers = { [`marks_attachment.${ACUTE}|e`]: savedAnswer(false, key) };

    const reconciled = reconciledAttachmentChecked(ALPHABET, proposals, savedAnswers);
    expect(reconciled[ACUTE]?.["e"]).toBe(false);

    // The bug this guards against: the raw proposal default disagrees here —
    // it still reports the ATTESTED (checked) state, ignoring the overturn.
    const defaulted = initialAttachmentChecked(proposals);
    expect(defaulted[ACUTE]?.["e"]).toBe(true);
    expect(reconciled[ACUTE]?.["e"]).not.toBe(defaulted[ACUTE]?.["e"]);
  });

  it("falls back to the proposal default when nothing is saved (first visit)", () => {
    const classes = groupMarkClasses(ALPHABET);
    const proposals = proposeAttachments(ALPHABET, classes);
    const reconciled = reconciledAttachmentChecked(ALPHABET, proposals, {});
    expect(reconciled).toEqual(initialAttachmentChecked(proposals));
  });

  it("falls back to the proposal default when the saved key is stale (evidence changed)", () => {
    const classes = groupMarkClasses(ALPHABET);
    const proposals = proposeAttachments(ALPHABET, classes);
    const savedAnswers = { [`marks_attachment.${ACUTE}|e`]: savedAnswer(false, "stale-key") };
    const reconciled = reconciledAttachmentChecked(ALPHABET, proposals, savedAnswers);
    // Not the saved (false) value — the key mismatch means "reproposed", which
    // renders the proposal's own default (true, attested) until reconfirmed.
    expect(reconciled[ACUTE]?.["e"]).toBe(true);
  });
});

describe("deriveMarksFlags attachment reasons (spec 079 US3)", () => {
  const DIAERESIS = "̈";
  const TWO_MARKS: ConfirmedAlphabet = {
    bases: ["e", "u"],
    marks: [ACUTE, DIAERESIS],
    attestedStacks: [
      { base: "e", marks: [ACUTE] },
      { base: "u", marks: [DIAERESIS] },
    ],
    declaredRoles: {},
  };

  it("names the base-plus-mark combination, so two flags on one base are told apart", () => {
    const classes = groupMarkClasses(TWO_MARKS);
    const proposals = proposeAttachments(TWO_MARKS, classes);
    const flags = deriveMarksFlags({
      alphabet: TWO_MARKS,
      proposals,
      attachmentBases: ["e", "u"],
      classes,
      treatmentPrefills: [],
      multiMarkStacks: [],
      postureId: "",
      // Attachment station already confirmed, nothing saved for the new rows:
      // every offered row is newly relevant and flagged.
      savedAnswers: {},
      lastRecorded: { marks_attachment: "e0" },
    });
    const subjects = flags.filter((f) => f.screenId === "marks_attachment").map((f) => f.reason.subject);
    expect(subjects).toEqual(expect.arrayContaining(["u" + ACUTE, "u" + DIAERESIS]));
    expect(new Set(subjects).size).toBe(subjects.length);
  });
});
