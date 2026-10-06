// windowsLayouts — catalog integrity, search, and the propose-then-confirm
// proposal (spec 076 A4).

import { describe, it, expect } from "vitest";
import {
  DEFAULT_PROPOSED_LAYOUT_ID,
  WINDOWS_LAYOUTS,
  proposeWindowsLayout,
  searchWindowsLayouts,
  windowsLayoutById,
  windowsLayoutForHost,
} from "./windowsLayouts.ts";
import { REFERENCE_HOST_IDS } from "./referenceHostLayouts.ts";

describe("catalog", () => {
  it("lists every basic_kbd keyboard with a unique id", () => {
    expect(WINDOWS_LAYOUTS.length).toBeGreaterThan(150);
    expect(new Set(WINDOWS_LAYOUTS.map((l) => l.id)).size).toBe(WINDOWS_LAYOUTS.length);
  });

  it("maps each of the five reference hosts to exactly one layout", () => {
    for (const host of REFERENCE_HOST_IDS) {
      expect(WINDOWS_LAYOUTS.filter((l) => l.host === host)).toHaveLength(1);
    }
    expect(windowsLayoutForHost("us")?.id).toBe("basic_kbdus");
    expect(windowsLayoutForHost("us-intl")?.id).toBe("basic_kbdusx");
    expect(windowsLayoutForHost("azerty")?.id).toBe("basic_kbdfr");
    expect(windowsLayoutForHost("qwertz")?.id).toBe("basic_kbdgr");
    expect(windowsLayoutForHost("uk")?.id).toBe("basic_kbduk");
  });

  it("derives sensible families", () => {
    expect(windowsLayoutById("basic_kbdus")?.family).toBe("qwerty");
    expect(windowsLayoutById("basic_kbdfr")?.family).toBe("azerty");
    expect(windowsLayoutById("basic_kbdgr")?.family).toBe("qwertz");
    expect(windowsLayoutById("basic_kbdru")?.family).toBe("non-roman");
  });
});

describe("searchWindowsLayouts", () => {
  it("returns every layout for an empty query", () => {
    expect(searchWindowsLayouts("")).toHaveLength(WINDOWS_LAYOUTS.length);
  });

  it("matches by display name", () => {
    expect(searchWindowsLayouts("german").map((l) => l.id)).toContain("basic_kbdgr");
  });

  it("matches by keyboard id", () => {
    expect(searchWindowsLayouts("kbdfr").map((l) => l.id)).toContain("basic_kbdfr");
  });

  it("matches by language tag and by language name", () => {
    expect(searchWindowsLayouts("el").map((l) => l.id)).toContain("basic_kbdhe");
    expect(searchWindowsLayouts("greek").map((l) => l.id)).toContain("basic_kbdhe");
  });

  it("requires every token to match", () => {
    expect(searchWindowsLayouts("zzzz-no-such-layout")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(searchWindowsLayouts("GERMAN").length).toBe(searchWindowsLayouts("german").length);
  });
});

describe("proposeWindowsLayout - never blank", () => {
  it("region: en-GB proposes the UK layout", () => {
    const p = proposeWindowsLayout("en-GB");
    expect(p.layout.id).toBe("basic_kbduk");
    expect(p.basis).toBe("region");
  });

  it("region: de-DE proposes German", () => {
    expect(proposeWindowsLayout("de-DE").layout.id).toBe("basic_kbdgr");
  });

  it("language: ru (no region mapping) proposes a catalog layout that lists it", () => {
    const p = proposeWindowsLayout("ru");
    expect(p.basis).toBe("language");
    expect(p.layout.languages.some((l) => l.id.split("-")[0] === "ru")).toBe(true);
  });

  it("default: no tag gives the US layout", () => {
    const p = proposeWindowsLayout(undefined);
    expect(p.layout.id).toBe(DEFAULT_PROPOSED_LAYOUT_ID);
    expect(p.basis).toBe("default");
  });

  it("default: a tag no layout mentions still yields a proposal", () => {
    const p = proposeWindowsLayout("qqq-Zzzz");
    expect(p.layout).toBeDefined();
    expect(p.basis).toBe("default");
  });
});
