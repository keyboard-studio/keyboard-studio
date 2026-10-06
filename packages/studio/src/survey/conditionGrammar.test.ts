import { describe, it, expect } from "vitest";
import { evalConditionGrammar } from "./conditionGrammar.ts";

const resolve = (lhs: string): string | undefined =>
  lhs === "value" ? "a" : lhs === "ctx.k" ? "z" : undefined;

describe("evalConditionGrammar", () => {
  it("evaluates == and != against value and ctx", () => {
    expect(evalConditionGrammar("value == 'a'", resolve, true)).toBe(true);
    expect(evalConditionGrammar("value != 'a'", resolve, true)).toBe(false);
    expect(evalConditionGrammar("ctx.k == 'z'", resolve, true)).toBe(true);
    expect(evalConditionGrammar("ctx.k != 'z'", resolve, true)).toBe(false);
  });

  it("applies or (loosest) and and", () => {
    expect(evalConditionGrammar("value == 'b' or value == 'a'", resolve, true)).toBe(true);
    expect(evalConditionGrammar("value == 'a' and ctx.k == 'q'", resolve, true)).toBe(false);
    expect(evalConditionGrammar("value == 'a' and ctx.k == 'z'", resolve, true)).toBe(true);
  });

  it("returns undefined for unmappable lhs and unknown grammar", () => {
    expect(evalConditionGrammar("ctx.other == 'x'", resolve, true)).toBeUndefined();
    expect(evalConditionGrammar("nonsense", resolve, true)).toBeUndefined();
  });

  it("propagate=true makes a combinator undefined when any clause is", () => {
    expect(evalConditionGrammar("value == 'a' or ctx.other == 'x'", resolve, true)).toBeUndefined();
    expect(evalConditionGrammar("value == 'b' and nonsense", resolve, true)).toBeUndefined();
  });

  it("propagate=false treats undefined clauses as not-true", () => {
    expect(evalConditionGrammar("nonsense or value == 'a'", resolve, false)).toBe(true);
    expect(evalConditionGrammar("value == 'a' and nonsense", resolve, false)).toBe(false);
  });
});
