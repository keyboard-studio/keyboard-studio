// Tests for the base-derived prefill confirmation rows. refs #369.

import { describe, it, expect, afterEach } from "vitest";
import { I18n } from "@lingui/core";
import { makeBaseKeyboard, type BaseKeyboard, type BaseKeyboardInit } from "@keyboard-studio/contracts";
import { buildPrefillRows, buildScriptAlignmentRows } from "./Prefill.tsx";
import type { IdentityLiteResult } from "./IdentityLite.tsx";
import type { FiredQuestion } from "../adaptation/firing.ts";
import { _setContentCatalogForTesting, _resetContentI18nForTesting } from "../lib/contentI18n.ts";

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

// ---------------------------------------------------------------------------
// buildScriptAlignmentRows — Tier B content-i18n for the provenance chip
// (spec 046 T028). Mirrors the resolveNodeName/resolveLocationLabel coverage
// in irToCarveNodes.test.ts for this loader's third render site.
// ---------------------------------------------------------------------------

function firedQuestion(overrides: Partial<FiredQuestion> = {}): FiredQuestion {
  return {
    id: "q_sa1_target_script_spread",
    prefilledValue: "Latn",
    provenanceLabel: "Corpus majority script",
    provenanceTier: "content-derived",
    ...overrides,
  };
}

describe("buildScriptAlignmentRows", () => {
  afterEach(() => {
    _resetContentI18nForTesting();
  });

  it("translates the provenance label under an active locale with a seeded catalog", () => {
    _setContentCatalogForTesting("fr", {
      adaptationQuestions: {
        "content.adaptationQuestion.q_sa1_target_script_spread.provenanceLabel": "Script majoritaire du corpus",
      },
    });
    const rows = buildScriptAlignmentRows([firedQuestion()], new I18n({ locale: "fr", messages: {} }));
    expect(rows[0]?.note).toBe("Script majoritaire du corpus (content-derived)");
  });

  it("falls back to the English provenance label when no translation is seeded", () => {
    const rows = buildScriptAlignmentRows([firedQuestion()], new I18n({ locale: "fr", messages: {} }));
    expect(rows[0]?.note).toBe("Corpus majority script (content-derived)");
  });
});
