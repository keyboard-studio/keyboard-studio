// Tests for referenceBaseLayouts.ts (spec 076 FR-023, A3/A3.1).

import { describe, it, expect } from "vitest";
import {
  REFERENCE_DATA_VERSION,
  REGION_LAYOUT_MAPPING_VERSION,
  REFERENCE_BASE_IDS,
  BASE_LAYOUTS,
  DEADKEY,
  lookupHostOutput,
  likelyBaseLayouts,
  canonicalBaseLayer,
  HOST_GUESS_CAPTION,
  BLOCKED_HOST_ID,
} from "./referenceBaseLayouts.ts";

describe("reference host data", () => {
  it("is versioned (data and region mapping)", () => {
    expect(REFERENCE_DATA_VERSION).toBeGreaterThanOrEqual(1);
    expect(REGION_LAYOUT_MAPPING_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("covers exactly the five FR-023 reference hosts", () => {
    expect([...REFERENCE_BASE_IDS]).toEqual([
      "us",
      "us-intl",
      "azerty",
      "qwertz",
      "uk",
    ]);
    for (const id of REFERENCE_BASE_IDS) {
      expect(BASE_LAYOUTS[id].id).toBe(id);
      expect(BASE_LAYOUTS[id].label.length).toBeGreaterThan(0);
    }
  });

  it("UK English AltGr+4 leaks € (the A3 motivating example)", () => {
    expect(lookupHostOutput("uk", "K_4", ["RALT"])).toBe("€");
    // Chirality-insensitive: RIGHTALT is the same physical key.
    expect(lookupHostOutput("uk", "K_4", ["RIGHTALT"])).toBe("€");
    // Ctrl+Alt is AltGr on Windows.
    expect(lookupHostOutput("uk", "K_4", ["CTRL", "LALT"])).toBe("€");
  });

  it("German QWERTZ AltGr+E leaks € (the A3 uniformity example)", () => {
    expect(lookupHostOutput("qwertz", "K_E", ["RALT"])).toBe("€");
  });

  it("marks host deadkeys with the DEADKEY sentinel, not a character", () => {
    expect(lookupHostOutput("us-intl", "K_QUOTE", [])).toBe(DEADKEY);
    expect(lookupHostOutput("us-intl", "K_BKQUOTE", [])).toBe(DEADKEY);
    expect(lookupHostOutput("qwertz", "K_BKQUOTE", [])).toBe(DEADKEY);
  });

  it("returns undefined for uncovered cells — never a guess", () => {
    // Plain US has no AltGr layer.
    expect(lookupHostOutput("us", "K_A", ["RALT"])).toBeUndefined();
    // Shift+AltGr is its own layer; Windows UK defines nothing on Shift+AltGr+4.
    expect(lookupHostOutput("uk", "K_4", ["SHIFT", "RALT"])).toBeUndefined();
  });

  it("maps the Shift+AltGr layer separately from AltGr", () => {
    expect(lookupHostOutput("uk", "K_A", ["SHIFT", "RALT"])).toBe("Á");
    expect(lookupHostOutput("uk", "K_A", ["RALT"])).toBe("á");
  });

  it("matches Windows on the cells hand curation got wrong (basic keyboards are the source)", () => {
    // Windows UK has no AltGr bracket series, backslash on AltGr+hyphen, or ß/µ/ç.
    for (const key of [
      "K_7",
      "K_8",
      "K_9",
      "K_0",
      "K_HYPHEN",
      "K_S",
      "K_M",
      "K_C",
    ]) {
      expect(lookupHostOutput("uk", key, ["RALT"])).toBeUndefined();
    }
    expect(lookupHostOutput("uk", "K_BKQUOTE", ["RALT"])).toBe("¦");
    expect(lookupHostOutput("us-intl", "K_Y", ["RALT"])).toBe("ü");
    // French AZERTY AltGr+2 (~) and AltGr+7 (`) are deadkeys, not literals.
    expect(lookupHostOutput("azerty", "K_2", ["RALT"])).toBe(DEADKEY);
    expect(lookupHostOutput("azerty", "K_7", ["RALT"])).toBe(DEADKEY);
  });

  it("normalizes Keyman's K_oE2 spelling to the tables' upper-cased ids", () => {
    expect(lookupHostOutput("qwertz", "K_oE2", [])).toBe(
      lookupHostOutput("qwertz", "K_OE2", []),
    );
    expect(lookupHostOutput("qwertz", "K_oE2", [])).toBe("<");
  });
});

describe("lookupHostOutput on multiple layouts", () => {
  it("US base layer", () => {
    expect(lookupHostOutput("us", "K_A", [])).toBe("a");
    expect(lookupHostOutput("us", "K_1", ["SHIFT"])).toBe("!");
  });

  it("AZERTY base layer differs positionally from US", () => {
    // K_A is positional (US-named): on AZERTY it produces q.
    expect(lookupHostOutput("azerty", "K_A", [])).toBe("q");
    expect(lookupHostOutput("azerty", "K_Q", [])).toBe("a");
    // Digits live on shift.
    expect(lookupHostOutput("azerty", "K_1", [])).toBe("&");
    expect(lookupHostOutput("azerty", "K_1", ["SHIFT"])).toBe("1");
  });

  it("QWERTZ swaps Y and Z positionally", () => {
    expect(lookupHostOutput("qwertz", "K_Z", [])).toBe("y");
    expect(lookupHostOutput("qwertz", "K_Y", [])).toBe("z");
  });

  it("UK shift layer carries £ on Shift+3", () => {
    expect(lookupHostOutput("uk", "K_3", ["SHIFT"])).toBe("£");
    expect(lookupHostOutput("us", "K_3", ["SHIFT"])).toBe("#");
  });
});

describe("canonicalBaseLayer", () => {
  it("classifies base / shift / altgr", () => {
    expect(canonicalBaseLayer([])).toBe("base");
    expect(canonicalBaseLayer(["SHIFT"])).toBe("shift");
    expect(canonicalBaseLayer(["RSHIFT"])).toBe("shift");
    expect(canonicalBaseLayer(["RALT"])).toBe("altgr");
    expect(canonicalBaseLayer(["RIGHTALT"])).toBe("altgr");
    expect(canonicalBaseLayer(["CTRL", "LALT"])).toBe("altgr");
  });
});

describe("likelyHostLayouts resolution order (FR-023 / A3.1)", () => {
  it("the author's layout_family answer beats bcp47", () => {
    expect(likelyBaseLayouts(["en-US"], "qwertz")).toEqual(["qwertz"]);
    expect(likelyBaseLayouts(["de-DE"], "azerty")).toEqual(["azerty"]);
  });

  it("a coarse qwerty answer is refined by bcp47 region (qwerty + en-GB → UK English)", () => {
    expect(likelyBaseLayouts(["en-GB"], "qwerty")).toEqual(["uk"]);
    expect(likelyBaseLayouts(["en-US"], "qwerty")).toEqual(["us"]);
    // A region that contradicts the answered family does NOT override it.
    expect(likelyBaseLayouts(["de-DE"], "qwerty")).toEqual(["us"]);
  });

  it("bcp47 region mapping applies when the question is unanswered", () => {
    expect(likelyBaseLayouts(["de-DE"])).toEqual(["qwertz"]);
    expect(likelyBaseLayouts(["fr-FR"])).toEqual(["azerty"]);
    expect(likelyBaseLayouts(["en-GB"])).toEqual(["uk"]);
    expect(likelyBaseLayouts(["en-CA"])).toEqual(["us"]);
    expect(likelyBaseLayouts(["en-US"])).toEqual(["us"]);
  });

  it("fr-CA gets no region answer: CSA is not in the reference set, so it falls back to all five rather than a wrong US", () => {
    expect(likelyBaseLayouts(["fr-CA"])).toEqual([...REFERENCE_BASE_IDS]);
  });

  it("no signal → all five reference hosts", () => {
    expect(likelyBaseLayouts([])).toEqual([
      "us",
      "us-intl",
      "azerty",
      "qwertz",
      "uk",
    ]);
    expect(likelyBaseLayouts([], undefined)).toEqual([...REFERENCE_BASE_IDS]);
    // Unknown regions are no signal.
    expect(likelyBaseLayouts(["xx-YY"])).toEqual([...REFERENCE_BASE_IDS]);
  });

  it("multiple tags union in first-seen order", () => {
    expect(likelyBaseLayouts(["de-DE", "fr-FR"])).toEqual(["qwertz", "azerty"]);
  });
});

describe("likelyHostLayouts bcp47 edge cases (Q2: script, fr-CH, private-use)", () => {
  it("script subtags are parsed, not scanned: they neither select nor veto a host", () => {
    // Script in canonical position: the region behind it still resolves.
    expect(likelyBaseLayouts(["de-Latn-DE"])).toEqual(["qwertz"]);
    expect(likelyBaseLayouts(["en-Latn-GB"])).toEqual(["uk"]);
    // Script with an unmapped region: no signal, all five.
    expect(likelyBaseLayouts(["sr-Latn-RS"])).toEqual([...REFERENCE_BASE_IDS]);
    expect(likelyBaseLayouts(["zh-Hant-TW"])).toEqual([...REFERENCE_BASE_IDS]);
    // The fr-CA carve-out survives a script subtag.
    expect(likelyBaseLayouts(["fr-Latn-CA"])).toEqual([...REFERENCE_BASE_IDS]);
  });

  it("fr-CH resolves to Swiss QWERTZ: Swiss French uses the Swiss QWERTZ layout", () => {
    expect(likelyBaseLayouts(["fr-CH"])).toEqual(["qwertz"]);
    expect(likelyBaseLayouts(["de-CH"])).toEqual(["qwertz"]);
  });

  it("private-use subtags are never read as regions", () => {
    // `x-us` is private use, not the US region.
    expect(likelyBaseLayouts(["en-x-us"])).toEqual([...REFERENCE_BASE_IDS]);
    // A leading `x-` makes the whole tag private-use.
    expect(likelyBaseLayouts(["x-en-US"])).toEqual([...REFERENCE_BASE_IDS]);
    // A region before the private-use tail still counts.
    expect(likelyBaseLayouts(["en-US-x-custom"])).toEqual(["us"]);
    expect(likelyBaseLayouts(["de-DE-x-twaz"])).toEqual(["qwertz"]);
  });

  it("extlang and numeric-region tags parse without misreading", () => {
    // `cmn` extlang + `Hans` script skipped; CN is unmapped → all five.
    expect(likelyBaseLayouts(["zh-cmn-Hans-CN"])).toEqual([
      ...REFERENCE_BASE_IDS,
    ]);
    // UN M.49 region parses but is unmapped → all five, not a crash.
    expect(likelyBaseLayouts(["es-419"])).toEqual([...REFERENCE_BASE_IDS]);
  });
});

describe("shared selector constants", () => {
  it("exposes the honesty caption and the blocked entry id", () => {
    expect(HOST_GUESS_CAPTION).toMatch(/best guess/);
    expect(HOST_GUESS_CAPTION).toMatch(/not sight of them/);
    expect(BLOCKED_HOST_ID).toBe("blocked");
  });
});
