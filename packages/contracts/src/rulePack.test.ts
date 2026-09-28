// Unit tests for the rule-pack contract (spec 082 Track B, FR-005..FR-007).

import { describe, it, expect } from "vitest";
import {
  PACK_VERSION,
  validateRulePack,
  type RulePack,
} from "./rulePack";

function validPack(): RulePack {
  return {
    packVersion: PACK_VERSION,
    id: "cameroon-diacritic-blocking",
    name: "Cameroon diacritic blocking",
    description: "Blocks combining diacritics after non-letters.",
    scriptKey: "Latn",
    behaviours: [
      {
        kind: "block",
        id: "cameroon_diacritic_blocking",
        parameters: {
          guardStore: "diablock",
          guardedContextChars: [" ", "5"],
          blockedChords: ["K_QUOTE"],
          outputOnBlock: "context",
        },
        provenance: {
          sourceKeyboardId: "sil_cameroon_qwerty",
          sourceKeyboardName: "Cameroon QWERTY",
          copyright: "© SIL Cameroon",
          license: "MIT (assumed from keymanapp/keyboards; verify)",
        },
        rules: ["any(diablock) + [K_QUOTE] > context"],
        demoPairs: [
          {
            input: "type `5`, then press the grave-accent key",
            expectedOutput: "5",
          },
        ],
      },
    ],
  };
}

/** Deep-clone a pack into a mutable untyped record for negative testing. */
function asMutable(pack: RulePack): Record<string, unknown> {
  return JSON.parse(JSON.stringify(pack)) as Record<string, unknown>;
}

function firstBehaviour(mutable: Record<string, unknown>): Record<string, unknown> {
  const behaviours = mutable["behaviours"] as Record<string, unknown>[];
  const first = behaviours[0];
  if (first === undefined) {
    throw new Error("test fixture unexpectedly has no behaviours");
  }
  return first;
}

describe("validateRulePack", () => {
  it("accepts a valid pack", () => {
    const result = validateRulePack(validPack());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.id).toBe("cameroon-diacritic-blocking");
      expect(result.pack.packVersion).toBe("1.0");
    }
  });

  it("rejects a pack with missing provenance", () => {
    const mutable = asMutable(validPack());
    delete firstBehaviour(mutable)["provenance"];
    const result = validateRulePack(mutable);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(
        result.issues.some(i => i.path === "behaviours.0.provenance"),
      ).toBe(true);
    }
  });

  it("rejects a pack with incomplete provenance (missing license)", () => {
    const mutable = asMutable(validPack());
    const behaviour = firstBehaviour(mutable);
    const provenance = behaviour["provenance"] as Record<string, unknown>;
    delete provenance["license"];
    const result = validateRulePack(mutable);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(i => i.path === "behaviours.0.provenance.license"),
      ).toBe(true);
    }
  });

  it("rejects an unknown behaviour kind (closed set)", () => {
    const mutable = asMutable(validPack());
    firstBehaviour(mutable)["kind"] = "composeChain";
    const result = validateRulePack(mutable);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some(i => i.path === "behaviours.0.kind")).toBe(true);
    }
  });

  it("rejects a raw-snippet-only pack: empty parameters (FR-005)", () => {
    const mutable = asMutable(validPack());
    firstBehaviour(mutable)["parameters"] = {};
    const result = validateRulePack(mutable);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(i =>
          i.message.includes("structured data, not just KMN text"),
        ),
      ).toBe(true);
    }
  });

  it("rejects a raw-snippet-only pack: KMN text stashed under a text key (FR-005)", () => {
    const mutable = asMutable(validPack());
    firstBehaviour(mutable)["parameters"] = {
      kmnText: "any(diablock) + [K_QUOTE] > context",
    };
    const result = validateRulePack(mutable);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          i =>
            i.path === "behaviours.0.parameters" &&
            i.message.includes("not raw KMN text"),
        ),
      ).toBe(true);
    }
  });

  it("rejects a pack with a wrong packVersion", () => {
    const result = validateRulePack({ ...validPack(), packVersion: "2.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some(i => i.path === "packVersion")).toBe(true);
    }
  });

  it("rejects a pack with no demo pairs (FR-007)", () => {
    const mutable = asMutable(validPack());
    firstBehaviour(mutable)["demoPairs"] = [];
    expect(validateRulePack(mutable).ok).toBe(false);
  });

  it("rejects a pack with no behaviours and a behaviour with no rules", () => {
    expect(
      validateRulePack({ ...validPack(), behaviours: [] }).ok,
    ).toBe(false);

    const mutable = asMutable(validPack());
    firstBehaviour(mutable)["rules"] = [];
    expect(validateRulePack(mutable).ok).toBe(false);
  });

  it("returns typed issues with path, message, and code", () => {
    const result = validateRulePack({ packVersion: "1.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(typeof issue.path).toBe("string");
        expect(typeof issue.message).toBe("string");
        expect(typeof issue.code).toBe("string");
      }
    }
  });
});
