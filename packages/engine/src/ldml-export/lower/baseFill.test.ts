import { describe, expect, it } from "vitest";
import { AZERTY_BASE } from "../__fixtures__/azerty-base.js";
import { lowerRules } from "../__fixtures__/helpers.js";
import { US_BASE } from "../__fixtures__/us-base.js";
import { FORM_ROWS } from "./positions.js";
import { baseCharFor, type GridCell, type GridLayer } from "./baseFill.js";

const layer = (grid: { layers: GridLayer[] }, modifiers: string): GridLayer => {
  const l = grid.layers.find((x) => x.modifiers === modifiers);
  if (!l) throw new Error(`no layer ${modifiers} in ${grid.layers.map((x) => x.modifiers).join(",")}`);
  return l;
};
const cell = (l: GridLayer, vkey: string): GridCell => {
  const c = l.cells.find((x) => x.vkey === vkey);
  if (!c) throw new Error(`no cell ${vkey}`);
  return c;
};

describe("base fill (FR-021, row 2.8)", () => {
  it("covers every main-block position of the chosen form in every exported layer", () => {
    const { low } = lowerRules("+ [K_A] > 'x'\n", US_BASE);
    const positions = FORM_ROWS[low.grid.form].flatMap((r) => r.map((c) => c.vkey));
    expect(positions).toHaveLength(48);
    for (const l of low.grid.layers) expect(l.cells.map((c) => c.vkey)).toEqual(positions);
  });

  it("fills an unhandled position with the base keyboard's character for the layer", () => {
    const { low } = lowerRules("+ [K_A] > 'x'\n", US_BASE);
    expect(cell(layer(low.grid, "none"), "K_B").base).toBe("b");
    expect(cell(layer(low.grid, "shift"), "K_B").base).toBe("B");
    expect(cell(layer(low.grid, "none"), "K_SPACE").base).toBe(" ");
    expect(cell(layer(low.grid, "none"), "K_B").provenance).toBe("filled");
  });

  it("derives the caps layers as Windows does (research R26)", () => {
    expect(baseCharFor(US_BASE, [], true, "K_B")).toBe("B");
    expect(baseCharFor(US_BASE, ["shift"], true, "K_B")).toBe("b");
    expect(baseCharFor(US_BASE, [], true, "K_1")).toBe("1");
    expect(baseCharFor(US_BASE, ["shift"], true, "K_1")).toBe("!");
  });

  it("exports no layer for a combination with no rule and no base output (row 2.17)", () => {
    const { low } = lowerRules("+ [K_A] > 'x'\n", US_BASE);
    expect(low.grid.layers.map((l) => l.modifiers)).toEqual(["none", "caps", "shift", "shift caps"]);
  });

  it("exports a layer a rule reaches even when the base has no output there, with gaps", () => {
    const { low } = lowerRules("+ [CTRL K_A] > 'x'\n", US_BASE);
    const ctrl = layer(low.grid, "ctrl");
    expect(cell(ctrl, "K_A").ctxless).toBeDefined();
    expect(cell(ctrl, "K_B").base).toBeUndefined();
  });

  it("a position whose rule outputs nul or beep with no context is suppressed and overrides the fill", () => {
    const { low } = lowerRules("+ [K_Q] > nul\n+ [K_W] > beep\n", US_BASE);
    for (const v of ["K_Q", "K_W"]) {
      expect(cell(layer(low.grid, "none"), v).provenance).toBe("suppressed");
      expect(cell(layer(low.grid, "none"), v).ctxless?.plan.suppress).not.toBeNull();
    }
    expect(cell(layer(low.grid, "shift"), "K_Q").provenance).toBe("filled");
  });

  it("records a position a context-only rule covers as authored", () => {
    const { low } = lowerRules("'a' + [K_E] > 'x'\n", US_BASE);
    expect(cell(layer(low.grid, "none"), "K_E").provenance).toBe("authored");
    expect(cell(layer(low.grid, "none"), "K_E").base).toBe("e");
  });

  it("fills from the AZERTY base and has its AltGr layers (research R26)", () => {
    const { low } = lowerRules("+ [K_B] > 'x'\n", AZERTY_BASE);
    expect(cell(layer(low.grid, "none"), "K_A").base).toBe("q");
    expect(low.grid.layers.some((l) => l.modifiers === "altR")).toBe(true);
    expect(baseCharFor(AZERTY_BASE, ["altR"], false, "K_E")).toBe(AZERTY_BASE.layers.altgr["K_E"]);
  });

  it("omits a dead-key cell at a position no rule covers (row 2.26)", () => {
    const { low, xml } = lowerRules("+ [K_B] > 'x'\n", AZERTY_BASE);
    const dead = cell(layer(low.grid, "none"), "K_LBRKT");
    expect(dead.base).toBe("deadkey");
    // The key map has no key there: the row token is the gap.
    const none = /<layer modifiers="none">([\s\S]*?)<\/layer>/.exec(xml)?.[1] ?? "";
    const row1 = [...none.matchAll(/keys="([^"]*)"/g)].map((m) => m[1] ?? "")[1] ?? "";
    expect(row1.split(" ")[10]).toBe("gap");
  });

  it("a rule covering a base dead-key position replaces the dead key", () => {
    const { low } = lowerRules("+ [K_LBRKT] > 'x'\n", AZERTY_BASE);
    expect(cell(layer(low.grid, "none"), "K_LBRKT").ctxless).toBeDefined();
    expect(cell(layer(low.grid, "none"), "K_LBRKT").provenance).toBe("authored");
  });

  it("uses the ISO form when the base keyboard is ISO-family or a rule names K_oE2", () => {
    expect(lowerRules("+ [K_A] > 'x'\n", AZERTY_BASE).low.grid.form).toBe("iso");
    expect(lowerRules("+ [K_oE2] > 'x'\n", US_BASE).low.grid.form).toBe("iso");
    expect(lowerRules("+ [K_A] > 'x'\n", US_BASE).low.grid.form).toBe("us");
  });
});
