// Extraction over a REAL catalog keyboard (spec 085 FR-006, T020).
//
// Not fixtures: a .kmn parsed by the real codec (whose header.bcp47 comes
// back EMPTY on real imports — the codec never populates it) paired with
// the keyboard's real catalog entry. Language identity must come from the
// catalog metadata; only the IR-carried facts come from the IR.

import { describe, it, expect } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import { makeBaseKeyboard } from "@keyboard-studio/contracts";
import { questionRegistry } from "../survey/questions/registry.ts";
import pbCharacterInventory from "../survey/questions/b/pb_character_inventory.ts";
import { buildExtractContext } from "./extractContext.ts";
import { runDecisionFlow } from "./decisionFlow.ts";

// A realistic minimal keyboard source, parsed by the real codec — exactly
// what the import pipeline hands the studio for a catalog keyboard.
const CAMEROON_KMN = `c Cameroon QWERTY test source
store(&COPYRIGHT) '© 2026 Cameroon Test'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > 'a'
+ [K_B] > 'b'
+ [K_E] > 'ə'
`;

// The real catalog entry (same metadata the base browser carries).
const cameroonCatalog = makeBaseKeyboard({
  id: "sil_cameroon_qwerty",
  script: "Latn",
  path: "release/sil/sil_cameroon_qwerty",
  targets: ["windows"],
  displayName: "sil_cameroon_qwerty",
  version: "1.0",
  languages: ["ewo", "agq", "bss"],
});

const modules = [
  "il_language_english",
  "il_language_code",
  "il_target_script",
  "il_author_name",
  "il_copyright_holder",
].map((id) => {
  const mod = questionRegistry[id];
  if (!mod) throw new Error(`question "${id}" not in registry`);
  return mod;
});

describe("real catalog keyboard extraction (T020)", () => {
  it("pre-fills identity, script, copyright, and inventory from the import bundle", () => {
    const { ir } = parseKmn(CAMEROON_KMN, "sil_cameroon_qwerty");
    // The codec leaves bcp47 empty on real imports — the test models that.
    expect(ir.header.bcp47).toEqual([]);

    const decisions = runDecisionFlow({
      modules: [...modules, pbCharacterInventory],
      context: buildExtractContext(ir, cameroonCatalog),
      answers: { il_language_english: "Ewondo", il_author_name: "Test Author" },
    });

    // Language identity comes from catalog metadata, not the empty IR header.
    expect(decisions["language-code"]).toMatchObject({
      value: "ewo",
      provenance: "extracted",
      source: "sil_cameroon_qwerty",
    });
    expect(decisions["target-script"]).toMatchObject({
      value: "Latn",
      provenance: "extracted",
      source: "sil_cameroon_qwerty",
    });
    // IR-carried facts come from the IR.
    expect(decisions["copyright-holder"]).toMatchObject({
      value: "© 2026 Cameroon Test",
      provenance: "extracted",
      source: "sil_cameroon_qwerty",
    });
    const inventory = decisions["character-inventory"];
    expect(inventory?.provenance).toBe("extracted");
    expect(inventory?.source).toBe("sil_cameroon_qwerty");
    expect(inventory?.value).toEqual(expect.arrayContaining(["a", "b", "ə"]));
  });
});
