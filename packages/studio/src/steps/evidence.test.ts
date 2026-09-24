// evidence.test.ts — pure key functions and reconcile() (spec 079 T005,
// data-model.md §2-§3, contracts/answer-store-contract.md §2-§3).

import { describe, expect, it } from "vitest";
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import {
  alphabetKey,
  convenienceKey,
  invisiblesKey,
  marksAttachmentKey,
  marksClassTreatmentKey,
  marksInputOrderKey,
  marksKey,
  marksMarkTreatmentKey,
  marksOutputFormKey,
  marksStackKey,
  offeredKey,
  punctuationKey,
  reconcile,
} from "./evidence.ts";
import type { SavedAnswer } from "./answerTypes.ts";

function alphabet(overrides: Partial<ConfirmedAlphabet> = {}): ConfirmedAlphabet {
  return {
    bases: ["a", "b"],
    marks: ["́"],
    attestedStacks: [],
    declaredRoles: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// alphabetKey
// ---------------------------------------------------------------------------

describe("alphabetKey", () => {
  it("is deterministic for the same inputs", () => {
    const e = { bcp47: "fr", script: "Latn", variant: "x", baseId: "kbdfr" };
    expect(alphabetKey(e)).toBe(alphabetKey({ ...e }));
  });

  it("changes when any field differs", () => {
    const base = alphabetKey({ bcp47: "fr", script: "Latn", variant: null, baseId: "kbdfr" });
    expect(alphabetKey({ bcp47: "en", script: "Latn", variant: null, baseId: "kbdfr" })).not.toBe(base);
    expect(alphabetKey({ bcp47: "fr", script: "Cyrl", variant: null, baseId: "kbdfr" })).not.toBe(base);
    expect(alphabetKey({ bcp47: "fr", script: "Latn", variant: "1996", baseId: "kbdfr" })).not.toBe(base);
    expect(alphabetKey({ bcp47: "fr", script: "Latn", variant: null, baseId: "other" })).not.toBe(base);
  });

  it("treats undefined and null the same for a missing field", () => {
    expect(alphabetKey({ bcp47: "fr" })).toBe(alphabetKey({ bcp47: "fr", script: null, variant: null, baseId: null }));
  });
});

// ---------------------------------------------------------------------------
// marksKey
// ---------------------------------------------------------------------------

describe("marksKey", () => {
  it("is deterministic for the same alphabet content", () => {
    const a = alphabet();
    expect(marksKey(a)).toBe(marksKey(alphabet()));
  });

  it("changes when the alphabet's bases or marks change", () => {
    const before = marksKey(alphabet({ bases: ["a", "b"] }));
    const after = marksKey(alphabet({ bases: ["a", "b", "c"] }));
    expect(after).not.toBe(before);
  });
});

// ---------------------------------------------------------------------------
// marksAttachmentKey
// ---------------------------------------------------------------------------

describe("marksAttachmentKey", () => {
  it("is deterministic for the same alphabet/mark/base", () => {
    const a = alphabet();
    expect(marksAttachmentKey(a, "́", "a")).toBe(marksAttachmentKey(alphabet(), "́", "a"));
  });

  it("changes when the base is ADDED to the alphabet", () => {
    const withoutBase = alphabet({ bases: ["b"] });
    const withBase = alphabet({ bases: ["a", "b"] });
    expect(marksAttachmentKey(withoutBase, "́", "a")).not.toBe(
      marksAttachmentKey(withBase, "́", "a"),
    );
  });

  it("changes when the base is REMOVED from the alphabet", () => {
    const withBase = alphabet({ bases: ["a", "b"] });
    const withoutBase = alphabet({ bases: ["b"] });
    expect(marksAttachmentKey(withBase, "́", "a")).not.toBe(
      marksAttachmentKey(withoutBase, "́", "a"),
    );
  });

  it("changes when the B+M stack becomes attested", () => {
    const notAttested = alphabet({ attestedStacks: [] });
    const attested = alphabet({ attestedStacks: [{ base: "a", marks: ["́"] }] });
    expect(marksAttachmentKey(notAttested, "́", "a")).not.toBe(
      marksAttachmentKey(attested, "́", "a"),
    );
  });

  it("is unaffected by an unrelated base being added or removed", () => {
    const before = alphabet({ bases: ["a", "b"] });
    const afterUnrelatedAdd = alphabet({ bases: ["a", "b", "z"] });
    expect(marksAttachmentKey(before, "́", "a")).toBe(
      marksAttachmentKey(afterUnrelatedAdd, "́", "a"),
    );
  });
});

// ---------------------------------------------------------------------------
// marksClassTreatmentKey / marksMarkTreatmentKey / marksStackKey
// ---------------------------------------------------------------------------

describe("marksClassTreatmentKey", () => {
  it("is order-insensitive", () => {
    expect(marksClassTreatmentKey(["x", "y", "z"])).toBe(marksClassTreatmentKey(["z", "x", "y"]));
  });

  it("changes when the member set changes", () => {
    expect(marksClassTreatmentKey(["x", "y"])).not.toBe(marksClassTreatmentKey(["x", "y", "z"]));
  });
});

describe("marksMarkTreatmentKey", () => {
  it("is deterministic and depends on presence + class", () => {
    const a = alphabet({ marks: ["́"] });
    expect(marksMarkTreatmentKey(a, "́", "grave")).toBe(marksMarkTreatmentKey(alphabet({ marks: ["́"] }), "́", "grave"));
  });

  it("changes when the mark's presence changes", () => {
    const present = alphabet({ marks: ["́"] });
    const absent = alphabet({ marks: [] });
    expect(marksMarkTreatmentKey(present, "́", "acute")).not.toBe(
      marksMarkTreatmentKey(absent, "́", "acute"),
    );
  });

  it("changes when the class id changes", () => {
    const a = alphabet({ marks: ["́"] });
    expect(marksMarkTreatmentKey(a, "́", "acute")).not.toBe(marksMarkTreatmentKey(a, "́", "grave"));
  });
});

describe("marksStackKey", () => {
  it("is 1 only when every member is present", () => {
    const complete = alphabet({ bases: ["a"], marks: ["́", "̀"] });
    expect(marksStackKey(complete, ["a", "́", "̀"])).toBe("stk|1");
  });

  it("is 0 when any member is missing", () => {
    const incomplete = alphabet({ bases: ["a"], marks: ["́"] });
    expect(marksStackKey(incomplete, ["a", "́", "̀"])).toBe("stk|0");
  });
});

// ---------------------------------------------------------------------------
// marksOutputFormKey / marksInputOrderKey
// ---------------------------------------------------------------------------

describe("marksOutputFormKey", () => {
  it("is deterministic and depends on the posture id", () => {
    expect(marksOutputFormKey("nfc")).toBe(marksOutputFormKey("nfc"));
    expect(marksOutputFormKey("nfc")).not.toBe(marksOutputFormKey("nfd"));
  });
});

describe("marksInputOrderKey", () => {
  it("is order-insensitive", () => {
    expect(marksInputOrderKey(["a", "b"])).toBe(marksInputOrderKey(["b", "a"]));
  });

  it("changes when the own-key mark set changes", () => {
    expect(marksInputOrderKey(["a"])).not.toBe(marksInputOrderKey(["a", "b"]));
  });
});

// ---------------------------------------------------------------------------
// punctuationKey / invisiblesKey / convenienceKey / offeredKey
// ---------------------------------------------------------------------------

describe("punctuationKey", () => {
  it("is deterministic for the same tag/base", () => {
    expect(punctuationKey("quote-curly", "kbdfr")).toBe(punctuationKey("quote-curly", "kbdfr"));
  });

  it("changes when either part differs", () => {
    const base = punctuationKey("quote-curly", "kbdfr");
    expect(punctuationKey("quote-straight", "kbdfr")).not.toBe(base);
    expect(punctuationKey("quote-curly", "other")).not.toBe(base);
  });

  it("treats undefined and null the same", () => {
    expect(punctuationKey(undefined, undefined)).toBe(punctuationKey(null, null));
  });
});

describe("invisiblesKey", () => {
  it("is order-insensitive", () => {
    expect(invisiblesKey(["ZWJ", "ZWNJ"])).toBe(invisiblesKey(["ZWNJ", "ZWJ"]));
  });

  it("changes when the candidate set changes", () => {
    expect(invisiblesKey(["ZWJ"])).not.toBe(invisiblesKey(["ZWJ", "ZWNJ"]));
  });
});

describe("convenienceKey", () => {
  it("is order-insensitive in the surplus set", () => {
    expect(convenienceKey("known", ["q", "x"])).toBe(convenienceKey("known", ["x", "q"]));
  });

  it("changes when the signal state changes", () => {
    expect(convenienceKey("known", ["q"])).not.toBe(convenienceKey("unknown", ["q"]));
  });

  it("changes when the surplus set changes", () => {
    expect(convenienceKey("known", ["q"])).not.toBe(convenienceKey("known", ["q", "x"]));
  });
});

describe("offeredKey", () => {
  it("returns a key when the candidate is offered (array form)", () => {
    expect(offeredKey("q", ["q", "x"])).toBe("offered|q");
  });

  it("returns a key when the candidate is offered (Set form)", () => {
    expect(offeredKey("q", new Set(["q", "x"]))).toBe("offered|q");
  });

  it("returns null when the candidate is not offered", () => {
    expect(offeredKey("z", ["q", "x"])).toBeNull();
    expect(offeredKey("z", new Set(["q", "x"]))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reconcile — the re-proposal view (R-03)
// ---------------------------------------------------------------------------

function saved(overrides: Partial<SavedAnswer> = {}): SavedAnswer {
  return {
    value: "kept",
    answerType: "text",
    origin: "confirmed",
    stage: "confirmed",
    evidenceKey: "k1",
    screenId: "screen-1",
    savedAt: 100,
    ...overrides,
  };
}

const REASON = { code: "evidence-added" as const, subject: "é", sourceStepId: "characters" };

describe("reconcile", () => {
  it("none saved -> proposed, carrying the proposal value", () => {
    const view = reconcile<string>(undefined, "k1", "proposal-value");
    expect(view).toEqual({ state: "proposed", value: "proposal-value" });
  });

  it("key matches -> current, with the SAVED value (not the proposal)", () => {
    const s = saved({ value: "author-value", evidenceKey: "k1" });
    const view = reconcile<string>(s, "k1", "proposal-value");
    expect(view).toEqual({ state: "current", value: "author-value", saved: s });
  });

  it("key mismatch, no adjust -> reproposed with the proposal and the given reason", () => {
    const s = saved({ evidenceKey: "k1" });
    const view = reconcile<string>(s, "k2", "proposal-value", undefined, REASON);
    expect(view).toEqual({
      state: "reproposed",
      value: "proposal-value",
      saved: s,
      reason: REASON,
    });
  });

  it("key mismatch, with adjust -> reproposed with adjust(saved, proposal) applied", () => {
    const s = saved({ value: "author-value", evidenceKey: "k1" });
    const adjust = (savedValue: string, proposal: string) => `${savedValue}+${proposal}`;
    const view = reconcile<string>(s, "k2", "proposal-value", adjust, REASON);
    expect(view).toEqual({
      state: "reproposed",
      value: "author-value+proposal-value",
      saved: s,
      reason: REASON,
    });
  });

  it("key mismatch with no explicit reason falls back to the unspecified reason shape", () => {
    const s = saved({ evidenceKey: "k1" });
    const view = reconcile<string>(s, "k2", "proposal-value");
    expect(view.state).toBe("reproposed");
    if (view.state !== "reproposed") return;
    expect(view.reason).toEqual({ code: "evidence-added", subject: "", sourceStepId: "" });
  });

  it("key restored to the saved key -> current with no flag (FR-014)", () => {
    const s = saved({ evidenceKey: "k1" });
    // Simulate: key changed away (reproposed), then changed back.
    const away = reconcile<string>(s, "k2", "proposal-value");
    expect(away.state).toBe("reproposed");
    const restored = reconcile<string>(s, "k1", "proposal-value");
    expect(restored).toEqual({ state: "current", value: s.value, saved: s });
  });

  it("confirm re-stamp (saved with current key) -> current", () => {
    // The author confirmed under the CURRENT evidence: the saved key already
    // equals the live key, so this is a "current" read, not a reproposal.
    const s = saved({ value: "confirmed-value", evidenceKey: "live-key" });
    const view = reconcile<string>(s, "live-key", "proposal-value");
    expect(view).toEqual({ state: "current", value: "confirmed-value", saved: s });
  });

  it("saved + null key -> inactive", () => {
    const s = saved({ evidenceKey: "k1" });
    const view = reconcile<string>(s, null, "proposal-value");
    expect(view).toEqual({ state: "inactive", value: s.value, saved: s });
  });

  it("inactive, then evidence restored (non-null key) -> current when the saved key matches again", () => {
    const s = saved({ evidenceKey: "k1" });
    const inactive = reconcile<string>(s, null, "proposal-value");
    expect(inactive.state).toBe("inactive");
    const restored = reconcile<string>(s, "k1", "proposal-value");
    expect(restored).toEqual({ state: "current", value: s.value, saved: s });
  });

  it("never mutates the saved answer it was given", () => {
    const s = saved({ evidenceKey: "k1" });
    const clone = JSON.parse(JSON.stringify(s)) as SavedAnswer;
    reconcile<string>(s, "k2", "proposal-value", (sv) => sv);
    reconcile<string>(s, null, "proposal-value");
    reconcile<string>(s, "k1", "proposal-value");
    expect(s).toEqual(clone);
  });
});
