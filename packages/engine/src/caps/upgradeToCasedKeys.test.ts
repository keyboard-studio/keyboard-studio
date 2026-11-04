import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { compile } from "../compiler/index.js";
import { buildToleranceCompileVfs } from "../validator/context-tolerance.js";
import { upgradeToCasedKeys } from "./upgradeToCasedKeys.js";

const fx = (p: string) => readFileSync(new URL(`./__fixtures__/${p}`, import.meta.url), "utf8");
const lines = (s: string) => s.split(/\r?\n/);

/** Lines only in `a` and lines only in `b` (multiset diff). */
function lineDiff(a: string, b: string): { removed: string[]; added: string[] } {
  const count = new Map<string, number>();
  for (const l of lines(a)) count.set(l, (count.get(l) ?? 0) + 1);
  const added: string[] = [];
  for (const l of lines(b)) {
    const n = count.get(l) ?? 0;
    if (n > 0) count.set(l, n - 1);
    else added.push(l);
  }
  const removed: string[] = [];
  for (const [l, n] of count) for (let i = 0; i < n; i++) removed.push(l);
  return { removed, added };
}

describe("upgradeToCasedKeys", () => {
  const src = fx("upstream_basic_kbdus/basic_kbdus.kmn");

  it("on upstream basic_kbdus: adds the store, raises the version, drops two rules per letter", () => {
    const { ir } = parse(src, "basic_kbdus");
    const before = emit(ir);
    const res = upgradeToCasedKeys(ir, { bcp47: "en" });
    const { removed, added } = lineDiff(before, emit(res.ir));
    expect(res.versionRaised).toEqual({ from: "10.0", to: "14.0" });
    expect(added.filter((l) => /CasedKeys/i.test(l))).toHaveLength(1);
    expect(added.filter((l) => /&VERSION/i.test(l))).toHaveLength(1);
    const addedRules = added.filter((l) => !/CasedKeys|&VERSION/i.test(l));
    const removedRules = removed.filter((l) => !/&VERSION/i.test(l));
    // Per letter: four rules in (NCAPS/CAPS x plain/SHIFT), two out (NCAPS token dropped, CAPS pair deleted).
    expect(removedRules).toHaveLength(26 * 4);
    expect(addedRules).toHaveLength(26 * 2);
    expect(addedRules.every((l) => /K_[A-Z]\]/.test(l) && !/CAPS/.test(l))).toBe(true);
    expect(lines(emit(res.ir)).filter((l) => /^\+ .*K_A\]/.test(l))).toHaveLength(2);
  });

  it("does not mutate the input IR", () => {
    const { ir } = parse(src, "basic_kbdus");
    const snapshot = JSON.stringify(ir);
    upgradeToCasedKeys(ir, { bcp47: "en" });
    expect(JSON.stringify(ir)).toBe(snapshot);
  });

  it("on no_caps: only the store changes", () => {
    const { ir } = parse(fx("no_caps.kmn"), "no_caps");
    const before = emit(ir);
    const res = upgradeToCasedKeys(ir, { bcp47: "en" });
    const { removed, added } = lineDiff(before, emit(res.ir));
    expect(removed).toEqual([]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatch(/CasedKeys/i);
  });

  it("on numrow_caps: number-row CAPS rules are kept", () => {
    const { ir } = parse(fx("numrow_caps.kmn"), "numrow_caps");
    const res = upgradeToCasedKeys(ir, { bcp47: "en" });
    expect(emit(res.ir)).toMatch(/\[CAPS K_1\]/);
    expect(res.set.keys).not.toContain("K_1");
  });

  it("SC-003: the upgraded upstream basic_kbdus compiles with zero warnings", async () => {
    const { ir } = parse(src, "basic_kbdus");
    const res = upgradeToCasedKeys(ir, { bcp47: "en" });
    const vfs = buildToleranceCompileVfs(res.ir);
    const result = await compile(vfs, "basic_kbdus");
    expect(result.diagnostics.filter((d) => d.severity !== "info" && d.severity !== "hint")).toEqual([]);
  }, 60_000);

  it("writes no store and raises no version when the derived set is empty", () => {
    const { ir } = parse(fx("caseless.kmn"), "caseless");
    const res = upgradeToCasedKeys(ir);
    expect(res.set.keys).toEqual([]);
    expect(res.versionRaised).toBeNull();
    expect(emit(res.ir)).not.toMatch(/&CasedKeys/i);
    expect(emit(res.ir)).toBe(emit(ir));
  });
});
