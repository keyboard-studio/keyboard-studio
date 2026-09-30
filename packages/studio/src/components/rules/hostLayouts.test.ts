// hostLayouts.test.ts — host-layout reference data and likely-host resolution
// (spec 082 FR-003; 1802 amendments A1/A2/A3/A3.1).

import { describe, expect, it } from "vitest";
import {
  ALLOW_BLOCK_QUESTION,
  ALLOW_RISK_COPY,
  BLOCK_RISK_COPY,
  DEFAULT_HOST_LAYOUTS,
  HOST_LAYOUTS,
  HOST_LAYOUT_MAPPING_VERSION,
  hostCharFor,
  hostLayoutById,
  likelyHostLayouts,
  regionSubtagOf,
  resolveLikelyHosts,
} from "./hostLayouts.ts";

describe("hostCharFor (key+modifiers)", () => {
  it("returns the US unshifted/shifted characters", () => {
    expect(hostCharFor("us", "K_Q", {})).toBe("q");
    expect(hostCharFor("us", "K_Q", { shift: true })).toBe("Q");
    expect(hostCharFor("us", "K_1", { shift: true })).toBe("!");
  });

  it("returns the UK AltGr+4 = € leak (the A3 motivating case)", () => {
    expect(hostCharFor("uk", "K_4", { altGr: true })).toBe("€");
  });

  it("returns the German QWERTZ AltGr+E = €", () => {
    expect(hostCharFor("qwertz", "K_E", { altGr: true })).toBe("€");
    expect(hostCharFor("qwertz", "K_Q", { altGr: true })).toBe("@");
  });

  it("returns null for an AltGr key with no entry (no dishonest fallback)", () => {
    expect(hostCharFor("us", "K_Q", { altGr: true })).toBeNull();
    expect(hostCharFor("uk", "K_Q", { altGr: true })).toBeNull();
  });

  it("returns empty string for the blocked layout (emits nothing)", () => {
    expect(hostCharFor("blocked", "K_Q", {})).toBe("");
    expect(hostCharFor("blocked", "K_Q", { shift: true })).toBe("");
    expect(hostCharFor("blocked", "K_Q", { altGr: true })).toBe("");
  });

  it("falls back to the US table for unknown keys (demo-data honesty)", () => {
    expect(hostCharFor("azerty", "K_F", {})).toBe("f");
  });

  it("has five reference layouts plus blocked", () => {
    const ids = HOST_LAYOUTS.map((l) => l.id);
    expect(ids).toEqual(["us", "intl", "azerty", "qwertz", "uk", "blocked"]);
    expect(hostLayoutById("uk").label).toBe("UK English");
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

describe("likelyHostLayouts", () => {
  it("resolves German tags to QWERTZ first", () => {
    const hosts = likelyHostLayouts(["de-DE"]);
    expect(hosts[0]).toBe("qwertz");
  });

  it("resolves UK tags to UK English first", () => {
    const hosts = likelyHostLayouts(["en-GB"]);
    expect(hosts[0]).toBe("uk");
  });

  it("resolves US tags to US layouts", () => {
    expect(likelyHostLayouts(["en-US"])).toEqual(["us", "intl"]);
  });

  it("deduplicates across tags", () => {
    expect(likelyHostLayouts(["de-DE", "de-AT"])).toEqual(["qwertz", "uk"]);
  });

  it("defaults to the five reference hosts with no signal", () => {
    expect(likelyHostLayouts([])).toEqual([...DEFAULT_HOST_LAYOUTS]);
    expect(likelyHostLayouts(["ha-Latn"])).toEqual([...DEFAULT_HOST_LAYOUTS]);
    // Unknown region: mapping is conservative, default applies.
    expect(likelyHostLayouts(["en-XX"])).toEqual([...DEFAULT_HOST_LAYOUTS]);
  });

  it("never includes blocked in the likely set", () => {
    expect(likelyHostLayouts(["en-US"])).not.toContain("blocked");
    expect(likelyHostLayouts([])).not.toContain("blocked");
  });

  it("is versioned", () => {
    expect(HOST_LAYOUT_MAPPING_VERSION).toBe(1);
  });
});

describe("resolveLikelyHosts (A3.1: layout_family primary, bcp47 fallback)", () => {
  it("puts the answered family's layout first", () => {
    expect(resolveLikelyHosts({ layoutFamily: "qwertz", bcp47: ["en-US"] })[0]).toBe("qwertz");
    expect(resolveLikelyHosts({ layoutFamily: "azerty", bcp47: ["de-DE"] })[0]).toBe("azerty");
  });

  it("maps qwerty to the QWERTY layouts first", () => {
    const hosts = resolveLikelyHosts({ layoutFamily: "qwerty", bcp47: ["de-DE"] });
    expect(hosts.slice(0, 3)).toEqual(["us", "intl", "uk"]);
  });

  it("falls back to bcp47 when the family is non-roman", () => {
    expect(resolveLikelyHosts({ layoutFamily: "non-roman", bcp47: ["de-DE"] })[0]).toBe("qwertz");
  });

  it("falls back to bcp47 when the family is unanswered", () => {
    expect(resolveLikelyHosts({ layoutFamily: null, bcp47: ["en-GB"] })[0]).toBe("uk");
    expect(resolveLikelyHosts({ bcp47: ["fr-FR"] })[0]).toBe("azerty");
  });

  it("defaults to the five with no signal at all", () => {
    expect(resolveLikelyHosts({})).toEqual([...DEFAULT_HOST_LAYOUTS]);
  });

  it("keeps every reference layout available for manual switching", () => {
    for (const family of ["qwerty", "qwertz", "azerty", "non-roman"] as const) {
      const hosts = resolveLikelyHosts({ layoutFamily: family, bcp47: [] });
      for (const id of DEFAULT_HOST_LAYOUTS) {
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
    const slogan = "Allow means unpredictable; Block means predictable.";
    for (const copy of [ALLOW_BLOCK_QUESTION, ALLOW_RISK_COPY, BLOCK_RISK_COPY]) {
      expect(copy).not.toContain(slogan);
    }
    // The retired framing must not appear anywhere in the module's copy.
    const allCopy = [ALLOW_BLOCK_QUESTION, ALLOW_RISK_COPY, BLOCK_RISK_COPY].join(" ");
    expect(allCopy).not.toMatch(/allow means unpredictable/i);
    expect(allCopy).not.toMatch(/block means predictable/i);
  });
});
