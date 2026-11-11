/**
 * Round-trip fixtures for the typed IR members added in spec 116 phase 6:
 * `layer`, `set`, `save`, `reset`, `call`, `return` (output), `platform`
 * (context, head position) and `outs` (store item).
 *
 * "Round-trips" here is the notion roundtrip.test.ts and roundtrip-if-guards.test.ts
 * use: emit(parse(src)) is equivalent to src. Each fixture asserts, in order:
 *   1. the construct is a typed member and no fragment of its old opaque reason
 *      is produced (the anti-cheat: an opaque fragment also round-trips verbatim);
 *   2. the emitted text holds the construct;
 *   3. re-parsing the emitted text gives an IR equal under normaliseForComparison;
 *   4. the canonical emit is a fixed point.
 */

import { describe, it, expect } from "vitest";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { normaliseForComparison } from "./normalise-ir.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";

const HEAD = `store(&VERSION) '1.0'
store(&NAME) 'typed members fixture'
store(&TARGETS) 'any'
store(opt) '0'
store(a) 'abc'
`;

function fixture(rules: string, groupHeader = "group(main) using keys"): string {
  return `${HEAD}
begin Unicode > use(main)

${groupHeader}
${rules}
`;
}

const rulesOf = (ir: KeyboardIR): IRRule[] => ir.groups.flatMap((g) => g.rules);

/** Steps 2-4: the emitted text holds `emitted`, re-parses to an equal IR, and is a fixed point. */
function expectRoundTrip(src: string, emitted: string): KeyboardIR {
  const { ir } = parse(src, "kb");
  const text1 = emit(ir);
  expect(text1).toContain(emitted);
  const { ir: ir2 } = parse(text1, "kb");
  expect(normaliseForComparison(ir2)).toEqual(normaliseForComparison(ir));
  expect(emit(ir2)).toBe(text1);
  return ir;
}

describe("typed members round-trip (spec 116 phase 6)", () => {
  it("layer('x') is a typed output element", () => {
    const src = fixture(`+ [K_A] > layer('shift')`);
    const ir = expectRoundTrip(src, `layer('shift')`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "layer", value: "shift" }]);
    expect(ir.raw).toEqual([]);
  });

  it("a double-quoted layer name reads the same and emits canonically", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > layer("shift")`), `layer('shift')`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "layer", value: "shift" }]);
  });

  it("set(&layer = 'x') is a typed output element on a system store", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > set(&layer = 'shift')`), `set(&layer = 'shift')`);
    expect(rulesOf(ir)[0]?.output).toEqual([
      { kind: "set", storeRef: "&layer", value: [{ kind: "char", value: "s" }, { kind: "char", value: "h" }, { kind: "char", value: "i" }, { kind: "char", value: "f" }, { kind: "char", value: "t" }] },
    ]);
    expect(ir.raw).toEqual([]);
  });

  it("set(opt = 'v') keeps a store ref as written and its value text", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > set(opt = '1')`), `set(opt = '1')`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "set", storeRef: "opt", value: [{ kind: "char", value: "1" }] }]);
    expect(ir.raw.map((f) => f.reason)).not.toContain(OPAQUE_REASONS.OPTION_STORE_DIRECTIVE);
  });

  it("set() value carries deadkeys and outs, in order", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > set(opt = dk(1) outs(a))`), `set(opt = dk(0001) outs(a))`);
    expect(rulesOf(ir)[0]?.output).toEqual([
      { kind: "set", storeRef: "opt", value: [{ kind: "deadkey", id: 1 }, { kind: "outs", storeRef: "a" }] },
    ]);
  });

  it("set() with an empty-string value round-trips as the empty literal", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > set(opt = '')`), `set(opt = '')`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "set", storeRef: "opt", value: [] }]);
  });

  it("save(opt) is a typed output element", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > save(opt)`), `save(opt)`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "save", storeRef: "opt" }]);
    expect(ir.raw).toEqual([]);
  });

  it("reset(opt) is a typed output element", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > reset(opt)`), `reset(opt)`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "reset", storeRef: "opt" }]);
    expect(ir.raw).toEqual([]);
  });

  it("call(store) is a typed output element", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > call(routine)`), `call(routine)`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "call", storeRef: "routine" }]);
    expect(ir.raw.map((f) => f.reason)).not.toContain(OPAQUE_REASONS.CALL_RETURN);
  });

  it("return is a typed output element", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > return`), `> return`);
    expect(rulesOf(ir)[0]?.output).toEqual([{ kind: "return" }]);
    expect(ir.raw).toEqual([]);
  });

  it("typed statements sit among other output elements", () => {
    const ir = expectRoundTrip(fixture(`+ [K_A] > 'x' set(opt = '1') layer('shift')`), `set(opt = '1') layer('shift')`);
    expect(rulesOf(ir)[0]?.output.map((el) => el.kind)).toEqual(["char", "set", "layer"]);
  });

  it("a head platform('x') is a typed context element", () => {
    const ir = expectRoundTrip(fixture(`platform('touch') + [K_A] > 'a'`), `platform('touch')`);
    expect(rulesOf(ir)[0]?.context[0]).toEqual({ kind: "platform", value: "touch" });
    expect(ir.raw).toEqual([]);
  });

  it("platform() ahead of an if() guard keeps the if() typed (the head cluster)", () => {
    const ir = expectRoundTrip(fixture(`platform('touch') if(opt = '0') + [K_A] > 'a'`), `platform('touch') if(opt = '0')`);
    expect(rulesOf(ir)[0]?.context.slice(0, 2)).toEqual([
      { kind: "platform", value: "touch" },
      { kind: "if", store: "opt", value: "0" },
    ]);
    expect(ir.raw.map((f) => f.reason)).not.toContain(OPAQUE_REASONS.IF_OPTION_STORE);
  });

  it("a platform() that is not in head position stays a raw element", () => {
    const ir = expectRoundTrip(fixture(`'x' platform('touch') > 'y'`, "group(main)"), `platform('touch')`);
    const ctx = rulesOf(ir)[0]?.context ?? [];
    expect(ctx.some((el) => el.kind === "platform")).toBe(false);
    expect(ctx).toContainEqual({ kind: "raw", text: "platform('touch')" });
  });

  it("a platform() with an argument that is not a quoted literal stays a raw element", () => {
    const { ir } = parse(fixture(`platform(touch) + [K_A] > 'a'`), "kb");
    const ctx = rulesOf(ir)[0]?.context ?? [];
    expect(ctx.some((el) => el.kind === "platform")).toBe(false);
  });

  it("outs(store) in a store body is a typed store item, and the store is not a fragment", () => {
    const src = fixture(`+ [K_A] > 'x'`).replace("store(a) 'abc'", "store(a) 'abc'\nstore(b) outs(a) 'z'");
    const ir = expectRoundTrip(src, `store(b) outs(a) 'z'`);
    expect(ir.stores.find((s) => s.name === "b")?.items).toEqual([
      { kind: "outs", storeRef: "a" },
      { kind: "char", value: "z" },
    ]);
    expect(ir.raw.map((f) => f.reason)).not.toContain(OPAQUE_REASONS.OUTS_EXPANSION);
  });

  it("emits a store ahead of the store whose outs() names it", () => {
    const src = fixture(`+ [K_A] > 'x'`).replace("store(a) 'abc'", "store(b) outs(a)\nstore(a) 'abc'");
    const text = emit(parse(src, "kb").ir);
    expect(text.indexOf("store(a) ")).toBeLessThan(text.indexOf("store(b) "));
  });

  // Spec 103 / FR-025: these stay opaque; typing the new members does not move them.
  it("an if() with a <> comparison stays an opaque fragment", () => {
    const { ir } = parse(fixture(`if(opt <> '1') + [K_A] > 'a'`), "kb");
    expect(ir.raw.map((f) => f.reason)).toEqual([OPAQUE_REASONS.IF_OPTION_STORE]);
  });

  it("a save()/set() form the typed members cannot hold stays an option-store-directive fragment", () => {
    const { ir } = parse(fixture(`+ [K_A] > save(opt, 1)\n+ [K_B] > set(opt)`), "kb");
    expect(ir.raw.map((f) => f.reason)).toEqual([
      OPAQUE_REASONS.OPTION_STORE_DIRECTIVE,
      OPAQUE_REASONS.OPTION_STORE_DIRECTIVE,
    ]);
  });

  it("outs() in a rule's output stays an outs-expansion fragment (not one of the typed members)", () => {
    const { ir } = parse(fixture(`+ [K_A] > outs(a)`), "kb");
    expect(ir.raw.map((f) => f.reason)).toEqual([OPAQUE_REASONS.OUTS_EXPANSION]);
  });
});
