import { describe, it, expect } from "vitest";
import type { OutputRepertoire } from "@keyboard-studio/contracts";
import { buildNormalizationMaps } from "./maps.js";

const rep = (clusters: string[]): OutputRepertoire => ({
  clusters: new Set(clusters),
  marks: [],
  bases: [],
  stackDepth: 2,
  unresolved: [],
});

describe("buildNormalizationMaps", () => {
  it("targets the produced form: precomposed and non-NFC clusters (FR-002)", () => {
    const nonNfc = "e\u0329\u0301";
    const maps = buildNormalizationMaps(rep(["\u00e1", nonNfc]));
    const byFrom = new Map(maps.map((m) => [m.from, m.to]));
    expect(byFrom.get("a\u0301")).toBe("\u00e1");
    // NFC form of e + U+0329 + U+0301 maps back to the produced (non-NFC) form.
    expect(byFrom.get(nonNfc.normalize("NFC"))).toBe(nonNfc);
  });

  it("creates no map for a cluster the keyboard cannot produce (FR-003)", () => {
    const maps = buildNormalizationMaps(rep(["\u00e1"]));
    expect(maps.some((m) => m.from.startsWith("o") || m.to.startsWith("o"))).toBe(false);
    expect(maps).toHaveLength(1);
  });

  it("maps two mark orders with one NFC form to the code-point-first one, flagged ambiguous (FR-004)", () => {
    const c1 = "e\u0323\u0301"; // dot below (ccc 220) then acute (ccc 230): canonical order
    const c2 = "e\u0301\u0323";
    const maps = buildNormalizationMaps(rep([c1, c2]));
    const nfc = maps.find((m) => m.from === c1.normalize("NFC"));
    expect(nfc).toBeDefined();
    expect(nfc?.to).toBe([c1, c2].sort()[0]);
    expect(nfc?.ambiguous).toEqual([[c1, c2].sort()[1]]);
  });

  it("drops an alternate that is itself produced (FR-005)", () => {
    const maps = buildNormalizationMaps(rep(["\u00e1", "a\u0301"]));
    expect(maps).toEqual([]);
  });

  it("keeps NFC(from) === NFC(to) for every map", () => {
    const maps = buildNormalizationMaps(rep(["\u1eb9\u0301", "e\u0323\u0301", "e\u0329\u0301", "\u00e1", "\u1e61"]));
    expect(maps.length).toBeGreaterThan(0);
    for (const m of maps) expect(m.from.normalize("NFC")).toBe(m.to.normalize("NFC"));
  });
});
