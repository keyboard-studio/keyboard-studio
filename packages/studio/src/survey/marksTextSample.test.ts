// marksTextSample — the lifted text-sample prompt rules (spec 107 FR-040).

import { describe, it, expect, vi } from "vitest";
import { makeConfirmedAlphabet, confirmedAlphabetKey } from "@keyboard-studio/contracts";
import type { SourcedInventory } from "@keyboard-studio/engine";
import {
  TEXT_SAMPLE_PROMPT_ANSWER_ID,
  buildTextSampleInventory,
  confirmTextSample,
  isTextSamplePromptDismissed,
  proposeTextSample,
  proposeTextSampleInventory,
  textSampleMarksLabel,
  textSampleSkipAnswer,
} from "./marksTextSample.ts";

const { failing } = vi.hoisted(() => ({ failing: { value: false } }));

vi.mock("../lib/services.ts", async () => {
  const engine = await import("@keyboard-studio/engine");
  const nullLoader = async (): Promise<string | null> => null;
  const noopCompleter = async (): Promise<string> => {
    throw new Error("not called");
  };
  const realService = engine.createCharacterDiscoveryService(nullLoader, noopCompleter);
  return {
    getCharacterDiscoveryService: async () => {
      if (failing.value) throw new Error("chunk load failed");
      return realService;
    },
  };
});

const ACUTE = "́";
const GRAVE = "̀";

describe("proposeTextSample", () => {
  it("returns null when no marks lack pairing evidence", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(proposeTextSample(alphabet)).toBeNull();
  });

  it("returns null for an alphabet with no marks", () => {
    expect(proposeTextSample(makeConfirmedAlphabet({ bases: ["e"] }))).toBeNull();
  });

  it("lists the lacking marks in order and reports no prior sample", () => {
    const alphabet = makeConfirmedAlphabet({ bases: ["e"], marks: [ACUTE, GRAVE] });
    expect(proposeTextSample(alphabet)).toEqual({
      lackingMarks: [ACUTE, GRAVE],
      hadTextSample: false,
    });
  });

  it("reports a prior sample when any attested stack came from text", () => {
    const alphabet = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [{ base: "e", marks: [ACUTE], source: "text" }],
    });
    expect(proposeTextSample(alphabet)).toEqual({ lackingMarks: [GRAVE], hadTextSample: true });
  });
});

describe("textSampleMarksLabel", () => {
  it("joins the marks with spaces on carriers so bare marks are visible", () => {
    const label = textSampleMarksLabel([ACUTE, GRAVE]);
    expect(label.split(" ")).toHaveLength(2);
    expect(label).toContain(ACUTE);
    expect(label).toContain(GRAVE);
    expect(label).not.toBe(`${ACUTE} ${GRAVE}`);
  });
});

describe("skip answer and dismissal read-back", () => {
  const alphabet = makeConfirmedAlphabet({ bases: ["e"], marks: [ACUTE] });

  it("records skipped:<alphabet key> as a confirmed select on the prompt screen", () => {
    const { answerId, answer } = textSampleSkipAnswer(alphabet);
    const key = confirmedAlphabetKey(alphabet);
    expect(answerId).toBe(TEXT_SAMPLE_PROMPT_ANSWER_ID);
    expect(answer).toEqual({
      value: `skipped:${key}`,
      answerType: "select",
      origin: "confirmed",
      stage: "confirmed",
      evidenceKey: key,
      screenId: "text-sample-prompt",
    });
  });

  it("reads the dismissal back only for the same alphabet", () => {
    const { answer } = textSampleSkipAnswer(alphabet);
    expect(isTextSamplePromptDismissed(answer, alphabet)).toBe(true);
    const changed = makeConfirmedAlphabet({ bases: ["e", "a"], marks: [ACUTE] });
    expect(isTextSamplePromptDismissed(answer, changed)).toBe(false);
    expect(isTextSamplePromptDismissed(undefined, alphabet)).toBe(false);
  });
});

describe("buildTextSampleInventory", () => {
  it("attributes every character to the text sample at approved confidence", () => {
    const inv = buildTextSampleInventory([{ char: "a" }, { char: "b" }] as never);
    expect(inv.source).toBe("text");
    expect(inv.confidence).toBe("approved");
    expect(inv.characters.map((c) => c.char)).toEqual(["a", "b"]);
    expect(inv.characters.every((c) => c.tier === "main" && c.source === "text")).toBe(true);
    expect(inv.digraphs).toEqual([]);
  });
});

describe("proposeTextSampleInventory", () => {
  it("is empty for a blank sample without calling the service", async () => {
    expect(await proposeTextSampleInventory("   ")).toEqual({ status: "empty" });
  });

  it("proposes the harvested characters from a real sample", async () => {
    failing.value = false;
    const outcome = await proposeTextSampleInventory("abc abc");
    expect(outcome.status).toBe("proposal");
    if (outcome.status !== "proposal") return;
    const chars = outcome.proposal.characters.map((c) => c.char);
    expect(chars).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(outcome.proposal.source).toBe("text");
  });

  it("reports an error when the service cannot be loaded", async () => {
    failing.value = true;
    try {
      expect(await proposeTextSampleInventory("abc")).toEqual({ status: "error" });
    } finally {
      failing.value = false;
    }
  });
});

describe("confirmTextSample", () => {
  it("hands the proposal to the draft's seedFromProposal unchanged", () => {
    const seed = vi.fn();
    const proposal: SourcedInventory = buildTextSampleInventory([{ char: "a" }] as never);
    confirmTextSample(proposal, seed);
    expect(seed).toHaveBeenCalledExactlyOnceWith(proposal);
  });
});
