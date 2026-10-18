// Tests for the base-derived prefill confirmation rows. refs #369.

import { describe, it, expect, afterEach } from "vitest";
import { I18n } from "@lingui/core";
import {
  makeStartKeyboard,
  type IRGroup,
  type StartKeyboard,
  type StartKeyboardInit,
} from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { buildPrefillRows, buildScriptAlignmentRows, scriptsIncludedIn } from "./Prefill.tsx";
import type { IdentityLiteResult } from "./IdentityLite.tsx";
import type { FiredQuestion } from "../adaptation/firing.ts";
import { _setContentCatalogForTesting, _resetContentI18nForTesting } from "../lib/contentI18n.ts";

function base(overrides: Partial<StartKeyboardInit> = {}): StartKeyboard {
  return makeStartKeyboard({
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
// Script mix (issue 538, box 3): scriptsIncludedIn + the scriptsIncluded
// row buildPrefillRows derives from it.
// ---------------------------------------------------------------------------

/** An IRGroup emitting each char as its own {kind:"char"} rule — the
 * simplest way to give a test IR a known produced-glyph set. */
function groupWithChars(chars: string[]): IRGroup {
  return {
    nodeId: "g0",
    name: "main",
    usingKeys: false,
    readonly: false,
    rules: chars.map((char, i) => ({
      nodeId: `rule#${i}`,
      context: [],
      output: [{ kind: "char" as const, value: char }],
    })),
  };
}

function greekIdentity(): IdentityLiteResult {
  return identity({
    prefill: { script: "Grek", scriptClass: "alphabetic", routingGroup: "non-roman" },
  });
}

describe("scriptsIncludedIn", () => {
  it("collects every attested script in a multi-script keyboard", () => {
    const ir = makeTestIR([groupWithChars(["α", "β", "a", "z"])]);
    expect(scriptsIncludedIn(ir)).toEqual(["Grek", "Latn"]);
  });

  it("returns the single script of a single-script keyboard", () => {
    const ir = makeTestIR([groupWithChars(["α", "β", "γ"])]);
    expect(scriptsIncludedIn(ir)).toEqual(["Grek"]);
  });

  it("skips neutral and shared characters (digits, punctuation, combining marks)", () => {
    const ir = makeTestIR([groupWithChars(["a", "5", "!", "\u0301"])]);
    expect(scriptsIncludedIn(ir)).toEqual(["Latn"]);
  });
});

describe("buildPrefillRows — script mix row", () => {
  it("shows the mix under the Script row and flags a non-target script", () => {
    const rows = buildPrefillRows(greekIdentity(), base(), undefined, ["Grek", "Latn"]);
    const ids = rows.map((r) => r.id);
    expect(ids.indexOf("scriptsIncluded")).toBe(ids.indexOf("script") + 1);
    const mix = rows.find((r) => r.id === "scriptsIncluded");
    expect(mix?.label).toBe("Scripts included");
    expect(mix?.value).toBe("Grek, Latn");
    expect(mix?.note).toBe("Latn may not be needed for your language");
  });

  it("renders clean (no flag) when the mix matches the target script", () => {
    const rows = buildPrefillRows(identity(), base(), undefined, ["Latn"]);
    const mix = rows.find((r) => r.id === "scriptsIncluded");
    expect(mix?.value).toBe("Latn");
    expect(mix?.note).toBeUndefined();
  });

  it("renders a single-script mix with no flag", () => {
    const rows = buildPrefillRows(greekIdentity(), base(), undefined, ["Grek"]);
    const mix = rows.find((r) => r.id === "scriptsIncluded");
    expect(mix?.value).toBe("Grek");
    expect(mix?.note).toBeUndefined();
  });

  it("flags the whole mix when the target script is not in it", () => {
    const rows = buildPrefillRows(greekIdentity(), base(), undefined, ["Latn"]);
    const mix = rows.find((r) => r.id === "scriptsIncluded");
    expect(mix?.value).toBe("Latn");
    expect(mix?.note).toBe("Latn may not be needed for your language");
  });

  it("omits the row when no mix was supplied", () => {
    const rows = buildPrefillRows(identity(), base());
    expect(rows.some((r) => r.id === "scriptsIncluded")).toBe(false);
    expect(rows).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// buildScriptAlignmentRows — Tier B content-i18n for the provenance chip
// (spec 046 T028).
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
