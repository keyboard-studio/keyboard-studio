// Tests for base suggestion by the (language, script) pair, incl. the
// language/script decoupling guarantee (spec §8/§9). refs #369.

import { describe, it, expect } from "vitest";
import type {
  BaseKeyboard,
  RelatednessProvenance,
} from "@keyboard-studio/contracts";
import { suggestBases } from "./suggestBase";

const mk = (id: string, script: string, languages?: string[]): BaseKeyboard => ({
  id,
  script,
  path: `release/x/${id}`,
  targets: ["windows"],
  displayName: id,
  version: "1.0",
  ...(languages !== undefined ? { languages } : {}),
});

const usqwerty = mk("basic_kbdus", "Latn");
const eurolatin = mk("sil_euro_latin", "Latn");
const devanagari = mk("sil_devanagari", "Deva");
const bases = [usqwerty, eurolatin, devanagari];

describe("suggestBases", () => {
  it("returns script-matching bases for a Latin target, fallback last", () => {
    const out = suggestBases(bases, { script: "Latn" });
    expect(out.map((s) => s.base.id)).toEqual([
      "sil_euro_latin", // script-match (input order, fallback deferred)
      "basic_kbdus",    // us-qwerty fallback ranked last
    ]);
    expect(out.find((s) => s.base.id === "basic_kbdus")?.reason).toBe(
      "us-qwerty-fallback",
    );
  });

  it("ranks a language match above a bare script match", () => {
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "ak" },
      { languagesById: { sil_euro_latin: ["ak", "fr"] } },
    );
    expect(out[0]?.base.id).toBe("sil_euro_latin");
    expect(out[0]?.reason).toBe("language-match");
  });

  it("DECOUPLING: a hi-Latn romanization never suggests the Devanagari base", () => {
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "hi-Latn" },
      { languagesById: { sil_devanagari: ["hi"], sil_euro_latin: ["hi-Latn"] } },
    );
    const ids = out.map((s) => s.base.id);
    expect(ids).not.toContain("sil_devanagari"); // Deva base excluded for a Latn target
    expect(out[0]?.base.id).toBe("sil_euro_latin"); // Latin Hindi base wins (language-match)
    expect(out[0]?.reason).toBe("language-match");
  });

  it("always offers the US-QWERTY fallback even when nothing matches the script", () => {
    const out = suggestBases([usqwerty, devanagari], { script: "Ethi" });
    expect(out).toHaveLength(1);
    expect(out[0]?.base.id).toBe("basic_kbdus");
    expect(out[0]?.reason).toBe("us-qwerty-fallback");
  });

  it("includes the fallback once even when it also matches the script", () => {
    const out = suggestBases(bases, { script: "Latn" });
    expect(out.filter((s) => s.base.id === "basic_kbdus")).toHaveLength(1);
  });

  it("returns [] when no base matches and no fallback is present", () => {
    expect(suggestBases([eurolatin, devanagari], { script: "Ethi" })).toEqual([]);
  });

  it("suppresses language-cross-script when bcp47 includes an explicit script subtag", () => {
    // hi-Latn explicitly chose Latin — Devanagari base must NOT cross-script in.
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "hi-Latn" },
      { languagesById: { sil_devanagari: ["hi"] } },
    );
    expect(out.map((s) => s.base.id)).not.toContain("sil_devanagari");
  });

  it("ranks language+script > script > language-cross-script > fallback", () => {
    // A Latin target where one base has lang+script, one matches script only,
    // one matches the language on a different script (Deva), and the QWERTY
    // fallback is present.
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "hi" },
      {
        languagesById: {
          sil_euro_latin: ["hi-Latn"], // language+script (hi on Latn)
          sil_devanagari: ["hi"],      // language only (hi on Deva)
        },
      },
    );
    expect(out.map((s) => [s.base.id, s.reason])).toEqual([
      ["sil_euro_latin", "language-match"],
      ["sil_devanagari", "language-cross-script"],
      ["basic_kbdus", "us-qwerty-fallback"],
    ]);
  });

  it("surfaces both Cameroon keyboards for an Ewondo (ewo) Latin target", () => {
    // Regression guard for the local-catalog flow: ewo is declared by both
    // sil_cameroon_qwerty and sil_cameroon_azerty as a <Language ID="ewo">.
    // With a Latn target both must rank as language-match (tier 1), above
    // the script-only and fallback options.
    const cqwerty = mk("sil_cameroon_qwerty", "Latn", ["ewo", "agq", "bss"]);
    const cazerty = mk("sil_cameroon_azerty", "Latn", ["ewo", "agq", "bss"]);
    const allBases = [usqwerty, eurolatin, cqwerty, cazerty];
    const languagesById = Object.fromEntries(
      allBases.map((b) => [b.id, b.languages ?? []] as const),
    );
    const out = suggestBases(
      allBases,
      { script: "Latn", bcp47: "ewo" },
      { languagesById },
    );
    const tier1 = out.filter((s) => s.reason === "language-match").map((s) => s.base.id);
    expect(tier1).toContain("sil_cameroon_qwerty");
    expect(tier1).toContain("sil_cameroon_azerty");
    // sil_euro_latin (no ewo) falls to script-match; basic_kbdus is fallback.
    expect(out.find((s) => s.base.id === "sil_euro_latin")?.reason).toBe(
      "script-match",
    );
    expect(out.find((s) => s.base.id === "basic_kbdus")?.reason).toBe(
      "us-qwerty-fallback",
    );
  });

  // ---------------------------------------------------------------------------
  // related-language-match tier (spec §8 step 1 — propose a related-language
  // keyboard before the blank US-QWERTY fallback).
  // ---------------------------------------------------------------------------

  const verdict = (
    init: Partial<RelatednessProvenance> & { tier: RelatednessProvenance["tier"] },
  ): RelatednessProvenance => ({
    sharedCharCount: 0,
    targetCharCount: 0,
    score: 0.5,
    ...init,
  });

  it("ranks a related-language keyboard above bare script-match and the fallback", () => {
    // dyu (Dyula) has no exact keyboard; bambara_latin is a Manding sibling.
    const bambara = mk("bambara_latin", "Latn", ["bm"]);
    const allBases = [usqwerty, eurolatin, bambara];
    const out = suggestBases(
      allBases,
      { script: "Latn", bcp47: "dyu" },
      {
        languagesById: Object.fromEntries(
          allBases.map((b) => [b.id, b.languages ?? []] as const),
        ),
        relatednessById: {
          bambara_latin: verdict({
            tier: "same-macrolanguage",
            relatedLanguage: "Bambara",
            sharedRegion: "Mali",
            sharedCharCount: 18,
            targetCharCount: 22,
            score: 0.86,
          }),
        },
      },
    );
    expect(out[0]?.base.id).toBe("bambara_latin");
    expect(out[0]?.reason).toBe("related-language-match");
    expect(out[0]?.relatedness?.relatedLanguage).toBe("Bambara");
    // sil_euro_latin (no verdict) falls to script-match; fallback stays last.
    expect(out.find((s) => s.base.id === "sil_euro_latin")?.reason).toBe(
      "script-match",
    );
    expect(out.at(-1)?.reason).toBe("us-qwerty-fallback");
  });

  it("sub-sorts related-language matches by score, strongest first", () => {
    const a = mk("rel_a", "Latn", ["aaa"]);
    const b = mk("rel_b", "Latn", ["bbb"]);
    const allBases = [a, b, usqwerty];
    const out = suggestBases(
      allBases,
      { script: "Latn", bcp47: "zzz" },
      {
        relatednessById: {
          rel_a: verdict({ tier: "same-family", score: 0.4 }),
          rel_b: verdict({ tier: "same-genus", score: 0.9 }),
        },
      },
    );
    expect(out.map((s) => s.base.id).slice(0, 2)).toEqual(["rel_b", "rel_a"]);
  });

  it("HARD SCRIPT GATE: a relatedness verdict never promotes a cross-script base", () => {
    // Even with a verdict, the Devanagari base must not be proposed for a Latn
    // target — relatedness is gated on script equality.
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "ne" },
      { relatednessById: { sil_devanagari: verdict({ tier: "same-family", score: 0.9 }) } },
    );
    expect(out.map((s) => s.base.id)).not.toContain("sil_devanagari");
  });

  it("never promotes the US-QWERTY fallback via a relatedness verdict", () => {
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "xyz" },
      { relatednessById: { basic_kbdus: verdict({ tier: "same-family", score: 0.9 }) } },
    );
    expect(out.find((s) => s.base.id === "basic_kbdus")?.reason).toBe(
      "us-qwerty-fallback",
    );
  });

  it('treats an "unrelated" verdict as no match (stays script-match)', () => {
    const out = suggestBases(
      [eurolatin, usqwerty],
      { script: "Latn", bcp47: "xyz" },
      { relatednessById: { sil_euro_latin: verdict({ tier: "unrelated", score: 0.05 }) } },
    );
    expect(out.find((s) => s.base.id === "sil_euro_latin")?.reason).toBe(
      "script-match",
    );
  });

  it("uses base.languages to build languagesById when caller provides it", () => {
    // When the caller constructs languagesById from base.languages (the pattern
    // BaseResolution uses), language-match fires correctly.
    const haBase = mk("hausa_latin", "Latn", ["ha", "ha-Latn"]);
    const allBases = [usqwerty, eurolatin, haBase];
    const languagesById = Object.fromEntries(
      allBases.map((b) => [b.id, b.languages ?? []] as const),
    );
    const suggestions = suggestBases(
      allBases,
      { script: "Latn", bcp47: "ha-Latn" },
      { languagesById },
    );
    expect(suggestions[0]?.base.id).toBe("hausa_latin");
    expect(suggestions[0]?.reason).toBe("language-match");
  });
});
