// Tests for the base-derived prefill confirmation rows. refs #369.

import { describe, it, expect } from "vitest";
import { makeBaseKeyboard, type BaseKeyboard, type BaseKeyboardInit } from "@keyboard-studio/contracts";
import { buildPrefillRows } from "./Prefill.tsx";
import type { IdentityLiteResult } from "./IdentityLite.tsx";

function base(overrides: Partial<BaseKeyboardInit> = {}): BaseKeyboard {
  return makeBaseKeyboard({
    id: "basic_kbdus",
    path: "release/b/basic_kbdus",
    script: "Latn",
    displayName: "English (US)",
    targets: ["windows", "web"],
    version: "1.0",
    ...overrides,
  });
}

function identity(overrides: Partial<IdentityLiteResult> = {}): IdentityLiteResult {
  return {
    autonym: "Fà'",
    english: "Bafut",
    targetScriptRaw: "Latn",
    supported: true,
    prefill: { script: "Latn", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" },
    ...overrides,
  };
}

describe("buildPrefillRows", () => {
  it("renders script class and routing group as confirmations", () => {
    const rows = buildPrefillRows(identity(), base());
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel["Script class (A2)"]).toBe("alphabetic");
    expect(byLabel["Routing group (§9)"]).toBe("qwerty-qwertz");
    expect(byLabel["Starting keyboard"]).toBe("English (US) (basic_kbdus)");
  });

  it("shows the fonipa variant alongside the script subtag", () => {
    const rows = buildPrefillRows(
      identity({ prefill: { script: "Latn", variant: "fonipa", scriptClass: "alphabetic", routingGroup: "qwerty-qwertz" } }),
      base(),
    );
    const script = rows.find((r) => r.label === "Script");
    expect(script?.value).toBe("Latn (fonipa)");
  });

  it("falls back to the autonym when there is no English name", () => {
    const rows = buildPrefillRows(identity({ english: "" }), base());
    expect(rows.find((r) => r.label === "Language")?.value).toBe("Fà'");
  });

  it("reflects a non-Latin chosen script (decoupling) in the prefill", () => {
    const rows = buildPrefillRows(
      identity({ prefill: { script: "Deva", scriptClass: "abugida", routingGroup: "non-roman" } }),
      base({ id: "devanagari_inscript", script: "Deva", displayName: "Devanagari InScript" }),
    );
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]));
    expect(byLabel["Script class (A2)"]).toBe("abugida");
    expect(byLabel["Routing group (§9)"]).toBe("non-roman");
  });
});
