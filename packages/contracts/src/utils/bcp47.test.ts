/**
 * Unit tests for the BCP47 parser (spec 115, contracts/bcp47-parser.md) and
 * the script/region readers built on it. Rows mirror the contract table.
 * Script and region are read only before the first variant, extension or
 * private-use subtag (FR-024).
 */

import { describe, it, expect } from "vitest";
import {
  parseBcp47,
  formatBcp47,
  isWellFormedBcp47,
  scriptSubtagOf,
  regionSubtagOf,
  resolveEffectiveScript,
} from "./bcp47.js";

function parts(tag: string) {
  const r = parseBcp47(tag);
  if (!r.ok) throw new Error(`expected ${tag} to parse, got ${r.reason} at ${r.at}`);
  return r.parts;
}

describe("parseBcp47", () => {
  it("oc-gascon: language oc, variants [gascon]", () => {
    const p = parts("oc-gascon");
    expect(p.language).toBe("oc");
    expect(p.variants).toEqual(["gascon"]);
  });

  it("ca-ES-valencia: language, region and variant", () => {
    const p = parts("ca-ES-valencia");
    expect(p.language).toBe("ca");
    expect(p.region).toBe("ES");
    expect(p.variants).toEqual(["valencia"]);
  });

  it("sl-rozaj-biske keeps variant order as written", () => {
    expect(parts("sl-rozaj-biske").variants).toEqual(["rozaj", "biske"]);
  });

  it("sl-rozaj-rozaj: duplicate-variant at 2", () => {
    const r = parseBcp47("sl-rozaj-rozaj");
    expect(r).toMatchObject({ ok: false, reason: "duplicate-variant", at: 2 });
  });

  it("sq-AL-gheg: bad-subtag at 2", () => {
    const r = parseBcp47("sq-AL-gheg");
    expect(r).toMatchObject({ ok: false, reason: "bad-subtag", at: 2 });
  });

  it("en-US-x-twain: region US, privateUse [twain]", () => {
    const p = parts("en-US-x-twain");
    expect(p.region).toBe("US");
    expect(p.privateUse).toEqual(["twain"]);
  });

  it("buu-x-koya: privateUse [koya]", () => {
    expect(parts("buu-x-koya").privateUse).toEqual(["koya"]);
  });

  it("lif-x-Deva: privateUse [deva] (lowercased)", () => {
    expect(parts("lif-x-Deva").privateUse).toEqual(["deva"]);
  });

  it("en-u-co-phon: extensions [{u,[co,phon]}]", () => {
    expect(parts("en-u-co-phon").extensions).toEqual([{ singleton: "u", subtags: ["co", "phon"] }]);
  });

  it("fr-u-co-phonebk: extensions [{u,[co,phonebk]}]", () => {
    expect(parts("fr-u-co-phonebk").extensions).toEqual([{ singleton: "u", subtags: ["co", "phonebk"] }]);
  });

  it("zh-yue-HK: language zh, extlang [yue], region HK", () => {
    const p = parts("zh-yue-HK");
    expect(p.language).toBe("zh");
    expect(p.extlang).toEqual(["yue"]);
    expect(p.region).toBe("HK");
  });

  it("qaa-x-foo: language qaa, privateUse [foo]", () => {
    const p = parts("qaa-x-foo");
    expect(p.language).toBe("qaa");
    expect(p.privateUse).toEqual(["foo"]);
  });

  it("x-whatever: empty language, privateUse [whatever]", () => {
    const p = parts("x-whatever");
    expect(p.language).toBe("");
    expect(p.privateUse).toEqual(["whatever"]);
  });

  it("i-klingon: grandfathered", () => {
    expect(parts("i-klingon").grandfathered).toBe("i-klingon");
  });

  it("BFD-latn-cm parses with script and region", () => {
    const p = parts("BFD-latn-cm");
    expect(p.script).toBeDefined();
    expect(p.region).toBeDefined();
  });

  it("empty string: error empty", () => {
    expect(parseBcp47("")).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("formatBcp47", () => {
  it("BFD-latn-cm formats to bfd-Latn-CM", () => {
    expect(formatBcp47(parts("BFD-latn-cm"))).toBe("bfd-Latn-CM");
  });

  it("is idempotent and only changes case", () => {
    for (const t of ["oc-gascon", "ca-ES-valencia", "sl-rozaj-biske", "en-US-x-twain", "en-u-co-phon", "zh-yue-HK", "x-whatever", "BFD-latn-cm"]) {
      const once = formatBcp47(parts(t));
      expect(formatBcp47(parts(once))).toBe(once);
      expect(once.toLowerCase()).toBe(t.toLowerCase());
    }
  });

  it("never reorders variants", () => {
    expect(formatBcp47(parts("sl-rozaj-biske"))).toBe("sl-rozaj-biske");
  });
});

describe("isWellFormedBcp47", () => {
  it("is true exactly when parseBcp47 is ok", () => {
    for (const t of ["oc-gascon", "x-whatever", "i-klingon", "qaa-x-foo"]) {
      expect(isWellFormedBcp47(t)).toBe(true);
    }
    for (const t of ["", "sl-rozaj-rozaj", "sq-AL-gheg"]) {
      expect(isWellFormedBcp47(t)).toBe(false);
    }
  });
});

describe("scriptSubtagOf", () => {
  it("returns the script subtag when present immediately after the primary", () => {
    expect(scriptSubtagOf("az-Latn")).toBe("Latn");
  });

  it("normalizes casing to title-case", () => {
    expect(scriptSubtagOf("az-latn")).toBe("Latn");
    expect(scriptSubtagOf("az-LATN")).toBe("Latn");
  });

  it("returns undefined for a bare primary-language tag", () => {
    expect(scriptSubtagOf("hi")).toBeUndefined();
  });

  it("returns undefined when the following subtag is a region code", () => {
    expect(scriptSubtagOf("en-US")).toBeUndefined();
  });

  it("never reads a script past a singleton or private-use subtag", () => {
    expect(scriptSubtagOf("lif-x-Deva")).toBeUndefined();
    expect(scriptSubtagOf("buu-x-koya")).toBeUndefined();
    expect(scriptSubtagOf("kqe-x-east")).toBeUndefined();
    expect(scriptSubtagOf("en-u-co-phon")).toBeUndefined();
  });
});

describe("regionSubtagOf", () => {
  it("reads the region, with or without a script before it", () => {
    expect(regionSubtagOf("en-US")).toBe("US");
    expect(regionSubtagOf("az-Latn-AZ")).toBe("AZ");
    expect(regionSubtagOf("es-419")).toBe("419");
  });

  it("zh-yue-HK reads HK", () => {
    expect(regionSubtagOf("zh-yue-HK")).toBe("HK");
  });

  it("en-x-001 reads no region", () => {
    expect(regionSubtagOf("en-x-001")).toBeUndefined();
  });

  it("returns undefined for a bare language", () => {
    expect(regionSubtagOf("hi")).toBeUndefined();
  });
});

describe("resolveEffectiveScript", () => {
  it("returns the explicit script subtag without consulting the accessor", () => {
    const getLanguageDefaults = () => {
      throw new Error("should not be called when the tag carries an explicit script subtag");
    };
    expect(resolveEffectiveScript("az-Latn", getLanguageDefaults)).toBe("Latn");
  });

  it("falls back to the accessor's defaultScript when no explicit subtag is present", () => {
    const getLanguageDefaults = (primarySubtag: string) =>
      primarySubtag === "hi" ? { code: "hi", defaultScript: "Deva" } : null;
    expect(resolveEffectiveScript("hi", getLanguageDefaults)).toBe("Deva");
  });

  it("returns undefined for an absent/empty tag without consulting the accessor", () => {
    const getLanguageDefaults = () => {
      throw new Error("should not be called for a null/undefined/empty tag");
    };
    expect(resolveEffectiveScript(null, getLanguageDefaults)).toBeUndefined();
    expect(resolveEffectiveScript(undefined, getLanguageDefaults)).toBeUndefined();
    expect(resolveEffectiveScript("", getLanguageDefaults)).toBeUndefined();
  });

  it("returns undefined when the accessor has no record (unknown language or not yet loaded)", () => {
    expect(resolveEffectiveScript("xx", () => null)).toBeUndefined();
    expect(resolveEffectiveScript("xx", () => undefined)).toBeUndefined();
  });

  it("returns undefined when the accessor's record has no defaultScript", () => {
    expect(resolveEffectiveScript("xx", () => ({ code: "xx" }))).toBeUndefined();
  });
});
