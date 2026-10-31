// §18.6 outcome matrix (spec 084 Batch 4) — the authored assembly
// composed end to end: assembleLintContext + buildCriteriaInventory +
// applyInventoryOutcome + lintWithContext + resolveCriteria.
//
// The matrix the ruling requires:
//   authored + inventory + no raw fragments -> a real verdict
//     (Met when covered; Not met naming the uncovered characters)
//   authored + raw fragments                 -> Not yet checkable (reason names the raw fragments)
//   authored + no CLDR/SLDR entry for a target -> Not yet checkable (reason names the tag)
//   authored + no language target            -> Not yet checkable
// (Foreign mode -> Not yet checkable always is pinned separately in
// useCompareCriteria.test.ts: judgeForeignKeyboard never builds an
// inventory.)

import { describe, expect, it } from "vitest";
import {
  ALL_CRITERIA,
  createVirtualFS,
  type VirtualFS,
} from "@keyboard-studio/contracts";
import { KeyboardLintEngine } from "@keymanapp/keyboard-lint";

import type { SourcedInventory } from "../lib/services.ts";
import {
  applyInventoryOutcome,
  assembleLintContext,
} from "./assembleLintContext.ts";
import { buildCriteriaInventory } from "./buildCriteriaInventory.ts";
import { EMPTY_CRITERIA_RECORD, type CriteriaResult } from "./criteriaTypes.ts";
import { resolveCriteria } from "./resolveCriteria.ts";

const KEYBOARD_ID = "inv186_fixture";
const CRITERION_ID = "18.6-inventory-fully-covered";

function kmnProducing(outputs: ReadonlyArray<readonly [string, string]>): string {
  return [
    "store(&VERSION) '10.0'",
    "store(&NAME) 'Inv186 Fixture'",
    "store(&KEYBOARDVERSION) '1.0'",
    "",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "",
    ...outputs.map(([key, ch]) => `+ [${key}] > '${ch}'`),
    "",
  ].join("\n");
}

const KMN_COVERED = kmnProducing([
  ["K_A", "a"],
  ["K_B", "b"],
  ["K_PERIOD", "."],
  ["K_5", "5"],
]);

const KMN_PARTIAL = kmnProducing([["K_A", "a"]]);

// One opaque `if(...)` rule: the codec keeps it as a raw fragment
// (reason "if-option-store"), which is the check's surviving skip.
const KMN_RAW = [
  KMN_COVERED,
  "if(&VERSION > '1.0') + [K_C] > 'c'",
  "",
].join("\n");

function sourcedBaseline(): SourcedInventory {
  const chars = [
    { char: "a", tier: "main" },
    { char: "b", tier: "main" },
    { char: "ə", tier: "main" },
    { char: ".", tier: "punctuation" },
    { char: "5", tier: "numbers" },
  ] as const;
  return {
    resolvedTag: "ewo",
    source: "cldr",
    confidence: "approved",
    characters: chars.map(({ char, tier }) => ({
      char,
      tier,
      source: "cldr" as const,
      confidence: "approved" as const,
    })),
    digraphs: [],
  };
}

function vfsOf(kmn: string): VirtualFS {
  return createVirtualFS([
    { path: `source/${KEYBOARD_ID}.kmn`, content: kmn, isBinary: false },
  ]);
}

async function judgeAuthored(
  vfs: VirtualFS,
  languageTags: readonly string[],
  sourcedByTag: ReadonlyMap<string, SourcedInventory | null>,
): Promise<CriteriaResult> {
  const assembled = assembleLintContext({ vfs, keyboardId: KEYBOARD_ID });
  const build = buildCriteriaInventory({
    languageTags,
    script: "Latin",
    confirmed: { confirmedInventory: [] },
    sourcedByTag,
  });
  const { ctx, contextMissing } = applyInventoryOutcome(
    assembled,
    build.kind === "built"
      ? { kind: "built", inventory: build.inventory }
      : { kind: "skipped", missingTag: build.missingTag },
  );
  const { findings: lintFindings } = await new KeyboardLintEngine().lintWithContext(
    vfs,
    KEYBOARD_ID,
    ctx,
  );
  return resolveCriteria({
    criteria: ALL_CRITERIA,
    mode: "authored",
    lintFindings,
    record: EMPTY_CRITERIA_RECORD,
    facts: { fontBundled: false, deprecated: false, partnerPackage: false },
    contextMissing,
  });
}

function row186(result: CriteriaResult) {
  const row = result.rows.find((r) => r.criterion.id === CRITERION_ID);
  if (!row) throw new Error("§18.6 row missing");
  return row;
}

const WITH_BASELINE = new Map<string, SourcedInventory | null>([
  ["ewo", sourcedBaseline()],
]);

describe("§18.6 outcome matrix (authored assembly)", () => {
  it("Met: inventory built, no raw fragments, everything covered", async () => {
    // Baseline requires a, b, ə, '.', 5 — the fixture produces a, b, '.', 5
    // but NOT ə... so use a baseline without ə for the covered case.
    const covered = sourcedBaseline();
    covered.characters = covered.characters.filter((c) => c.char !== "ə");
    const result = await judgeAuthored(
      vfsOf(KMN_COVERED),
      ["ewo"],
      new Map([["ewo", covered]]),
    );
    const row = row186(result);
    expect(row.status).toBe("met");
  });

  it("Not met: an uncovered inventory character is named in the evidence", async () => {
    const result = await judgeAuthored(vfsOf(KMN_PARTIAL), ["ewo"], WITH_BASELINE);
    const row = row186(result);
    expect(row.status).toBe("not-met");
    const evidence = row.evidence();
    expect(evidence.kind).toBe("lint-finding");
    expect(evidence.lines.join("\n")).toContain("ə");
  });

  it("Not yet checkable: raw fragments in the re-parsed source, reason names them", async () => {
    const result = await judgeAuthored(vfsOf(KMN_RAW), ["ewo"], WITH_BASELINE);
    const row = row186(result);
    expect(row.status).toBe("not-yet-checkable");
    expect(row.evidence().lines.join("\n")).toContain("raw fragment");
  });

  it("Not yet checkable: no CLDR/SLDR entry for a target, reason names the tag", async () => {
    const result = await judgeAuthored(
      vfsOf(KMN_COVERED),
      ["ewo"],
      new Map<string, SourcedInventory | null>([["ewo", null]]),
    );
    const row = row186(result);
    expect(row.status).toBe("not-yet-checkable");
    expect(row.evidence().lines.join("\n")).toContain(
      "no CLDR/SLDR entry for ewo",
    );
  });

  it("Not yet checkable: no language target recorded", async () => {
    const result = await judgeAuthored(vfsOf(KMN_COVERED), [], new Map());
    const row = row186(result);
    expect(row.status).toBe("not-yet-checkable");
    expect(row.evidence().lines.join("\n")).toContain("no language target");
  });
});
