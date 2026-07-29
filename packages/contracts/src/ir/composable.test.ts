import { describe, it, expect } from "vitest";
import { augmentWithComposable, composableComponentsFor } from "./composable.js";

describe("augmentWithComposable", () => {
  it("adds U+00DB (Û) when its NFD base and combining mark are both produced", () => {
    const produced = new Set(["U", "̂"]); // U + COMBINING CIRCUMFLEX ACCENT
    const result = augmentWithComposable(produced, ["Û"]); // Û

    expect(result.has("Û")).toBe(true);
  });

  it("does NOT add Û when only the base letter is produced (mark missing)", () => {
    const produced = new Set(["U"]);
    const result = augmentWithComposable(produced, ["Û"]);

    expect(result.has("Û")).toBe(false);
  });

  it("Ệ (U+1EC6) needs base E + circumflex U+0302 + dot-below U+0323 — all present composes", () => {
    const produced = new Set(["E", "̂", "̣"]);
    const result = augmentWithComposable(produced, ["Ệ"]);

    expect(result.has("Ệ")).toBe(true);
  });

  it("Ệ (U+1EC6) is NOT composable when the dot-below is missing", () => {
    const produced = new Set(["E", "̂"]); // dot-below (U+0323) absent
    const result = augmentWithComposable(produced, ["Ệ"]);

    expect(result.has("Ệ")).toBe(false);
  });

  it("an NFD-stable char (e.g. 'a') is unaffected — not added when absent from produced", () => {
    const produced = new Set(["b", "c"]);
    const result = augmentWithComposable(produced, ["a"]);

    expect(result.has("a")).toBe(false);
    expect(result.size).toBe(2);
  });

  it("a char already directly in produced stays in the result", () => {
    const produced = new Set(["Û"]); // Û already directly produced
    const result = augmentWithComposable(produced, ["Û"]);

    expect(result.has("Û")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("empty inventory returns a copy of produced (not the same reference, same contents)", () => {
    const produced = new Set(["a", "b"]);
    const result = augmentWithComposable(produced, []);

    expect(result).not.toBe(produced);
    expect([...result].sort()).toEqual(["a", "b"]);
  });
});

describe("composableComponentsFor", () => {
  it("Û with U+U+0302 both produced -> { components: ['U', '̂'] } in NFD order", () => {
    const produced = new Set(["U", "̂"]);
    const result = composableComponentsFor(produced, "Û");

    expect(result).toEqual({ components: ["U", "̂"] });
  });

  it("Ệ needs all 3 components (E + circumflex + dot-below) -> composes when all present", () => {
    const produced = new Set(["E", "̂", "̣"]);
    const result = composableComponentsFor(produced, "Ệ");

    // NFD canonical ordering sorts combining marks by combining class, which
    // places the dot-below (ccc 220) before the circumflex (ccc 230) — not
    // the char's own visual/typing order.
    expect(result).toEqual({ components: ["E", "̣", "̂"] });
  });

  it("missing a mark -> undefined", () => {
    const produced = new Set(["E", "̂"]); // dot-below missing
    expect(composableComponentsFor(produced, "Ệ")).toBeUndefined();
  });

  it("NFD-stable char (decomposition length < 2) -> undefined even if not in produced", () => {
    const produced = new Set<string>();
    expect(composableComponentsFor(produced, "a")).toBeUndefined();
  });

  it("already-produced precomposed char still returns its components (caller decides the early-out)", () => {
    // composableComponentsFor is a pure decompose-and-check rule; the
    // "already directly produced" early-out is the CALLER's job (both
    // augmentWithComposable's `out.has(ch)` guard and
    // collectCompositionMethod's `baseProduced.has(targetChar)` guard do this
    // before calling in).
    const produced = new Set(["U", "̂"]);
    expect(composableComponentsFor(produced, "Û")).toEqual({
      components: ["U", "̂"],
    });
  });
});
