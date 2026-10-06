// SC-001 evidence: the il_language_english extractor over regional / script
// catalog tags (zh-Hant, sr-Latn, pt-BR) and the langtags-not-loaded fallback.
//
// Regional and script tags strip to the language subtag, which then resolves to
// its English name through the langtags dataset (buildExtractContext's
// resolveLanguageName). `getLoadedLangtags()` is a one-way latch (the module
// cannot be unloaded), so the not-loaded case MUST run before anything calls
// loadLangtags(); it is first in this file and asserts the precondition.

import { describe, it, expect, beforeAll } from "vitest";
import { makeBaseKeyboard } from "@keyboard-studio/contracts";
import { getLoadedLangtags, loadLangtags } from "../lib/langtagsDefaults.ts";
import { extractLanguageName } from "../survey/questions/a/il_language_english.ts";
import { buildExtractContext } from "./extractContext.ts";

function catalogWith(languages: string[]) {
  return makeBaseKeyboard({
    id: "test_kbd",
    script: "Latn",
    path: "release/t/test_kbd",
    targets: ["windows"],
    displayName: "test_kbd",
    version: "1.0",
    languages,
  });
}

describe("il_language_english extraction: langtags not loaded", () => {
  it("falls back to undefined (ask the author) rather than guessing a name", () => {
    expect(getLoadedLangtags(), "precondition: langtags not yet loaded").toBeNull();
    const ctx = buildExtractContext(null, catalogWith(["pt-BR"]));
    expect(ctx.resolveLanguageName?.("pt")).toBeUndefined();
    expect(extractLanguageName(ctx)).toBeUndefined();
  });

  it("is undefined when there is no catalog or IR language tag at all", () => {
    expect(extractLanguageName(buildExtractContext(null, null))).toBeUndefined();
  });
});

describe("il_language_english extraction: regional and script tags (langtags loaded)", () => {
  beforeAll(async () => {
    await loadLangtags();
  });

  it.each([
    ["zh-Hant", "zh"],
    ["sr-Latn", "sr"],
    ["pt-BR", "pt"],
  ])("%s is stripped to the bare subtag %s before the langtags lookup", (tag, bare) => {
    const seen: string[] = [];
    const ctx = {
      ir: null,
      catalog: catalogWith([tag]),
      resolveLanguageName: (subtag: string) => {
        seen.push(subtag);
        return "Resolved";
      },
    };
    expect(extractLanguageName(ctx)).toBe("Resolved");
    expect(seen).toEqual([bare]);
  });

  it.each([
    ["sr-Latn", "sr", /Serbian/],
    ["pt-BR", "pt", /Portuguese/],
  ])("%s resolves through the real dataset to the same name as bare %s", (tag, bare, expected) => {
    const name = (t: string) => extractLanguageName(buildExtractContext(null, catalogWith([t])));
    expect(name(tag)).toMatch(expected);
    expect(name(tag)).toBe(name(bare));
  });

  it("zh-Hant: the shipped langtags index has no bare 'zh' row, so the author is asked (documented fallback, not a mis-resolution)", () => {
    // The strip is correct (pinned above); the gap is dataset coverage of the
    // macrolanguage code. If a future langtags pin adds a zh row this flips,
    // and the expectation should become /Chinese/.
    const ctx = buildExtractContext(null, catalogWith(["zh-Hant"]));
    expect(ctx.resolveLanguageName?.("zh")).toBeUndefined();
    expect(extractLanguageName(ctx)).toBeUndefined();
  });

  it("an unknown language subtag yields undefined, not the raw tag", () => {
    expect(extractLanguageName(buildExtractContext(null, catalogWith(["qqq-ZZ"])))).toBeUndefined();
  });
});
