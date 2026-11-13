import { describe, expect, it } from "vitest";
import { storeItemText } from "./storeItemText";
import type { StoreItem } from "../keyboard-ir";

describe("storeItemText", () => {
  it("returns char values and raw text", () => {
    expect(storeItemText({ kind: "char", value: "a" })).toBe("a");
    expect(storeItemText({ kind: "raw", text: "U+0061" })).toBe("U+0061");
  });

  it("yields the empty string for non-text kinds by default", () => {
    const items: StoreItem[] = [
      { kind: "vkey", name: "K_A" },
      { kind: "deadkey", id: 1 },
      { kind: "namedDeadkey", name: "x" },
      { kind: "any" },
    ];
    for (const it of items) expect(storeItemText(it)).toBe("");
  });

  it("uses the caller's placeholder for non-text kinds only", () => {
    expect(storeItemText({ kind: "any" }, "?")).toBe("?");
    expect(storeItemText({ kind: "char", value: "b" }, "?")).toBe("b");
  });
});
