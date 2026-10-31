import { describe, expect, it, vi } from "vitest";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { ExemplarInventory } from "../lib/services.ts";
import {
  buildListDoneDisabled,
  buildListDoneResult,
  charactersCompletion,
  continueFromIntro,
  remapPostureAnswer,
  resolveIntroSelection,
  restampFlaggedAdditions,
  savedRemapChoiceOf,
  shouldPromptTextSample,
} from "./charactersStepRules.ts";

const OFFER = { resolvedTag: "x", source: "sldr", confidence: "approved", characters: [], digraphs: [] } as unknown as ExemplarInventory;

describe("resolveIntroSelection", () => {
  it("pre-selects the exemplars only when an offer exists, was not declined, and has loaded", () => {
    const base = { authorChoice: null, loading: false, offerExemplars: true, declinedBefore: false } as const;
    expect(resolveIntroSelection(base)).toBe("exemplars");
    expect(resolveIntroSelection({ ...base, loading: true })).toBe("build-list");
    expect(resolveIntroSelection({ ...base, offerExemplars: false })).toBe("build-list");
    expect(resolveIntroSelection({ ...base, declinedBefore: true })).toBe("build-list");
  });

  it("honours the author choice, falling back when exemplars are chosen without an offer", () => {
    const base = { loading: false, offerExemplars: true, declinedBefore: false } as const;
    expect(resolveIntroSelection({ ...base, authorChoice: "manual" })).toBe("manual");
    expect(resolveIntroSelection({ ...base, offerExemplars: false, authorChoice: "exemplars" })).toBe("build-list");
  });
});

describe("continueFromIntro", () => {
  const deps = () => ({
    record: vi.fn(),
    seedFromProposal: vi.fn(),
    declineExemplarMethod: vi.fn(),
    onChoose: vi.fn(),
  });

  it("records the resolved method, seeds the offer and lands on the build list", () => {
    const d = deps();
    continueFromIntro("exemplars", OFFER, "bfd-Latn", d);
    expect(d.record).toHaveBeenCalledWith("intro", [
      { questionId: "phaseB.discoveryMethod", answerType: "select", value: "build-list" },
    ]);
    expect(d.seedFromProposal).toHaveBeenCalledWith(OFFER, "bfd-Latn");
    expect(d.onChoose).toHaveBeenCalledWith("build-list");
    expect(d.declineExemplarMethod).not.toHaveBeenCalled();
  });

  it("remembers a decline only when an offer was available", () => {
    const withOffer = deps();
    continueFromIntro("manual", OFFER, "bfd-Latn", withOffer);
    expect(withOffer.declineExemplarMethod).toHaveBeenCalledTimes(1);
    expect(withOffer.onChoose).toHaveBeenCalledWith("manual");

    const noOffer = deps();
    continueFromIntro("build-list", null, "bfd-Latn", noOffer);
    expect(noOffer.declineExemplarMethod).not.toHaveBeenCalled();
    expect(noOffer.seedFromProposal).not.toHaveBeenCalled();
  });
});

describe("buildListDoneResult", () => {
  it("records each cased letter counterpart too, behind the casing gate", () => {
    const cased = buildListDoneResult({ chars: ["a"], loanwordChars: [], exemplarDigraphs: [], bcp47: "en", isCasedBase: true });
    expect(cased.confirmedInventory).toEqual(["a", "A"]);
    const caseless = buildListDoneResult({ chars: ["a"], loanwordChars: [], exemplarDigraphs: [], bcp47: "en", isCasedBase: false });
    expect(caseless.confirmedInventory).toEqual(["a"]);
  });

  it("always emits loanwordChars and only emits attestedDigraphs when there are some", () => {
    const none = buildListDoneResult({ chars: ["a"], loanwordChars: [], exemplarDigraphs: [], bcp47: undefined, isCasedBase: false });
    expect(none.loanwordChars).toEqual([]);
    expect("attestedDigraphs" in none).toBe(false);
    const some = buildListDoneResult({ chars: ["a"], loanwordChars: ["q"], exemplarDigraphs: ["dz"], bcp47: undefined, isCasedBase: false });
    expect(some.confirmedInventory).toEqual(["a", "q"]);
    expect(some.attestedDigraphs).toEqual(["dz"]);
  });

  it("disables Continue for an empty alphabet only", () => {
    expect(buildListDoneDisabled(0)).toBe(true);
    expect(buildListDoneDisabled(1)).toBe(false);
  });
});

describe("restampFlaggedAdditions", () => {
  it("re-stamps only additions saved under another evidence key", () => {
    const saveAnswer = vi.fn();
    const answers = {
      "characters.addition.q": { value: "q", answerType: "char-list", origin: "confirmed", stage: "confirmed", evidenceKey: "old", screenId: "build-list", savedAt: 0 },
      "characters.addition.z": { value: "z", answerType: "char-list", origin: "confirmed", stage: "confirmed", evidenceKey: "new", screenId: "build-list", savedAt: 0 },
    };
    restampFlaggedAdditions({ answers: answers as never, evidenceKey: "new", saveAnswer });
    expect(saveAnswer).toHaveBeenCalledTimes(1);
    expect(saveAnswer.mock.calls[0]![1]).toBe("characters.addition.q");
    expect(saveAnswer.mock.calls[0]![2]).toMatchObject({ evidenceKey: "new", value: "q" });
  });
});

describe("remap posture", () => {
  it("shows nothing when the derivation does not fire; else the choice, then the restored one, then the derived", () => {
    expect(remapPostureAnswer({ derived: undefined, chosen: "full-remap", saved: "addition" })).toBeUndefined();
    expect(remapPostureAnswer({ derived: "addition", chosen: "full-remap", saved: undefined })).toBe("full-remap");
    expect(remapPostureAnswer({ derived: "addition", chosen: null, saved: "full-remap" })).toBe("full-remap");
    expect(remapPostureAnswer({ derived: "addition", chosen: null, saved: undefined })).toBe("addition");
  });

  it("restores a saved choice only for the current evidence key", () => {
    expect(savedRemapChoiceOf({ value: "full-remap", evidenceKey: "k" }, "k")).toBe("full-remap");
    expect(savedRemapChoiceOf({ value: "full-remap", evidenceKey: "k" }, "other")).toBeUndefined();
    expect(savedRemapChoiceOf({ value: "bogus", evidenceKey: "k" }, "k")).toBeUndefined();
  });
});

describe("charactersCompletion", () => {
  const result: SurveyPhaseResult = { phase: "B", answers: [], confirmedInventory: ["a"] };
  const empty = makeConfirmedAlphabet({ bases: [], marks: [], attestedStacks: [], declaredRoles: {} });

  it("attaches the alphabet only when the draft holds any, and the remap axis when derived", () => {
    expect(charactersCompletion(result, empty, undefined)).toBe(result);
    const filled = makeConfirmedAlphabet({ bases: ["a"], marks: [], attestedStacks: [], declaredRoles: {} });
    const out = charactersCompletion(result, filled, "addition");
    expect(out.alphabet).toBe(filled);
    expect(out.computedAxes?.remapPosture).toBe("addition");
  });

  it("strips a stale posture when the derivation no longer fires", () => {
    const stale: SurveyPhaseResult = { ...result, computedAxes: { remapPosture: "full-remap" } };
    expect(charactersCompletion(stale, empty, undefined).computedAxes?.remapPosture).toBeUndefined();
  });
});

describe("shouldPromptTextSample", () => {
  const lacking = makeConfirmedAlphabet({ bases: ["a"], marks: ["́"], attestedStacks: [], declaredRoles: {} });
  const covered = makeConfirmedAlphabet({ bases: ["a"], marks: [], attestedStacks: [], declaredRoles: {} });

  it("opens only for marks without pairing evidence that were not dismissed for this alphabet", () => {
    expect(shouldPromptTextSample(covered, undefined)).toBe(false);
    expect(shouldPromptTextSample(lacking, undefined)).toBe(true);
    expect(shouldPromptTextSample(lacking, { value: "something else" })).toBe(true);
  });
});
