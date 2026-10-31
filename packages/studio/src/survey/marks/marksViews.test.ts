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
import {
  ATTACHMENT_SPACE,
  ATTACHMENT_START_OF_LINE,
  reconciledAttachmentChecked,
  initialAttachmentChecked,
  deriveMarksFlags,
} from "./marksViews.ts";
import { marksAttachmentKey, marksBackspaceKey } from "../../steps/evidence.ts";
import { nfcPostureOfInventory } from "@keyboard-studio/engine";
import { stackKey } from "@keyboard-studio/contracts";

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
    const initial = initialAttachmentChecked(proposals);
    // Plus the space column (spec 106 FR-013) and the start-of-line column
    // (issue #2374), both unticked.
    expect(reconciled).toEqual(
      Object.fromEntries(
        Object.entries(initial).map(([mark, row]) => [
          mark,
          { ...row, [ATTACHMENT_SPACE]: false, [ATTACHMENT_START_OF_LINE]: false },
        ]),
      ),
    );
  });

  it("seeds the start-of-line column ticked when the migration default says so (issue #2374)", () => {
    const classes = groupMarkClasses(ALPHABET);
    const proposals = proposeAttachments(ALPHABET, classes);
    const reconciled = reconciledAttachmentChecked(ALPHABET, proposals, {}, true);
    expect(reconciled[ACUTE]?.[ATTACHMENT_START_OF_LINE]).toBe(true);
    // A saved answer always wins over the seed.
    const key = marksAttachmentKey(ALPHABET, ACUTE, ATTACHMENT_START_OF_LINE);
    const savedAnswers = { [`marks_attachment.${ACUTE}|${ATTACHMENT_START_OF_LINE}`]: savedAnswer(false, key) };
    expect(
      reconciledAttachmentChecked(ALPHABET, proposals, savedAnswers, true)[ACUTE]?.[ATTACHMENT_START_OF_LINE],
    ).toBe(false);
  });

  it("reads a saved space-column tick (spec 106 FR-013)", () => {
    const classes = groupMarkClasses(ALPHABET);
    const proposals = proposeAttachments(ALPHABET, classes);
    const key = marksAttachmentKey(ALPHABET, ACUTE, ATTACHMENT_SPACE);
    const savedAnswers = { [`marks_attachment.${ACUTE}|${ATTACHMENT_SPACE}`]: savedAnswer(true, key) };
    expect(reconciledAttachmentChecked(ALPHABET, proposals, savedAnswers)[ACUTE]?.[ATTACHMENT_SPACE]).toBe(true);
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

describe("deriveMarksFlags backspace answer (#2302)", () => {
  const posture = nfcPostureOfInventory(ALPHABET);
  const postureId = [...posture]
    .map((p) => `${stackKey(p.stack)}:${p.hasReadyMadeForm ? 1 : 0}`)
    .sort()
    .join(",");

  function backspaceFlags(outputForm: string | undefined, savedKey: string) {
    const classes = groupMarkClasses(ALPHABET);
    const proposals = proposeAttachments(ALPHABET, classes);
    const saved: SavedAnswer = {
      value: "peel",
      answerType: "select",
      origin: "overturned",
      stage: "confirmed",
      evidenceKey: savedKey,
      screenId: "marks_output_form",
      savedAt: 0,
    };
    return deriveMarksFlags({
      alphabet: ALPHABET,
      proposals,
      attachmentBases: ["e", "a"],
      classes,
      treatmentPrefills: [],
      multiMarkStacks: [],
      postureId,
      ...(outputForm !== undefined ? { outputForm } : {}),
      savedAnswers: { "marks_output_form.backspace": saved },
      lastRecorded: {},
    }).filter((f) => f.answerId === "marks_output_form.backspace");
  }

  it("does not flag a backspace answer whose key matches the current form", () => {
    expect(backspaceFlags("ready-made", marksBackspaceKey("ready-made", postureId))).toEqual([]);
  });

  it("flags it when the form changed under it — its proposal followed the old form", () => {
    const flags = backspaceFlags("base-plus-mark", marksBackspaceKey("ready-made", postureId));
    expect(flags).toHaveLength(1);
    expect(flags[0]?.screenId).toBe("marks_output_form");
  });

  it("never flags when the caller cannot state the current form", () => {
    expect(backspaceFlags(undefined, marksBackspaceKey("ready-made", postureId))).toEqual([]);
  });
});
