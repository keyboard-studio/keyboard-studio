// Tests for substituteSlots — pure slot substitution over {{slotId}} placeholders.

import { describe, it, expect } from "vitest";
import { substituteSlots } from "./substitute.js";

describe("substituteSlots", () => {
  // ---- basic replacement -------------------------------------------------

  it("replaces a single token with its value", () => {
    const { text, unresolved } = substituteSlots("hello {{name}}", { name: "world" });
    expect(text).toBe("hello world");
    expect(unresolved).toEqual([]);
  });

  it("replaces multiple distinct tokens in one pass", () => {
    const { text, unresolved } = substituteSlots(
      "{{a}} and {{b}}",
      { a: "alpha", b: "beta" }
    );
    expect(text).toBe("alpha and beta");
    expect(unresolved).toEqual([]);
  });

  it("replaces a repeated token everywhere it appears", () => {
    const { text, unresolved } = substituteSlots(
      "{{x}} and {{x}} again {{x}}",
      { x: "rep" }
    );
    expect(text).toBe("rep and rep again rep");
    expect(unresolved).toEqual([]);
  });

  it("handles a fragment with no tokens unchanged", () => {
    const { text, unresolved } = substituteSlots(
      "store(dk_bases) 'abc'",
      {}
    );
    expect(text).toBe("store(dk_bases) 'abc'");
    expect(unresolved).toEqual([]);
  });

  // ---- unresolved tokens -------------------------------------------------

  it("reports a slot id that has no matching value in slotValues", () => {
    const { text, unresolved } = substituteSlots("+ [{{triggerKey}}] > deadkey(accent)", {});
    expect(text).toBe("+ [{{triggerKey}}] > deadkey(accent)");
    expect(unresolved).toEqual(["triggerKey"]);
  });

  it("reports each unresolved id at most once even if it appears multiple times", () => {
    const { text, unresolved } = substituteSlots(
      "{{x}} {{x}} {{y}}",
      { y: "resolved" }
    );
    expect(text).toBe("{{x}} {{x}} resolved");
    expect(unresolved).toEqual(["x"]);
  });

  it("reports multiple distinct unresolved ids", () => {
    const { unresolved } = substituteSlots("{{a}} {{b}} {{c}}", {});
    expect(unresolved).toContain("a");
    expect(unresolved).toContain("b");
    expect(unresolved).toContain("c");
    expect(unresolved).toHaveLength(3);
  });

  it("does not include resolved ids in unresolved", () => {
    const { unresolved } = substituteSlots("{{a}} {{b}}", { a: "yes" });
    expect(unresolved).toEqual(["b"]);
  });

  // ---- whitespace / token shape (spec §5 exact syntax) -------------------

  it("does NOT match tokens with internal whitespace (spec §5 exact syntax)", () => {
    // '{{ slotId }}' is NOT a valid placeholder; must pass through verbatim.
    const { text, unresolved } = substituteSlots("{{ name }}", { name: "world" });
    expect(text).toBe("{{ name }}");
    expect(unresolved).toEqual([]);
  });

  it("replaces tokens adjacent to other characters without bleeding", () => {
    const { text } = substituteSlots("'{{baseLetters}}'", { baseLetters: "aeiou" });
    expect(text).toBe("'aeiou'");
  });

  // ---- realistic fragment from the fixture --------------------------------

  it("substitutes all five slots in the latin_deadkey_acute_single kmnFragment", () => {
    const fragment =
      "store(dk_bases)  '{{baseLetters}}'\n" +
      "store(dk_output) '{{accentedForms}}'\n" +
      "+ [{{triggerKey}}] > deadkey(accent)\n" +
      "deadkey(accent) + [{{triggerKey}}] > '{{accentChar}}'";

    const slotValues = {
      triggerKey: "K_QUOTE",
      accentChar: "́",
      baseLetters: "aeiouAEIOU",
      accentedForms: "áéíóúÁÉÍÓÚ",
    };

    const { text, unresolved } = substituteSlots(fragment, slotValues);
    expect(unresolved).toEqual([]);
    expect(text).toContain("store(dk_bases)  'aeiouAEIOU'");
    expect(text).toContain("+ [K_QUOTE] > deadkey(accent)");
    expect(text).toContain(`deadkey(accent) + [K_QUOTE] > '́'`);
  });

  it("reports descriptionOfAccent as unresolved when not provided (optional slot omitted)", () => {
    // descriptionOfAccent appears in no slot of kmnFragment for this pattern,
    // so this is purely a guard that extra keys in slotValues don't cause issues.
    const { text, unresolved } = substituteSlots(
      "c accent: {{descriptionOfAccent}}",
      {}
    );
    expect(unresolved).toEqual(["descriptionOfAccent"]);
    expect(text).toBe("c accent: {{descriptionOfAccent}}");
  });
});
