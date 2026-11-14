/**
 * Full-tag langtags lookups (resolveLangtag / langtagsScripts) over the
 * generated tagset index. Cases are pinned to the langtags commit in
 * scripts/langtags-version.json; a pin bump that moves one is a real data
 * change to review, not a flake.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { tagsets } from "./generated/tagsets.js";
import { langtagsScripts, macrolanguageMembers, resolveLangtag } from "./tagsets.js";

describe("resolveLangtag", () => {
  it("resolves a tagset's tag, full form and equivalents to the same full", () => {
    for (const tag of ["en", "en-Latn", "en-US", "en-Latn-US", "EN-latn-us"]) {
      expect(resolveLangtag(tag)).toEqual({ full: "en-Latn-US", script: "Latn" });
    }
  });

  it("keeps script- and region-specific tagsets apart", () => {
    expect(resolveLangtag("pa")?.full).toBe("pa-Guru-IN");
    expect(resolveLangtag("pa-Arab")?.full).toBe("pa-Arab-PK");
    expect(resolveLangtag("pa-PK")?.full).toBe("pa-Arab-PK");
    expect(resolveLangtag("sr-Latn")?.full).toBe("sr-Latn-RS");
    expect(resolveLangtag("fr-CA")?.full).toBe("fr-Latn-CA");
  });

  it("resolves a listed extra region onto the tagset's script", () => {
    expect(resolveLangtag("fr-BF")).toEqual({ full: "fr-Latn-BF", script: "Latn" });
    expect(resolveLangtag("fr-Latn-BF")).toEqual({ full: "fr-Latn-BF", script: "Latn" });
  });

  it("returns null for what langtags does not record", () => {
    expect(resolveLangtag("fr-Latn-AQ")).toBeNull(); // AQ not listed for fr
    expect(resolveLangtag("ha-Zzzz")).toBeNull();
    expect(resolveLangtag("zzz")).toBeNull();
    expect(resolveLangtag("en-US-x-twain")).toBeNull();
    expect(resolveLangtag("fr-CA-BF")).toBeNull();
    expect(resolveLangtag("")).toBeNull();
  });
});

describe("macrolanguageMembers", () => {
  it("lists a macrolanguage's members, [] for an individual language", () => {
    expect(macrolanguageMembers("qu")).toContain("qub");
    expect(macrolanguageMembers("AR")).toContain("ary");
    expect(macrolanguageMembers("fr")).toEqual([]);
  });
});

describe("langtagsScripts", () => {
  it("lists every script langtags records for a language", () => {
    expect(langtagsScripts("sr")).toEqual(["Brai", "Cyrl", "Glag", "Latn"]);
    expect(langtagsScripts("HA")).toContain("Arab");
    expect(langtagsScripts("zzz")).toEqual([]);
  });
});

// Determinism: the generated rows re-derive from langtags.json (skipped
// visibly when the gitignored data file has not been fetched).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const DATA_FILE = join(ROOT, "packages", "engine", "data", "langtags", "langtags.json");

describe.skipIf(!existsSync(DATA_FILE))("tagsets codegen determinism", () => {
  it("one row per tagset, sorted by tag, matching langtags.json", () => {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Array<{
      tag?: string;
      full?: string;
      tags?: string[];
      regions?: string[];
      macrolang?: string;
      windows?: string;
    }>;
    const expected = raw
      .filter((e) => e.tag && !e.tag.startsWith("_") && typeof e.full === "string")
      .map((e) => [
        e.tag!,
        e.full!,
        [...(e.tags ?? [])].sort().join(" "),
        [...(e.regions ?? [])].sort().join(" "),
        e.macrolang ?? "",
        e.windows ?? "",
      ])
      .sort((a, b) => a[0]!.localeCompare(b[0]!));
    expect(tagsets).toEqual(expected);
  });
});

describe("dialects codegen", () => {
  it("emits one row per variant or -x- tagset, none folded into regionVariants", async () => {
    const { dialects } = await import("./generated/dialects.js");
    expect(dialects.length).toBe(229);
    const rabinal = dialects.find((d) => d.tag === "acr-x-rabinal");
    expect(rabinal).toMatchObject({
      full: "acr-Latn-GT-x-rabinal",
      language: "acr",
      dialectSubtag: "x-rabinal",
      windows: "acr-Latn-x-rabinal",
    });
    expect(dialects.find((d) => d.tag === "ca-valencia")?.dialectSubtag).toBe("valencia");
  });
});
