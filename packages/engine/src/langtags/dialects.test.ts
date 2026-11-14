// dialects.test — spec 115 T044 (US2, Wave 1).
//
// The langtags dialect tagsets for one language: the raw generated rows
// (data-model.md § DialectTagset), keyed on the canonical language subtag.

import { describe, expect, it } from "vitest";
import { dialectTagsetsFor } from "./dialects.js";

describe("dialectTagsetsFor", () => {
  it("returns the Rabinal tagset for Achi", () => {
    const tags = dialectTagsetsFor("acr").map((t) => t.tag);
    expect(tags).toContain("acr-x-rabinal");
    expect(tags).toContain("acr-x-cubulco");
    expect(dialectTagsetsFor("acr").find((t) => t.tag === "acr-x-rabinal")).toEqual({
      tag: "acr-x-rabinal",
      full: "acr-Latn-GT-x-rabinal",
      language: "acr",
      dialectSubtag: "x-rabinal",
      names: ["Achi", "Achi - Rabinal", "Aʼchaʼteem Achi", "Ch’a’teem Achi", "Qachʼaʼteem", "Qachʼaʼteem Achi"],
      localNames: ["Qachʼaʼteem", "Achi", "Ch'a'teem Achi"],
      variants: [],
      windows: "acr-Latn-x-rabinal",
    });
  });

  it("returns the Valencian tagset for Catalan, with its variant", () => {
    const row = dialectTagsetsFor("ca").find((t) => t.tag === "ca-valencia");
    expect(row).toBeDefined();
    expect(row?.dialectSubtag).toBe("valencia");
    expect(row?.variants).toEqual(["valencia"]);
  });

  it("returns [] for a language with no dialect tagsets", () => {
    expect(dialectTagsetsFor("oc")).toEqual([]);
    expect(dialectTagsetsFor("zzz")).toEqual([]);
  });

  it("canonicalises the language: the 639-3 code resolves like the bare subtag", () => {
    expect(dialectTagsetsFor("oci").map((t) => t.tag)).toEqual(
      dialectTagsetsFor("oc").map((t) => t.tag),
    );
    expect(dialectTagsetsFor("cat").map((t) => t.tag)).toContain("ca-valencia");
  });
});
