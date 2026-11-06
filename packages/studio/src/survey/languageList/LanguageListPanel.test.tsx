// Spec 111 T018: the editable language list (add / remove / reorder).

import { describe, expect, it } from "vitest";
import { addLanguage, moveLanguage, removeLanguage } from "./LanguageListPanel.tsx";
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

describe("language list module declaration", () => {
  it("provides the language-list decision on its own screen", () => {
    expect(languageList.provides).toEqual(["language-list"]);
    expect(languageList.screen).toBe("open_languages");
  });
});
