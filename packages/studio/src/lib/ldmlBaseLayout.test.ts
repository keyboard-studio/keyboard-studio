import { describe, expect, it } from "vitest";
import { resolveLdmlBaseLayout } from "./ldmlBaseLayout.ts";
import { REFERENCE_BASES } from "./referenceBaseLayouts.ts";
import { windowsLayoutById, type WindowsLayout } from "./windowsLayouts.ts";

function layout(id: string): WindowsLayout {
  const l = windowsLayoutById(id);
  if (l === undefined) throw new Error(`missing fixture layout ${id}`);
  return l;
}

const NONE = { windowsLayoutPicks: [], layoutFamily: null, bcp47: [], override: null } as const;

describe("resolveLdmlBaseLayout (spec 108 FR-027)", () => {
  it("source author: an override wins over the primary pick", () => {
    const r = resolveLdmlBaseLayout({ ...NONE, windowsLayoutPicks: [layout("basic_kbdfr")], override: "qwertz" });
    expect(r.chosen?.id).toBe("qwertz");
    expect(r.chosen?.source).toBe("author");
    expect(r.defaultChoice).toMatchObject({ id: "azerty", source: "primary-pick", available: true });
  });

  it("source primary-pick: the primary windows-layout pick is the default", () => {
    const r = resolveLdmlBaseLayout({ ...NONE, windowsLayoutPicks: [layout("basic_kbdfr"), layout("basic_kbdus")] });
    expect(r.chosen?.id).toBe("azerty");
    expect(r.chosen?.source).toBe("primary-pick");
    expect(r.chosen?.family).toBe("AZERTY");
  });

  it("source likely-base: with no pick the first likely host leads, intl mapped to us-intl", () => {
    const fam = resolveLdmlBaseLayout({ ...NONE, layoutFamily: "qwertz" });
    expect(fam.chosen).toMatchObject({ id: "qwertz", source: "likely-base", family: "QWERTZ" });
    const region = resolveLdmlBaseLayout({ ...NONE, bcp47: ["en-GB"] });
    expect(region.chosen).toMatchObject({ id: "uk", source: "likely-base" });
  });

  it("source en-US: no signal at all falls back to US English", () => {
    const r = resolveLdmlBaseLayout(NONE);
    expect(r.chosen).toMatchObject({ id: "us", source: "en-US", family: "QWERTY" });
    expect(r.defaultChoice.available).toBe(true);
  });

  it("offers the five reference hosts as options", () => {
    expect(resolveLdmlBaseLayout(NONE).options.map((o) => o.id)).toEqual(["us", "us-intl", "azerty", "qwertz", "uk"]);
  });

  it("copies the four layers, never aliasing the reference tables", () => {
    const r = resolveLdmlBaseLayout(NONE);
    const layers = r.chosen!.layers;
    expect(Object.keys(layers).sort()).toEqual(["altgr", "base", "shift", "shiftAltgr"]);
    expect(layers.base).toEqual(REFERENCE_BASES.us.base);
    expect(layers.base).not.toBe(REFERENCE_BASES.us.base);
  });

  it("sets isoFamily from a K_OE2 cell", () => {
    const iso = resolveLdmlBaseLayout({ ...NONE, override: "azerty" }).chosen!;
    const t = REFERENCE_BASES.azerty;
    const hasCell = [t.base, t.shift, t.altgr, t.shiftAltgr].some((l) => "K_OE2" in l);
    expect(iso.isoFamily).toBe(hasCell);
  });

  it("an unavailable primary pick is never substituted: chosen is null", () => {
    const r = resolveLdmlBaseLayout({ ...NONE, windowsLayoutPicks: [layout("basic_kbdru")], layoutFamily: "qwertz" });
    expect(r.chosen).toBeNull();
    expect(r.defaultChoice).toMatchObject({ id: "basic_kbdru", source: "primary-pick", available: false });
  });

  it("an unavailable primary pick resolves once an override is set", () => {
    const r = resolveLdmlBaseLayout({ ...NONE, windowsLayoutPicks: [layout("basic_kbdru")], override: "uk" });
    expect(r.chosen).toMatchObject({ id: "uk", source: "author" });
    expect(r.defaultChoice.available).toBe(false);
  });
});
