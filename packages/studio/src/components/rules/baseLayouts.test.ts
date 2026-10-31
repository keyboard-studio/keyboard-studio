// baseLayouts.test.ts — host-layout reference data and likely-host resolution
// (spec 082 FR-003; 1802 amendments A1/A2/A3/A3.1).

import { describe, expect, it } from "vitest";
import {
  ALLOW_BLOCK_QUESTION,
  ALLOW_RISK_COPY,
  BLOCK_RISK_COPY,
  DEFAULT_BASE_LAYOUTS,
  BASE_LAYOUTS,
  BASE_LAYOUT_MAPPING_VERSION,
  baseLayoutCharFor,
  baseLayoutById,
  likelyBaseLayouts,
  regionSubtagOf,
  resolveLikelyBases,
} from "./baseLayouts.ts";

describe("hostCharFor (key+modifiers)", () => {
  it("returns the US unshifted/shifted characters", () => {
    expect(baseLayoutCharFor("us", "K_Q", {})).toBe("q");
    expect(baseLayoutCharFor("us", "K_Q", { shift: true })).toBe("Q");
    expect(baseLayoutCharFor("us", "K_1", { shift: true })).toBe("!");
  });

  it("returns the UK AltGr+4 = € leak (the A3 motivating case)", () => {
    expect(baseLayoutCharFor("uk", "K_4", { altGr: true })).toBe("€");
  });

  it("returns the German QWERTZ AltGr+E = €", () => {
    expect(baseLayoutCharFor("qwertz", "K_E", { altGr: true })).toBe("€");
    expect(baseLayoutCharFor("qwertz", "K_Q", { altGr: true })).toBe("@");
  });

  it("returns null for an AltGr key with no entry (no dishonest fallback)", () => {
    expect(baseLayoutCharFor("us", "K_Q", { altGr: true })).toBeNull();
    expect(baseLayoutCharFor("uk", "K_Q", { altGr: true })).toBeNull();
  });

  it("returns empty string for the blocked layout (emits nothing)", () => {
    expect(baseLayoutCharFor("blocked", "K_Q", {})).toBe("");
    expect(baseLayoutCharFor("blocked", "K_Q", { shift: true })).toBe("");
    expect(baseLayoutCharFor("blocked", "K_Q", { altGr: true })).toBe("");
  });

  it("falls back to the US table for unknown keys (demo-data honesty)", () => {
    expect(baseLayoutCharFor("azerty", "K_F", {})).toBe("f");
  });

  it("has five reference layouts plus blocked", () => {
    const ids = BASE_LAYOUTS.map((l) => l.id);
    expect(ids).toEqual(["us", "intl", "azerty", "qwertz", "uk", "blocked"]);
    expect(baseLayoutById("uk").label).toBe("UK English");
  });
});

describe("regionSubtagOf", () => {
  it("extracts the region subtag", () => {
    expect(regionSubtagOf("en-US")).toBe("US");
    expect(regionSubtagOf("de-DE")).toBe("DE");
    expect(regionSubtagOf("fr-CA")).toBe("CA");
  });

  it("returns null when there is no region subtag", () => {
    expect(regionSubtagOf("ha-Latn")).toBeNull();
    expect(regionSubtagOf("en")).toBeNull();
  });
});

describe("likelyBaseLayouts", () => {
  it("resolves German tags to QWERTZ first", () => {
    const hosts = likelyBaseLayouts(["de-DE"]);
    expect(hosts[0]).toBe("qwertz");
  });

  it("resolves UK tags to UK English first", () => {
    const hosts = likelyBaseLayouts(["en-GB"]);
    expect(hosts[0]).toBe("uk");
  });

  it("resolves US tags to US layouts", () => {
    expect(likelyBaseLayouts(["en-US"])).toEqual(["us", "intl"]);
  });

  it("deduplicates across tags", () => {
    expect(likelyBaseLayouts(["de-DE", "de-AT"])).toEqual(["qwertz", "uk"]);
  });

  it("defaults to the five reference hosts with no signal", () => {
    expect(likelyBaseLayouts([])).toEqual([...DEFAULT_BASE_LAYOUTS]);
    expect(likelyBaseLayouts(["ha-Latn"])).toEqual([...DEFAULT_BASE_LAYOUTS]);
    // Unknown region: mapping is conservative, default applies.
    expect(likelyBaseLayouts(["en-XX"])).toEqual([...DEFAULT_BASE_LAYOUTS]);
  });

  it("never includes blocked in the likely set", () => {
    expect(likelyBaseLayouts(["en-US"])).not.toContain("blocked");
    expect(likelyBaseLayouts([])).not.toContain("blocked");
  });

  it("is versioned", () => {
    expect(BASE_LAYOUT_MAPPING_VERSION).toBe(1);
  });
});

describe("resolveLikelyHosts (A3.1: layout_family primary, bcp47 fallback)", () => {
  it("puts the answered family's layout first", () => {
    expect(resolveLikelyBases({ layoutFamily: "qwertz", bcp47: ["en-US"] })[0]).toBe("qwertz");
    expect(resolveLikelyBases({ layoutFamily: "azerty", bcp47: ["de-DE"] })[0]).toBe("azerty");
  });

  it("maps qwerty to the QWERTY layouts first", () => {
    const hosts = resolveLikelyBases({ layoutFamily: "qwerty", bcp47: ["de-DE"] });
    expect(hosts.slice(0, 3)).toEqual(["us", "intl", "uk"]);
  });

  it("falls back to bcp47 when the family is non-roman", () => {
    expect(resolveLikelyBases({ layoutFamily: "non-roman", bcp47: ["de-DE"] })[0]).toBe("qwertz");
  });

  it("falls back to bcp47 when the family is unanswered", () => {
    expect(resolveLikelyBases({ layoutFamily: null, bcp47: ["en-GB"] })[0]).toBe("uk");
    expect(resolveLikelyBases({ bcp47: ["fr-FR"] })[0]).toBe("azerty");
  });

  it("puts the layout-step pick first, ahead of family and bcp47", () => {
    const hosts = resolveLikelyBases({ pickedBases: ["azerty"], layoutFamily: "qwerty", bcp47: ["en-GB"] });
    expect(hosts[0]).toBe("azerty");
    expect(hosts.filter((id) => id === "azerty")).toHaveLength(1);
    for (const id of DEFAULT_BASE_LAYOUTS) expect(hosts).toContain(id);
  });

  it("puts every layout-step pick first, in selection order (#1902)", () => {
    const hosts = resolveLikelyBases({
      pickedBases: ["qwertz", "azerty", "qwertz"],
      layoutFamily: "qwerty",
      bcp47: ["en-GB"],
    });
    expect(hosts.slice(0, 2)).toEqual(["qwertz", "azerty"]);
    expect(hosts.filter((id) => id === "qwertz")).toHaveLength(1);
    for (const id of DEFAULT_BASE_LAYOUTS) expect(hosts).toContain(id);
  });

  it("defaults to the five with no signal at all", () => {
    expect(resolveLikelyBases({})).toEqual([...DEFAULT_BASE_LAYOUTS]);
  });

  it("keeps every reference layout available for manual switching", () => {
    for (const family of ["qwerty", "qwertz", "azerty", "non-roman"] as const) {
      const hosts = resolveLikelyBases({ layoutFamily: family, bcp47: [] });
      for (const id of DEFAULT_BASE_LAYOUTS) {
        expect(hosts).toContain(id);
      }
    }
  });
});

describe("A2 tradeoff copy", () => {
  it("asks the one question only the author can answer", () => {
    expect(ALLOW_BLOCK_QUESTION).toBe("Do your typists expect a character on this key?");
  });

  it("states each option's own risk without selling either side", () => {
    expect(ALLOW_RISK_COPY).toContain("always does something");
    expect(ALLOW_RISK_COPY).toContain("varies by computer");
    expect(BLOCK_RISK_COPY).toContain("does nothing");
    expect(BLOCK_RISK_COPY).toContain("dead key");
  });

  it("never uses the retired one-sided slogan", () => {
    const unp = ["un", "predictable"].join("");
    const pred = "predict" + "able";
    const slogan = `Allow means ${unp}; Block means ${pred}.`;
    for (const copy of [ALLOW_BLOCK_QUESTION, ALLOW_RISK_COPY, BLOCK_RISK_COPY]) {
      expect(copy).not.toContain(slogan);
    }
    // The retired framing must not appear anywhere in the module's copy.
    const allCopy = [ALLOW_BLOCK_QUESTION, ALLOW_RISK_COPY, BLOCK_RISK_COPY].join(" ");
    expect(allCopy).not.toMatch(new RegExp(`allow means ${unp}`, "i"));
    expect(allCopy).not.toMatch(new RegExp(`block means ${pred}`, "i"));
  });
});
