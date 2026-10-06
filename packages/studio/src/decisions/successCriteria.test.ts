// Success-criteria validation (spec 087 T062).
//
// Validates SC-001 through SC-004 against the implemented unification.
// This is the measurable proof that the migration meets its success criteria.

import { describe, it, expect, beforeAll } from "vitest";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import { parseKmn } from "@keyboard-studio/engine";
import { makeBaseKeyboard } from "@keyboard-studio/contracts";
import { questionRegistry } from "../survey/questions/registry.ts";
import pbCharacterInventory from "../survey/questions/b/pb_character_inventory.ts";
import { runDecisionFlow } from "./decisionFlow.ts";
import { buildExtractContext } from "./extractContext.ts";
import { loadFlowSourceDef, flowSources } from "../steps/flowSources.ts";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// SC-001: pre-fill on 5 real keyboards
//
// Five REAL keyboards: real .kmn sources parsed by the real codec, with
// catalog metadata (script/languages) standing in for the catalog row.
// Two live in the repo's walkBases fixtures; three are vendored from the
// upstream keyboards corpus into tests/fixtures/scKeyboards/.
// ---------------------------------------------------------------------------

const KEYBOARDS = [
  {
    id: "basic_kbdus",
    languageName: "English",
    kmnPath: "../../tests/fixtures/walkBases/release/basic/basic_kbdus/source/basic_kbdus.kmn",
    script: "Latn",
    languages: ["en"],
    copyright: "© 2008-2020 SIL International",
  },
  {
    id: "basic_kbdru",
    languageName: "Russian",
    kmnPath: "../../tests/fixtures/walkBases/release/basic/basic_kbdru/source/basic_kbdru.kmn",
    script: "Cyrl",
    languages: ["ru"],
    copyright: "© 2009-2019 SIL International",
  },
  {
    id: "basic_kbdgr",
    // langtags englishName for `de` is "German, Standard" (the extractor's
    // exact output); the keyboard is German Basic, not Greek.
    languageName: "German, Standard",
    kmnPath: "../../tests/fixtures/scKeyboards/basic_kbdgr.kmn",
    script: "Latn",
    languages: ["de"],
    copyright: "(c) 2009-2019 SIL International",
  },
  {
    id: "arabic_izza",
    languageName: "Arabic",
    kmnPath: "../../tests/fixtures/scKeyboards/arabic_izza.kmn",
    script: "Arab",
    languages: ["ar"],
    copyright: "© 2017-2025 Prof. Abdelmalek Bouhadjera",
  },
  {
    id: "basic_kbduk",
    languageName: "English",
    kmnPath: "../../tests/fixtures/scKeyboards/basic_kbduk.kmn",
    script: "Latn",
    languages: ["en"],
    copyright: "(c) 2009-2019 SIL International",
  },
];

/** The real import pipeline: real .kmn → IR + catalog metadata. */
function loadKeyboard(kb: (typeof KEYBOARDS)[number]) {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolve(here, kb.kmnPath), "utf-8");
  const { ir } = parseKmn(source, kb.id);
  const catalog = makeBaseKeyboard({
    id: kb.id,
    script: kb.script,
    path: `release/test/${kb.id}`,
    targets: ["windows"],
    displayName: kb.id,
    version: "1.0",
    languages: kb.languages,
  });
  return { ir, catalog };
}

const IDENTITY_MODULES = [
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

// SC-001 covers identity/script/character questions. The character inventory
// (pb_character_inventory) extracts from the IR's produced set — including it
// reflects the real pre-fill surface.
const SC001_MODULES = [...IDENTITY_MODULES, pbCharacterInventory];

describe("SC-001: pre-fill on 5 real keyboards", () => {
  // language-name resolves through the lazily-loaded langtags dataset, which
  // the studio has loaded by the time the name picker is shown.
  beforeAll(async () => {
    await loadLangtags();
  });

  // The spec's success criterion is ≥80% pre-fill of identity/script/character
  // questions. This test pins the MEASURED rate with hand-verified
  // expectations per keyboard: 5 of the 6 decisions extract (language-code,
  // language-name, target-script, copyright-holder, character-inventory) =
  // 83%, meeting the spec's 80% bar. author-name has no extractor by design —
  // it requires author input — so it surfaces for asking rather than as a
  // silent default.
  it("extracts the 5 extractable decisions with correct source labels", () => {
    for (const kb of KEYBOARDS) {
      const { ir, catalog } = loadKeyboard(kb);
      const decisions = runDecisionFlow({
        modules: SC001_MODULES,
        context: buildExtractContext(ir, catalog),
      });

      // Hand-verified per keyboard: extracted values match the real .kmn
      // (copyright store) and the real catalog row (bcp47/script).
      expect(decisions["language-code"]?.provenance).toBe("extracted");
      expect(decisions["language-code"]?.value).toBe(kb.languages[0]);
      expect(decisions["language-code"]?.source).toContain(kb.id);

      expect(decisions["target-script"]?.provenance).toBe("extracted");
      expect(decisions["target-script"]?.value).toBe(kb.script);
      expect(decisions["target-script"]?.source).toContain(kb.id);

      expect(decisions["copyright-holder"]?.provenance).toBe("extracted");
      expect(decisions["copyright-holder"]?.value).toBe(kb.copyright);
      expect(decisions["copyright-holder"]?.source).toContain(kb.id);

      const inventory = decisions["character-inventory"];
      expect(inventory?.provenance).toBe("extracted");
      expect(Array.isArray(inventory?.value)).toBe(true);
      expect((inventory?.value as unknown[]).length).toBeGreaterThan(0);
      expect(inventory?.source).toContain(kb.id);

      // Hand-checked English name of the primary tag (en/ru/de/ar).
      expect(decisions["language-name"]?.provenance).toBe("extracted");
      expect(decisions["language-name"]?.value).toBe(kb.languageName);
      expect(decisions["language-name"]?.source).toContain(kb.id);

      // The mechanism boundary: author-name requires author input and must
      // never be presented as extracted.
      expect(decisions["author-name"]?.provenance).not.toBe("extracted");
    }
  });

  it("measured pre-fill rate meets the 80% bar (5/6 = 83%)", () => {
    let totalDecisions = 0;
    let prefilledDecisions = 0;

    for (const kb of KEYBOARDS) {
      const { ir, catalog } = loadKeyboard(kb);
      const decisions = runDecisionFlow({
        modules: SC001_MODULES,
        context: buildExtractContext(ir, catalog),
      });

      for (const decision of Object.values(decisions)) {
        totalDecisions++;
        if (decision?.provenance === "extracted") {
          prefilledDecisions++;
        }
      }
    }

    // Pins the floor: a regression fails loudly. Measured 5/6 per keyboard.
    expect(totalDecisions).toBe(KEYBOARDS.length * SC001_MODULES.length);
    expect(prefilledDecisions / totalDecisions).toBeGreaterThanOrEqual(0.8);
  });
});

// SC-002 (registry-wide fault injection) lives in successCriteria.sc002.test.ts;
// SC-004 (real submission gates) in successCriteria.sc004.test.ts + .kmp.test.ts.

// ---------------------------------------------------------------------------
// SC-003: Zero artifacts + parity
// ---------------------------------------------------------------------------

describe("SC-003: zero ordering artifacts + parity", () => {
  it("no thin-YAML flow order list survives anywhere under content/flows", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const flowsDir = resolve(here, "../../../../content/flows");
    const found = readdirSync(flowsDir, { recursive: true, encoding: "utf8" }).filter((f) =>
      f.endsWith(".modular.yaml"),
    );
    expect(found).toEqual([]);
  });

  it("derived order matches the legacy order (parity)", () => {
    const flow = loadFlowSourceDef(flowSources["identity_lite"]!);
    const ids = flow.questions.map((q) => q.id);
    // The frozen legacy order (from the deleted YAML).
    expect(ids).toEqual([
      "il_language_english",
      "il_language_region",
      "il_language_autonym",
      "il_language_code",
      "il_target_script",
      "il_script_not_supported",
      "il_author_name",
      "il_author_email",
      "il_copyright_holder",
    ]);
  });
});

