import { describe, expect, it } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { chooseByPolicy } from "./walkPolicy.ts";
import { placeholderClash, placeholderFor } from "./placeholder.ts";

describe("chooseByPolicy", () => {
  const base = { decisionId: "d", suggestions: ["s1", "s2"], defaultValue: "def", placeholder: () => "ph" };

  it("prefers override, then top suggestion, then default, then placeholder", () => {
    expect(chooseByPolicy({ ...base, override: "ov" })).toMatchObject({ rule: "override", value: "ov" });
    expect(chooseByPolicy(base)).toMatchObject({ rule: "top-suggestion", value: "s1" });
    expect(chooseByPolicy({ ...base, suggestions: [] })).toMatchObject({ rule: "default", value: "def" });
    const { defaultValue: _d, ...noDefault } = base;
    expect(chooseByPolicy({ ...noDefault, suggestions: [] })).toMatchObject({ rule: "placeholder", value: "ph" });
  });

  it("records the proposal source on product-offered choices only", () => {
    expect(chooseByPolicy({ ...base, proposalSource: "fn" }).proposalSource).toBe("fn");
    expect(chooseByPolicy({ ...base, override: "ov", proposalSource: "fn" }).proposalSource).toBeUndefined();
  });

  it("throws when nothing is available", () => {
    expect(() => chooseByPolicy({ decisionId: "d", suggestions: [] })).toThrow(/no option/);
  });
});

describe("placeholder", () => {
  it("types zzq plus lowercase hex per code point, no separator", () => {
    expect(placeholderFor("ŋ")).toEqual({ sequence: "zzq14b", indicator: "j" });
    expect(placeholderFor("ń").sequence).toBe("zzq6e301");
    expect(placeholderFor("\u{1D400}").sequence).toBe("zzq1d400");
  });

  const irWith = (text: string): KeyboardIR =>
    ({
      groups: [
        {
          rules: [{ context: [...text].map((value) => ({ kind: "char", value })), output: [] }],
        },
      ],
    }) as unknown as KeyboardIR;

  it("detects a clash with a sequence the keyboard already types", () => {
    expect(placeholderClash("zzq14b", irWith("azzq14bx"))).toBe(true);
    expect(placeholderClash("zzq14b", irWith("zzq14c"))).toBe(false);
  });
});
