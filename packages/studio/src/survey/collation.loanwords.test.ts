// loanwordsLast / collateInventory's loanword partition: loanword letters are
// placed after the alphabet's own letters, order-only (never membership).

import { describe, it, expect } from "vitest";
import { collateInventory, loanwordsLast } from "./collation.ts";

describe("loanwordsLast", () => {
  it("moves loanword letters after the rest, keeping each group's order", () => {
    expect(loanwordsLast(["a", "q", "b", "Q", "B"], new Set(["q", "Q"]))).toEqual(["a", "b", "B", "q", "Q"]);
  });

  it("is a copy of the input without a set, or with an empty one", () => {
    const input = ["b", "a"];
    expect(loanwordsLast(input)).toEqual(["b", "a"]);
    expect(loanwordsLast(input, new Set())).toEqual(["b", "a"]);
    expect(loanwordsLast(input)).not.toBe(input);
  });
});

describe("collateInventory with loanwords", () => {
  it("collates letters, then loanword letters, then bare marks", () => {
    const ordered = collateInventory(["́", "x", "b", "a", "c"], new Set(["x", "c"]));
    expect(ordered).toEqual(["a", "b", "c", "x", "́"]);
  });

  it("changes order only, never membership", () => {
    const input = ["q", "a", "̀", "b"];
    expect([...collateInventory(input, new Set(["q"]))].sort()).toEqual([...input].sort());
  });
});
