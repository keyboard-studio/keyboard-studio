// Unit tests for hostOccupancy (#2525) — the host layout's pass-through
// output as an occupancy source.

import { describe, expect, it } from "vitest";
import { hostCharForHosts } from "./hostOccupancy.ts";

describe("hostCharForHosts — single host", () => {
  it("names the US host's letter on a bare key, and its shifted form", () => {
    const hostCharFor = hostCharForHosts(["us"]);
    expect(hostCharFor("K_X", [])).toBe("x");
    expect(hostCharFor("K_X", ["SHIFT"])).toBe("X");
    expect(hostCharFor("K_QUOTE", [])).toBe("'");
  });

  it("returns null on the US AltGr layer (no AltGr table there)", () => {
    const hostCharFor = hostCharForHosts(["us"]);
    expect(hostCharFor("K_X", ["RALT"])).toBeNull();
    expect(hostCharFor("K_4", ["RALT"])).toBeNull();
  });

  it("names the UK host's AltGr euro, and the German AltGr euro", () => {
    expect(hostCharForHosts(["uk"])("K_4", ["RALT"])).toBe("€");
    expect(hostCharForHosts(["qwertz"])("K_E", ["RALT"])).toBe("€");
  });

  it("treats a host deadkey cell as unknown, never as a glyph", () => {
    // US-Intl K_QUOTE arms a deadkey; US K_QUOTE types '. A veto, not a
    // glyph — and on a single us-intl host, simply unknown.
    expect(hostCharForHosts(["us-intl"])("K_QUOTE", [])).toBeNull();
  });

  it("refuses modifiers the host tables do not model", () => {
    const hostCharFor = hostCharForHosts(["us"]);
    // [CAPS K_N] types 'N' on a US host, not the base layer's 'n'.
    expect(hostCharFor("K_N", ["CAPS"])).toBeNull();
    expect(hostCharFor("K_N", ["NCAPS"])).toBeNull();
    // Lone Ctrl / lone Alt are shortcut layers, not typing layers.
    expect(hostCharFor("K_C", ["CTRL"])).toBeNull();
    expect(hostCharFor("K_C", ["ALT"])).toBeNull();
    // Ctrl+Alt together IS AltGr — but the US table has no AltGr layer.
    expect(hostCharFor("K_C", ["CTRL", "ALT"])).toBeNull();
    expect(hostCharForHosts(["uk"])("K_4", ["CTRL", "ALT"])).toBe("€");
  });
});

describe("hostCharForHosts — unanimity across likely hosts", () => {
  it("names a glyph every host agrees on", () => {
    const hostCharFor = hostCharForHosts(["us", "uk"]);
    expect(hostCharFor("K_X", [])).toBe("x");
    expect(hostCharFor("K_X", ["SHIFT"])).toBe("X");
  });

  it("returns null when the hosts disagree on the slot", () => {
    // AZERTY K_Q is 'a'; US K_Q is 'q'. Neither is THE displaced glyph.
    expect(hostCharForHosts(["us", "azerty"])("K_Q", [])).toBeNull();
    // Shift+2 is '@' on US, '"' on UK.
    expect(hostCharForHosts(["us", "uk"])("K_2", ["SHIFT"])).toBeNull();
  });

  it("a deadkey on any host vetoes the slot", () => {
    // US K_QUOTE types an apostrophe; US-Intl arms a deadkey there.
    expect(hostCharForHosts(["us", "us-intl"])("K_QUOTE", [])).toBeNull();
  });

  it("an unmapped cell on any host vetoes the slot", () => {
    // The US table has no AltGr layer at all.
    expect(hostCharForHosts(["us", "uk"])("K_4", ["RALT"])).toBeNull();
  });

  it("unknown host ids are ignored; with none known every slot is unknown", () => {
    expect(hostCharForHosts([])("K_X", [])).toBeNull();
    expect(hostCharForHosts(["bogus"])("K_X", [])).toBeNull();
    expect(hostCharForHosts(["bogus", "us"])("K_X", [])).toBe("x");
  });
});
