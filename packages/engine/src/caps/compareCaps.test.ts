import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { upgradeToCasedKeys } from "./upgradeToCasedKeys.js";
import { compareCapsBehaviour } from "./compareCaps.js";

const fx = (p: string) => readFileSync(new URL(`./__fixtures__/${p}`, import.meta.url), "utf8");

async function upgradeAndCompare(src: string, id: string) {
  const { ir } = parse(src, id);
  const before = emit(ir);
  const res = upgradeToCasedKeys(ir, { bcp47: "en" });
  return { res, cmp: await compareCapsBehaviour(before, emit(res.ir), res.set.keys, { bcp47: "en" }) };
}

describe("compareCapsBehaviour", () => {
  it("upstream basic_kbdus before/after is identical", async () => {
    const { cmp } = await upgradeAndCompare(fx("upstream_basic_kbdus/basic_kbdus.kmn"), "basic_kbdus");
    expect(cmp.error).toBeUndefined();
    expect(cmp.verdict).toBe("identical");
    expect(cmp.rows.length).toBeGreaterThanOrEqual(26);
  }, 60_000);

  it("no_caps gains uppercase; only the caps cells change", async () => {
    const { cmp } = await upgradeAndCompare(fx("no_caps.kmn"), "no_caps");
    expect(cmp.verdict).toBe("gains-uppercase");
    for (const row of cmp.rows) {
      expect(row.after.none).toBe(row.before.none);
      expect(row.after.shift).toBe(row.before.shift);
    }
    const changed = cmp.rows.filter((r) => r.verdict === "gains-uppercase");
    expect(changed.length).toBeGreaterThan(0);
    const a = cmp.rows.find((r) => r.vkey === "K_A" && r.plane === "base")!;
    expect(a.after).toEqual({ none: "a", shift: "A", caps: "A", shiftCaps: "a" });
  }, 60_000);

  it("numrow_caps with the strip forced onto the number row differs, naming those keys", async () => {
    const { ir } = parse(fx("numrow_caps.kmn"), "numrow_caps");
    const before = emit(ir);
    const forced = ["K_1", "K_2"];
    const out = structuredClone(ir);
    // Apply the same key-scoped rewrite the upgrade uses, but force it onto the number row.
    const { replaceCapsRules } = await import("./replaceCapsRules.js");
    replaceCapsRules(out, new Set(forced));
    const cmp = await compareCapsBehaviour(before, emit(out), forced, { bcp47: "en" });
    expect(cmp.verdict).toBe("differs");
    expect(new Set(cmp.differs.map((r) => r.vkey))).toEqual(new Set(forced));
  }, 60_000);

  it("covers outputs after a deadkey that reaches a key in the set", async () => {
    const src = [
      "store(&VERSION) '14.0'",
      "store(&NAME) 'dk'",
      "store(&TARGETS) 'any'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [K_QUOTE] > dk(acute)",
      "+ [K_A] > 'a'",
      "+ [SHIFT K_A] > 'A'",
      "dk(acute) + [K_A] > U+00E1",
      "dk(acute) + [SHIFT K_A] > U+00C1",
      "",
    ].join("\n");
    const { ir } = parse(src, "dk");
    const res = upgradeToCasedKeys(ir, { bcp47: "en" });
    const cmp = await compareCapsBehaviour(emit(ir), emit(res.ir), res.set.keys, { bcp47: "en" });
    const viaDk = cmp.rows.filter((r) => r.afterDeadkey !== undefined);
    expect(viaDk.length).toBeGreaterThan(0);
    expect(viaDk.some((r) => r.before.none === "á")).toBe(true);
  }, 60_000);
});
