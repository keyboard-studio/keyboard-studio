// Tests for the live extraction pass (spec 092 T011): the merge rules of
// contracts/live-extraction.md, exercised over stub modules and a fake
// store — seed-unanswered, offered-on-answered, validate-rejects-are-
// absent, missing-values-write-nothing, gated-off skipped, throwing
// extract names its module, idempotent second run.

import { describe, it, expect } from "vitest";
import type { BaseKeyboard, KeyboardIR } from "@keyboard-studio/contracts";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { runLiveExtraction, type LiveExtractionStore } from "./liveExtraction.ts";

function fixtureIR(overrides: Partial<KeyboardIR["header"]> = {}): KeyboardIR {
  return {
    origin: "imported",
    header: {
      keyboardId: "basic_kbdfr",
      name: "French Basic",
      bcp47: ["fr"],
      copyright: "(c) 2009-2019 SIL International",
      version: "1.0",
      targets: ["windows"],
      storeDirectives: [],
      ...overrides,
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}

function fixtureCatalog(): BaseKeyboard {
  return {
    id: "basic_kbdfr",
    path: "release/basic/basic_kbdfr",
    script: "Latn",
    targets: ["windows"],
    displayName: "French Basic",
    version: "1.0",
    languages: ["fr"],
  };
}

function ctx(overrides: Partial<ExtractContext> = {}): ExtractContext {
  return { ir: fixtureIR(), catalog: fixtureCatalog(), ...overrides };
}

function stubModule(
  id: string,
  opts: Partial<QuestionModule> = {},
): QuestionModule {
  return {
    definition: { id, type: "text" },
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    ...opts,
  };
}

function fakeStore(initial: DecisionSet = {}): LiveExtractionStore & { decisions: DecisionSet } {
  const state: { decisions: DecisionSet } = { decisions: { ...initial } };
  return {
    get decisions() {
      return state.decisions;
    },
    recordAll(rs: readonly Decision[]) {
      const next: Record<string, Decision<unknown>> = { ...state.decisions };
      for (const r of rs) next[r.id] = r as Decision<unknown>;
      state.decisions = next;
    },
  };
}

describe("runLiveExtraction — seeding", () => {
  it("seeds an unanswered decision from extract, with the catalog id as source", () => {
    const mod = stubModule("il_copyright_holder", {
      provides: ["copyright-holder"],
      extract: (c) => c.ir?.header.copyright,
    });
    const store = fakeStore();
    const result = runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(result.seeded).toEqual(["copyright-holder"]);
    expect(result.offered).toEqual([]);
    expect(store.decisions["copyright-holder"]).toEqual({
      id: "copyright-holder",
      value: "(c) 2009-2019 SIL International",
      provenance: "extracted",
      source: "basic_kbdfr",
    });
  });

  it("falls back to the IR header for the source when there is no catalog entry", () => {
    const mod = stubModule("m", {
      provides: ["copyright-holder"],
      extract: () => "X",
    });
    const store = fakeStore();
    runLiveExtraction({ modules: [mod], ctx: ctx({ catalog: null }), store });
    expect(store.decisions["copyright-holder"]?.source).toBe("basic_kbdfr");
  });

  it("seeds a lookup default with default provenance and the lookup's named source", () => {
    const mod = stubModule("il_language_autonym", {
      provides: ["language-autonym"],
      extract: () => undefined,
      lookupDefault: () => ({ value: "Français", source: "langtags" }),
    });
    const store = fakeStore();
    const result = runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(result.seeded).toEqual(["language-autonym"]);
    expect(store.decisions["language-autonym"]).toEqual({
      id: "language-autonym",
      value: "Français",
      provenance: "default",
      source: "langtags",
    });
  });

  it("an extracted value beats a lookup default for the same module", () => {
    const mod = stubModule("m", {
      provides: ["copyright-holder"],
      extract: () => "from the keyboard",
      lookupDefault: () => ({ value: "from a lookup", source: "identity" }),
    });
    const store = fakeStore();
    runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(store.decisions["copyright-holder"]?.value).toBe("from the keyboard");
    expect(store.decisions["copyright-holder"]?.provenance).toBe("extracted");
  });

  it("snapshots the module's requires values into the seeded record's inputs", () => {
    const holder = stubModule("il_copyright_holder", {
      provides: ["copyright-holder"],
      requires: ["author-name", "authoring-track"],
      extract: () => "(c) X",
    });
    const store = fakeStore({
      "author-name": { id: "author-name", value: "Test Author", provenance: "asked" },
      "authoring-track": { id: "authoring-track", value: "adapt", provenance: "asked" },
    });
    const authorName = stubModule("il_author_name", { provides: ["author-name"] });
    const track = stubModule("track_choice", { provides: ["authoring-track"] });
    runLiveExtraction({ modules: [authorName, track, holder], ctx: ctx(), store });
    expect(store.decisions["copyright-holder"]?.inputs).toEqual({
      "author-name": "Test Author",
      "authoring-track": "adapt",
    });
  });
});

describe("runLiveExtraction — answered decisions are never overwritten", () => {
  it("places the extracted value in offered and leaves the answer byte-unchanged", () => {
    const mod = stubModule("il_copyright_holder", {
      provides: ["copyright-holder"],
      extract: () => "(c) 2009-2019 SIL International",
    });
    const answer: Decision = {
      id: "copyright-holder",
      value: "My Own Holder",
      provenance: "asked",
      step: "identity",
    };
    const store = fakeStore({ "copyright-holder": answer });
    const result = runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(result.seeded).toEqual([]);
    expect(result.offered).toEqual(["copyright-holder"]);
    const record = store.decisions["copyright-holder"];
    expect(record?.value).toBe("My Own Holder");
    expect(record?.provenance).toBe("asked");
    expect(record?.step).toBe("identity");
    expect(record?.offered).toBe("(c) 2009-2019 SIL International");
  });

  it("an extracted value identical to the answer is not offered", () => {
    const mod = stubModule("m", {
      provides: ["copyright-holder"],
      extract: () => "Same",
    });
    const store = fakeStore({
      "copyright-holder": { id: "copyright-holder", value: "Same", provenance: "asked" },
    });
    const result = runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(result.offered).toEqual([]);
    expect(store.decisions["copyright-holder"]?.offered).toBeUndefined();
  });
});

describe("runLiveExtraction — absence and rejection", () => {
  it("a validate-rejected extract is treated as absent", () => {
    const mod = stubModule("m", {
      provides: ["copyright-holder"],
      extract: () => "bad",
      validate: () => ({ ok: false, code: "nope", message: "rejected" }),
    });
    const store = fakeStore();
    const result = runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(result.seeded).toEqual([]);
    expect(store.decisions["copyright-holder"]).toBeUndefined();
  });

  it("a module with no extracted value and no default writes nothing", () => {
    const mod = stubModule("m", {
      provides: ["copyright-holder"],
      extract: () => undefined,
    });
    const store = fakeStore();
    const result = runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(result).toEqual({ seeded: [], offered: [] });
    expect(store.decisions).toEqual({});
  });

  it("skips a gated-off module", () => {
    const src = stubModule("src", {
      provides: ["target-script"],
      definition: {
        id: "src",
        type: "text",
        next: [
          { condition: "value == 'Ethi'", goto: "gated_q" },
          { default: true, goto: "other_q" },
        ],
      },
    });
    const gated = stubModule("gated_q", {
      provides: ["language-name"],
      extract: () => "should not seed",
    });
    const other = stubModule("other_q", {});
    const store = fakeStore({
      "target-script": { id: "target-script", value: "Latn", provenance: "asked" },
    });
    const result = runLiveExtraction({ modules: [src, gated, other], ctx: ctx(), store });
    expect(result.seeded).not.toContain("language-name");
    expect(store.decisions["language-name"]).toBeUndefined();
  });

  it("skips a module whose seedWhen disposition rejects the current decisions", () => {
    const mod = stubModule("il_copyright_holder", {
      provides: ["copyright-holder"],
      extract: () => "(c) X",
      seedWhen: (decisions) => decisions["authoring-track"]?.value === "adapt",
    });
    const store = fakeStore({
      "authoring-track": { id: "authoring-track", value: "copy", provenance: "asked" },
    });
    const result = runLiveExtraction({ modules: [mod], ctx: ctx(), store });
    expect(result.seeded).toEqual([]);
    expect(store.decisions["copyright-holder"]).toBeUndefined();
  });
});

describe("runLiveExtraction — failure and idempotence", () => {
  it("a throwing extract aborts the pass naming its module, and writes nothing", () => {
    const good = stubModule("good", {
      provides: ["language-name"],
      extract: () => "Français",
    });
    const bad = stubModule("bad_module", {
      provides: ["copyright-holder"],
      extract: () => {
        throw new Error("boom");
      },
    });
    const store = fakeStore();
    expect(() =>
      runLiveExtraction({ modules: [good, bad], ctx: ctx(), store }),
    ).toThrow(/bad_module/);
    // Atomic: even the good module's seed was not flushed.
    expect(store.decisions).toEqual({});
  });

  it("a second run over the same store and bundle is idempotent", () => {
    const holder = stubModule("il_copyright_holder", {
      provides: ["copyright-holder"],
      extract: () => "(c) X",
    });
    const autonym = stubModule("il_language_autonym", {
      provides: ["language-autonym"],
      lookupDefault: () => ({ value: "Français", source: "langtags" }),
    });
    const store = fakeStore({
      "author-name": { id: "author-name", value: "Test Author", provenance: "asked" },
    });
    runLiveExtraction({ modules: [holder, autonym], ctx: ctx(), store });
    const afterFirst = store.decisions;
    runLiveExtraction({ modules: [holder, autonym], ctx: ctx(), store });
    expect(store.decisions).toEqual(afterFirst);
  });
});
