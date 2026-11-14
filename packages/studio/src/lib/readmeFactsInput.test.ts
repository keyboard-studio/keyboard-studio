// readmeFactsInputFrom (spec 110): the store-reading half of the README facts.
// The output projection and the live docs preview both call it (FR-012), so
// these tests pin the mapping from recorded decisions + working-copy fields to
// ReadmeFactsInput directly, rather than only through those two callers.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS, type HelpDocsAnswers, type VirtualFS } from "@keyboard-studio/contracts";
import type { Decision, DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { saveLayoutFamilyAnswer } from "./layoutFamily.ts";
import { markInputOrderFromDecisions, readmeFactsInputFrom, type ReadmeFactsSources } from "./readmeFactsInput.ts";

const START = { id: "basic_kbdus", displayName: "US English", script: "Latn" };

function decided(values: Partial<Record<DecisionId, unknown>>): DecisionSet {
  const set: Partial<Record<DecisionId, Decision<unknown>>> = {};
  for (const [id, value] of Object.entries(values) as [DecisionId, unknown][]) {
    set[id] = { id, value, provenance: "asked" };
  }
  return set;
}

function sources(overrides: Partial<ReadmeFactsSources> = {}): ReadmeFactsSources {
  return {
    ir: null,
    touchLayout: null,
    decisions: {},
    isAdaptation: false,
    startKeyboard: START,
    carveChars: new Set(),
    fallbackPolicy: "swallow",
    helpDocs: null,
    startVfs: null,
    startReadmeMdText: null,
    ...overrides,
  };
}

function kpsVfs(id: string, description: string): VirtualFS {
  const kps = `<Package><Info><Name URL="">Start</Name><Description URL="">${description}</Description></Info></Package>`;
  return createVirtualFS([{ path: `source/${id}.kps`, content: kps, isBinary: false }]);
}

const START_README = "# Start Keyboard\n\nCopyright (C) SIL Global\n\n## Description\n\nDescription from the README.\n";

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
  useDecisionStore.getState().reset();
});

describe("languages", () => {
  it("names the language only when both the tag and the confirmed name are present", () => {
    expect(readmeFactsInputFrom(sources({ primaryBcp47: "fr" })).languages).toEqual([]);
    expect(readmeFactsInputFrom(sources({ languageName: "French" })).languages).toEqual([]);
    expect(readmeFactsInputFrom(sources({ primaryBcp47: "  ", languageName: "French" })).languages).toEqual([]);
    expect(readmeFactsInputFrom(sources({ primaryBcp47: " fr ", languageName: " French " })).languages).toEqual([
      { tag: "fr", name: "French" },
    ]);
  });

  it("adds the autonym decision, trimmed, to the named language", () => {
    const input = readmeFactsInputFrom(
      sources({ primaryBcp47: "fr", languageName: "French", decisions: decided({ "language-autonym": " français " }) }),
    );
    expect(input.languages).toEqual([{ tag: "fr", name: "French", autonym: "français" }]);
  });
});

describe("decisions", () => {
  it("carries string decisions through trimmed", () => {
    const input = readmeFactsInputFrom(
      sources({
        decisions: decided({
          "use-case": " everyday typing ",
          "mark-input-order": "after-base",
          "touch-seed-source": "desktop",
        }),
      }),
    );
    expect(input.useCase).toBe("everyday typing");
    expect(input.markInputOrder).toBe("after-base");
    expect(input.touchSeedSource).toBe("desktop");
  });

  it("omits blank and non-string decisions rather than passing them as empty", () => {
    const input = readmeFactsInputFrom(
      sources({ decisions: decided({ "use-case": "   ", "mark-input-order": 3, "touch-seed-source": null }) }),
    );
    expect(input).not.toHaveProperty("useCase");
    expect(input).not.toHaveProperty("markInputOrder");
    expect(input).not.toHaveProperty("touchSeedSource");
  });

  it("reads the layout family from the answer store", () => {
    expect(readmeFactsInputFrom(sources())).not.toHaveProperty("layoutFamily");
    saveLayoutFamilyAnswer("azerty");
    expect(readmeFactsInputFrom(sources()).layoutFamily).toBe("azerty");
  });

  it("narrows the mark-input-order decision to the two valid answers", () => {
    expect(markInputOrderFromDecisions(decided({ "mark-input-order": "postfix" }))).toBe("postfix");
    expect(markInputOrderFromDecisions(decided({ "mark-input-order": "prefix" }))).toBe("prefix");
    expect(markInputOrderFromDecisions(decided({ "mark-input-order": "after-base" }))).toBeUndefined();
    expect(markInputOrderFromDecisions(decided({ "mark-input-order": "   " }))).toBeUndefined();
    expect(markInputOrderFromDecisions(decided({}))).toBeUndefined();
  });

  it("passes the design rationale from the help-docs answers", () => {
    const helpDocs = { designRationale: "Mirrors the national standard." } as HelpDocsAnswers;
    expect(readmeFactsInputFrom(sources({ helpDocs })).designRationale).toBe("Mirrors the national standard.");
    expect(readmeFactsInputFrom(sources())).not.toHaveProperty("designRationale");
  });
});

describe("working-copy fields", () => {
  it("passes the IR-side fields through unchanged", () => {
    const carveChars = new Set(["é"]);
    const input = readmeFactsInputFrom(sources({ carveChars, fallbackPolicy: "swallow" }));
    expect(input.carveChars).toBe(carveChars);
    expect(input.fallbackPolicy).toBe("swallow");
    expect(input.ir).toBeNull();
    expect(input.touchLayout).toBeNull();
  });

  it("passes the recorded output form through, and omits it when none was recorded", () => {
    expect(readmeFactsInputFrom(sources({ outputForm: "base-plus-mark" })).outputForm).toBe("base-plus-mark");
    expect(readmeFactsInputFrom(sources({ outputForm: "ready-made" })).outputForm).toBe("ready-made");
    expect(readmeFactsInputFrom(sources())).not.toHaveProperty("outputForm");
  });

  it("takes the script and display name from the starting keyboard", () => {
    const input = readmeFactsInputFrom(sources());
    expect(input.script).toBe("Latn");
    expect(input.startKeyboard).toEqual({ displayName: "US English" });
  });

  it("omits the script and nulls the starting keyboard when there is none", () => {
    const input = readmeFactsInputFrom(sources({ startKeyboard: null }));
    expect(input).not.toHaveProperty("script");
    expect(input.startKeyboard).toBeNull();
  });
});

describe("Track 2 fallback description", () => {
  it("is never set on Track 1, even with description sources present", () => {
    const input = readmeFactsInputFrom(
      sources({ isAdaptation: false, startVfs: kpsVfs(START.id, "From the kps."), startReadmeMdText: START_README }),
    );
    expect(input.isAdaptation).toBe(false);
    expect(input).not.toHaveProperty("fallbackDescription");
  });

  it("prefers the starting point's .kps description", () => {
    const input = readmeFactsInputFrom(
      sources({ isAdaptation: true, startVfs: kpsVfs(START.id, "  From the kps.  "), startReadmeMdText: START_README }),
    );
    expect(input.fallbackDescription).toBe("From the kps.");
  });

  it("falls back to the starting point's README when the .kps description is blank", () => {
    const input = readmeFactsInputFrom(
      sources({ isAdaptation: true, startVfs: kpsVfs(START.id, ""), startReadmeMdText: START_README }),
    );
    expect(input.fallbackDescription).toBe("Description from the README.");
  });

  it("falls back to the README when the VFS has no .kps for the starting keyboard", () => {
    const input = readmeFactsInputFrom(
      sources({ isAdaptation: true, startVfs: kpsVfs("other_id", "Wrong keyboard."), startReadmeMdText: START_README }),
    );
    expect(input.fallbackDescription).toBe("Description from the README.");
  });

  it("is absent when neither source yields a description", () => {
    const input = readmeFactsInputFrom(sources({ isAdaptation: true }));
    expect(input).not.toHaveProperty("fallbackDescription");
  });
});
