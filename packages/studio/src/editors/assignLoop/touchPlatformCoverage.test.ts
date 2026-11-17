import { describe, it, expect } from "vitest";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { coveragePlatformIds, touchCoverageByPlatform } from "./touchPlatformCoverage.ts";

function layoutOf(platforms: Record<string, string[]>) {
  const json: Record<string, unknown> = {};
  for (const [id, chars] of Object.entries(platforms)) {
    json[id] = {
      layer: [
        {
          id: "default",
          row: [{ id: 1, key: chars.map((c, i) => ({ id: `T_k${i}`, text: c, output: c })) }],
        },
      ],
    };
  }
  return parseTouchLayoutString(JSON.stringify(json));
}

describe("touchCoverageByPlatform", () => {
  it("a letter on the tablet only is still missing, on the phone", () => {
    const layout = layoutOf({ tablet: ["a", "b"], phone: ["a"] });
    const result = touchCoverageByPlatform(layout, ["a", "b"]);
    expect(result.uncovered).toEqual(["b"]);
    expect(result.byPlatform.get("phone")).toEqual(["b"]);
    expect(result.byPlatform.get("tablet")).toEqual([]);
  });

  it("a letter on both platforms is covered", () => {
    const layout = layoutOf({ tablet: ["a"], phone: ["a"] });
    expect(touchCoverageByPlatform(layout, ["a"]).uncovered).toEqual([]);
  });

  it("a platform the layout lacks creates no obligation", () => {
    const layout = layoutOf({ phone: ["a"] });
    const result = touchCoverageByPlatform(layout, ["a"]);
    expect(result.uncovered).toEqual([]);
    expect([...result.byPlatform.keys()]).toEqual(["phone"]);
  });

  it("refine runs per platform before the lists are combined", () => {
    const layout = layoutOf({ tablet: [], phone: [] });
    const result = touchCoverageByPlatform(layout, ["a", "b"], {}, (u) => u.filter((c) => c !== "b"));
    expect(result.uncovered).toEqual(["a"]);
  });
});

describe("coveragePlatformIds", () => {
  it("tracks tablet and phone, leaving desktop out", () => {
    expect(coveragePlatformIds(layoutOf({ desktop: [], tablet: [], phone: [] }))).toEqual(["tablet", "phone"]);
  });

  it("falls back to desktop when it is the only platform", () => {
    expect(coveragePlatformIds(layoutOf({ desktop: [] }))).toEqual(["desktop"]);
  });
});
