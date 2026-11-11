// Spec 111 T018: the editable language list (add / remove / reorder).

import { describe, expect, it } from "vitest";
import {
  addLanguage,
  moveLanguage,
  removeLanguage,
  replaceLanguageTag,
  tagFromChooserSummary,
  typedTagSummary,
} from "./LanguageListPanel.tsx";
import languageList from "../questions/gallery/languageList.ts";

const LIST = [{ tag: "bas", name: "Basaa" }, { tag: "ewo" }, { tag: "bkm" }] as const;

describe("language list operations", () => {
  it("adds a language at the end, trimming, and ignores blanks and duplicates", () => {
    expect(addLanguage(LIST, " fr ", "French").map((l) => l.tag)).toEqual(["bas", "ewo", "bkm", "fr"]);
    expect(addLanguage(LIST, "fr")[3]).toEqual({ tag: "fr" });
    expect(addLanguage(LIST, "  ")).toBe(LIST);
    expect(addLanguage(LIST, "BAS")).toBe(LIST);
  });

  it("removes by index", () => {
    expect(removeLanguage(LIST, 1).map((l) => l.tag)).toEqual(["bas", "bkm"]);
  });

  it("reorders up and down and refuses to move past either end", () => {
    expect(moveLanguage(LIST, 2, -1).map((l) => l.tag)).toEqual(["bas", "bkm", "ewo"]);
    expect(moveLanguage(LIST, 0, 1).map((l) => l.tag)).toEqual(["ewo", "bas", "bkm"]);
    expect(moveLanguage(LIST, 0, -1)).toBe(LIST);
    expect(moveLanguage(LIST, 2, 1)).toBe(LIST);
  });
});

describe("replacement fixes (spec 115 US4)", () => {
  it("replaces one row's tag, refusing a replacement already listed", () => {
    const next = replaceLanguageTag(LIST, 0, "fr-FR");
    expect(next.map((l) => l.tag)).toEqual(["fr-FR", "ewo", "bkm"]);
    expect(next[0]).toEqual({ tag: "fr-FR", name: "Basaa" });
    // The replacement is already listed (case-insensitively): no change.
    expect(replaceLanguageTag(LIST, 0, "EWO")).toBe(LIST);
    expect(replaceLanguageTag(LIST, 0, "  ")).toBe(LIST);
  });

  it("a chooser pick stands for its full tag", () => {
    // A bare language pick.
    expect(tagFromChooserSummary({ code: "fr", englishName: "French" })).toBe("fr");
    // A dialect-tag pick: variant rides after the language.
    expect(
      tagFromChooserSummary({
        code: "oc",
        englishName: "Occitan",
        match: { name: "Gascon", relation: "variety", source: "iana", dialectTag: "oc-gascon" },
      }),
    ).toBe("oc-gascon");
    // A private-use dialect tag, with a region from the pick's extras.
    expect(
      tagFromChooserSummary({
        code: "acr",
        englishName: "Achi",
        match: { name: "rabinal", relation: "dialect", source: "typed", dialectTag: "acr-x-rabinal" },
        extras: { region: { code: "GT", source: "its country" } },
      }),
    ).toBe("acr-GT-x-rabinal");
    // A script/region pick without a dialect tag.
    expect(
      tagFromChooserSummary({
        code: "zh",
        englishName: "Chinese",
        extras: { script: { script: "Hans", source: "the tag you typed" } },
      }),
    ).toBe("zh-Hans");
  });

  it("a typed-tag proposal reads as its registered name and parts", () => {
    expect(
      typedTagSummary({ language: "oc", dialectSubtag: "gascon", registeredName: "Occitan" }),
    ).toEqual({
      name: "Occitan",
      dialectSubtag: "gascon",
      unregistered: false,
      privateUse: false,
      extensionNotCarried: false,
    });
    expect(typedTagSummary({ language: "zzz", warning: "unregistered" })).toEqual({
      name: "zzz",
      unregistered: true,
      privateUse: false,
      extensionNotCarried: false,
    });
    expect(
      typedTagSummary({
        language: "qaa",
        privateUse: true,
        dialectSubtag: "x-mansim",
        region: "ID",
      }),
    ).toEqual({
      name: "qaa",
      dialectSubtag: "x-mansim",
      region: "ID",
      unregistered: false,
      privateUse: true,
      extensionNotCarried: false,
    });
  });
});

describe("language list module declaration", () => {
  it("provides the language-list decision on its own screen", () => {
    expect(languageList.provides).toEqual(["language-list"]);
    expect(languageList.screen).toBe("open_languages");
  });
});
