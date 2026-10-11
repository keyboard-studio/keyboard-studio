// phaseCConfirmedInventory — the one phase-C inventory both emitters report
// (spec 075 FR-014 / FR-024, contract §4).

import { describe, it, expect, beforeEach } from "vitest";
import { getCharacterInventoryValue, inventoryOps, recordInvisiblesInventoryValue, resetInventoryDecisions } from "./useInventoryDraft.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { acceptedInvisibleChars, phaseCConfirmedInventory } from "./phaseCInventory.ts";

beforeEach(() => {
  resetInventoryDecisions();
});

describe("phaseCConfirmedInventory", () => {
  it("is the union of the draft's punctuation slice and the accepted invisible decisions", () => {
    const s = inventoryOps("characters");
    s.add("!");
    s.add("?");
    s.add("a"); // a letter — the alphabet's, not phase C's
    s.acceptInvisible("U+200C");
    expect(phaseCConfirmedInventory()).toEqual(["!", "?", "‌"]);
  });

  it("a declined decision contributes nothing; an unanswered one is simply absent", () => {
    const s = inventoryOps("characters");
    s.add("!");
    s.declineInvisible("U+200D");
    s.acceptInvisible("U+00AD");
    expect(phaseCConfirmedInventory()).toEqual(["!", "­"]);
  });

  it("a character present in both inputs appears once, NFC-deduped", () => {
    const s = inventoryOps("characters");
    // U+00AD SOFT HYPHEN is a format character (Cf); glyphCategory files it
    // under `controls`, not `punctuation`, so reach the punctuation slice with a
    // real punctuation char and prove the dedupe with the invisible side.
    s.add("‐"); // HYPHEN, punctuation
    s.acceptInvisible("U+2010");
    expect(phaseCConfirmedInventory()).toEqual(["‐"]);
  });

  it("accepted invisibles are NOT in the draft's chars — they reach the inventory without touching the pick list (FR-014)", () => {
    inventoryOps("characters").acceptInvisible("U+200B");
    expect(getCharacterInventoryValue().chars).toEqual([]);
    expect(getCharacterInventoryValue().controls).toEqual([]);
    expect(phaseCConfirmedInventory()).toEqual(["​"]);
  });

  it("acceptedInvisibleChars ignores a malformed entry a hand-edited snapshot could carry", () => {
    // The old snapshot carried a decisions RECORD keyed by U+ notation, so
    // garbage keys ("not-a-code-point", "U+DFFF") could persist verbatim.
    // The decision value carries ITEMS and the keys are derived, so the
    // malformed classes that can still arrive are chars whose derived key
    // the contracts parser rejects: a lone surrogate (U+DFFF) and a
    // noncharacter (U+FDD0). Both must be ignored, not propagated.
    recordInvisiblesInventoryValue(
      {
        accepted: [
          { char: "\u200C", provenance: "asked" },
          { char: "\uDFFF", provenance: "asked" },
          { char: "\uFDD0", provenance: "asked" },
        ],
        declined: [],
      },
      "characters",
    );
    expect(acceptedInvisibleChars()).toEqual(["\u200C"]);
  });
});

describe("phase-C inventory union pin (FR-024)", () => {
  // The two phase-C emitters record through `recordPhase`, which shallow-
  // merges same-phase results. Because both report the SAME union, recording
  // punctuation, then invisibles, then punctuation again always leaves the
  // phase-C confirmedInventory equal to punctuation ∪ acceptedInvisibles, and
  // the phase-B result is never touched.
  it("recording punctuation, then invisibles, then punctuation again leaves the phase-C inventory as the union each time and phase B intact", () => {
    const wc = useWorkingCopyStore.getState();
    wc.recordPhase({ phase: "B", answers: [], confirmedInventory: ["a", "b"] });

    const s = inventoryOps("characters");
    s.add("!");
    wc.recordPhase({ phase: "C", answers: [], confirmedInventory: phaseCConfirmedInventory() });
    let c = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
    expect(c?.confirmedInventory).toEqual(["!"]);

    s.acceptInvisible("U+200C");
    wc.recordPhase({ phase: "C", answers: [], confirmedInventory: phaseCConfirmedInventory() });
    c = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
    expect(c?.confirmedInventory).toEqual(["!", "‌"]);

    s.add("?");
    wc.recordPhase({ phase: "C", answers: [], confirmedInventory: phaseCConfirmedInventory() });
    c = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "C");
    expect(c?.confirmedInventory).toEqual(["!", "?", "‌"]);

    const b = useWorkingCopyStore.getState().phaseResults.find((p) => p.phase === "B");
    expect(b?.confirmedInventory).toEqual(["a", "b"]);
  });
});
