// expandCaseCounterpartAttachments — uppercase attachment expansion (spec 049,
// US2 / FR-002/003/007).

import { describe, it, expect } from "vitest";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import { expandCaseCounterpartAttachments } from "./case-fold.js";

const ACUTE = "́";
const GRAVE = "̀";

describe("expandCaseCounterpartAttachments", () => {
  it("checks the uppercase counterpart of a checked cased base present in the alphabet (SC-002, AC1)", () => {
    const alphabet = makeConfirmedAlphabet({ bases: ["e", "E"], marks: [ACUTE] });
    const out = expandCaseCounterpartAttachments(alphabet, { [ACUTE]: { e: true } });
    expect(out[ACUTE]).toEqual({ e: true, E: true });
  });

  it("leaves a caseless base untouched — no extra check (AC2, FR-003)", () => {
    // Devanagari letter ka: no case counterpart.
    const KA = "क";
    const alphabet = makeConfirmedAlphabet({ bases: [KA], marks: [ACUTE] });
    const out = expandCaseCounterpartAttachments(alphabet, { [ACUTE]: { [KA]: true } });
    expect(out[ACUTE]).toEqual({ [KA]: true });
  });

  it("does not add the counterpart when it is absent from the alphabet's bases (FR-003)", () => {
    // Lowercase e is present but uppercase E was never confirmed — nothing to attach.
    const alphabet = makeConfirmedAlphabet({ bases: ["e"], marks: [ACUTE] });
    const out = expandCaseCounterpartAttachments(alphabet, { [ACUTE]: { e: true } });
    expect(out[ACUTE]).toEqual({ e: true });
  });

  it("ignores a lowercase base with no single-character counterpart (ß → SS is rejected)", () => {
    const alphabet = makeConfirmedAlphabet({ bases: ["ß"], marks: [ACUTE] });
    const out = expandCaseCounterpartAttachments(alphabet, { [ACUTE]: { "ß": true } });
    expect(out[ACUTE]).toEqual({ "ß": true });
  });

  it("expands every checked cased base across marks and rows", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["e", "E", "a", "A"],
      marks: [ACUTE, GRAVE],
    });
    const out = expandCaseCounterpartAttachments(alphabet, {
      [ACUTE]: { e: true, a: false },
      [GRAVE]: { a: true },
    });
    expect(out[ACUTE]).toEqual({ e: true, a: false, E: true });
    expect(out[GRAVE]).toEqual({ a: true, A: true });
  });

  it("never clears an existing check and does not mutate the input map (FR-007)", () => {
    const alphabet = makeConfirmedAlphabet({ bases: ["e", "E"], marks: [ACUTE] });
    const input = { [ACUTE]: { e: true, E: true } };
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = expandCaseCounterpartAttachments(alphabet, input);
    expect(out[ACUTE]).toEqual({ e: true, E: true });
    // Input untouched (new map returned).
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
    expect(out[ACUTE]).not.toBe(input[ACUTE]);
  });

  it("honours a locale tag for locale-sensitive case mapping (tr: i → İ)", () => {
    const DOTTED_I = "İ"; // LATIN CAPITAL LETTER I WITH DOT ABOVE
    const alphabet = makeConfirmedAlphabet({ bases: ["i", DOTTED_I], marks: [ACUTE] });
    const out = expandCaseCounterpartAttachments(alphabet, { [ACUTE]: { i: true } }, "tr");
    expect(out[ACUTE]).toEqual({ i: true, [DOTTED_I]: true });
  });
});
