// referenceHosts unit tests (spec 083 Phase 4, #1849).
//
// - key+modifier keying: the same vkey with different modifiers resolves
//   differently (Intl deadkeys are the sharpest case);
// - five + blocked coverage in a fixed order for every input;
// - unknown keys/hosts resolve to "no data", never invented behaviour;
// - never crashes on hostile input;
// - A2 copy: no one-sided "allow unpredictable / block predictable"
//   phrasing anywhere; the blocked row states its own risk.

import { describe, expect, it } from "vitest";
import { referenceHosts } from "./referenceHosts.ts";
import { REFERENCE_HOST_ORDER } from "./types.ts";

const EXPECTED_ORDER = [...REFERENCE_HOST_ORDER, "Blocked"];

function hostsOf(key: string, modifiers: readonly string[] = []) {
  return referenceHosts({ key, modifiers });
}

describe("referenceHosts", () => {
  it("returns the five reference hosts plus the blocked row, in fixed order", () => {
    const result = hostsOf("K_A");
    expect(result.hosts.map((h) => h.host)).toEqual(EXPECTED_ORDER);
    expect(result.keyLabel).toBe("K_A");
  });

  it("keys by key+modifiers: Intl deadkeys differ bare vs shifted", () => {
    const bare = hostsOf("K_QUOTE");
    const shifted = hostsOf("K_QUOTE", ["SHIFT"]);
    const intlBare = bare.hosts.find((h) => h.host === "Intl")!.consequence;
    const intlShifted = shifted.hosts.find((h) => h.host === "Intl")!.consequence;
    expect(intlBare).toContain("host deadkey");
    expect(intlBare).toContain("acute");
    expect(intlShifted).toContain("host deadkey");
    expect(intlShifted).toContain("diaeresis");
    expect(intlBare).not.toBe(intlShifted);
    expect(shifted.keyLabel).toBe("SHIFT+K_QUOTE");
  });

  it("knows the corpus-sharp host facts", () => {
    // US Intl: ` is a grave deadkey.
    const intlBkquote = hostsOf("K_BKQUOTE").hosts.find((h) => h.host === "Intl")!.consequence;
    expect(intlBkquote).toContain("host deadkey");
    expect(intlBkquote).toContain("grave");
    // QWERTZ: y and z swap.
    const qwertzY = hostsOf("K_Y").hosts.find((h) => h.host === "QWERTZ")!.consequence;
    expect(qwertzY).toContain("“z”");
    const qwertzColon = hostsOf("K_COLON").hosts.find((h) => h.host === "QWERTZ")!.consequence;
    expect(qwertzColon).toContain("“ö”");
    // AZERTY: Q types a; ^ is a circumflex deadkey.
    const azertyQ = hostsOf("K_Q").hosts.find((h) => h.host === "AZERTY")!.consequence;
    expect(azertyQ).toContain("“a”");
    const azertyLbrkt = hostsOf("K_LBRKT").hosts.find((h) => h.host === "AZERTY")!.consequence;
    expect(azertyLbrkt).toContain("host deadkey");
    expect(azertyLbrkt).toContain("circumflex");
    // UK English: shift+2 is a quote, shift+3 is £.
    const uk2 = hostsOf("K_2", ["SHIFT"]).hosts.find((h) => h.host === "UK English")!.consequence;
    expect(uk2).toContain("“\"”");
    const uk3 = hostsOf("K_3", ["SHIFT"]).hosts.find((h) => h.host === "UK English")!.consequence;
    expect(uk3).toContain("“£”");
  });

  it("Intl falls back to US for non-deadkey keys, declared openly", () => {
    const intlA = hostsOf("K_A").hosts.find((h) => h.host === "Intl")!.consequence;
    expect(intlA).toContain("types “a”");
    expect(intlA).toContain("(same as US)");
  });

  it("unknown keys resolve to 'no data' on every host — never invented", () => {
    const result = hostsOf("K_F13");
    for (const host of REFERENCE_HOST_ORDER) {
      const row = result.hosts.find((h) => h.host === host)!;
      expect(row.consequence).toContain("no reference data");
    }
    // The blocked row is behaviour, not data — it is always present.
    const blocked = result.hosts.find((h) => h.host === "Blocked")!;
    expect(blocked.consequence).toContain("nothing");
  });

  it("unknown modifiers resolve to 'no data', not a crash", () => {
    const result = hostsOf("K_A", ["CTRL", "ALT"]);
    expect(result.hosts).toHaveLength(6);
    const us = result.hosts.find((h) => h.host === "US")!.consequence;
    expect(us).toContain("no reference data");
  });

  it("never crashes on hostile input", () => {
    const inputs = [
      { key: "", modifiers: [] as readonly string[] },
      { key: "not a key at all !!!", modifiers: [] as readonly string[] },
      { key: "K_A", modifiers: ["shift", "SHIFT", "Shift"] },
      { key: "k_quote", modifiers: ["shift"] },
    ];
    for (const input of inputs) {
      const result = referenceHosts(input);
      expect(result.hosts.map((h) => h.host)).toEqual(EXPECTED_ORDER);
      expect(result.hosts.every((h) => typeof h.consequence === "string")).toBe(true);
    }
    // Lowercase input normalizes to the same rows as uppercase.
    expect(hostsOf("k_quote", ["shift"]).hosts).toEqual(hostsOf("K_QUOTE", ["SHIFT"]).hosts);
  });

  it("A2: no one-sided allow/block slogans; the blocked row states its own risk", () => {
    const banned = [/allow unpredictable/i, /block predictable/i];
    const samples = [
      hostsOf("K_QUOTE"),
      hostsOf("K_QUOTE", ["SHIFT"]),
      hostsOf("K_BKQUOTE"),
      hostsOf("K_A"),
      hostsOf("K_F13"),
    ];
    for (const result of samples) {
      for (const row of result.hosts) {
        for (const re of banned) {
          expect(row.consequence, `${row.host}: ${row.consequence}`).not.toMatch(re);
        }
      }
    }
    const blocked = hostsOf("K_A").hosts.find((h) => h.host === "Blocked")!.consequence;
    expect(blocked).toContain("predictable");
    // …and its own risk, symmetrically.
    expect(blocked).toContain("inaccessible");
  });

  it("every types-row names the single-tap tradeoff, every deadkey-row the unpredictability", () => {
    const usA = hostsOf("K_A").hosts.find((h) => h.host === "US")!.consequence;
    expect(usA).toContain("lose single-tap access");
    const intlQuote = hostsOf("K_QUOTE").hosts.find((h) => h.host === "Intl")!.consequence;
    expect(intlQuote).toContain("varies by computer (unpredictable)");
  });
});
