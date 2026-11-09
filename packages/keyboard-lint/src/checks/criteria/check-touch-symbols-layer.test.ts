import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseTouchLayoutString } from "@keyboard-studio/contracts";
import { checkTouchSymbolsLayer } from "./check-touch-symbols-layer.js";

const PATH = "source/demo.keyman-touch-layout";
const engineFx = (p: string) =>
  readFileSync(new URL(`../../../../engine/src/caps/__fixtures__/${p}`, import.meta.url), "utf8");
const FORK = new URL(
  "../../../../../../keyboards/release/basic/basic_kbdus/source/basic_kbdus.keyman-touch-layout",
  import.meta.url,
);

type Key = Record<string, unknown>;
function layout(layers: Record<string, Key[]>, platform = "tablet") {
  return parseTouchLayoutString(
    JSON.stringify({
      [platform]: { layer: Object.entries(layers).map(([id, key]) => ({ id, row: [{ id: 1, key }] })) },
    }),
  );
}
const messages = (r: ReturnType<typeof checkTouchSymbolsLayer>) => r.findings.map((f) => f.message).join("\n");
const link: Key = { id: "K_SYMBOLS", text: "*Symbol*", sp: 1, nextlayer: "symbol" };

describe("checkTouchSymbolsLayer (18.18)", () => {
  it("passes with a reason when there is no touch layout", () => {
    const r = checkTouchSymbolsLayer(undefined, PATH);
    expect(r.findings).toEqual([]);
    expect(r.verified.join(" ")).toMatch(/no touch layout/i);
  });

  it("fails the upstream basic_kbdus tablet: no symbol layer", () => {
    const r = checkTouchSymbolsLayer(
      parseTouchLayoutString(engineFx("upstream_basic_kbdus/basic_kbdus.keyman-touch-layout")),
      PATH,
    );
    expect(r.code).toBe("KM_LINT_TOUCH_SYMBOLS_LAYER");
    expect(messages(r)).toContain('Platform "tablet": no symbol layer');
    // The phone has its own numerals / symbol / currency scheme.
    expect(messages(r)).not.toContain('Platform "phone"');
  });

  it("fails a symbol layer that no layer links to", () => {
    const r = checkTouchSymbolsLayer(
      layout({ default: [{ id: "K_Q", text: "q" }], shift: [link], symbol: [{ id: "K_1", text: "1" }] }),
      PATH,
    );
    expect(messages(r)).toContain("no K_SYMBOLS link key on: default");
  });

  it("passes when every non-symbol layer links and the symbol family is exempt", () => {
    const r = checkTouchSymbolsLayer(
      layout({ default: [link], shift: [link], caps: [{ ...link, nextlayer: "symbol-caps" }], symbol: [{ id: "K_1", text: "1" }], "symbol-caps": [{ id: "K_1", text: "1" }] }),
      PATH,
    );
    expect(r.findings).toEqual([]);
  });

  it("does not ask for K_SYMBOLS on the numerals scheme", () => {
    const r = checkTouchSymbolsLayer(
      layout({
        default: [{ id: "K_NUMERALS", text: "*123*", sp: 1, nextlayer: "numeric" }],
        numeric: [{ id: "K_SYMBOLS", text: "*Symbol*", sp: 1, nextlayer: "symbol" }],
        symbol: [{ id: "K_1", text: "1" }],
      }),
      PATH,
    );
    expect(r.findings).toEqual([]);
  });

  it.skipIf(!existsSync(FORK))("passes the fork basic_kbdus layout", () => {
    expect(checkTouchSymbolsLayer(parseTouchLayoutString(readFileSync(FORK, "utf8")), PATH).findings).toEqual([]);
  });
});
