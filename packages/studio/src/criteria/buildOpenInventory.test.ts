// Open expected characters (spec 111 FR-018a): the exemplar union feeds 18.6.

import { describe, expect, it } from "vitest";
import { linguistInventoryChars } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { checkInventoryCoverage } from "@keymanapp/keyboard-lint";

import type { SourcedInventory } from "../lib/services.ts";
import { buildOpenCriteriaInventory } from "./buildOpenInventory.ts";
import { findingKeysOf } from "./openRatchet.ts";
import type { ResolvedRow } from "./criteriaTypes.ts";

function sourced(tag: string, chars: Array<[string, "main" | "auxiliary"]>): SourcedInventory {
  return {
    resolvedTag: tag,
    source: "cldr",
    confidence: "approved",
    characters: chars.map(([char, tier]) => ({
      char,
      tier,
      source: "cldr" as const,
      confidence: "approved" as const,
    })),
    digraphs: [],
  };
}

const index = new Map<string, SourcedInventory | null>([
  ["ewo", sourced("ewo", [["a", "main"], ["ə", "main"], ["c", "auxiliary"]])],
  ["bkm", sourced("bkm", [["a", "main"], ["ɔ", "main"]])],
  ["zzz", null],
]);

function chars(b: ReturnType<typeof buildOpenCriteriaInventory>): string[] {
  if (b.build.kind !== "built") throw new Error("expected built");
  return linguistInventoryChars(b.build.inventory).sort();
}

describe("buildOpenCriteriaInventory", () => {
  it("is the union over the listed languages, standard tiers only", () => {
    const b = buildOpenCriteriaInventory({ languageTags: ["ewo", "bkm"], script: "Latin", sourcedByTag: index });
    expect(chars(b)).toEqual(["a", "ɔ", "ə"].sort());
    expect(b.coverage).toEqual({ withData: 2, total: 2, withoutData: [] });
  });

  it("reports languages without data and still builds from the rest", () => {
    const b = buildOpenCriteriaInventory({ languageTags: ["ewo", "zzz"], script: "Latin", sourcedByTag: index });
    expect(b.build.kind).toBe("built");
    expect(b.coverage).toEqual({ withData: 1, total: 2, withoutData: ["zzz"] });
  });

  it("skips when no listed language has data, naming the first tag", () => {
    const b = buildOpenCriteriaInventory({ languageTags: ["zzz"], script: "Latin", sourcedByTag: index });
    expect(b.build).toEqual({ kind: "skipped", missingTag: "zzz" });
    expect(b.coverage.withData).toBe(0);
  });

  it("makes untypable expected characters ordinary 18.6 findings; an added language adds new ones", () => {
    const ir = parseKmn(
      "begin Unicode > use(main)\ngroup(main) using keys\n+ [K_A] > 'a'\n+ [K_E] > 'ə'\n",
      "t",
    ).ir;
    const run = (tags: string[]) => {
      const b = buildOpenCriteriaInventory({ languageTags: tags, script: "Latin", sourcedByTag: index });
      if (b.build.kind !== "built") throw new Error("expected built");
      return checkInventoryCoverage(ir, b.build.inventory, "source/t.kmn");
    };
    const keysOf = (tags: string[]) => {
      const findings = run(tags);
      const row = {
        criterion: { id: "18.6" },
        evidence: () => ({ kind: "lint-finding", lines: [], lintRuleId: "KM_LINT_INVENTORY_UNCOVERED", findings }),
      } as unknown as ResolvedRow;
      return findingKeysOf(row);
    };

    expect(run(["ewo"])).toEqual([]);
    const before = keysOf(["ewo", "zzz"]);
    const after = keysOf(["ewo", "bkm"]);
    expect(after).toHaveLength(1);
    // A character a newly added language brings is a key the baseline lacks.
    expect(before).not.toEqual(after);
    expect(after[0]).toContain("U+0254");
  });
});
