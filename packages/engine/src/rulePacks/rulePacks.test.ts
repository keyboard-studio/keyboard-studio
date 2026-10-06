// Tests for the rule-pack export/import loader (spec 082 Track B).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { exportPack, importPack, RulePackImportError } from "./index.js";
import { PACK_VERSION, type RulePack } from "@keyboard-studio/contracts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_PACK_PATH = resolve(HERE, "seedPacks", "cameroon-diacritic-blocking.pack.json");

function makePack(): RulePack {
  return {
    packVersion: PACK_VERSION,
    id: "test-pack",
    name: "Test pack",
    description: "A minimal pack for round-trip testing.",
    scriptKey: "Latn",
    behaviours: [
      {
        kind: "block",
        id: "test_block",
        parameters: {
          guardStore: "diablock",
          blockedChords: ["K_QUOTE"],
          outputOnBlock: "context",
        },
        provenance: {
          sourceKeyboardId: "test_keyboard",
          sourceKeyboardName: "Test Keyboard",
          copyright: "© Test",
          license: "MIT",
        },
        rules: ["any(diablock) + [K_QUOTE] > context"],
        demoPairs: [{ input: "type 5 then grave", expectedOutput: "5" }],
      },
    ],
  };
}

describe("rulePacks export/import", () => {
  it("round-trips a pack through export and import", () => {
    const pack = makePack();
    const json = exportPack(pack);
    const back = importPack(json);
    expect(back).toEqual(pack);
  });

  it("exportPack produces canonical JSON (sorted keys, trailing newline)", () => {
    const json = exportPack(makePack());
    expect(json.endsWith("\n")).toBe(true);
    // Re-exporting the imported pack is byte-identical (idempotent).
    expect(exportPack(importPack(json))).toBe(json);
    // Keys are sorted: "behaviours" before "description" before "id".
    const behavioursIdx = json.indexOf('"behaviours"');
    const descriptionIdx = json.indexOf('"description"');
    expect(behavioursIdx).toBeGreaterThan(-1);
    expect(behavioursIdx).toBeLessThan(descriptionIdx);
  });

  it("round-trips a pack carrying family parameters and verified pairs (FR-018, additive)", () => {
    const pack = makePack();
    pack.behaviours[0]!.parameters = {
      ...pack.behaviours[0]!.parameters,
      familyId: "diacritic-blocking-hardware",
      familyName: "Diacritic blocking (hardware)",
    };
    pack.behaviours[0]!.demoPairs = [
      { input: "type 5 then grave", expectedOutput: "5", verified: true },
    ];
    const json = exportPack(pack);
    const back = importPack(json);
    expect(back).toEqual(pack);
    expect(back.behaviours[0]!.parameters.familyId).toBe("diacritic-blocking-hardware");
    expect(back.behaviours[0]!.demoPairs[0]!.verified).toBe(true);
    // Canonical form is stable: re-export is byte-identical.
    expect(exportPack(back)).toBe(json);
  });

  it("exportPack throws RulePackImportError for an invalid pack", () => {
    const pack = makePack();
    pack.behaviours[0]!.demoPairs = [];
    expect(() => exportPack(pack)).toThrow(RulePackImportError);
    try {
      exportPack(pack);
    } catch (error) {
      expect(error).toBeInstanceOf(RulePackImportError);
      expect((error as RulePackImportError).issues.length).toBeGreaterThan(0);
    }
  });

  it("importPack throws RulePackImportError on malformed JSON", () => {
    expect(() => importPack("{ not json")).toThrow(RulePackImportError);
  });

  it("importPack throws RulePackImportError with typed issues on schema violation", () => {
    const bad = JSON.stringify({ packVersion: "1.0", id: "x" });
    try {
      importPack(bad);
      expect.unreachable("importPack should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(RulePackImportError);
      const issues = (error as RulePackImportError).issues;
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]).toHaveProperty("path");
      expect(issues[0]).toHaveProperty("message");
    }
  });

  it("importPack rejects a raw-snippet-only pack (FR-005)", () => {
    const pack = makePack();
    pack.behaviours[0]!.parameters = { kmnText: "any(diablock) + [K_QUOTE] > context" };
    // exportPack refuses to serialize it, so exercise importPack on raw JSON.
    expect(() => exportPack(pack)).toThrow(RulePackImportError);
    expect(() => importPack(JSON.stringify(pack))).toThrow(RulePackImportError);
  });
});

describe("seed pack: cameroon-diacritic-blocking", () => {
  const seedJson = readFileSync(SEED_PACK_PATH, "utf-8");

  it("validates against the pack schema", () => {
    const pack = importPack(seedJson);
    expect(pack.id).toBe("cameroon-diacritic-blocking");
    expect(pack.scriptKey).toBe("Latn");
    expect(pack.behaviours).toHaveLength(1);
    const behaviour = pack.behaviours[0]!;
    expect(behaviour.kind).toBe("block");
    expect(behaviour.rules).toHaveLength(36);
    expect(behaviour.demoPairs.length).toBeGreaterThanOrEqual(1);
  });

  it("carries full provenance from the source keyboard", () => {
    const pack = importPack(seedJson);
    const provenance = pack.behaviours[0]!.provenance;
    expect(provenance.sourceKeyboardId).toBe("sil_cameroon_qwerty");
    expect(provenance.sourceKeyboardName).toBe("Cameroon QWERTY");
    expect(provenance.copyright).toBe("© SIL Cameroon");
    expect(provenance.license).toContain("MIT");
  });

  it("is stored in canonical export form (byte-identical round-trip)", () => {
    // Guarantees the checked-in JSON is exactly what exportPack produces —
    // regenerate drift (e.g. hand edits) fails loudly here.
    expect(exportPack(importPack(seedJson))).toBe(seedJson);
  });
});
