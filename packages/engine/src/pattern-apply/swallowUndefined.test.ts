import { describe, it, expect } from "vitest";
import { createVirtualFS, uniformFallbackPolicy, type FallbackPolicy } from "@keyboard-studio/contracts";
import { irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { emit } from "../codec/emit.js";
import { parse } from "../codec/parse.js";
import { compile } from "../compiler/index.js";
import { compileCarveSuppression } from "./carveSuppression.js";
import { dispositionsForFallbackPolicy, type Leak } from "./fallbackPolicy.js";
import { applySwallowUndefined, SWALLOW_UNDEFINED_OWNER, swallowedPositions } from "./swallowUndefined.js";
import { enumerateUnhandledPositions } from "./unhandledPositions.js";

const ALL_SWALLOW = uniformFallbackPolicy("swallow");

function keyboard(rules = [vkeyRule({ nodeId: "a", vkey: "K_A", output: "a" })]): KeyboardIR {
  return makeTestIR({ groups: [irGroup({ nodeId: "group#main", rules })] });
}

/** A US-like leak for one key on one layer. */
function leak(
  key: string,
  modifiers: string,
  char: string,
  leakClass: "letters" | "digits" | "punctuation",
): Leak {
  return { position: { key, modifiers }, baseKeyboard: "us", outcome: { kind: "char", char, leakClass } };
}

const isOwn = (x: { ownedByBehaviour?: string | undefined }) =>
  x.ownedByBehaviour === SWALLOW_UNDEFINED_OWNER;
const storeOf = (ir: KeyboardIR) => ir.stores.find(isOwn);
const hasKey = (ir: KeyboardIR, key: string) =>
  JSON.stringify(storeOf(ir)?.items).includes(`"${key}"`);
const ruleOf = (ir: KeyboardIR) => ir.groups.flatMap((g) => g.rules).find(isOwn);

describe("applySwallowUndefined", () => {
  it("emits one store and one nul rule, never nomatch", () => {
    const out = applySwallowUndefined(keyboard(), { policy: ALL_SWALLOW, leaks: [] });
    const rules = out.groups.flatMap((g) => g.rules);
    expect(out.stores.filter(isOwn)).toHaveLength(1);
    expect(rules.filter(isOwn)).toHaveLength(1);
    expect(ruleOf(out)?.output).toEqual([{ kind: "nul" }]);
    expect(rules.some((r) => r.matchKind === "nomatch")).toBe(false);
  });

  it("covers only bound layers and never lists frame keys", () => {
    const swallowed = swallowedPositions(keyboard(), { policy: ALL_SWALLOW, leaks: [] });
    expect(swallowed.length).toBeGreaterThan(0);
    expect(swallowed.every((p) => p.layerBound)).toBe(true);
    expect(swallowed.some((p) => p.key === "K_A" && p.modifiers === "")).toBe(false);
    const out = applySwallowUndefined(keyboard(), { policy: ALL_SWALLOW, leaks: [] });
    const items = JSON.stringify(storeOf(out)?.items);
    for (const frame of ["K_BKSP", "K_ENTER", "K_TAB", "K_ESC", "K_DEL", "K_SPACE", "K_LEFT"]) {
      expect(items).not.toContain(frame);
    }
  });

  it("does not cover a layer the keyboard never binds (RALT unbound)", () => {
    const out = applySwallowUndefined(keyboard(), { policy: ALL_SWALLOW, leaks: [] });
    expect(JSON.stringify(storeOf(out)?.items)).not.toContain("RALT");
  });

  it("covers a layer once a binding exists on it, and recomputes when the binding goes", () => {
    const withRalt = keyboard([
      vkeyRule({ nodeId: "a", vkey: "K_A", output: "a" }),
      vkeyRule({ nodeId: "r", vkey: "K_E", modifiers: ["RALT"], output: "e" }),
    ]);
    const on = applySwallowUndefined(withRalt, { policy: ALL_SWALLOW, leaks: [] });
    expect(JSON.stringify(storeOf(on)?.items)).toContain("RALT K_A");
    const without: KeyboardIR = {
      ...on,
      groups: on.groups.map((g) => ({ ...g, rules: g.rules.filter((r) => r.nodeId !== "r") })),
    };
    const off = applySwallowUndefined(without, { policy: ALL_SWALLOW, leaks: [] });
    expect(JSON.stringify(storeOf(off)?.items)).not.toContain("RALT");
    expect(off.stores.filter(isOwn)).toHaveLength(1);
  });

  it("is idempotent", () => {
    const once = applySwallowUndefined(keyboard(), { policy: ALL_SWALLOW, leaks: [] });
    const twice = applySwallowUndefined(once, { policy: ALL_SWALLOW, leaks: [] });
    expect(twice).toEqual(once);
  });

  it("emits nothing when every class passes through", () => {
    const ir = keyboard();
    const out = applySwallowUndefined(ir, { policy: uniformFallbackPolicy("pass-through"), leaks: [] });
    expect(out).toEqual(ir);
  });

  it("does not mutate its input", () => {
    const ir = keyboard();
    const before = structuredClone(ir);
    applySwallowUndefined(ir, { policy: ALL_SWALLOW, leaks: [] });
    expect(ir).toEqual(before);
  });

  it("swallows only positions whose leak is in a Do nothing class on some picked keyboard", () => {
    const policy: FallbackPolicy = { letters: "swallow", digits: "pass-through", punctuation: "pass-through" };
    const leaks: Leak[] = [
      leak("K_B", "", "b", "letters"),
      leak("K_1", "", "1", "digits"),
      leak("K_2", "", "2", "digits"),
      { ...leak("K_2", "", "z", "letters"), baseKeyboard: "ru" },
      leak("K_COMMA", "", ",", "punctuation"),
    ];
    const keys = swallowedPositions(keyboard(), { policy, leaks })
      .filter((p) => p.modifiers === "")
      .map((p) => p.key);
    expect(keys).toContain("K_B");
    expect(keys).toContain("K_2");
    expect(keys).not.toContain("K_1");
    expect(keys).not.toContain("K_COMMA");
  });

  it("does not emit a position carve suppression already owns (no double emit)", () => {
    const base = keyboard([
      vkeyRule({ nodeId: "a", vkey: "K_A", output: "a" }),
      vkeyRule({ nodeId: "b", vkey: "K_B", output: "b" }),
    ]);
    const suppressed = compileCarveSuppression(base, dispositionsForFallbackPolicy("swallow", ["b"])).ir;
    const out = applySwallowUndefined(suppressed, { policy: ALL_SWALLOW, leaks: [] });
    expect(hasKey(out, "K_B")).toBe(false);
  });

  it("skips a position a behaviour-owned rule binds even when only conditionally", () => {
    const owned = vkeyRule({ nodeId: "own", vkey: "K_Q", output: "q", ownedByBehaviour: "some-pack/behaviour" });
    owned.context.unshift({ kind: "char", value: "x" });
    const ir = keyboard([vkeyRule({ nodeId: "a", vkey: "K_A", output: "a" }), owned]);
    const out = applySwallowUndefined(ir, { policy: ALL_SWALLOW, leaks: [] });
    expect(hasKey(out, "K_Q")).toBe(false);
    expect(hasKey(out, "K_P")).toBe(true);
  });

  it("compiles through kmcmplib and leaves no unhandled bound-layer position", async () => {
    const source = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'x'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_A] > 'a'",
      "+ [SHIFT K_B] > 'b'",
      "",
    ].join("\n");
    const ir = parse(source, "x").ir;
    const out = applySwallowUndefined(ir, { policy: ALL_SWALLOW, leaks: [] });
    const kmn = emit(out);
    expect(kmn).toContain("any(swallowUndefined) > nul");
    expect(kmn).not.toMatch(/nomatch/);
    const vfs = createVirtualFS([{ path: "source/x.kmn", content: kmn, isBinary: false }]);
    const result = await compile(vfs, "x");
    expect(result.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal")).toEqual([]);
    expect(result.artifacts.some((a) => a.filename.endsWith(".kmx"))).toBe(true);
    const remaining = enumerateUnhandledPositions(parse(kmn, "x").ir).filter((p) => p.layerBound);
    // The store's `any()` binds every swallowed position, so the re-parsed IR handles them all.
    expect(remaining).toHaveLength(0);
  }, 60_000);
});
