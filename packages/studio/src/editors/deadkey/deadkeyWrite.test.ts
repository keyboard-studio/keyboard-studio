// deadkeyWrite tests — the studio mutate seam for spec 083, especially the
// minimal real KM_WARN_DUPLICATE_DEADKEY_ID repair ("dead0" corruption).

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  listDeadkeys,
  validateDeadkeyLifecycle,
} from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import {
  deleteNamedDeadkey,
  retargetNamedDeadkey,
  withRepairedDuplicateTriggerIds,
} from "./deadkeyWrite.ts";

const BASE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-repair-test'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys
`;

/** The "dead0" corruption: two S-02 mints on unknown keys shared one id. */
const CORRUPT_KMN =
  BASE_KMN + `+ [K_COLON] > dk(dead0)\n+ [K_LBRKT] > dk(dead0)\n`;

function parseIr(kmn: string): KeyboardIR {
  return parseKmn(kmn, "deadkey-repair-test").ir;
}

describe("withRepairedDuplicateTriggerIds", () => {
  it("the fixture really is corrupt: validator flags KM_WARN_DUPLICATE_DEADKEY_ID", () => {
    const ir = parseIr(CORRUPT_KMN);
    const codes = validateDeadkeyLifecycle(ir).map((f) => f.code);
    expect(codes).toContain("KM_WARN_DUPLICATE_DEADKEY_ID");
  });

  it("repair clears the duplicate finding and both deadkeys stay listed", () => {
    const repaired = withRepairedDuplicateTriggerIds(parseIr(CORRUPT_KMN));
    const codes = validateDeadkeyLifecycle(repaired).map((f) => f.code);
    expect(codes).not.toContain("KM_WARN_DUPLICATE_DEADKEY_ID");

    const ids = listDeadkeys(repaired)
      .map((d) => d.id)
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("the first trigger keeps the original id; the extra is re-minted above the legacy ceiling", () => {
    const repaired = withRepairedDuplicateTriggerIds(parseIr(CORRUPT_KMN));
    const byTrigger = new Map(
      listDeadkeys(repaired).map((d) => [d.triggerKey, d.id] as const),
    );
    // First trigger rule keeps dk(dead0) = 0xdead0.
    expect(byTrigger.get("K_COLON")).toBe(0xdead0);
    // The extra mint gets a fresh studio id (never a codepoint-legacy id).
    const reminted = byTrigger.get("K_LBRKT");
    expect(reminted).not.toBe(0xdead0);
    expect(reminted).toBeGreaterThan(0x2fff);
    // A valid numeric id — not blanked, not zero, not the duplicate.
    expect(Number.isInteger(reminted)).toBe(true);
    expect(reminted!).toBeGreaterThan(0);
  });

  it("a clean IR passes through unchanged (no duplicate → no rewrite)", () => {
    const clean = parseIr(BASE_KMN + `+ [K_COLON] > dk(3000)\n`);
    const repaired = withRepairedDuplicateTriggerIds(clean);
    expect(listDeadkeys(repaired).map((d) => d.id)).toEqual([0x3000]);
  });

  it("repair re-mints only true trigger rules — non-trigger dk(id) outputs are untouched", () => {
    // Two triggers share 0x3000; a third rule outputs dk(3000) but is NOT a
    // trigger (two outputs) — the repair must leave it alone. The validator
    // still flags the bystander (it outputs the same id), which is honest:
    // the repair fixes trigger duplication; the bystander needs a human.
    const ir = parseIr(
      BASE_KMN + `+ [K_COLON] > dk(3000)\n+ [K_LBRKT] > dk(3000)\n+ [K_B] > dk(3000) 'x'\n`,
    );
    const repaired = withRepairedDuplicateTriggerIds(ir);

    // Both triggers now have distinct ids.
    const triggerIds = listDeadkeys(repaired)
      .map((d) => d.id)
      .filter((id): id is number => id !== null);
    expect(new Set(triggerIds).size).toBe(triggerIds.length);

    // The non-trigger rule still outputs dk(3000) followed by 'x'.
    const rules = repaired.groups.flatMap((g) => g.rules);
    const bystander = rules.find(
      (r) =>
        r.output.length === 2 &&
        r.output[0]?.kind === "deadkey" &&
        (r.output[0] as { id?: number }).id === 0x3000,
    );
    expect(bystander).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Named deadkeys (#2238, ruling D10): delete/retarget were built on the
// fragment representation in spec 083 and are re-pointed at the typed
// representation — persisted overlays replay these ops at download, so
// they must keep working the day fragments stop being produced.
// ---------------------------------------------------------------------------

const NAMED_KMN = `store(&VERSION) '10.0'
store(&NAME) 'named-test'
store(&TARGETS) 'any'
store(acuteIn) 'ae'
store(acuteOut) 'áé'
begin Unicode > use(main)

group(main) using keys
+ [K_X] > dk(acute)
dk(acute) + any(acuteIn) > index(acuteOut, 2)
dk(acute) + [K_A] > U+00E1
+ [K_B] > 'b'
`;

function mentionsAcute(ir: KeyboardIR): number {
  let n = 0;
  for (const g of ir.groups)
    for (const r of g.rules)
      if (
        r.context.some((c) => c.kind === "namedDeadkey" && c.name === "acute") ||
        r.output.some((c) => c.kind === "namedDeadkey" && c.name === "acute")
      )
        n++;
  return n;
}

describe("deleteNamedDeadkey — typed era (#2238)", () => {
  it("the fixture parses typed: three rules mention dk(acute), no fragments", () => {
    const ir = parseIr(NAMED_KMN);
    expect(mentionsAcute(ir)).toBe(3);
    expect(ir.raw).toHaveLength(0);
  });

  it("removes the trigger, fan-out, and chain rules; stores and unrelated rules survive", () => {
    const result = deleteNamedDeadkey(parseIr(NAMED_KMN), "acute");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(mentionsAcute(result.ir)).toBe(0);
    expect(result.ir.stores.map((s) => s.name)).toContain("acuteIn");
    expect(result.ir.stores.map((s) => s.name)).toContain("acuteOut");
    const remaining = result.ir.groups[0]!.rules;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.context[0]).toMatchObject({ kind: "vkey", name: "K_B" });
    expect(listDeadkeys(result.ir).map((d) => d.name)).not.toContain("acute");
  });

  it("matches the name case-insensitively (identity folds, like the compiler)", () => {
    const result = deleteNamedDeadkey(parseIr(NAMED_KMN), "ACUTE");
    expect(result.ok).toBe(true);
    if (result.ok) expect(mentionsAcute(result.ir)).toBe(0);
  });

  it("also removes legacy named-deadkey fragments for the same name (union)", () => {
    const ir = parseIr(NAMED_KMN);
    const withFrag: KeyboardIR = {
      ...ir,
      raw: [
        {
          nodeId: "raw#legacy",
          origin: "imported",
          sourceText: "dk(acute) + [K_E] > U+00E9",
          reason: "named-deadkey",
        },
      ],
    };
    const result = deleteNamedDeadkey(withFrag, "acute");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.raw).toHaveLength(0);
    expect(mentionsAcute(result.ir)).toBe(0);
  });

  it("refuses when a typed store holds the name as an item (slot alignment is the author's call)", () => {
    const kmn = NAMED_KMN.replace(
      "begin Unicode",
      "store(errmark) dk(acute)\nbegin Unicode",
    );
    const result = deleteNamedDeadkey(parseIr(kmn), "acute");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.referrers.join(" ")).toContain("errmark");
  });

  it("refuses when a fragment held for another reason mentions the name textually", () => {
    const ir = parseIr(NAMED_KMN);
    const withFrag: KeyboardIR = {
      ...ir,
      raw: [
        {
          nodeId: "raw#call",
          origin: "imported",
          sourceText: "call(combine) dk(acute)",
          reason: "call-return",
        },
      ],
    };
    const result = deleteNamedDeadkey(withFrag, "acute");
    expect(result.ok).toBe(false);
  });
});

describe("retargetNamedDeadkey — typed era (#2238)", () => {
  it("rewrites the typed trigger's context element in place (vkey)", () => {
    const result = retargetNamedDeadkey(parseIr(NAMED_KMN), "acute", { vkey: "K_Y" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const listed = listDeadkeys(result.ir).find((d) => d.name === "acute");
    expect(listed?.triggerKey).toBe("K_Y");
    // The rest of the entity is untouched.
    expect(mentionsAcute(result.ir)).toBe(3);
  });

  it("rewrites the typed trigger to a char trigger", () => {
    const result = retargetNamedDeadkey(parseIr(NAMED_KMN), "acute", { char: "`" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const listed = listDeadkeys(result.ir).find((d) => d.name === "acute");
    expect(listed?.triggerKey).toBe("`");
  });

  it("refuses when the name has two typed triggers (ambiguous)", () => {
    const kmn = NAMED_KMN.replace("+ [K_B] > 'b'", "+ [K_B] > 'b'\n+ [K_Y] > dk(acute)");
    const result = retargetNamedDeadkey(parseIr(kmn), "acute", { vkey: "K_Z" });
    expect(result.ok).toBe(false);
  });

  it("still retargets a fragment-carried trigger (persisted pre-#2238 copies)", () => {
    const ir = parseIr(NAMED_KMN);
    const trigger = ir.groups[0]!.rules.find((r) =>
      r.output.some((c) => c.kind === "namedDeadkey"),
    )!;
    const fragEra: KeyboardIR = {
      ...ir,
      groups: ir.groups.map((g) => ({
        ...g,
        rules: g.rules.filter((r) => r.nodeId !== trigger.nodeId),
      })),
      raw: [
        {
          nodeId: "raw#trigger",
          origin: "imported",
          sourceText: "+ [K_X] > dk(acute)",
          reason: "named-deadkey",
        },
      ],
    };
    const result = retargetNamedDeadkey(fragEra, "acute", { vkey: "K_Y" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.raw[0]?.sourceText).toBe("+ [K_Y] > dk(acute)");
  });
});
