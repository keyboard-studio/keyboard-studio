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
    const allBases = [basicKbdus, silEuroLatin, haBase];
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
