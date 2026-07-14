// Tests for base suggestion by the (language, script) pair, incl. the
// language/script decoupling guarantee (spec §8/§9). refs #369.

import { describe, it, expect } from "vitest";
import {
  makeBaseKeyboard,
  basicKbdus,
  silEuroLatin,
  silDevanagariPhonetic,
} from "@keyboard-studio/contracts/fixtures";
import { suggestBases } from "./suggestBase";

const devanagari = makeBaseKeyboard({
  id: "sil_devanagari",
  script: "Deva",
  path: "release/sil/sil_devanagari",
  targets: ["windows"],
  displayName: "sil_devanagari",
  version: "1.0",
});

const bases = [basicKbdus, silEuroLatin, devanagari];

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
    // ["ak", "fr"] → two distinct languages → multilingual match.
    expect(out[0]?.reason).toBe("language-match-multilingual");
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
    // Only "hi-Latn" declared → single distinct language → monolingual match.
    expect(out[0]?.reason).toBe("language-match-monolingual");
  });

  it("always offers the US-QWERTY fallback even when nothing matches the script", () => {
    const out = suggestBases([basicKbdus, devanagari], { script: "Ethi" });
    expect(out).toHaveLength(1);
    expect(out[0]?.base.id).toBe("basic_kbdus");
    expect(out[0]?.reason).toBe("us-qwerty-fallback");
  });

  it("includes the fallback once even when it also matches the script", () => {
    const out = suggestBases(bases, { script: "Latn" });
    expect(out.filter((s) => s.base.id === "basic_kbdus")).toHaveLength(1);
  });

  it("returns [] when no base matches and no fallback is present", () => {
    expect(suggestBases([silEuroLatin, devanagari], { script: "Ethi" })).toEqual([]);
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
      ["sil_euro_latin", "language-match-monolingual"], // only hi-Latn declared
      ["sil_devanagari", "language-cross-script"],
      ["basic_kbdus", "us-qwerty-fallback"],
    ]);
  });

  it("surfaces both Cameroon keyboards for an Ewondo (ewo) Latin target", () => {
    // Regression guard for the local-catalog flow: ewo is declared by both
    // sil_cameroon_qwerty and sil_cameroon_azerty as a <Language ID="ewo">.
    // With a Latn target both must rank as language-match (tier 1), above
    // the script-only and fallback options.
    const cqwerty = makeBaseKeyboard({
      id: "sil_cameroon_qwerty",
      script: "Latn",
      path: "release/sil/sil_cameroon_qwerty",
      targets: ["windows"],
      displayName: "sil_cameroon_qwerty",
      version: "1.0",
      languages: ["ewo", "agq", "bss"],
    });
    const cazerty = makeBaseKeyboard({
      id: "sil_cameroon_azerty",
      script: "Latn",
      path: "release/sil/sil_cameroon_azerty",
      targets: ["windows"],
      displayName: "sil_cameroon_azerty",
      version: "1.0",
      languages: ["ewo", "agq", "bss"],
    });
    const allBases = [basicKbdus, silEuroLatin, cqwerty, cazerty];
    const languagesById = Object.fromEntries(
      allBases.map((b) => [b.id, b.languages ?? []] as const),
    );
    const out = suggestBases(
      allBases,
      { script: "Latn", bcp47: "ewo" },
      { languagesById },
    );
    // ["ewo", "agq", "bss"] → multilingual match for both Cameroon keyboards.
    const tier1 = out
      .filter((s) => s.reason === "language-match-multilingual")
      .map((s) => s.base.id);
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

  it("proven non-Latin script (Cyrillic): language+script tier plus US-QWERTY fallback (T006b)", () => {
    // spec 034 T006b / FR-003, AS-2: for a proven-script language the base step
    // returns a ranked list with an exact-or-family (language+script) tier AND
    // the guaranteed US-QWERTY fallback — proving the proven set is not
    // Latin-only. Russian (ru) on a Cyrillic base declaring only "ru" is the
    // top (language-match-monolingual) tier.
    const russianCyrl = makeBaseKeyboard({
      id: "russian_mnemonic_r",
      script: "Cyrl",
      path: "release/r/russian_mnemonic_r",
      targets: ["windows"],
      displayName: "russian_mnemonic_r",
      version: "1.0",
      languages: ["ru"],
    });
    const allBases = [basicKbdus, silEuroLatin, russianCyrl];
    const languagesById = Object.fromEntries(
      allBases.map((b) => [b.id, b.languages ?? []] as const),
    );
    const out = suggestBases(allBases, { script: "Cyrl", bcp47: "ru-Cyrl" }, { languagesById });
    // Tier 1: the Cyrillic Russian base is a genuine language+script match;
    // it declares only "ru", so it ranks at the monolingual language-match tier.
    expect(out[0]?.base.id).toBe("russian_mnemonic_r");
    expect(out[0]?.reason).toBe("language-match-monolingual");
    // The US-QWERTY fallback is always offered (last), even for a non-Latin target.
    expect(out.find((s) => s.base.id === "basic_kbdus")?.reason).toBe("us-qwerty-fallback");
    // The Latin-only base does not cross into a Cyrillic target.
    expect(out.map((s) => s.base.id)).not.toContain("sil_euro_latin");
  });

  it("uses base.languages to build languagesById when caller provides it", () => {
    // When the caller constructs languagesById from base.languages (the pattern
    // BaseResolution uses), language-match fires correctly.
    const haBase = makeBaseKeyboard({
      id: "hausa_latin",
      script: "Latn",
      path: "release/x/hausa_latin",
      targets: ["windows"],
      displayName: "hausa_latin",
      version: "1.0",
      languages: ["ha", "ha-Latn"],
    });
    // silEuroLatin already covers "ha", which would tie with haBase at
    // language-match and win by input order — use silDevanagariPhonetic (Deva
    // script, no "ha") so haBase is the sole language-match for ha-Latn.
    const allBases = [basicKbdus, silDevanagariPhonetic, haBase];
    const languagesById = Object.fromEntries(
      allBases.map((b) => [b.id, b.languages ?? []] as const),
    );
    const suggestions = suggestBases(
      allBases,
      { script: "Latn", bcp47: "ha-Latn" },
      { languagesById },
    );
    expect(suggestions[0]?.base.id).toBe("hausa_latin");
    // ["ha", "ha-Latn"] → one distinct language → monolingual match.
    expect(suggestions[0]?.reason).toBe("language-match-monolingual");
  });

  it("ranks a monolingual match ahead of a multilingual one", () => {
    const mono = makeBaseKeyboard({
      id: "ewo_only",
      script: "Latn",
      path: "release/e/ewo_only",
      targets: ["windows"],
      displayName: "Ewondo Only",
      version: "1.0",
      languages: ["ewo"], // dedicated to ewo
    });
    const multi = makeBaseKeyboard({
      id: "cameroon_multi",
      script: "Latn",
      path: "release/c/cameroon_multi",
      targets: ["windows"],
      displayName: "Cameroon Multi",
      version: "1.0",
      languages: ["ewo", "agq", "bss"], // ewo among others
    });
    // Input order puts the multilingual base first to prove the tier, not the
    // input order, drives placement.
    const allBases = [multi, mono];
    const languagesById = Object.fromEntries(
      allBases.map((b) => [b.id, b.languages ?? []] as const),
    );
    const out = suggestBases(
      allBases,
      { script: "Latn", bcp47: "ewo" },
      { languagesById },
    );
    expect(out.map((s) => [s.base.id, s.reason])).toEqual([
      ["ewo_only", "language-match-monolingual"],
      ["cameroon_multi", "language-match-multilingual"],
    ]);
  });

  it("orders the same-script tier alphabetically by display name", () => {
    const mk = (id: string, displayName: string) =>
      makeBaseKeyboard({
        id,
        script: "Latn",
        path: `release/x/${id}`,
        targets: ["windows"],
        displayName,
        version: "1.0",
      });
    // Deliberately supply out-of-order display names (and ids) so the result
    // order can only come from the alphabetical tie-break.
    const bases = [mk("z_kbd", "Zebra"), mk("a_kbd", "apple"), mk("m_kbd", "Mango")];
    const out = suggestBases(bases, { script: "Latn" });
    expect(out.map((s) => s.base.displayName)).toEqual(["apple", "Mango", "Zebra"]);
    expect(out.every((s) => s.reason === "script-match")).toBe(true);
  });

  it("lists each base once at its first-matching tier (no duplicates)", () => {
    const out = suggestBases(
      bases,
      { script: "Latn", bcp47: "ak" },
      { languagesById: { sil_euro_latin: ["ak", "fr"] } },
    );
    const ids = out.map((s) => s.base.id);
    expect(new Set(ids).size).toBe(ids.length); // no id appears twice
  });
});
