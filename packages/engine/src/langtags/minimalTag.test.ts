import { describe, expect, it } from "vitest";
import { parseBcp47 } from "@keyboard-studio/contracts";
import { tagsets } from "./generated/tagsets.js";
import { minimalTag, minimalTagOf } from "./minimalTag.js";

describe("minimalTag", () => {
  const rows: [string, Parameters<typeof minimalTag>[0], string][] = [
    ["ca + Latn + ES + valencia", { language: "ca", script: "Latn", region: "ES", variants: ["valencia"] }, "ca-valencia"],
    ["ca + Latn + AD + valencia", { language: "ca", script: "Latn", region: "AD", variants: ["valencia"] }, "ca-AD-valencia"],
    ["acr + GT + x-rabinal", { language: "acr", region: "GT", privateUse: ["rabinal"] }, "acr-x-rabinal"],
    ["sr + Latn + RS", { language: "sr", script: "Latn", region: "RS" }, "sr-Latn"],
    ["fr + Latn + CA", { language: "fr", script: "Latn", region: "CA" }, "fr-CA"],
    ["bfd + Latn + CM", { language: "bfd", script: "Latn", region: "CM" }, "bfd"],
    ["acr + x-rabinal", { language: "acr", privateUse: ["rabinal"] }, "acr-x-rabinal"],
    ["oc + FR + gascon", { language: "oc", region: "FR", variants: ["gascon"] }, "oc-gascon"],
    ["ewo + Arab", { language: "ewo", script: "Arab" }, "ewo-Arab"],
    [
      "en + US + u-co-phonebk",
      { language: "en", region: "US", extensions: [{ singleton: "u", subtags: ["co", "phonebk"] }] },
      "en-u-co-phonebk",
    ],
    ["cat + Latn", { language: "cat", script: "Latn" }, "ca"],
    ["qaa + ID + x-mansim", { language: "qaa", region: "ID", privateUse: ["mansim"] }, "qaa-ID-x-mansim"],
    ["qaa + PE + x-sechuran-olmos", { language: "qaa", region: "PE", privateUse: ["sechuran", "olmos"] }, "qaa-PE-x-sechuran-olmos"],
  ];
  for (const [name, choice, expected] of rows) {
    it(name, () => expect(minimalTag(choice)).toBe(expected));
  }
});

describe("minimalTagOf", () => {
  it("minimises a full tag", () => {
    expect(minimalTagOf("en-Latn-US")).toBe("en");
    expect(minimalTagOf("ca-Latn-ES-valencia")).toBe("ca-valencia");
    expect(minimalTagOf("fr-u-co-phonebk")).toBe("fr-u-co-phonebk");
    expect(minimalTagOf("en-US-x-twain")).toBe("en-x-twain");
  });
  it("returns null when the tag is not well-formed", () => {
    expect(minimalTagOf("not a tag")).toBeNull();
    expect(minimalTagOf("")).toBeNull();
  });
});

describe("SC-003: every langtags tagset round-trips to its own tag", () => {
  it("minimalTag(parse(full)) equals the tagset tag", () => {
    const failures: string[] = [];
    for (const [tag, full] of tagsets) {
      const parsed = parseBcp47(full);
      if (!parsed.ok) {
        failures.push(`${full}: unparseable`);
        continue;
      }
      const p = parsed.parts;
      const got = minimalTag({
        language: p.language,
        ...(p.script !== undefined ? { script: p.script } : {}),
        ...(p.region !== undefined ? { region: p.region } : {}),
        variants: p.variants,
        privateUse: p.privateUse,
        extensions: p.extensions,
      });
      if (got !== tag) failures.push(`${full}: ${got} != ${tag}`);
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(tagsets.length).toBe(9596);
  });
});
