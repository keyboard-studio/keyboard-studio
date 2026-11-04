import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "../codec/parse.js";
import { emit } from "../codec/emit.js";
import { replaceCapsRules } from "./replaceCapsRules.js";

const fx = (p: string) => readFileSync(new URL(`./__fixtures__/${p}`, import.meta.url), "utf8");
const AZ = new Set(Array.from({ length: 26 }, (_, i) => `K_${String.fromCharCode(65 + i)}`));

describe("replaceCapsRules", () => {
  it("collapses each letter's four rules to two on upstream basic_kbdus", () => {
    const { ir } = parse(fx("upstream_basic_kbdus/basic_kbdus.kmn"), "basic_kbdus");
    replaceCapsRules(ir, AZ);
    const out = emit(ir);
    expect(out).toMatch(/\+ \[K_A\] > U\+0061/);
    expect(out).toMatch(/\+ \[SHIFT K_A\] > U\+0041/);
    expect(out).not.toMatch(/CAPS K_A/);
    expect(out).not.toMatch(/CAPS SHIFT K_A/);
    expect(out.match(/K_A\]/g)?.length).toBe(2);
  });

  it("leaves digit and punctuation rules byte-identical", () => {
    const src = fx("upstream_basic_kbdus/basic_kbdus.kmn");
    const before = emit(parse(src, "basic_kbdus").ir);
    const { ir } = parse(src, "basic_kbdus");
    replaceCapsRules(ir, AZ);
    const keep = (s: string) => s.split(/\r?\n/).filter((l) => /K_(\d|HYPHEN|COLON|COMMA)/.test(l));
    expect(keep(emit(ir))).toEqual(keep(before));
  });

  it("keeps number-row CAPS rules when only A-Z is in keys", () => {
    const { ir } = parse(fx("numrow_caps.kmn"), "numrow_caps");
    const before = emit(ir);
    replaceCapsRules(ir, AZ);
    expect(emit(ir)).toBe(before);
    expect(emit(ir)).toMatch(/\[CAPS K_1\]/);
  });

  it("skips readonly groups", () => {
    const { ir } = parse(fx("upstream_basic_kbdus/basic_kbdus.kmn"), "basic_kbdus");
    for (const g of ir.groups) g.readonly = true;
    const before = emit(ir);
    replaceCapsRules(ir, AZ);
    expect(emit(ir)).toBe(before);
  });

  it("matches key names case-insensitively (K_oE2 against K_OE2)", () => {
    const src = [
      "store(&VERSION) '14.0'",
      "store(&NAME) 'x'",
      "begin Unicode > use(main)",
      "group(main) using keys",
      "+ [NCAPS K_oE2] > 'a'",
      "+ [CAPS K_oE2] > 'A'",
      "",
    ].join("\n");
    const { ir } = parse(src, "x");
    replaceCapsRules(ir, new Set(["K_OE2"]));
    const out = emit(ir);
    expect(out).not.toMatch(/CAPS/);
    expect(out.match(/oE2\]/gi)?.length).toBe(1);
  });
});
