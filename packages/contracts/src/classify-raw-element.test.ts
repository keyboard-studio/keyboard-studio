import { describe, expect, it } from "vitest";
import { classifyRawElement, hasRawCallPrefix } from "./rule-shape";

describe("classifyRawElement", () => {
  it("reads layer, platform and set(&layer) calls, either quote style", () => {
    expect(classifyRawElement("layer('shift')")).toEqual({ kind: "layer", value: "shift" });
    expect(classifyRawElement('layer( "alt" )')).toEqual({ kind: "layer", value: "alt" });
    expect(classifyRawElement("platform('desktop native')")).toEqual({ kind: "platform", value: "desktop native" });
    expect(classifyRawElement("set(&layer='numeric')")).toEqual({ kind: "setLayer", value: "numeric" });
    expect(classifyRawElement("set( &layer = \"x\" )")).toEqual({ kind: "setLayer", value: "x" });
  });

  it("trims and ignores case in the call name", () => {
    expect(classifyRawElement("  LAYER('a')  ")).toEqual({ kind: "layer", value: "a" });
    expect(classifyRawElement("Platform('touch')")).toEqual({ kind: "platform", value: "touch" });
  });

  it("is strict: no space before the paren, quoted argument, nothing trailing", () => {
    for (const t of ["layer ('x')", "layer(x)", "platform('x') + 'a'", "use(g)", "nul", "", "set(&other='x')"]) {
      expect(classifyRawElement(t)).toEqual({ kind: "other" });
    }
  });

  it("keeps an empty quoted argument", () => {
    expect(classifyRawElement("layer('')")).toEqual({ kind: "layer", value: "" });
  });
});

describe("hasRawCallPrefix", () => {
  it("is the looser prefix reading, allowing space before the paren and any tail", () => {
    expect(hasRawCallPrefix(" platform ('x') junk", "platform")).toBe(true);
    expect(hasRawCallPrefix("layer(", "layer")).toBe(true);
    expect(hasRawCallPrefix("layer('x')", "platform")).toBe(false);
    expect(hasRawCallPrefix("xlayer(", "layer")).toBe(false);
  });
});
