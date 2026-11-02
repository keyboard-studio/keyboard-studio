// projectWorkingCopyVfs with a per-class fallback policy (spec 109 FR-021, SC-006):
// an unconfirmed policy leaves the compiled keyboard unchanged; a confirmed
// "Do nothing" adds one store and one nul rule even with nothing carved.

import { describe, expect, it } from "vitest";
import { createVirtualFS, uniformFallbackPolicy } from "@keyboard-studio/contracts";
import type { FallbackPolicy } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";

import { projectWorkingCopyVfs } from "./projectWorkingCopyVfs.ts";
import { buildFallbackLeaks, fallbackLeaksForProjection, baseKeyboardsForFallback } from "./fallbackLeaks.ts";

const KMN = [
  "store(&NAME) 'Projected'",
  "store(&VERSION) '14.0'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "+ [K_A] > 'a'",
  "+ [SHIFT K_B] > 'b'",
  "",
].join("\n");

function project(opts: { policy?: FallbackPolicy; confirmed?: boolean; picks?: string[] }): string {
  const vfs = createVirtualFS();
  vfs.set("source/projected.kmn", KMN, false);
  const startIr = parseKmn(KMN, "projected").ir;
  const leaks =
    opts.policy === undefined
      ? undefined
      : fallbackLeaksForProjection(startIr, opts.policy, opts.confirmed === true, opts.picks ?? ["basic_kbdus"]);
  projectWorkingCopyVfs({
    vfs,
    keyboardId: "projected",
    startIr,
    deletedNodeIds: new Set(),
    assignments: [],
    getPattern: () => undefined,
    identity: null,
    ...(opts.policy !== undefined ? { fallbackPolicy: opts.policy } : {}),
    ...(opts.confirmed === true ? { fallbackPolicyConfirmed: true } : {}),
    ...(leaks !== undefined ? { fallbackLeaks: leaks } : {}),
  });
  const entry = vfs.get("source/projected.kmn");
  return typeof entry?.content === "string" ? entry.content : "";
}

describe("projectWorkingCopyVfs swallowUndefined gate", () => {
  const swallow = uniformFallbackPolicy("swallow");

  it("an unconfirmed policy leaves the compiled keyboard byte-identical", () => {
    const baseline = project({});
    expect(project({ policy: swallow, confirmed: false })).toBe(baseline);
    expect(baseline).not.toContain("swallowUndefined");
  });

  it("a confirmed Do nothing adds one store and one nul rule with nothing carved", () => {
    const out = project({ policy: swallow, confirmed: true });
    expect(out.match(/store\(swallowUndefined\)/g)).toHaveLength(1);
    expect(out.match(/\+ any\(swallowUndefined\) > nul/g)).toHaveLength(1);
    expect(out).not.toMatch(/nomatch/);
    expect(out).not.toMatch(/K_ENTER|K_BKSP/);
  });

  it("a confirmed policy with every class passing through changes nothing", () => {
    const baseline = project({});
    expect(project({ policy: uniformFallbackPolicy("pass-through"), confirmed: true })).toBe(baseline);
  });

  it("only the Do nothing classes are swallowed, by what the picked keyboard types", () => {
    const lettersOnly: FallbackPolicy = { letters: "swallow", digits: "pass-through", punctuation: "pass-through" };
    const out = project({ policy: lettersOnly, confirmed: true });
    const store = out.split("\n").find((l) => l.startsWith("store(swallowUndefined)")) ?? "";
    expect(store).toContain("[K_C]");
    expect(store).not.toContain("[K_1]");
    expect(store).not.toContain("[K_COMMA]");
  });
});

describe("buildFallbackLeaks", () => {
  const ir = parseKmn(KMN, "projected").ir;

  it("joins characters from each picked base keyboard, classed by General Category", () => {
    const leaks = buildFallbackLeaks(ir, ["basic_kbdus", "basic_kbdfr"]);
    const at = (base: string, key: string, mods: string) =>
      leaks.find((l) => l.baseKeyboard === base && l.position.key === key && l.position.modifiers === mods)?.outcome;
    expect(at("basic_kbdus", "K_1", "")).toEqual({ kind: "char", char: "1", leakClass: "digits" });
    expect(at("basic_kbdfr", "K_1", "")).toMatchObject({ kind: "char", leakClass: "punctuation" });
    expect(at("basic_kbdus", "K_C", "")).toEqual({ kind: "char", char: "c", leakClass: "letters" });
  });

  it("says unknown for a layout with no data, never a guess", () => {
    const leaks = buildFallbackLeaks(ir, ["basic_kbdnotalayout"]);
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.every((l) => l.outcome.kind === "unknown")).toBe(true);
  });

  it("uses the likely base keyboards when none were picked", () => {
    expect(baseKeyboardsForFallback([], ["fr-FR"]).length).toBeGreaterThan(0);
    expect(baseKeyboardsForFallback(["basic_kbdgr"], ["fr-FR"])).toEqual(["basic_kbdgr"]);
  });
});
